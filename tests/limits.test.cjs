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
assert.throws(() => solve('y+1', '0'));
assert.throws(() => solve('x'.repeat(1201), '0'));
assert.throws(() => solve('x', 'x'));
assert.throws(() => solve('x', '0', 'bad'));
console.log('Limits: exact finite/infinite values, side disagreement, domains, oscillation, logarithm bases and rendered explanation steps passed.');
