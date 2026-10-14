(function () {
    'use strict';
    const CODE = 'CSU2410';
    const REPO = 'GrayMans1on/university-notes';
    const API = 'https://api.github.com/repos/' + REPO + '/contents/';
    const PATHS = { permanent: 'content/schedule-overrides.json', once: 'content/schedule-exceptions.json' };
    const DAYS = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
    const ACTIONS = { replace: 'Изменение', move: 'Перенос', cancel: 'Отмена', add: 'Дополнительная пара', revoke: 'Откат' };
    const native = window.StudyNative;
    let token = '';
    let nextRequest = 1;
    const pending = new Map();
    let schedule;
    let histories = { permanent: { schema: 1, events: [] }, once: { schema: 1, events: [] } };
    const shas = {};
    let busy = false;
    let mode = 'permanent';
    let selected;
    let box;
    let status;
    let form;
    let previousFocus;
    function read(key, fallback) {
        try {
            return JSON.parse(native?.get(key) || localStorage.getItem(key) || 'null') ?? fallback;
        } catch {
            return fallback;
        }
    }
    function write(key, value) {
        const text = JSON.stringify(value);
        if (native) {
            native.put(key, text);
        }
        try {
            localStorage.setItem(key, text);
        } catch {
            // Keep the current dialog usable without browser storage.
        }
    }
    let unlocked = read('study-admin-unlocked', false) === true;
    let draft = read('study-admin-draft', null);
    const el = (tag, text, className = '') => {
        const node = document.createElement(tag);
        node.className = className;
        if (text !== undefined) {
            node.textContent = text;
        }
        return node;
    };
    const button = (text, action) => {
        const node = el('button', text);
        node.type = 'button';
        node.addEventListener('click', action);
        return node;
    };
    function say(text) {
        if (status) {
            status.textContent = text;
        }
    }
    function today() {
        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Yekaterinburg', year: 'numeric', month: '2-digit', day: '2-digit',
        }).formatToParts(new Date());
        const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
        return `${values.year}-${values.month}-${values.day}`;
    }
    function encode(text) {
        return btoa(Array.from(new TextEncoder().encode(text), (byte) => String.fromCharCode(byte)).join(''));
    }
    function decode(text) {
        return new TextDecoder().decode(Uint8Array.from(atob(text.replace(/\s/g, '')), (char) => char.charCodeAt(0)));
    }
    window.addEventListener('study-github', (event) => {
        const handler = pending.get(event.detail.id);
        if (handler) {
            pending.delete(event.detail.id);
            handler(event.detail);
        }
    });
    async function request(method, path, payload, accessToken = token) {
        if (!['content/schedule.json', ...Object.values(PATHS)].includes(path)
            || !['GET', 'PUT'].includes(method) || method === 'PUT' && path === 'content/schedule.json') {
            throw new Error('Недопустимый путь записи');
        }
        let response;
        if (native) {
            if (typeof native.githubRequest !== 'function') {
                throw new Error('Для записи из приложения требуется версия 1.0.3. На сайте запись доступна уже сейчас.');
            }
            response = await new Promise((resolve, reject) => {
                const id = nextRequest++;
                const timeout = setTimeout(() => {
                    pending.delete(id);
                    reject(new Error('GitHub не ответил. Черновик сохранён.'));
                }, 45000);
                pending.set(id, (result) => {
                    clearTimeout(timeout);
                    resolve(result);
                });
                native.githubRequest(id, method, path, accessToken, payload ? JSON.stringify(payload) : '');
            });
        } else {
            const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
            if (accessToken) {
                headers.Authorization = 'Bearer ' + accessToken;
            }
            if (payload) {
                headers['Content-Type'] = 'application/json';
            }
            const fetched = await fetch(API + path + (method === 'GET' ? '?ref=main' : ''), {
                method, headers, body: payload ? JSON.stringify(payload) : undefined, cache: 'no-store',
            });
            response = { status: fetched.status, body: await fetched.text() };
        }
        if (response.status === 409 || response.status === 422) {
            throw new Error('Расписание изменилось в GitHub. Загрузите свежую версию и проверьте черновик перед повторной записью.');
        }
        if (response.status === 401 || response.status === 403 || response.status === 404) {
            throw new Error('GitHub не разрешил запрос. Проверьте токен и право Contents: Read and write для этого репозитория.');
        }
        if (response.status < 200 || response.status >= 300) {
            throw new Error('GitHub недоступен. Изменение осталось в черновике.');
        }
        return JSON.parse(response.body);
    }
    async function getFile(path, accessToken = token) {
        const result = await request('GET', path, null, accessToken);
        if (result.encoding !== 'base64' || !result.sha) {
            throw new Error('GitHub вернул неподдерживаемый файл');
        }
        return { sha: result.sha, data: JSON.parse(decode(result.content)) };
    }
    function bindHistories() {
        schedule.permanentChanges = histories.permanent.events;
        schedule.exceptions = histories.once.events;
    }
    async function loadRemote() {
        if (busy) {
            return;
        }
        busy = true;
        say('Загрузка расписания и истории из GitHub…');
        try {
            const results = await Promise.all([
                getFile('content/schedule.json'), getFile(PATHS.permanent), getFile(PATHS.once),
            ]);
            const fresh = results[0].data;
            window.StudyScheduleOverrides.validate(results[1].data, fresh);
            if (results[2].data.schema !== 1 || !Array.isArray(results[2].data.events)) {
                throw new Error('Неизвестный формат разовых изменений');
            }
            schedule = fresh;
            histories.permanent = results[1].data;
            histories.once = results[2].data;
            shas.permanent = results[1].sha;
            shas.once = results[2].sha;
            bindHistories();
            renderEditor();
            say('Свежая версия загружена. Изменения появятся у всех после сохранения и публикации GitHub Actions.');
        } catch (error) {
            say(error.message);
        } finally {
            busy = false;
        }
    }
    function field(name, title, type = 'text', value = '') {
        const label = el('label', title);
        const input = document.createElement(type === 'select' ? 'select' : 'input');
        input.name = name;
        if (type !== 'select') {
            input.type = type;
            if (type === 'text') {
                input.maxLength = 500;
            }
        }
        input.value = value;
        label.append(input);
        return label;
    }
    function option(select, title, value) {
        const node = el('option', title);
        node.value = value;
        select.append(node);
    }
    function controls() {
        return Object.fromEntries([...form.elements].filter((item) => item.name).map((item) => [item.name, item]));
    }
    function sourceRows(date) {
        if (!window.StudyScheduleOverrides.validDate(date)) {
            return [];
        }
        if (mode === 'permanent') {
            return window.StudyScheduleOverrides.apply(schedule, date);
        }
        const day = window.StudySchedule.dateValue(date);
        const rows = [...window.StudySchedule.lessonsFor(schedule, day, 1), ...window.StudySchedule.lessonsFor(schedule, day, 2)];
        return rows.filter((item, index) => schedule.lessons.some((base) => base.id === item.id)
            && rows.findIndex((other) => other.id === item.id) === index);
    }
    function populateLessons() {
        const fields = controls();
        const previous = fields.lesson.value;
        fields.lesson.replaceChildren();
        const rows = sourceRows(fields.date.value);
        for (const lesson of rows) {
            option(fields.lesson, `${DAYS[lesson.day]} · ${lesson.pair}-я пара · ${lesson.title}`
                + (lesson.subgroup ? ` (${lesson.subgroup} подгруппа)` : ''), lesson.id);
        }
        if (rows.some((item) => item.id === previous)) {
            fields.lesson.value = previous;
        }
        fillLesson();
    }
    function fillLesson() {
        const fields = controls();
        selected = sourceRows(fields.date.value).find((item) => item.id === fields.lesson.value);
        const add = mode === 'once' && fields.action.value === 'add';
        const source = add ? { title: '', pair: 1, day: 0, weeks: [1, 2] } : selected || {};
        for (const name of ['title', 'teacher', 'kind', 'room', 'place', 'note']) {
            fields[name].value = source[name] || '';
        }
        fields.pair.value = String(source.pair || 1);
        fields.day.value = String(source.day || 0);
        fields.week1.checked = (source.weeks || []).includes(1);
        fields.week2.checked = (source.weeks || []).includes(2);
        const times = window.StudySchedule.lessonTime(schedule, source) || schedule.bells[1];
        fields.start.value = times[0];
        fields.end.value = times[1];
        fields.targetDate.value = fields.date.value;
        toggleFields();
    }
    function toggleFields() {
        const fields = controls();
        const action = fields.action.value;
        form.querySelector('.schedule-admin-fields').hidden = mode === 'once' && action === 'cancel';
        fields.lesson.parentElement.hidden = mode === 'once' && action === 'add';
        fields.targetDate.parentElement.hidden = mode === 'permanent' || !['move', 'add'].includes(action);
        fields.day.parentElement.hidden = mode !== 'permanent';
        form.querySelector('.schedule-admin-weeks').hidden = mode !== 'permanent';
    }
    function record() {
        return { id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    }
    function makeEvent() {
        const fields = controls();
        const date = fields.date.value;
        if (!window.StudyScheduleOverrides.validDate(date)) {
            throw new Error('Укажите правильную дату');
        }
        const action = mode === 'permanent' ? 'replace' : fields.action.value;
        if (!selected && action !== 'add') {
            throw new Error('Выберите пару');
        }
        const entry = record();
        if (fields.reason.value.trim()) {
            entry.reason = fields.reason.value.trim();
        }
        let source;
        if (mode === 'once' && action !== 'add') {
            const previous = histories.once.events.find((item) => item.id === selected.exceptionId);
            source = previous?.source || { date, lessonId: selected.id };
            if (previous) {
                entry.supersedes = [previous.id];
            }
        }
        if (action === 'cancel') {
            return { ...entry, action, source };
        }
        const target = {};
        for (const name of ['title', 'teacher', 'kind', 'note']) {
            target[name] = fields[name].value.trim();
        }
        if (!target.title) {
            throw new Error('Укажите название пары');
        }
        if (fields.place.value.trim()) {
            target.place = fields.place.value.trim();
        } else {
            target.room = fields.room.value.trim();
        }
        target.pair = Number(fields.pair.value);
        target.start = fields.start.value;
        target.end = fields.end.value;
        if (!target.start || !target.end || target.start >= target.end) {
            throw new Error('Начало пары должно быть раньше окончания');
        }
        if (mode === 'permanent') {
            target.day = Number(fields.day.value);
            target.weeks = [fields.week1.checked ? 1 : 0, fields.week2.checked ? 2 : 0].filter(Boolean);
            if (!target.weeks.length) {
                throw new Error('Выберите хотя бы одну неделю');
            }
        }
        const patch = action === 'add' ? target : Object.fromEntries(Object.entries(target)
            .filter(([name, value]) => JSON.stringify(value) !== JSON.stringify(selected[name] ?? (typeof value === 'string' ? '' : null))));
        const oldTime = selected ? window.StudySchedule.lessonTime(schedule, selected) : null;
        if (action !== 'add' && !selected.start && oldTime?.[0] === target.start && oldTime?.[1] === target.end) {
            delete patch.start;
            delete patch.end;
        } else {
            patch.start = target.start;
            patch.end = target.end;
        }
        if (mode === 'permanent') {
            if (!Object.keys(patch).length) {
                throw new Error('Нет изменений для сохранения');
            }
            const event = { ...entry, action: 'replace', lessonId: selected.id, effectiveFrom: date, patch };
            window.StudyScheduleOverrides.validate({ schema: 1, events: [...histories.permanent.events, event] }, schedule);
            return event;
        }
        const targetDate = ['move', 'add'].includes(action) ? fields.targetDate.value : date;
        if (!window.StudyScheduleOverrides.validDate(targetDate)) {
            throw new Error('Укажите дату новой пары');
        }
        return { ...entry, action: action === 'add' ? 'add' : source.date === targetDate ? 'replace' : 'move',
            ...(source ? { source } : {}), target: { date: targetDate, lesson: patch } };
    }
    function describe(kind, event) {
        const original = schedule?.lessons.find((item) => item.id === (event.lessonId || event.source?.lessonId));
        const title = event.target?.lesson.title || original?.title || 'Изменение расписания';
        const date = kind === 'permanent' ? 'С ' + event.effectiveFrom : event.source?.date || event.target?.date || '';
        const patch = event.patch || event.target?.lesson || {};
        const details = Object.entries(patch).filter(([name]) => !['mapUrl', 'thumbnail'].includes(name))
            .map(([name, value]) => ({ room: 'Кабинет', place: 'Место', title: 'Предмет', start: 'Начало', end: 'Конец',
                pair: 'Пара', day: 'День', weeks: 'Недели', teacher: 'Преподаватель', kind: 'Тип', note: 'Примечание' }[name] || name)
                + ': ' + (name === 'day' ? DAYS[value] : Array.isArray(value) ? value.join(', ') : value)).join('\n');
        return `${ACTIONS[event.action]} · ${title}\n${date}`
            + (event.target && event.source && event.source.date !== event.target.date ? ' → ' + event.target.date : '')
            + (details ? '\n' + details : '') + (event.reason ? '\nПричина: ' + event.reason : '');
    }
    function stage(kind, event) {
        if (busy) {
            say('Дождитесь завершения текущего запроса.');
            return;
        }
        draft = { kind, event, sha: shas[kind] || '' };
        write('study-admin-draft', draft);
        const preview = box.querySelector('.schedule-admin-preview');
        preview.textContent = describe(kind, event);
        if (typeof preview.scrollIntoView === 'function') {
            preview.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        say('Черновик сохранён на устройстве. Публичное расписание пока не изменилось.');
    }
    async function publish() {
        if (busy || !draft) {
            say('Сначала нажмите «Предпросмотр и черновик».');
            return;
        }
        if (!draft.sha) {
            say('Загрузите свежую версию из GitHub и пересоздайте черновик перед сохранением.');
            return;
        }
        if (!token) {
            say('Введите GitHub-токен с правом Contents: Read and write для university-notes. Код администратора открывает интерфейс.');
            return;
        }
        const saving = structuredClone(draft);
        busy = true;
        say('Сохранение в GitHub…');
        try {
            const current = await getFile(PATHS[saving.kind]);
            if (saving.sha && saving.sha !== current.sha) {
                throw new Error('Журнал изменился в GitHub. Загрузите свежую версию и пересоздайте черновик.');
            }
            if (current.data.events.some((event) => event.id === saving.event.id)) {
                throw new Error('Этот черновик уже сохранён в GitHub. Загрузите свежую версию.');
            }
            const updated = { ...current.data, events: [...current.data.events, saving.event] };
            if (saving.kind === 'permanent') {
                window.StudyScheduleOverrides.validate(updated, schedule);
            }
            const result = await request('PUT', PATHS[saving.kind], {
                branch: 'main', sha: current.sha, content: encode(JSON.stringify(updated) + '\n'),
                message: (saving.kind === 'permanent' ? 'Permanent schedule: ' : 'Dated schedule: ') + ACTIONS[saving.event.action],
            });
            histories[saving.kind] = updated;
            shas[saving.kind] = result.content.sha;
            bindHistories();
            draft = null;
            write('study-admin-draft', null);
            renderEditor();
            say('Сохранено в GitHub. Ожидается публикация Actions; затем обновите материалы в приложении или страницу сайта.');
            const link = el('a', 'Коммит сохранения');
            link.href = result.commit.html_url;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            status.append(document.createTextNode('\n'), link);
        } catch (error) {
            say(error.message);
        } finally {
            busy = false;
        }
    }
    function showHistory(container, kind, title) {
        container.append(el('h3', title));
        const list = el('ul', undefined, 'schedule-admin-history');
        const events = histories[kind].events;
        const superseded = new Set(events.flatMap((event) => event.supersedes || []));
        for (const event of [...events].reverse()) {
            const row = el('li');
            row.append(el('strong', describe(kind, event)), el('small', event.createdAt || event.id));
            if (event.action !== 'revoke' && !superseded.has(event.id)) {
                row.append(button('Откатить', () => {
                    const undo = { ...record(), action: 'revoke', supersedes: [event.id] };
                    if (kind === 'permanent') {
                        undo.effectiveFrom = event.effectiveFrom > today() ? event.effectiveFrom : today();
                    }
                    stage(kind, undo);
                }));
            } else {
                row.append(el('small', 'Сохранено в истории'));
            }
            list.append(row);
        }
        if (!events.length) {
            list.append(el('li', 'Изменений пока нет'));
        }
        container.append(list);
    }
    function renderEditor() {
        const area = box.querySelector('.schedule-admin-content');
        area.replaceChildren();
        const connection = el('details');
        connection.append(el('summary', 'Запись и обмен через GitHub'));
        const credential = field('token', 'GitHub-токен для этого сеанса', 'password');
        const input = credential.querySelector('input');
        input.value = token;
        input.autocomplete = 'off';
        input.addEventListener('input', () => { token = input.value.trim(); });
        connection.append(credential, el('p', 'Токен не сохраняется в коде, журнале или настройках устройства.', 'schedule-admin-note'));
        const help = el('a', 'Создать токен с правом Contents: Read and write только для university-notes');
        help.href = 'https://github.com/settings/personal-access-tokens/new?name=University%20Notes&contents=write';
        help.target = '_blank';
        help.rel = 'noopener noreferrer';
        connection.append(help, button('Загрузить свежую версию из GitHub', loadRemote));
        area.append(connection);
        const tabs = el('div', undefined, 'schedule-admin-actions');
        for (const [value, title] of [['permanent', 'Постоянные изменения'], ['once', 'Разовые изменения']]) {
            const tab = button(title, () => { mode = value; renderEditor(); });
            tab.setAttribute('aria-pressed', String(mode === value));
            tabs.append(tab);
        }
        area.append(tabs);
        form = el('form');
        form.addEventListener('submit', (event) => { event.preventDefault(); });
        const date = field('date', mode === 'permanent' ? 'Начиная с даты' : 'Исходная дата', 'date', today());
        const actions = field('action', 'Действие', 'select');
        for (const action of mode === 'permanent' ? ['replace'] : ['replace', 'move', 'cancel', 'add']) {
            option(actions.querySelector('select'), ACTIONS[action], action);
        }
        const lesson = field('lesson', 'Пара', 'select');
        const targetDate = field('targetDate', 'Новая дата', 'date', today());
        form.append(date, actions, lesson, targetDate);
        const grid = el('div', undefined, 'schedule-admin-grid schedule-admin-fields');
        for (const [name, title] of [['title', 'Предмет'], ['teacher', 'Преподаватель'], ['kind', 'Тип занятия'],
            ['room', 'Кабинет'], ['place', 'Другое место (например, ФОК ЧелГУ)'], ['note', 'Примечание']]) {
            grid.append(field(name, title));
        }
        const pair = field('pair', 'Номер пары', 'select');
        for (const number of Object.keys(schedule.bells)) {
            option(pair.querySelector('select'), number, number);
        }
        grid.append(pair, field('start', 'Начало', 'time'), field('end', 'Окончание', 'time'));
        const day = field('day', 'День недели', 'select');
        DAYS.forEach((title, index) => option(day.querySelector('select'), title, index));
        grid.append(day);
        const weeks = el('div', undefined, 'schedule-admin-weeks');
        weeks.append(field('week1', '1-я неделя', 'checkbox'), field('week2', '2-я неделя', 'checkbox'));
        form.append(grid, weeks, field('reason', 'Причина изменения'));
        const commands = el('div', undefined, 'schedule-admin-actions');
        commands.append(button('Предпросмотр и черновик', () => {
            try {
                stage(mode, makeEvent());
            } catch (error) {
                say(error.message);
            }
        }), button('Сохранить в GitHub', publish));
        form.append(commands, el('div', draft ? describe(draft.kind, draft.event) : 'Черновика пока нет', 'schedule-admin-preview'));
        area.append(form);
        const fields = controls();
        fields.date.addEventListener('change', populateLessons);
        fields.lesson.addEventListener('change', fillLesson);
        fields.action.addEventListener('change', fillLesson);
        fields.room.addEventListener('input', () => {
            if (fields.room.value.trim()) {
                fields.place.value = '';
            }
        });
        fields.place.addEventListener('input', () => {
            if (fields.place.value.trim()) {
                fields.room.value = '';
            }
        });
        fields.pair.addEventListener('change', () => {
            const times = schedule.bells[fields.pair.value];
            fields.start.value = times[0];
            fields.end.value = times[1];
        });
        populateLessons();
        showHistory(area, 'permanent', 'История постоянных изменений');
        showHistory(area, 'once', 'История разовых изменений');
        area.append(button('Выйти из режима администратора', () => {
            unlocked = false;
            token = '';
            write('study-admin-unlocked', false);
            showLogin();
        }));
    }
    function showLogin() {
        const area = box.querySelector('.schedule-admin-content');
        area.replaceChildren();
        const code = field('code', 'Код администратора', 'password');
        const input = code.querySelector('input');
        input.maxLength = 12;
        const login = () => {
            if (input.value.trim() !== CODE) {
                say('Код не совпадает');
                return;
            }
            unlocked = true;
            write('study-admin-unlocked', true);
            renderEditor();
            say('Режим администратора включён на этом устройстве.');
        };
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                login();
            }
        });
        area.append(code, button('Войти', login));
        input.focus();
    }
    const shell = el('section', undefined, 'schedule-admin-shell');
    shell.hidden = true;
    shell.setAttribute('role', 'dialog');
    shell.setAttribute('aria-modal', 'true');
    shell.setAttribute('aria-label', 'Управление расписанием');
    document.body.append(shell);
    function close() {
        shell.hidden = true;
        document.body.classList.remove('schedule-admin-open');
        previousFocus?.focus();
    }
    async function open() {
        previousFocus = document.activeElement;
        shell.hidden = false;
        document.body.classList.add('schedule-admin-open');
        box = el('div', undefined, 'schedule-admin-box');
        const heading = el('div', undefined, 'schedule-admin-heading');
        heading.append(el('h2', 'Управление расписанием'), button('Закрыть', close));
        status = el('p', '', 'schedule-admin-status');
        status.setAttribute('role', 'status');
        box.append(heading, status, el('div', undefined, 'schedule-admin-content'));
        shell.replaceChildren(box);
        if (!schedule) {
            try {
                const response = await fetch('/assets/campus-map/schedule.json');
                if (!response.ok) {
                    throw new Error('Расписание недоступно');
                }
                schedule = await response.json();
                histories = { permanent: { schema: 1, events: structuredClone(schedule.permanentChanges || []) },
                    once: { schema: 1, events: structuredClone(schedule.exceptions || []) } };
                for (const history of Object.values(histories)) {
                    for (const event of history.events) {
                        const patch = event.patch || event.target?.lesson;
                        if (patch) {
                            delete patch.mapUrl;
                            delete patch.thumbnail;
                        }
                    }
                }
                bindHistories();
            } catch (error) {
                say(error.message);
                return;
            }
        }
        if (unlocked) {
            renderEditor();
        } else {
            showLogin();
        }
    }
    shell.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            close();
        }
    });
    window.StudyAdmin = { open, request, makeEvent, publish, stage, code: CODE };
    for (const panel of document.querySelectorAll('.settings-panel')) {
        panel.append(button('Ввести код администратора', open));
    }
})();
