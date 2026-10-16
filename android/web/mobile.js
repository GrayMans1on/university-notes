(() => {
    'use strict';
    if (window.top !== window || !window.StudyNative) {
        return;
    }
    const native = window.StudyNative;
    if (location.pathname === '/') {
        const legacy = { '#schedule': '/schedule/', '#bookmarks': '/bookmarks/', '#settings': '/settings/' };
        location.replace(legacy[location.hash] || '/disciplines/');
        return;
    }
    const updateSystemTheme = () => {
        if (typeof native.theme === 'function') {
            native.theme(document.documentElement.dataset.theme === 'dark');
        }
    };
    new MutationObserver(() => {
        updateSystemTheme();
        renderNext();
    }).observe(document.documentElement, {
        attributes: true, attributeFilter: ['data-theme'],
    });
    updateSystemTheme();
    const read = (key, fallback) => {
        try {
            return JSON.parse(native.get(key) || localStorage.getItem(key) || 'null') || fallback;
        } catch {
            return fallback;
        }
    };
    const write = (key, value) => {
        const serialized = JSON.stringify(value);
        native.put(key, serialized);
        try {
            localStorage.setItem(key, serialized);
        } catch {
            // Native preferences remain available when web storage is unavailable.
        }
    };
    let bookmarks = read('mobile-bookmarks', []);
    if (!Array.isArray(bookmarks)) {
        bookmarks = [];
    }
    const node = (tag, className, text) => {
        const result = document.createElement(tag);
        result.className = className;
        if (text !== undefined) {
            result.textContent = text;
        }
        return result;
    };
    const icon = (name) => {
        const result = node('span', 'app-icon');
        result.style.setProperty('--app-icon', `url('/assets/material-icons/${name}.svg')`);
        result.setAttribute('aria-hidden', 'true');
        return result;
    };
    window.print = () => native.printPage();
    const nav = node('nav', 'app-nav');
    nav.setAttribute('aria-label', 'Главное меню');
    const navigation = [
        ['Дисциплины', '/disciplines/', 'grid_on'], ['Расписание', '/schedule/', 'calendar_month'],
        ['Карта', '/map/', 'map'], ['Учебники', '/textbooks/', 'menu_book'],
        ['Закладки', '/bookmarks/', 'bookmark'], ['Настройки', '/settings/', 'tune'],
    ];
    for (const [label, url, name] of navigation) {
        const link = node('a', '');
        link.href = url;
        link.append(icon(name), node('span', '', label));
        nav.append(link);
    }
    document.body.append(nav);
    const sizeNavigation = () => document.documentElement.style.setProperty('--app-nav-height', `${nav.getBoundingClientRect().height}px`);
    if (typeof ResizeObserver === 'function') {
        new ResizeObserver(sizeNavigation).observe(nav);
    } else {
        window.addEventListener('resize', sizeNavigation);
    }
    sizeNavigation();
    const overlay = node('section', 'app-panel');
    overlay.hidden = true;
    document.querySelector('.workspace').append(overlay);
    function refreshButtons() {
        for (const button of document.querySelectorAll('.app-bookmark')) {
            const saved = bookmarks.some((bookmark) => bookmark.id === button.dataset.bookmarkId);
            button.textContent = saved ? 'Убрать закладку' : 'Создать закладку';
            button.setAttribute('aria-pressed', String(saved));
        }
    }
    for (const section of document.querySelectorAll('section.topic')) {
        const heading = section.querySelector('h3[id], h2[id]');
        if (!heading) {
            continue;
        }
        const title = heading.cloneNode(true);
        title.querySelectorAll('.heading-link').forEach((item) => item.remove());
        const record = { id: location.pathname + ':' + section.dataset.topicKey, title: title.textContent.trim(),
            subject: document.querySelector('h1')?.textContent.replace(/§/g, '').trim() || 'Конспект',
            path: location.pathname, anchor: heading.id };
        section.dataset.mobileRecord = JSON.stringify(record);
        const button = node('button', 'app-bookmark');
        button.type = 'button';
        button.dataset.bookmarkId = record.id;
        button.addEventListener('click', () => {
            const existing = bookmarks.findIndex((bookmark) => bookmark.id === record.id);
            if (existing >= 0) {
                bookmarks.splice(existing, 1);
            } else {
                bookmarks.push(record);
            }
            write('mobile-bookmarks', bookmarks);
            refreshButtons();
        });
        heading.after(button);
    }
    refreshButtons();
    function showBookmarks() {
        overlay.replaceChildren(node('h1', '', 'Закладки'));
        if (!bookmarks.length) {
            overlay.append(node('p', 'app-note', 'Закладок пока нет. Откройте тему и нажмите «Создать закладку».'));
            return;
        }
        const controls = node('div', 'app-bookmark-tools');
        const removeSelected = node('button', '', 'Убрать выбранные');
        const clear = node('button', '', 'Очистить все');
        removeSelected.type = clear.type = 'button';
        controls.append(removeSelected, clear);
        overlay.append(controls);
        const list = node('ul', 'app-bookmarks-list');
        for (const bookmark of bookmarks) {
            const row = node('li', '');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = bookmark.id;
            checkbox.setAttribute('aria-label', 'Выбрать: ' + bookmark.title);
            const link = node('a', '');
            link.href = bookmark.path + '#' + encodeURIComponent(bookmark.anchor);
            link.append(node('strong', '', bookmark.title), node('small', '', bookmark.subject));
            const remove = node('button', '', 'Убрать');
            remove.type = 'button';
            remove.setAttribute('aria-label', 'Убрать закладку: ' + bookmark.title);
            remove.addEventListener('click', () => {
                bookmarks = bookmarks.filter((item) => item.id !== bookmark.id);
                write('mobile-bookmarks', bookmarks);
                showBookmarks();
            });
            row.append(checkbox, link, remove);
            list.append(row);
        }
        removeSelected.addEventListener('click', () => {
            const selected = new Set([...list.querySelectorAll('input:checked')].map((input) => input.value));
            bookmarks = bookmarks.filter((item) => !selected.has(item.id));
            write('mobile-bookmarks', bookmarks);
            showBookmarks();
        });
        clear.addEventListener('click', () => {
            if (confirm('Удалить все закладки?')) {
                bookmarks = [];
                write('mobile-bookmarks', bookmarks);
                showBookmarks();
            }
        });
        overlay.append(list);
    }
    let latestStatus = { status: 'Материалы доступны офлайн', available: false, checked: 0 };
    function showSettings() {
        overlay.replaceChildren(node('h1', '', 'Настройки'));
        const prefs = window.StudyPreferences.get();
        const fields = [
            ['Тема', 'theme', [['auto', 'Как в системе'], ['light', 'Светлая'], ['dark', 'Тёмная']]],
            ['Размер текста', 'scale', [['1', 'Обычный'], ['1.12', 'Крупный'], ['1.25', 'Очень крупный']]],
            ['Ширина текста', 'width', [['normal', 'Обычная'], ['narrow', 'Узкая'], ['wide', 'Широкая']]],
        ];
        for (const [title, field, options] of fields) {
            const label = node('label', '', title);
            const select = document.createElement('select');
            for (const [value, text] of options) {
                select.append(new Option(text, value));
            }
            select.value = prefs[field];
            select.addEventListener('change', () => window.StudyPreferences.set(field, select.value));
            label.append(select);
            overlay.append(label);
        }
        const label = node('label', '', 'Подгруппа английского');
        const group = document.createElement('select');
        group.append(new Option('1-я подгруппа', '1'), new Option('2-я подгруппа', '2'));
        group.value = String(native.subgroup());
        group.addEventListener('change', () => {
            native.subgroup(Number(group.value));
            localStorage.setItem('study-schedule-subgroup', group.value);
            const existing = document.querySelector('#schedule-group');
            if (existing) {
                existing.value = group.value;
                existing.dispatchEvent(new Event('change'));
            }
            renderNext();
        });
        label.append(group);
        overlay.append(label, node('h2', '', 'Офлайн и обновления'));
        const networkLabel = node('label', '', 'Использовать сеть');
        const network = document.createElement('select');
        network.id = 'network-mode';
        for (const [value, title] of [['wifi', 'Wi-Fi'], ['any', 'Wi-Fi или мобильный интернет'], ['mobile', 'Мобильный интернет']]) {
            network.append(new Option(title, value));
        }
        network.value = typeof native.networkMode === 'function' ? native.networkMode() : 'wifi';
        network.disabled = typeof native.setNetworkMode !== 'function';
        network.addEventListener('change', () => native.setNetworkMode(network.value));
        networkLabel.append(network);
        overlay.append(networkLabel);
        const status = node('p', 'app-status', latestStatus.status);
        status.id = 'app-sync-status';
        const check = node('button', '', 'Проверить обновления');
        check.type = 'button';
        check.addEventListener('click', () => native.sync());
        overlay.append(status, check, node('p', 'app-note',
            'Выбранная сеть используется для материалов, APK, учебников и управления расписанием. '
            + 'Скачанные материалы и учебники открываются офлайн. В фоне время проверки определяет Android.'));
        const checked = node('p', 'app-note');
        checked.id = 'app-last-sync';
        checked.textContent = latestStatus.checked ? 'Проверено: ' + new Date(latestStatus.checked).toLocaleString('ru-RU') : 'Пока без проверок';
        const appStatus = node('p', 'app-note', latestStatus.appStatus || 'Проверка версии приложения');
        appStatus.id = 'app-version-status';
        const install = node('button', '', 'Установить обновление приложения');
        install.id = 'app-install-update';
        install.type = 'button';
        install.hidden = !latestStatus.appReady || typeof native.installAppUpdate !== 'function';
        install.addEventListener('click', () => native.installAppUpdate());
        overlay.append(appStatus, install);
        const admin = node('button', '', 'Ввести код администратора');
        admin.type = 'button';
        admin.addEventListener('click', () => window.StudyAdmin.open());
        overlay.append(node('h2', '', 'Администратор'), admin, node('p', 'app-note',
            'Код открывает постоянные и разовые изменения расписания. Сохранение и история — в GitHub.'));
        overlay.append(checked, node('p', 'app-note', 'Учёба · версия ' + (typeof native.version === 'function' ? native.version() : '1.0.0')
            + ' · расписание по времени Челябинска'));
    }
    function route() {
        const panel = ['/bookmarks/', '/settings/'].includes(location.pathname);
        document.body.classList.toggle('app-overlay', panel);
        overlay.hidden = !panel;
        if (panel) {
            if (location.pathname === '/bookmarks/') { showBookmarks(); } else { showSettings(); }
            window.scrollTo(0, 0);
        }
        for (const link of nav.children) {
            const active = location.pathname.startsWith(new URL(link.href).pathname)
                || link.pathname === '/disciplines/' && location.pathname.startsWith('/notes/');
            if (active) { link.setAttribute('aria-current', 'page'); } else { link.removeAttribute('aria-current'); }
        }
    }
    window.addEventListener('hashchange', route);
    route();
    const banner = node('div', 'app-update-banner');
    banner.hidden = true;
    banner.append(node('span', '', 'Новые материалы загружены'));
    const apply = node('button', '', 'Применить');
    apply.type = 'button';
    apply.addEventListener('click', () => native.applyUpdate());
    banner.append(apply);
    document.body.append(banner);
    window.addEventListener('native-status', (event) => {
        latestStatus = event.detail;
        banner.hidden = !latestStatus.available;
        const status = document.getElementById('app-sync-status');
        if (status) {
            status.textContent = latestStatus.status;
        }
        const appStatus = document.getElementById('app-version-status');
        if (appStatus) {
            appStatus.textContent = latestStatus.appStatus || '';
        }
        const install = document.getElementById('app-install-update');
        if (install) {
            install.hidden = !latestStatus.appReady || typeof native.installAppUpdate !== 'function';
        }
        const checked = document.getElementById('app-last-sync');
        if (checked && latestStatus.checked) {
            checked.textContent = 'Проверено: ' + new Date(latestStatus.checked).toLocaleString('ru-RU');
        }
    });
    let saveTimer;
    const track = () => {
        if (!location.pathname.startsWith('/notes/')) {
            return;
        }
        const sections = [...document.querySelectorAll('section.topic[data-mobile-record]')];
        const current = sections.find((section) => {
            const box = section.getBoundingClientRect();
            return box.top < innerHeight * .55 && box.bottom > 120;
        });
        if (current) {
            write('mobile-last', JSON.parse(current.dataset.mobileRecord));
        }
    };
    window.addEventListener('scroll', () => {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(track, 350);
    }, { passive: true });
    window.addEventListener('pagehide', track);
    setTimeout(track, 800);
    let appData;
    let nextCard;
    function currentTime() {
        const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Yekaterinburg', year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
        }).formatToParts(new Date()).map((part) => [part.type, part.value]));
        return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
    }
    function renderNext() {
        if (!nextCard || !appData) {
            return;
        }
        const now = currentTime();
        const schedule = appData.schedule;
        let next;
        let day;
        for (let offset = 0; offset < 15 && !next; offset += 1) {
            day = window.StudySchedule.shift(window.StudySchedule.dateValue(now.date), offset);
            next = window.StudySchedule.lessonsFor(schedule, day, native.subgroup(), typeof native.academicGroup === 'function' ? native.academicGroup() : schedule.group).find((lesson) => {
                const bells = window.StudySchedule.lessonTime(schedule, lesson);
                return !lesson.onlineCourse && bells && (offset > 0 || bells[1] > now.time);
            });
        }
        nextCard.replaceChildren();
        const body = node('div', 'app-card-body');
        body.append(node('span', 'app-card-label', 'Ближайшая пара'));
        nextCard.append(body);
        if (!next) {
            nextCard.href = '/schedule/';
            body.append(node('strong', '', 'Пар в расписании нет'));
            return;
        }
        nextCard.href = next.mapUrl || '/schedule/';
        const today = window.StudySchedule.isoDate(day) === now.date;
        const bells = window.StudySchedule.lessonTime(schedule, next);
        const ongoing = today && bells[0] <= now.time;
        body.firstChild.textContent = ongoing ? 'Ближайшая пара · сейчас идёт' : 'Ближайшая пара';
        const date = today ? 'Сегодня' : new Intl.DateTimeFormat('ru-RU', {
            day: 'numeric', month: 'short', timeZone: 'UTC',
        }).format(day);
        const room = /онлайн/i.test(next.note || '') ? 'Онлайн' : next.place || (next.room ? 'Ауд. ' + next.room : 'Кабинет не указан');
        body.append(node('strong', '', next.title), node('small', '', `${room} · ${date} · ${ongoing ? "до " + bells[1] : bells[0] + "–" + bells[1]}`));
        if (next.thumbnail && !/онлайн/i.test(next.note || '')) {
            const image = document.createElement('img');
            const dark = document.documentElement.dataset.theme === 'dark';
            image.src = '/' + (dark ? next.thumbnail.replace(/\.png$/, '-dark.png') : next.thumbnail);
            image.alt = 'Кабинет ' + (next.room || next.place) + ' и соседние помещения';
            nextCard.append(image);
        }
    }
    if (location.pathname === '/disciplines/') {
        const actions = node('section', 'app-actions');
        actions.setAttribute('aria-label', 'Быстрый доступ');
        nextCard = node('a', 'app-card');
        const resume = node('a', 'app-card');
        const resumeBody = node('div', 'app-card-body');
        resumeBody.append(node('span', 'app-card-label', 'Продолжить чтение'));
        const last = read('mobile-last', null);
        resume.href = last ? last.path + '#' + encodeURIComponent(last.anchor) : '/disciplines/';
        resumeBody.append(node('strong', '', last ? last.title : 'Выберите первую тему'));
        if (last) {
            resumeBody.append(node('small', '', last.subject));
        }
        resume.append(resumeBody);
        actions.append(nextCard, resume);
        document.getElementById('main').prepend(actions);
        fetch('/assets/app-data.json').then((response) => response.json()).then((data) => {
            appData = data;
            renderNext();
            setInterval(renderNext, 30000);
        }).catch(() => {
            nextCard.href = '/schedule/';
            nextCard.textContent = 'Ближайшая пара · открыть расписание';
        });
    }
    if (location.pathname === '/textbooks/') {
        const library = document.getElementById('textbook-library');
        let books = [];
        const renderBooks = () => {
            library.replaceChildren(node('h1', '', 'Учебники'));
            if (!books.length) {
                library.append(node('p', 'app-note', 'Учебники ещё не добавлены. Здесь появятся PDF по дисциплинам.'));
                return;
            }
            const states = typeof native.textbookStatus === 'function' ? JSON.parse(native.textbookStatus()) : {};
            for (const book of books) {
                const status = states[book.id] || {};
                const item = node('article', 'app-textbook');
                item.append(node('h2', '', book.title), node('p', '', [book.subject, (book.size / 1048576).toFixed(1) + ' МБ'].filter(Boolean).join(' · ')));
                const message = node('p', 'app-note', status.message || (status.saved ? 'Скачан · доступен офлайн' : 'PDF ещё не скачан'));
                message.setAttribute('role', 'status');
                const action = node('button', '', status.saved ? 'Открыть' : status.busy ? 'Загрузка…' : 'Скачать');
                action.type = 'button';
                action.disabled = Boolean(status.busy) || typeof native.downloadTextbook !== 'function';
                action.addEventListener('click', () => {
                    if (status.saved) { native.openTextbook(book.id); } else {
                        action.disabled = true;
                        message.textContent = 'Загрузка…';
                        native.downloadTextbook(book.id);
                    }
                });
                item.append(message, action);
                library.append(item);
            }
        };
        window.addEventListener('study-textbooks', renderBooks);
        fetch('/assets/textbooks.json').then((response) => response.json()).then((data) => {
            books = data.books;
            renderBooks();
        }).catch(() => library.append(node('p', 'app-note', 'Каталог недоступен. Проверьте обновление материалов.')));
    }
    const academicGroup = document.getElementById('schedule-academic-group');
    if (academicGroup && typeof native.academicGroup === 'function') {
        const saved = native.academicGroup();
        if ([...academicGroup.options].some((option) => option.value === saved)) {
            academicGroup.value = saved;
            academicGroup.dispatchEvent(new Event('change'));
        }
        academicGroup.addEventListener('change', () => {
            native.setAcademicGroup(academicGroup.value);
            renderNext();
        });
    }
    const group = document.getElementById('schedule-group');
    if (group) {
        group.value = String(native.subgroup());
        group.dispatchEvent(new Event('change'));
        group.addEventListener('change', () => {
            native.subgroup(Number(group.value));
            renderNext();
        });
    }
})();
