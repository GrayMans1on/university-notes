(() => {
    'use strict';
    if (!window.StudyNative) { return; }
    const enhanced = new WeakMap();
    let active;
    const node = (tag, text, className = '') => {
        const result = document.createElement(tag);
        result.className = className;
        if (text !== undefined) { result.textContent = text; }
        return result;
    };
    const action = (text, callback) => {
        const button = node('button', text);
        button.type = 'button';
        button.addEventListener('click', callback);
        return button;
    };
    function close() {
        if (!active) { return; }
        const current = active;
        active = null;
        current.layer.remove();
        if (current.trigger.isConnected) { current.trigger.focus(); }
    }
    function commit(input, value) {
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        close();
    }
    function open(input, trigger) {
        close();
        const layer = node('div', undefined, 'app-picker-layer');
        const panel = node('section', undefined, 'app-picker');
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');
        panel.setAttribute('aria-label', trigger.getAttribute('aria-label'));
        const heading = node('div', undefined, 'app-picker-heading');
        heading.append(node('strong', trigger.dataset.title), action('Закрыть', close));
        panel.append(heading);
        layer.append(panel);
        layer.addEventListener('click', (event) => { if (event.target === layer) { close(); } });
        active = { layer, panel, trigger };
        document.body.append(layer);
        if (input.tagName === 'SELECT') {
            const list = node('div', undefined, 'app-picker-options');
            list.setAttribute('role', 'listbox');
            for (const option of input.options) {
                if (option.hidden) { continue; }
                const button = action(option.textContent, () => commit(input, option.value));
                button.setAttribute('role', 'option');
                button.setAttribute('aria-selected', String(option.selected));
                button.disabled = option.disabled || option.parentElement.disabled;
                list.append(button);
            }
            panel.append(list);
            (list.querySelector('[aria-selected=true]:not(:disabled)') || heading.querySelector('button')).focus();
        } else if (input.type === 'date') {
            calendar(input, panel);
        } else {
            clock(input, panel);
        }
    }
    const iso = (date) => date.toISOString().slice(0, 10);
    const todayValue = () => {
        const values = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Yekaterinburg',
            year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map((part) => [part.type, part.value]));
        return `${values.year}-${values.month}-${values.day}`;
    };
    function calendar(input, panel) {
        let selected = /^\d{4}-\d{2}-\d{2}$/.test(input.value) ? new Date(input.value + 'T12:00:00Z') : new Date(todayValue() + 'T12:00:00Z');
        let month = new Date(Date.UTC(selected.getUTCFullYear(), selected.getUTCMonth(), 1, 12));
        const controls = node('div', undefined, 'app-calendar-navigation');
        const title = node('strong');
        function shift(months) {
            const next = new Date(month);
            next.setUTCMonth(next.getUTCMonth() + months);
            if (next.getUTCFullYear() < 1 || next.getUTCFullYear() > 9999) { return; }
            month = next;
            render();
        }
        for (const [text, delta, label] of [['«', -12, 'Предыдущий год'], ['‹', -1, 'Предыдущий месяц']]) {
            const button = action(text, () => shift(delta));
            button.setAttribute('aria-label', label);
            controls.append(button);
        }
        controls.append(title);
        for (const [text, delta, label] of [['›', 1, 'Следующий месяц'], ['»', 12, 'Следующий год']]) {
            const button = action(text, () => shift(delta));
            button.setAttribute('aria-label', label);
            controls.append(button);
        }
        const days = node('div', undefined, 'app-calendar-days');
        const footer = node('div', undefined, 'app-picker-actions');
        const today = todayValue();
        const todayButton = action('Сегодня', () => commit(input, today));
        todayButton.disabled = Boolean(input.min && today < input.min || input.max && today > input.max);
        footer.append(todayButton);
        if (!input.required) { footer.append(action('Очистить', () => commit(input, ''))); }
        panel.append(controls, days, footer);
        function render() {
            title.textContent = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(month);
            days.replaceChildren();
            for (const name of ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']) { days.append(node('span', name)); }
            const offset = (month.getUTCDay() + 6) % 7;
            for (let index = 0; index < offset; index++) { days.append(node('span')); }
            const count = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).getUTCDate();
            for (let number = 1; number <= count; number++) {
                const date = new Date(month);
                date.setUTCDate(number);
                const value = iso(date);
                const day = action(String(number), () => commit(input, value));
                day.disabled = Boolean(input.min && value < input.min || input.max && value > input.max);
                day.setAttribute('aria-label', value);
                day.setAttribute('aria-pressed', String(value === input.value));
                if (value === today) { day.setAttribute('aria-current', 'date'); }
                days.append(day);
            }
        }
        render();
        (days.querySelector('[aria-pressed=true]:not(:disabled)') || controls.querySelector('button')).focus();
    }
    function clock(input, panel) {
        const values = (input.value || '08:00').split(':');
        const row = node('div', undefined, 'app-clock');
        const inputs = [];
        for (const [index, label, limit] of [[0, 'Часы', 23], [1, 'Минуты', 59]]) {
            const wrapper = node('label', label);
            const value = node('input');
            value.type = 'number';
            value.inputMode = 'numeric';
            value.min = '0';
            value.max = String(limit);
            value.value = String(Number(values[index]));
            wrapper.append(value);
            row.append(wrapper);
            inputs.push(value);
        }
        const error = node('p');
        error.setAttribute('role', 'status');
        panel.append(row, error, action('Выбрать', () => {
            if (!inputs.every((value) => value.value !== '' && value.checkValidity())) { error.textContent = 'Проверьте часы и минуты.'; return; }
            const value = inputs.map((field) => field.value.padStart(2, '0')).join(':');
            if (input.min && value < input.min || input.max && value > input.max) { error.textContent = 'Время вне разрешённого диапазона.'; return; }
            commit(input, value);
        }));
        inputs[0].focus();
    }
    function titleFor(input) {
        const label = input.labels?.[0];
        if (!label) { return input.getAttribute('aria-label') || (input.type === 'date' ? 'Дата' : 'Выбор'); }
        const copy = label.cloneNode(true);
        copy.querySelectorAll('select,input,button,.app-control-trigger').forEach((node) => node.remove());
        return copy.textContent.trim() || input.getAttribute('aria-label') || 'Выбор';
    }
    function refresh(input, trigger) {
        let text = input.value;
        if (input.tagName === 'SELECT') { text = input.selectedOptions[0]?.textContent || 'Выбрать'; }
        else if (input.type === 'date' && input.value) {
            text = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(input.value + 'T12:00:00Z'));
        }
        const title = titleFor(input);
        if (trigger.textContent !== (text || 'Выбрать')) { trigger.textContent = text || 'Выбрать'; }
        trigger.dataset.title = title;
        trigger.setAttribute('aria-label', title + ': ' + trigger.textContent);
        trigger.disabled = input.disabled;
        trigger.hidden = input.hidden;
    }
    function enhance() {
        if (!document?.body) { return; }
        for (const input of document.querySelectorAll('select,input[type=date],input[type=time]')) {
            let trigger = enhanced.get(input);
            if (!trigger) {
                trigger = action('', () => open(input, trigger));
                trigger.className = 'app-control-trigger';
                trigger.setAttribute('aria-haspopup', 'dialog');
                input.classList.add('app-control-source');
                input.after(trigger);
                enhanced.set(input, trigger);
                input.addEventListener('change', () => refresh(input, trigger));
                input.addEventListener('input', () => refresh(input, trigger));
            }
            refresh(input, trigger);
        }
        for (const trigger of document.querySelectorAll('.app-control-trigger')) {
            if (!trigger.previousElementSibling?.matches('.app-control-source')) { trigger.remove(); }
        }
    }
    let queued = false;
    function scheduleEnhance() {
        if (!queued) {
            queued = true;
            queueMicrotask(() => { queued = false; enhance(); });
        }
    }
    new MutationObserver((records) => {
        if (records.some((record) => record.type === 'childList' || record.target.matches('select,input,option,optgroup'))) {
            scheduleEnhance();
        }
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'hidden'] });
    document.addEventListener('change', scheduleEnhance);
    document.addEventListener('input', scheduleEnhance);
    document.addEventListener('keydown', (event) => {
        if (!active) { return; }
        if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close(); }
        if (event.key === 'Tab') {
            const buttons = [...active.panel.querySelectorAll('button:not(:disabled),input:not(:disabled)')];
            const index = buttons.indexOf(document.activeElement);
            event.preventDefault();
            buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
        }
    }, true);
    enhance();
})();
