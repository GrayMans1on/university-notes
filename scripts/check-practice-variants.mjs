import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { expandPracticeVariants, generatePracticeTask } from './practice-variants.mjs';
const original = JSON.parse(fs.readFileSync('content/practice.json'));
const expanded = expandPracticeVariants(original);
const context = { window: {}, document: { querySelector: () => null } };
vm.runInNewContext(fs.readFileSync('assets/practice.js', 'utf8'), context);
const { numericValue, evaluateField } = context.window.StudyAnswers;
let topics = 0, tasks = 0;
for (const [key, list] of Object.entries(expanded)) {
    assert.deepEqual(list.slice(0, original[key].length), original[key]);
    assert.equal(new Set(list.map((task) => task.id)).size, list.length);
    const generated = list.filter((task) => task.generated);
    if (!generated.length) { continue; }
    topics += 1;
    assert.equal(new Set(generated.map((task) => task.variant)).size, 10);
    for (const source of original[key]) {
        const copies = generated.filter((task) => task.id.startsWith(source.id + '-variant-'));
        assert.equal(new Set(copies.map((task) => task.question)).size, copies.length, key + ': duplicate values');
    }
    for (const task of generated) {
        tasks += 1;
        assert(!task.question.includes('undefined') && !task.solution.includes('undefined'));
        for (const field of task.fields) {
            const answer = field.kind === 'text' ? field.accepted[0]
                : field.kind === 'set' ? '{' + field.expected.join(',') + '}' : field.expected;
            assert(evaluateField(field, answer).correct, task.title + ': expected answer rejected');
            if (field.kind === 'number') {
                const value = numericValue(field.expected);
                assert(!evaluateField(field, String(value + Math.max(1, Math.abs(value)) / 10)).correct);
            }
        }
    }
}
function matrices(question) {
    return [...question.matchAll(/\\begin\{pmatrix\}([\s\S]*?)\\end\{pmatrix\}/g)]
        .map((match) => match[1].split('\\\\').map((row) => row.split('&').map(Number)));
}
// Verify representative families from their conditions, independently of the generator's formulas.
for (let seed = 1; seed <= 200; seed += 1) {
    for (const [key, list] of Object.entries(original)) {
        if (!/^(Матанализ|Дискретка|Линал)\|/.test(key)) { continue; }
        for (const source of list.filter((task) => task.type === 'input')) {
            const task = generatePracticeTask(source, seed);
            if (!task) { continue; }
            const values = task.fields.map((field) => field.kind === 'number' ? numericValue(field.expected) : field.expected);
            if (source.title === 'Крамер целиком') {
                const match = task.question.match(/\$(\d+)x\+y=(-?\d+)\$, \$x-y=(-?\d+)\$/);
                const [, a, u, v] = match.map(Number);
                assert.equal(a * values[3] + values[4], u);
                assert.equal(values[3] - values[4], v);
                assert.equal(values[0], -a - 1);
                assert.equal(values[1], -u - v);
                assert.equal(values[2], a * v - u);
            }
            if (source.title === 'Сокращение размещений') {
                const parts = [...task.question.matchAll(/A_\{(\d+)\}\^\{(\d+)\}/g)]
                    .map((match) => match.slice(1).map(Number));
                const placements = (n, k) => {
                    let result = 1n;
                    for (let i = 0; i < k; i += 1) { result *= BigInt(n - i); }
                    return result;
                };
                const p = parts.map(([n, k]) => placements(n, k));
                assert.equal(BigInt(values[0]), (p[0] + p[1]) / p[2] - (p[3] + p[4]) / p[5]);
            }
            if (source.title === 'Строгое неравенство') {
                const threshold = Number(task.question.match(/<(\d+)\//)[1]);
                const roots = [];
                for (let n = 1; n <= 100; n += 1) {
                    if ((n + 4) * (n + 3) / n < threshold) { roots.push(n); }
                }
                assert.deepEqual(values[0], roots);
            }
            if (source.title === 'ε и номер' || source.title === 'Предел и оценка хвоста') {
                const a = Number(task.question.match(/(?:\+|n\+)(\d+)/)[1]);
                const denominator = Number(task.question.match(/varepsilon=1\/(\d+)/)[1]);
                const N = values[1];
                const error = (n) => source.title === 'ε и номер' ? a / n : a / (n + a);
                assert(error(N + 1) < 1 / denominator);
                assert(error(N) >= 1 / denominator);
            }
            if (source.title === 'Произведение матриц') {
                const [A, B] = matrices(task.question);
                const product = A.flatMap((row) => [0, 1].map((j) => row.reduce((sum, v, i) => sum + v * B[i][j], 0)));
                assert.deepEqual(values, product);
            }
            if (source.title === 'Обратная и проверка') {
                const [A] = matrices(task.question);
                const B = [values.slice(0, 2), values.slice(2)];
                const product = A.flatMap((row) => [0, 1].map((j) => row.reduce((sum, v, i) => sum + v * B[i][j], 0)));
                assert.deepEqual(product, [1, 0, 0, 1]);
            }
            if (source.title === 'Минор, дополнение, определитель' || source.title === 'Выбор строки') {
                const [A] = matrices(task.question);
                const determinant = A[0][0] * A[1][1] - A[0][1] * A[1][0];
                if (A.length === 2) { assert.deepEqual(values, [A[1][0], -A[1][0], determinant]); }
                else { assert.deepEqual(values, [determinant, A[2][2] * determinant]); }
            }
        }
    }
}
console.log(JSON.stringify({ topics, generatedTasks: tasks, additionalVariantsPerTopic: 10, arithmeticSeeds: 200 }));
