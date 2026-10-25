(() => {
    'use strict';
    function limits(root) {
        const { element, field, select, button, row, say } = window.StudyToolUI;
        const M = window.StudyMathTools; M.setup();
        const expression = M.mathField('Выражение под знаком предела', '\\frac{\\sin x}{x}');
        expression.input.addEventListener('mount', () => {
            expression.input.inlineShortcuts = { ...expression.input.inlineShortcuts, tg: '\\tan', ctg: '\\cot', arctg: '\\arctan' };
        });
        const destination = M.mathField('Точка предела', '0');
        const direction = select('Приближение', [['both', 'С двух сторон'], ['left', 'Слева'], ['right', 'Справа']], 'both');
        const variable = select('Переменная', [['x', 'x'], ['n', 'n']], 'x');
        const parameters = field('Значения параметров', ''); parameters.input.placeholder = 'a=2; b=3';
        parameters.input.maxLength = 400;
        const result = element('section', undefined, 'limit-result'); result.setAttribute('aria-live', 'polite');
        let worker; let timer; let job = 0;
        function readParameters(text) {
            const values = {};
            for (const part of text.split(/[;\n]+/).filter((s) => s.trim())) {
                const match = /^\s*([a-df-mo-wyz])\s*=\s*([+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[+-]?\d+)?)\s*$/i.exec(part);
                if (!match || !Number.isFinite(Number(match[2].replace(',', '.')))) {
                    throw new Error('Параметры задаются числами: a=2; b=3.');
                }
                values[match[1]] = Number(match[2].replace(',', '.'));
            }
            return values;
        }
        function validate(value) {
            if (value?.format !== 'csu-limit' || value.version !== 1 || typeof value.expression !== 'string'
                || value.expression.length > 1200 || typeof value.destination !== 'string' || value.destination.length > 160
                || !['both', 'left', 'right'].includes(value.direction)
                || (value.variable !== undefined && !['x', 'n'].includes(value.variable))
                || (value.parameters !== undefined && (typeof value.parameters !== 'string' || value.parameters.length > 400))) {
                throw new Error('Это не документ пределов ЧелГУ.');
            }
            readParameters(value.parameters || '');
            return { format: 'csu-limit', version: 1, expression: value.expression, destination: value.destination,
                direction: value.direction, variable: value.variable || 'x', parameters: value.parameters || '' };
        }
        const session = window.StudySessions.files(root, {
            filename: 'limit.csulimit', extension: '.csulimit', validate,
            get: () => ({ format: 'csu-limit', version: 1, expression: expression.input.value,
                destination: destination.input.value, direction: direction.input.value,
                variable: variable.input.value, parameters: parameters.input.value }),
            set: (data) => {
                stop(); expression.input.value = data.expression; destination.input.value = data.destination;
                direction.input.value = data.direction; variable.input.value = data.variable;
                parameters.input.value = data.parameters; updateDirection(); result.replaceChildren();
            },
        });
        function math(text, className = '') {
            const block = element('div', undefined, 'limit-math ' + className);
            window.katex.render(text, block, { throwOnError: false, trust: false, displayMode: true, maxExpand: 1000 });
            return block;
        }
        function steps(items, container, sources) {
            const list = element('ol', undefined, 'limit-steps');
            for (const item of items) {
                const li = element('li'); li.append(element('p', item.text));
                if (item.math) { li.append(math(item.math)); }
                const source = sources?.[item.source];
                if (source && /^topic-[a-f0-9]{10}$/.test(source[1])) {
                    const link = element('a', source[0], 'limit-source'); link.href = '/notes/calculus/#' + source[1];
                    link.target = '_blank'; link.rel = 'noopener'; li.append(link);
                }
                list.append(li);
            }
            container.append(list);
        }
        function show(data) {
            result.replaceChildren();
            const solved = ['finite', 'infinite'].includes(data.kind);
            const heading = element('div', undefined, 'limit-answer');
            heading.append(element('h2', solved ? 'Решение' : data.kind === 'dne' ? 'Предел не существует'
                : data.kind === 'domain' ? 'Нет области определения с выбранной стороны' : 'Не удалось решить изученными методами'));
            if (data.latex) { heading.append(math(data.steps[0].math + '=' + data.latex, 'limit-final-formula')); }
            if (data.reason) { heading.append(element('p', data.reason)); }
            result.append(heading);
            const sides = data.sides || []; const source = data.sources;
            if (solved && sides.length === 2) {
                steps(sides[1].steps, result, source);
                const check = element('details', undefined, 'limit-side-check'); check.append(element('summary', 'Проверка слева — тот же результат'));
                steps(sides[0].steps, check, source); result.append(check,
                    element('p', 'Оба односторонних предела совпадают. Получен двусторонний предел.', 'limit-conclusion'));
            } else if (sides.length === 1) { steps(sides[0].steps, result, source); }
            else {
                for (const side of sides) {
                    const section = element('section', undefined, 'limit-side');
                    section.append(element('h3', side.side === 'left' ? 'Слева' : 'Справа'));
                    if (side.reason) { section.append(element('p', side.reason)); }
                    steps(side.steps, section, source); result.append(section);
                }
            }
        }
        function stop() {
            job += 1; clearTimeout(timer); worker?.terminate(); worker = null;
            if (calculateButton) { calculateButton.disabled = false; }
        }
        const calculateButton = button('Вычислить предел', () => {
            stop(); result.replaceChildren(); const values = readParameters(parameters.input.value);
            session.changed(); const currentJob = job; calculateButton.disabled = true;
            say('Строится решение по методам из конспекта…');
            worker = new Worker('/assets/limits-worker.js?v=__LIMITS_BUILD__');
            worker.onmessage = (event) => {
                if (currentJob !== job || event.data.job !== currentJob) { return; }
                clearTimeout(timer); calculateButton.disabled = false;
                if (event.data.error) {
                    result.replaceChildren(element('h2', 'Решение не построено'), element('p', event.data.error)); say('');
                } else { show(event.data.result); say(''); }
                worker?.terminate(); worker = null;
            };
            worker.onerror = () => {
                if (currentJob !== job) { return; } stop(); say('Не удалось загрузить решатель. Проверьте соединение.');
            };
            timer = setTimeout(() => {
                stop(); result.replaceChildren(element('h2', 'Не удалось решить изученными методами'),
                    element('p', 'Превышено время разбора. Ответ не определён; это ограничение алгоритма.')); say('');
            }, 10000);
            worker.postMessage({ job: currentJob, expression: expression.input.value, destination: destination.input.value,
                direction: direction.input.value, options: { variable: variable.input.value, parameters: values } });
        }, 'primary');
        const sideTag = element('span', '', 'limit-direction-tag'); sideTag.setAttribute('aria-hidden', 'true');
        function updateDirection() {
            sideTag.textContent = direction.input.value === 'left' ? '−' : direction.input.value === 'right' ? '+' : '';
            direction.input.disabled = variable.input.value === 'n';
        }
        variable.input.addEventListener('change', () => {
            if (variable.input.value === 'n') { destination.input.value = '\\infty'; direction.input.value = 'both'; }
            updateDirection();
        });
        for (const input of [expression.input, destination.input, direction.input, variable.input, parameters.input]) {
            input.addEventListener('input', () => { stop(); updateDirection(); result.replaceChildren(); session.changed(); });
        }
        function hideCaption(label) {
            const caption = element('span', label.firstChild.textContent, 'sr-only'); label.firstChild.replaceWith(caption);
        }
        hideCaption(expression.label); hideCaption(destination.label); hideCaption(variable.label);
        const operator = element('div', undefined, 'limit-operator'); operator.append(element('span', 'lim', 'limit-word'));
        const target = element('div', undefined, 'limit-target'); target.append(variable.label, element('span', '→'), destination.label, sideTag);
        operator.append(target);
        const inputBox = element('div', undefined, 'limit-input-box'); inputBox.append(operator, expression.label);
        const help = element('details', undefined, 'limit-course-help'); help.append(element('summary', 'Методы из пройденного курса'));
        help.append(element('p', 'Подстановка, общий знаменатель, сокращение, сопряжённое выражение, старшая степень, шкала роста, первый и второй замечательные пределы и стандартные следствия. В решениях используются только методы из конспектов.'));
        help.append(element('p', 'Если преобразований недостаточно, решатель сообщает об этом. Невозможность построить решение не означает, что задача вне программы. Для последовательности выберите n под знаком lim.'));
        const constants = element('details', undefined, 'limit-parameters'); constants.append(element('summary', 'Параметры a, b и другие'), parameters.label,
            element('p', 'Для выражений с параметрами задайте числовые значения. Общий символьный ответ с условиями на параметры пока не поддерживается.', 'tool-help'));
        const examples = element('details', undefined, 'limit-examples'); examples.append(element('summary', 'Примеры из конспекта'));
        const samples = row();
        for (const [name, code, point] of [['Сокращение', '\\frac{x^2-1}{x-1}', '1'], ['sin x / x', '\\frac{\\sin x}{x}', '0'],
            ['Сопряжённое', '\\sqrt{x^2+1}-x', '\\infty'], ['Второй замечательный', '(1+2x)^{3/x}', '0'],
            ['Разные стороны', '\\frac{x}{1-x}', '1']]) {
            samples.append(button(name, () => {
                stop(); result.replaceChildren(); expression.input.value = code; destination.input.value = point;
                variable.input.value = 'x'; direction.input.value = 'both'; updateDirection(); session.changed();
            }));
        }
        examples.append(samples);
        root.append(inputBox, row(calculateButton, button('Остановить', stop), direction.label), constants, help, examples, result);
        updateDirection();
    }
    window.StudyLimitUI = { limits };
})();
