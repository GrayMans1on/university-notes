(() => {
    'use strict';
    const palettes = {
        light: { background: '#ffffff', ink: '#182333', muted: '#68758a', accent: '#254cce' },
        dark: { background: '#172234', ink: '#e4ebf5', muted: '#a9b7cc', accent: '#a8bcff' },
    };
    function key(expression, destination, variable = 'x') {
        const ce = new window.ComputeEngine.ComputeEngine();
        const point = destination.replace(/^(\s*[+-]?\s*)(?:inf(?:inity)?|∞)\s*$/i, '$1\\infty');
        return JSON.stringify([ce.parse(expression).json, ce.parse(point).json, variable]);
    }
    function payload(result, theme = 'light') {
        if (!['finite', 'infinite'].includes(result.kind) || !result.chainComplete || !result.chain?.length) {
            throw new Error('Видео доступно после построения завершённой цепочки решения.');
        }
        if (result.chain.length > 40 || result.chain.some((step) => step.math.length > 12000)) {
            throw new Error('Решение слишком длинное для видео.');
        }
        return { schema: 1, palette: palettes[theme] || palettes.light,
            chain: result.chain.map(({ math, note, annotation }) => ({ math, ...(note ? { note } : {}), ...(annotation ? { annotation } : {}) })) };
    }
    function scene(template, data) {
        if (!template.includes('__CSU_MANIM_DATA__')) { throw new Error('Не удалось загрузить шаблон сцены.'); }
        return template.replace('__CSU_MANIM_DATA__', JSON.stringify(JSON.stringify(data)));
    }
    function mediaUrl(entry, theme, format, scriptSource) {
        const path = format === 'gif' ? entry.gif?.[theme] : format === 'mp4' ? entry[theme] : null;
        const pattern = format === 'gif' ? /^\/assets\/limit-videos\/[a-z0-9-]+\.gif$/
            : /^\/assets\/limit-videos\/[a-z0-9-]+\.mp4$/;
        if (typeof path !== 'string' || !pattern.test(path)) { throw new Error('Недопустимый адрес анимации.'); }
        return new URL(path.replace(/^\/assets\//, ''), new URL('.', scriptSource)).href;
    }
    let catalog;
    function attach(result, root) {
        const { element, button, row, say, exportFile } = window.StudyToolUI;
        const native = Boolean(window.StudyNative);
        const panel = element('details', undefined, 'limit-video-panel');
        panel.append(element('summary', native ? 'Видео решения · Manim' : 'Анимация решения · Manim'));
        const status = element('p', native ? 'Готовые ролики примеров доступны онлайн. Для своего решения можно скачать сцену Manim.'
            : 'Для подготовленных примеров доступны готовые GIF и MP4 в палитре сайта.', 'limit-video-status');
        const player = element('video', undefined, 'limit-video'); player.controls = true; player.preload = 'none'; player.hidden = true;
        const download = element('a', native ? 'Скачать видео' : 'Скачать MP4'); download.hidden = true;
        download.className = native ? 'limit-source' : 'limit-media-download';
        const gif = element('a', 'Скачать GIF'); gif.hidden = true; gif.className = 'limit-media-download primary';
        let generation = 0; let opened = false;
        const theme = () => document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
        async function load() {
            const current = ++generation;
            if (window.StudyNative) {
                status.textContent = 'Видео доступны на сайте; расчёт и экспорт сцены работают офлайн.';
                return;
            }
            download.hidden = true; gif.hidden = true;
            try {
                if (!catalog) {
                    catalog = fetch('/assets/limit-videos/catalog.json?v=__MANIM_BUILD__').then((response) => {
                        if (!response.ok) { throw new Error('Готовое видео пока не опубликовано.'); } return response.json();
                    }).catch((error) => { catalog = null; throw error; });
                }
                const data = await catalog; if (current !== generation || !panel.isConnected) { return; }
                const id = key(result.expression, result.destination, result.variable);
                const entry = data.videos?.find((video) => video.key === id);
                if (!entry) { player.hidden = true; status.textContent = 'Готовой GIF/MP4 для этого предела пока нет. Доступен исходник сцены .py для самостоятельного рендера.'; return; }
                const script = document.querySelector('script[src*="manim-export.js"]').src;
                const href = mediaUrl(entry, theme(), 'mp4', script);
                const playing = !player.paused; const position = player.currentTime || 0;
                player.preload = 'metadata'; player.src = href; player.hidden = false;
                download.href = href; download.download = href.split('/').pop(); download.hidden = false;
                if (entry.gif?.[theme()]) {
                    gif.href = mediaUrl(entry, theme(), 'gif', script); gif.download = gif.href.split('/').pop(); gif.hidden = false;
                    const size = entry.gifInfo?.[theme()]?.size;
                    gif.textContent = 'Скачать GIF' + (Number.isFinite(size) ? ' · ' + (size / 1048576).toFixed(1) + ' МБ' : '');
                }
                player.addEventListener('loadedmetadata', () => {
                    player.currentTime = Math.min(position, Math.max(0, player.duration - .1));
                    if (playing) { player.play().catch(() => {}); }
                }, { once: true });
                status.textContent = gif.hidden ? 'Ролик Manim доступен в MP4. GIF для него пока не опубликована.'
                    : 'GIF создана из этого ролика Manim. Скачивается вариант для текущей темы сайта.';
            } catch (error) { if (current === generation) { status.textContent = error.message; } }
        }
        panel.addEventListener('toggle', () => { if (panel.open) { opened = true; load(); } else { player.pause(); } });
        const observer = new MutationObserver(() => {
            if (!panel.isConnected) { generation += 1; observer.disconnect(); return; }
            if (opened && panel.open) { load(); }
        });
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        const sourceButton = button('Скачать сцену .py', async () => {
            const data = payload(result, theme());
            const response = await fetch('/assets/manim-scene.py?v=__MANIM_BUILD__');
            if (!response.ok) { throw new Error('Шаблон Manim недоступен.'); }
            exportFile('limit-animation.py', 'text/x-python', scene(await response.text(), data));
            say('Команда рендера указана в первой строке .py. Сцена содержит текущее решение.');
        });
        const actions = native ? row(sourceButton, download) : row(gif, download, sourceButton);
        if (!native) { actions.classList.add('limit-video-actions'); }
        panel.append(status, actions, player);
        if (window.StudyNative) {
            const online = element('a', 'Открыть видео на сайте');
            online.href = 'https://graymans1on.github.io/university-notes/tools/limits/';
            panel.append(online);
        }
        root.append(panel);
        const cleanup = new MutationObserver(() => {
            if (!panel.isConnected) {
                generation += 1; observer.disconnect(); cleanup.disconnect(); player.pause();
                player.removeAttribute('src'); player.load();
            }
        });
        cleanup.observe(root, { childList: true });
    }
    window.StudyManim = { key, payload, scene, attach, mediaUrl, palettes };
})();
