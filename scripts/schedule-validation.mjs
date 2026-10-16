import overrides from '../assets/schedule-overrides.js';

export function validateSchedule(schedule, history, permanent) {
    if (history.schema !== 1 || !Array.isArray(history.events)) {
        throw new Error('Unsupported schedule exception history');
    }
    schedule.group = schedule.group || 'default';
    schedule.groups = schedule.groups || [{ id: schedule.group, title: 'Основная учебная группа' }];
    const ids = new Set(schedule.lessons.map((lesson) => lesson.id));
    if (ids.size !== schedule.lessons.length || ids.has(undefined)) {
        throw new Error('Lessons require unique stable IDs');
    }
    overrides.validate(permanent, schedule);
    schedule.permanentChanges = permanent.events;
    const seen = new Set();
    const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || '')
        && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
    const validTime = (value) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value || '');
    for (const event of history.events) {
        if (!event.id || seen.has(event.id) || !['cancel', 'replace', 'move', 'add', 'revoke'].includes(event.action)) {
            throw new Error('Invalid schedule event ID or action');
        }
        for (const id of event.supersedes || []) {
            if (!seen.has(id)) {
                throw new Error('Superseded event must precede its correction');
            }
        }
        seen.add(event.id);
        if (event.action === 'add' && event.source || event.action === 'cancel' && event.target
            || event.action === 'revoke' && (event.source || event.target)) {
            throw new Error('Unexpected source or target for this action');
        }
        if (event.groups && (!Array.isArray(event.groups) || !event.groups.length
            || event.groups.some((group) => !schedule.groups.some((item) => item.id === group)))) {
            throw new Error('Unknown academic group');
        }
        if (event.subgroups && (!Array.isArray(event.subgroups) || !event.subgroups.length
            || event.subgroups.some((group) => ![1, 2].includes(group)))) {
            throw new Error('Invalid English subgroup');
        }
        if (event.action === 'revoke') {
            if (!event.supersedes?.length) {
                throw new Error('A revocation must reference previous events');
            }
            continue;
        }
        if (event.action !== 'add' && (!validDate(event.source?.date) || !ids.has(event.source?.lessonId))) {
            throw new Error('Invalid source date or lesson');
        }
        if (event.source) {
            const lesson = overrides.apply(schedule, event.source.date).find((item) => item.id === event.source.lessonId);
            const date = new Date(event.source.date + 'T00:00:00Z');
            const day = (date.getUTCDay() + 6) % 7;
            const monday = new Date(date.getTime() - day * 86400000);
            const weeks = Math.round((monday - new Date(schedule.anchor + 'T00:00:00Z')) / 604800000);
            const cycle = ((weeks % 2) + 2) % 2 + 1;
            if (lesson.day !== day || !lesson.weeks.includes(cycle)) {
                throw new Error('The source lesson does not occur on the specified date');
            }
        }
        if (['replace', 'move', 'add'].includes(event.action)) {
            if (!validDate(event.target?.date) || !event.target.lesson) {
                throw new Error('Invalid target date or lesson');
            }
            const lesson = event.target.lesson;
            if (event.action === 'replace' && event.target.date !== event.source.date) {
                throw new Error('Use move to change the date');
            }
            if (event.action === 'add' && (!lesson.title || !lesson.pair)) {
                throw new Error('An added lesson requires a title and pair');
            }
            if ((lesson.start || lesson.end) && (!validTime(lesson.start) || !validTime(lesson.end)
                || lesson.start >= lesson.end)) {
                throw new Error('Invalid lesson time range');
            }
            if (lesson.pair !== undefined && !schedule.bells[lesson.pair]) {
                throw new Error('Unknown lesson pair');
            }
            for (const field of Object.keys(lesson)) {
                if (!['pair', 'title', 'teacher', 'kind', 'room', 'place', 'note', 'start', 'end', 'onlineCourse'].includes(field)) {
                    throw new Error('Unsupported lesson override field: ' + field);
                }
            }
        }
    }
    schedule.exceptions = history.events;
    return schedule;
}
