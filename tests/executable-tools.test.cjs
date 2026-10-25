const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = { window: { ComputeEngine: require('@cortex-js/compute-engine') } };
vm.createContext(context);
for (const file of ['tool-core.js', 'math-runtime.js', 'flow-runtime.js']) {
    vm.runInContext(fs.readFileSync('assets/' + file, 'utf8'), context);
}
const { StudyMath: M, StudyFlow: F, StudyTools: T } = context.window;
for (const [formula, expected] of [['\\sum_{n=1}^4 n^2', 30], ['\\prod_{n=1}^4 n', 24],
    ['\\frac{1}{2}+\\sqrt{9}', 3.5], ['\\ln(e)', 1], ['\\log_2(8)', 3], ['\\log_3(9)', 2],
    ['\\sin(\\pi/2)', 1], ['\\sin^{-1}(1)', Math.PI / 2], ['\\sinh(1)', Math.sinh(1)],
    ['\\operatorname{arsinh}(1)', Math.asinh(1)], ['\\lfloor2.9\\rfloor', 2], ['\\min(3,2)', 2]]) {
    assert.ok(Math.abs(M.compile(formula)() - expected) < 1e-10, formula);
}
assert.equal(M.compile('2x+1')({ x: 5 }), 11);
assert.equal(M.compile('\\operatorname{ans}+1')({ ans: 4 }), 5);
assert.throws(() => M.compile('\\sum_{n=1}^{1001}n')());
assert.throws(() => M.compile('\\int_0^1 x dx')());
assert.throws(() => M.compile('z+1')({ x: 2 }));
assert.throws(() => T.compile('x+1')({}));
const node = (id, type, config = {}) => ({ id, type, config, text: id, x: 50, y: 50 });
const edge = (from, to, label = '') => ({ from, to, label });
const document = { format: 'csu-flowchart', version: 1, title: 'Сумма чисел', nodes: [
    node('start', 'start'), node('input', 'input', { variable: 'n' }),
    node('init', 'process', { variable: 'total', operation: 'expression', expression: '0' }),
    node('condition', 'decision', { left: 'n', operator: '>', right: '0' }),
    node('add', 'process', { variable: 'total', operation: '+', left: 'total', right: 'n' }),
    node('decrement', 'process', { variable: 'n', operation: '-', left: 'n', right: '1' }),
    node('output', 'output', { expression: 'total' }), node('end', 'end'),
], edges: [edge('start', 'input'), edge('input', 'init'), edge('init', 'condition'),
    edge('condition', 'add', 'Да'), edge('condition', 'output', 'Нет'), edge('add', 'decrement'),
    edge('decrement', 'condition'), edge('output', 'end')] };
const runner = new F.Runner(document);
runner.step(); runner.step();
assert.equal(runner.waiting.variables[0], 'n');
assert.throws(() => runner.provide({ n: 'Infinity' }));
runner.provide({ n: '5' });
while (!runner.done) { runner.step(); }
assert.equal(runner.output[0].value, 15);
assert.equal(runner.variables.n, 0);
const reload = T.validateFlow(JSON.parse(JSON.stringify(document)));
assert.equal(reload.nodes[4].config.operation, '+');
const looping = new F.Runner({ ...document, edges: [edge('start', 'start')] });
assert.throws(() => { for (let i = 0; i < 10001; i += 1) { looping.step(); } }, /10 000/);
const invalid = new F.Runner({ ...document, edges: [edge('start', 'output')] });
invalid.step(); assert.throws(() => invalid.step(), /total/);
console.log('Executable tools: mathematical input semantics, sums, limits, variables, input, branches and loops passed.');
const variables = Object.create(null);
F.execute('a = 2\na = a * 2\nb = a * 10 + 1\ns = -175 % 100\nt = -5 // 2\nu = 2 ** 3 # Python powers\nv = math.sqrt(9)', variables);
assert.deepEqual({ ...variables }, { a: 4, b: 41, s: 25, t: -3, u: 8, v: 3 });
F.execute('a += 1; b *= 2', variables);
assert.equal(variables.a, 5); assert.equal(variables.b, 82);
const before = JSON.stringify(variables);
assert.throws(() => F.execute('a = 900\nb = missing + 1', variables));
assert.equal(JSON.stringify(variables), before, 'failed action block must be atomic');
for (const program of ['import os', 'window.alert(1)', 'a = __import__(1)', 'a = constructor(1)']) {
    assert.throws(() => F.execute(program, variables));
}
const infiniteFlow = T.validateFlow({ ...document, nodes: document.nodes.map((n, i) => ({ ...n, x: -10000 + i * 1000, y: i * 2000 })), viewport: { x: -8000, y: 12000, scale: .03 } });
assert.equal(infiniteFlow.viewport.x, -8000);
const svg = T.flowSvg(infiniteFlow);
assert.match(svg, /viewBox="-/);
for (const edge of infiniteFlow.edges) {
    const target = infiniteFlow.nodes.find(n => n.id === edge.to);
    assert.ok(svg.includes(`H${target.x + 85}V${target.y}`), 'all arrows enter at the top');
}
console.log('Flow actions: multiline Python arithmetic, atomic errors, safe parsing and unbounded geometry passed.');
