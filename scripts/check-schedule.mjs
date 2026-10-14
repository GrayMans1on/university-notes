import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { loadSchedule } from './schedule-data.mjs';

const context = { window: {}, document: { getElementById() { return null; } } };
vm.createContext(context);
vm.runInContext(fs.readFileSync('assets/schedule-overrides.js', 'utf8'), context);
vm.runInContext(fs.readFileSync('assets/schedule.js', 'utf8'), context);
const api = context.window.StudySchedule;
const schedule = loadSchedule(process.cwd());
const before = JSON.stringify(schedule.lessons);
const date = '2026-10-14';
const original = schedule.lessons.find((item) => item.day === 2 && item.pair === 1);
const event = { id: 'move-1', action: 'move', groups: ['default'], subgroups: [1],
    source: { date, lessonId: original.id }, target: { date: '2026-10-15', lesson: {
        pair: 2, start: '10:00', end: '11:30', room: '326',
    } } };
schedule.exceptions = [event];
const read = (iso, subgroup = 1, group = 'default') => api.lessonsFor(schedule, api.dateValue(iso), subgroup, group);
assert.ok(!read(date).some((item) => item.id === original.id));
assert.ok(read(date, 2).some((item) => item.id === original.id));
assert.ok(read(date, 1, 'other').some((item) => item.id === original.id));
const moved = read('2026-10-15').find((item) => item.id === original.id);
assert.equal(moved.room, '326');
assert.deepEqual(Array.from(api.lessonTime(schedule, moved)), ['10:00', '11:30']);
assert.equal(moved.thumbnail, undefined);
assert.equal(moved.mapUrl, undefined);
assert.ok(read('2026-10-28').some((item) => item.id === original.id));
schedule.exceptions.push({ id: 'undo-1', action: 'revoke', supersedes: ['move-1'] });
assert.ok(read(date).some((item) => item.id === original.id));
assert.ok(!read('2026-10-15').some((item) => item.id === original.id));
schedule.exceptions = [{ id: 'cancel-1', action: 'cancel', source: { date, lessonId: original.id } }];
assert.ok(!read(date).some((item) => item.id === original.id));
schedule.exceptions = [{ ...event, id: 'replace-1', action: 'replace', subgroups: undefined,
    target: { date, lesson: { start: '07:40', end: '09:10' } } }];
assert.equal(read(date)[0].start, '07:40');
schedule.exceptions = [{ id: 'add-1', action: 'add', groups: ['default'],
    target: { date: '2026-10-18', lesson: { title: 'Extra class', pair: 2, start: '10:00', end: '11:00' } } }];
assert.equal(read('2026-10-18').length, 1);
assert.equal(read('2026-10-18', 1, 'other').length, 0);
assert.equal(JSON.stringify(schedule.lessons), before);
console.log('Schedule: date, group, subgroup, move, replacement, cancellation, addition, revocation and base preservation passed.');

schedule.exceptions = [];
schedule.permanentChanges = [{ id: 'room-1', action: 'replace', lessonId: original.id,
    effectiveFrom: '2026-10-14', patch: { room: '326' } }];
assert.equal(read('2026-10-14').find((lesson) => lesson.id === original.id).room, '326');
assert.equal(read('2026-10-28').find((lesson) => lesson.id === original.id).room, '326');
assert.equal(read('2026-09-30').find((lesson) => lesson.id === original.id).room, original.room);
schedule.permanentChanges.push({ id: 'revert-room', action: 'revoke', effectiveFrom: '2026-10-21', supersedes: ['room-1'] });
assert.equal(read('2026-10-14').find((lesson) => lesson.id === original.id).room, '326');
assert.equal(read('2026-10-28').find((lesson) => lesson.id === original.id).room, original.room);
assert.equal(JSON.stringify(schedule.lessons), before);
console.log('Permanent overrides: effective date, future cycles, historical dates and rollback passed.');
