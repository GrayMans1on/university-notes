const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

(async () => {
    const html = fs.readFileSync('dist/textbooks/index.html', 'utf8');
    const dom = new JSDOM(html, { url: 'https://study.local/textbooks/', runScripts: 'outside-only' });
    const w = dom.window;
    const books = JSON.parse(w.document.getElementById('textbook-data').textContent).books;
    assert.equal(books.length, 4);
    let downloaded = null;
    let opened = null;
    let saved = false;
    w.StudyNative = {
        textbookStatus: () => JSON.stringify({ [books[0].id]: { saved } }),
        downloadTextbook: (id) => { downloaded = id; },
        openTextbook: (id) => { opened = id; }
    };
    Object.defineProperty(w.document, 'currentScript', { value: { src: 'https://study.local/assets/textbooks.js' } });
    w.eval(fs.readFileSync('assets/textbooks.js', 'utf8'));
    assert.equal(downloaded, null, 'No automatic downloads');
    assert.equal(w.document.querySelectorAll('.textbook-online').length, 4);
    for (const book of books) {
        const card = w.document.querySelector('[data-book-id="' + book.id + '"]');
        assert.ok(card.textContent.includes(book.author));
        assert.ok(card.textContent.includes(book.subject));
        assert.equal(card.querySelector('a').href, book.url);
    }
    const action = w.document.querySelector('.textbook-offline');
    assert.equal(action.textContent, 'Скачать офлайн');
    action.click();
    assert.equal(downloaded, books[0].id);
    saved = true;
    w.dispatchEvent(new w.Event('study-textbooks'));
    assert.equal(action.textContent, 'Открыть офлайн');
    action.click();
    assert.equal(opened, books[0].id);
    dom.window.close();

    const events = {};
    const scope = 'https://example.test/university-notes/';
    const pdf = scope + 'books/test.pdf';
    const worker = {
        self: { registration: { scope }, addEventListener: (name, handler) => { events[name] = handler; } },
        caches: { open: async () => ({ match: async (key) => (typeof key === 'string' ? key : key.url) === pdf ? new Response('%PDF-test') : undefined }) },
        fetch: async () => { throw new Error('Offline'); },
        URL, Response, Number
    };
    vm.runInNewContext(fs.readFileSync('textbooks-sw.js', 'utf8'), worker);
    const get = async (headers) => {
        let response;
        events.fetch({ request: new Request(pdf, { headers }), respondWith: (value) => { response = value; } });
        return response;
    };
    assert.equal(await (await get()).text(), '%PDF-test');
    const range = await get({ Range: 'bytes=0-4' });
    assert.equal(range.status, 206);
    assert.equal(range.headers.get('content-range'), 'bytes 0-4/9');
    assert.equal(await range.text(), '%PDF-');
    assert.equal(await (await get({ Range: 'bytes=-4' })).text(), 'test');
    assert.equal((await get({ Range: 'bytes=99-' })).status, 416);
    assert.equal((await get({ Range: 'bytes=2-1' })).status, 416);
    console.log('Textbooks: author/subject labels, explicit downloads, native offline opening and PDF byte ranges passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
