const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '../..');
const base = JSON.parse(fs.readFileSync(path.join(root, 'content/schedule.json')));
const lesson = base.lessons.find((item) => item.day === 2 && item.pair === 1);
const permanentPath = 'content/schedule-overrides.json';
const oncePath = 'content/schedule-exceptions.json';
const documents = {
    'content/schedule.json': base,
    [permanentPath]: { schema: 1, events: [{ id: 'old-room', action: 'replace', lessonId: lesson.id,
        effectiveFrom: '2026-10-01', patch: { room: '132' } }] },
    [oncePath]: { schema: 1, events: [{ id: 'old-once', action: 'cancel',
        source: { date: '2026-10-07', lessonId: lesson.id } }] },
};
const versions = { 'content/schedule.json': 'base-sha', [permanentPath]: 'permanent-0', [oncePath]: 'once-0' };
const writes = [];
let serviceEnabled = false;
let serviceSaves = 0;
let serviceFailure = false;
const wait = () => new Promise((resolve) => setTimeout(resolve, 15));
(async () => {
    const dom = new JSDOM(fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8'), {
        url: 'https://graymans1on.github.io/university-notes/', runScripts: 'outside-only',
    });
    const window = dom.window;
    window.TextEncoder = TextEncoder;
    window.TextDecoder = TextDecoder;
    window.structuredClone = structuredClone;
    window.matchMedia = () => ({ matches: false, addEventListener() {} });
    window.HTMLElement.prototype.scrollIntoView = () => {};
    const RealDate = window.Date;
    window.Date = class extends RealDate {
        constructor(...args) { super(...(args.length ? args : ['2026-10-14T06:00:00Z'])); }
    };
    window.fetch = async (url, options = {}) => {
        if (url.endsWith('/assets/schedule-service.json')) {
            return { json: async () => ({ schema: 1, url: serviceEnabled ? 'https://test.workers.dev/changes' : '' }) };
        }
        if (url === 'https://test.workers.dev/changes') {
            assert.equal(options.headers.Authorization, undefined);
            const body = JSON.parse(options.body);
            assert.equal(body.code, 'CSU2410');
            if (serviceFailure) { return { status: 503, text: async () => JSON.stringify({ message: 'Service unavailable' }) }; }
            const file = body.kind === 'permanent' ? permanentPath : oncePath;
            assert.equal(body.sha, versions[file]);
            documents[file].events.push(body.event);
            versions[file] = 'b'.repeat(40);
            serviceSaves++;
            return { status: 200, text: async () => JSON.stringify({ content: { sha: versions[file] },
                history: documents[file], commit: { html_url: 'https://github.com/GrayMans1on/university-notes/commit/service-test' } }) };
        }
        if (!url.startsWith('https://api.github.com/')) {
            return { ok: true, json: async () => ({ ...base, permanentChanges: [], exceptions: [] }) };
        }
        const file = url.split('/contents/')[1].split('?')[0];
        if (options.method === 'PUT') {
            assert.ok([permanentPath, oncePath].includes(file));
            assert.equal(options.headers.Authorization, 'Bearer test-token');
            const body = JSON.parse(options.body);
            assert.equal(body.sha, versions[file]);
            const next = JSON.parse(Buffer.from(body.content, 'base64').toString('utf8'));
            assert.deepEqual(next.events.slice(0, documents[file].events.length), documents[file].events);
            assert.equal(next.events.length, documents[file].events.length + 1);
            documents[file] = next;
            versions[file] += '-next';
            writes.push({ file, data: next });
            return { status: 200, text: async () => JSON.stringify({ content: { sha: versions[file] },
                commit: { html_url: 'https://github.com/GrayMans1on/university-notes/commit/test-fixture' } }) };
        }
        return { status: 200, text: async () => JSON.stringify({ sha: versions[file], encoding: 'base64',
            content: Buffer.from(JSON.stringify(documents[file])).toString('base64') }) };
    };
    for (const file of ['assets/preferences.js', 'assets/schedule-overrides.js', 'assets/schedule.js', 'assets/schedule-admin.js']) {
        window.eval(fs.readFileSync(path.join(root, file), 'utf8'));
    }
    await window.StudyAdmin.open();
    const click = (text) => {
        const button = [...window.document.querySelectorAll('.schedule-admin-shell button')]
            .find((item) => item.textContent === text);
        assert.ok(button, text);
        button.click();
    };
    const input = window.document.querySelector('input[name=code]');
    input.value = 'wrong';
    click('Войти');
    assert.equal(window.document.querySelector('.schedule-admin-content form'), null);
    input.value = 'CSU2410';
    click('Войти');
    await wait();
    assert.ok(window.document.querySelector('.schedule-admin-content form'));
    click('Загрузить свежую версию из GitHub');
    await wait();
    function fields() {
        return Object.fromEntries([...window.document.querySelector('.schedule-admin-content form').elements]
            .filter((item) => item.name).map((item) => [item.name, item]));
    }
    let values = fields();
    values.lesson.value = lesson.id;
    values.lesson.dispatchEvent(new window.Event('change'));
    assert.equal(values.room.value, '132');
    values.room.value = '326';
    values.room.dispatchEvent(new window.Event('input'));
    click('Предпросмотр и черновик');
    const staged = JSON.parse(window.localStorage.getItem('study-admin-draft'));
    assert.deepEqual(staged.event.patch, { room: '326' });
    const token = window.document.querySelector('input[name=token]');
    token.value = 'test-token';
    token.dispatchEvent(new window.Event('input'));
    await window.StudyAdmin.publish();
    assert.equal(writes.length, 1);
    assert.equal(writes[0].file, permanentPath);
    assert.equal(documents[permanentPath].events[0].id, 'old-room');
    const latestId = documents[permanentPath].events[1].id;
    const latestRow = [...window.document.querySelectorAll('.schedule-admin-history li')]
        .find((row) => row.querySelector('small')?.textContent === staged.event.createdAt);
    latestRow.querySelector('button').click();
    await window.StudyAdmin.publish();
    assert.equal(documents[permanentPath].events.length, 3);
    assert.deepEqual(documents[permanentPath].events[2].supersedes, [latestId]);
    const restored = window.StudyScheduleOverrides.apply({ ...base, permanentChanges: documents[permanentPath].events }, '2026-10-28');
    assert.equal(restored.find((item) => item.id === lesson.id).room, '132');
    click('Разовые изменения');
    values = fields();
    values.lesson.value = lesson.id;
    values.lesson.dispatchEvent(new window.Event('change'));
    values.action.value = 'move';
    values.action.dispatchEvent(new window.Event('change'));
    values.targetDate.value = '2026-10-15';
    click('Предпросмотр и черновик');
    await window.StudyAdmin.publish();
    assert.equal(writes[2].file, oncePath);
    assert.equal(documents[oncePath].events[0].id, 'old-once');
    assert.equal(documents[oncePath].events[1].action, 'move');
    const model = { ...base, permanentChanges: documents[permanentPath].events, exceptions: documents[oncePath].events };
    assert.ok(!window.StudySchedule.lessonsFor(model, window.StudySchedule.dateValue('2026-10-14'), 1)
        .some((item) => item.id === lesson.id));
    assert.ok(window.StudySchedule.lessonsFor(model, window.StudySchedule.dateValue('2026-10-15'), 1)
        .some((item) => item.id === lesson.id));
    click('Постоянные изменения');
    values = fields();
    values.lesson.value = lesson.id;
    values.lesson.dispatchEvent(new window.Event('change'));
    values.room.value = '427';
    click('Предпросмотр и черновик');
    versions[permanentPath] = 'changed-by-other-admin';
    const before = writes.length;
    await window.StudyAdmin.publish();
    assert.equal(writes.length, before);
    assert.match(window.document.querySelector('.schedule-admin-status').textContent, /Журнал изменился/);
    assert.ok(JSON.parse(window.localStorage.getItem('study-admin-draft')));
    assert.ok(!JSON.stringify(Object.entries(window.localStorage)).includes('test-token'));
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'content/schedule.json'))), base);
    serviceEnabled = true;
    versions[permanentPath] = 'a'.repeat(40);
    await window.StudyAdmin.open();
    assert.equal(window.document.querySelector('input[name=token]'), null);
    values = fields();
    values.lesson.value = lesson.id;
    values.lesson.dispatchEvent(new window.Event('change'));
    values.room.value = '137';
    click('Сохранить изменение');
    await wait();
    assert.equal(serviceSaves, 1);
    assert.equal(window.localStorage.getItem('study-admin-draft'), 'null');
    serviceFailure = true;
    values = fields();
    values.room.value = '138';
    click('Сохранить изменение');
    await wait();
    assert.equal(serviceSaves, 1);
    assert.ok(JSON.parse(window.localStorage.getItem('study-admin-draft')));
    assert.match(window.document.querySelector('.schedule-admin-status').textContent, /Service unavailable/);
    window.close();
    console.log('Admin: code gate, separate modes, append-only writes, rollback, conflict handling and token privacy passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
