const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '..');
const wait = () => new Promise((resolve) => setTimeout(resolve, 15));
const memory = new Map();
async function page(route, scripts = ['assets/tool-core.js', 'assets/math-runtime.js', 'assets/math-tools.js', 'assets/flow-runtime.js', 'assets/flow-editor.js', 'assets/tools.js'], native = null) {
    const dom = new JSDOM(fs.readFileSync(path.join(root, 'dist', route, 'index.html'), 'utf8'), {
        url: 'https://study.local/' + route + '/', runScripts: 'outside-only', pretendToBeVisual: true,
    });
    await new Promise((resolve) => dom.window.document.addEventListener('DOMContentLoaded', resolve, { once: true }));
    dom.window.TextEncoder = TextEncoder;
    dom.window.TextDecoder = TextDecoder;
    dom.window.matchMedia = () => ({ matches: false, addEventListener() {} });
    dom.window.scrollTo = () => {};
    dom.window.ComputeEngine = require('@cortex-js/compute-engine');
    dom.window.ResizeObserver = class { observe() {} disconnect() {} };
    class MathField extends dom.window.HTMLElement {
        get value() { return this._value || ''; }
        set value(value) { this._value = value; }
        insert(value) { this.value += value; }
        connectedCallback() { this.dispatchEvent(new dom.window.Event('mount')); }
    }
    dom.window.customElements.define('math-field', MathField);
    dom.window.MathfieldElement = MathField;
    dom.window.SVGElement.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1220, height: 1020 });
    dom.window.HTMLElement.prototype.setPointerCapture = () => {};
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
    assert.ok(field, label); const control = field.querySelector('input,textarea,select,math-field');
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

    dom = await page('tools/flowcharts'); w = dom.window;
    click(w, 'Новая схема');
    const board = w.document.querySelector('.flow-board');
    board.dispatchEvent(new w.MouseEvent('contextmenu', { bubbles: true, clientX: 300, clientY: 200 }));
    click(w, 'Создать блок');
    const menu = w.document.querySelector('.flow-context-menu');
    [...menu.querySelectorAll('button')].find((button) => button.textContent === 'Ввод').click();
    input(w, 'Переменные через запятую', 'a, b');
    const stored = JSON.parse(w.localStorage.getItem('study-workspace'));
    assert.equal(stored.flows[0].document.nodes[1].config.variable, 'a, b');
    click(w, 'Отменить'); click(w, 'Повторить');
    assert.equal(JSON.parse(w.localStorage.getItem('study-workspace')).flows[0].document.nodes[1].config.variable, 'a, b');
    const fileInput = w.document.querySelector('input[type=file]');
    Object.defineProperty(fileInput, 'files', { configurable: true, value: [{ size: 20, text: async () => '{"format":"wrong"}' }] });
    fileInput.dispatchEvent(new w.Event('change')); await wait();
    assert.equal(JSON.parse(w.localStorage.getItem('study-workspace')).flows.length, 1);
    Object.defineProperty(fileInput, 'files', { value: [{ size: 100, text: async () => JSON.stringify(stored.flows[0].document) }] });
    fileInput.dispatchEvent(new w.Event('change')); await wait();
    assert.equal(JSON.parse(w.localStorage.getItem('study-workspace')).flows.length, 2);
    assert.ok(JSON.parse(w.localStorage.getItem('study-workspace')).notes.some((note) => note.title === 'Личная запись'));
    dom.window.close();

    dom = await page('tools/graphs'); w = dom.window;
    assert.equal(w.document.querySelectorAll('[data-curve]').length, 2);
    const scale = JSON.parse(w.localStorage.getItem('study-graphs')).view.scale;
    w.document.querySelector('.graph-canvas').dispatchEvent(new w.WheelEvent('wheel', { deltaY: -100, clientX: 400, clientY: 200, cancelable: true }));
    await wait(); assert.ok(JSON.parse(w.localStorage.getItem('study-graphs')).view.scale > scale);
    input(w, 'Функция 1', '\\sqrt{x}'); await wait();
    assert.equal(w.document.querySelectorAll('[data-curve]').length, 2); dom.window.close();

    dom = await page('tools/formula-editor'); w = dom.window;
    click(w, 'Сохранить формулу'); input(w, 'Формула', '\\sqrt{x}');
    assert.equal(JSON.parse(w.localStorage.getItem('study-workspace')).formulas[0].code, '\\sqrt{x}');
    click(w, 'Отменить'); assert.match(w.document.querySelector('math-field').value, /frac/); dom.window.close();

    dom = await page('tools/converter'); w = dom.window;
    assert.equal(w.document.querySelectorAll('.converter-grid label').length, 4);
    input(w, 'Исходное число', '1000');
    const before = w.document.querySelector('input[readonly]').value;
    click(w, '⇅'); assert.notEqual(w.document.querySelector('input[readonly]').value, before); dom.window.close();
    dom = await page('tools/teachers'); w = dom.window;
    assert.ok(w.document.querySelectorAll('.teacher-card').length > 3);
    assert.equal(w.document.querySelectorAll('#tool-root textarea, #tool-root input[type=password], #tool-root button').length, 0);
    assert.ok(w.document.querySelector('.teacher-subjects a[href*=notes]'));
    assert.ok(w.document.querySelector('.teacher-subjects a[href*="discrete-math"]')); 
    assert.ok(!w.document.querySelector('#tool-root').textContent.includes('Кафедра')); dom.window.close();
    dom = await page('tools/announcements'); w = dom.window;
    assert.equal(w.document.querySelectorAll('#tool-root input, #tool-root button, #tool-root textarea').length, 0); dom.window.close();

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
    console.log('Tools: safe arithmetic, units, flow files, undo, persistence, graphs, formulas, read-only catalogs and reader highlights passed.');
})().catch((error) => { console.error(error); process.exit(1); });
