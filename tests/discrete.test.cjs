const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const context = { window: {} }; vm.createContext(context); vm.runInContext(fs.readFileSync('assets/discrete-engine.js', 'utf8'), context);
const D = context.window.StudyDiscrete; const json = (value) => JSON.parse(JSON.stringify(value));
const u = ['a', 'b', 'c'];
assert.deepEqual(json(D.parsePairs('{(a,b), (c,a), (a,b)}', u)), [['a', 'b'], ['c', 'a']]);
assert.deepEqual(json(D.parsePairs('a -> b\nb → c', u)), [['a', 'b'], ['b', 'c']]);
assert.deepEqual(json(D.operate(u, [['a', 'b']], [['b', 'c']], 'compose')), [['a', 'c']]);
assert.deepEqual(json(D.operate(u, [['a', 'b']], [['b', 'c']], 'reverse')), []);
for (let bits = 0; bits < 512; bits += 1) {
    const pairs = u.flatMap((a, i) => u.flatMap((b, j) => bits & (1 << (i * 3 + j)) ? [[a, b]] : []));
    assert.deepEqual(json(D.fromMatrix(u, D.matrix(u, pairs))), pairs);
    assert.deepEqual(json(D.parsePairs(pairs.map(([a, b]) => '(' + a + ',' + b + ')').join(','), u)), pairs);
    assert.deepEqual(json(D.operate(u, D.operate(u, pairs, [], 'inverse'), [], 'inverse')), pairs);
    const square = D.operate(u, pairs, [], 'square');
    const expected = u.flatMap((a) => u.flatMap((c) => u.some((b) => pairs.some(([x, y]) => a === x && b === y) && pairs.some(([x, y]) => b === x && c === y)) ? [[a, c]] : []));
    assert.deepEqual(json(square), expected);
    const p = D.properties(u, pairs);
    const has = (a, b) => pairs.some(([x, y]) => a === x && b === y);
    const symmetric = pairs.every(([a, b]) => has(b, a));
    const transitive = pairs.every(([a, b]) => pairs.every(([x, c]) => b !== x || has(a, c)));
    assert.equal(p.values.find((v) => v.name === 'Симметричность').holds, symmetric);
    assert.equal(p.values.find((v) => v.name === 'Транзитивность').holds, transitive);
    if (p.equivalence) { assert.deepEqual(json(p.classes.flat().sort()), u); }
}
const eq = D.properties(u, [['a', 'a'], ['b', 'b'], ['c', 'c'], ['a', 'b'], ['b', 'a']]);
assert.equal(eq.equivalence, true); assert.deepEqual(json(eq.classes), [['a', 'b'], ['c']]);
for (let a = 0; a < 8; a += 1) {
    for (let b = 0; b < 8; b += 1) {
        const sets = { A: u.filter((_, i) => a & (1 << i)), B: u.filter((_, i) => b & (1 << i)), C: [] };
        assert.deepEqual(json(D.setExpression('¬(A ∪ B)', u, sets)), json(D.setExpression("A' ∩ B'", u, sets)));
        assert.deepEqual(json(D.setExpression('A △ B', u, sets)), u.filter((v) => sets.A.includes(v) !== sets.B.includes(v)));
        assert.deepEqual(json(D.setExpression('A \\ B', u, sets)), u.filter((v) => sets.A.includes(v) && !sets.B.includes(v)));
    }
}
for (const action of [() => D.universe('a,a'), () => D.parsePairs('(a,z)', u), () => D.parsePairs('(a,b)alert(1)', u),
    () => D.fromMatrix(u, [[1]]), () => D.setExpression('fetch(1)', u, { A: [], B: [], C: [] }),
    () => D.document({ format: 'csu-relations', version: 1, universe: ['a,b'], R: [], S: [], active: 'R', mode: 'list' }, 'relations')]) { assert.throws(action); }

