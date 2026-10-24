const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '..');
const wait = () => new Promise((resolve) => setTimeout(resolve, 15));
const memory = new Map();
async function page(route, scripts = ['assets/tool-core.js', 'assets/tools.js'], native = null) {
    const dom = new JSDOM(fs.readFileSync(path.join(root, 'dist', route, 'index.html'), 'utf8'), {
        url: 'https://study.local/' + route + '/', runScripts: 'outside-only', pretendToBeVisual: true,
    });
    await new Promise((resolve) => dom.window.document.addEventListener('DOMContentLoaded', resolve, { once: true }));
    dom.window.TextEncoder = TextEncoder;
    dom.window.TextDecoder = TextDecoder;
    dom.window.matchMedia = () => ({ matches: false, addEventListener() {} });
    dom.window.scrollTo = () => {};
    if (native) { dom.window.StudyNative = native; }
    for (const [key, value] of memory) { dom.window.localStorage.setItem(key, value); }
    dom.window.fetch = async (url) => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(path.join(root, 'dist', String(url).replace(/^\//, '')), 'utf8')) });
    for (const script of scripts) { dom.window.eval(fs.readFileSync(path.join(root, script), 'utf8')); }
    await wait();
    return dom;
}
function click(window, text) {
    const button = [...window.document.querySelectorAll('button')].find((b) => b.textContent === text);
    assert.ok(button, text); button.click();
}
function input(window, label, value, event = 'input') {
    const field = [...window.document.querySelectorAll('label')].find((e) => e.firstChild?.textContent === label);
    assert.ok(field, label); const control = field.querySelector('input,textarea,select');
    control.value = value; control.dispatchEvent(new window.Event(event, { bubbles: true })); return control;
}
(async () => {
    const core = await page('tools/calculator'); const T = core.window.StudyTools;
    for (const [expression, expected] of [['-2^2', -4], ['2^-3', .125], ['2^3^2', 512], ['3!+4!', 30], ['sqrt(2)^2', 2], ['sin(pi/2)', 1], ['ln(e)', 1], ['1.2e3/3', 400], ['abs(-5)%3', 2]]) {
        assert.ok(Math.abs(T.compile(expression)() - expected) < 1e-10, expression);
    }
    assert.equal(T.compile('2*x+ans')({ x: 3, ans: 4 }), 10);
    for (const expression of ['window.alert(1)', '1;2', 'constructor(1)', '2x', 'sin()', '('.repeat(50) + '1' + ')'.repeat(50)]) {
        assert.throws(() => T.compile(expression), expression);
    }
    assert.equal(T.compile('(-1)!')() !== T.compile('(-1)!')(), true);
    assert.equal(T.convert(36, 'Скорость', 'км/ч', 'м/с'), 10);
    assert.equal(T.convert(1, 'Информация', 'КиБ', 'байт'), 1024);
    assert.equal(T.convert(1, 'Давление', 'атм', 'Па'), 101325);
    assert.ok(Math.abs(T.convert(32, 'Температура', '°F', 'K') - 273.15) < 1e-10);
    assert.throws(() => T.convert(-1, 'Температура', 'K', '°C'));
    const h = new T.History({ n: 0 }); h.push({ n: 1 }); h.push({ n: 2 }); assert.equal(h.undo().n, 1);
    h.push({ n: 3 }); assert.equal(h.redo().n, 3);
    const raw = { format: 'csu-flowchart', version: 1, title: 'Тест', nodes: [{ id: 'n1', type: 'start', text: '<script>alert(1)</script>', x: 30, y: 40 }], edges: [] };
    assert.ok(T.flowSvg(T.validateFlow(raw)).includes('&lt;script&gt;'));
    assert.ok(!T.flowSvg(T.validateFlow(raw)).includes('<script>'));
    assert.throws(() => T.validateFlow({ ...raw, nodes: [raw.nodes[0], raw.nodes[0]] }));
    assert.throws(() => T.validateFlow({ ...raw, edges: [{ from: 'n1', to: 'missing', label: '' }] }));
    input(core.window, 'Выражение', '1/0'); click(core.window, 'Вычислить');
    assert.match(core.window.document.getElementById('tool-status').textContent, /не определён/);
    core.window.close();

    let dom = await page('tools/notes'); let w = dom.window;
    click(w, 'Новая заметка'); input(w, 'Название', 'Личная запись'); input(w, 'Текст заметки', 'Не потерять после обновления');
    memory.set('study-workspace', w.localStorage.getItem('study-workspace')); dom.window.close();
    dom = await page('tools/notes'); w = dom.window;
    assert.equal(w.document.querySelector('textarea').value, 'Не потерять после обновления');
    input(w, 'Текст заметки', 'Изменённый текст'); click(w, 'Отменить');
    assert.equal(w.document.querySelector('textarea').value, 'Не потерять после обновления');
    click(w, 'Повторить'); assert.equal(w.document.querySelector('textarea').value, 'Изменённый текст'); dom.window.close();

    let exported;
    dom = await page('tools/flowcharts', undefined, { get() { return ''; }, put() {}, exportDocument(...args) { exported = args; }, importFlowchart() {} }); w = dom.window;
    click(w, 'Новая схема'); input(w, 'Тип блока', 'decision', 'change'); click(w, 'Добавить блок');
    input(w, 'Текст блока', 'x > 0?'); click(w, 'Применить блок'); click(w, 'Добавить связь'); click(w, 'Сохранить файл');
    assert.equal(exported[0], 'flowchart.csuflow'); assert.equal(exported[1], 'application/json');
    const file = JSON.parse(exported[2]); assert.equal(file.nodes.length, 2); assert.equal(file.edges.length, 1);
    const before = JSON.parse(w.localStorage.getItem('study-workspace')).flows.length;
    w.dispatchEvent(new w.CustomEvent('study-flow-import', { detail: { text: '{"format":"wrong"}' } }));
    assert.equal(JSON.parse(w.localStorage.getItem('study-workspace')).flows.length, before);
    w.dispatchEvent(new w.CustomEvent('study-flow-import', { detail: { text: exported[2] } }));
    assert.equal(JSON.parse(w.localStorage.getItem('study-workspace')).flows.length, before + 1);
    assert.ok(JSON.parse(w.localStorage.getItem('study-workspace')).notes.some((n) => n.title === 'Личная запись'));
    click(w, 'Отменить'); assert.equal(JSON.parse(w.localStorage.getItem('study-workspace')).flows.length, before); dom.window.close();

    dom = await page('tools/graphs'); w = dom.window;
    assert.equal(w.document.querySelectorAll('.graph-canvas path[clip-path]').length, 2);
    input(w, 'Функции, по одной на строку (до 4)', '1/x\nsqrt(x)'); click(w, 'Построить');
    assert.equal(w.document.querySelectorAll('.graph-canvas path[clip-path]').length, 2);
    input(w, 'x до', '-20'); click(w, 'Построить'); assert.match(w.document.getElementById('tool-status').textContent, /границы|Границы/); dom.window.close();

    dom = await page('tools/formula-editor', ['assets/tool-core.js', 'dist/assets/katex.min.js', 'assets/tools.js']); w = dom.window;
    assert.ok(w.document.querySelector('.tool-preview .katex')); click(w, 'Сохранить формулу');
    input(w, 'Формула LaTeX', '\\sqrt{x}'); assert.ok(w.document.querySelector('.tool-preview .katex'));
    click(w, 'Отменить'); assert.match(w.document.querySelector('textarea').value, /frac/); dom.window.close();

    dom = await page('tools/teachers'); w = dom.window;
    assert.ok(w.document.querySelectorAll('.tool-card-panel').length > 3);
    const description = w.document.querySelector('textarea'); description.value = 'Требования к сдаче'; description.dispatchEvent(new w.Event('input'));
    assert.ok(Object.values(JSON.parse(w.localStorage.getItem('study-workspace')).teacherNotes).some((x) => x.description === 'Требования к сдаче'));
    dom.window.close();

    dom = await page('tools/announcements'); w = dom.window;
    const writes = [];
    w.StudyAdmin = { code: 'TEST', request: async (method, file, payload) => {
        assert.equal(file, 'content/announcements.json');
        if (method === 'GET') { return { sha: 'old-sha', content: Buffer.from(JSON.stringify({ schema: 1, posts: [{ id: 'old', title: 'Старое', body: 'Сохранить', createdAt: '2026-10-01T00:00:00Z' }] })).toString('base64') }; }
        writes.push(payload); return {};
    } };
    input(w, 'Заголовок', 'Тестовое сообщение'); input(w, 'Текст объявления', 'Проверяется только в памяти теста');
    input(w, 'Код администратора', 'TEST'); input(w, 'GitHub-токен, только на этот сеанс', 'private-test-token');
    click(w, 'Опубликовать объявление'); await wait();
    assert.equal(writes.length, 1); assert.equal(writes[0].sha, 'old-sha');
    const published = JSON.parse(Buffer.from(writes[0].content, 'base64').toString()); assert.equal(published.posts[0].id, 'old'); assert.equal(published.posts.length, 2);
    assert.ok(![...Array(w.localStorage.length)].some((_, i) => w.localStorage.getItem(w.localStorage.key(i)).includes('private-test-token'))); dom.window.close();

    dom = await page('notes/informatics', ['assets/tool-core.js', 'assets/tools.js', 'assets/reader-tools.js']); w = dom.window;
    click(w, 'Режим чтения'); assert.ok(w.document.body.classList.contains('reading-mode'));
    w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' })); assert.ok(!w.document.body.classList.contains('reading-mode'));
    const paragraph = w.document.querySelector('section.topic p'); const range = w.document.createRange();
    range.selectNodeContents(paragraph); w.getSelection().removeAllRanges(); w.getSelection().addRange(range); w.document.dispatchEvent(new w.MouseEvent('mouseup', { bubbles: true }));
    click(w, 'Жёлтый'); assert.ok(w.document.querySelector('mark.user-highlight'), JSON.stringify({ saved: w.localStorage.getItem('study-workspace'), status: w.document.querySelector('.reader-actions').textContent }));
    memory.set('study-workspace', w.localStorage.getItem('study-workspace')); dom.window.close();
    dom = await page('notes/informatics', ['assets/tool-core.js', 'assets/tools.js', 'assets/reader-tools.js']); w = dom.window;
    assert.ok(w.document.querySelector('mark.user-highlight')); dom.window.close();
    dom = await page('textbooks', ['assets/tool-core.js', 'assets/tools.js', 'assets/reader-tools.js']); w = dom.window;
    const box = w.document.querySelector('.book-subject-choice input'); box.checked = !box.checked; click(w, 'Сохранить привязку');
    assert.ok(Object.keys(JSON.parse(w.localStorage.getItem('study-workspace')).bookBindings).length); dom.window.close();
    console.log('Tools: safe arithmetic, units, flow files, undo, persistence, graphs, formulas, teachers, publishing and reader highlights passed.');
})().catch((error) => { console.error(error); process.exit(1); });
