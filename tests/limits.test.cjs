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
    for (const entry of result.chain || []) {
        katex.renderToString(entry.math, { throwOnError: true, strict: 'ignore', trust: false });
        if (entry.annotation) { katex.renderToString('\\left[' + entry.annotation + '\\right]', { throwOnError: true }); }
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

// Strategy selection must keep ordinary substitution and standard ratios short.
for (const [expression, point] of [
    ['\\sin(x)+\\ln(x)+\\sqrt{x}', '1'],
    ['(x^2+1)/(x+3)', '2'],
    ['\\arctan(x)+e^x', '0'],
    ['x^{2/3}', '-8'],
]) {
    const result = solve(expression, point);
    assert.equal(result.kind, 'finite');
    for (const side of result.sides) {
        assert.match(side.steps[0].text, /Прямая подстановка допустима/);
        assert.equal(side.steps.length, 2, expression);
    }
    checkMath(result);
}
for (const [expression, expected] of [
    ['\\sin(7x)/(3x)', 7 / 3], ['\\tan(4x)/x', 4],
    ['(e^{5x}-1)/x', 5], ['\\ln(1+3x)/x', 3],
    ['(1-\\cos(2x))/x^2', 2], ['(\\sqrt{1+6x}-1)/x', 3],
    ['\\sin(x-1)/(x-1)', 1],
    ['\\sin(x)/x+\\ln(1+x)/x', 2],
]) {
    const point = expression.includes('x-1') ? '1' : '0';
    const result = solve(expression, point);
    assert.equal(result.kind, 'finite', expression);
    assert.ok(Math.abs(ce.box(result.value).N().re - expected) < 1e-12, expression);
    assert.doesNotMatch(JSON.stringify(result.sides), /Переносим предельную|Вводим положительное|t\\\\to/);
    checkMath(result);
}
for (const point of ['inf', 'infinity', '+inf', '+infinity', '∞']) {
    assert.equal(solve('1/x', point).value, 0, point);
}
assert.equal(solve('x', '-infinity').sign, -1);
// A finite value at a boundary or at a discontinuity is not a continuity proof.
assert.equal(solve('\\sqrt{x}', '0', 'left').kind, 'domain');
assert.equal(solve('\\arcsin(x)', '1', 'right').kind, 'domain');
assert.equal(solve('\\lfloor x\\rfloor', '0').kind, 'dne');
assert.ok(!['finite', 'infinite'].includes(solve('(x-x)/(x-x)', '0').kind));
console.log('Limit strategy: guarded direct substitution, original-variable standard ratios, compositions and infinity aliases passed.');

assert.ok(!['finite', 'infinite'].includes(solve('(-1)^x', '1').kind));


const reciprocalChain = solve('1/x', 'inf');
assert.equal(reciprocalChain.chain.length, 2);
assert.match(reciprocalChain.chain[0].annotation, /infty/);
assert.doesNotMatch(JSON.stringify(reciprocalChain.sides), /Делим числитель/);
for (const expression of ['\\sin(7x)/(3x)', '(x^2-1)/(x-1)', '(e^{x^2}-\\cos x)/x^2', '(1+2x)^{3/x}']) {
    const result = solve(expression, expression === '(x^2-1)/(x-1)' ? '1' : '0');
    assert.equal(result.chainComplete, true);
    assert.match(result.chain[0].annotation, /frac00|1\^/);
    assert.doesNotMatch(JSON.stringify(result.chain), /\\bt\\b|\\bu\\b|\\bv\\b|K_\d/);
    checkMath(result);
}
console.log('Limit chains: connected original-variable equalities, bracket hints, concise reciprocal and rendered formulas passed.');


// Whole-expression identity stages are checked against an independent numeric evaluator.
vm.runInContext(fs.readFileSync('assets/math-runtime.js', 'utf8'), context);
for (const [formula, point, samples] of [
    ['\\sin(7x)/(3x)', '0', [-.2, -.01, .01, .2]],
    ['(x^2-1)/(x-1)', '1', [.8, .99, 1.01, 1.2]],
    ['(e^{x^2}-\\cos x)/x^2', '0', [-.2, -.01, .01, .2]],
    ['(1+2x)^{3/x}', '0', [-.1, -.01, .01, .1]],
    ['\\sqrt{x^2+1}-x', '\\infty', [10, 100]],
    ['(\\sqrt[5]{4x^{10}+3}-2\\sqrt{7x^5+6})/(3\\sqrt[5]{2x^{10}-1}+\\sqrt{5x^5+8})', '\\infty', [10, 100]],
]) {
    const result = solve(formula, point); const stage = result.sides.at(-1).chainExpressions[0];
    const input = context.window.StudyMath.compile(formula); const rewritten = context.window.StudyMath.compile(stage.math);
    for (const x of samples) {
        const a = input({ x }); const b = rewritten({ x });
        assert.ok(Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(a)), formula + ' identity at ' + x);
    }
}

