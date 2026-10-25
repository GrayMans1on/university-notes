(() => {
    'use strict';
    function limits(root) {
        const { element, select, button, row, say } = window.StudyToolUI;
        const M = window.StudyMathTools; M.setup();
        const expression = M.mathField('Функция f(x)', '\\frac{x^2-1}{x-1}');
        const destination = M.mathField('К чему стремится x', '1');
        const direction = select('Приближение', [['both', 'С двух сторон'], ['left', 'Слева'], ['right', 'Справа']], 'both');
        const result = element('div', undefined, 'limit-result'); let worker; let timer; let job = 0;
        function validate(value) {
            if (value?.format !== 'csu-limit' || value.version !== 1 || typeof value.expression !== 'string'
                || value.expression.length > 1200 || typeof value.destination !== 'string' || value.destination.length > 160
                || !['both', 'left', 'right'].includes(value.direction)) { throw new Error('Это не документ пределов ЧелГУ.'); }
            return { format: 'csu-limit', version: 1, expression: value.expression,
                destination: value.destination, direction: value.direction };
        }
        const session = window.StudySessions.files(root, {
            filename: 'limit.csulimit', extension: '.csulimit', validate,
            get: () => ({ format: 'csu-limit', version: 1, expression: expression.input.value,
                destination: destination.input.value, direction: direction.input.value }),
            set: (data) => {
                stop(); expression.input.value = data.expression; destination.input.value = data.destination;
                direction.input.value = data.direction; result.replaceChildren();
            },
        });
        function math(text) {
            const block = element('div', undefined, 'limit-math');
            window.katex.render(text, block, { throwOnError: false, trust: false, displayMode: true, maxExpand: 1000 });
            return block;
        }
        function steps(items, container) {
            const list = element('ol', undefined, 'limit-steps');
            for (const item of items) {
                const li = element('li'); li.append(element('p', item.text));
                if (item.math) { li.append(math(item.math)); } list.append(li);
            }
            container.append(list);
        }
        function show(data) {
            result.replaceChildren(); const heading = element('div', undefined, 'tool-card-panel');
            heading.append(element('h2', data.kind === 'dne' ? 'Предел не существует'
                : ['finite', 'infinite'].includes(data.kind) ? 'Результат' : 'Разбор не завершён'));
            if (data.latex) { heading.append(math(data.latex)); }
            if (data.reason) { heading.append(element('p', data.reason)); } result.append(heading);
            steps(data.steps, result);
            if (data.sides) {
                for (const side of data.sides) {
                    const section = element('section', undefined, 'limit-side');
                    section.append(element('h2', side.side === 'left' ? 'Приближение слева' : 'Приближение справа'));
                    steps(side.steps, section);
                    if (side.reason) { section.append(element('p', side.reason)); } result.append(section);
                }
                if (['finite', 'infinite'].includes(data.kind) && data.sides.length === 2) {
                    result.append(element('p', 'Левый и правый пределы совпадают: это двусторонний предел.', 'limit-conclusion'));
                }
            }
        }
        function stop() {
            job += 1; clearTimeout(timer); worker?.terminate(); worker = null;
            if (calculateButton) { calculateButton.disabled = false; }
        }
        const calculateButton = button('Вычислить предел', () => {
            stop(); session.changed(); const currentJob = job;
            calculateButton.disabled = true; say('Выполняется символьный разбор…');
            worker = new Worker('/assets/limits-worker.js?v=__LIMITS_BUILD__');
            worker.onmessage = (event) => {
                if (event.data.job !== currentJob) { return; }
                clearTimeout(timer); calculateButton.disabled = false;
                if (event.data.error) { say(event.data.error); } else { show(event.data.result); say(''); }
                worker?.terminate(); worker = null;
            };
            worker.onerror = () => { stop(); say('Не удалось загрузить модуль разбора. Проверьте соединение.'); };
            timer = setTimeout(() => { stop(); say('Разбор остановлен по лимиту времени. Упростите выражение.'); }, 8000);
            worker.postMessage({ job: currentJob, expression: expression.input.value,
                destination: destination.input.value, direction: direction.input.value });
        }, 'primary');
        for (const input of [expression.input, destination.input, direction.input]) {
            input.addEventListener('input', () => { stop(); session.changed(); });
        }
        const examples = element('div', undefined, 'tool-toolbar');
        for (const [name, code, point] of [['Сокращение', '\\frac{x^2-1}{x-1}', '1'], ['sin x / x', '\\frac{\\sin(x)}{x}', '0'],
            ['Степени при ∞', '\\frac{3x^2+x}{2x^2-1}', '\\infty'], ['Разные стороны', '\\frac{1}{x}', '0']]) {
            examples.append(button(name, () => {
                expression.input.value = code; destination.input.value = point; direction.input.value = 'both'; session.changed();
            }));
        }
        root.append(expression.label, row(destination.label, direction.label), row(calculateButton, button('Остановить', stop)),
            element('p', 'Разбор включает подстановку, сокращение многочленов, односторонние пределы, правило Лопиталя и основные оценки. Не каждый предел входит в поддерживаемые случаи; численное угадывание не используется.', 'tool-help'),
            examples, result);
    }
    window.StudyLimitUI = { limits };
})();
