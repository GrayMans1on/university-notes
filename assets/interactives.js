(() => {
    const ns = 'http://www.w3.org/2000/svg';
    let sequence = 0;
    function element(tag, attributes = {}, text = '') {
        const node = document.createElement(tag);
        for (const [key, value] of Object.entries(attributes)) {
            node.setAttribute(key, value);
        }
        if (text) {
            node.textContent = text;
        }
        return node;
    }
    function svgElement(tag, attributes = {}, text = '') {
        const node = document.createElementNS(ns, tag);
        for (const [key, value] of Object.entries(attributes)) {
            node.setAttribute(key, value);
        }
        if (text) {
            node.textContent = text;
        }
        return node;
    }
    function number(value) {
        return Number.isFinite(value) ? String(Math.round(value * 1000) / 1000).replace('-', '−') : 'не определено';
    }
    function scaffold(host) {
        const controls = element('div', { class: 'widget-controls' });
        const view = element('div', { class: 'widget-view' });
        const result = element('div', { class: 'widget-result', role: 'status', 'aria-live': 'polite' });
        host.append(controls, view, result);
        return { controls, view, result };
    }
    function select(parent, title, options, selected = 0) {
        const label = element('label', {}, title + ' ');
        const control = element('select', { 'aria-label': title });
        options.forEach((name, index) => control.add(new Option(name, index)));
        control.value = String(selected);
        label.append(control);
        parent.append(label);
        return control;
    }
    function range(parent, title, min, max, step, initial) {
        const label = element('label', {}, title + ' ');
        const input = element('input', { type: 'range', min, max, step, value: initial, 'aria-label': title });
        const output = element('output', {}, number(initial));
        input.addEventListener('input', () => { output.textContent = number(Number(input.value)); });
        label.append(input, output);
        parent.append(label);
        return input;
    }
    function svgCanvas(title, height = 320) {
        const svg = svgElement('svg', { viewBox: `0 0 480 ${height}`, class: 'widget-svg', role: 'img' });
        svg.append(svgElement('title', {}, title));
        return svg;
    }
    function plot(view, curves, xMin, xMax, yMin, yMax, area = null) {
        const svg = svgCanvas('Координатный график выбранной функции');
        const width = 410;
        const height = 240;
        const px = (x) => 45 + (x - xMin) / (xMax - xMin) * width;
        const py = (y) => 280 - (y - yMin) / (yMax - yMin) * height;
        const id = 'plot-clip-' + (++sequence);
        const defs = svgElement('defs');
        const clip = svgElement('clipPath', { id });
        clip.append(svgElement('rect', { x: 45, y: 40, width, height }));
        defs.append(clip);
        svg.append(defs);
        for (let i = 0; i <= 5; i += 1) {
            const x = xMin + (xMax - xMin) * i / 5;
            const y = yMin + (yMax - yMin) * i / 5;
            svg.append(svgElement('line', { x1: px(x), y1: 40, x2: px(x), y2: 280, class: 'grid' }));
            svg.append(svgElement('line', { x1: 45, y1: py(y), x2: 455, y2: py(y), class: 'grid' }));
            svg.append(svgElement('text', { x: px(x), y: 300, 'text-anchor': 'middle' }, number(x)));
            svg.append(svgElement('text', { x: 38, y: py(y) + 5, 'text-anchor': 'end' }, number(y)));
        }
        if (xMin <= 0 && xMax >= 0) {
            svg.append(svgElement('line', { x1: px(0), y1: 40, x2: px(0), y2: 280, class: 'axis' }));
        }
        if (yMin <= 0 && yMax >= 0) {
            svg.append(svgElement('line', { x1: 45, y1: py(0), x2: 455, y2: py(0), class: 'axis' }));
        }
        const layer = svgElement('g', { 'clip-path': `url(#${id})` });
        if (area) {
            const points = [];
            for (let i = 0; i <= 160; i += 1) {
                const x = area.from + (area.to - area.from) * i / 160;
                points.push(px(x) + ',' + py(area.f(x)));
            }
            layer.append(svgElement('polygon', { points: `${px(area.from)},${py(0)} ${points.join(' ')} ${px(area.to)},${py(0)}`, class: 'region' }));
        }
        curves.forEach((curve, index) => {
            let d = '';
            let previousX = xMin;
            let previousY = null;
            for (let i = 0; i <= 650; i += 1) {
                const x = xMin + (xMax - xMin) * i / 650;
                const y = curve.f(x);
                const crosses = curve.cuts?.some((cut) => previousX < cut && x >= cut);
                if (curve.cuts?.some((cut) => Math.abs(x - cut) < 1e-9) || !Number.isFinite(y) || Math.abs(y) > Math.max(Math.abs(yMin), Math.abs(yMax)) * 20) {
                    previousY = null;
                } else {
                    const jump = previousY !== null && Math.abs(y - previousY) > (yMax - yMin) * 1.5;
                    d += (previousY === null || jump || crosses ? 'M' : 'L') + px(x).toFixed(2) + ',' + py(y).toFixed(2);
                    previousY = y;
                }
                previousX = x;
            }
            layer.append(svgElement('path', { d, class: index ? 'curve-secondary' : 'curve' }));
            if (curve.level !== undefined) {
                layer.append(svgElement('line', { x1: 45, x2: 455, y1: py(curve.level), y2: py(curve.level), class: 'axis', 'stroke-dasharray': '5 5' }));
            }
        });
        svg.append(layer);
        svg.append(svgElement('text', { x: 455, y: 22, 'text-anchor': 'end' }, 'x'));
        svg.append(svgElement('text', { x: 15, y: 22 }, 'y'));
        view.replaceChildren(svg);
        return { svg, px, py, layer };
    }
    function stages(host, type) {
        const { controls, view, result } = scaffold(host);
        const cot = (x) => Math.cos(x) / Math.sin(x);
        const shiftedCuts = Array.from({ length: 13 }, (_, i) => (i - 6) * Math.PI - Math.PI / 4);
        const families = {
            exponential: [['eˣ', Math.exp], ['e⁽ˣ⁺³⁾', (x) => Math.exp(x + 3)], ['e⁽⁻ˣ⁺³⁾', (x) => Math.exp(-x + 3)], ['2e⁽⁻ˣ⁺³⁾', (x) => 2 * Math.exp(-x + 3)], ['2e⁽⁻ˣ⁺³⁾ + 1', (x) => 2 * Math.exp(-x + 3) + 1]],
            cotangent: [['ctg x', cot], ['ctg |x|', (x) => cot(Math.abs(x))], ['ctg |x + π/4|', (x) => cot(Math.abs(x + Math.PI / 4))], ['ctg |x + π/4| + 1', (x) => cot(Math.abs(x + Math.PI / 4)) + 1], ['|ctg |x + π/4| + 1|', (x) => Math.abs(cot(Math.abs(x + Math.PI / 4)) + 1)]],
            polynomial: [['x² − 4|x| + 3', (x) => x * x - 4 * Math.abs(x) + 3], ['1/(x² − 4|x| + 3)', (x) => 1 / (x * x - 4 * Math.abs(x) + 3)]],
            'absolute-trig': [['|sin x| + |cos x|', (x) => Math.abs(Math.sin(x)) + Math.abs(Math.cos(x))], ['2^(|sin x| + |cos x|)', (x) => 2 ** (Math.abs(Math.sin(x)) + Math.abs(Math.cos(x)))]],
            arctangent: [['1/x', (x) => 1 / x], ['1/(x−3)', (x) => 1 / (x - 3)], ['5/(x−3)', (x) => 5 / (x - 3)], ['1 + 5/(x−3)', (x) => 1 + 5 / (x - 3)], ['arctg(1 + 5/(x−3))', (x) => Math.atan(1 + 5 / (x - 3))]],
            'sine-reciprocal': [['sin x + cos x', (x) => Math.sin(x) + Math.cos(x)], ['1/(sin x + cos x)', (x) => 1 / (Math.sin(x) + Math.cos(x))]],
            logarithm: [['2ˣ', (x) => 2 ** x], ['2⁻ˣ', (x) => 2 ** (-x)], ['−2⁻ˣ', (x) => -(2 ** (-x))], ['1 − 2⁻ˣ', (x) => 1 - 2 ** (-x)], ['|1 − 2⁻ˣ|', (x) => Math.abs(1 - 2 ** (-x))], ['log₅|1 − 2⁻ˣ|', (x) => Math.log(Math.abs(1 - 2 ** (-x))) / Math.log(5)]],
        };
        const options = families[type];
        const step = select(controls, 'Этап', options.map(([label]) => label));
        const point = range(controls, 'x', -6, 6, .1, 0);
        function draw() {
            const index = Number(step.value);
            const [label, f] = options[index];
            let cuts = [];
            let xMin = -6;
            let xMax = 8;
            let yMin = -5;
            let yMax = 6;
            let level;
            if (type === 'cotangent') {
                cuts = index < 2 ? shiftedCuts.map((x) => x + Math.PI / 4) : shiftedCuts;
                xMin = -Math.PI * 1.5;
                xMax = Math.PI * 1.5;
            } else if (type === 'arctangent') {
                cuts = [index ? 3 : 0];
                if (index === 4) {
                    yMin = -2;
                    yMax = 2;
                    level = Math.PI / 4;
                }
            } else if (type === 'polynomial') {
                cuts = index ? [-3, -1, 1, 3] : [];
            } else if (type === 'sine-reciprocal') {
                xMin = -Math.PI * 1.5;
                xMax = Math.PI * 1.5;
                cuts = index ? shiftedCuts : [];
            } else if (type === 'logarithm') {
                cuts = index === 5 ? [0] : [];
            } else if (type === 'absolute-trig') {
                xMin = -Math.PI;
                xMax = Math.PI;
                yMin = 0;
                yMax = 3;
            }
            const curves = [{ f, cuts, level }];
            if (type === 'sine-reciprocal' && index === 0) {
                curves.push({ f: Math.sin }, { f: Math.cos });
            }
            const graph = plot(view, curves, xMin, xMax, yMin, yMax);
            const x = Number(point.value);
            const y = cuts.some((cut) => Math.abs(cut - x) < 1e-9) ? NaN : f(x);
            if (Number.isFinite(y) && x >= xMin && x <= xMax && y >= yMin && y <= yMax) {
                graph.layer.append(svgElement('circle', { cx: graph.px(x), cy: graph.py(y), r: 4, fill: 'var(--blue)' }));
            }
            result.textContent = `y = ${label}; при x = ${number(x)}: y = ${number(y)}.`;
        }
        step.addEventListener('change', draw);
        point.addEventListener('input', draw);
        draw();
    }
    function transform(host) {
        const { controls, view, result } = scaffold(host);
        const base = select(controls, 'f(x)', ['eˣ', 'log₂ x', 'sin x']);
        const a = range(controls, 'a', -3, 3, .25, 0);
        const b = range(controls, 'b', -3, 3, .25, 0);
        const k = select(controls, 'k', ['0.5', '1', '2', '−1'], 1);
        const c = select(controls, 'c', ['0.5', '1', '2', '−1'], 1);
        function draw() {
            const f = [Math.exp, Math.log2, Math.sin][base.value];
            const kval = [.5, 1, 2, -1][k.value];
            const cval = [.5, 1, 2, -1][c.value];
            const av = Number(a.value);
            const bv = Number(b.value);
            const transformed = (x) => cval * f(kval * x + av) + bv;
            plot(view, [{ f: transformed, cuts: Number(base.value) === 1 ? [-av / kval] : [] }, { f, cuts: Number(base.value) === 1 ? [0] : [] }], -5, 5, -5, 7);
            result.textContent = `Синий: y = ${number(cval)}·f(${number(kval)}·x + ${number(av)}) + ${number(bv)}. Оранжевый: y = f(x).`;
        }
        [base, k, c].forEach((input) => input.addEventListener('change', draw));
        [a, b].forEach((input) => input.addEventListener('input', draw));
        draw();
    }
    function sets(host, deMorgan) {
        const { controls, view, result } = scaffold(host);
        const labels = deMorgan ? ['¬(A∪B) = ¬A∩¬B', '¬(A∩B) = ¬A∪¬B'] : ['A∪B', 'A∩B', 'A∖B', 'B∖A', 'A⊕B', 'U∖A'];
        const operation = select(controls, 'Операция', labels);
        const point = select(controls, 'Точка', ['Только A', 'Только B', 'A∩B', 'Вне A и B']);
        const positions = [[110, 145], [370, 145], [240, 145], [430, 250]];
        function draw() {
            const op = Number(operation.value);
            const svg = svgCanvas('Выделенная область операции над множествами', 300);
            const id = 'venn-mask-' + (++sequence);
            const clipId = id + '-a';
            const defs = svgElement('defs');
            const mask = svgElement('mask', { id });
            const clip = svgElement('clipPath', { id: clipId });
            const circleA = (color) => svgElement('circle', { cx: 180, cy: 145, r: 95, fill: color });
            const circleB = (color) => svgElement('circle', { cx: 300, cy: 145, r: 95, fill: color });
            clip.append(circleA('white'));
            defs.append(clip);
            mask.append(svgElement('rect', { width: 480, height: 300, fill: (deMorgan || op === 5) ? 'white' : 'black' }));
            if (deMorgan && op === 0) {
                mask.append(circleA('black'), circleB('black'));
            } else if (deMorgan && op === 1) {
                const g = svgElement('g', { 'clip-path': `url(#${clipId})` });
                g.append(circleB('black'));
                mask.append(g);
            } else if (op === 0 || op === 4) {
                mask.append(circleA('white'), circleB('white'));
                if (op === 4) {
                    const g = svgElement('g', { 'clip-path': `url(#${clipId})` });
                    g.append(circleB('black'));
                    mask.append(g);
                }
            } else if (op === 1) {
                const g = svgElement('g', { 'clip-path': `url(#${clipId})` });
                g.append(circleB('white'));
                mask.append(g);
            } else if (op === 2) {
                mask.append(circleA('white'), circleB('black'));
            } else if (op === 3) {
                mask.append(circleB('white'), circleA('black'));
            } else {
                mask.append(circleA('black'));
            }
            defs.append(mask);
            svg.append(defs, svgElement('rect', { x: 15, y: 15, width: 450, height: 270, class: 'region', mask: `url(#${id})` }));
            svg.append(svgElement('rect', { x: 15, y: 15, width: 450, height: 270, fill: 'none', class: 'axis' }));
            svg.append(svgElement('circle', { cx: 180, cy: 145, r: 95, fill: 'none', class: 'axis' }));
            svg.append(svgElement('circle', { cx: 300, cy: 145, r: 95, fill: 'none', class: 'axis' }));
            svg.append(svgElement('text', { x: 130, y: 48 }, 'A'), svgElement('text', { x: 350, y: 48 }, 'B'), svgElement('text', { x: 440, y: 38 }, 'U'));
            const index = Number(point.value);
            const [x, y] = positions[index];
            const inA = index === 0 || index === 2;
            const inB = index === 1 || index === 2;
            const belongs = deMorgan ? (op === 0 ? !(inA || inB) : !(inA && inB))
                : [inA || inB, inA && inB, inA && !inB, inB && !inA, inA !== inB, !inA][op];
            svg.append(svgElement('circle', { cx: x, cy: y, r: 5, fill: 'var(--ink)' }));
            view.replaceChildren(svg);
            result.textContent = `${labels[op]}. Выбранная точка ${belongs ? 'входит' : 'не входит'} в результат.`;
        }
        operation.addEventListener('change', draw);
        point.addEventListener('change', draw);
        draw();
    }
    function bits(host, homework) {
        const { controls, view, result } = scaffold(host);
        const values = homework ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] : [1, 2, 3, 4, 5];
        const names = homework ? ['P', 'Q'] : ['A', 'B'];
        let a = values.map((n) => (homework ? [2, 3, 5, 6, 7, 9] : [1, 3, 5]).includes(n));
        let b = values.map((n) => (homework ? [1, 2, 6, 7, 9] : [3, 4]).includes(n));
        const operation = select(controls, 'Операция', ['Объединение', 'Пересечение', names[0] + '∖' + names[1], names[1] + '∖' + names[0], 'Симметрическая разность', 'Дополнение ' + names[1]]);
        function draw() {
            const op = Number(operation.value);
            const out = values.map((_, i) => [a[i] || b[i], a[i] && b[i], a[i] && !b[i], b[i] && !a[i], a[i] !== b[i], !b[i]][op]);
            const table = element('table', { class: 'matrix-widget' });
            const header = element('tr');
            header.append(element('th', {}, 'U'));
            values.forEach((n) => header.append(element('th', {}, String(n))));
            table.append(header);
            [a, b].forEach((vector, rowIndex) => {
                const row = element('tr');
                row.append(element('th', {}, names[rowIndex]));
                vector.forEach((bit, i) => {
                    const cell = element('td', { class: bit ? 'active' : '' });
                    const button = element('button', { type: 'button', 'aria-label': `${names[rowIndex]}: элемент ${values[i]}, ${bit ? 1 : 0}` }, bit ? '1' : '0');
                    button.addEventListener('click', () => {
                        vector[i] = !vector[i];
                        draw();
                        view.querySelectorAll('button')[rowIndex * values.length + i]?.focus();
                    });
                    cell.append(button);
                    row.append(cell);
                });
                table.append(row);
            });
            const row = element('tr');
            row.append(element('th', {}, 'Итог'));
            out.forEach((bit) => row.append(element('td', { class: bit ? 'active' : '' }, bit ? '1' : '0')));
            table.append(row);
            const scroll = element('div', { class: 'matrix-display', tabindex: 0 });
            scroll.append(table);
            view.replaceChildren(scroll);
            result.textContent = `Результат: ${out.map(Number).join('')}; множество {${values.filter((_, i) => out[i]).join(', ')}}.`;
        }
        operation.addEventListener('change', draw);
        draw();
    }
    function relation(host, type) {
        const { controls, view, result } = scaffold(host);
        const letters = ['a', 'b', 'c', 'd'];
        let members = Array.from({ length: 7 }, (_, i) => i + 1);
        let options;
        if (type === 'divisibility') {
            members = [1, 2, 3, 4, 5];
            options = [['a делится на b', (a, b) => a % b === 0]];
        } else if (type === 'greater') {
            members = [1, 2, 3, 4, 5, 6];
            options = [['a > b', (a, b) => a > b]];
        } else if (type === 'relation-seven') {
            options = [['x mod 3 = y', (a, b) => a % 3 === b], ['x + y = 9', (a, b) => a + b === 9], ['xy ≥ 8', (a, b) => a * b >= 8]];
        } else if (type === 'relation-triangular') {
            options = [['x = y', (a, b) => a === b], ['x ≥ y', (a, b) => a >= b]];
        } else if (type === 'odd-sum') {
            options = [['Нечётная сумма', (a, b) => (a + b) % 2 === 1]];
        } else if (type === 'square') {
            members = letters;
            options = [['Соседние вершины', (a, b) => Math.abs(letters.indexOf(a) - letters.indexOf(b)) % 2 === 1], ['Противоположные вершины', (a, b) => Math.abs(letters.indexOf(a) - letters.indexOf(b)) === 2]];
        } else if (type === 'relation-example') {
            members = [...letters, 'e', 'f'];
            const edges = ['a,a', 'a,b', 'b,f', 'f,b', 'b,c', 'c,d', 'd,c', 'f,d', 'd,e', 'e,f'];
            options = [['Пример 1.24', (a, b) => edges.includes(a + ',' + b)]];
        } else {
            members = letters;
            options = [
                ['Все петли', (a, b) => a === b || ['a,b', 'b,c'].includes(a + ',' + b)],
                ['Без петель', (a, b) => ['a,b', 'b,c'].includes(a + ',' + b)],
                ['Часть петель', (a, b) => (a === b && a !== 'c') || ['a,d', 'd,b'].includes(a + ',' + b)],
            ];
        }
        const mode = select(controls, 'Отношение', options.map(([title]) => title));
        const from = select(controls, 'Начало дуги', ['Все', ...members.map(String)]);
        function draw() {
            const test = options[mode.value][1];
            const matrix = members.map((a) => members.map((b) => test(a, b)));
            const selected = Number(from.value) - 1;
            const svg = svgCanvas('Граф выбранного отношения');
            const arrowId = 'edge-arrow-' + (++sequence);
            const defs = svgElement('defs');
            const marker = svgElement('marker', { id: arrowId, markerWidth: 8, markerHeight: 8, refX: 7, refY: 3, orient: 'auto', markerUnits: 'userSpaceOnUse' });
            marker.append(svgElement('path', { d: 'M0 0L7 3L0 6Z', fill: 'var(--blue)' }));
            defs.append(marker);
            svg.append(defs);
            const positions = members.map((_, i) => ({ x: 240 + 115 * Math.cos(-Math.PI / 2 + 2 * Math.PI * i / members.length), y: 160 + 110 * Math.sin(-Math.PI / 2 + 2 * Math.PI * i / members.length) }));
            let count = 0;
            matrix.forEach((row, i) => row.forEach((connected, j) => {
                if (!connected) {
                    return;
                }
                count += 1;
                const a = positions[i];
                const b = positions[j];
                let d;
                if (i === j) {
                    d = `M${a.x - 9},${a.y - 10}C${a.x - 39},${a.y - 45} ${a.x + 39},${a.y - 45} ${a.x + 9},${a.y - 10}`;
                } else {
                    const length = Math.hypot(b.x - a.x, b.y - a.y);
                    const ux = (b.x - a.x) / length;
                    const uy = (b.y - a.y) / length;
                    d = `M${a.x + 17 * ux},${a.y + 17 * uy}L${b.x - 19 * ux},${b.y - 19 * uy}`;
                }
                svg.append(svgElement('path', { d, class: 'edge' + (selected >= 0 && selected !== i ? ' dim' : ''), 'marker-end': `url(#${arrowId})` }));
            }));
            positions.forEach((position, i) => {
                const g = svgElement('g', { role: 'button', tabindex: 0, 'aria-label': 'Выделить дуги из ' + members[i] });
                g.append(svgElement('circle', { cx: position.x, cy: position.y, r: 15, class: 'node' + (selected === i ? ' selected' : '') }));
                g.append(svgElement('text', { x: position.x, y: position.y + 5, 'text-anchor': 'middle' }, String(members[i])));
                const choose = () => { from.value = String(i + 1); draw(); };
                g.addEventListener('click', choose);
                g.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        choose();
                        view.querySelectorAll('[role="button"]')[i]?.focus();
                    }
                });
                svg.append(g);
            });
            const table = element('table', { class: 'matrix-widget', 'aria-label': 'Матрица отношения' });
            const header = element('tr');
            header.append(element('th', {}, 'x / y'));
            members.forEach((value) => header.append(element('th', {}, String(value))));
            table.append(header);
            matrix.forEach((row, i) => {
                const line = element('tr');
                line.append(element('th', {}, String(members[i])));
                row.forEach((connected) => line.append(element('td', { class: i === selected && connected ? 'active' : '' }, connected ? '1' : '0')));
                table.append(line);
            });
            const scroll = element('div', { class: 'matrix-display', tabindex: 0 });
            scroll.append(table);
            view.replaceChildren(svg, scroll);
            const reflexive = matrix.every((row, i) => row[i]);
            const antiReflexive = matrix.every((row, i) => !row[i]);
            const symmetric = matrix.every((row, i) => row.every((connected, j) => !connected || matrix[j][i]));
            const transitive = matrix.every((row, i) => row.every((connected, j) => !connected || matrix[j].every((second, k) => !second || matrix[i][k])));
            const selectedPairs = selected < 0 ? '' : ' Дуги: ' + members.filter((_, j) => matrix[selected][j]).map((value) => `${members[selected]}→${value}`).join(', ') + '.';
            result.textContent = `Пар: ${count}. Рефлексивность: ${reflexive ? 'да' : 'нет'}; антирефлексивность: ${antiReflexive ? 'да' : 'нет'}; симметричность: ${symmetric ? 'да' : 'нет'}; транзитивность: ${transitive ? 'да' : 'нет'}.${selectedPairs}`;
        }
        mode.addEventListener('change', draw);
        from.addEventListener('change', draw);
        draw();
    }
    function matrixTable(matrix, highlight = () => false, removed = () => false) {
        const table = element('table', { class: 'matrix-widget' });
        matrix.forEach((row, i) => {
            const line = element('tr');
            row.forEach((value, j) => line.append(element('td', { class: removed(i, j) ? 'removed' : highlight(i, j) ? 'active' : '' }, number(value))));
            table.append(line);
        });
        return table;
    }
    function matrices(host, type) {
        const { controls, view, result } = scaffold(host);
        let a = [[1, 2, 3], [4, 5, 6]];
        const b = [[3, 1], [-1, 2], [1, 3]];
        if (type === 'matrix-product') {
            a = [[2, -3, 1], [4, 5, 0]];
        } else if (type === 'transpose') {
            a = [[1, 2, 3, -2], [4, 5, 6, -4], [7, 8, 9, -6]];
        } else if (type === 'minor') {
            a = [[1, 2, 3], [4, 5, 6], [7, 8, 9]];
        } else if (type === 'determinant') {
            a = [[1, 2], [4, 5]];
        }
        if (type === 'matrix-types') {
            const mode = select(controls, 'Вид', ['Нулевая', 'Диагональная', 'Единичная', 'Верхняя треугольная', 'Скалярная 2E']);
            const values = [Array.from({ length: 3 }, () => [0, 0, 0]), [[1, 0, 0], [0, 2, 0], [0, 0, 3]], [[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[1, 2, 3], [0, 4, 5], [0, 0, 6]], [[2, 0, 0], [0, 2, 0], [0, 0, 2]]];
            const draw = () => {
                view.replaceChildren(matrixTable(values[mode.value], (i, j) => i === j));
                result.textContent = mode.options[mode.selectedIndex].text + ': выделена главная диагональ.';
            };
            mode.addEventListener('change', draw);
            draw();
            return;
        }
        if (type === 'determinant') {
            const fields = [];
            a.forEach((row, i) => row.forEach((value, j) => {
                const label = element('label', {}, ['a', 'b', 'c', 'd'][i * 2 + j] + ' ');
                const input = element('input', { type: 'number', value, min: -20, max: 20, step: 1 });
                label.append(input);
                controls.append(label);
                fields.push(input);
            }));
            const draw = () => {
                const values = fields.map((input) => input.value === '' ? NaN : Number(input.value));
                if (!values.every(Number.isFinite)) {
                    result.textContent = 'Заполни все четыре элемента.';
                    return;
                }
                const [v0, v1, v2, v3] = values;
                view.replaceChildren(matrixTable([[v0, v1], [v2, v3]], (i, j) => i === j));
                result.textContent = `ad − bc = (${number(v0)})·(${number(v3)}) − (${number(v1)})·(${number(v2)}) = ${number(v0 * v3 - v1 * v2)}.`;
            };
            fields.forEach((input) => input.addEventListener('input', draw));
            draw();
            return;
        }
        const row = select(controls, 'Строка i', a.map((_, i) => String(i + 1)), type === 'minor' ? 1 : 0);
        const colCount = type === 'matrix-product' ? b[0].length : a[0].length;
        const column = select(controls, 'Столбец j', Array.from({ length: colCount }, (_, i) => String(i + 1)), type === 'minor' ? 2 : 0);
        function draw() {
            const i = Number(row.value);
            const j = Number(column.value);
            const wrap = element('div', { class: 'matrix-display', tabindex: 0 });
            if (type === 'matrix-product') {
                const product = a.map((line) => b[0].map((_, bj) => line.reduce((sum, value, index) => sum + value * b[index][bj], 0)));
                wrap.append(matrixTable(a, (ai) => ai === i), element('span', {}, '×'), matrixTable(b, (_, bj) => bj === j), element('span', {}, '='), matrixTable(product, (ai, bj) => ai === i && bj === j));
                result.textContent = `c${i + 1}${j + 1} = ` + a[i].map((value, k) => `(${number(value)})·(${number(b[k][j])})`).join(' + ') + ' = ' + number(product[i][j]);
            } else if (type === 'transpose') {
                const transposed = a[0].map((_, ai) => a.map((line) => line[ai]));
                wrap.append(matrixTable(a, (ai, aj) => ai === i && aj === j), element('span', {}, 'Aᵀ'), matrixTable(transposed, (ai, aj) => ai === j && aj === i));
                result.textContent = `a${i + 1}${j + 1} = ${number(a[i][j])}; в Aᵀ: строка ${j + 1}, столбец ${i + 1}.`;
            } else if (type === 'minor') {
                const minor = a.filter((_, ai) => ai !== i).map((line) => line.filter((_, aj) => aj !== j));
                const m = minor[0][0] * minor[1][1] - minor[0][1] * minor[1][0];
                const sign = (i + j) % 2 === 0 ? 1 : -1;
                wrap.append(matrixTable(a, () => false, (ai, aj) => ai === i || aj === j), element('span', {}, 'Минор'), matrixTable(minor));
                result.textContent = `M${i + 1}${j + 1} = ${number(m)}; A${i + 1}${j + 1} = (−1)^(${i + j + 2})·${number(m)} = ${number(sign * m)}.`;
            } else {
                wrap.append(matrixTable(a, (ai, aj) => ai === i || aj === j));
                result.textContent = `a${i + 1}${j + 1} = ${number(a[i][j])}; строка ${i + 1}, столбец ${j + 1}.`;
            }
            view.replaceChildren(wrap);
        }
        row.addEventListener('change', draw);
        column.addEventListener('change', draw);
        draw();
    }
    function sarrus(host) {
        const { controls, view, result } = scaffold(host);
        const a = [[2, -1, 3], [0, 1, 2], [1, 2, -1]];
        const choice = select(controls, 'Диагональ', ['+ a₁₁a₂₂a₃₃', '+ a₁₂a₂₃a₃₁', '+ a₁₃a₂₁a₃₂', '− a₁₃a₂₂a₃₁', '− a₁₁a₂₃a₃₂', '− a₁₂a₂₁a₃₃']);
        function draw() {
            const index = Number(choice.value);
            const cols = index < 3 ? [index, index + 1, index + 2] : [index - 1, index - 2, index - 3];
            const svg = svgCanvas('Выделенная диагональ правила Саррюса', 210);
            for (let i = 0; i < 3; i += 1) {
                for (let j = 0; j < 5; j += 1) {
                    svg.append(svgElement('text', { x: 80 + j * 70, y: 50 + i * 60, 'text-anchor': 'middle', opacity: j >= 3 ? .5 : 1 }, String(a[i][j % 3])));
                }
            }
            svg.append(svgElement('polyline', { points: cols.map((j, i) => `${80 + j * 70},${45 + i * 60}`).join(' '), class: 'curve', opacity: .6 }));
            const factors = cols.map((j, i) => a[i][j % 3]);
            const product = factors.reduce((p, value) => p * value, index < 3 ? 1 : -1);
            view.replaceChildren(svg);
            result.textContent = `${index < 3 ? '+' : '−'} (${factors.join(')·(')}) = ${number(product)}. Сумма шести слагаемых: −15.`;
        }
        choice.addEventListener('change', draw);
        draw();
    }
    function recordedSteps(host, type) {
        const { controls, view, result } = scaffold(host);
        const data = window.StudyStages[type];
        const explanation = element('div', { class: 'step-explanation', role: 'status', 'aria-live': 'polite' });
        host.append(explanation);
        const example = data.length > 1 ? select(controls, 'Задача', data.map((item) => item.title)) : null;
        const step = range(controls, 'Этап', 1, data[0].steps.length, 1, 1);
        function draw() {
            const group = data[example ? Number(example.value) : 0];
            view.innerHTML = group.steps[Number(step.value) - 1];
            result.textContent = `${group.title}. Этап ${step.value} из ${group.steps.length}.`;
            explanation.innerHTML = group.explanations[Number(step.value) - 1];
        }
        example?.addEventListener('change', () => {
            step.max = data[Number(example.value)].steps.length;
            step.value = '1';
            step.dispatchEvent(new Event('input'));
        });
        step.addEventListener('input', draw);
        draw();
    }
    function logic(host) {
        const { controls, view, result } = scaffold(host);
        const a = select(controls, 'A', ['0', '1']);
        const b = select(controls, 'B', ['0', '1']);
        function draw() {
            const av = Number(a.value);
            const bv = Number(b.value);
            const rows = [['¬A', !av], ['A∨B', av || bv], ['A∧B', av && bv], ['A⇒B', !av || bv], ['A⇔B', av === bv]];
            const table = element('table', { class: 'matrix-widget' });
            rows.forEach(([title, value]) => {
                const line = element('tr');
                line.append(element('th', {}, title), element('td', { class: value ? 'active' : '' }, value ? '1' : '0'));
                table.append(line);
            });
            view.replaceChildren(table);
            result.textContent = `A = ${av}, B = ${bv}. Импликация ${!av || bv ? 'истинна' : 'ложна'}.`;
        }
        a.addEventListener('change', draw);
        b.addEventListener('change', draw);
        draw();
    }
    function neighborhood(host) {
        const { controls, view, result } = scaffold(host);
        const center = range(controls, 'x₀', -2, 2, .1, 0);
        const epsilon = range(controls, 'ε', .1, 1.5, .1, .5);
        const x = range(controls, 'x', -3.5, 3.5, .1, -2.3);
        const mode = select(controls, 'Окрестность', ['Обычная', 'Проколотая']);
        function draw() {
            const c = Number(center.value);
            const e = Number(epsilon.value);
            const value = Number(x.value);
            const svg = svgCanvas('Числовая прямая и открытая окрестность', 150);
            const px = (n) => 240 + n * 58;
            svg.append(svgElement('line', { x1: 20, y1: 75, x2: 460, y2: 75, class: 'axis' }));
            svg.append(svgElement('line', { x1: px(c - e), y1: 75, x2: px(c + e), y2: 75, class: 'curve', 'stroke-width': 7 }));
            [c - e, c + e].forEach((n) => {
                svg.append(svgElement('circle', { cx: px(n), cy: 75, r: 5, fill: 'var(--surface)', stroke: 'var(--blue)' }));
                svg.append(svgElement('text', { x: px(n), y: 110, 'text-anchor': 'middle' }, number(n)));
            });
            svg.append(svgElement('circle', { cx: px(c), cy: 75, r: 5, fill: mode.value === '1' ? 'var(--surface)' : 'var(--blue)', stroke: 'var(--blue)' }));
            svg.append(svgElement('text', { x: px(c), y: 50, 'text-anchor': 'middle' }, 'x₀ = ' + number(c)));
            svg.append(svgElement('circle', { cx: px(value), cy: 75, r: 3, fill: '#ce7b39' }));
            const belongs = Math.abs(value - c) < e - 1e-9 && (mode.value !== '1' || Math.abs(value - c) > 1e-9);
            view.replaceChildren(svg);
            result.textContent = `x = ${number(value)} ${belongs ? 'входит' : 'не входит'} в окрестность. [x] = ${Math.floor(value)}; {x} = ${number(value - Math.floor(value))}.`;
        }
        [center, epsilon, x].forEach((input) => input.addEventListener('input', draw));
        mode.addEventListener('change', draw);
        draw();
    }
    function nested(host) {
        const { controls, view, result } = scaffold(host);
        const n = range(controls, 'n', 1, 20, 1, 1);
        function draw() {
            const count = Number(n.value);
            const svg = svgCanvas('Вложенные отрезки с общей точкой 0', 260);
            const indices = count <= 6 ? Array.from({ length: count }, (_, i) => i + 1) : [1, ...Array.from({ length: 5 }, (_, i) => count - 4 + i)];
            indices.forEach((k, i) => {
                const y = 38 + i * 35;
                svg.append(svgElement('line', { x1: 240 - 180 / k, x2: 240 + 180 / k, y1: y, y2: y, class: 'curve' }));
                [-1, 1].forEach((sign) => svg.append(svgElement('circle', { cx: 240 + sign * 180 / k, cy: y, r: 3, fill: 'var(--blue)' })));
                svg.append(svgElement('text', { x: 15, y: y + 5 }, 'I' + k));
            });
            svg.append(svgElement('line', { x1: 240, y1: 15, x2: 240, y2: 235, class: 'axis', 'stroke-dasharray': '3 3' }));
            svg.append(svgElement('text', { x: 240, y: 253, 'text-anchor': 'middle' }, '0'));
            view.replaceChildren(svg);
            result.textContent = `Iₙ = [−1/n; 1/n]. При n = ${count}: длина ${number(2 / count)}. Общая точка — 0.`;
        }
        n.addEventListener('input', draw);
        draw();
    }
    function epsilon(host) {
        const { controls, view, result } = scaffold(host);
        const e = range(controls, 'ε', .02, .5, .02, .1);
        function draw() {
            const value = Number(e.value);
            const n = Math.max(1, Math.floor(1 / value));
            const graph = plot(view, [], 0, 60, .4, 1.6);
            graph.layer.append(svgElement('rect', { x: graph.px(0), y: graph.py(1 + value), width: graph.px(60) - graph.px(0), height: graph.py(1 - value) - graph.py(1 + value), class: 'region' }));
            graph.layer.append(svgElement('line', { x1: graph.px(0), x2: graph.px(60), y1: graph.py(1), y2: graph.py(1), class: 'axis', 'stroke-dasharray': '5 5' }));
            for (let k = 1; k <= 60; k += 1) {
                graph.layer.append(svgElement('circle', { cx: graph.px(k), cy: graph.py(k / (k + 1)), r: 2.2, fill: k > n ? 'var(--blue)' : 'var(--muted)' }));
            }
            result.textContent = `aₙ = n/(n+1), предел 1. Можно выбрать N = ${n}. Для n > N: |aₙ−1| < ${number(value)}. Синие точки — после N.`;
        }
        e.addEventListener('input', draw);
        draw();
    }
    function arrow(svg, x1, y1, x2, y2, label, secondary = false) {
        const id = 'vector-arrow-' + (++sequence);
        const defs = svgElement('defs');
        const marker = svgElement('marker', { id, markerWidth: 8, markerHeight: 8, refX: 7, refY: 3, orient: 'auto' });
        marker.append(svgElement('path', { d: 'M0 0L7 3L0 6Z', fill: secondary ? '#ce7b39' : 'var(--blue)' }));
        defs.append(marker);
        svg.append(defs);
        if (Math.hypot(x2 - x1, y2 - y1) > .01) {
            svg.append(svgElement('line', { x1, y1, x2, y2, class: secondary ? 'curve-secondary' : 'curve', 'marker-end': `url(#${id})` }));
        }
        const height = Number(svg.getAttribute('viewBox').split(' ')[3]);
        svg.append(svgElement('text', { x: Math.max(12, Math.min(450, x2 + 6)), y: Math.max(20, Math.min(height - 10, y2 - 8)) }, label));
    }
    function vectors(host, type) {
        const { controls, view, result } = scaffold(host);
        const labels = type === 'radius' ? ['x', 'y', 'z'] : type === 'displacement' ? ['Ax', 'Ay', 'Bx', 'By'] : ['V₁x', 'V₁y', 'V₂x', 'V₂y'];
        const initial = type === 'radius' ? [2, 1, 2] : type === 'displacement' ? [-2, 1, 3, 4] : [3, 2, -2, 3];
        const inputs = labels.map((label, i) => range(controls, label, -4, 4, .5, initial[i]));
        function draw() {
            const values = inputs.map((input) => Number(input.value));
            if (type === 'radius') {
                const [x, y, z] = values;
                const svg = svgCanvas('Схематическая проекция радиус-вектора в трёх измерениях', 360);
                const ox = 240;
                const oy = 180;
                const mx = ox + 23 * x - 23 * y;
                const my = oy + 11 * x + 11 * y - 20 * z;
                arrow(svg, ox, oy, ox + 92, oy + 44, 'x');
                arrow(svg, ox, oy, ox - 92, oy + 44, 'y');
                arrow(svg, ox, oy, ox, oy - 80, 'z');
                arrow(svg, ox, oy, mx, my, 'r', true);
                svg.append(svgElement('circle', { cx: mx, cy: my, r: 4, fill: '#ce7b39' }));
                view.replaceChildren(svg);
                result.textContent = `r = (${number(x)}; ${number(y)}; ${number(z)}); |r| = √(${number(x * x)} + ${number(y * y)} + ${number(z * z)}) = ${number(Math.hypot(x, y, z))}.`;
                return;
            }
            const [x1, y1, x2, y2] = values;
            const graph = plot(view, [], -10, 10, -10, 10);
            const ox = graph.px(0);
            const oy = graph.py(0);
            if (type === 'displacement') {
                arrow(graph.svg, ox, oy, graph.px(x1), graph.py(y1), 'rA');
                arrow(graph.svg, ox, oy, graph.px(x2), graph.py(y2), 'rB');
                arrow(graph.svg, graph.px(x1), graph.py(y1), graph.px(x2), graph.py(y2), 'Δr', true);
                result.textContent = `Δr = rB − rA = (${number(x2 - x1)}; ${number(y2 - y1)}).`;
            } else {
                arrow(graph.svg, ox, oy, graph.px(x1), graph.py(y1), 'V₁');
                arrow(graph.svg, ox, oy, graph.px(x2), graph.py(y2), 'V₂');
                arrow(graph.svg, ox, oy, graph.px(x1 + x2), graph.py(y1 + y2), 'V₃', true);
                graph.svg.append(svgElement('line', { x1: graph.px(x1), y1: graph.py(y1), x2: graph.px(x1 + x2), y2: graph.py(y1 + y2), class: 'axis', 'stroke-dasharray': '4 4' }));
                graph.svg.append(svgElement('line', { x1: graph.px(x2), y1: graph.py(y2), x2: graph.px(x1 + x2), y2: graph.py(y1 + y2), class: 'axis', 'stroke-dasharray': '4 4' }));
                result.textContent = `V₃ = (${number(x1 + x2)}; ${number(y1 + y2)}); |V₃| = ${number(Math.hypot(x1 + x2, y1 + y2))}.`;
            }
        }
        inputs.forEach((input) => input.addEventListener('input', draw));
        draw();
    }
    function areas(host, type) {
        const { controls, view, result } = scaffold(host);
        let time;
        let v0;
        let acceleration;
        if (type === 'braking') {
            v0 = range(controls, 'V₀', 1, 10, .5, 3);
            acceleration = range(controls, '|a|', .2, 2, .1, .6);
        } else {
            time = range(controls, 't', 0, type === 'velocity-area' ? 5 : 20, .25, type === 'velocity-area' ? 4 : 17);
        }
        function draw() {
            let f;
            let t;
            let end;
            let top;
            let value;
            if (type === 'braking') {
                const start = Number(v0.value);
                const a = -Number(acceleration.value);
                end = -start / a;
                t = end;
                top = start;
                f = (x) => start + a * x;
                value = start * end / 2;
                result.textContent = `a = ${number(a)} м/с²; t₀ = ${number(end)} с; S = V₀t₀/2 = ${number(value)} м.`;
            } else if (type === 'velocity-area') {
                f = (x) => 3 - .6 * x;
                end = 5;
                top = 3;
                t = Number(time.value);
                value = 3 * t - .3 * t * t;
                result.textContent = `V(t) = 3 − 0.6t; S(0…${number(t)}) = ${number(value)} м.`;
            } else {
                f = (x) => x <= 10 ? x : 20 - x;
                end = 20;
                top = 10;
                t = Number(time.value);
                value = t <= 10 ? t * t / 2 : 100 - (20 - t) ** 2 / 2;
                result.textContent = `ΔV(0…${number(t)}) = ${number(value)} м/с — площадь под a(t).`;
            }
            const graph = plot(view, [{ f }], 0, end, 0, top * 1.2, { from: 0, to: t, f });
            const texts = graph.svg.querySelectorAll('text');
            texts[texts.length - 2].textContent = 't (с)';
            texts[texts.length - 2].setAttribute('x', 430);
            texts[texts.length - 1].textContent = type === 'acceleration-area' ? 'a (м/с²)' : 'V (м/с)';
        }
        [time, v0, acceleration].filter(Boolean).forEach((input) => input.addEventListener('input', draw));
        draw();
    }
    function binary(host) {
        const { controls, view, result } = scaffold(host);
        const bits = [...'110011100110'].map(Number);
        const reset = element('button', { type: 'button' }, 'Вернуть CE6');
        controls.append(reset);
        function draw() {
            const wrap = element('div', { class: 'binary-groups' });
            const hex = [];
            for (let group = 0; group < 3; group += 1) {
                const block = element('div', { class: 'binary-group' });
                let value = 0;
                for (let i = 0; i < 4; i += 1) {
                    const index = group * 4 + i;
                    const weight = 2 ** (3 - i);
                    value += bits[index] * weight;
                    const label = element('label');
                    const input = element('input', { type: 'checkbox', 'aria-label': `Тетрада ${group + 1}, вес ${weight}` });
                    input.checked = Boolean(bits[index]);
                    input.addEventListener('change', () => {
                        bits[index] = input.checked ? 1 : 0;
                        draw();
                        view.querySelectorAll('input')[index]?.focus();
                    });
                    label.append(element('span', {}, String(weight)), input, element('strong', {}, String(bits[index])));
                    block.append(label);
                }
                hex.push(value.toString(16).toUpperCase());
                block.append(element('div', { class: 'binary-value' }, '= ' + hex[group]));
                wrap.append(block);
            }
            view.replaceChildren(wrap);
            result.textContent = `${bits.join('').match(/.{4}/g).join(' ')}₂ = ${hex.join('')}₁₆.`;
        }
        reset.addEventListener('click', () => {
            [...'110011100110'].forEach((value, i) => { bits[i] = Number(value); });
            draw();
        });
        draw();
    }
    function factorial(host) {
        const { controls, view, result } = scaffold(host);
        const n = range(controls, 'n', 0, 10, 1, 5);
        const next = element('button', { type: 'button' }, 'Следующий шаг');
        const reset = element('button', { type: 'button' }, 'С начала');
        controls.append(next, reset);
        let steps = 0;
        function draw() {
            const initial = Number(n.value);
            let value = 1;
            const list = element('ol');
            list.append(element('li', {}, `Ввод n = ${initial}; Q = 1.`));
            for (let i = 0; i < Math.min(steps, initial); i += 1) {
                const current = initial - i;
                const before = value;
                value *= current;
                list.append(element('li', {}, `n = ${current} ≥ 1: Q = ${before}·${current} = ${value}; n = ${current - 1}.`));
            }
            const ended = steps > initial;
            if (ended) {
                list.append(element('li', {}, 'n = 0: проверка ложна, конец.'));
            }
            next.disabled = ended;
            view.replaceChildren(list);
            result.textContent = ended ? `${initial}! = ${value}.` : `Текущие значения: n = ${Math.max(0, initial - steps)}, Q = ${value}.`;
        }
        next.addEventListener('click', () => { steps += 1; draw(); });
        reset.addEventListener('click', () => { steps = 0; draw(); });
        n.addEventListener('input', () => { steps = 0; draw(); });
        draw();
    }
    const graphTypes = ['exponential', 'cotangent', 'polynomial', 'absolute-trig', 'arctangent', 'sine-reciprocal', 'logarithm'];
    const relationTypes = ['divisibility', 'greater', 'relation-properties', 'relation-example', 'relation-seven', 'relation-triangular', 'odd-sum', 'square'];
    const matrixTypes = ['matrix-cell', 'matrix-types', 'transpose', 'matrix-product', 'determinant', 'minor'];
    function initialize(host) {
        if (host.dataset.ready) {
            return;
        }
        const type = host.dataset.widget;
        if (graphTypes.includes(type)) {
            stages(host, type);
        } else if (relationTypes.includes(type)) {
            relation(host, type);
        } else if (matrixTypes.includes(type)) {
            matrices(host, type);
        } else if (type === 'transform') {
            transform(host);
        } else if (type === 'sets' || type === 'de-morgan') {
            sets(host, type === 'de-morgan');
        } else if (type === 'bits' || type === 'homework-bits') {
            bits(host, type === 'homework-bits');
        } else if (type === 'sarrus') {
            sarrus(host);
        } else if (type === 'inverse-steps' || type === 'gauss-steps') {
            recordedSteps(host, type);
        } else if (type === 'logic') {
            logic(host);
        } else if (type === 'neighborhood') {
            neighborhood(host);
        } else if (type === 'nested') {
            nested(host);
        } else if (type === 'epsilon') {
            epsilon(host);
        } else if (['radius', 'displacement', 'vectors'].includes(type)) {
            vectors(host, type);
        } else if (['braking', 'velocity-area', 'acceleration-area'].includes(type)) {
            areas(host, type);
        } else if (type === 'binary') {
            binary(host);
        } else if (type === 'factorial') {
            factorial(host);
        } else {
            throw new Error('Unknown interactive: ' + type);
        }
        host.dataset.ready = 'true';
    }
    document.querySelectorAll('.interactive').forEach((disclosure) => {
        disclosure.addEventListener('toggle', () => {
            if (disclosure.open) {
                initialize(disclosure.querySelector('[data-widget]'));
            }
        });
    });
})();
