import { boundsForRoom, campusFloorOffset, campusRoomsForLessons, mapLinkParams, parseMapLink, roomName } from './model.mjs';

const initial = parseMapLink(location.search);
const ui = document.getElementById('map-ui');
const materialIcon = (name) => `<span class="material-icon" aria-hidden="true" style="--icon:url('/assets/material-icons/${name}.svg')"></span>`;
ui.innerHTML = `<div class="map-toolbar" aria-label="Инструменты карты">
    <label class="map-search"><span class="visually-hidden">Найти кабинет</span>
        <input id="room-search" type="search" list="map-rooms" placeholder="Кабинет или ФОК" autocomplete="off"></label>
    <button id="toggle-tools" type="button" aria-label="Инструменты карты" aria-controls="map-tools" aria-expanded="false">${materialIcon('tune')}</button>
    <div id="map-tools" class="map-tools">
    <button id="open-route" type="button" aria-controls="route-panel" aria-expanded="false">Маршрут</button>
    <button id="share-map" type="button">Ссылка на карту</button>
    <label class="map-theme"><span class="visually-hidden">Тема карты</span><select id="map-theme">
        <option value="auto">Авто</option><option value="light">Светлая</option><option value="dark">Тёмная</option>
    </select></label>
    <div class="map-zoom" aria-label="Масштаб карты"><button id="zoom-in" type="button" aria-label="Приблизить">${materialIcon('add')}</button>
        <button id="zoom-out" type="button" aria-label="Отдалить">${materialIcon('remove')}</button><button id="map-reset" type="button">Вся схема</button></div>
    </div></div>
    <nav class="map-floors" aria-label="Этажи">${[0, 1, 2, 3, 4].map((floor) =>
        `<button type="button" data-floor="${floor}" aria-label="${floor === 0 ? 'Цоколь' : floor + ' этаж'}">${floor === 0 ? 'Ц' : floor}</button>`).join('')}</nav>
    <button id="map-selection" class="map-selection" type="button" aria-controls="route-panel" aria-expanded="false" hidden></button>
    <aside id="route-panel" class="map-route-panel" aria-labelledby="route-title" hidden>
        <div class="map-panel-heading"><h2 id="route-title">Маршрут</h2><button id="close-route" type="button" aria-label="Закрыть маршрут">${materialIcon('close')}</button></div>
        <div id="room-choices" class="map-room-choices" hidden></div>
        <label for="route-from">Откуда</label><input id="route-from" list="map-rooms" placeholder="Кабинет или вход" autocomplete="off">
        <label for="route-to">Куда</label><input id="route-to" list="map-rooms" placeholder="Кабинет или ФОК" autocomplete="off">
        <div class="map-route-actions"><button id="build-route" type="button" class="map-primary">Построить</button>
            <button id="clear-route" type="button">Сбросить</button></div>
        <p id="destination-description" class="map-room-description"></p>
        <button id="share-room" type="button" hidden>Ссылка на кабинет</button>
        <p id="route-status" class="map-route-status" role="status" aria-live="polite"></p>
        <ol id="route-steps" class="map-route-steps"></ol>
    </aside>
    <datalist id="map-rooms"></datalist><div class="map-share-fallback" hidden><label for="map-share-url">Ссылка</label>
        <input id="map-share-url" readonly><button id="close-share" type="button">Закрыть</button></div>
    <p id="map-status" class="map-status" role="status" aria-live="polite">Загрузка схемы…</p>`;
