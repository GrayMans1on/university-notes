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
    let catalog;
    function attach(result, root) {
        const { element, button, row, say, exportFile } = window.StudyToolUI;
        const panel = element('details', undefined, 'limit-video-panel'); panel.append(element('summary', 'Видео решения · Manim'));
        const status = element('p', 'Готовые ролики примеров доступны онлайн. Для своего решения можно скачать сцену Manim.', 'limit-video-status');
        const player = element('video', undefined, 'limit-video'); player.controls = true; player.preload = 'none'; player.hidden = true;
        const download = element('a', 'Скачать видео'); download.hidden = true; download.className = 'limit-source';
        let generation = 0; let opened = false;
        const theme = () => document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
        async function load() {
            const current = ++generation;
            try {
                if (!catalog) {
                    catalog = fetch('/assets/limit-videos/catalog.json?v=__MANIM_BUILD__').then((response) => {
                        if (!response.ok) { throw new Error('Готовое видео пока не опубликовано.'); } return response.json();
                    }).catch((error) => { catalog = null; throw error; });
                }
                const data = await catalog; if (current !== generation || !panel.isConnected) { return; }
                const id = key(result.expression, result.destination, result.variable);
                const entry = data.videos?.find((video) => video.key === id);
                if (!entry) { player.hidden = true; download.hidden = true; status.textContent = 'Для этой записи готового MP4 пока нет. Скачайте сцену текущего решения для рендера в Manim.'; return; }
                const url = entry[theme()];
                if (typeof url !== 'string' || !/^\/assets\/limit-videos\/[a-z0-9-]+\.mp4$/.test(url)) { throw new Error('Недопустимый адрес видео.'); }
                const base = new URL('.', document.querySelector('script[src*="manim-export.js"]').src);
                const href = new URL(url.replace(/^\/assets\//, ''), base).href;
                const playing = !player.paused; const position = player.currentTime || 0;
                player.src = href; player.hidden = false; download.href = href; download.download = 'limit-' + theme() + '.mp4'; download.hidden = false;
                player.addEventListener('loadedmetadata', () => {
                    player.currentTime = Math.min(position, Math.max(0, player.duration - .1));
                    if (playing) { player.play().catch(() => {}); }
                }, { once: true });
                status.textContent = 'Реальный ролик Manim. Палитра видео следует теме сайта.';
            } catch (error) { if (current === generation) { status.textContent = error.message; } }
        }
        panel.addEventListener('toggle', () => { if (panel.open) { opened = true; load(); } else { player.pause(); } });
        const observer = new MutationObserver(() => {
            if (!panel.isConnected) { generation += 1; observer.disconnect(); return; }
            if (opened && panel.open) { load(); }
        });
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        panel.append(status, row(button('Скачать сцену .py', async () => {
            const data = payload(result, theme());
            const response = await fetch('/assets/manim-scene.py?v=__MANIM_BUILD__');
            if (!response.ok) { throw new Error('Шаблон Manim недоступен.'); }
            exportFile('limit-animation.py', 'text/x-python', scene(await response.text(), data));
            say('Команда рендера указана в первой строке .py. Сцена содержит текущее решение.');
        }), download), player);
        root.append(panel);
        const cleanup = new MutationObserver(() => {
            if (!panel.isConnected) {
                generation += 1; observer.disconnect(); cleanup.disconnect(); player.pause();
                player.removeAttribute('src'); player.load();
            }
        });
        cleanup.observe(root, { childList: true });
    }
    window.StudyManim = { key, payload, scene, attach, palettes };
})();
