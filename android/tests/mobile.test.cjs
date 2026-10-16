const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '../..');
const state = new Map();
let subgroup = 1;
function page(route) {
    const file = path.join(root, 'dist', route.replace(/^\//, ''), 'index.html');
    const dom = new JSDOM(fs.readFileSync(file, 'utf8'), { url: 'https://study.local' + route, runScripts: 'outside-only' });
    const window = dom.window;
    window.matchMedia = () => ({ matches: false, addEventListener() {} });
    window.scrollTo = () => {};
    window.confirm = () => true;
    window.StudyNative = {
        get(key) { return state.get(key) || ''; },
        put(key, value) { state.set(key, value); },
        subgroup(value) { if (value) { subgroup = value; } return subgroup; },
        sync() {}, applyUpdate() {}, printPage() {},
        theme(value) { state.set('native-theme', value); },
        installAppUpdate() { state.set('install-requested', true); },
    };
    window.TextEncoder = TextEncoder;
    window.TextDecoder = TextDecoder;
    window.structuredClone = structuredClone;
    const RealDate = window.Date;
    window.Date = class extends RealDate {
        constructor(...args) { super(...(args.length ? args : ['2026-10-14T06:00:00Z'])); }
        static now() { return new RealDate('2026-10-14T06:00:00Z').getTime(); }
    };
    window.fetch = async (url) => ({ ok: true, json: async () => {
        const data = JSON.parse(fs.readFileSync(path.join(root, 'android/generated/assets/site/assets/app-data.json')));
        return url.includes('campus-map/schedule.json') ? data.schedule : data;
    } });
    for (const file of ['assets/preferences.js', 'assets/schedule-overrides.js', 'assets/schedule.js', 'assets/schedule-admin.js', 'android/web/mobile.js']) {
        window.eval(fs.readFileSync(path.join(root, file), 'utf8'));
    }
    return dom;
}
(async () => {
    const reading = page('/notes/informatics/');
    const window = reading.window;
    const buttons = window.document.querySelectorAll('.app-bookmark');
    assert.ok(buttons.length >= 3, 'Every topic receives a bookmark control');
    buttons[0].click();
    assert.equal(JSON.parse(state.get('mobile-bookmarks')).length, 1);
    assert.equal(buttons[0].textContent, 'Убрать закладку');
    buttons[0].click();
    assert.equal(JSON.parse(state.get('mobile-bookmarks')).length, 0);
    buttons[0].click();
    buttons[1].click();
    const section = window.document.querySelector('section.topic');
    section.getBoundingClientRect = () => ({ top: 90, bottom: 900 });
    window.dispatchEvent(new window.Event('pagehide'));
    assert.equal(JSON.parse(state.get('mobile-last')).path, '/notes/informatics/');
    reading.window.close();
    const home = page('/disciplines/');
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(home.window.document.querySelectorAll('.app-nav a').length, 6);
    assert.equal(home.window.document.getElementById('schedule-academic-group'), null);
    const cards = home.window.document.querySelectorAll('.app-card');
    assert.equal(cards.length, 2);
    assert.match(cards[1].href, /\/notes\/informatics\/#/);
    assert.ok(cards[0].querySelector('strong').textContent.length > 0);
    assert.ok(cards[0].querySelector('img'), 'Classroom card includes a map preview');
    const saved = page('/bookmarks/');
    assert.equal(saved.window.document.querySelectorAll('.app-bookmarks-list li').length, 2);
    saved.window.document.querySelector('.app-bookmarks-list input').checked = true;
    saved.window.document.querySelector('.app-bookmark-tools button').click();
    assert.equal(JSON.parse(state.get('mobile-bookmarks')).length, 1);
    saved.window.document.querySelectorAll('.app-bookmark-tools button')[1].click();
    assert.equal(JSON.parse(state.get('mobile-bookmarks')).length, 0);
    saved.window.close();
    const settings = page('/settings/');
    const selects = settings.window.document.querySelectorAll('.app-panel select');
    selects[0].value = 'dark';
    selects[0].dispatchEvent(new settings.window.Event('change'));
    assert.equal(settings.window.document.documentElement.dataset.theme, 'dark');
    await new Promise((resolve) => setTimeout(resolve, 0));
    home.window.StudyPreferences.set('theme', 'dark');
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.match(cards[0].querySelector('img').src, /-dark\.png$/);
    selects[0].value = 'light';
    selects[0].dispatchEvent(new settings.window.Event('change'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    home.window.StudyPreferences.set('theme', 'light');
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.ok(!cards[0].querySelector('img').src.endsWith('-dark.png'));
    selects[0].value = 'dark';
    selects[0].dispatchEvent(new settings.window.Event('change'));
    selects[3].value = '2';
    selects[3].dispatchEvent(new settings.window.Event('change'));
    assert.equal(subgroup, 2);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(state.get('native-theme'), true);
    const admin = [...settings.window.document.querySelectorAll('.app-panel button')]
        .find((button) => button.textContent === 'Ввести код администратора');
    assert.equal(admin.disabled, false);
    admin.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const adminCode = settings.window.document.querySelector('.schedule-admin-content input');
    adminCode.value = 'CSU2410';
    settings.window.document.querySelector('.schedule-admin-content button').click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.ok(settings.window.document.querySelector('.schedule-admin-content form'));
    assert.equal(settings.window.localStorage.getItem('study-admin-unlocked'), 'true');
    settings.window.dispatchEvent(new settings.window.CustomEvent('native-status', {
        detail: { status: 'Offline', appStatus: 'Ready', appReady: true, checked: 1 },
    }));
    const install = settings.window.document.getElementById('app-install-update');
    assert.equal(install.hidden, false);
    assert.equal(state.get('install-requested'), undefined);
    install.click();
    assert.equal(state.get('install-requested'), true);
    settings.window.close();
    home.window.close();
    console.log('Mobile UI: bookmarks, bulk removal, reading resume, next lesson, map preview, navigation and settings passed.');
})();