assert.equal(solve('\\sin(x)/x', '0').chain.length, 2);
assert.doesNotMatch(JSON.stringify(solve('\\sin(x)/x', '0').chain), /x\^0/);


// Variant 33 from the supplied typical calculation and the owner's worked pages.
for (const [formula, point, variable, expected] of [
    ['((3n-2)^3-(n+4)^3)/((2n+1)^3-(n-1)^3)', 'inf', 'n', 26 / 7],
    ['(\\sqrt[5]{4n^{10}+3}-2\\sqrt{7n^5+6})/(3\\sqrt[5]{2n^{10}-1}+\\sqrt{5n^5+8})', 'inf', 'n', -2 * Math.sqrt(35) / 5],
    ['n(\\sqrt{n^4+2n^3+3n^2+5n+1}-\\sqrt{n^4+2n^3+3n^2+n+4})', 'inf', 'n', 2],
    ['((3n^2-2n+5)/(3n^2+4n-1))^{2n^2-n+3}', 'inf', 'n', 0],
    ['(x^4-9x^2)/(x-3)', '3', 'x', 54],
    ['(x^4-9x^2)/(x^3-27)', '3', 'x', 2],
    ['(\\sqrt{x^2+2x+4}-\\sqrt{2x^2-x})/(\\sqrt{x^2+3x+4}-\\sqrt{2x^2-x+4})', '4', 'x', 5 * Math.sqrt(14) / 14],
    ['\\arctan(4x)(1-\\cos(6x))/(x\\ln(1+3x)\\tan(2x))', '0', 'x', 12],
    ['(7^x-4^x)/(\\tan(5x)-\\sin(3x))', '0', 'x', Math.log(7 / 4) / 2],
]) {
    const result = solve(formula, point, 'both', { variable });
    assert.equal(result.kind, 'finite', formula); assert.equal(result.chainComplete, true, formula);
    assert.ok(Math.abs(ce.box(result.value).N().re - expected) < 1e-10, formula); checkMath(result);
    if (variable === 'n') { assert.doesNotMatch(JSON.stringify(result.chain), /(?<![A-Za-z\\])x(?![A-Za-z])/); }
}
const second33 = solve('((3n^2-2n+5)/(3n^2+4n-1))^{2n^2-n+3}', 'inf', 'both', { variable: 'n' });
assert.ok(second33.chain.length >= 7); assert.equal(second33.chain[0].annotation, '1^{\\infty}');
assert.ok(second33.chain.some((s) => s.math === 'e^{-\\infty}'));
assert.ok(second33.chain.some((s) => s.math.includes('e^{\\lim')));
for (const formula of ['(1-1/x)^{x^2}', '(1+1/x)^{x^2}']) {
    const result = solve(formula, 'inf'); assert.equal(result.kind, formula.includes('-1') ? 'finite' : 'infinite'); checkMath(result);
}
console.log('Reference variant 33: nine limits, detailed second remarkable limit and original sequence variable passed.');

const nonzeroConjugate = solve('\\sqrt{x}-(-\\sqrt{x})', 'inf');
assert.equal(nonzeroConjugate.kind, 'infinite'); checkMath(nonzeroConjugate);
