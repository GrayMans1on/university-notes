(() => {
    'use strict';
    function limits(root) {
        const { element, field, select, button, row, say } = window.StudyToolUI;
        const M = window.StudyMathTools; M.setup();
        const expression = M.mathField('Выражение под знаком предела', '\\frac{\\sin x}{x}');
        const destination = M.mathField('Точка предела', '0');
        for (const input of [expression.input, destination.input]) {
            input.addEventListener('mount', () => {
                const shortcuts = { ...input.inlineShortcuts };
                // Short prefixes must not replace the start of "inf" or "infinity".
                for (const key of ['in', '!in', 'notin', 'isin', 'xin', 'infin', 'infty']) { delete shortcuts[key]; }
                input.inlineShortcuts = { ...shortcuts, inf: '\\infty', infinity: '\\infty',
                    tg: '\\tan', ctg: '\\cot', arctg: '\\arctan' };
                input.inlineShortcutTimeout = 0;
            });
        }
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
                destination: destination.input.value, direction: 'both',
                variable: variable.input.value, parameters: parameters.input.value }),
            set: (data) => {
                stop(); expression.input.value = data.expression; destination.input.value = data.destination;
                variable.input.value = data.variable;
                parameters.input.value = data.parameters; updateDirection(); result.replaceChildren();
                if (data.direction !== 'both') {
                    result.append(element('p', 'Файл открыт. Сейчас вычисляется общий предел с двух сторон.', 'tool-help'));
                }
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
                : data.kind === 'domain' ? 'Проверьте область определения' : 'Не удалось решить изученными методами'));
            if (data.reason) { heading.append(element('p', data.reason)); }
            result.append(heading);
            if (data.chain?.length) {
                const chain = element('div', undefined, 'limit-chain'); chain.setAttribute('aria-label', 'Цепочка решения текущего предела');
                data.chain.forEach((entry, index) => {
                    const term = math((index ? '=' : '') + entry.math, 'limit-chain-term'); chain.append(term);
                    if (entry.annotation) {
                        const hint = math('\left[' + entry.annotation + '\right]', 'limit-chain-hint');
                        hint.title = 'Подсказка о форме после подстановки; не значение выражения.'; chain.append(hint);
                    }
                });
                heading.append(chain);
                const explanations = element('details', undefined, 'limit-chain-notes');
                explanations.append(element('summary', 'Пояснения к переходам'));
                const notes = data.chain.filter((entry) => entry.note && entry.kind !== 'answer');
                if (notes.length) { steps(notes.map((entry) => ({ text: entry.note, source: entry.source })), explanations, data.sources); }
                else { explanations.append(element('p', 'Применяем арифметические свойства пределов и поведение элементарной функции.')); }
                result.append(explanations);
                if (solved && data.chainComplete === false) {
                    result.append(element('p', 'Ответ проверен, но развёрнутая цепочка преобразований для этой записи пока не построена.', 'tool-help'));
                }
                if (solved && window.StudyManim) { window.StudyManim.attach(data, result); }
            } else if (data.latex) { heading.append(math(data.steps[0].math + '=' + data.latex)); }

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
                direction: 'both', options: { variable: variable.input.value, parameters: values } });
        }, 'primary');
        function updateDirection() {
            const pointText = destination.input.value.replace(/\\[a-zA-Z]+/g, 'p').replace(/[{}\s]/g, '');
            const width = Math.max(30, Math.min(140, pointText.length * 10 + 8));
            destination.input.style.width = width + 'px';
            operator.style.minWidth = Math.max(76, width + 48) + 'px';
        }
        variable.input.addEventListener('change', () => {
            if (variable.input.value === 'n') { destination.input.value = '\\infty'; }
            stop(); updateDirection(); result.replaceChildren(); session.changed();
        });
        for (const input of [expression.input, destination.input, parameters.input]) {
            input.addEventListener('input', () => { stop(); updateDirection(); result.replaceChildren(); session.changed(); });
        }
        function hideCaption(label) {
            const caption = element('span', label.firstChild.textContent, 'sr-only'); label.firstChild.replaceWith(caption);
        }
        hideCaption(expression.label); hideCaption(destination.label); hideCaption(variable.label);
        const operator = element('div', undefined, 'limit-operator'); operator.append(element('span', 'lim', 'limit-word'));
        const target = element('div', undefined, 'limit-target'); target.append(variable.label, element('span', '→'), destination.label);
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
            ['Разрыв функции', '\\frac{x}{1-x}', '1']]) {
            samples.append(button(name, () => {
                stop(); result.replaceChildren(); expression.input.value = code; destination.input.value = point;
                variable.input.value = 'x'; updateDirection(); session.changed();
            }));
        }
        examples.append(samples);
        root.append(inputBox, row(calculateButton, button('Остановить', stop)), constants, help, examples, result);
        const hint = element('p', 'Точка под lim: число, inf или infinity → ∞. Вычисляется общий предел.', 'tool-help');
        inputBox.after(hint); updateDirection();
    }
    window.StudyLimitUI = { limits };
})();
