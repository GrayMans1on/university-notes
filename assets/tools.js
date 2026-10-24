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
    function calculator(root) {
        const expression = field('Выражение', 'sqrt(2)^2');
        const output = element('output', 'Введите выражение', 'tool-output');
        const history = element('ol'); let ans = 0;
        function calculate() {
            const result = T.compile(expression.input.value)({ ans });
            if (!Number.isFinite(result)) { throw new Error('Результат не определён в вещественных числах или выходит за диапазон.'); }
            ans = result; output.textContent = format(result);
            history.prepend(element('li', expression.input.value + ' = ' + format(result)));
        }
        expression.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { try { calculate(); } catch (x) { say(x.message); } } });
        const keys = element('div', undefined, 'tool-calculator-keys');
        for (const text of ['7', '8', '9', '/', 'sqrt(', '4', '5', '6', '*', '^', '1', '2', '3', '-', '!', '0', '.', '(', ')', '+', 'sin(', 'cos(', 'tan(', 'ln(', 'log(', 'pi', 'e', 'ans', 'abs(', '%']) {
            keys.append(button(text, () => { expression.input.setRangeText(text, expression.input.selectionStart, expression.input.selectionEnd, 'end'); expression.input.focus(); }));
        }
        root.append(expression.label, row(button('Вычислить', calculate, 'primary'), button('Очистить ввод', () => { expression.input.value = ''; })),
            output, keys, element('p', 'Углы в радианах. Умножение: 2*x. Степень: ^. Функции: sin, cos, tan, asin, acos, atan, sqrt, ln, log, exp, abs. ans — предыдущий ответ.', 'tool-help'), history);
    }
    function converter(root) {
        const category = select('Величина', Object.keys(T.units).map((s) => [s, s]));
        const value = field('Значение', '1'); const from = select('Из', []); const to = select('В', []);
        const output = element('output', '', 'tool-output');
        function updateUnits() {
            from.input.replaceChildren(); to.input.replaceChildren();
            for (const name of Object.keys(T.units[category.input.value])) {
                from.input.append(new Option(name, name)); to.input.append(new Option(name, name));
            }
            to.input.selectedIndex = Math.min(1, to.input.options.length - 1); calculate();
        }
        function calculate() {
            try {
                const n = Number(value.input.value.replace(',', '.'));
                if (!value.input.value.trim()) { throw new Error('Введите значение.'); }
                output.textContent = format(T.convert(n, category.input.value, from.input.value, to.input.value)) + ' ' + to.input.value;
                say('');
            } catch (e) { output.textContent = '—'; say(e.message); }
        }
        category.input.addEventListener('change', updateUnits);
        for (const input of [value.input, from.input, to.input]) { input.addEventListener('input', calculate); }
        const fields = element('div', undefined, 'tool-fields'); fields.append(value.label, from.label, to.label);
        root.append(category.label, fields, row(button('Поменять местами', () => {
            const before = from.input.value; from.input.value = to.input.value; to.input.value = before; calculate();
        })), output, element('p', 'КБ и МБ — десятичные; КиБ и МиБ — двоичные. Для температуры учитывается смещение шкалы.', 'tool-help'));
        updateUnits();
    }
    function graphs(root) {
        const expressions = field('Функции, по одной на строку (до 4)', 'sin(x)\nx^2', 'textarea');
        const bounds = [['x от', '-10'], ['x до', '10'], ['y от', '-5'], ['y до', '10']].map(([name, value]) => field(name, value));
        const fields = element('div', undefined, 'tool-fields'); bounds.forEach((f) => fields.append(f.label));
        const canvas = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        canvas.setAttribute('viewBox', '0 0 840 480'); canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', 'Графики функций'); canvas.classList.add('graph-canvas');
        const legend = element('div', undefined, 'tool-help'); const colors = ['#687fe8', '#d26735', '#269980', '#b469bf'];
        function draw() {
            const [xmin, xmax, ymin, ymax] = bounds.map((f) => Number(f.input.value.replace(',', '.')));
            if (![xmin, xmax, ymin, ymax].every(Number.isFinite) || xmax <= xmin || ymax <= ymin
                || xmax - xmin < 1e-9 || ymax - ymin < 1e-9 || Math.max(...[xmin, xmax, ymin, ymax].map(Math.abs)) > 1e9) {
                throw new Error('Границы должны быть конечными, возрастающими и не превышать 10⁹ по модулю.');
            }
            const lines = expressions.input.value.split('\n').map((s) => s.trim()).filter(Boolean);
            if (!lines.length || lines.length > 4) { throw new Error('Введите от одной до четырёх функций.'); }
            const functions = lines.map(T.compile);
            const sx = (x) => 55 + (x - xmin) / (xmax - xmin) * 760;
            const sy = (y) => 435 - (y - ymin) / (ymax - ymin) * 410;
            const parts = ['<defs><clipPath id="graph-clip"><rect x="55" y="25" width="760" height="410"/></clipPath></defs>'];
            for (let k = 0; k <= 10; k += 1) {
                const x = 55 + k * 76; const y = 25 + k * 41;
                parts.push(`<path d="M${x} 25V435M55 ${y}H815" stroke="currentColor" opacity=".12"/>`);
                if (k % 2 === 0) {
                    parts.push(`<text x="${x}" y="458" text-anchor="middle" fill="currentColor" font-size="12">${format(xmin + k / 10 * (xmax - xmin))}</text><text x="48" y="${y + 4}" text-anchor="end" fill="currentColor" font-size="12">${format(ymax - k / 10 * (ymax - ymin))}</text>`);
                }
            }
            if (xmin <= 0 && xmax >= 0) { parts.push(`<path d="M${sx(0)} 25V435" stroke="currentColor"/>`); }
            if (ymin <= 0 && ymax >= 0) { parts.push(`<path d="M55 ${sy(0)}H815" stroke="currentColor"/>`); }
            functions.forEach((fn, index) => {
                let path = ''; let previous = null;
                for (let j = 0; j <= 1600; j += 1) {
                    const x = xmin + (xmax - xmin) * j / 1600; const y = fn({ x }); const py = sy(y);
                    if (!Number.isFinite(y) || py < -1000 || py > 1500) { previous = null; continue; }
                    const jump = previous !== null && Math.abs(py - previous) < 180;
                    path += (jump ? 'L' : 'M') + sx(x).toFixed(2) + ' ' + py.toFixed(2); previous = py;
                }
                parts.push(`<path d="${path}" fill="none" stroke="${colors[index]}" stroke-width="2.5" clip-path="url(#graph-clip)"/>`);
            });
            canvas.innerHTML = parts.join(''); legend.replaceChildren();
            lines.forEach((s, i) => { const p = element('p', s); p.style.color = colors[i]; legend.append(p); });
            say('Графики построены. Изображение получено численной выборкой, отдельные разрывы могут требовать уточнения масштаба.');
        }
        root.append(expressions.label, fields, row(button('Построить', draw, 'primary'), button('Приблизить', () => zoom(.5)), button('Отдалить', () => zoom(2))), canvas, legend,
            element('p', 'Углы в радианах. Примеры: sin(x), x^2, 1/x, sqrt(x). Умножение пишется явно: 2*x.', 'tool-help'));
        function zoom(factor) {
            for (const [a, b] of [[0, 1], [2, 3]]) {
                const first = Number(bounds[a].input.value); const last = Number(bounds[b].input.value);
                const center = (first + last) / 2; const half = (last - first) / 2 * factor;
                bounds[a].input.value = center - half; bounds[b].input.value = center + half;
            }
            draw();
        }
        draw();
    }
    function formulas(root) {
        let items = workspace().formulas; let active = items[0]?.id;
        const history = new T.History(items); const picker = select('Сохранённые формулы', []);
        const title = field('Название', 'Новая формула'); const code = field('Формула LaTeX', '\\frac{a}{b}', 'textarea');
        const preview = element('div', undefined, 'tool-preview');
        const bar = historyBar(history, (value) => { save('formulas', value); items = value; load(); });
        function render() {
            try {
                if (!window.katex) { throw new Error('Модуль формул не загружен.'); }
                window.katex.render(code.input.value, preview, { throwOnError: true, trust: false, displayMode: true, maxExpand: 1000 });
                say('');
            } catch (e) { preview.textContent = e.message; }
        }
        function load() {
            picker.input.replaceChildren();
            for (const item of items) { picker.input.append(new Option(item.title || 'Без названия', item.id)); }
            const item = items.find((x) => x.id === active) || items[0]; active = item?.id;
            if (item) { picker.input.value = item.id; title.input.value = item.title; code.input.value = item.code; }
            render();
        }
        picker.input.addEventListener('change', () => { active = picker.input.value; load(); });
        for (const f of [title, code]) {
            f.input.addEventListener('input', () => {
                try {
                    if (active) {
                        const item = items.find((x) => x.id === active); item.title = title.input.value; item.code = code.input.value;
                        save('formulas', items); history.push(items); bar.update();
                    }
                    render();
                } catch (e) { say(e.message); }
            });
        }
        const shortcuts = element('div', undefined, 'tool-shortcut-list');
        for (const [name, text] of [['Дробь', '\\frac{a}{b}'], ['Корень', '\\sqrt{x}'], ['Сумма', '\\sum_{i=1}^{n} a_i'], ['Интеграл', '\\int_a^b f(x)\\,dx'], ['Матрица', '\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}']]) {
            shortcuts.append(button(name, () => { code.input.setRangeText(text, code.input.selectionStart, code.input.selectionEnd, 'end'); code.input.dispatchEvent(new Event('input')); }));
        }
        root.append(picker.label, row(button('Новая формула', () => {
            const item = { id: id(), title: 'Новая формула', code: '' }; items.push(item); active = item.id;
            save('formulas', items); history.push(items); bar.update(); load();
        }, 'primary')), bar.node, title.label, code.label, shortcuts, preview,
        row(button('Сохранить формулу', () => {
            if (!active) { const item = { id: id(), title: title.input.value, code: code.input.value }; items.push(item); active = item.id; }
            save('formulas', items); history.push(items); bar.update(); load(); say('Сохранено на этом устройстве.');
        }), button('Скачать TEX', () => exportFile('formula.tex', 'text/plain', code.input.value))));
        load();
    }
    async function publish(path, transform, credentials) {
        const code = credentials.code.value;
        const unlocked = T.storage.read('study-admin-unlocked', false);
        if (!unlocked && code !== window.StudyAdmin.code) { throw new Error('Неверный код администратора.'); }
        const token = credentials.token.value.trim();
        const remote = await window.StudyAdmin.request('GET', path, undefined, token || undefined);
        const text = new TextDecoder().decode(Uint8Array.from(atob(remote.content.replace(/\s/g, '')), (c) => c.charCodeAt(0)));
        const value = transform(JSON.parse(text));
        const bytes = new TextEncoder().encode(JSON.stringify(value, null, 2) + '\n');
        if (bytes.length > 1500000) { throw new Error('Каталог слишком большой для одной публикации. Черновик сохранён.'); }
        const encoded = btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''));
        await window.StudyAdmin.request('PUT', path, { branch: 'main', sha: remote.sha, content: encoded,
            message: path.includes('announcements') ? 'Publish class announcement' : 'Update teacher description' }, token || undefined);
        say('Сохранено в GitHub. На других устройствах появится после публикации сайта и обновления материалов.');
    }
    function credentials() {
        const details = element('details'); details.append(element('summary', 'Публикация для всех'));
        const code = field('Код администратора'); code.input.type = 'password';
        const token = field('GitHub-токен, только на этот сеанс'); token.input.type = 'password'; token.input.autocomplete = 'off';
        details.append(element('p', 'Используется существующий доступ GitHub, как в управлении расписанием. Личные заметки сохраняются без входа.', 'tool-help'), code.label, token.label);
        return { node: details, code: code.input, token: token.input };
    }
    async function teachers(root) {
        const response = await fetch('/assets/teachers.json'); if (!response.ok) { throw new Error('Справочник недоступен.'); }
        const catalog = await response.json(); const search = field('Поиск преподавателя или кафедры');
        const list = element('div'); let descriptions = workspace().teacherNotes;
        const history = new T.History(descriptions);
        const bar = historyBar(history, (value) => { save('teacherNotes', value); descriptions = value; render(); });
        function render() {
            list.replaceChildren(); const query = search.input.value.toLocaleLowerCase('ru').replace(/ё/g, 'е'); let count = 0;
            for (const person of catalog.people) {
                const own = descriptions[person.id] || {};
                if (![person.name, person.department, own.department, ...person.subjects].join(' ').toLocaleLowerCase('ru').replace(/ё/g, 'е').includes(query)) { continue; }
                count += 1;
                const panel = element('article', undefined, 'tool-card-panel'); panel.append(element('h2', person.name), element('p', person.subjects.join(' · ')));
                const department = field('Кафедра', own.department ?? person.department); department.input.maxLength = 300;
                const description = field('Описание и замечания', own.description ?? person.description, 'textarea'); description.input.maxLength = 12000;
                panel.append(department.label, description.label, element('p', 'Ваши правки сохраняются на этом устройстве. Пустые сведения не дополняются предположениями.', 'tool-help'));
                function update() {
                    try {
                        descriptions[person.id] = { department: department.input.value, description: description.input.value };
                        save('teacherNotes', descriptions); history.push(descriptions); bar.update(); say('Личное описание сохранено.');
                    } catch (e) { say(e.message); }
                }
                department.input.addEventListener('input', update); description.input.addEventListener('input', update);
                const access = credentials(); const publishButton = button('Опубликовать описание', async () => {
                    publishButton.disabled = true;
                    try {
                        const item = { ...person, department: department.input.value, description: description.input.value };
                        await publish('content/teachers.json', (current) => {
                            if (current.schema !== 1 || !Array.isArray(current.people)) { throw new Error('Неверный формат справочника.'); }
                            const people = current.people.filter((p) => p.id !== person.id); people.push(item);
                            return { ...current, people };
                        }, access);
                    } finally { publishButton.disabled = false; }
                });
                access.node.append(publishButton); panel.append(access.node); list.append(panel);
            }
            if (!count) { list.append(element('p', 'Совпадений нет.')); }
        }
        search.input.addEventListener('input', render); root.append(search.label, bar.node, list); render();
    }
    async function announcements(root) {
        const response = await fetch('/assets/announcements.json'); if (!response.ok) { throw new Error('Объявления недоступны.'); }
        const data = await response.json(); const list = element('div');
        function render() {
            list.replaceChildren();
            for (const post of [...data.posts].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
                const panel = element('article', undefined, 'tool-card-panel');
                panel.append(element('h2', post.title), element('p', post.body), element('small', new Date(post.createdAt).toLocaleString('ru-RU', { timeZone: 'Asia/Yekaterinburg' })));
                list.append(panel);
            }
            if (!data.posts.length) { list.append(element('p', 'Опубликованных объявлений пока нет.')); }
        }
        const draft = T.storage.read('study-announcement-draft', { title: '', body: '' });
        const title = field('Заголовок', draft.title); title.input.maxLength = 160;
        const body = field('Текст объявления', draft.body, 'textarea'); body.input.maxLength = 15000;
        const history = new T.History(draft);
        const bar = historyBar(history, (v) => { title.input.value = v.title; body.input.value = v.body; T.storage.write('study-announcement-draft', v); });
        for (const input of [title.input, body.input]) {
            input.addEventListener('input', () => {
                try { const v = { title: title.input.value, body: body.input.value }; T.storage.write('study-announcement-draft', v); history.push(v); bar.update(); }
                catch (e) { say(e.message); }
            });
        }
        const details = element('details'); details.append(element('summary', 'Новое объявление'));
        const access = credentials(); access.node.open = true;
        const send = button('Опубликовать объявление', async () => {
            if (!title.input.value.trim() || !body.input.value.trim()) { throw new Error('Заполните заголовок и текст.'); }
            send.disabled = true;
            try {
                const post = { id: id(), title: title.input.value.trim(), body: body.input.value.trim(), createdAt: new Date().toISOString() };
                await publish('content/announcements.json', (current) => {
                    if (current.schema !== 1 || !Array.isArray(current.posts)) { throw new Error('Неверный формат объявлений.'); }
                    if (current.posts.some((p) => p.id === post.id)) { return current; }
                    return { ...current, posts: [...current.posts, post] };
                }, access);
                data.posts.push(post); render();
            } finally { send.disabled = false; }
        }, 'primary');
        details.append(title.label, body.label, bar.node, access.node, send);
        root.append(list, details); render();
    }
    function flowcharts(root) {
        let items = workspace().flows; let active = items[0]?.id; let selected;
        const history = new T.History(items); const picker = select('Сохранённые схемы', []);
        const title = field('Название схемы'); const canvas = element('div', undefined, 'flow-canvas');
        const editor = element('div', undefined, 'tool-form');
        const typeNames = { start: 'Начало', end: 'Конец', process: 'Действие', decision: 'Условие', input: 'Ввод', output: 'Вывод' };
        const type = select('Тип блока', Object.entries(typeNames));
        const bar = historyBar(history, (value) => { save('flows', value); items = value; render(); });
        const current = () => items.find((x) => x.id === active);
        function commit() { save('flows', items); history.push(items); bar.update(); say('Схема сохранена на этом устройстве.'); }
        function renderCanvas() {
            const flow = current(); if (!flow) { canvas.replaceChildren(); return; }
            canvas.innerHTML = T.flowSvg(flow.document, document.documentElement.dataset.theme === 'dark');
            for (const group of canvas.querySelectorAll('[data-node]')) {
                group.classList.toggle('selected', group.dataset.node === selected);
                group.addEventListener('click', () => { selected = group.dataset.node; renderEditor(); renderCanvas(); });
                group.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selected = group.dataset.node; renderEditor(); renderCanvas(); }
                });
                group.addEventListener('pointerdown', (event) => {
                    if (event.button !== 0) { return; }
                    const node = flow.document.nodes.find((n) => n.id === group.dataset.node);
                    const svg = canvas.firstElementChild; const bounds = svg.getBoundingClientRect();
                    const initial = { x: event.clientX, y: event.clientY, nx: node.x, ny: node.y };
                    group.setPointerCapture(event.pointerId);
                    const move = (e) => {
                        node.x = Math.max(5, Math.min(1020, initial.nx + (e.clientX - initial.x) * 1220 / bounds.width));
                        node.y = Math.max(5, Math.min(900, initial.ny + (e.clientY - initial.y) * 1020 / bounds.height));
                        group.setAttribute('transform', `translate(${node.x} ${node.y})`);
                    };
                    const up = () => {
                        group.removeEventListener('pointermove', move); group.removeEventListener('pointerup', up);
                        group.removeEventListener('pointercancel', up); selected = node.id; commit(); renderCanvas(); renderEditor();
                    };
                    group.addEventListener('pointermove', move); group.addEventListener('pointerup', up); group.addEventListener('pointercancel', up);
                });
            }
        }
        function renderEditor() {
            editor.replaceChildren(); const flow = current(); if (!flow) { return; }
            const list = select('Выбранный блок', [['', 'Выберите блок'], ...flow.document.nodes.map((n) => [n.id, n.text || typeNames[n.type]])], selected);
            list.input.addEventListener('change', () => { selected = list.input.value; renderEditor(); renderCanvas(); }); editor.append(list.label);
            const node = flow.document.nodes.find((n) => n.id === selected);
            if (node) {
                const text = field('Текст блока', node.text, 'textarea'); text.input.maxLength = 300;
                const position = [field('X', String(node.x)), field('Y', String(node.y))];
                const saveBlock = () => {
                    const x = Number(position[0].input.value); const y = Number(position[1].input.value);
                    const candidate = T.clone(flow.document); Object.assign(candidate.nodes.find((n) => n.id === node.id), { text: text.input.value, x, y });
                    flow.document = T.validateFlow(candidate); commit(); renderCanvas(); renderEditor();
                };
                editor.append(text.label, position[0].label, position[1].label, row(button('Применить блок', saveBlock), button('Удалить блок', () => {
                    flow.document.nodes = flow.document.nodes.filter((n) => n.id !== node.id);
                    flow.document.edges = flow.document.edges.filter((e) => e.from !== node.id && e.to !== node.id);
                    selected = undefined; commit(); render();
                })));
            }
            const options = flow.document.nodes.map((n) => [n.id, n.text || typeNames[n.type]]);
            if (options.length) {
                const from = select('Связь от блока', options, selected); const to = select('Связь к блоку', options);
                const label = field('Подпись связи', ''); label.input.maxLength = 50;
                editor.append(element('h2', 'Связи'), from.label, to.label, label.label, button('Добавить связь', () => {
                    if (flow.document.edges.length >= 200) { throw new Error('Достигнут предел 200 связей.'); }
                    flow.document.edges.push({ from: from.input.value, to: to.input.value, label: label.input.value }); commit(); render();
                }));
                flow.document.edges.forEach((edge, index) => {
                    const line = element('div', undefined, 'tool-toolbar');
                    const name = (key) => flow.document.nodes.find((n) => n.id === key)?.text || key;
                    line.append(element('small', name(edge.from) + ' → ' + name(edge.to) + (edge.label ? ' · ' + edge.label : '')),
                        button('Убрать связь', () => { flow.document.edges.splice(index, 1); commit(); render(); })); editor.append(line);
                });
            }
        }
        function render() {
            picker.input.replaceChildren(); items.forEach((x) => picker.input.append(new Option(x.document.title, x.id)));
            if (!current()) { active = items[0]?.id; }
            picker.input.value = active || ''; title.input.value = current()?.document.title || '';
            renderCanvas(); renderEditor();
        }
        picker.input.addEventListener('change', () => { active = picker.input.value; selected = undefined; render(); });
        title.input.addEventListener('change', () => { if (current()) { current().document.title = title.input.value.slice(0, 120); commit(); render(); } });
        function importText(text) {
            if (text.length > 500000) { throw new Error('Файл превышает 500 КБ.'); }
            const doc = T.validateFlow(JSON.parse(text.replace(/^\uFEFF/, ''))); const item = { id: id(), document: doc };
            items.push(item); active = item.id; selected = undefined; commit(); render(); say('Файл открыт как новая схема; прежние схемы сохранены.');
        }
        const file = document.createElement('input'); file.type = 'file'; file.accept = '.json,.csuflow,application/json'; file.hidden = true;
        file.addEventListener('change', async () => {
            try {
                const f = file.files[0]; if (f) { if (f.size > 500000) { throw new Error('Файл превышает 500 КБ.'); } importText(await f.text()); }
            } catch (e) { say('Не удалось открыть файл: ' + e.message); } finally { file.value = ''; }
        });
        window.addEventListener('study-flow-import', (event) => {
            try { if (event.detail.text) { importText(event.detail.text); } else { say(event.detail.message); } }
            catch (e) { say('Не удалось открыть схему: ' + e.message); }
        });
        const create = () => {
            const item = { id: id(), document: { format: 'csu-flowchart', version: 1, title: 'Новая схема',
                nodes: [{ id: id(), type: 'start', text: 'Начало', x: 280, y: 40 }], edges: [] } };
            items.push(item); active = item.id; selected = undefined; commit(); render();
        };
        const toolbar = row(button('Новая схема', create, 'primary'), button('Открыть файл', () => {
            if (window.StudyNative) {
                if (!window.StudyNative.importFlowchart) { throw new Error('Для открытия файлов установите APK 1.2.0.'); }
                window.StudyNative.importFlowchart();
            } else { file.click(); }
        }), button('Сохранить файл', () => {
            if (!current()) { throw new Error('Создайте схему.'); }
            exportFile('flowchart.csuflow', 'application/json', JSON.stringify(T.validateFlow(current().document), null, 2));
        }), button('Экспорт SVG', () => {
            if (!current()) { throw new Error('Создайте схему.'); } exportFile('flowchart.svg', 'image/svg+xml', T.flowSvg(current().document));
        }), button('Экспорт PNG', async () => {
            if (!current()) { throw new Error('Создайте схему.'); }
            const svg = new Blob([T.flowSvg(current().document)], { type: 'image/svg+xml' }); const url = URL.createObjectURL(svg);
            try {
                const img = new Image(); const loaded = new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; }); img.src = url; await loaded;
                const c = document.createElement('canvas'); c.width = 1220; c.height = 1020; c.getContext('2d').drawImage(img, 0, 0);
                exportFile('flowchart.png', 'image/png', c.toDataURL('image/png'));
            } finally { URL.revokeObjectURL(url); }
        }));
        const add = button('Добавить блок', () => {
            if (!current()) { create(); }
            const flow = current(); if (flow.document.nodes.length >= 100) { throw new Error('Достигнут предел 100 блоков.'); }
            const n = flow.document.nodes.length; const node = { id: id(), type: type.input.value, text: typeNames[type.input.value], x: 280 + n % 3 * 210, y: 40 + Math.floor(n / 3) % 7 * 120 };
            flow.document.nodes.push(node); selected = node.id; commit(); render();
        });
        root.append(toolbar, file, bar.node, picker.label, title.label, row(type.label, add), canvas, editor,
            element('p', 'Блоки можно перемещать мышью или пальцем. Текст и точное положение меняются в форме. Файл .csuflow сохраняет редактируемую схему; SVG и PNG предназначены для просмотра.', 'tool-help'));
        new MutationObserver(renderCanvas).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        render();
    }
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
