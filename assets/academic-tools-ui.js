(() => {
    'use strict';
    function math(text) {
        const node = window.StudyToolUI.element('div', undefined, 'limit-math');
        window.katex.render(text, node, { throwOnError: false, trust: false, displayMode: true, maxExpand: 1000 });
        return node;
    }
    function steps(items, output) {
        const { element } = window.StudyToolUI; const list = element('ol', undefined, 'limit-steps');
        for (const step of items) {
            const li = element('li'); li.append(element('p', step.text));
            if (step.operation) { li.append(math(step.operation)); }
            if (step.math) { li.append(math(step.math)); } list.append(li);
        }
        output.append(list);
    }
    function files(root, format, fields, output, extension) {
        const get = () => ({ format, version: 1, ...Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, field.input.value])) });
        function validate(data) {
            if (data?.format !== format || data.version !== 1) { throw new Error('Это документ другого инструмента.'); }
            const value = { format, version: 1 };
            for (const [key, field] of Object.entries(fields)) {
                if (typeof data[key] !== 'string' || data[key].length > 6000
                    || (field.input.tagName === 'SELECT' && ![...field.input.options].some((o) => o.value === data[key]))) {
                    throw new Error('Недопустимое поле документа: ' + key);
                }
                value[key] = data[key];
            }
            return value;
        }
        const session = window.StudySessions.files(root, { filename: 'study' + extension, extension, get, validate,
            set: (data) => { for (const [key, field] of Object.entries(fields)) { field.input.value = data[key]; } output.replaceChildren(); } });
        for (const field of Object.values(fields)) {
            for (const event of ['input', 'change']) {
                field.input.addEventListener(event, () => { output.replaceChildren(); session.changed(); });
            }
        }
        return session;
    }
    function courseLink(root, discipline, topic, label) {
        const { element } = window.StudyToolUI; const link = element('a', label, 'limit-source');
        link.href = '/notes/' + discipline + '/#' + topic; root.append(link);
    }
    function derivatives(root) {
        window.StudyMathTools.setup(); const { element, button, row, say } = window.StudyToolUI;
        const expression = window.StudyMathTools.mathField('Функция f(x)', 'x^2\\sin x');
        const output = element('section', undefined, 'academic-result'); output.setAttribute('aria-live', 'polite');
        const session = files(root, 'csu-derivative', { expression }, output, '.csuderivative');
        root.append(expression.label, row(button('Найти производную', () => {
            output.replaceChildren(); session.changed(); say('');
            try {
                const result = window.StudyDerivatives.solve(expression.input.value);
                output.append(math(result.chain));
                if (result.conditions.length) {
                    output.append(element('p', 'Решение на области, где выполняются условия применённых правил:'),
                        math(result.conditions.join(',\\quad ')),
                        element('p', 'Граничные точки и дополнительные интервалы отдельно не исследуются.', 'tool-help'));
                }
                steps(result.steps, output);
            } catch (error) { output.append(element('h2', 'Решение не построено'), element('p', error.message)); }
        }, 'primary')),
        element('p', 'Таблица из конспекта, сумма, произведение, частное и сложная функция. Постоянные параметры обозначайте a, b, c.', 'tool-help'), output);
        courseLink(root, 'calculus', 'topic-e15460357d', 'Таблица и правила из конспекта');
    }
    function linear(root, system = false) {
        const { element, field, select, button, row, say } = window.StudyToolUI;
        const matrix = field(system ? 'Расширенная матрица [A | B]' : 'Матрица A', system ? '2 1 5\n1 -1 1' : '2 1\n1 1', 'textarea');
        matrix.input.className = 'matrix-input'; matrix.input.spellcheck = false;
        const mode = select('Действие', system ? [['system', 'Решить систему методом Гаусса']]
            : [['determinant', 'Определитель'], ['inverse', 'Обратная матрица']], system ? 'system' : 'determinant');
        const order = field('Порядок опорных столбцов', ''); order.input.placeholder = 'Автоматически слева направо; либо 3 4 1 2';
        const output = element('section', undefined, 'academic-result'); output.setAttribute('aria-live', 'polite');
        const session = files(root, system ? 'csu-system' : 'csu-matrix', { matrix, mode, order }, output, system ? '.csusystem' : '.csumatrix');
        const examples = element('details'); examples.append(element('summary', 'Пример из конспекта'));
        examples.append(button(system ? 'Две свободные переменные' : 'Обратная матрица 3×3', () => {
            matrix.input.value = system ? '12 9 3 10 13\n4 3 1 2 3\n8 6 2 5 7' : '3 -4 5\n2 -3 1\n3 -5 -1';
            order.input.value = system ? '3 4 1 2' : ''; if (!system) { mode.input.value = 'inverse'; }
            output.replaceChildren(); session.changed();
        }));
        const updateOrder = () => { order.label.hidden = mode.input.value === 'determinant'; };
        mode.input.addEventListener('change', updateOrder);
        new MutationObserver(updateOrder).observe(output, { childList: true }); updateOrder();
        root.append(mode.label, matrix.label, element('p', system
            ? 'Последний столбец — правая часть. Элементы разделяйте пробелами, строки — переводом строки. До 6 уравнений и 6 неизвестных.'
            : 'Квадратная матрица до 6×6. Поддерживаются целые числа, десятичные и обычные дроби.', 'tool-help'),
        order.label, row(button('Вычислить', () => {
            output.replaceChildren(); say(''); session.changed();
            try {
                const result = window.StudyLinear.solve(matrix.input.value, mode.input.value, order.input.value);
                const titles = { unique: 'Единственное решение', infinite: 'Бесконечно много решений', inconsistent: 'Решений нет',
                    determinant: 'Определитель', inverse: 'Обратная матрица', singular: 'Обратной матрицы нет' };
                output.append(element('h2', titles[result.kind]));
                if (result.latex) { output.append(math(result.latex)); }
                if (result.reason) { output.append(element('p', result.reason)); }
                steps(result.steps, output);
            } catch (error) { output.append(element('p', error.message)); }
        }, 'primary')), examples, output);
        courseLink(root, 'linear-algebra', 'topic-00dc9c9d8c', 'Метод Гаусса в конспекте');
        courseLink(root, 'linear-algebra', 'topic-14d4d8cfa8', 'Обратная матрица: методы и проверка');
    }
    function radix(root) {
        const { element, field, select, button, row, say } = window.StudyToolUI;
        const mode = select('Режим', [['convert', 'Перевод систем счисления'], ['calculate', 'Арифметика столбиком']], 'convert');
        const base = field('Исходное основание / основание вычисления', '2'); base.input.inputMode = 'numeric';
        const to = field('Новое основание', '16'); to.input.inputMode = 'numeric';
        const left = field('Первое число', '110011100110'); const right = field('Второе число', '101');
        const operator = select('Операция', [['+', '+'], ['-', '−'], ['*', '×'], ['/', '÷']], '+');
        const precision = field('Знаков после точки, не более 64', '24'); precision.input.inputMode = 'numeric';
        const output = element('section', undefined, 'academic-result'); output.setAttribute('aria-live', 'polite');
        const session = files(root, 'csu-radix', { mode, base, to, left, right, operator, precision }, output, '.csuradix');
        function update() {
            const conversion = mode.input.value === 'convert';
            right.label.hidden = conversion; operator.label.hidden = conversion; to.label.hidden = !conversion;
        }
        mode.input.addEventListener('change', update);
        // Imported mode changes do not dispatch input events.
        new MutationObserver(update).observe(output, { childList: true });
        const inputs = element('div', undefined, 'radix-inputs'); inputs.append(base.label, to.label, left.label, operator.label, right.label, precision.label);
        root.append(mode.label, inputs, element('p', 'Основания 2–36; цифры A–Z. Точка отделяет дробную часть. Скобки в ответе обозначают период, ≈ — обрезанный результат.', 'tool-help'),
            row(button('Вычислить', () => {
                output.replaceChildren(); say(''); session.changed();
                try {
                    const result = mode.input.value === 'convert'
                        ? window.StudyRadix.convert(left.input.value, base.input.value, to.input.value, Number(precision.input.value))
                        : window.StudyRadix.calculate(left.input.value, right.input.value, operator.input.value, base.input.value, Number(precision.input.value));
                    output.append(element('h2', (result.approximate ? '≈ ' : '= ') + result.result),
                        element('p', 'Основание ответа: ' + (result.to || result.base)));
                    if (mode.input.value === 'calculate') {
                        if (result.operator === '/') {
                            const division = element('div', undefined, 'radix-division');
                            const work = element('pre', result.normalized[0], 'radix-division-work');
                            const quotient = element('div', undefined, 'radix-division-quotient');
                            quotient.append(element('div', result.normalized[1]), element('strong', result.result));
                            division.append(work, quotient); output.append(division);
                        } else {
                            const align = (value) => {
                                const scale = Math.max(...[left.input.value, right.input.value].map((v) => (v.replace(',', '.').split('.')[1] || '').length));
                                const parts = value.trim().replace(',', '.').split('.');
                                return result.operator !== '*' && scale ? parts[0] + '.' + (parts[1] || '').padEnd(scale, '0') : value;
                            };
                            const rows = [align(left.input.value), operator.input.options[operator.input.selectedIndex].text + ' ' + align(right.input.value)];
                            rows.push(...(result.partials || []), result.result);
                            const width = Math.max(...rows.map((r) => r.length)); const column = element('pre', undefined, 'radix-columns');
                            column.textContent = rows.map((r, i) => (i === 2 || i === rows.length - 1 ? '─'.repeat(width) + '\n' : '') + r.padStart(width)).join('\n');
                            output.append(column);
                        }
                        output.append(element('p', result.operator === '/' ? 'Деление выполняется в выбранном основании. При дробных числах одинаково сдвигаем точку в делимом и делителе. Поразрядные вычитания и остатки показаны ниже.'
                            : result.operator === '*' ? 'Умножаем цифры без точек, складываем сдвинутые частичные произведения; в ответе отделяем суммарное количество дробных разрядов. Знаки учитываем отдельно.'
                                : 'Считаем по разрядам в выбранном основании, без перевода целых чисел в десятичную систему. При разных знаках сравниваем модули и вычитаем меньший из большего.', 'tool-help'));
                    }
                    const list = element('ol', undefined, 'radix-steps');
                    for (const step of result.steps) { list.append(element('li', typeof step === 'string' ? step : step.text)); }
                    output.append(list);
                } catch (error) { output.append(element('p', error.message)); }
            }, 'primary')), output); update();
        courseLink(root, 'informatics', 'topic-bfd9dc2d2c', 'Системы счисления в конспекте');
    }
    window.StudyAcademicUI = { derivatives, systems: (root) => linear(root, true), matrices: linear, radix };
})();