const $ = (id) => document.getElementById(id);
let store;
let findRoute;
let ready = false;
let listed = false;
let panelOpen = false;
let destination = null;
let externalPlace = null;
let choices = [];
let lastSelected = null;
let lastInstructions = null;
let queued = false;
let returnFocus = null;
let todaySchedule = null;
let todayKey = '';
const floorLabel = (floor) => floor === 0 ? 'цоколь' : `${floor} этаж`;
const label = (room) => room ? `${room.name || room.description} — ${room.outdoor ? 'территория' : floorLabel(room.floorIndex)}` : '';
const state = () => store.getState();
const compact = () => window.matchMedia('(max-width:700px)').matches;
function toggleTools(open) {
    document.body.classList.toggle('tools-open', open);
    $('toggle-tools').setAttribute('aria-expanded', String(open));
    if (open && panelOpen && compact()) { closePanel(); }
}
function updateSelection() {
    const summary = $('map-selection');
    summary.hidden = !compact() || panelOpen || (!destination && !externalPlace && !choices.length);
    summary.textContent = choices.length ? 'Выбрать кабинет · ' + choices.length
        : `${destination ? label(destination) : 'ФОК ЧелГУ'} · ${store?.getState().calculatedPath ? 'Шаги маршрута' : 'Подробнее / маршрут'}`;
    summary.setAttribute('aria-expanded', String(panelOpen));
}
function layoutMap() {
    const panel = $('route-panel');
    const bottom = compact() ? innerHeight - ui.querySelector('.map-floors').getBoundingClientRect().top : 0;
    const panelHeight = compact() && panelOpen ? panel.getBoundingClientRect().height + 8 : 0;
    const selectionHeight = compact() && !$('map-selection').hidden ? 52 : 0;
    document.documentElement.style.setProperty('--map-top', `${ui.querySelector('.map-toolbar').getBoundingClientRect().bottom + 8}px`);
    document.documentElement.style.setProperty('--map-bottom', `${bottom + panelHeight + selectionHeight}px`);
}

