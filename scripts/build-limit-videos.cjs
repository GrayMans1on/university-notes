const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { createHash } = require('node:crypto');
const context = { window: { ComputeEngine: require('@cortex-js/compute-engine') } };
vm.createContext(context);
for (const asset of ['limits-engine', 'manim-export']) {
    vm.runInContext(fs.readFileSync('assets/' + asset + '.js', 'utf8'), context);
}
const examples = [
    ['sin', '\\frac{\\sin x}{x}', '0'],
    ['sin-scaled', '\\frac{\\sin(7x)}{3x}', '0'],
    ['cancel', '\\frac{x^2-1}{x-1}', '1'],
    ['reciprocal', '\\frac1x', '\\infty'],
    ['second', '(1+2x)^{3/x}', '0'],
    ['second-33', '((3n^2-2n+5)/(3n^2+4n-1))^{2n^2-n+3}', '\\infty', 'n'],
    ['conjugate', '\\sqrt{x^2+1}-x', '\\infty'],
];
const template = fs.readFileSync('assets/manim-scene.py', 'utf8');
const directory = '.manim-cache'; fs.mkdirSync(directory, { recursive: true });
const videos = [];
for (const [id, expression, destination, variable = 'x'] of examples) {
    const result = context.window.StudyLimits.solve(expression, destination, 'both', { variable });
    if (!result.chainComplete) { throw new Error('Video requires a complete chain: ' + id); }
    const version = createHash('sha256').update(JSON.stringify(result.chain)).update(template).digest('hex').slice(0, 12);
    const entry = { id, key: context.window.StudyManim.key(expression, destination, variable), version };
    for (const theme of ['light', 'dark']) {
        const name = id + '-' + theme + '-' + version;
        const payload = context.window.StudyManim.payload(result, theme);
        fs.writeFileSync(path.join(directory, name + '.py'), context.window.StudyManim.scene(template, payload));
        entry[theme] = '/assets/limit-videos/' + name + '.mp4';
    }
    videos.push(entry);
}
fs.writeFileSync(path.join(directory, 'catalog.json'), JSON.stringify({ schema: 1, videos }, null, 2));
console.log('Prepared ' + videos.length * 2 + ' real Manim scenes.');
