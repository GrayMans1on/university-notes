const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const context = { window: { ComputeEngine: require('@cortex-js/compute-engine') }, URL };
vm.createContext(context);
for (const file of ['limits-engine', 'manim-export']) { vm.runInContext(fs.readFileSync('assets/' + file + '.js', 'utf8'), context); }
const M = context.window.StudyManim;
assert.equal(M.key('1/x', 'inf'), M.key('\\frac1x', '\\infty'));
assert.equal(M.key('\\sin(x)/x', '0'), M.key('\\frac{\\sin x}{x}', '0'));
const result = context.window.StudyLimits.solve('(1+2x)^{3/x}', '0');
const template = fs.readFileSync('assets/manim-scene.py', 'utf8');
for (const theme of ['light', 'dark']) {
    const payload = M.payload(result, theme); const scene = M.scene(template, payload);
    assert.doesNotMatch(scene, /__CSU_MANIM_DATA__/);
    assert.ok(scene.includes(M.palettes[theme].background));
    assert.equal(payload.chain.length, result.chain.length);
    assert.doesNotMatch(scene, /eval\(|exec\(/);
    const check = spawnSync('python3', ['-c', 'import ast,sys; ast.parse(sys.stdin.read())'], { input: scene, encoding: 'utf8' });
    assert.equal(check.status, 0, check.stderr);
}
assert.throws(() => M.payload({ kind: 'unknown' }));
const entry = { light: '/assets/limit-videos/limit-light-v1.mp4', dark: '/assets/limit-videos/limit-dark-v1.mp4',
    gif: { light: '/assets/limit-videos/limit-light-v1.gif', dark: '/assets/limit-videos/limit-dark-v1.gif' },
    key: M.key(result.expression, result.destination, result.variable) };
const script = 'https://example.test/university-notes/assets/manim-export.js?v=1';
assert.equal(M.mediaUrl(entry, 'light', 'gif', script), 'https://example.test/university-notes/assets/limit-videos/limit-light-v1.gif');
assert.equal(M.mediaUrl(entry, 'dark', 'mp4', script), 'https://example.test/university-notes/assets/limit-videos/limit-dark-v1.mp4');
assert.throws(() => M.mediaUrl({ gif: { light: 'https://other.test/file.gif' } }, 'light', 'gif', script));
assert.throws(() => M.mediaUrl({ gif: { light: '/assets/limit-videos/../file.gif' } }, 'light', 'gif', script));

const { JSDOM } = require('jsdom');
const wait = () => new Promise((resolve) => setTimeout(resolve, 15));
async function checkPanel(native = false) {
    const dom = new JSDOM('<!doctype html><html data-theme="light"><body><script src="' + script
        + '"></script><div id="root"></div></body></html>', { url: 'https://example.test/university-notes/tools/limits/', runScripts: 'outside-only' });
    const w = dom.window; let requests = 0;
    w.ComputeEngine = require('@cortex-js/compute-engine');
    w.HTMLMediaElement.prototype.pause = () => {};
    w.HTMLMediaElement.prototype.load = () => {};
    w.fetch = async () => { requests += 1; return { ok: true, json: async () => ({ schema: 1, videos: [entry] }) }; };
    w.StudyToolUI = {
        element(tag, text, name) { const node = w.document.createElement(tag); if (text) { node.textContent = text; } if (name) { node.className = name; } return node; },
        button(text, action) { const node = w.document.createElement('button'); node.textContent = text; node.onclick = action; return node; },
        row(...nodes) { const node = w.document.createElement('div'); node.append(...nodes); return node; },
        say() {}, exportFile() {},
    };
    if (native) { w.StudyNative = {}; }
    w.eval(fs.readFileSync('assets/manim-export.js', 'utf8'));
    const root = w.document.getElementById('root');
    w.StudyManim.attach(result, root);
    const panel = root.querySelector('details'); panel.open = true;
    panel.dispatchEvent(new w.Event('toggle')); await wait();
    if (native) {
        assert.equal(requests, 0, 'Android never requests GIF or MP4 media');
        assert.equal(root.querySelectorAll('.limit-media-download').length, 0);
    } else {
        const gif = root.querySelector('.limit-media-download.primary');
        const mp4 = root.querySelector('.limit-media-download:not(.primary)');
        assert.equal(gif.hidden, false); assert.equal(mp4.hidden, false);
        assert.match(gif.href, /limit-light-v1\.gif$/);
        assert.match(gif.download, /\.gif$/);
        w.document.documentElement.dataset.theme = 'dark'; await wait();
        assert.match(gif.href, /limit-dark-v1\.gif$/);
        assert.match(mp4.href, /limit-dark-v1\.mp4$/);
        root.replaceChildren();
        w.StudyManim.attach(context.window.StudyLimits.solve('\\frac{\\sin(8x)}{3x}', '0'), root);
        const missing = root.querySelector('details'); missing.open = true;
        missing.dispatchEvent(new w.Event('toggle')); await wait();
        assert.ok([...root.querySelectorAll('.limit-media-download')].every((link) => link.hidden));
        assert.match(root.querySelector('.limit-video-status').textContent, /пока нет/);
    }
    w.close();
}
(async () => {
    await checkPanel(); await checkPanel(true);
    console.log('Manim: exact scene payloads, GIF/MP4 paths, theme switching, unmatched limits and Android exclusion passed.');
})().catch((error) => { console.error(error); process.exit(1); });