function page(type) {
    const dom = new JSDOM('<div id="tool-root"></div><p id="tool-status"></p>', { url: 'https://study.local', runScripts: 'outside-only' });
    const w = dom.window; w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    w.HTMLDialogElement.prototype.close = function () { this.open = false; };
    for (const file of ['tool-core', 'tool-session', 'tools', 'discrete-engine', 'discrete-ui']) { w.eval(fs.readFileSync('assets/' + file + '.js', 'utf8')); }
    w.StudyDiscreteUI[type](w.document.getElementById('tool-root')); return dom;
}
const click = (w, text) => {
    const node = [...w.document.querySelectorAll('button')].find((item) => item.textContent === text); assert.ok(node, text); node.click();
};
const set = (w, title, value, event = 'input') => {
    const label = [...w.document.querySelectorAll('label')].find((node) => node.firstChild?.textContent === title); assert.ok(label, title);
    const input = label.querySelector('input,textarea,select'); input.value = value; input.dispatchEvent(new w.Event(event, { bubbles: true })); return input;
};
let dom = page('relations'); let w = dom.window;
set(w, 'Универсум U', '1, 2, 3'); click(w, 'Задать универсум');
set(w, 'Пары отношения', '(1, 2), (2, 3)'); set(w, 'Представление', 'matrix', 'change');
assert.equal(w.document.querySelector('[aria-label="Пара (1, 2)"]').getAttribute('aria-pressed'), 'true');
w.document.querySelector('[aria-label="Пара (3, 1)"]').click();
set(w, 'Представление', 'plot', 'change');
assert.equal(w.document.querySelector('[aria-label="Точка (3, 1)"]').getAttribute('aria-pressed'), 'true');
w.document.querySelector('[aria-label="Точка (2, 3)"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
set(w, 'Представление', 'graph', 'change');
w.document.querySelector('[aria-label="Вершина 1"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
w.document.querySelector('[aria-label="Вершина 1"]').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
set(w, 'Представление', 'list', 'change');
assert.equal(w.document.querySelector('textarea').value, '(1, 1), (1, 2), (3, 1)');
set(w, 'Пары отношения', '(1, 99)'); set(w, 'Представление', 'matrix', 'change');
assert.equal(w.document.querySelector('select').value, 'R'); assert.equal(w.document.querySelectorAll('select')[1].value, 'list');
assert.match(w.document.getElementById('tool-status').textContent, /универсум/);
set(w, 'Пары отношения', '(1, 1), (1, 2), (3, 1)');
const saved = D.document(json({ format: 'csu-relations', version: 1, universe: ['1', '2', '3'], R: [['1', '2']], S: [], mode: 'graph', active: 'R' }), 'relations');
assert.equal(saved.mode, 'graph'); dom.window.close();
dom = page('venn'); w = dom.window;
set(w, 'Универсум U', '1, 2, 3, 4'); set(w, 'Множество A', '1, 2'); set(w, 'Множество B', '2, 3');
set(w, 'Множество C', ''); set(w, 'Выражение над множествами', '(A ∪ B) \\ C'); click(w, 'Построить диаграмму');
assert.match(w.document.querySelector('.venn-result h2').textContent, /\{1, 2, 3\}/);
const checkbox = w.document.querySelector('[aria-label="4 принадлежит A"]'); checkbox.checked = true; checkbox.dispatchEvent(new w.Event('change', { bubbles: true }));
assert.match(w.document.querySelector('.venn-result h2').textContent, /\{1, 2, 3, 4\}/);
set(w, 'Выражение над множествами', '¬(A ∪ B)'); click(w, 'Построить диаграмму');
assert.equal(w.document.querySelector('.venn-result h2').textContent, 'Результат: {}');
assert.equal(w.localStorage.length, 0); dom.window.close();
console.log('Discrete tools: exhaustive three-element relation round trips, composition, properties, set identities and editing across all four views passed.');
