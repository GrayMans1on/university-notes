(() => {
    'use strict';
    function flowcharts(root) {
        const { element, field, select, button, row, historyBar, say, exportFile, id } = window.StudyToolUI;
        const T = window.StudyTools; const W = window.StudyWorkspace;
        let items = W.read().flows; let active = items[0]?.id; let selected; let selectedEdge;
        let view = { x: 355, y: 240, scale: 1 }; const pointers = new Map(); let pinch; let pendingConnection;
        let runner; let generation = 0; let drag; let menuPoint = { x: 100, y: 100 };
        const names = { start: 'Начало', input: 'Ввод', process: 'Вычисление', decision: 'Условие', output: 'Вывод', end: 'Конец' };
        const history = new T.History(items); const picker = select('Схемы этой вкладки', []);
        const title = field('Название схемы'); const board = element('div', undefined, 'flow-board');
        board.tabIndex = 0; board.setAttribute('aria-label', 'Полотно блок-схемы');
        const inspector = element('aside', undefined, 'flow-inspector'); const consolePanel = element('div', undefined, 'flow-console');
        const runStatus = element('p', 'Схема не запущена', 'flow-run-status');
        const variables = element('pre', '', 'flow-variables'); const output = element('div'); const inputPanel = element('form');
        const menu = element('div', undefined, 'flow-context-menu'); menu.hidden = true;
        menu.setAttribute('role', 'menu');
        const current = () => items.find((item) => item.id === active);
        const session = window.StudySessions.files(root, {
            filename: 'flowchart.csuflow', extension: '.csuflow',
            get: () => {
                if (!current()) { throw new Error('Создайте схему.'); }
                return { ...current().document, viewport: { ...view } };
            }, validate: T.validateFlow,
            set: (document) => {
                const item = { id: id(), document }; items = [item]; active = item.id; selected = undefined;
                view = document.viewport || fitView(document); W.save('flows', items); history.push(items); bar.update(); render();
            }, legacy: () => W.legacy('flows').map((item) => ({ title: item.document.title, value: item.document })),
        });
        const bar = historyBar(history, (value) => { stop(); items = value; W.save('flows', items); session.changed(); render(); });
        function stop() {
            generation += 1;
            if (runner && !runner.done) { runStatus.textContent = 'Выполнение остановлено'; }
            runner = null; inputPanel.replaceChildren();
        }
        function commit() {
            stop(); if (current()) { current().document.viewport = { ...view }; }
            W.save('flows', items); history.push(items); bar.update(); session.changed(); say('Изменения находятся в памяти вкладки.');
        }
        function create() {
            const document = { format: 'csu-flowchart', version: 1, title: 'Новая схема',
                nodes: [{ id: id(), type: 'start', text: 'Начало', x: 270, y: 30 }], edges: [] };
            const item = { id: id(), document }; items = [item]; active = item.id; selected = undefined; view = { x: 355, y: 240, scale: 1 };
            commit(); render();
        }
        function add(type, point) {
            if (!current()) { create(); }
            const doc = current().document;
            if (doc.nodes.length >= 100) { throw new Error('В схеме доступно до 100 блоков.'); }
            const config = type === 'input' ? { variable: 'a' } : type === 'process'
                ? { program: 'b = a * 2' }
                : type === 'decision' ? { left: 'a', operator: '>', right: '0' }
                    : type === 'output' ? { expression: 'b' } : {};
            const node = { id: id(), type, text: names[type], x: Math.max(-1e9, Math.min(1e9, point.x - 85)),
                y: Math.max(-1e9, Math.min(1e9, point.y)), config };
            doc.nodes.push(node);
            if (pendingConnection) { connect(pendingConnection.from, node.id, pendingConnection.branch); pendingConnection = null; }
            selected = node.id; selectedEdge = undefined; menu.hidden = true; commit(); render();
        }
        function dimensions() {
            const rect = board.getBoundingClientRect();
            return { width: board.clientWidth || rect.width || 800, height: board.clientHeight || rect.height || 600, rect };
        }
        function point(event) {
            const { width, height, rect } = dimensions();
            return { x: view.x + (event.clientX - rect.left - width / 2) / view.scale,
                y: view.y + (event.clientY - rect.top - height / 2) / view.scale };
        }
        function fitView(doc) {
            const bounds = T.flowBounds(doc); const { width, height } = dimensions();
            return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2,
                scale: Math.max(.03, Math.min(2, width / bounds.width, height / bounds.height)) };
        }
        function cameraChanged() {
            if (current()) { current().document.viewport = { ...view }; session.changed(); }
            renderCanvas();
        }
        function zoom(factor, event) {
            const anchor = event ? point(event) : { x: view.x, y: view.y };
            const scale = Math.max(.03, Math.min(6, view.scale * factor));
            view.x = anchor.x - (anchor.x - view.x) * view.scale / scale;
            view.y = anchor.y - (anchor.y - view.y) * view.scale / scale; view.scale = scale; cameraChanged();
        }
        function connect(from, to, branch) {
            const doc = current().document;
            doc.edges = doc.edges.filter((edge) => edge.from !== from || T.branchKey(edge.label) !== T.branchKey(branch));
            if (doc.edges.length >= 200) { throw new Error('В схеме доступно до 200 стрелок.'); }
            doc.edges.push({ from, to, label: branch });
        }
        function renderCanvas() {
            const doc = current()?.document;
            if (!doc) { board.replaceChildren(element('p', 'Создайте схему или откройте сохранённый файл.')); return; }
            const { width, height } = dimensions();
            board.innerHTML = T.flowSvg(doc, document.documentElement.dataset.theme === 'dark', {
                x: view.x - width / 2 / view.scale, y: view.y - height / 2 / view.scale,
                width: width / view.scale, height: height / view.scale });
            const svg = board.firstElementChild;
            for (const group of svg.querySelectorAll('[data-node]')) {
                const node = doc.nodes.find((item) => item.id === group.dataset.node);
                group.classList.toggle('selected', node.id === selected);
                group.classList.toggle('executing', node.id === runner?.current?.id);
                const ports = node.type === 'decision' ? [[0, 38, 'true'], [170, 38, 'false']] : node.type === 'end' ? [] : [[85, 76, '']];
                for (const [x, y, branch] of ports) {
                    const port = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                    port.setAttribute('cx', x); port.setAttribute('cy', y); port.setAttribute('r', Math.min(22, Math.max(7, 8 / view.scale)));
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
                const x = a.x + (a.type === 'decision' ? drag.branch === 'true' ? 0 : 170 : 85);
                const y = a.y + (a.type === 'decision' ? 38 : 76);
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
                inspector.append(element('h2', 'Редактор'), element('p', 'ПКМ → Создать блок. Стрелка в пустое место предлагает новый блок. Перетаскивайте пустое полотно; колесо меняет масштаб. Shift + перетаскивание перемещает полотно поверх блока.'));
                const quick = element('div', undefined, 'flow-touch-create'); quick.append(element('strong', 'Добавить блок'));
                for (const [key, name] of Object.entries(names)) {
                    const item = button(name, () => add(key, { x: view.x, y: view.y }));
                    item.disabled = key === 'start' && doc?.nodes.some((n) => n.type === 'start'); quick.append(item);
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
                const c = node.config; const op = c.operation || 'expression';
                const old = op === 'expression' ? c.expression || '' : ['+', '-', '*', '/', '^', '%'].includes(op)
                    ? (c.left || '') + ' ' + (op === '^' ? '**' : op) + ' ' + (c.right || '') : op + '(' + c.left + ')';
                const program = field('Команды, по одной на строку', c.program ?? ((c.variable || 'b') + ' = ' + old), 'textarea');
                program.input.maxLength = 6000; program.input.spellcheck = false; program.input.classList.add('flow-program');
                program.input.addEventListener('input', () => {
                    c.program = program.input.value; node.text = c.program.slice(0, 300) || 'Действия'; commit(); renderCanvas();
                });
                inspector.append(program.label, element('pre', 'a = a * 2\nb = b * 10 + x\ns = n % 100', 'flow-program-example'),
                    element('p', '+, −, *, /, //, %, **, сокращённые присваивания и числовые функции. Команды выполняются сверху вниз; циклы задаются стрелками.', 'tool-help'));
            }
            if (node.type === 'decision') {
                edit('Слева', 'left', 'a'); edit('Сравнение', 'operator', '>', ['>', '<', '>=', '<=', '==', '!='].map((s) => [s, s]));
                edit('Справа', 'right', '0'); inspector.append(element('p', 'true — слева; false — справа.', 'tool-help'));
            }
            if (node.type === 'output') { edit('Вывести значение выражения', 'expression', 'b'); }
            if (['start', 'end'].includes(node.type)) {
                const text = field('Подпись', node.text); text.input.addEventListener('input', () => {
                    node.text = text.input.value.slice(0, 300); commit(); renderCanvas();
                }); inspector.append(text.label);
            }
            inspector.append(button('Удалить блок', removeSelected));
        }
        function openMenu(event, connection = null) {
            menuPoint = point(event); pendingConnection = connection; menu.replaceChildren(); menu.hidden = false;
            const { width, height, rect } = dimensions();
            menu.style.left = Math.max(0, Math.min(width - 195, event.clientX - rect.left)) + 'px';
            menu.style.top = Math.max(0, Math.min(height - 330, event.clientY - rect.top)) + 'px';
            const types = element('div'); types.hidden = !connection;
            for (const [key, name] of Object.entries(names)) {
                const item = button(name, () => add(key, menuPoint));
                item.disabled = key === 'start' && current()?.document.nodes.some((node) => node.type === 'start'); types.append(item);
            }
            menu.append(button(connection ? 'Создать блок и соединить' : 'Создать блок', () => { types.hidden = !types.hidden; }), types);
            if (selected && !connection) { menu.append(button('Удалить блок', () => { menu.hidden = true; removeSelected(); })); }
            board.append(menu);
        }
        board.addEventListener('contextmenu', (event) => {
            event.preventDefault(); if (!current()) { create(); }
            selected = event.target.closest('[data-node]')?.dataset.node; selectedEdge = undefined; openMenu(event); renderInspector();
        });
        board.addEventListener('wheel', (event) => {
            if (!current()) { return; } event.preventDefault();
            zoom(Math.exp(-Math.max(-300, Math.min(300, event.deltaY)) * .002), event);
        }, { passive: false });
        board.addEventListener('pointerdown', (event) => {
            if (!current() || ![0, 1].includes(event.button) || event.target.closest('.flow-context-menu')) { return; }
            event.preventDefault(); board.focus(); menu.hidden = true; pendingConnection = null;
            pointers.set(event.pointerId, { x: event.clientX, y: event.clientY }); board.setPointerCapture(event.pointerId);
            if (pointers.size === 2) {
                const [a, b] = [...pointers.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); drag = null; return;
            }
            const port = event.target.closest('[data-port]'); const group = event.target.closest('[data-node]'); const p = point(event);
            if (port && !event.shiftKey) { drag = { kind: 'edge', from: port.dataset.port, branch: port.dataset.branch, point: p }; }
            else if (group && !event.shiftKey && event.button === 0) {
                selected = group.dataset.node; selectedEdge = undefined;
                const node = current().document.nodes.find((item) => item.id === selected);
                drag = { kind: 'node', node, x: p.x, y: p.y, nx: node.x, ny: node.y }; renderInspector();
            } else {
                selected = undefined; const edge = event.target.closest('[data-edge]');
                selectedEdge = edge ? Number(edge.dataset.edge) : undefined;
                drag = { kind: 'pan', x: event.clientX, y: event.clientY, view: { ...view } }; renderInspector();
            }
            renderCanvas();
        });
        board.addEventListener('pointermove', (event) => {
            if (!pointers.has(event.pointerId)) { return; }
            pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
            if (pointers.size === 2) {
                const [a, b] = [...pointers.values()]; const distance = Math.hypot(a.x - b.x, a.y - b.y);
                if (pinch > 0) { zoom(distance / pinch, { clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 }); }
                pinch = distance; return;
            }
            if (!drag) { return; } const p = point(event);
            if (drag.kind === 'node') {
                drag.node.x = Math.max(-1e9, Math.min(1e9, drag.nx + p.x - drag.x));
                drag.node.y = Math.max(-1e9, Math.min(1e9, drag.ny + p.y - drag.y));
            } else if (drag.kind === 'pan') {
                view.x = drag.view.x - (event.clientX - drag.x) / view.scale;
                view.y = drag.view.y - (event.clientY - drag.y) / view.scale; cameraChanged();
            } else { drag.point = p; }
            renderCanvas();
        });
        board.addEventListener('pointerup', (event) => {
            pointers.delete(event.pointerId); pinch = null;
            if (!drag) { return; } const action = drag; drag = null;
            if (action.kind === 'node') { commit(); }
            else if (action.kind === 'edge') {
                const p = point(event); const doc = current().document;
                const target = [...doc.nodes].reverse().find((node) => p.x >= node.x - 10 && p.x <= node.x + 180
                    && p.y >= node.y - 12 && p.y <= node.y + 86);
                if (target) { connect(action.from, target.id, action.branch); commit(); }
                else { openMenu(event, action); }
            }
            renderCanvas();
        });
        board.addEventListener('pointercancel', (event) => {
            pointers.delete(event.pointerId); if (drag?.kind === 'node') { commit(); } drag = null; renderCanvas();
        });
        board.addEventListener('dblclick', (event) => {
            if (!event.target.closest('[data-node]') && current()) { view = fitView(current().document); cameraChanged(); }
        });
        board.addEventListener('keydown', (event) => {
            if (event.key === 'Delete') { event.preventDefault(); removeSelected(); }
            if (event.key === 'Escape') { menu.hidden = true; pendingConnection = null; drag = null; renderCanvas(); }
            const movement = { ArrowLeft: [-50, 0], ArrowRight: [50, 0], ArrowUp: [0, -50], ArrowDown: [0, 50] };
            if (movement[event.key]) {
                event.preventDefault(); view.x += movement[event.key][0] / view.scale;
                view.y += movement[event.key][1] / view.scale; cameraChanged();
            }
        });
        document.addEventListener('pointerdown', (event) => { if (!board.contains(event.target)) { menu.hidden = true; pendingConnection = null; } });
        function render() {
            picker.input.replaceChildren(...items.map((item) => new Option(item.document.title, item.id)));
            if (!current()) { active = items[0]?.id; }
            picker.input.value = active || ''; title.input.value = current()?.document.title || '';
            renderCanvas(); renderInspector();
        }
        picker.input.addEventListener('change', () => { stop(); active = picker.input.value; selected = undefined; view = current()?.document.viewport || fitView(current().document); render(); });
        title.input.addEventListener('input', () => {
            if (current()) { current().document.title = title.input.value.slice(0, 120); commit(); }
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
        const exports = element('details'); exports.append(element('summary', 'Экспорт изображения и кода'));
        exports.append(row(button('Python .py', () => {
            if (!current()) { throw new Error('Создайте схему.'); }
            exportFile('flowchart.py', 'text/x-python', window.StudyFlowExport.code(current().document, 'python'));
        }), button('C# .cs', () => {
            if (!current()) { throw new Error('Создайте схему.'); }
            exportFile('Program.cs', 'text/plain', window.StudyFlowExport.code(current().document, 'csharp'));
        })));
        exports.append(row(button('Экспорт SVG', () => {
            if (!current()) { throw new Error('Создайте схему.'); }
            exportFile('flowchart.svg', 'image/svg+xml', T.flowSvg(current().document));
        }), button('Экспорт PNG', async () => {
            if (!current()) { throw new Error('Создайте схему.'); }
            const url = URL.createObjectURL(new Blob([T.flowSvg(current().document)], { type: 'image/svg+xml' }));
            try {
                const image = new Image(); const loaded = new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; });
                image.src = url; await loaded; const canvas = document.createElement('canvas'); const bounds = T.flowBounds(current().document);
                const factor = Math.min(2, 4096 / Math.max(bounds.width, bounds.height));
                canvas.width = Math.max(1, Math.ceil(bounds.width * factor)); canvas.height = Math.max(1, Math.ceil(bounds.height * factor));
                canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height); exportFile('flowchart.png', 'image/png', canvas.toDataURL('image/png'));
            } finally { URL.revokeObjectURL(url); }
        })));
        const layout = element('div', undefined, 'flow-workbench'); layout.append(board, inspector);
        const variableSection = element('section'); variableSection.append(element('h3', 'Переменные'), variables);
        const outputSection = element('section'); outputSection.append(element('h3', 'Вывод'), output);
        consolePanel.append(runStatus, inputPanel, variableSection, outputSection);
        root.append(row(button('Новая схема', () => session.replace(create)), button('Запустить', run, 'primary'), button('Шаг', step),
            button('Стоп', () => { stop(); renderCanvas(); }), button('+', () => zoom(1.3)), button('−', () => zoom(1 / 1.3)),
            button('Показать всё', () => { if (current()) { view = fitView(current().document); cameraChanged(); } })), bar.node, row(title.label, exports), layout, consolePanel);
        new MutationObserver(renderCanvas).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        new ResizeObserver(renderCanvas).observe(board); render();
    }
    window.StudyFlowEditor = { flowcharts };
})();
