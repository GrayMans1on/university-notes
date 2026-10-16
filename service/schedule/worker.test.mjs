import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { createWorker } from './worker.mjs';

const base = JSON.parse(fs.readFileSync(new URL('../../content/schedule.json', import.meta.url)));
const keys = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const pem = Buffer.from(await crypto.subtle.exportKey('pkcs8', keys.privateKey)).toString('base64');
const env = { ADMIN_CODE: 'CSU2410', GITHUB_APP_ID: '42', GITHUB_INSTALLATION_ID: '123',
    GITHUB_APP_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\n' + pem + '\n-----END PRIVATE KEY-----' };
const sha = 'a'.repeat(40);
const event = { id: 'test-room', action: 'replace', lessonId: base.lessons[0].id,
    effectiveFrom: '2026-10-16', patch: { room: '132' }, reason: 'Ремонт' };
function setup(options = {}) {
    const writes = [];
    const histories = { permanent: { schema: 1, events: options.previous || [] }, once: { schema: 1, events: [] } };
    const send = async (url, request) => {
        const path = new URL(url).pathname;
        const payload = request.body && JSON.parse(request.body);
        if (path.startsWith('/app/installations/')) {
            const jwt = request.headers.Authorization.slice(7).split('.');
            assert.equal(JSON.parse(Buffer.from(jwt[1], 'base64url')).iss, '42');
            assert.ok(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', keys.publicKey,
                Buffer.from(jwt[2], 'base64url'), new TextEncoder().encode(jwt[0] + '.' + jwt[1])));
            assert.deepEqual(payload, { repositories: ['university-notes'], permissions: { contents: 'write' } });
            return Response.json({ token: 'installation-secret' });
        }
        assert.equal(request.headers.Authorization, 'Bearer installation-secret');
        assert.ok(path.startsWith('/repos/GrayMans1on/university-notes/'));
        if (request.method === 'GET') {
            if (path.endsWith('/git/ref/heads/main')) { return Response.json({ object: { sha: 'head' } }); }
            if (path.endsWith('/git/commits/head')) { return Response.json({ tree: { sha: 'base-tree' } }); }
            const data = path.endsWith('/schedule.json') ? base : path.endsWith('/schedule-overrides.json') ? histories.permanent : histories.once;
            assert.equal(new URL(url).searchParams.get('ref'), 'head');
            return Response.json({ sha: options.stale ? 'b'.repeat(40) : sha, content: Buffer.from(JSON.stringify(data)).toString('base64') });
        }
        writes.push({ path, method: request.method, payload });
        if (path.endsWith('/git/trees')) {
            assert.equal(payload.tree.length, 1);
            assert.ok(['content/schedule-overrides.json', 'content/schedule-exceptions.json'].includes(payload.tree[0].path));
            const changed = JSON.parse(payload.tree[0].content);
            assert.deepEqual(changed.events.slice(0, histories.permanent.events.length), histories.permanent.events);
            return Response.json({ sha: 'new-tree' });
        }
        if (path.endsWith('/git/commits')) {
            assert.deepEqual(payload.parents, ['head']);
            return Response.json({ sha: 'new-commit', html_url: 'https://github.com/GrayMans1on/university-notes/commit/new-commit' });
        }
        assert.equal(path.endsWith('/git/refs/heads/main'), true);
        assert.equal(payload.force, false);
        return options.race ? Response.json({}, { status: 422 }) : Response.json({ object: { sha: 'new-commit' } });
    };
    return { worker: createWorker(send), writes };
}
const request = (body, origin = 'https://study.local') => new Request('https://test.workers.dev/changes', {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const body = () => ({ code: 'CSU2410', kind: 'permanent', sha, event: structuredClone(event) });
test('code-only save authenticates as an app and appends one journal with no forced update', async () => {
    const { worker, writes } = setup();
    const response = await worker.fetch(request(body()), env);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.match(result.content.sha, /^[a-f0-9]{40}$/);
    assert.equal(writes.length, 3);
    const bytes = Buffer.from(writes[0].payload.tree[0].content);
    assert.equal(result.content.sha, createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex'));
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://study.local');
    assert.ok(!JSON.stringify(result).includes('installation-secret'));
});
test('bad code, origin, event, body size, and base edits never write', async () => {
    for (const [value, origin, expected] of [
        [{ ...body(), code: 'bad' }, 'https://study.local', 401],
        [body(), 'https://untrusted.example', 403],
        [{ ...body(), kind: 'base' }, 'https://study.local', 400],
        [{ ...body(), event: { ...event, patch: { room: 12 } } }, 'https://study.local', 400],
        [{ ...body(), event: { ...event, lessonId: 'absent' } }, 'https://study.local', 400],
        [{ ...body(), extra: 'x'.repeat(33000) }, 'https://study.local', 413],
    ]) {
        const { worker, writes } = setup();
        assert.equal((await worker.fetch(request(value, origin), env)).status, expected);
        assert.equal(writes.length, 0);
    }
});
test('stale SHA stops before writes and a competing commit stops the ref update', async () => {
    for (const options of [{ stale: true }, { race: true }]) {
        const { worker, writes } = setup(options);
        assert.equal((await worker.fetch(request(body()), env)).status, 409);
        assert.equal(writes.length, options.stale ? 0 : 3);
    }
});
test('retry of the same event is idempotent, but reusing its ID for a different event conflicts', async () => {
    const { worker, writes } = setup({ previous: [event] });
    const response = await worker.fetch(request(body()), env);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).alreadySaved, true);
    assert.equal(writes.length, 0);
    const next = body();next.event.patch.room = '133';
    assert.equal((await worker.fetch(request(next), env)).status, 409);
});
test('revocation preserves the old event and missing configuration reports unavailable', async () => {
    const { worker, writes } = setup({ previous: [event] });
    const next = body();next.event = { id: 'undo-room', action: 'revoke', effectiveFrom: '2026-10-17', supersedes: [event.id] };
    assert.equal((await worker.fetch(request(next), env)).status, 200);
    assert.equal(JSON.parse(writes[0].payload.tree[0].content).events.length, 2);
    assert.equal((await worker.fetch(request(body()), {})).status, 503);
});

test('dated moves use the dated journal and reject a source on the wrong weekday', async () => {
    const lesson = base.lessons[0];
    const date = new Date(base.anchor + 'T00:00:00Z');
    date.setUTCDate(date.getUTCDate() + lesson.day + (lesson.weeks.includes(1) ? 0 : 7));
    const sourceDate = date.toISOString().slice(0, 10);
    date.setUTCDate(date.getUTCDate() + 1);
    const targetDate = date.toISOString().slice(0, 10);
    const payload = { code: 'CSU2410', kind: 'once', sha, event: { id: 'dated-move', action: 'move',
        source: { date: sourceDate, lessonId: lesson.id }, target: { date: targetDate, lesson: { room: '132' } } } };
    const first = setup();
    assert.equal((await first.worker.fetch(request(payload), env)).status, 200);
    assert.equal(first.writes[0].payload.tree[0].path, 'content/schedule-exceptions.json');
    payload.event.source.date = targetDate;
    const second = setup();
    assert.equal((await second.worker.fetch(request(payload), env)).status, 400);
    assert.equal(second.writes.length, 0);
});

test('authenticated deployment verification reads GitHub but never changes the schedule', async () => {
    const { worker, writes } = setup();
    const response = await worker.fetch(new Request('https://test.workers.dev/verify', {
        method: 'POST', headers: { Origin: 'https://study.local' }, body: JSON.stringify({ code: 'CSU2410' }),
    }), env);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ready: true, head: 'head' });
    assert.equal(writes.length, 0);
});
