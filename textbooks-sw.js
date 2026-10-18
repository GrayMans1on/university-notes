'use strict';
const pdfCache = 'study-textbooks-pdfs-v1';
const shellCache = 'study-textbooks-shell-v1';
self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (event) => { event.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);
    const root = new URL('./', self.registration.scope);
    if (request.method !== 'GET' || url.origin !== root.origin || !url.pathname.startsWith(root.pathname)) { return; }
    if (url.pathname.startsWith(new URL('books/', root).pathname) && url.pathname.endsWith('.pdf')) {
        event.respondWith((async () => {
            const cached = await (await caches.open(pdfCache)).match(url.href);
            if (!cached) { return fetch(request); }
            const range = request.headers.get('range');
            if (!range) { return cached; }
            const match = /^bytes=(\d*)-(\d*)$/.exec(range);
            const blob = await cached.blob();
            const start = match && match[1] ? Number(match[1]) : match && match[2] ? Math.max(0, blob.size - Number(match[2])) : NaN;
            const end = match && match[1] && match[2] ? Math.min(Number(match[2]), blob.size - 1) : blob.size - 1;
            if (!Number.isSafeInteger(start) || start < 0 || start > end || start >= blob.size) {
                return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + blob.size } });
            }
            return new Response(blob.slice(start, end + 1), { status: 206, headers: {
                'Content-Type': 'application/pdf', 'Content-Length': String(end - start + 1),
                'Content-Range': `bytes ${start}-${end}/${blob.size}`, 'Accept-Ranges': 'bytes'
            } });
        })());
        return;
    }
    // Only explicitly saved catalog resources have an offline fallback; other pages remain untouched.
    event.respondWith(fetch(request).catch(async () => {
        const cached = await (await caches.open(shellCache)).match(request, { ignoreSearch: true });
        return cached || Response.error();
    }));
});