function refreshTodayRooms() {
    if (!todaySchedule || !store || !state().rooms.length) { return; }
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: todaySchedule.timeZone,
        year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const iso = `${values.year}-${values.month}-${values.day}`;
    let subgroup = 1;
    try { subgroup = localStorage.getItem('study-schedule-subgroup') === '2' ? 2 : 1; } catch {}
    let group = todaySchedule.group || 'default';
    try { group = localStorage.getItem('study-schedule-group') || group; } catch {}
    const key = `${iso}:${subgroup}:${group}`;
    if (key === todayKey) { return; }
    todayKey = key;
    const calendar = window.StudySchedule;
    const lessons = calendar.lessonsFor(todaySchedule, calendar.dateValue(iso), subgroup, group);
    store.setState({ todayRoomIds: campusRoomsForLessons(lessons, state().rooms) });
}
async function loadTodaySchedule() {
    try {
        const response = await fetch('/assets/campus-map/schedule.json', { cache: 'no-cache' });
        if (!response.ok) { throw new Error('Schedule is unavailable'); }
        todaySchedule = await response.json();
        refreshTodayRooms();
        setInterval(refreshTodayRooms, 60000);
    } catch {
        // Keep the map usable when the daily schedule cannot be loaded.
    }
}
function viewport() {
    if (compact()) {
        const top = document.querySelector('.map-toolbar').getBoundingClientRect().bottom + 8;
        const bottom = panelOpen ? $('route-panel').getBoundingClientRect().top - 8
            : !$('map-selection').hidden ? $('map-selection').getBoundingClientRect().top - 8
            : ui.querySelector('.map-floors').getBoundingClientRect().top - 8;
        return { width: innerWidth, height: Math.max(60, bottom - top), top };
    }
    if (!panelOpen) { return { width: innerWidth, height: innerHeight - 80, top: 64 }; }
    return { width: innerWidth - Math.min(360, innerWidth * 0.4), height: innerHeight - 80, top: 64 };
}
function moveViewport(previous) {
    if (!compact() || !window.CampusMapCamera) { return; }
    const next = viewport();
    const camera = window.CampusMapCamera.get();
    window.CampusMapCamera.set({ ...camera, y: camera.y + next.top + next.height / 2 - previous.top - previous.height / 2 });
}
function center(room) {
    const point = boundsForRoom(room);
    if (!point || !window.CampusMapCamera) { return; }
    const offset = campusFloorOffset(room.floorIndex);
    const view = viewport();
    const scale = room.outdoor ? Math.max(0.1, Math.min(0.8, view.width / 550, view.height / 650))
        : Math.min(1.5, Math.max(0.75, view.width / 400));
    window.CampusMapCamera.set({ scale, x: view.width / 2 - (point.x + offset.x) * scale,
        y: view.top + view.height / 2 - (point.y + offset.y) * scale });
}
function fit() {
    if (!window.CampusMapCamera) { return; }
    const view = viewport();
    // A fixed shared frame keeps floor switching independent of the camera.
    const scale = Math.max(0.1, Math.min(view.width / 2700, view.height / 4400, 0.65));
    window.CampusMapCamera.set({ scale, x: view.width / 2 - 650 * scale, y: view.top + view.height / 2 - 760 * scale });
}
function openPanel(focus = false) {
    const previous = viewport();
    if (!panelOpen) { returnFocus = document.activeElement; }
    panelOpen = true;
    $('route-panel').hidden = false;
    document.body.classList.add('route-open');
    $('open-route').setAttribute('aria-expanded', 'true');
    toggleTools(false);
    updateSelection();
    layoutMap();
    moveViewport(previous);
    if (focus) { $('route-from').focus(); }
}
function closePanel() {
    const previous = viewport();
    panelOpen = false;
    $('route-panel').hidden = true;
    document.body.classList.remove('route-open');
    $('open-route').setAttribute('aria-expanded', 'false');
    updateSelection();
    layoutMap();
    moveViewport(previous);
    if (returnFocus?.isConnected) { returnFocus.focus(); }
}
function clearPath(extra = {}) {
    $('route-status').textContent = '';
    store.setState({ calculatedPath: null, buildRouteTrigger: null, routeInstructions: [], ...extra });
}
function choose(room, move = true) {
    externalPlace = null;
    choices = [];
    destination = room;
    if (compact()) { toggleTools(false); }
    lastSelected = room.id;
    if (compact() && !panelOpen) { updateSelection(); layoutMap(); } else { openPanel(); }
    clearPath({ toRoom: room, selectedRoom: room, currentMapFloor: room.floorIndex });
    if (move) { center(room); }
    refresh();
}
function resolve(value) {
    const candidates = state().rooms.filter((room) => label(room) === value || room.id === value
        || roomName(room.name) === roomName(value)
        || room.aliases?.some((alias) => roomName(alias) === roomName(value)));
    return candidates.length === 1 ? candidates[0] : null;
}
function currentParams(withCamera = true) {
    return mapLinkParams({ floor: state().currentMapFloor,
        camera: withCamera ? window.CampusMapCamera?.get() : null,
        room: destination?.id, from: state().fromRoom?.id, rooms: choices.map((room) => room.id), place: externalPlace });
}
function publishPosition() {
    if (!ready) { return; }
    const query = currentParams();
    const next = location.pathname + (query ? '?' + query : '');
    if (location.pathname + location.search !== next) { history.replaceState(null, '', next); }
    if (window.parent !== window) { window.parent.postMessage({ type: 'campus-map-position', query }, location.origin); }
}
async function copyLink(query, message) {
    const url = new URL('/map/' + (query ? '?' + query : ''), location.origin).href;
    try {
        await navigator.clipboard.writeText(url);
        $('map-status').textContent = message;
    } catch {
        const box = ui.querySelector('.map-share-fallback');
        box.hidden = false;
        $('map-share-url').value = url;
        $('map-share-url').focus();
        $('map-share-url').select();
        $('map-status').textContent = 'Скопируйте выделенную ссылку.';
    }
}
function build() {
    const { fromRoom, toRoom, graphData } = state();
    if (externalPlace) { $('route-status').textContent = 'Схема ФОКа не загружена.'; return; }
    if (!fromRoom || !toRoom) { $('route-status').textContent = 'Выберите оба кабинета из списка.'; return; }
    if (fromRoom.id === toRoom.id) { $('route-status').textContent = 'Вы уже в нужном кабинете.'; return; }
    const node = (room) => [`icon-${room.id}`, `icon-${room.id}_door`].find((id) => graphData.nodeCoords?.has(id));
    const start = node(fromRoom);
    const end = node(toRoom);
    if (!start || !end || !graphData.graph || !findRoute(graphData.graph, graphData.nodeCoords, start, end)) {
        $('route-status').textContent = 'В этой схеме нет связного маршрута между выбранными точками.';
        return;
    }
    $('route-status').textContent = 'Строим маршрут…';
    state().triggerRouteBuild();
    state().setCurrentMapFloor(fromRoom.floorIndex);
    if (compact()) { closePanel(); }
    center(fromRoom);
}
function refresh() {
    if (!store || !window.CampusMapCamera) { return; }
    const current = state();
    if (!current.rooms.length || !current.graphData.graph) { return; }
    refreshTodayRooms();
    if (!listed) {
        listed = true;
        const options = current.rooms.filter((room) => room.name || room.description)
            .sort((a, b) => label(a).localeCompare(label(b), 'ru', { numeric: true }));
        for (const room of options) {
            const option = document.createElement('option');
            option.value = label(room);
            $('map-rooms').append(option);
        }
    }
    if (!ready) {
        ready = true;
        $('map-status').textContent = 'Зелёным — кабинеты занятий сегодня. Перетаскивайте схему; масштаб — колесом мыши или двумя пальцами.';
        if (initial.floor !== undefined) { current.setCurrentMapFloor(initial.floor); }
        const room = current.rooms.find((item) => item.id === (initial.room || (initial.place === 'fok' ? 'fok' : null)));
        const from = current.rooms.find((item) => item.id === initial.from);
        if (from) { current.setFromRoom(from); }
        if (room) { choose(room); }
        else if (initial.rooms) {
            choices = initial.rooms.map((id) => current.rooms.find((item) => item.id === id)).filter(Boolean);
            openPanel();
            fit();
        } else if (initial.place === 'fok') {
            externalPlace = 'fok';
            openPanel();
            current.setCurrentMapFloor(1);
            fit();
        } else {
            fit();
            if (initial.room) { $('map-status').textContent = 'Кабинет из ссылки не найден в этой схеме.'; }
        }
        if (from && room) { build(); }
        if (initial.camera) {
            if (initial.floor !== undefined) { state().setCurrentMapFloor(initial.floor); }
            window.CampusMapCamera.set(initial.camera);
        }
    }
    const latest = state();
    if (latest.selectedRoom && latest.selectedRoom.id !== lastSelected) { choose(latest.selectedRoom, false); return; }
    for (const button of ui.querySelectorAll('[data-floor]')) {
        button.setAttribute('aria-current', Number(button.dataset.floor) === latest.currentMapFloor ? 'true' : 'false');
    }
    if (document.activeElement !== $('route-from')) { $('route-from').value = label(latest.fromRoom); }
    if (document.activeElement !== $('route-to')) { $('route-to').value = externalPlace ? 'ФОК ЧелГУ' : label(destination); }
    $('route-to').disabled = Boolean(externalPlace);
    $('build-route').disabled = !latest.fromRoom || !destination || Boolean(externalPlace);
    $('share-room').hidden = !destination;
    $('share-room').textContent = destination?.outdoor ? 'Ссылка на место' : 'Ссылка на кабинет';
    $('destination-description').textContent = externalPlace
        ? 'Схема ФОКа не загружена.'
        : destination?.outdoor ? destination.description
        : destination ? `${destination.name || ''} · ${floorLabel(destination.floorIndex)}${destination.description && destination.description !== destination.name ? ' · ' + destination.description : ''}` : '';
    const choiceRoot = $('room-choices');
    choiceRoot.hidden = !choices.length;
    if (choices.length && !choiceRoot.childElementCount) {
        const prompt = document.createElement('p');
        prompt.textContent = 'В расписании указаны два кабинета. Выберите нужный:';
        choiceRoot.append(prompt);
        for (const room of choices) {
            const button = document.createElement('button');
            button.type = 'button'; button.textContent = label(room);
            button.addEventListener('click', () => { choiceRoot.replaceChildren(); choose(room); });
            choiceRoot.append(button);
        }
    }
    if (!choices.length) { choiceRoot.replaceChildren(); }
    if (latest.routeInstructions !== lastInstructions) {
        lastInstructions = latest.routeInstructions;
        $('route-steps').replaceChildren();
        for (const step of latest.routeInstructions) {
            const li = document.createElement('li');
            const button = document.createElement('button');
            button.type = 'button'; button.textContent = step.text;
            button.addEventListener('click', () => {
                const point = state().graphData.nodeCoords.get(step.nodeId);
                if (point) { state().setCurrentMapFloor(point.floorIndex); center(point); }
            });
            li.append(button); $('route-steps').append(li);
        }
        if (latest.calculatedPath) { $('route-status').textContent = 'Маршрут показан синими стрелками. Нажмите на шаг, чтобы перейти к нему.'; }
    }
    updateSelection();
    layoutMap();
    publishPosition();
}
function scheduleRefresh() {
    if (!queued) { queued = true; queueMicrotask(() => { queued = false; refresh(); }); }
}
window.addEventListener('campus-camera-ready', scheduleRefresh);
window.addEventListener('resize', () => { updateSelection(); layoutMap(); scheduleRefresh(); });
new ResizeObserver(layoutMap).observe($('route-panel'));
new ResizeObserver(layoutMap).observe(ui.querySelector('.map-toolbar'));
window.addEventListener('focus', refreshTodayRooms);
window.addEventListener('pageshow', refreshTodayRooms);
window.addEventListener('storage', (event) => {
    if (event.key === 'study-schedule-subgroup' || event.key === null) { refreshTodayRooms(); }
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) { refreshTodayRooms(); } });
$('toggle-tools').addEventListener('click', () => toggleTools(!document.body.classList.contains('tools-open')));
$('map-selection').addEventListener('click', () => openPanel());
$('open-route').addEventListener('click', () => openPanel(true));
$('close-route').addEventListener('click', closePanel);
$('map-reset').addEventListener('click', () => { toggleTools(false); fit(); });
for (const button of ui.querySelectorAll('[data-floor]')) {
    button.addEventListener('click', () => { if (ready) { state().setCurrentMapFloor(Number(button.dataset.floor)); } });
}
for (const [id, ratio] of [['zoom-in', 1.25], ['zoom-out', 0.8]]) {
    $(id).addEventListener('click', () => {
        const camera = window.CampusMapCamera;
        if (!camera) { return; }
        const view = camera.get();
        const frame = viewport();
        const x = frame.width / 2;
        const y = frame.top + frame.height / 2;
        const scale = Math.max(0.1, Math.min(3, view.scale * ratio));
        camera.set({ scale, x: x - (x - view.x) * scale / view.scale, y: y - (y - view.y) * scale / view.scale });
    });
}
$('room-search').addEventListener('change', () => {
    if (!ready) { return; }
    const room = resolve($('room-search').value);
    if (room) { choose(room); $('room-search').value = ''; }
    else { $('map-status').textContent = 'Выберите кабинет из подсказок.'; }
});
for (const [id, field] of [['route-from', 'fromRoom'], ['route-to', 'toRoom']]) {
    $(id).addEventListener('input', () => {
        if (!ready) { return; }
        clearPath({ [field]: null });
        if (field === 'toRoom') { destination = null; }
        $('route-status').textContent = '';
    });
    $(id).addEventListener('change', () => {
        if (!ready) { return; }
        const room = resolve($(id).value);
        if (room && field === 'toRoom') { choose(room); }
        else if (room) { clearPath({ fromRoom: room }); }
        else { $('route-status').textContent = 'Выберите кабинет из подсказок.'; }
    });
}
$('build-route').addEventListener('click', build);
$('clear-route').addEventListener('click', () => {
    if (!ready) { return; }
    destination = null; externalPlace = null; choices = []; lastSelected = null;
    clearPath({ fromRoom: null, toRoom: null, selectedRoom: null });
    $('route-from').value = ''; $('route-to').value = ''; $('route-status').textContent = '';
});
$('share-map').addEventListener('click', () => { if (ready) { copyLink(currentParams(), 'Ссылка на карту скопирована.'); } });
$('share-room').addEventListener('click', () => {
    if (destination) { copyLink(mapLinkParams({ room: destination.id }), destination.outdoor ? 'Ссылка на место скопирована.' : 'Ссылка на кабинет скопирована.'); }
});
$('close-share').addEventListener('click', () => { ui.querySelector('.map-share-fallback').hidden = true; });
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        if (panelOpen) { closePanel(); }
        toggleTools(false);
    }
});
$('map-theme').value = window.StudyPreferences.get().theme;
$('map-theme').addEventListener('change', () => window.StudyPreferences.set('theme', $('map-theme').value));
new MutationObserver(() => { $('map-theme').value = window.StudyPreferences.get().theme; })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
try {
    const engine = await import('./map.js');
    store = engine.campusMapStore;
    findRoute = engine.findCampusRoute;
    store.subscribe(scheduleRefresh);
    scheduleRefresh();
    loadTodaySchedule();
} catch {
    $('map-status').textContent = 'Не удалось загрузить карту. Обновите страницу.';
}
