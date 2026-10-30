const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');

const catalog = JSON.parse(fs.readFileSync('content/exams.json', 'utf8'));
const entry = catalog.entries[0];
const expected = [...Array.from({ length: 18 }, (_, index) => index + 1), 20, 21];
assert.deepEqual(entry.questions.map((question) => question.number), expected);
assert.deepEqual(entry.questions.filter((question) => question.status === 'partial')
    .map((question) => question.number), [1, 20, 21]);
assert.equal(entry.date, null);
const document = new JSDOM(fs.readFileSync('dist/exams/index.html', 'utf8')).window.document;
assert.equal(document.querySelector('.exam-entry header h2').textContent, 'Матанализ (зачёт)');
assert.equal(document.querySelector('.exam-date').textContent, 'Дата: не указана');
assert.equal(document.querySelectorAll('.exam-answers h3').length, 20);
const ids = [...document.querySelectorAll('[id]')].map((node) => node.id);
assert.equal(new Set(ids).size, ids.length, 'Heading IDs must be unique');
for (const link of document.querySelectorAll('.exam-contents a')) {
    assert.ok(document.getElementById(decodeURIComponent(link.hash.slice(1))), link.hash);
}
const sources = new Map();
for (const link of document.querySelectorAll('.exam-answers a[href^="/notes/"]')) {
    const [route, fragment] = link.getAttribute('href').split('#');
    if (!sources.has(route)) {
        sources.set(route, new JSDOM(fs.readFileSync('dist' + route + 'index.html', 'utf8')).window.document);
    }
    const source = sources.get(route);
    assert.ok(source.getElementById(decodeURIComponent(fragment)), link.getAttribute('href'));
}
const download = fs.readFileSync('dist' + document.querySelector('.exam-download').getAttribute('href'), 'utf8');
assert.ok(download.startsWith('# Матанализ (зачёт)'));
assert.ok(download.includes('Дата: не указана'));
assert.ok(download.includes('](https://graymans1on.github.io/university-notes/notes/calculus/#'));
assert.equal((download.match(/^### №/gm) || []).length, 20);
assert.ok(!download.includes('](/'), 'Downloaded references must work outside the site');
assert.equal(document.querySelector('#search-scope option[value="exams"]').textContent, 'Этот раздел');
const search = JSON.parse(fs.readFileSync('dist/assets/search-index.json', 'utf8'));
const questions = search.filter((item) => item.slug === 'exams');
assert.equal(questions.length, 20);
for (const item of questions) {
    assert.ok(document.getElementById(decodeURIComponent(item.url.split('#')[1])), item.url);
}
assert.ok(fs.readFileSync('dist/tools/index.html', 'utf8').includes('href="/exams/"'));
assert.ok(fs.readFileSync('android/web/mobile.js', 'utf8').includes("'/exams/'"));
console.log('Exam coverage, source anchors, search and downloadable answers passed.');
