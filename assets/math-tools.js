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
        setup(); const { element, field, button, row, historyBar, say } = ui(); const T = window.StudyTools;
        const title = field('Название документа', 'Вычисления'); const list = element('div', undefined, 'math-notebook');
        let entries = []; let initialized = false; let activeInput;
        const snapshot = () => ({ format: 'csu-math', version: 1, title: title.input.value,
            expressions: entries.map((entry) => entry.math.input.value) });
        function validate(data) {
            if (data?.format !== 'csu-math' || data.version !== 1 || typeof data.title !== 'string'
                || data.title.length > 160 || !Array.isArray(data.expressions) || data.expressions.length > 40
                || !data.expressions.every((text) => typeof text === 'string' && text.length <= 1200)) {
                throw new Error('Это не документ калькулятора ЧелГУ.');
            }
            return { format: 'csu-math', version: 1, title: data.title, expressions: [...data.expressions] };
        }
        const history = new T.History({ format: 'csu-math', version: 1, title: 'Вычисления', expressions: [''] });
        const session = window.StudySessions.files(root, {
            filename: 'calculations.csumath', extension: '.csumath', get: snapshot, validate,
            set: (data) => { load(data); history.push(snapshot()); bar.update(); },
            legacy: () => window.StudyWorkspace.legacy('formulas').map((item) => ({ title: item.title,
                value: { format: 'csu-math', version: 1, title: item.title || 'Формула', expressions: [item.code || ''] } })),
        });
        const bar = historyBar(history, (value) => { load(value); session.changed(); });
        function changed() {
            if (!initialized) { return; } history.push(snapshot()); bar.update(); session.changed();
        }
        function calculate() {
            const scope = { ans: 0 }; let count = 0;
            for (const entry of entries) {
                entry.output.replaceChildren(); const text = entry.math.input.value;
                if (!text.trim()) { continue; }
                try {
                    let ast = window.StudyMath.parse(text); let variable;
                    if (Array.isArray(ast) && ast[0] === 'Equal' && ast.length === 3 && typeof ast[1] === 'string') {
                        variable = ast[1]; ast = ast[2];
                        if (!/^[a-zA-Z][a-zA-Z0-9_]{0,30}$/.test(variable)
                            || ['constructor', 'prototype', '__proto__', 'Pi', 'ExponentialE', 'ans'].includes(variable)) {
                            throw new Error('Недопустимое имя переменной.');
                        }
                    }
                    const value = window.StudyMath.compile(ast)(scope);
                    if (!Number.isFinite(value)) { throw new Error('Результат не определён в вещественных числах.'); }
                    if (variable) { scope[variable] = value; }
                    scope.ans = value; count += 1;
                    entry.output.append(element('span', (variable ? variable + ' = ' : '= ') + number(value)));
                } catch (error) { entry.output.append(element('span', error.message, 'math-line-error')); }
            }
            say(count ? 'Вычислено строк: ' + count + '. Углы — в радианах.' : 'Введите выражение или задайте переменную: a = 2.');
        }
        function add(value = '', focus = false) {
            if (entries.length >= 40) { throw new Error('В документе доступно до 40 строк.'); }
            const entry = { math: mathField('Выражение ' + (entries.length + 1), value), output: element('output', '', 'math-line-result') };
            const container = element('div', undefined, 'math-notebook-line');
            const remove = button('×', () => { entries.splice(entries.indexOf(entry), 1); container.remove(); changed(); calculate(); });
            remove.setAttribute('aria-label', 'Убрать строку');
            container.append(entry.math.label, remove, entry.output); entries.push(entry); list.append(container);
            entry.math.input.addEventListener('focusin', () => { activeInput = entry.math.input; });
            entry.math.input.addEventListener('input', () => { changed(); calculate(); });
            entry.math.input.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') { event.preventDefault(); calculate(); add('', true); changed(); }
            });
            if (focus) { entry.math.input.focus(); activeInput = entry.math.input; }
            return entry;
        }
        function load(data) {
            initialized = false; entries = []; list.replaceChildren(); title.input.value = data.title;
            for (const text of data.expressions.length ? data.expressions : ['']) { add(text); }
            activeInput = entries[0].math.input; initialized = true; calculate();
        }
        title.input.addEventListener('input', changed);
        const keys = element('div', undefined, 'tool-calculator-keys');
        for (const [label, latex] of [['7', '7'], ['8', '8'], ['9', '9'], ['÷', '\\frac{#@}{#?}'], ['√', '\\sqrt{#?}'],
            ['4', '4'], ['5', '5'], ['6', '6'], ['×', '\\cdot'], ['xⁿ', '^{#?}'], ['1', '1'], ['2', '2'],
            ['3', '3'], ['−', '-'], ['!', '!'], ['0', '0'], ['.', '.'], ['(', '('], [')', ')'], ['+', '+'],
            ['sin', '\\sin(#?)'], ['cos', '\\cos(#?)'], ['ln', '\\ln(#?)'], ['π', '\\pi'], ['∑', '\\sum_{n=1}^{#?}#?']]) {
            keys.append(button(label, () => { activeInput?.insert(latex); activeInput?.focus(); changed(); calculate(); }));
        }
        root.append(title.label, row(button('Вычислить', calculate, 'primary'), button('Добавить выражение', () => { add('', true); changed(); }),
            button('Новый документ', () => session.replace(() => {
                load({ title: 'Вычисления', expressions: [''] }); history.push(snapshot()); bar.update(); session.saved();
            })), button('Скачать TEX', () => {
                ui().exportFile('calculations.tex', 'text/plain', entries.map((entry) => entry.math.input.value).join('\n\n'));
            })), bar.node, list, keys, help());
        load({ title: 'Вычисления', expressions: [''] }); session.saved();
    }
    const formulas = calculator;
    function graphs(root) {
        setup(); const { element, button, row, say, id } = ui(); const T = window.StudyTools;
        let initializing = true; const saved = null;
        const entries = []; const colors = ['#4664dd', '#d66535', '#168371', '#a14bb0', '#b8831d', '#258ca6', '#a94665', '#5c7d29'];
        const list = element('div', undefined, 'graph-expressions');
        const stage = element('div', undefined, 'graph-stage');
        const canvas = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        canvas.classList.add('graph-canvas'); canvas.setAttribute('aria-label', 'Координатная плоскость');
        canvas.setAttribute('role', 'img'); canvas.setAttribute('tabindex', '0'); stage.append(canvas);
        let view = { x: 0, y: 0, scale: 42 }; let frame = 0;
        if (saved?.view && [saved.view.x, saved.view.y, saved.view.scale].every(Number.isFinite)
            && saved.view.scale > 1e-8 && saved.view.scale < 1e10) { view = saved.view; }
        function validate(data) {
            if (data?.format !== 'csu-graphs' || data.version !== 1 || !Array.isArray(data.entries)
                || data.entries.length > 8 || !data.entries.every((text) => typeof text === 'string' && text.length <= 1200)
                || !data.view || ![data.view.x, data.view.y, data.view.scale].every(Number.isFinite)
                || Math.max(Math.abs(data.view.x), Math.abs(data.view.y)) > 1e12 || data.view.scale < 1e-8 || data.view.scale > 1e10) {
                throw new Error('Это не документ графиков ЧелГУ.');
            }
            return { format: 'csu-graphs', version: 1, entries: [...data.entries], view: { ...data.view } };
        }
        const session = window.StudySessions.files(root, {
            filename: 'graphs.csugraph', extension: '.csugraph', validate,
            get: () => ({ format: 'csu-graphs', version: 1, entries: entries.map((entry) => entry.math.input.value), view }),
            set: (data) => {
                initializing = true; entries.splice(0); list.replaceChildren(); view = { ...data.view };
                data.entries.forEach((text) => add(text)); initializing = false; draw();
            }, legacy: () => {
                const old = T.storage.read('study-graphs', null);
                return old ? [{ title: 'Прежние графики', value: { format: 'csu-graphs', version: 1, ...old } }] : [];
            },
        });
        function persist() {
            if (!initializing) { session.changed(); }
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
        initializing = false; session.saved(); draw();
    }
    window.StudyMathTools = { calculator, formulas, graphs, mathField, setup, help };
})();
