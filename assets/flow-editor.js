(() => {
    'use strict';
    function flowcharts(root) {
        const { element, field, select, button, row, historyBar, say, exportFile, id } = window.StudyToolUI;
        const T = window.StudyTools; const W = window.StudyWorkspace;
        let items = W.read().flows; let active = items[0]?.id; let selected; let selectedEdge;
        let runner; let generation = 0; let drag; let menuPoint = { x: 100, y: 100 };
        const names = { start: 'Начало', input: 'Ввод', process: 'Вычисление', decision: 'Условие', output: 'Вывод', end: 'Конец' };
        const history = new T.History(items); const picker = select('Сохранённые схемы', []);
        const title = field('Название схемы'); const board = element('div', undefined, 'flow-board');
        board.tabIndex = 0; board.setAttribute('aria-label', 'Полотно блок-схемы');
        const inspector = element('aside', undefined, 'flow-inspector'); const consolePanel = element('div', undefined, 'flow-console');
        const runStatus = element('p', 'Схема не запущена', 'flow-run-status');
        const variables = element('pre', '', 'flow-variables'); const output = element('div'); const inputPanel = element('form');
        const menu = element('div', undefined, 'flow-context-menu'); menu.hidden = true;
        menu.setAttribute('role', 'menu');
        const current = () => items.find((item) => item.id === active);
        const bar = historyBar(history, (value) => { stop(); items = value; W.save('flows', items); render(); });
        function stop() {
            generation += 1;
            if (runner && !runner.done) { runStatus.textContent = 'Выполнение остановлено'; }
            runner = null; inputPanel.replaceChildren();
        }
        function commit() {
            stop(); W.save('flows', items); history.push(items); bar.update(); say('Схема сохранена на этом устройстве.');
        }
        function create() {
            const document = { format: 'csu-flowchart', version: 1, title: 'Новая схема',
                nodes: [{ id: id(), type: 'start', text: 'Начало', x: 270, y: 30 }], edges: [] };
            const item = { id: id(), document }; items.push(item); active = item.id; selected = undefined;
            commit(); render();
        }
        function add(type, point) {
            if (!current()) { create(); }
            const doc = current().document;
            if (doc.nodes.length >= 100) { throw new Error('В схеме доступно до 100 блоков.'); }
            const config = type === 'input' ? { variable: 'a' } : type === 'process'
                ? { variable: 'b', operation: 'expression', expression: 'a * 2', left: 'a', right: '2' }
                : type === 'decision' ? { left: 'a', operator: '>', right: '0' }
                    : type === 'output' ? { expression: 'b' } : {};
            const node = { id: id(), type, text: names[type], x: Math.max(5, Math.min(1020, point.x)),
                y: Math.max(5, Math.min(900, point.y)), config };
            doc.nodes.push(node); selected = node.id; selectedEdge = undefined; menu.hidden = true; commit(); render();
        }
        function point(event) {
            const svg = board.querySelector('svg'); const rect = svg.getBoundingClientRect();
            return { x: (event.clientX - rect.left) * 1220 / rect.width,
                y: (event.clientY - rect.top) * 1020 / rect.height };
        }
        function renderCanvas() {
            const doc = current()?.document;
            if (!doc) { board.replaceChildren(element('p', 'Создайте схему или откройте сохранённый файл.')); return; }
            board.innerHTML = T.flowSvg(doc, document.documentElement.dataset.theme === 'dark');
            const svg = board.firstElementChild;
            for (const group of svg.querySelectorAll('[data-node]')) {
                const node = doc.nodes.find((item) => item.id === group.dataset.node);
                group.classList.toggle('selected', node.id === selected);
                group.classList.toggle('executing', node.id === runner?.current?.id);
                const ports = node.type === 'decision' ? [[170, 38, 'Да'], [85, 76, 'Нет']] : node.type === 'end' ? [] : [[85, 76, '']];
                for (const [x, y, branch] of ports) {
                    const port = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                    port.setAttribute('cx', x); port.setAttribute('cy', y); port.setAttribute('r', '9');
                    port.setAttribute('class', 'flow-port'); port.dataset.port = node.id; port.dataset.branch = branch;
                    port.setAttribute('role', 'button'); port.setAttribute('tabindex', '0');
                    port.setAttribute('aria-label', 'Протянуть стрелку' + (branch ? ': ' + branch : ''));
                    group.append(port);
                    if (branch) {
                        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                        text.setAttribute('x', x); text.setAttribute('y', y + 24); text.setAttribute('text-anchor', 'middle');
                        text.setAttribute('class', 'flow-port-label'); text.textContent = branch; group.append(text);
                    }
                }
            }
            [...svg.querySelectorAll('[marker-end]')].forEach((path, index) => {
                path.dataset.edge = index; path.classList.add('flow-edge');
                path.classList.toggle('selected', index === selectedEdge);
            });
            if (drag?.kind === 'edge') {
                const a = doc.nodes.find((node) => node.id === drag.from); const path = document.createElementNS(svg.namespaceURI, 'path');
                const x = a.x + (drag.branch === 'Да' ? 170 : 85);
                const y = a.y + (drag.branch === 'Да' ? 38 : 76);
                path.setAttribute('d', `M${x} ${y}L${drag.point.x} ${drag.point.y}`);
                path.setAttribute('class', 'flow-draft-edge'); svg.append(path);
            }
            board.append(menu);
        }
        function removeSelected() {
            const doc = current()?.document; if (!doc) { return; }
            if (selectedEdge !== undefined) { doc.edges.splice(selectedEdge, 1); selectedEdge = undefined; }
            else if (selected) {
                doc.nodes = doc.nodes.filter((node) => node.id !== selected);
                doc.edges = doc.edges.filter((edge) => edge.from !== selected && edge.to !== selected); selected = undefined;
            } else { return; }
            commit(); render();
        }
        function renderInspector() {
            inspector.replaceChildren(); const doc = current()?.document;
            const node = doc?.nodes.find((item) => item.id === selected);
            if (selectedEdge !== undefined) {
                inspector.append(element('h2', 'Стрелка'), button('Удалить стрелку', removeSelected)); return;
            }
            if (!node) {
                inspector.append(element('h2', 'Редактор'), element('p', 'ПКМ по пустому месту → Создать блок. Выберите блок, чтобы задать его действие. Потяните синий кружок к другому блоку, чтобы соединить их.'));
                const quick = element('div', undefined, 'flow-touch-create'); quick.append(element('strong', 'Добавить блок'));
                for (const [key, name] of Object.entries(names)) {
                    quick.append(button(name, () => add(key, { x: 270, y: 150 + (doc?.nodes.length || 0) % 5 * 130 })));
                }
                inspector.append(quick); return;
            }
            inspector.append(element('h2', names[node.type])); node.config ??= {};
            function edit(label, key, initial = '', options) {
                const f = options ? select(label, options, node.config[key] ?? initial) : field(label, node.config[key] ?? initial);
                f.input.maxLength = 240;
                f.input.addEventListener('input', () => {
                    node.config[key] = f.input.value;
                    if (node.type === 'input') { node.text = 'Ввод: ' + node.config.variable; }
                    if (node.type === 'process') {
                        const c = node.config; node.text = c.variable + ' = ' + (c.operation === 'expression' ? c.expression
                            : ['+', '-', '*', '/', '^', '%'].includes(c.operation) ? c.left + ' ' + c.operation + ' ' + c.right
                                : c.operation + '(' + c.left + ')');
                    }
                    if (node.type === 'decision') { node.text = node.config.left + ' ' + node.config.operator + ' ' + node.config.right; }
                    if (node.type === 'output') { node.text = 'Вывод: ' + node.config.expression; }
                    commit(); renderCanvas();
                });
                inspector.append(f.label); return f;
            }
            if (node.type === 'input') {
                edit('Переменные через запятую', 'variable', 'a');
                inspector.append(element('p', 'Например: a, b, radius. При запуске схема запросит их значения.', 'tool-help'));
            }
            if (node.type === 'process') {
                edit('Переменная результата', 'variable', 'b');
                edit('Операция', 'operation', 'expression', [['expression', 'Выражение'], ['+', 'Сложение'], ['-', 'Вычитание'],
                    ['*', 'Умножение'], ['/', 'Деление'], ['^', 'Степень'], ['%', 'Остаток'], ['sqrt', 'Корень'],
                    ['sin', 'Синус'], ['cos', 'Косинус'], ['tan', 'Тангенс'], ['ln', 'Натуральный логарифм'],
                    ['log', 'Десятичный логарифм'], ['exp', 'Экспонента'], ['abs', 'Модуль']]);
                edit('Выражение', 'expression', 'a * 2'); edit('Первый аргумент', 'left', 'a'); edit('Второй аргумент', 'right', '2');
                const update = () => {
                    const mode = node.config.operation || 'expression';
                    inspector.querySelectorAll('label').forEach((label) => {
                        const text = label.firstChild?.textContent;
                        if (text === 'Выражение') { label.hidden = mode !== 'expression'; }
                        if (text === 'Первый аргумент') { label.hidden = mode === 'expression'; }
                        if (text === 'Второй аргумент') { label.hidden = !['+', '-', '*', '/', '^', '%'].includes(mode); }
                    });
                };
                inspector.querySelector('select').addEventListener('input', update); update();
            }
            if (node.type === 'decision') {
                edit('Слева', 'left', 'a'); edit('Сравнение', 'operator', '>', ['>', '<', '>=', '<=', '==', '!='].map((s) => [s, s]));
                edit('Справа', 'right', '0'); inspector.append(element('p', 'У условия две стрелки: «Да» и «Нет».', 'tool-help'));
            }
            if (node.type === 'output') { edit('Вывести значение выражения', 'expression', 'b'); }
            if (['start', 'end'].includes(node.type)) {
                const text = field('Подпись', node.text); text.input.addEventListener('input', () => {
                    node.text = text.input.value.slice(0, 300); commit(); renderCanvas();
                }); inspector.append(text.label);
            }
            inspector.append(button('Удалить блок', removeSelected));
        }
        board.addEventListener('contextmenu', (event) => {
            event.preventDefault(); if (!current()) { create(); }
            const node = event.target.closest('[data-node]'); selected = node?.dataset.node; selectedEdge = undefined;
            menuPoint = point(event); menu.replaceChildren(); menu.hidden = false;
            const rect = board.getBoundingClientRect();
            menu.style.left = Math.max(0, Math.min(board.clientWidth - 190, event.clientX - rect.left + board.scrollLeft)) + 'px';
            menu.style.top = Math.max(0, event.clientY - rect.top + board.scrollTop) + 'px';
            const types = element('div'); types.hidden = true;
            for (const [key, name] of Object.entries(names)) { types.append(button(name, () => add(key, menuPoint))); }
            menu.append(button('Создать блок', () => { types.hidden = !types.hidden; }), types);
            if (selected) { menu.append(button('Удалить блок', removeSelected)); }
            board.append(menu); renderInspector();
        });
        board.addEventListener('pointerdown', (event) => {
            if (!current() || event.button !== 0 || event.target.closest('.flow-context-menu')) { return; }
            menu.hidden = true; const port = event.target.closest('[data-port]'); const group = event.target.closest('[data-node]');
            const p = point(event); board.setPointerCapture(event.pointerId);
            if (port) { drag = { kind: 'edge', from: port.dataset.port, branch: port.dataset.branch, point: p }; }
            else if (group) {
                selected = group.dataset.node; selectedEdge = undefined;
                const node = current().document.nodes.find((item) => item.id === selected);
                drag = { kind: 'node', node, x: p.x, y: p.y, nx: node.x, ny: node.y }; renderInspector();
            } else {
                selected = undefined; const edge = event.target.closest('[data-edge]');
                selectedEdge = edge ? Number(edge.dataset.edge) : undefined; renderInspector();
            }
            renderCanvas();
        });
        board.addEventListener('pointermove', (event) => {
            if (!drag) { return; } const p = point(event);
            if (drag.kind === 'node') {
                drag.node.x = Math.max(5, Math.min(1020, drag.nx + p.x - drag.x));
                drag.node.y = Math.max(5, Math.min(900, drag.ny + p.y - drag.y));
            } else { drag.point = p; }
            renderCanvas();
        });
        board.addEventListener('pointerup', (event) => {
            if (!drag) { return; } const action = drag; drag = null;
            if (action.kind === 'node') { commit(); }
            else {
                const p = point(event); const doc = current().document;
                const target = [...doc.nodes].reverse().find((node) => p.x >= node.x - 10 && p.x <= node.x + 180
                    && p.y >= node.y - 10 && p.y <= node.y + 86);
                if (target) {
                    doc.edges = doc.edges.filter((edge) => edge.from !== action.from || edge.label !== action.branch);
                    doc.edges.push({ from: action.from, to: target.id, label: action.branch }); commit();
                }
            }
            renderCanvas();
        });
        board.addEventListener('pointercancel', () => { if (drag?.kind === 'node') { commit(); } drag = null; renderCanvas(); });
        board.addEventListener('keydown', (event) => {
            if (event.key === 'Delete') { event.preventDefault(); removeSelected(); }
            if (event.key === 'Escape') { menu.hidden = true; drag = null; renderCanvas(); }
        });
        document.addEventListener('pointerdown', (event) => { if (!board.contains(event.target)) { menu.hidden = true; } });
        function render() {
            picker.input.replaceChildren(...items.map((item) => new Option(item.document.title, item.id)));
            if (!current()) { active = items[0]?.id; }
            picker.input.value = active || ''; title.input.value = current()?.document.title || '';
            renderCanvas(); renderInspector();
        }
        picker.input.addEventListener('change', () => { stop(); active = picker.input.value; selected = undefined; render(); });
        title.input.addEventListener('input', () => {
            if (current()) { current().document.title = title.input.value.slice(0, 120); commit(); }
        });
        const file = element('input'); file.type = 'file'; file.accept = '.csuflow,.json,application/json'; file.hidden = true;
        file.addEventListener('change', async () => {
            try {
                const source = file.files[0]; if (!source) { return; }
                if (source.size > 500000) { throw new Error('Размер файла превышает 500 КБ.'); }
                const document = T.validateFlow(JSON.parse((await source.text()).replace(/^\uFEFF/, '')));
                const item = { id: id(), document }; items.push(item); active = item.id; selected = undefined; commit(); render();
            } catch (e) { say(e.message); } finally { file.value = ''; }
        });
        function showRun() {
            variables.textContent = Object.entries(runner.variables).map(([key, value]) => key + ' = ' + value).join('\n') || 'Переменных пока нет';
            output.replaceChildren(...runner.output.map((item) => element('p', item.label + ' = ' + item.value)));
            renderCanvas();
            if (runner.done) { runStatus.textContent = 'Готово · шагов: ' + runner.steps; }
            if (runner.waiting) {
                runStatus.textContent = 'Ожидается ввод'; inputPanel.replaceChildren();
                for (const name of runner.waiting.variables) {
                    const f = field('Значение ' + name); f.input.name = name; f.input.inputMode = 'decimal'; inputPanel.append(f.label);
                }
                const send = element('button', 'Продолжить', 'primary'); send.type = 'submit'; inputPanel.append(send);
            } else { inputPanel.replaceChildren(); }
        }
        function advance(continuous) {
            const token = ++generation;
            function chunk() {
                if (token !== generation || !runner || runner.done || runner.waiting) { return; }
                try {
                    let count = 0;
                    do { runner.step(); count += 1; } while (continuous && count < 50 && !runner.done && !runner.waiting);
                    runStatus.textContent = 'Шаг ' + runner.steps; showRun();
                    if (continuous && !runner.done && !runner.waiting) { setTimeout(chunk, 16); }
                } catch (e) { generation += 1; runStatus.textContent = 'Ошибка: ' + e.message; showRun(); }
            }
            chunk();
        }
        let continuous = true;
        inputPanel.addEventListener('submit', (event) => {
            event.preventDefault();
            try {
                const values = Object.fromEntries(new FormData(inputPanel)); runner.provide(values); showRun(); advance(continuous);
            } catch (e) { runStatus.textContent = e.message; }
        });
        const run = () => {
            stop(); if (!current()) { throw new Error('Создайте схему.'); }
            runner = new window.StudyFlow.Runner(current().document); continuous = true; showRun(); advance(true);
        };
        const step = () => {
            generation += 1;
            if (!runner || runner.done) { runner = new window.StudyFlow.Runner(current()?.document); }
            continuous = false; advance(false);
        };
        const exports = element('details'); exports.append(element('summary', 'Файлы'));
        exports.append(row(button('Открыть файл', () => file.click()), button('Сохранить файл', () => {
            if (!current()) { throw new Error('Создайте схему.'); }
            exportFile('flowchart.csuflow', 'application/json', JSON.stringify(T.validateFlow(current().document), null, 2));
        }), button('Экспорт SVG', () => {
            if (!current()) { throw new Error('Создайте схему.'); }
            exportFile('flowchart.svg', 'image/svg+xml', T.flowSvg(current().document));
        }), button('Экспорт PNG', async () => {
            if (!current()) { throw new Error('Создайте схему.'); }
            const url = URL.createObjectURL(new Blob([T.flowSvg(current().document)], { type: 'image/svg+xml' }));
            try {
                const image = new Image(); const loaded = new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; });
                image.src = url; await loaded; const canvas = document.createElement('canvas'); canvas.width = 1220; canvas.height = 1020;
                canvas.getContext('2d').drawImage(image, 0, 0); exportFile('flowchart.png', 'image/png', canvas.toDataURL('image/png'));
            } finally { URL.revokeObjectURL(url); }
        })));
        const layout = element('div', undefined, 'flow-workbench'); layout.append(board, inspector);
        const variableSection = element('section'); variableSection.append(element('h3', 'Переменные'), variables);
        const outputSection = element('section'); outputSection.append(element('h3', 'Вывод'), output);
        consolePanel.append(runStatus, inputPanel, variableSection, outputSection);
        root.append(row(button('Новая схема', create), button('Запустить', run, 'primary'), button('Шаг', step),
            button('Стоп', () => { stop(); renderCanvas(); })), bar.node, row(picker.label, title.label, exports), file, layout, consolePanel);
        new MutationObserver(renderCanvas).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        render();
    }
    window.StudyFlowEditor = { flowcharts };
})();
