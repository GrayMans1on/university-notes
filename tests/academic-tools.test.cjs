const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const katex = require('katex');
const context = { window: { ComputeEngine: require('@cortex-js/compute-engine') } };
vm.createContext(context);
for (const file of ['tool-core', 'flow-runtime', 'flow-export', 'linear-engine', 'derivatives-engine', 'radix-engine', 'math-runtime']) {
    vm.runInContext(fs.readFileSync('assets/' + file + '.js', 'utf8'), context);
}
const { StudyLinear: L, StudyDerivatives: D, StudyRadix: R, StudyFlowExport: E } = context.window;
const render = (tex) => katex.renderToString(tex, { throwOnError: true, strict: 'ignore' });
const checkSteps = (result) => { for (const step of result.steps) { if (step.math) { render(step.math); } if (step.operation) { render(step.operation); } } };
for (const [matrix, answer] of [['1 2\n3 4', '-2'], ['0 2\n3 4', '-6'], ['1 2\n2 4', '0'], ['3', '3'], ['1/2 1/3\n2/3 3/4', '11/72'], ['1 -1 1 -2\n1 3 -1 3\n-1 -1 4 3\n-3 0 -8 -13', '-153']]) {
    const result = L.solve(matrix, 'determinant'); assert.equal(result.value, answer); checkSteps(result);
}
const inverse = L.solve('3 -4 5\n2 -3 1\n3 -5 -1', 'inverse');
assert.equal(JSON.stringify(inverse.matrix), JSON.stringify([['-8', '29', '-11'], ['-5', '18', '-7'], ['1', '-3', '1']])); checkSteps(inverse);
assert.equal(L.solve('1 2\n2 4', 'inverse').kind, 'singular');
checkSteps(L.solve('2 1\n1 1', 'inverse', '2 1'));
const system = L.solve('12 9 3 10 13\n4 3 1 2 3\n8 6 2 5 7', 'system', '3 4 1 2');
assert.equal(system.kind, 'infinite'); assert.equal(system.free.join(','), '1,2'); assert.equal(system.particular.join(','), '0,0,1,1');
assert.equal(JSON.stringify(system.basis), JSON.stringify([['1', '0', '-4', '0'], ['0', '1', '-3', '0']])); checkSteps(system);
assert.equal(L.solve('1 1 1\n2 2 3').kind, 'inconsistent');
assert.equal(L.solve('2 1 5\n1 -1 1').particular.join(','), '2,1');
assert.equal(L.solve('0 0 0').kind, 'infinite');
assert.throws(() => L.solve('1 2\n3', 'inverse')); assert.throws(() => L.solve('1/0', 'determinant'));
assert.throws(() => L.solve('1 2 3', 'system', '1 1'));
const ce = new context.window.ComputeEngine.ComputeEngine();
const derivativeCases = [
    ['x^3+2x', (x) => 3 * x * x + 2], ['x^2\\sin x', (x) => 2 * x * Math.sin(x) + x * x * Math.cos(x)],
    ['\\sin(x^2)', (x) => 2 * x * Math.cos(x * x)], ['\\ln(1+x^2)', (x) => 2 * x / (1 + x * x)],
    ['(2x+1)/(3x+4)', (x) => 5 / (3 * x + 4) ** 2], ['\\sqrt{x}', (x) => 1 / (2 * Math.sqrt(x))],
    ['x^{5/3}', (x) => 5 / 3 * x ** (2 / 3)], ['\\log_2 x', (x) => 1 / (x * Math.log(2))],
    ['e^{3x}', (x) => 3 * Math.exp(3 * x)], ['\\arctan(x)', (x) => 1 / (1 + x * x)],
    ['\\arcsin(x/4)', (x) => .25 / Math.sqrt(1 - (x / 4) ** 2)],
    ['\\sinh(x)', (x) => Math.cosh(x)], ['\\tanh(x)', (x) => 1 / Math.cosh(x) ** 2],
    ['\\log_x(2^x)', (x) => Math.log(2) * (Math.log(x) - 1) / Math.log(x) ** 2],
];
for (const [formula, expected] of derivativeCases) {
    const result = D.solve(formula); render(result.chain); checkSteps(result);
    const fn = context.window.StudyMath.compile(result.ast);
    for (const x of [.3, .7, 1.3, 2]) {
        assert.ok(Math.abs(fn({ x }) - expected(x)) < 1e-9 * Math.max(1, Math.abs(expected(x))), formula + ' at ' + x);
    }
}
for (const [formula, expected] of [
    ['\\operatorname{sh}(x)', (x) => Math.cosh(x)],
    ['\\sqrt[3]{x}', (x) => 1 / (3 * Math.cbrt(x * x))],
    ['\\sqrt[3]{(1-x^3)/(1+x^3)}', (x) => -2 * x * x / ((1 + x ** 3) ** 2 * Math.cbrt(((1 - x ** 3) / (1 + x ** 3)) ** 2))],
]) {
    const result = D.solve(formula); checkSteps(result); const fn = context.window.StudyMath.compile(result.ast);
    for (const x of [-8, -2, .3, 2, 8]) {
        assert.ok(Math.abs(fn({ x }) - expected(x)) < 1e-8 * Math.max(1, Math.abs(expected(x))), formula + ' negative-root domain at ' + x);
    }
}
assert.ok(D.solve('\\ln|x|').conditions.some((c) => c.includes('ne0')));
assert.throws(() => D.solve('\\lfloor x\\rfloor'));
assert.throws(() => D.solve('1/(x-x)'));
for (const [a, b, op, base, expected] of [['111', '1', '+', 2, '1000'], ['1000', '1', '-', 2, '111'], ['A', 'F', '+', 16, '19'], ['F', 'F', '*', 16, 'E1'], ['1011', '11', '*', 2, '100001'], ['100001', '11', '/', 2, '1011'], ['1', '11', '/', 2, '0.(01)'], ['1.1', '0.1', '+', 2, '10'], ['A.8', '2', '/', 16, '5.4'], ['-7', '3', '-', 10, '-10'], ['-7', '-3', '*', 10, '21']]) {
    assert.equal(R.calculate(a, b, op, base).result, expected, [a, op, b, base].join(' '));
}
// Independently compare all bases to BigInt; the column calculator itself uses digit arrays only.
for (let base = 2; base <= 36; base += 1) {
    for (const [a, b] of [[0n, 1n], [127n, 13n], [987654321123456789n, 98761n], [-43n, 57n]]) {
        for (const op of ['+', '-', '*']) {
            const expected = op === '+' ? a + b : op === '-' ? a - b : a * b;
            assert.equal(R.calculate(a.toString(base), b.toString(base), op, base).result, expected.toString(base).toUpperCase());
        }
    }
}
assert.equal(R.convert('110011100110', 2, 16).result, 'CE6');
assert.equal(R.convert('0.1', 10, 2).result, '0.0(0011)');
assert.equal(R.convert('FF.A', 16, 2).result, '11111111.101');
assert.throws(() => R.calculate('12', '1', '+', 2)); assert.throws(() => R.calculate('1', '0', '/', 2));
assert.equal(R.calculate('1', '111', '/', 2, 2).approximate, true);
const doc = { format: 'csu-flowchart', version: 1, title: 'Loop', nodes: [
    { id: 'start', type: 'start', x: 0, y: 0, text: 'Start' },
    { id: 'input', type: 'input', x: 0, y: 50, text: 'n', config: { variable: 'n' } },
    { id: 'init', type: 'process', x: 0, y: 100, text: 'init', config: { program: 'a = 1\ni = 1' } },
    { id: 'condition', type: 'decision', x: 0, y: 150, text: 'loop', config: { left: 'i', operator: '<=', right: 'n' } },
    { id: 'action', type: 'process', x: 0, y: 200, text: 'action', config: { program: 'a *= i\ni += 1' } },
    { id: 'out', type: 'output', x: 0, y: 250, text: 'out', config: { expression: 'a + (-7 % 3) + 2^3^2' } },
    { id: 'end', type: 'end', x: 0, y: 300, text: 'End' },
], edges: [ ['start', 'input'], ['input', 'init'], ['init', 'condition'], ['condition', 'action', 'Да'], ['condition', 'out', 'Нет'], ['action', 'condition'], ['out', 'end'] ].map(([from, to, label = '']) => ({ from, to, label })) };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'csu-code-'));
try {
    fs.writeFileSync(path.join(tmp, 'flow.py'), E.code(doc, 'python'));
    const run = spawnSync('python3', [path.join(tmp, 'flow.py')], { input: '5\n', encoding: 'utf8', timeout: 5000 });
    assert.equal(run.status, 0, run.stderr); assert.equal(Number(run.stdout.match(/[-\d.]+$/m)?.[0]), 634);
    const source = E.code(doc, 'csharp'); assert.match(source, /Math\.Pow/); assert.doesNotMatch(source, /eval|dynamic|Process\.Start/);
    fs.writeFileSync(path.join(tmp, 'Program.cs'), source);
    fs.writeFileSync(path.join(tmp, 'test.csproj'), '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>');
    if (spawnSync('dotnet', ['--version'], { encoding: 'utf8' }).status === 0) {
        const cs = spawnSync('dotnet', ['run', '--project', path.join(tmp, 'test.csproj'), '--verbosity', 'quiet'], { input: '5\n', encoding: 'utf8', timeout: 120000 });
        assert.equal(cs.status, 0, cs.stderr + cs.stdout); assert.match(cs.stdout, /634/);
        console.log('C# export: compiled and executed under .NET 8.');
    } else { assert.ok(!process.env.GITHUB_ACTIONS, 'CI requires a C# compiler'); console.log('C# compiler unavailable locally; CI must run this test with .NET 8.'); }
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
console.log('Academic tools: exact determinants/inverses/systems, course derivatives, digit arithmetic in bases 2–36, Python export and C# source passed.');
