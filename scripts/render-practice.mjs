const labels = { input: 'Ввод ответа', multi: 'Несколько ответов', matching: 'Сопоставление', order: 'Порядок действий', reasoning: 'Обоснование' };

function optionText(value) {
    return value.replace(/\$/g, '').replace(/\\neg/g, '¬').replace(/\\land/g, '∧')
        .replace(/\\lor/g, '∨').replace(/C_n\^k/g, 'C(n,k)').replace(/A_n\^k/g, 'A(n,k)')
        .replace(/n\^k/g, 'nᵏ');
}

export function renderPractice(tasks, md, escapeHtml) {
    const variants = [...new Set(tasks.map((task) => task.variant))].sort((a, b) => a - b);
    const controls = variants.length > 1 ? `<label class="variant-control" for="practice-variant">Вариант<select id="practice-variant">${variants.map((variant) => `<option value="${variant}">${variant}</option>`).join('')}</select></label>` : '';
    const counts = new Map();
    const rendered = tasks.map((task) => {
        const number = (counts.get(task.variant) ?? 0) + 1;
        counts.set(task.variant, number);
        const id = task.id;
        let answers = '';
        if (task.type === 'input') {
            answers = `<div class="task-fields">${task.fields.map((field, index) => `<label for="${id}-field-${index}"><span>${escapeHtml(field.label)}</span><input class="task-answer" id="${id}-field-${index}" type="text" autocomplete="off" spellcheck="false" aria-describedby="${id}-format"></label>`).join('')}</div><p class="task-format" id="${id}-format">${task.fields.some((field) => field.kind === 'number') ? 'Число, дробь или выражение: 1,5; 3/2; sqrt(2)/2; e^6; pi/4.' : ''}${task.fields.some((field) => field.kind === 'set') ? ' Множество: {1,2,3}; порядок элементов не важен.' : ''}</p>`;
        } else if (task.type === 'multi') {
            answers = `<div class="task-options">${task.options.map((option, index) => `<label class="task-option"><input type="checkbox" value="${index}"><span>${md(option)}</span></label>`).join('')}</div>`;
        } else if (task.type === 'matching' || task.type === 'order') {
            const items = task.type === 'matching' ? task.pairs.map((pair) => pair.left) : task.steps.map((_, index) => 'Шаг ' + (index + 1));
            const options = task.type === 'matching' ? task.pairs.map((pair) => pair.right) : task.steps;
            const shift = Math.max(1, Math.floor(options.length / 2));
            const shuffled = options.map((text, index) => ({ text, index }));
            const ordered = [...shuffled.slice(shift), ...shuffled.slice(0, shift)];
            answers = `<div class="task-matches">${items.map((item, index) => `<label for="${id}-select-${index}"><span>${md(item)}</span><select class="task-select" id="${id}-select-${index}"><option value="">Выбери</option>${ordered.map((option) => `<option value="${option.index}">${escapeHtml(optionText(option.text))}</option>`).join('')}</select></label>`).join('')}</div>`;
        } else {
            answers = `<label class="task-work-label" for="${id}-work">Твоё рассуждение<textarea id="${id}-work" class="task-work" rows="5" placeholder="Запиши ход решения перед сверкой"></textarea></label>`;
        }
        const rubric = task.type === 'reasoning' ? `<div class="task-rubric" hidden><p>Сверь своё рассуждение с разбором и отметь выполненные критерии.</p>${task.criteria.map((criterion) => `<label><input class="criterion-check" type="checkbox"><span>${escapeHtml(criterion)}</span></label>`).join('')}</div>` : '';
        const action = task.type === 'reasoning' ? '<button class="task-review" type="button">Сверить решение</button>' : '<button class="task-check" type="button">Проверить</button>';
        const spec = JSON.stringify(task).replace(/</g, '\\u003c');
        return `<fieldset class="practice-task" data-task-type="${task.type}" data-variant="${task.variant}"${task.variant === variants[0] ? '' : ' hidden'}><legend><span class="question-number">${number}</span>${escapeHtml(task.title)}</legend><span class="task-kind">${labels[task.type]}</span><div class="task-condition">${md(task.question)}</div>${answers}${task.hint ? `<details class="task-hint"><summary>Подсказка</summary>${md(task.hint)}</details>` : ''}${action}<div class="task-feedback" role="status" aria-live="polite"></div><details class="task-solution" hidden><summary>Разбор</summary>${md(task.solution)}</details>${rubric}<script class="task-spec" type="application/json">${spec}</script></fieldset>`;
    }).join('');
    const next = tasks.some((task) => task.generated) ? '<button class="practice-next" type="button">Другой вариант</button>' : '';
    return `<section class="practice-panel"><div class="practice-heading"><h2>Задания по теме</h2><div class="practice-heading">${controls}${next}</div></div><form class="practice-form">${rendered}<p class="practice-result" role="status" aria-live="polite"></p><button class="practice-reset" type="button">Начать заново</button></form></section>`;
}
