(() => {
    'use strict';
    const D = window.StudyDiscrete;
    const namespace = 'http://www.w3.org/2000/svg';
    function svgNode(tag, attributes = {}, text) {
        const node = document.createElementNS(namespace, tag);
        for (const [name, value] of Object.entries(attributes)) { node.setAttribute(name, String(value)); }
        if (text !== undefined) { node.textContent = text; } return node;
    }
    const setText = (values) => '{' + values.join(', ') + '}';
    const pairText = (pairs) => pairs.map(([a, b]) => '(' + a + ', ' + b + ')').join(', ');
    function accessible(node, label, action) {
        node.setAttribute('role', 'button'); node.setAttribute('tabindex', '0'); node.setAttribute('aria-label', label);
        node.addEventListener('click', action);
        node.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); action(); }
        });
    }
    function diagram(label, width = 680, height = 480) {
        const node = svgNode('svg', { viewBox: `0 0 ${width} ${height}`, class: 'discrete-diagram', 'aria-label': label });
        node.append(svgNode('title', {}, label)); return node;
    }
    function saveSvg(node, name) {
        const copy = node.cloneNode(true); copy.setAttribute('xmlns', namespace);
        const style = svgNode('style', {}, '.discrete-edge{fill:none;stroke:#4668c4;stroke-width:2}.discrete-node{fill:#edf2ff;stroke:#4668c4;stroke-width:2}.discrete-label{fill:#182333;font:14px sans-serif;text-anchor:middle}.discrete-dot{fill:#254cce}.discrete-empty{fill:#8992a4;opacity:.15}.discrete-grid{stroke:#cbd2df;stroke-width:1}');
        copy.prepend(style); copy.querySelectorAll('[tabindex]').forEach((item) => item.removeAttribute('tabindex'));
        window.StudyToolUI.exportFile(name, 'image/svg+xml', new XMLSerializer().serializeToString(copy));
    }
    function source(root) {
        const link = window.StudyToolUI.element('a', 'Множества и отношения в конспекте', 'limit-source');
        link.href = '/notes/discrete-math/'; root.append(link);
    }
    function relations(root) {
        const { element, field, select, button, row, say, historyBar } = window.StudyToolUI;
        let state = { format: 'csu-relations', version: 1, universe: [], R: [], S: [], mode: 'list', active: 'R' };
        let selected = null;
        const history = new window.StudyTools.History(state);
        const universe = field('Универсум U', ''); universe.input.placeholder = '1, 2, 3, 4 или a, b, c';
        const active = select('Редактировать отношение', [['R', 'R'], ['S', 'S']], 'R');
        const mode = select('Представление', [['list', 'Список'], ['matrix', 'Матрица'], ['graph', 'Граф'], ['plot', 'График']], 'list');
        const pairs = field('Пары отношения', '', 'textarea'); pairs.input.placeholder = '(1, 2), (2, 3)'; pairs.input.spellcheck = false;
        const view = element('section', undefined, 'relation-view');
        const info = element('section', undefined, 'relation-properties'); info.setAttribute('aria-live', 'polite');
        const from = select('Первый элемент пары', [], ''); const to = select('Второй элемент пары', [], '');
        const operation = select('Операция над отношениями', [
            ['union', 'R ∪ S'], ['intersection', 'R ∩ S'], ['difference', 'R \\ S'], ['xor', 'R △ S'],
            ['inverse', 'R⁻¹'], ['complement', 'Дополнение R в U × U'], ['compose', 'R ∘ S: сначала R, затем S'],
            ['reverse', 'S ∘ R: сначала S, затем R'], ['square', 'R²'],
        ], 'union');
        const preview = element('p', '', 'relation-operation-preview');
        const workspace = element('div', undefined, 'discrete-workspace');
        function readPairs() {
            if (state.mode !== 'list') { return; }
            const parsed = D.parsePairs(pairs.input.value, state.universe);
            if (JSON.stringify(parsed) !== JSON.stringify(state[state.active])) {
                state[state.active] = parsed; history.push(state); session.changed();
            }
        }
        const session = window.StudySessions.files(root, { filename: 'relation.csurelation', extension: '.csurelation',
            get: () => {
                if (JSON.stringify(D.universe(universe.input.value)) !== JSON.stringify(state.universe)) { throw new Error('Сначала нажмите «Задать универсум».'); }
                readPairs(); return state;
            }, validate: (data) => D.document(data, 'relations'),
            set: (data) => { state = data; history.push(state); selected = null; render(); } });
        const undo = historyBar(history, (value) => { state = value; selected = null; session.changed(); render(); });
        function commit() { history.push(state); session.changed(); undo.update(); render(); }
        function changePair(a, b, present) {
            const next = state[state.active].filter(([x, y]) => x !== a || y !== b);
            if (present) { next.push([a, b]); }
            state[state.active] = D.normalize(state.universe, next); commit();
        }
        function toggle(i, j) {
            const [a, b] = [state.universe[i], state.universe[j]];
            const exists = state[state.active].some(([x, y]) => x === a && y === b); changePair(a, b, !exists);
        }
        function renderMatrix() {
            const table = element('table', undefined, 'relation-matrix'); table.append(element('caption', 'Строка — первый элемент, столбец — второй'));
            const head = element('tr'); head.append(element('th', '→'));
            for (const v of state.universe) { const th = element('th', v); th.scope = 'col'; head.append(th); } table.append(head);
            const matrix = D.matrix(state.universe, state[state.active]);
            matrix.forEach((values, i) => {
                const tr = element('tr'); const th = element('th', state.universe[i]); th.scope = 'row'; tr.append(th);
                values.forEach((value, j) => {
                    const cell = element('td'); const control = button(String(value), () => toggle(i, j), value ? 'relation-present' : '');
                    control.setAttribute('aria-label', `Пара (${state.universe[i]}, ${state.universe[j]})`);
                    control.setAttribute('aria-pressed', String(Boolean(value))); cell.append(control); tr.append(cell);
                }); table.append(tr);
            }); view.append(table);
        }
        function renderGraph() {
            const svg = diagram('Ориентированный граф отношения ' + state.active);
            const defs = svgNode('defs'); const marker = svgNode('marker', { id: 'relation-arrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto' });
            marker.append(svgNode('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: 'currentColor' })); defs.append(marker); svg.append(defs);
            const n = state.universe.length;
            const positions = state.universe.map((_, i) => [340 + (n === 1 ? 0 : 185 * Math.cos(2 * Math.PI * i / n - Math.PI / 2)),
                245 + (n === 1 ? 0 : 175 * Math.sin(2 * Math.PI * i / n - Math.PI / 2))]);
            for (const [a, b] of state[state.active]) {
                const i = state.universe.indexOf(a); const j = state.universe.indexOf(b); const [x, y] = positions[i]; const [u, v] = positions[j];
                const distance = Math.hypot(u - x, v - y); const dx = (u - x) / (distance || 1); const dy = (v - y) / (distance || 1);
                const path = i === j ? `M ${x - 15} ${y - 15} C ${x - 65} ${y - 75}, ${x + 65} ${y - 75}, ${x + 17} ${y - 16}`
                    : `M ${x + dx * 24} ${y + dy * 24} Q ${(x + u) / 2 - dy * 28} ${(y + v) / 2 + dx * 28}, ${u - dx * 27} ${v - dy * 27}`;
                const edge = svgNode('path', { d: path, class: 'discrete-edge', 'marker-end': 'url(#relation-arrow)' });
                accessible(edge, `Удалить пару (${a}, ${b})`, () => changePair(a, b, false)); svg.append(edge);
            }
            state.universe.forEach((value, i) => {
                const [x, y] = positions[i]; const group = svgNode('g', { class: 'discrete-vertex', 'data-selected': selected === i });
                group.append(svgNode('circle', { cx: x, cy: y, r: 23, class: 'discrete-node' }), svgNode('text', { x, y: y + 5, class: 'discrete-label' }, value.length > 8 ? value.slice(0, 7) + '…' : value));
                accessible(group, 'Вершина ' + value, () => {
                    if (selected === null) { selected = i; render(); say('Начало: ' + value + '. Выберите конечную вершину, включая ту же для петли.'); }
                    else { const start = selected; selected = null; toggle(start, i); say('Пара переключена.'); }
                }); svg.append(group);
            }); view.append(svg, button('Скачать граф SVG', () => saveSvg(svg, 'relation-graph.svg')));
        }
        function renderPlot() {
            const svg = diagram('График отношения ' + state.active, 680, 560); const values = state.universe;
            const numeric = values.every((v) => /^[-+]?\d+(?:\.\d+)?$/.test(v) && Number.isFinite(Number(v))) && new Set(values.map(Number)).size === values.length;
            const numbers = numeric ? values.map(Number) : values.map((_, i) => i + 1);
            const min = Math.min(...numbers); const max = Math.max(...numbers); const span = max - min || 1;
            const coord = (i) => 100 + (numbers[i] - min) / span * 470;
            const ordinate = (i) => 480 - (coord(i) - 100) / 470 * 430;
            svg.append(svgNode('text', { x: 640, y: 510, class: 'discrete-label' }, 'x'), svgNode('text', { x: 66, y: 24, class: 'discrete-label' }, 'y'));
            svg.append(svgNode('path', { d: 'M 75 30 V 510 H 650', class: 'discrete-grid', fill: 'none' }));
            values.forEach((value, i) => {
                const x = coord(i); const y = ordinate(i);
                svg.append(svgNode('path', { d: `M ${x} 45 V 510 M 75 ${y} H 630`, class: 'discrete-grid' }));
                svg.append(svgNode('text', { x, y: 535, class: 'discrete-label' }, value.length > 8 ? value.slice(0, 7) + '…' : value),
                    svgNode('text', { x: 40, y: y + 5, class: 'discrete-label' }, value.length > 8 ? value.slice(0, 7) + '…' : value));
            });
            const matrix = D.matrix(values, state[state.active]);
            values.forEach((a, i) => values.forEach((b, j) => {
                const dot = svgNode('circle', { cx: coord(i), cy: ordinate(j), r: 10, class: matrix[i][j] ? 'discrete-dot' : 'discrete-empty', 'aria-pressed': Boolean(matrix[i][j]) });
                accessible(dot, `Точка (${a}, ${b})`, () => toggle(i, j)); dot.append(svgNode('title', {}, `(${a}, ${b})`)); svg.append(dot);
            }));
            view.append(element('p', numeric ? 'Оси используют числовые значения элементов U. Нажатие на узел сетки переключает пару.'
                : 'Оси категориальные: подписи расположены в порядке U. Нажатие переключает пару.', 'tool-help'), svg,
                button('Скачать график SVG', () => saveSvg(svg, 'relation-plot.svg')));
        }
        function renderInfo() {
            const result = D.properties(state.universe, state[state.active]); info.replaceChildren(element('h2', 'Свойства ' + state.active));
            info.append(element('p', 'Область определения: ' + setText(result.domain) + '. Область значений: ' + setText(result.range) + '.'));
            const table = element('table');
            for (const value of result.values) {
                const tr = element('tr'); tr.append(element('th', value.name), element('td', value.holds ? 'Да' : 'Нет'), element('td', value.witness)); table.append(tr);
            }
            info.append(table, element('p', 'Отношение эквивалентности: ' + (result.equivalence ? 'да' : 'нет')));
            if (result.equivalence) { info.append(element('p', 'Классы: ' + result.classes.map(setText).join(', '))); }
        }
        const listApply = row(button('Применить список', () => { readPairs(); render(); say('Пары применены.'); }));
        function render() {
            listApply.hidden = state.mode !== 'list';
            universe.input.value = state.universe.join(', '); active.input.value = state.active; mode.input.value = state.mode;
            workspace.hidden = !state.universe.length; view.replaceChildren();
            if (!state.universe.length) { return; }
            pairs.input.value = pairText(state[state.active]); pairs.label.hidden = state.mode !== 'list';
            for (const control of [from.input, to.input]) {
                const previous = control.value; control.replaceChildren(...state.universe.map((v) => new Option(v, v)));
                if (state.universe.includes(previous)) { control.value = previous; }
            }
            if (state.mode === 'list') { view.append(element('p', 'Число пар: ' + state[state.active].length)); }
            if (state.mode === 'matrix') { renderMatrix(); }
            if (state.mode === 'graph') { renderGraph(); }
            if (state.mode === 'plot') { renderPlot(); }
            preview.textContent = 'Результат операции: ' + setText(D.operate(state.universe, state.R, state.S, operation.input.value).map(([a, b]) => '(' + a + ', ' + b + ')'));
            renderInfo(); undo.update();
        }
        for (const control of [universe.input, pairs.input]) { control.addEventListener('input', () => session.changed()); }
        active.input.addEventListener('change', () => {
            try { readPairs(); state.active = active.input.value; selected = null; commit(); } catch (error) { active.input.value = state.active; say(error.message); }
        });
        mode.input.addEventListener('change', () => {
            try { readPairs(); state.mode = mode.input.value; selected = null; commit(); } catch (error) { mode.input.value = state.mode; say(error.message); }
        });
        operation.input.addEventListener('change', () => { try { readPairs(); render(); } catch (error) { say(error.message); } });
        const applyUniverse = button('Задать универсум', () => {
            readPairs(); const next = D.universe(universe.input.value);
            D.normalize(next, state.R); D.normalize(next, state.S); state.universe = next; selected = null; commit(); say('Универсум задан.');
        }, 'primary');
        workspace.append(row(active.label, mode.label), pairs.label, listApply,
            row(from.label, to.label, button('Добавить пару', () => { readPairs(); changePair(from.input.value, to.input.value, true); }),
                button('Удалить пару', () => { readPairs(); changePair(from.input.value, to.input.value, false); })),
            element('p', 'Граф: выберите начало и конец дуги; повтор той же пары удаляет её. Для петли дважды выберите вершину. Матрица и график редактируются нажатием.', 'tool-help'),
            view, element('details', undefined, 'relation-operations'), info);
        const operations = workspace.querySelector('.relation-operations'); operations.append(element('summary', 'Операции с R и S'), operation.label, preview,
            element('p', 'Дополнение берётся в U × U. В композиции первым выполняется отношение слева, как в конспекте.', 'tool-help'),
            button('Записать результат в R', () => { readPairs(); state.R = D.operate(state.universe, state.R, state.S, operation.input.value); state.active = 'R'; commit(); }));
        root.append(universe.label, row(applyUniverse, button('Пример: делимость на 1–5', async () => {
            await session.replace(() => {
                state = { ...state, universe: ['1', '2', '3', '4', '5'], R: [], S: [], active: 'R' };
                state.R = state.universe.flatMap((a) => state.universe.filter((b) => Number(a) % Number(b) === 0).map((b) => [a, b])); commit();
            });
        })), element('p', 'До 16 элементов. Названия и их порядок сохраняются во всех представлениях. Удаление используемого элемента U отклоняется: сначала измените пары.', 'tool-help'),
            undo.node, workspace); source(root); render();
    }
    function venn(root) {
        const { element, field, select, button, row, say, historyBar } = window.StudyToolUI;
        let state = { format: 'csu-venn', version: 1, universe: [], sets: { A: [], B: [], C: [] }, count: 3, expression: '(A ∪ B) \\ C' };
        let selected = null;
        const universe = field('Универсум U', ''); universe.input.placeholder = '1, 2, 3, 4, 5, 6';
        const count = select('Количество множеств', [['2', 'Два: A, B'], ['3', 'Три: A, B, C']], '3');
        const fields = Object.fromEntries(['A', 'B', 'C'].map((name) => [name, field('Множество ' + name, '')]));
        const expression = field('Выражение над множествами', state.expression);
        const output = element('section', undefined, 'venn-result'); output.setAttribute('aria-live', 'polite');
        const membership = element('details', undefined, 'venn-membership'); membership.append(element('summary', 'Редактировать принадлежность элементов'));
        const members = element('div'); membership.append(members);
        const history = new window.StudyTools.History(state);
        function read() {
            const next = { ...state, universe: D.universe(universe.input.value, 200), count: Number(count.input.value),
                sets: Object.fromEntries(['A', 'B', 'C'].map((name) => [name, D.universe(fields[name].input.value, 200)])), expression: expression.input.value };
            return D.document(next, 'venn');
        }
        const session = window.StudySessions.files(root, { filename: 'diagram.csuvenn', extension: '.csuvenn', get: read,
            validate: (data) => D.document(data, 'venn'), set: (data) => { state = data; selected = null; history.push(state); render(); } });
        const undo = historyBar(history, (value) => { state = value; selected = null; session.changed(); render(); });
        function commit() { history.push(state); session.changed(); undo.update(); render(); }
        function render() {
            universe.input.value = state.universe.join(', '); count.input.value = String(state.count); expression.input.value = state.expression;
            for (const name of ['A', 'B', 'C']) { fields[name].input.value = state.sets[name].join(', '); fields[name].label.hidden = name === 'C' && state.count === 2; }
            output.replaceChildren(); members.replaceChildren();
            const result = D.setExpression(state.expression, state.universe, state.sets);
            output.append(element('h2', 'Результат: ' + setText(result)), element('p', 'Элементов: ' + result.length));
            const svg = diagram('Диаграмма Эйлера — Венна: ' + state.expression, 600, 510);
            const circles = state.count === 3 ? [[230, 195, 140], [370, 195, 140], [300, 320, 140]] : [[230, 250, 155], [370, 250, 155]];
            const defs = svgNode('defs'); const regionSets = Array.from({ length: 1 << state.count }, () => []);
            const indexOf = (value) => ['A', 'B', 'C'].slice(0, state.count).reduce((mask, name, i) => mask | (state.sets[name].includes(value) ? 1 << i : 0), 0);
            state.universe.forEach((v) => regionSets[indexOf(v)].push(v));
            for (let mask = 0; mask < 1 << state.count; mask += 1) {
                circles.forEach(([cx, cy, r], i) => {
                    const id = 'venn-region-' + mask + '-' + i; const layer = svgNode('mask', { id, maskUnits: 'userSpaceOnUse', x: 15, y: 15, width: 570, height: 480 });
                    layer.append(svgNode('rect', { x: 15, y: 15, width: 570, height: 480, fill: mask & (1 << i) ? 'black' : 'white' }),
                        svgNode('circle', { cx, cy, r, fill: mask & (1 << i) ? 'white' : 'black' })); defs.append(layer);
                });
                const regionSetsForExpression = Object.fromEntries(['A', 'B', 'C'].map((name, i) => [name, mask & (1 << i) ? ['region'] : []]));
                const included = D.setExpression(state.expression, ['region'], regionSetsForExpression).length > 0;
                let region = svgNode('rect', { x: 15, y: 15, width: 570, height: 480, fill: '#5678d7', opacity: selected === mask ? .5 : included ? .3 : .035 });
                // Nested masks take intersections, including the complement of each absent circle.
                for (let i = 0; i < circles.length; i += 1) {
                    const group = svgNode('g', { mask: `url(#venn-region-${mask}-${i})` }); group.append(region); region = group;
                }
                accessible(region, 'Область ' + mask + ': ' + setText(regionSets[mask]), () => { selected = selected === mask ? null : mask; render(); });
                svg.append(region);
                let best = [30, 480]; let score = -Infinity;
                for (let x = 40; x <= 560; x += 8) {
                    for (let y = 40; y <= 470; y += 8) {
                        const inside = circles.reduce((m, [cx, cy, r], i) => m | (Math.hypot(x - cx, y - cy) < r ? 1 << i : 0), 0);
                        if (inside !== mask) { continue; }
                        const clearance = Math.min(x - 20, 580 - x, y - 20, 490 - y, ...circles.map(([cx, cy, r]) => Math.abs(Math.hypot(x - cx, y - cy) - r)));
                        if (clearance > score) { score = clearance; best = [x, y]; }
                    }
                }
                const values = regionSets[mask]; const text = values.length ? values.slice(0, 2).map((v) => v.length > 8 ? v.slice(0, 7) + '…' : v).join(', ') + (values.length > 2 ? '…' : '') : '∅';
                svg.append(svgNode('text', { x: best[0], y: best[1], class: 'discrete-label', 'pointer-events': 'none' }, text));
            }
            svg.prepend(defs); svg.append(svgNode('rect', { x: 15, y: 15, width: 570, height: 480, fill: 'none', stroke: 'currentColor', rx: 12 }), svgNode('text', { x: 40, y: 40, class: 'discrete-label' }, 'U'));
            circles.forEach(([cx, cy, r], i) => {
                svg.append(svgNode('circle', { cx, cy, r, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'pointer-events': 'none' }),
                    svgNode('text', { x: cx + (i === 0 ? -110 : i === 1 ? 110 : 0), y: i === 2 ? 470 : state.count === 2 ? 95 : 50, class: 'discrete-label' }, ['A', 'B', 'C'][i]));
            });
            output.append(svg, button('Скачать диаграмму SVG', () => saveSvg(svg, 'venn-diagram.svg')),
                element('p', 'Закрашены области выражения, включая пустые. Внутри показаны элементы U; ∅ обозначает пустую область. Нажмите область для просмотра её состава.', 'tool-help'));
            if (selected !== null) { output.append(element('p', 'Выбранная область: ' + setText(regionSets[selected] || []))); }
            const table = element('table'); const head = element('tr'); head.append(element('th', 'Элемент'));
            for (const name of ['A', 'B', 'C'].slice(0, state.count)) { head.append(element('th', name)); } table.append(head);
            for (const value of state.universe) {
                const tr = element('tr'); tr.append(element('th', value));
                for (const name of ['A', 'B', 'C'].slice(0, state.count)) {
                    const td = element('td'); const check = element('input'); check.type = 'checkbox'; check.checked = state.sets[name].includes(value);
                    check.setAttribute('aria-label', value + ' принадлежит ' + name);
                    check.addEventListener('change', () => {
                        try { state = read(); state.sets[name] = check.checked ? [...state.sets[name], value] : state.sets[name].filter((v) => v !== value); commit(); }
                        catch (error) { say(error.message); check.checked = !check.checked; }
                    }); td.append(check); tr.append(td);
                } table.append(tr);
            }
            members.append(table); undo.update();
        }
        for (const input of [universe.input, expression.input, count.input, ...Object.values(fields).map((f) => f.input)]) {
            input.addEventListener('input', () => session.changed());
        }
        const symbols = row(...['∪', '∩', '\\', '△', '¬', '(', ')', "'"].map((symbol) => button(symbol, () => {
            const start = expression.input.selectionStart ?? expression.input.value.length;
            expression.input.setRangeText(symbol, start, expression.input.selectionEnd ?? start, 'end'); expression.input.focus(); session.changed();
        })));
        const grid = element('div', undefined, 'venn-inputs'); grid.append(universe.label, count.label, ...Object.values(fields).map((f) => f.label));
        root.append(grid, expression.label, symbols,
            element('p', '∪ — объединение; ∩ — пересечение; \\ — разность; △ — симметрическая разность; ¬A или A\' — дополнение в U. Скобки задают порядок. До 200 элементов.', 'tool-help'),
            row(button('Построить диаграмму', () => { state = read(); selected = null; commit(); say('Диаграмма обновлена.'); }, 'primary'),
                button('Пример трёх множеств', async () => {
                    await session.replace(() => {
                        state = { ...state, universe: ['1', '2', '3', '4', '5', '6', '7', '8'], count: 3,
                            sets: { A: ['1', '2', '3', '4'], B: ['3', '4', '5', '6'], C: ['2', '4', '6', '8'] }, expression: '(A ∪ B) \\ C' }; commit();
                    });
                })), undo.node, output, membership); source(root); render();
    }
    window.StudyDiscreteUI = { relations, venn };
})();
