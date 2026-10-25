const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const context = { window: { ComputeEngine: require('@cortex-js/compute-engine') } };
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
console.log('Manim: canonical video matching, real Python scene syntax, exact solved-chain payloads and both theme palettes passed.');
