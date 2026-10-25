const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const katex = require('katex');
const context = { window: { ComputeEngine: require('@cortex-js/compute-engine') } };
vm.createContext(context); vm.runInContext(fs.readFileSync('assets/limits-engine.js', 'utf8'), context);
const solve = context.window.StudyLimits.solve;
const ce = new context.window.ComputeEngine.ComputeEngine();
const cases = [
    ['\\frac{x^2-1}{x-1}', '1', 'finite', 2],
    ['\\frac{\\sin x}{x}', '0', 'finite', 1],
    ['\\frac{1-\\cos x}{x^2}', '0', 'finite', .5],
    ['\\frac{1}{x}', '0', 'dne'],
    ['\\frac{1}{x^2}', '0', 'infinite', 1],
    ['\\frac{3x^2+x}{2x^2-1}', '\\infty', 'finite', 1.5],
    ['\\frac{x}{x^2+1}', '-\\infty', 'finite', 0],
    ['\\frac{\\ln(1+x)}{x}', '0', 'finite', 1],
    ['(1+x)^{1/x}', '0', 'finite', Math.E],
    ['\\frac{\\ln x}{x}', '\\infty', 'finite', 0],
    ['\\frac{e^x}{x^2}', '\\infty', 'infinite', 1],
    ['x\\sin(1/x)', '0', 'finite', 0],
    ['\\frac{\\sqrt{1+x}-1}{x}', '0', 'finite', .5],
    ['\\frac{|x|}{x}', '0', 'dne'],
    ['\\sin(1/x)', '0', 'dne'],
    ['\\lfloor x\\rfloor', '0', 'dne'],
    ['\\frac{x^3-8}{x-2}', '2', 'finite', 12],
];
function checkMath(result) {
    for (const step of [...result.steps, ...(result.sides || []).flatMap(s => s.steps)]) {
        if (step.math) { katex.renderToString(step.math, { throwOnError: true, strict: 'ignore', trust: false }); }
    }
    if (result.latex) { katex.renderToString(result.latex, { throwOnError: true, trust: false }); }
}
for (const [expression, point, kind, expected] of cases) {
    const result = solve(expression, point); assert.equal(result.kind, kind, expression + ': ' + result.reason);
    if (kind === 'finite') { assert.ok(Math.abs(ce.box(result.value).N().re - expected) < 1e-10, expression); }
    if (kind === 'infinite') { assert.equal(result.sign, expected, expression); }
    checkMath(result);
}
assert.equal(solve('1/x', '0', 'left').sign, -1);
assert.equal(solve('1/x', '0', 'right').sign, 1);
assert.equal(solve('\\ln x', '0', 'left').kind, 'domain');
assert.equal(solve('\\ln x', '0', 'right').sign, -1);
assert.equal(solve('\\log_{0.5}(x)', '0', 'right').sign, 1);
assert.equal(solve('\\sqrt{x}', '0', 'right').value, 0);
assert.equal(solve('\\sqrt{x}', '0', 'left').kind, 'domain');
assert.ok(!['finite', 'infinite'].includes(solve('x\\sin(1/(x-x))', '0').kind), 'empty domain cannot be squeezed to a false zero');
assert.throws(() => solve('y+1', '0'));
assert.throws(() => solve('x'.repeat(1201), '0'));
assert.throws(() => solve('x', 'x'));
assert.throws(() => solve('x', '0', 'bad'));
console.log('Limits: exact finite/infinite values, side disagreement, domains, oscillation, logarithm bases and rendered explanation steps passed.');

const courseCases = JSON.parse(fs.readFileSync('tests/fixtures/limits-course.json', 'utf8'));
const notes = fs.readFileSync('content/Матанализ.md', 'utf8');
for (const item of courseCases) {
    const result = solve(item.expression, item.point, 'both', { variable: item.variable });
    const kind = item.expected === 'dne' ? 'dne' : item.expected === '+inf' ? 'infinite' : 'finite';
    assert.equal(result.kind, kind, item.id + ': ' + result.reason);
    if (kind === 'finite') {
        const expected = ce.parse(item.expected).N().re; const actual = ce.box(result.value).N().re;
        assert.ok(Math.abs(actual - expected) < 1e-9 * Math.max(1, Math.abs(expected)), item.id);
    }
    if (kind === 'infinite') { assert.equal(result.sign, 1, item.id); }
    checkMath(result);
    const text = JSON.stringify(result);
    assert.doesNotMatch(text, /Лопитал|Тейлор|Маклорен|производн|аналитичн/i, item.id);
    for (const step of result.sides.flatMap((s) => s.steps)) {
        assert.ok(result.sources[step.source], item.id + ': missing lesson source');
        assert.ok(notes.includes('### ' + result.sources[step.source][0]), item.id + ': unknown lesson');
    }
}
// New coefficients and compositions must work without a lookup table.
for (const [a, b] of [[7, 11], [13, 3], [-4, 9], [2, -5]]) {
    const trig = solve(`\\sin(${a}x)/(${b}x)`, '0');
    assert.equal(trig.kind, 'finite'); assert.ok(Math.abs(ce.box(trig.value).N().re - a / b) < 1e-12);
    const root = solve(`\\sqrt{x^2+${Math.abs(a)}x}-x`, '\\infty');
    assert.equal(root.kind, 'finite'); assert.ok(Math.abs(ce.box(root.value).N().re - Math.abs(a) / 2) < 1e-12);
    const power = solve(`(1+${a}x^2)^{${b}/x^2}`, '0');
    assert.equal(power.kind, 'finite'); assert.ok(Math.abs(ce.box(power.value).N().re / Math.exp(a * b) - 1) < 1e-10);
}
const parameter = solve('(\\ln(a+x)-\\ln(a))/x', '0', 'both', { parameters: { a: 7 } });
assert.equal(parameter.kind, 'finite'); assert.ok(Math.abs(ce.box(parameter.value).N().re - 1 / 7) < 1e-12);
assert.equal(solve('(\\sin(x)-x)/x^3', '0').kind, 'unknown', 'unproven higher-order cancellation must stay unknown');
assert.throws(() => solve('\\sinh(x)/x', '0'));
assert.throws(() => solve('x', '2', 'both', { variable: 'n' }));
assert.doesNotMatch(fs.readFileSync('assets/limits-engine.js', 'utf8'), /\['D',|derivative|Taylor|LHopital/);
console.log(`Course limits: ${courseCases.length} curriculum cases, changed coefficients, source links and no unstudied methods passed.`);

for (const expression of ['(\\sin x-x)/x', '(e^x-1-x)/x', '(\\ln(1+x)-x)/x']) {
    const result = solve(expression, '0'); assert.equal(result.kind, 'finite', expression);
    assert.equal(ce.box(result.value).N().re, 0, expression); checkMath(result);
}
assert.equal(solve('\\sqrt[3]{x}', '0', 'left').value, 0);
assert.equal(solve('x^{2/3}', '-8').value, 4);

assert.ok(!['finite', 'infinite'].includes(solve('\\sin(x-x)/(x-x)', '0').kind));

const cubeRoot = solve('\\sqrt[3]{x}', '0', 'right');
assert.doesNotMatch(JSON.stringify(cubeRoot), /0\.333333/);
checkMath(cubeRoot);

assert.equal(solve('\\arccos(x)', '1', 'right').kind, 'domain');
assert.equal(solve('\\arccos(x)', '1', 'left').kind, 'finite');
assert.equal(solve('\\arcsin(x)', '-1', 'left').kind, 'domain');
assert.equal(solve('(-x-\\ln(x))^2/e^x', '\\infty').value, 0);
