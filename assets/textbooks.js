(() => {
    'use strict';
    const script = document.currentScript;
    const data = document.getElementById('textbook-data');
    if (!data) { return; }
    const books = JSON.parse(data.textContent).books;
    const native = window.StudyNative;
    const root = new URL('../', script.src);
    const cacheName = 'study-textbooks-pdfs-v1';
    const shellName = 'study-textbooks-shell-v1';
    let workerReady;
    if (!native && 'serviceWorker' in navigator && window.isSecureContext) {
        workerReady = navigator.serviceWorker.register(new URL('textbooks-sw.js', root), { scope: root.pathname })
            .then(() => navigator.serviceWorker.ready);
        workerReady.catch(() => {});
    }
    const webStates = {};
    const statusFor = (id) => {
        if (native && typeof native.textbookStatus === 'function') {
            try { return JSON.parse(native.textbookStatus())[id] || {}; } catch { return {}; }
        }
        return webStates[id] || {};
    };
    const render = () => {
        for (const book of books) {
            const item = document.querySelector('[data-book-id="' + book.id + '"]');
            if (!item) { continue; }
            const state = statusFor(book.id);
            const button = item.querySelector('.textbook-offline');
            button.disabled = Boolean(state.busy) || !(native ? typeof native.downloadTextbook === 'function' : workerReady);
            button.textContent = state.saved ? 'Открыть офлайн' : state.busy ? 'Скачивание…' : 'Скачать офлайн';
            item.querySelector('.textbook-status').textContent = state.message || (state.saved
                ? 'Сохранён на этом устройстве · доступен офлайн'
                : workerReady || native ? 'Доступен онлайн · офлайн-копия ещё не скачана' : 'Офлайн-хранилище недоступно в этом браузере. PDF можно открыть онлайн и сохранить из просмотрщика.');
        }
    };
    const cacheShell = async () => {
        const urls = [location.href.split('#')[0], new URL('assets/textbooks.json', root).href];
        for (const element of document.querySelectorAll('script[src], link[rel="stylesheet"]')) {
            const url = new URL(element.src || element.href, location.href);
            if (url.origin === location.origin) { urls.push(url.href); }
        }
        const cache = await caches.open(shellName);
        await cache.addAll([...new Set(urls)]);
    };
    for (const book of books) {
        const item = document.querySelector('[data-book-id="' + book.id + '"]');
        item.querySelector('.textbook-offline').addEventListener('click', async () => {
            const state = statusFor(book.id);
            if (native) {
                if (state.saved) { native.openTextbook(book.id); } else { native.downloadTextbook(book.id); }
                render();
                return;
            }
            if (state.saved) { location.assign(book.url); return; }
            webStates[book.id] = { busy: true, message: 'Скачивание… Не закрывайте эту страницу.' };
            render();
            try {
                await workerReady;
                await cacheShell();
                const response = await fetch(book.url, { cache: 'no-store' });
                if (!response.ok || response.type === 'opaque') { throw new Error('download'); }
                const size = Number(response.headers.get('content-length'));
                if (size && size !== book.size) { throw new Error('size'); }
                const cache = await caches.open(cacheName);
                await cache.put(book.url, response);
                // A successful Cache.put consumes the entire stream before marking the book saved.
                webStates[book.id] = { saved: true };
            } catch {
                webStates[book.id] = { message: 'Не удалось сохранить PDF. Проверьте сеть и свободное место, затем повторите.' };
            }
            render();
        });
    }
    window.addEventListener('study-textbooks', render);
    render();
    if (workerReady) {
        workerReady.then(async () => {
            const cache = await caches.open(cacheName);
            for (const book of books) {
                webStates[book.id] = { saved: Boolean(await cache.match(book.url)) };
            }
            render();
        }).catch(() => {
            workerReady = null;
            render();
        });
    }
})();
