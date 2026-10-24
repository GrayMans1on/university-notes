(() => {
    'use strict';
    const ui = () => window.StudyToolUI;
    const number = (n) => Number.isFinite(n) ? Number(n.toPrecision(12)).toString() : 'Не определено';
    function mathField(title, value = '') {
        const { element } = ui();
        const label = element('label', title, 'math-label');
        const input = document.createElement('math-field');
        input.setAttribute('aria-label', title); input.value = value;
        input.mathVirtualKeyboardPolicy = 'manual';
        const shortcuts = { sum: '\\sum_{n=1}^{\\placeholder{}}\\placeholder{}',
            prod: '\\prod_{n=1}^{\\placeholder{}}\\placeholder{}', sqrt: '\\sqrt{\\placeholder{}}',
            sinh: '\\sinh', cosh: '\\cosh', tanh: '\\tanh', asin: '\\arcsin', acos: '\\arccos',
            atan: '\\arctan', acot: '\\operatorname{arccot}', asinh: '\\operatorname{arsinh}', acosh: '\\operatorname{arcosh}',
            atanh: '\\operatorname{artanh}', exp: '\\exp', floor: '\\lfloor\\placeholder{}\\rfloor',
            round: '\\operatorname{round}', sign: '\\operatorname{sign}',
            ceil: '\\lceil\\placeholder{}\\rceil', abs: '\\left|\\placeholder{}\\right|' };
        input.addEventListener('mount', () => {
            input.inlineShortcuts = { ...input.inlineShortcuts, ...shortcuts };
        });
        label.append(input); return { label, input };
    }
    function setup() {
        window.MathfieldElement.fontsDirectory = '/assets/mathlive/fonts';
        window.MathfieldElement.soundsDirectory = null;
        window.MathfieldElement.locale = 'ru';
    }
    function help() {
        const { element } = ui(); const details = element('details', undefined, 'math-help');
        details.append(element('summary', 'Функции и ввод'));
        details.append(element('p', 'Печатайте sqrt, sum, prod, sin, asin, sinh — запись превращается в математические символы. / создаёт дробь, ^ — степень; стрелки и Tab перемещают курсор внутри формулы.'));
        details.append(element('p', 'sin, cos, tan, cot, sec, csc; asin, acos, atan, acot; sinh, cosh, tanh, coth; asinh, acosh, atanh; ln, log, exp; sqrt, abs, floor, ceil, round, sign, min, max, факториал, суммы и произведения. Углы — в радианах. log — десятичный, log с индексом — по указанному основанию.'));
        return details;
    }
    function calculator(root) {
        setup(); const { element, button, row, say } = ui();
        const expression = mathField('Выражение', '\\sqrt{2}^{2}');
        const output = element('output', 'Введите выражение', 'tool-output');
        const history = element('div', undefined, 'math-history'); let ans = 0;
        function calculate() {
            const result = window.StudyMath.compile(expression.input.value)({ ans });
            if (!Number.isFinite(result)) { throw new Error('Результат не определён в вещественных числах.'); }
            ans = result; output.textContent = number(result); say('');
            const item = element('div', undefined, 'math-history-row');
            const formula = mathField('Вычисление', expression.input.value); formula.input.readOnly = true;
            formula.input.setAttribute('tabindex', '-1');
            item.append(formula.input, element('strong', '= ' + number(result))); history.prepend(item);
        }
        expression.input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') { event.preventDefault(); try { calculate(); } catch (e) { say(e.message); } }
        });
        const keys = element('div', undefined, 'tool-calculator-keys');
        for (const [label, latex] of [['7', '7'], ['8', '8'], ['9', '9'], ['÷', '\\frac{#@}{#?}'], ['√', '\\sqrt{#?}'],
            ['4', '4'], ['5', '5'], ['6', '6'], ['×', '\\cdot'], ['xⁿ', '^{#?}'], ['1', '1'], ['2', '2'],
            ['3', '3'], ['−', '-'], ['!', '!'], ['0', '0'], ['.', '.'], ['(', '('], [')', ')'], ['+', '+'],
            ['sin', '\\sin(#?)'], ['cos', '\\cos(#?)'], ['tan', '\\tan(#?)'], ['ln', '\\ln(#?)'],
            ['log', '\\log_{#?}(#?)'], ['π', '\\pi'], ['e', 'e'], ['ans', '\\operatorname{ans}'],
            ['|x|', '\\left|#?\\right|'], ['∑', '\\sum_{n=1}^{#?}#?']]) {
            keys.append(button(label, () => { expression.input.insert(latex); expression.input.focus(); }));
        }
        root.append(expression.label, row(button('Вычислить', calculate, 'primary'), button('Очистить ввод', () => {
            expression.input.value = ''; expression.input.focus();
        })), output, keys, help(), history);
    }
    function formulas(root) {
        setup(); const { element, field, select, button, row, exportFile, historyBar, say, id } = ui();
        const W = window.StudyWorkspace; const T = window.StudyTools;
        let items = W.read().formulas; let active = items[0]?.id;
        const history = new T.History(items); const picker = select('Сохранённые формулы', []);
        const title = field('Название', 'Новая формула'); const code = mathField('Формула', '\\frac{a}{b}');
        const bar = historyBar(history, (value) => { items = value; W.save('formulas', items); load(); });
        function load() {
            picker.input.replaceChildren(...items.map((item) => new Option(item.title || 'Без названия', item.id)));
            const current = items.find((item) => item.id === active) || items[0]; active = current?.id;
            if (current) { picker.input.value = current.id; title.input.value = current.title; code.input.value = current.code; }
        }
        function save() {
            let item = items.find((value) => value.id === active);
            if (!item) { item = { id: id(), title: title.input.value, code: code.input.value }; items.push(item); active = item.id; }
            item.title = title.input.value; item.code = code.input.value;
            W.save('formulas', items); history.push(items); bar.update();
            const option = [...picker.input.options].find((value) => value.value === active);
            if (option) { option.textContent = item.title; }
            else { picker.input.append(new Option(item.title, item.id)); picker.input.value = active; }
            say('Сохранено на этом устройстве.');
        }
        picker.input.addEventListener('change', () => { active = picker.input.value; load(); });
        for (const input of [title.input, code.input]) {
            input.addEventListener('input', () => { try { save(); } catch (e) { say(e.message); } });
        }
        root.append(picker.label, row(button('Новая формула', () => {
            const item = { id: id(), title: 'Новая формула', code: '' }; items.push(item); active = item.id;
            W.save('formulas', items); history.push(items); bar.update(); load(); code.input.focus();
        }, 'primary')), bar.node, title.label, code.label, help(), row(button('Сохранить формулу', save),
            button('Скачать TEX', () => exportFile('formula.tex', 'text/plain', code.input.value))));
        load();
    }
    function graphs(root) {
        setup(); const { element, button, row, say, id } = ui(); const T = window.StudyTools;
        const saved = T.storage.read('study-graphs', null);
        const entries = []; const colors = ['#4664dd', '#d66535', '#168371', '#a14bb0', '#b8831d', '#258ca6', '#a94665', '#5c7d29'];
        const list = element('div', undefined, 'graph-expressions');
        const stage = element('div', undefined, 'graph-stage');
        const canvas = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        canvas.classList.add('graph-canvas'); canvas.setAttribute('aria-label', 'Координатная плоскость');
        canvas.setAttribute('role', 'img'); canvas.setAttribute('tabindex', '0'); stage.append(canvas);
        let view = { x: 0, y: 0, scale: 42 }; let frame = 0;
        if (saved?.view && [saved.view.x, saved.view.y, saved.view.scale].every(Number.isFinite)
            && saved.view.scale > 1e-8 && saved.view.scale < 1e10) { view = saved.view; }
        function persist() {
            T.storage.write('study-graphs', { entries: entries.map((entry) => entry.math.input.value), view });
        }
        function queue() { if (!frame) { frame = requestAnimationFrame(() => { frame = 0; draw(); }); } }
        function add(value = '') {
            if (entries.length >= 8) { throw new Error('На одной плоскости доступно до восьми функций.'); }
            const entry = { id: id(), color: colors[entries.length % colors.length] };
            entry.math = mathField('Функция ' + (entries.length + 1), value);
            const container = element('div', undefined, 'graph-expression'); container.style.setProperty('--curve', entry.color);
            const error = element('small', '', 'graph-error');
            const remove = button('×', () => { entries.splice(entries.indexOf(entry), 1); container.remove(); persist(); queue(); });
            remove.setAttribute('aria-label', 'Убрать функцию');
            container.append(entry.math.label, remove, error); entry.error = error; entries.push(entry); list.append(container);
            entry.math.input.addEventListener('input', () => { persist(); queue(); });
            persist(); queue();
        }
        function draw() {
            const width = Math.max(300, stage.clientWidth || 800); const height = Math.max(400, Math.min(700, innerHeight - 220));
            canvas.setAttribute('viewBox', `0 0 ${width} ${height}`); canvas.style.height = height + 'px';
            const sx = (x) => width / 2 + (x - view.x) * view.scale;
            const sy = (y) => height / 2 - (y - view.y) * view.scale;
            const x0 = view.x - width / 2 / view.scale; const x1 = view.x + width / 2 / view.scale;
            const y0 = view.y - height / 2 / view.scale; const y1 = view.y + height / 2 / view.scale;
            const base = 10 ** Math.floor(Math.log10(80 / view.scale));
            const ratio = 80 / view.scale / base; const step = base * (ratio > 5 ? 10 : ratio > 2 ? 5 : ratio > 1 ? 2 : 1);
            const parts = []; const label = (v) => Math.abs(v) < step * 1e-8 ? '0' : Number(v.toPrecision(6)).toString();
            for (let x = Math.ceil(x0 / step) * step, i = 0; x <= x1 && i < 80; x += step, i += 1) {
                const p = sx(x); parts.push(`<path d="M${p} 0V${height}" class="graph-grid"/>`);
                parts.push(`<text x="${p + 4}" y="${Math.max(16, Math.min(height - 8, sy(0) + 18))}">${T.escape(label(x))}</text>`);
            }
            for (let y = Math.ceil(y0 / step) * step, i = 0; y <= y1 && i < 80; y += step, i += 1) {
                const p = sy(y); parts.push(`<path d="M0 ${p}H${width}" class="graph-grid"/>`);
                if (Math.abs(y) > step * 1e-8) {
                    parts.push(`<text x="${Math.max(5, Math.min(width - 65, sx(0) + 7))}" y="${p - 5}">${T.escape(label(y))}</text>`);
                }
            }
            parts.push(`<path d="M${sx(0)} 0V${height}M0 ${sy(0)}H${width}" class="graph-axes"/>`);
            for (const entry of entries) {
                entry.error.textContent = ''; const text = entry.math.input.value.replace(/^y\s*=/, '');
                if (!text.trim()) { continue; }
                try {
                    if (entry.source !== text) { entry.fn = window.StudyMath.compile(text); entry.source = text; }
                    const fn = entry.fn; let path = ''; let previous;
                    const samples = Math.min(1600, Math.ceil(width * 1.5));
                    for (let i = 0; i <= samples; i += 1) {
                        const px = i / samples * width; const x = x0 + (x1 - x0) * i / samples;
                        const y = fn({ x }); const py = sy(y);
                        if (!Number.isFinite(py) || Math.abs(py) > height * 6) { previous = undefined; continue; }
                        const join = previous !== undefined && Math.abs(py - previous) < height * .7;
                        path += (join ? 'L' : 'M') + px.toFixed(2) + ' ' + py.toFixed(2); previous = py;
                    }
                    parts.push(`<path data-curve="${entry.id}" d="${path}" stroke="${entry.color}" fill="none" stroke-width="2.5"/>`);
                } catch (e) { entry.error.textContent = e.message; }
            }
            canvas.innerHTML = parts.join('');
        }
        function zoom(factor, clientX, clientY) {
            const rect = canvas.getBoundingClientRect(); const x = (clientX ?? rect.left + rect.width / 2) - rect.left - rect.width / 2;
            const y = (clientY ?? rect.top + rect.height / 2) - rect.top - rect.height / 2;
            const scale = Math.max(1e-8, Math.min(1e10, view.scale * factor));
            view.x += x / view.scale - x / scale; view.y -= y / view.scale - y / scale; view.scale = scale;
            persist(); queue();
        }
        canvas.addEventListener('wheel', (event) => {
            event.preventDefault(); zoom(Math.exp(-Math.max(-300, Math.min(300, event.deltaY)) * .002), event.clientX, event.clientY);
        }, { passive: false });
        let drag; const pointers = new Map(); let pinch;
        canvas.addEventListener('pointerdown', (event) => {
            if (event.button !== 0) { return; } canvas.setPointerCapture(event.pointerId);
            pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
            drag = { x: event.clientX, y: event.clientY, view: { ...view } };
            if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); }
        });
        canvas.addEventListener('pointermove', (event) => {
            if (!pointers.has(event.pointerId)) { return; }
            pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
            if (pointers.size === 2) {
                const [a, b] = [...pointers.values()]; const distance = Math.hypot(a.x - b.x, a.y - b.y);
                if (pinch > 0) { zoom(distance / pinch, (a.x + b.x) / 2, (a.y + b.y) / 2); }
                pinch = distance; drag = null;
            } else if (drag) {
                view.x = drag.view.x - (event.clientX - drag.x) / view.scale;
                view.y = drag.view.y + (event.clientY - drag.y) / view.scale; queue();
            }
        });
        const release = (event) => { pointers.delete(event.pointerId); drag = null; pinch = null; persist(); };
        canvas.addEventListener('pointerup', release); canvas.addEventListener('pointercancel', release);
        canvas.addEventListener('keydown', (event) => {
            const changes = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
            if (changes[event.key]) {
                event.preventDefault(); view.x += changes[event.key][0] * 40 / view.scale;
                view.y += changes[event.key][1] * 40 / view.scale; persist(); queue();
            }
        });
        const reset = () => { view = { x: 0, y: 0, scale: 42 }; persist(); queue(); };
        canvas.addEventListener('dblclick', reset);
        stage.append(row(button('+', () => zoom(1.4)), button('−', () => zoom(1 / 1.4)), button('⌂', reset)));
        stage.lastChild.classList.add('graph-controls');
        const layout = element('div', undefined, 'graph-workbench'); const sidebar = element('div');
        sidebar.append(list, button('Добавить функцию', () => add()), help()); layout.append(sidebar, stage); root.append(layout);
        const initial = Array.isArray(saved?.entries) ? saved.entries.slice(0, 8) : ['\\sin(x)', 'x^2'];
        for (const value of initial) { add(String(value).slice(0, 1200)); }
        new ResizeObserver(queue).observe(stage);
        new MutationObserver(queue).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        say('Перетаскивайте плоскость. Колесо и жест двумя пальцами меняют масштаб; двойной щелчок возвращает начало координат.');
        draw();
    }
    window.StudyMathTools = { calculator, formulas, graphs };
})();
