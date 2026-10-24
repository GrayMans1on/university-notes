(() => {
    'use strict';
    const T = window.StudyTools;
    if (!T) { return; }
    const empty = { notes: [], flows: [], formulas: [], highlights: [], teacherNotes: {}, bookBindings: {} };
    const workspace = () => ({ ...T.clone(empty), ...T.storage.read('study-workspace', empty) });
    function save(field, value) {
        const data = workspace(); data[field] = value; T.storage.write('study-workspace', data);
    }
    window.StudyWorkspace = { read: workspace, save };
    const id = () => 'item-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
    const element = (tag, text, className = '') => {
        const item = document.createElement(tag); item.className = className;
        if (text !== undefined) { item.textContent = text; }
        return item;
    };
    const button = (text, action, className = '') => {
        const item = element('button', text, className); item.type = 'button';
        item.addEventListener('click', () => {
            try { const result = action(); if (result?.catch) { result.catch((e) => say(e.message)); } }
            catch (error) { say(error.message); }
        });
        return item;
    };
    const field = (title, value = '', type = 'input') => {
        const label = element('label', title); const input = document.createElement(type);
        input.value = value; label.append(input); return { label, input };
    };
    const select = (title, options, value) => {
        const result = field(title, '', 'select');
        for (const [key, name] of options) { result.input.append(new Option(name, key)); }
        if (value !== undefined) { result.input.value = value; }
        return result;
    };
    const say = (text) => { const node = document.getElementById('tool-status'); if (node) { node.textContent = text; } };
    const row = (...items) => { const node = element('div', undefined, 'tool-toolbar'); node.append(...items); return node; };
    const format = (value) => Number.isFinite(value) ? Number(value.toPrecision(12)).toString() : 'Не определено';
    function historyBar(history, restore) {
        const undo = button('Отменить', () => { restore(history.undo()); update(); });
        const redo = button('Повторить', () => { restore(history.redo()); update(); });
        function update() { undo.disabled = history.index === 0; redo.disabled = history.index === history.items.length - 1; }
        update(); return { node: row(undo, redo), update };
    }
    function exportFile(name, mime, data) {
        if (window.StudyNative) {
            if (typeof window.StudyNative.exportDocument !== 'function') {
                throw new Error('Для сохранения файлов из приложения установите APK 1.2.0. На сайте экспорт уже доступен.');
            }
            window.StudyNative.exportDocument(name, mime, data); say('Выберите место сохранения файла.'); return;
        }
        const blob = mime === 'image/png' ? null : new Blob([data], { type: mime });
        const url = blob ? URL.createObjectURL(blob) : data;
        const link = element('a'); link.href = url; link.download = name;
        document.body.append(link); link.click(); link.remove();
        if (blob) { setTimeout(() => URL.revokeObjectURL(url), 10000); }
        say('Файл передан браузеру для сохранения.');
    }
    window.addEventListener('study-file-export', (event) => say(event.detail.success ? 'Файл сохранён.' : event.detail.message));
    const catalog = () => fetch('/assets/tool-catalog.json').then((r) => {
        if (!r.ok) { throw new Error('Каталог недоступен.'); } return r.json();
    });
    function notes(root, data) {
        let items = workspace().notes; let active = items[0]?.id;
        const history = new T.History(items); const list = element('div', undefined, 'tool-list');
        const editor = element('div', undefined, 'tool-form');
        const layout = element('div', undefined, 'tool-split'); layout.append(list, editor);
        const bar = historyBar(history, (value) => { save('notes', value); items = value; render(); });
        function commit() { save('notes', items); history.push(items); bar.update(); say('Сохранено на этом устройстве.'); }
        function render() {
            list.replaceChildren(); editor.replaceChildren();
            for (const note of items) {
                const b = button(note.title || 'Без названия', () => { active = note.id; render(); });
                b.setAttribute('aria-pressed', String(note.id === active)); list.append(b);
            }
            const note = items.find((n) => n.id === active);
            if (!note) { editor.append(element('p', 'Создайте первую заметку.')); return; }
            const title = field('Название', note.title); title.input.maxLength = 160;
            const subject = select('Дисциплина', [['', 'Без привязки'], ...data.subjects.map((s) => [s.slug, s.title])], note.subject);
            const body = field('Текст заметки', note.body, 'textarea'); body.input.className = 'note-content';
            for (const [input, property] of [[title.input, 'title'], [subject.input, 'subject'], [body.input, 'body']]) {
                input.addEventListener('input', () => {
                    try {
                        note[property] = input.value; note.updatedAt = new Date().toISOString(); commit();
                        const current = list.querySelector('[aria-pressed=true]');
                        if (current) { current.textContent = note.title || 'Без названия'; }
                    } catch (e) { say('Не удалось сохранить: ' + e.message); }
                });
            }
            editor.append(title.label, subject.label, body.label, button('Скачать TXT', () => exportFile('note.txt', 'text/plain', note.title + '\n\n' + note.body)));
        }
        root.append(row(button('Новая заметка', () => {
            const note = { id: id(), title: 'Новая заметка', subject: '', body: '', updatedAt: new Date().toISOString() };
            items.push(note); active = note.id; commit(); render();
        }, 'primary')), bar.node, layout, element('p', 'Личные записи не меняют общие конспекты.', 'tool-help'));
        render();
    }
    function calculator(root) { window.StudyMathTools.calculator(root); }
    function converter(root) {
        const category = select('Величина', Object.keys(T.units).map((name) => [name, name]));
        const value = field('Исходное число', '1'); const from = select('Исходная единица', []);
        const result = field('Результат'); result.input.readOnly = true;
        const to = select('Единица результата', []);
        const grid = element('div', undefined, 'converter-grid');
        const swap = button('⇅', () => {
            const source = from.input.value; from.input.value = to.input.value; to.input.value = source; calculate();
        }, 'converter-swap');
        swap.title = 'Поменять местами'; swap.setAttribute('aria-label', 'Поменять местами');
        function calculate() {
            try {
                if (!value.input.value.trim()) { throw new Error('Введите число.'); }
                const n = Number(value.input.value.replace(',', '.'));
                result.input.value = format(T.convert(n, category.input.value, from.input.value, to.input.value)); say('');
            } catch (e) { result.input.value = '—'; say(e.message); }
        }
        function updateUnits() {
            for (const input of [from.input, to.input]) {
                input.replaceChildren(...Object.keys(T.units[category.input.value]).map((name) => new Option(name, name)));
            }
            to.input.selectedIndex = Math.min(1, to.input.options.length - 1); calculate();
        }
        category.input.addEventListener('change', updateUnits);
        for (const input of [value.input, from.input, to.input]) { input.addEventListener('input', calculate); }
        value.input.inputMode = 'decimal'; grid.append(value.label, from.label, result.label, to.label, swap);
        root.append(category.label, grid, element('p', 'КБ/МБ — десятичные; КиБ/МиБ — двоичные.', 'tool-help')); updateUnits();
    }
    function graphs(root) { window.StudyMathTools.graphs(root); }
    function formulas(root) { window.StudyMathTools.formulas(root); }
    async function teachers(root) {
        const response = await fetch('/assets/teachers.json');
        if (!response.ok) { throw new Error('Справочник недоступен.'); }
        const data = await response.json(); const subjects = (await catalog()).subjects;
        const search = field('Поиск преподавателя'); const list = element('div', undefined, 'teacher-cards');
        function render() {
            list.replaceChildren(); const query = search.input.value.toLocaleLowerCase('ru');
            for (const person of data.people) {
                if (![person.name, ...person.subjects].join(' ').toLocaleLowerCase('ru').includes(query)) { continue; }
                const panel = element('article', undefined, 'tool-card-panel teacher-card');
                const initials = person.name.split(/\s+/).map((word) => word[0]).slice(0, 2).join('');
                panel.append(element('div', initials, 'teacher-avatar'), element('h2', person.name));
                const links = element('div', undefined, 'teacher-subjects');
                for (const name of person.subjects) {
                    const subject = subjects.find((item) => item.title === name || name.includes(item.title)
                        || (/иностранн/i.test(name) && item.slug === 'english')
                        || (name.includes('анализ') && item.slug === 'calculus')
                        || (name.includes('алгебр') && item.slug === 'linear-algebra')
                        || (/дискрет/i.test(name) && item.slug === 'discrete-math')
                        || (name.includes('технолог') && item.slug === 'modern-technologies')
                        || (name.includes('государствен') && item.slug === 'statehood'));
                    const link = element(subject || /программирован/i.test(name) ? 'a' : 'span', name);
                    if (subject) { link.href = '/notes/' + subject.slug + '/'; }
                    else if (/программирован/i.test(name)) { link.href = 'https://github.com/GrayMans1on/UniversityProjects_Shparov/tree/main/lectures'; }
                    links.append(link);
                }
                panel.append(links, element('h3', 'Описание и замечания'),
                    element('p', person.description || 'Описание пока не добавлено.')); list.append(panel);
            }
            if (!list.children.length) { list.append(element('p', 'Совпадений нет.')); }
        }
        search.input.addEventListener('input', render); root.append(search.label, list); render();
    }
    async function announcements(root) {
        const response = await fetch('/assets/announcements.json');
        if (!response.ok) { throw new Error('Объявления недоступны.'); }
        const data = await response.json();
        for (const post of [...data.posts].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
            const panel = element('article', undefined, 'tool-card-panel');
            panel.append(element('h2', post.title), element('p', post.body),
                element('small', new Date(post.createdAt).toLocaleString('ru-RU', { timeZone: 'Asia/Yekaterinburg' })));
            root.append(panel);
        }
        if (!data.posts.length) { root.append(element('p', 'Опубликованных объявлений пока нет.')); }
    }
    function flowcharts(root) { window.StudyFlowEditor.flowcharts(root); }
    window.StudyToolUI = { element, field, select, button, row, say, exportFile, historyBar, id };
    async function start() {
        const page = document.querySelector('[data-study-tool]'); if (!page) { return; }
        const root = document.getElementById('tool-root');
        const renderers = { calculator, converter, graphs, 'formula-editor': formulas, teachers, announcements, flowcharts };
        try {
            if (page.dataset.studyTool === 'notes') { notes(root, await catalog()); }
            else { await renderers[page.dataset.studyTool](root); }
        } catch (e) { say(e.message); }
    }
    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', start); } else { start(); }
})();
