(function (root) {
    'use strict';
    const fields = ['day', 'weeks', 'pair', 'title', 'teacher', 'kind', 'room', 'place', 'note', 'start', 'end'];
    function validDate(value) {
        return /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(Date.parse(value))
            && new Date(value).toISOString().slice(0, 10) === value;
    }
    function merge(lesson, patch) {
        const result = { ...lesson };
        if (['room', 'place', 'note'].some((field) => Object.hasOwn(patch, field))) {
            delete result.thumbnail;
            delete result.mapUrl;
            if (Object.hasOwn(patch, 'room')) {
                delete result.place;
            }
            if (Object.hasOwn(patch, 'place')) {
                delete result.room;
            }
        }
        return Object.assign(result, patch);
    }
    function validate(history, schedule) {
        if (history.schema !== 1 || !Array.isArray(history.events) || history.events.length > 10000) {
            throw new Error('Invalid permanent schedule history');
        }
        const seen = new Set();
        for (const event of history.events) {
            if (!event.id || seen.has(event.id) || !validDate(event.effectiveFrom)
                || !['replace', 'revoke'].includes(event.action)) {
                throw new Error('Invalid permanent schedule event');
            }
            if (!Array.isArray(event.supersedes || []) || (event.supersedes || []).some((id) => !seen.has(id))) {
                throw new Error('Unknown superseded permanent event');
            }
            seen.add(event.id);
            if (event.action === 'revoke') {
                if (!event.supersedes?.length || event.patch) {
                    throw new Error('Invalid permanent revocation');
                }
                continue;
            }
            if (!schedule.lessons.some((lesson) => lesson.id === event.lessonId) || !event.patch
                || !Object.keys(event.patch).length || Object.keys(event.patch).some((field) => !fields.includes(field))) {
                throw new Error('Invalid permanent lesson patch');
            }
            const patch = event.patch;
            if (patch.day !== undefined && (!Number.isInteger(patch.day) || patch.day < 0 || patch.day > 6)) {
                throw new Error('Invalid permanent lesson day');
            }
            if (patch.weeks !== undefined && (!Array.isArray(patch.weeks) || !patch.weeks.length
                || patch.weeks.some((week) => ![1, 2].includes(week)))) {
                throw new Error('Invalid permanent lesson weeks');
            }
            if (patch.pair !== undefined && !schedule.bells[patch.pair]) {
                throw new Error('Invalid permanent lesson pair');
            }
            if ((patch.start !== undefined || patch.end !== undefined)
                && (!/^([01]\d|2[0-3]):[0-5]\d$/.test(patch.start || '')
                    || !/^([01]\d|2[0-3]):[0-5]\d$/.test(patch.end || '') || patch.start >= patch.end)) {
                throw new Error('Invalid permanent lesson times');
            }
            for (const field of fields.filter((field) => !['day', 'weeks', 'pair'].includes(field))) {
                if (patch[field] !== undefined && (typeof patch[field] !== 'string' || patch[field].length > 500)) {
                    throw new Error('Invalid permanent lesson text');
                }
            }
            if (patch.title !== undefined && !patch.title.trim()) {
                throw new Error('A lesson requires a title');
            }
        }
    }
    function apply(schedule, date) {
        const events = (schedule.permanentChanges || []).filter((event) => event.effectiveFrom <= date);
        const superseded = new Set(events.flatMap((event) => event.supersedes || []));
        return schedule.lessons.map((original) => {
            let lesson = { ...original };
            for (const event of events) {
                if (!superseded.has(event.id) && event.action === 'replace' && event.lessonId === original.id) {
                    lesson = merge(lesson, event.patch);
                    lesson.permanentId = event.id;
                }
            }
            return lesson;
        });
    }
    const api = { fields, validDate, merge, validate, apply };
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        root.StudyScheduleOverrides = api;
    }
})(typeof window === 'object' ? window : globalThis);
