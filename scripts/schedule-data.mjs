import fs from 'node:fs';
import path from 'node:path';
import { validateSchedule } from './schedule-validation.mjs';

export function loadSchedule(root) {
    const read = (file) => JSON.parse(fs.readFileSync(path.join(root, 'content', file), 'utf8'));
    return validateSchedule(read('schedule.json'), read('schedule-exceptions.json'), read('schedule-overrides.json'));
}
