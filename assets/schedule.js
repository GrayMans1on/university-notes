(function () {
    'use strict';
    const dayMs = 86400000;
    function dateValue(iso) { return new Date(iso + 'T00:00:00Z'); }
    function isoDate(date) { return date.toISOString().slice(0, 10); }
    function shift(date, days) { return new Date(date.getTime() + days * dayMs); }
    function monday(date) { return shift(date, -((date.getUTCDay() + 6) % 7)); }
    function cycleWeek(date, anchor) {
        const offset = Math.round((monday(date) - dateValue(anchor)) / (7 * dayMs));
        return ((offset % 2) + 2) % 2 + 1;
    }
    function lessonTime(data, lesson) {
        return lesson.start && lesson.end ? [lesson.start, lesson.end] : data.bells[lesson.pair];
    }
    function lessonsFor(data, date, subgroup, group = data.group || 'default') {
        const day = (date.getUTCDay() + 6) % 7;
        const week = cycleWeek(date, data.anchor);
        const eligible = (item) => (!item.group || item.group === group)
            && (!item.subgroup || item.subgroup === subgroup);
        const regular = window.StudyScheduleOverrides.apply(data, isoDate(date));
        let result = regular.filter((item) => item.day === day && item.weeks.includes(week) && eligible(item))
            .map((item) => ({ ...item }));
        const events = data.exceptions || [];
        const superseded = new Set(events.flatMap((event) => event.supersedes || []));
        const iso = isoDate(date);
        for (const event of events) {
            if (superseded.has(event.id) || event.action === 'revoke'
                || event.groups && !event.groups.includes(group)
                || event.subgroups && !event.subgroups.includes(subgroup)) {
                continue;
            }
            const original = event.source && regular.find((item) => item.id === event.source.lessonId);
            if (original && !eligible(original)) {
                continue;
            }
            if (event.source?.date === iso) {
                result = result.filter((item) => item.id !== event.source.lessonId);
            }
            if (event.target?.date === iso) {
                const lesson = { ...original, ...event.target.lesson, id: original?.id || event.id, exceptionId: event.id };
                if (['room', 'place', 'note'].some((field) => Object.hasOwn(event.target.lesson, field))) {
                    delete lesson.thumbnail;
                    delete lesson.mapUrl;
                    if (Object.hasOwn(event.target.lesson, 'room')) {
                        delete lesson.place;
                    }
                    if (Object.hasOwn(event.target.lesson, 'place')) {
                        delete lesson.room;
                    }
                }
                Object.assign(lesson, event.target.lesson);
                if (eligible(lesson)) {
                    result.push(lesson);
                }
            }
        }
        return result.sort((a, b) => (lessonTime(data, a)?.[0] || '99:99')
            .localeCompare(lessonTime(data, b)?.[0] || '99:99') || a.pair - b.pair);
    }
    window.StudySchedule = { dateValue, isoDate, shift, monday, cycleWeek, lessonsFor, lessonTime };
    const root = document.getElementById('schedule');
    if (!root) { return; }
    const data = JSON.parse(document.getElementById('schedule-data').textContent);
    const dateInput = root.querySelector('#schedule-date');
    const groupInput = root.querySelector('#schedule-group');
    const academicInput = root.querySelector('#schedule-academic-group');
    const days = root.querySelector('.schedule-days');
    const agenda = root.querySelector('.schedule-agenda');
    const title = root.querySelector('#schedule-day-title');
    const range = root.querySelector('.schedule-week-label');
    const status = root.querySelector('.schedule-status');
    const format = (date, options) => new Intl.DateTimeFormat('ru-RU', { ...options, timeZone: 'UTC' }).format(date);
    function today() {
        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: data.timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
        }).formatToParts(new Date());
        const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
        return dateValue(`${values.year}-${values.month}-${values.day}`);
    }
    let selected = today();
    let subgroup = 1;
    let academicGroup = data.group || 'default';
    try { subgroup = localStorage.getItem('study-schedule-subgroup') === '2' ? 2 : 1; } catch {}
    try {
        const saved = localStorage.getItem('study-schedule-group');
        if (data.groups?.some((item) => item.id === saved)) {
            academicGroup = saved;
        }
    } catch {}
    if (academicInput) {
        academicInput.value = academicGroup;
    }
    groupInput.value = String(subgroup);
    function element(tag, className, text) {
        const node = document.createElement(tag);
        node.className = className;
        if (text !== undefined) { node.textContent = text; }
        return node;
    }
    function pairCount(count) {
        return count + (count === 1 ? ' пара' : count >= 2 && count <= 4 ? ' пары' : ' пар');
    }
    function render() {
        const start = monday(selected);
        const end = shift(start, 6);
        const current = isoDate(today());
        dateInput.value = isoDate(selected);
        range.textContent = `${format(start, { day: 'numeric', month: 'short' })} — ${format(end, {
            day: 'numeric', month: 'short', year: 'numeric',
        })} · ${cycleWeek(selected, data.anchor)}-я неделя`;
        days.replaceChildren();
        for (let i = 0; i < 7; i += 1) {
            const date = shift(start, i);
            const iso = isoDate(date);
            const button = element('button', 'schedule-day');
            button.type = 'button';
            button.setAttribute('aria-pressed', String(iso === isoDate(selected)));
            button.setAttribute('aria-label', format(date, { weekday: 'long', day: 'numeric', month: 'long' }));
            if (iso === current) { button.setAttribute('aria-current', 'date'); }
            if (iso < current) { button.classList.add('schedule-day-past'); }
            button.append(element('span', 'schedule-weekday', format(date, { weekday: 'short' })),
                element('strong', 'schedule-day-number', String(date.getUTCDate())),
                element('span', 'schedule-day-count', pairCount(lessonsFor(data, date, subgroup, academicGroup).filter((item) => !item.onlineCourse).length)));
            button.addEventListener('click', () => { selected = date; render(); days.children[i].focus(); });
            days.append(button);
        }
        title.textContent = format(selected, { weekday: 'long', day: 'numeric', month: 'long' });
        const lessons = lessonsFor(data, selected, subgroup, academicGroup);
        agenda.replaceChildren();
        if (lessons.length === 0) { agenda.append(element('li', 'schedule-empty', 'По расписанию пар нет.')); }
        for (const item of lessons) {
            const category = item.onlineCourse ? 'online' : item.kind === 'Лекция' ? 'lecture'
                : item.kind === 'Практика' ? 'practice' : 'module';
            const row = element('li', 'schedule-lesson schedule-' + category);
            if (!item.onlineCourse) {
                const number = element('div', 'schedule-pair');
                number.append(element('span', '', `${item.pair}-я пара`));
                const time = lessonTime(data, item);
                if (time) { number.append(element('span', 'schedule-time', `${time[0]}–${time[1]}`)); }
                row.append(number);
            }
            const details = element('div', 'schedule-lesson-details');
            const heading = element('h4', 'schedule-subject');
            const name = element(item.url ? 'a' : 'span', '', item.title);
            if (item.url) {
                name.href = item.url;
                if (item.url.startsWith('https://')) { name.target = '_blank'; name.rel = 'noopener noreferrer'; }
            }
            heading.append(name);
            if (item.subgroup) { heading.append(element('span', 'schedule-subgroup', ` (${item.subgroup} подгруппа)`)); }
            details.append(heading, element('p', 'schedule-meta',
                [item.onlineCourse ? '' : item.kind, item.place || (item.room ? 'Ауд. ' + item.room : ''), item.note || ''].filter(Boolean).join(' · ')),
                element('p', 'schedule-teacher', item.teacher));
            if (item.exceptionId) {
                details.append(element('p', 'schedule-meta', 'Разовое изменение'));
            }
            if (item.mapUrl) {
                const link = element('a', 'schedule-map-link', item.place ? 'Место на карте' : 'Кабинет на карте');
                link.href = item.mapUrl;
                link.setAttribute('aria-label', `${item.title}: ${item.place || 'ауд. ' + item.room} на карте`);
                details.append(link);
            }
            row.append(details);
            agenda.append(row);
        }
        status.textContent = `${title.textContent}. ${cycleWeek(selected, data.anchor)}-я неделя. Занятий: ${lessons.length}.`;
    }
    root.querySelector('[data-schedule="previous"]').addEventListener('click', () => { selected = shift(selected, -7); render(); });
    root.querySelector('[data-schedule="next"]').addEventListener('click', () => { selected = shift(selected, 7); render(); });
    root.querySelector('[data-schedule="today"]').addEventListener('click', () => { selected = today(); render(); });
    root.querySelector('[data-schedule="tomorrow"]').addEventListener('click', () => {
        selected = shift(today(), 1);
        render();
    });
    dateInput.addEventListener('change', () => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateInput.value)) { return; }
        const candidate = dateValue(dateInput.value);
        if (!Number.isNaN(candidate.getTime())) { selected = candidate; render(); }
    });
    groupInput.addEventListener('change', () => {
        subgroup = Number(groupInput.value) === 2 ? 2 : 1;
        try { localStorage.setItem('study-schedule-subgroup', String(subgroup)); } catch {}
        render();
    });
    if (academicInput) {
        academicInput.addEventListener('change', () => {
            academicGroup = academicInput.value;
            try { localStorage.setItem('study-schedule-group', academicGroup); } catch {}
            render();
        });
    }
    render();
})();
