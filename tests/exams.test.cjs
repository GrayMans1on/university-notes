const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');

const catalog = JSON.parse(fs.readFileSync('content/exams.json', 'utf8'));
const entry = catalog.entries[0];
const expected = [...Array.from({ length: 18 }, (_, index) => index + 1)];
assert.deepEqual(entry.questions.map((question) => question.number), expected);
assert.ok(entry.questions.every((question) => question.status === 'studied'));
assert.equal(entry.date, '2026-11-12');
const catalogDocument = new JSDOM(fs.readFileSync('dist/exams/index.html', 'utf8')).window.document;
const card = catalogDocument.querySelector('.exam-card');
const route = '/exams/' + entry.id + '/';
assert.equal(card.getAttribute('href'), route);
assert.equal(card.querySelector('strong').textContent, entry.title);
assert.ok(card.textContent.includes(entry.subject));
assert.equal(card.querySelector('time').dateTime, entry.date);
assert.equal(catalogDocument.querySelector('.exam-answers'), null);
const document = new JSDOM(fs.readFileSync('dist' + route + 'index.html', 'utf8')).window.document;
assert.equal(document.querySelector('.exam-entry h1').textContent, entry.title);
assert.equal(document.querySelector('.exam-back').getAttribute('href'), '/exams/');
assert.ok(!document.querySelector('.exam-entry').textContent.includes('частично:'));
assert.equal(document.querySelector('.exam-date').textContent, 'Дата: 12.11.2026');
assert.equal(document.querySelectorAll('.exam-answers h3').length, 18);
const ids = [...document.querySelectorAll('[id]')].map((node) => node.id);
assert.equal(new Set(ids).size, ids.length, 'Heading IDs must be unique');
for (const link of document.querySelectorAll('.exam-contents a')) {
    assert.ok(document.getElementById(decodeURIComponent(link.hash.slice(1))), link.hash);
}
const download = fs.readFileSync('dist' + document.querySelector('.exam-download').getAttribute('href'), 'utf8');
assert.ok(download.startsWith('# Матанализ (зачёт)'));
assert.ok(download.includes('Дата: 12.11.2026'));
assert.equal((download.match(/^### №/gm) || []).length, 18);
assert.ok(!download.includes('](/'), 'Downloaded references must work outside the site');
const images = [...document.querySelectorAll('.exam-answers img')];
assert.equal(images.length, 3);
for (const image of images) {
    assert.ok(fs.existsSync('dist' + image.getAttribute('src')));
    assert.ok(download.includes('https://graymans1on.github.io/university-notes' + image.getAttribute('src')));
}
assert.equal(document.querySelector('#search-scope option[value="exams"]').textContent, 'Этот раздел');
const search = JSON.parse(fs.readFileSync('dist/assets/search-index.json', 'utf8'));
const questions = search.filter((item) => item.slug === 'exams');
assert.equal(questions.length, 18);
for (const item of questions) {
    assert.ok(item.url.startsWith(route + '#'), item.url);
    assert.ok(document.getElementById(decodeURIComponent(item.url.split('#')[1])), item.url);
}
assert.ok(fs.readFileSync('dist/tools/index.html', 'utf8').includes('href="/exams/"'));
assert.ok(fs.readFileSync('android/web/mobile.js', 'utf8').includes("'/exams/'"));
console.log('Exam coverage, source anchors, search and downloadable answers passed.');
