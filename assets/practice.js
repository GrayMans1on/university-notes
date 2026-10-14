(() => {
    function numericValue(value) {
        const source = String(value).trim().toLowerCase().replace(/−|–/g, '-').replace(/π/g, 'pi')
            .replace(/,/g, '.').replace(/×|·/g, '*').replace(/√\s*(\d+(?:\.\d+)?)/g, 'sqrt($1)')
            .replace(/√/g, 'sqrt').replace(/\s/g, '');
        if (!source || source.length > 180) {
            throw new Error('Invalid expression');
        }
        const tokens = source.match(/(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|[a-z]+|[()+*/^\-]/g) ?? [];
        if (tokens.join('') !== source) {
            throw new Error('Invalid token');
        }
        let position = 0;
        function atom() {
            const token = tokens[position++];
            if (token === '(') {
                const result = expression();
                if (tokens[position++] !== ')') {
                    throw new Error('Missing parenthesis');
                }
                return result;
            }
            if (token === 'pi') {
                return Math.PI;
            }
            if (token === 'e') {
                return Math.E;
            }
            if (['sqrt', 'ln', 'exp', 'abs'].includes(token)) {
                if (tokens[position++] !== '(') {
                    throw new Error('Function needs parentheses');
                }
                const result = expression();
                if (tokens[position++] !== ')') {
                    throw new Error('Missing parenthesis');
                }
                return { sqrt: Math.sqrt, ln: Math.log, exp: Math.exp, abs: Math.abs }[token](result);
            }
            if (!token || !/^(?:\d|\.)/.test(token)) {
                throw new Error('Number expected');
            }
            return Number(token);
        }
        function power() {
            const result = atom();
            if (tokens[position] === '^') {
                position += 1;
                return result ** unary();
            }
            return result;
        }
        function unary() {
            if (tokens[position] === '+' || tokens[position] === '-') {
                const sign = tokens[position++] === '-' ? -1 : 1;
                return sign * unary();
            }
            return power();
        }
        function product() {
            let result = unary();
            while (tokens[position] === '*' || tokens[position] === '/') {
                const operation = tokens[position++];
                const right = unary();
                result = operation === '*' ? result * right : result / right;
            }
            return result;
        }
        function expression() {
            let result = product();
            while (tokens[position] === '+' || tokens[position] === '-') {
                const operation = tokens[position++];
                const right = product();
                result = operation === '+' ? result + right : result - right;
            }
            return result;
        }
        const result = expression();
        if (position !== tokens.length || !Number.isFinite(result)) {
            throw new Error('Expression must be finite');
        }
        return result;
    }
    function normalizedText(value) {
        return String(value).trim().toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/[’‘]/g, "'").replace(/\s+/g, '');
    }
    function sameNumber(left, right) {
        return Math.abs(left - right) <= 1e-6 * Math.max(1, Math.abs(right));
    }
    function evaluateField(field, answer) {
        if (!String(answer).trim()) {
            return { valid: false, correct: false };
        }
        if (field.kind === 'text') {
            return { valid: true, correct: field.accepted.some((value) => normalizedText(value) === normalizedText(answer)) };
        }
        try {
            if (field.kind === 'set') {
                const source = String(answer).trim().replace(/^\{|\}$/g, '').trim();
                const values = !source || source === '∅' ? [] : source.split(/[,;\s]+/).map(numericValue);
                if (field.expected.every(Number.isInteger) && values.some((value) => !Number.isInteger(value))) {
                    return { valid: true, correct: false };
                }
                const unique = values.filter((value, index) => values.findIndex((other) => sameNumber(other, value)) === index);
                return { valid: true, correct: unique.length === field.expected.length
                    && field.expected.every((value) => unique.some((other) => sameNumber(other, Number(value)))) };
            }
            const value = numericValue(answer);
            return { valid: true, correct: (!field.integer || Number.isInteger(value))
                && sameNumber(value, numericValue(field.expected)) };
        } catch {
            return { valid: false, correct: false };
        }
    }
    window.StudyAnswers = { numericValue, evaluateField };
    const form = document.querySelector('.practice-form');
    if (!form) {
        return;
    }
    const tasks = [...form.querySelectorAll('.practice-task')];
    const variant = document.getElementById('practice-variant');
    function activeTasks() {
        return tasks.filter((task) => !task.hidden);
    }
    function summary() {
        const visible = activeTasks();
        const automatic = visible.filter((task) => task.dataset.taskType !== 'reasoning');
        const manual = visible.filter((task) => task.dataset.taskType === 'reasoning');
        const checked = automatic.filter((task) => task.dataset.result);
        const reviewed = manual.filter((task) => task.dataset.result);
        form.querySelector('.practice-result').textContent = `Автопроверка: ${checked.filter((task) => task.dataset.result === 'yes').length} из ${automatic.length}; проверено ${checked.length}. Разборы: сверено ${reviewed.length} из ${manual.length}.`;
    }
    function mark(control, correct) {
        control.classList.toggle('answer-correct', correct);
        control.classList.toggle('answer-wrong', !correct);
        control.setAttribute('aria-invalid', String(!correct));
    }
    for (const task of tasks) {
        const spec = JSON.parse(task.querySelector('.task-spec').textContent);
        task.querySelectorAll('.task-answer, .task-select, .task-option input').forEach((control) => {
            const event = control.matches('input[type="text"]') ? 'input' : 'change';
            control.addEventListener(event, () => {
                if (task.dataset.result) {
                    delete task.dataset.result;
                    task.querySelector('.task-feedback').textContent = 'Ответ изменён. Нажми «Проверить».';
                    task.querySelectorAll('.answer-correct, .answer-wrong').forEach((item) => {
                        item.classList.remove('answer-correct', 'answer-wrong');
                        item.removeAttribute('aria-invalid');
                    });
                    summary();
                }
            });
        });
        task.querySelector('.task-check')?.addEventListener('click', () => {
            const feedback = task.querySelector('.task-feedback');
            let results = [];
            if (spec.type === 'input') {
                const controls = [...task.querySelectorAll('.task-answer')];
                results = controls.map((control, index) => evaluateField(spec.fields[index], control.value));
                if (results.some((result) => !result.valid)) {
                    feedback.textContent = 'Заполни все поля. Числа можно вводить дробью или выражением; проверь формат ответа.';
                    return;
                }
                controls.forEach((control, index) => mark(control, results[index].correct));
            } else if (spec.type === 'multi') {
                const controls = [...task.querySelectorAll('.task-option input')];
                const chosen = controls.filter((control) => control.checked);
                if (!chosen.length) {
                    feedback.textContent = 'Выбери все подходящие варианты.';
                    return;
                }
                results = controls.map((control, index) => ({ correct: control.checked === spec.correct.includes(index) }));
            } else {
                const controls = [...task.querySelectorAll('.task-select')];
                if (controls.some((control) => control.value === '')) {
                    feedback.textContent = 'Заполни все позиции.';
                    return;
                }
                results = controls.map((control, index) => ({ correct: Number(control.value) === index }));
                controls.forEach((control, index) => mark(control, results[index].correct));
            }
            const correct = results.every((result) => result.correct);
            task.dataset.result = correct ? 'yes' : 'no';
            feedback.textContent = correct ? 'Верно. Все части выполнены.' : spec.type === 'multi'
                ? 'Набор ответов пока неверен. Проверь выбранные и пропущенные варианты.'
                : `Верных частей: ${results.filter((result) => result.correct).length} из ${results.length}. Исправь отмеченные поля.`;
            task.querySelector('.task-solution').hidden = false;
            summary();
        });
        task.querySelector('.task-review')?.addEventListener('click', () => {
            task.querySelector('.task-solution').hidden = false;
            task.querySelector('.task-solution').open = true;
            task.querySelector('.task-rubric').hidden = false;
        });
        task.querySelectorAll('.criterion-check').forEach((control) => control.addEventListener('change', () => {
            const criteria = [...task.querySelectorAll('.criterion-check')];
            task.dataset.result = criteria.every((item) => item.checked) ? 'yes' : 'no';
            task.querySelector('.task-feedback').textContent = 'Самопроверка по критериям: ' + criteria.filter((item) => item.checked).length + ' из ' + criteria.length + '.';
            summary();
        }));
    }
    function selectVariant() {
        tasks.forEach((task) => { task.hidden = task.dataset.variant !== (variant?.value ?? '1'); });
        summary();
    }
    variant?.addEventListener('change', selectVariant);
    document.querySelector('.practice-next')?.addEventListener('click', () => {
        const alternatives = [...new Set(tasks.filter((task) => JSON.parse(task.querySelector('.task-spec').textContent).generated)
            .map((task) => task.dataset.variant))].filter((value) => value !== variant.value);
        variant.value = alternatives[Math.floor(Math.random() * alternatives.length)];
        selectVariant();
        variant.focus();
    });
    form.addEventListener('submit', (event) => event.preventDefault());
    form.querySelector('.practice-reset').addEventListener('click', () => {
        form.reset();
        tasks.forEach((task) => {
            delete task.dataset.result;
            task.querySelector('.task-feedback').replaceChildren();
            task.querySelector('.task-solution').hidden = true;
            task.querySelector('.task-solution').open = false;
            const rubric = task.querySelector('.task-rubric');
            if (rubric) {
                rubric.hidden = true;
            }
            task.querySelectorAll('.answer-correct, .answer-wrong').forEach((control) => {
                control.classList.remove('answer-correct', 'answer-wrong');
                control.removeAttribute('aria-invalid');
            });
        });
        selectVariant();
    });
    selectVariant();
})();
