import { validateSchedule } from '../../scripts/schedule-validation.mjs';

const REPO = 'GrayMans1on/university-notes';
const ROOT = 'https://api.github.com';
const ORIGINS = new Set(['https://graymans1on.github.io', 'https://study.local']);
const PATHS = { permanent: 'content/schedule-overrides.json', once: 'content/schedule-exceptions.json' };
const encoder = new TextEncoder();
class Failure extends Error {
    constructor(status, message) { super(message); this.status = status; }
}
const base64 = (bytes) => {
    let text = '';
    for (const byte of bytes) { text += String.fromCharCode(byte); }
    return btoa(text);
};
const unbase64 = (text) => Uint8Array.from(atob(text.replace(/\s/g, '')), (char) => char.charCodeAt(0));
const url64 = (bytes) => base64(bytes).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
async function bounded(body, maximum) {
    if (!body) { return ''; }
    const reader = body.getReader();
    const chunks = [];
    let total = 0;
    try {
        for (;;) {
            const { value, done } = await reader.read();
            if (done) { break; }
            total += value.length;
            if (total > maximum) { throw new Failure(413, 'Слишком большой запрос или журнал'); }
            chunks.push(value);
        }
    } finally { await reader.cancel(); }
    const bytes = new Uint8Array(total);
    let position = 0;
    for (const chunk of chunks) { bytes.set(chunk, position); position += chunk.length; }
    return new TextDecoder().decode(bytes);
}
async function appToken(env, send) {
    const now = Math.floor(Date.now() / 1000);
    const header = url64(encoder.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
    const payload = url64(encoder.encode(JSON.stringify({ iat: now - 60, exp: now + 540, iss: env.GITHUB_APP_ID })));
    const pem = env.GITHUB_APP_PRIVATE_KEY.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
    const key = await crypto.subtle.importKey('pkcs8', unbase64(pem), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    const message = header + '.' + payload;
    const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encoder.encode(message));
    const jwt = message + '.' + url64(new Uint8Array(signature));
    const result = await api(send, jwt, 'POST', '/app/installations/' + env.GITHUB_INSTALLATION_ID + '/access_tokens', {
        repositories: ['university-notes'], permissions: { contents: 'write' },
    });
    return result.token;
}
async function api(send, token, method, path, body) {
    const response = await send(ROOT + path, {
        method, redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json', 'User-Agent': 'UniversityNotes-Schedule' },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
        if ([409, 422].includes(response.status)) { throw new Failure(409, 'Расписание изменилось. Обновите данные; черновик сохранён.'); }
        throw new Failure(503, 'GitHub не подтвердил операцию. Черновик сохранён.');
    }
    return JSON.parse(await bounded(response.body, 8 * 1024 * 1024));
}
const canonical = (value) => JSON.stringify(value, (_, item) => {
    if (!item || Array.isArray(item) || typeof item !== 'object') { return item; }
    return Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]]));
});
function validateEvent(kind, event) {
    if (!event || typeof event !== 'object' || Array.isArray(event) || typeof event.id !== 'string'
        || !/^[a-zA-Z0-9_-]{1,100}$/.test(event.id)) { throw new Failure(400, 'Некорректное событие'); }
    const fields = kind === 'permanent' ? ['id', 'action', 'lessonId', 'effectiveFrom', 'patch', 'supersedes', 'reason', 'createdAt']
        : ['id', 'action', 'source', 'target', 'groups', 'subgroups', 'supersedes', 'reason', 'createdAt'];
    if (Object.keys(event).some((key) => !fields.includes(key))) { throw new Failure(400, 'Неизвестное поле события'); }
    for (const list of ['supersedes', 'groups', 'subgroups']) {
        if (event[list] !== undefined && (!Array.isArray(event[list]) || event[list].length > 100)) {
            throw new Failure(400, 'Некорректный список события');
        }
    }
    for (const field of ['reason', 'createdAt', 'lessonId', 'effectiveFrom']) {
        if (event[field] !== undefined && (typeof event[field] !== 'string' || event[field].length > 500)) {
            throw new Failure(400, 'Некорректное поле события');
        }
    }
    if (event.source && Object.keys(event.source).some((key) => !['date', 'lessonId'].includes(key))) {
        throw new Failure(400, 'Некорректная исходная пара');
    }
    if (event.target && Object.keys(event.target).some((key) => !['date', 'lesson'].includes(key))) {
        throw new Failure(400, 'Некорректная новая пара');
    }
    const patch = event.patch || event.target?.lesson;
    if (patch) {
        if (typeof patch !== 'object' || Array.isArray(patch)) { throw new Failure(400, 'Некорректная правка'); }
        for (const [key, value] of Object.entries(patch)) {
            if (['day', 'pair'].includes(key)) {
                if (!Number.isInteger(value)) { throw new Failure(400, 'Ожидается целое число'); }
            } else if (key === 'weeks') {
                if (!Array.isArray(value) || value.some((week) => ![1, 2].includes(week))) { throw new Failure(400, 'Некорректные недели'); }
            } else if (key === 'onlineCourse') {
                if (typeof value !== 'boolean') { throw new Failure(400, 'Некорректный формат занятия'); }
            } else if (typeof value !== 'string' || value.length > 500) {
                throw new Failure(400, 'Некорректный текст изменения');
            }
        }
    }
}
export function createWorker(send = fetch) {
    return { async fetch(request, env) {
        const origin = request.headers.get('Origin');
        const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', Vary: 'Origin' };
        if (origin && ORIGINS.has(origin)) { headers['Access-Control-Allow-Origin'] = origin; }
        const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });
        try {
            if (origin && !ORIGINS.has(origin)) { throw new Failure(403, 'Источник не разрешён'); }
            if (new URL(request.url).pathname === '/health' && request.method === 'GET') {
                return reply({ ready: Boolean(env.ADMIN_CODE && env.GITHUB_APP_ID && env.GITHUB_INSTALLATION_ID && env.GITHUB_APP_PRIVATE_KEY) });
            }
            if (new URL(request.url).pathname !== '/changes') { throw new Failure(404, 'Путь не найден'); }
            if (request.method === 'OPTIONS') {
                headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
                headers['Access-Control-Allow-Headers'] = 'Content-Type';
                return new Response(null, { status: 204, headers });
            }
            if (request.method !== 'POST') { throw new Failure(405, 'Разрешена только запись события'); }
            if (!env.ADMIN_CODE || !env.GITHUB_APP_ID || !env.GITHUB_INSTALLATION_ID || !env.GITHUB_APP_PRIVATE_KEY) {
                throw new Failure(503, 'Сервис ещё не настроен');
            }
            let body;
            try { body = JSON.parse(await bounded(request.body, 32768)); } catch (error) {
                if (error instanceof Failure) { throw error; }
                throw new Failure(400, 'Некорректный JSON');
            }
            if (!body || body.code !== env.ADMIN_CODE) { throw new Failure(401, 'Код не совпадает'); }
            if (!Object.hasOwn(PATHS, body.kind) || !/^[a-f0-9]{40}$/.test(body.sha || '')) { throw new Failure(400, 'Некорректный журнал или SHA'); }
            validateEvent(body.kind, body.event);
            const token = await appToken(env, send);
            const gh = (method, path, data) => api(send, token, method, '/repos/' + REPO + path, data);
            const head = (await gh('GET', '/git/ref/heads/main')).object.sha;
            const paths = ['content/schedule.json', PATHS.permanent, PATHS.once];
            const records = await Promise.all(paths.map((path) => gh('GET', '/contents/' + path + '?ref=' + head)));
            const values = records.map((record) => JSON.parse(new TextDecoder().decode(unbase64(record.content))));
            const index = body.kind === 'permanent' ? 1 : 2;
            const previous = values[index].events.find((event) => event.id === body.event.id);
            if (previous) {
                if (canonical(previous) !== canonical(body.event)) { throw new Failure(409, 'ID события уже занят другой правкой'); }
                return reply({ content: { sha: records[index].sha }, commit: { html_url: 'https://github.com/' + REPO + '/commit/' + head }, alreadySaved: true, history: values[index] });
            }
            if (records[index].sha !== body.sha) { throw new Failure(409, 'Журнал изменился. Обновите данные; черновик сохранён.'); }
            values[index] = { ...values[index], events: [...values[index].events, body.event] };
            try { validateSchedule(structuredClone(values[0]), values[2], values[1]); } catch {
                throw new Failure(400, 'Изменение не соответствует расписанию');
            }
            const text = JSON.stringify(values[index]) + '\n';
            if (encoder.encode(text).length > 2 * 1024 * 1024) { throw new Failure(413, 'Журнал достиг ограничения размера'); }
            const commit = await gh('GET', '/git/commits/' + head);
            const tree = await gh('POST', '/git/trees', { base_tree: commit.tree.sha,
                tree: [{ path: PATHS[body.kind], mode: '100644', type: 'blob', content: text }] });
            const next = await gh('POST', '/git/commits', { message: 'Schedule: ' + body.kind + ' ' + body.event.action,
                tree: tree.sha, parents: [head] });
            await gh('PATCH', '/git/refs/heads/main', { sha: next.sha, force: false });
            const bytes = encoder.encode(text);
            const blob = new Uint8Array(encoder.encode('blob ' + bytes.length + '\0').length + bytes.length);
            const prefix = encoder.encode('blob ' + bytes.length + '\0');
            blob.set(prefix); blob.set(bytes, prefix.length);
            const digest = new Uint8Array(await crypto.subtle.digest('SHA-1', blob));
            const sha = [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
            return reply({ content: { sha }, commit: { html_url: next.html_url }, alreadySaved: false, history: values[index] });
        } catch (error) {
            return reply({ message: error instanceof Failure ? error.message : 'Сервис недоступен. Черновик сохранён.' }, error instanceof Failure ? error.status : 503);
        }
    } };
}
export default createWorker();
