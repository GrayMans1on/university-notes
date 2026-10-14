const searchInput = document.querySelector('#search');
const searchPanel = document.querySelector('#search-results');
const searchList = document.querySelector('#search-list');
const searchStatus = document.querySelector('#search-status');
const menuButton = document.querySelector('.menu-button');
const backdrop = document.querySelector('.nav-backdrop');
const sidebar = document.querySelector('.sidebar');
const searchScope = document.querySelector('#search-scope');
const mobileLayout = window.matchMedia('(max-width: 900px)');
let indexPromise;
let queryNumber = 0;
let debounceTimer;

function normalize(value) {
    return value.toLocaleLowerCase('ru').replace(/ё/g, 'е');
}

function closeSearch() {
    queryNumber += 1;
    searchPanel.hidden = true;
    searchInput.setAttribute('aria-expanded', 'false');
}

function setNavigation(open) {
    document.body.classList.toggle('nav-open', open);
    backdrop.hidden = !open;
    menuButton.setAttribute('aria-expanded', String(open));
    sidebar.inert = mobileLayout.matches && !open;
    if (open) {
        document.querySelector('.sidebar a').focus();
    }
}

mobileLayout.addEventListener('change', () => setNavigation(false));
sidebar.inert = mobileLayout.matches;

function highlight(node, value, terms) {
    const normalized = normalize(value);
    const matches = [];
    for (const term of terms) {
        let offset = 0;
        while (offset < normalized.length) {
            const found = normalized.indexOf(term, offset);
            if (found < 0) {
                break;
            }
            matches.push([found, found + term.length]);
            offset = found + term.length;
        }
    }
    matches.sort((first, second) => first[0] - second[0]);
    let position = 0;
    for (const [start, end] of matches) {
        if (start < position) {
            continue;
        }
        node.append(document.createTextNode(value.slice(position, start)));
        const mark = document.createElement('mark');
        mark.textContent = value.slice(start, end);
        node.append(mark);
        position = end;
    }
    node.append(document.createTextNode(value.slice(position)));
}

function snippet(value, terms) {
    const normalized = normalize(value);
    const position = Math.max(0, ...terms.map((term) => normalized.indexOf(term)).filter((index) => index >= 0));
    const start = Math.max(0, position - 60);
    const end = Math.min(value.length, start + 210);
    return (start > 0 ? '…' : '') + value.slice(start, end) + (end < value.length ? '…' : '');
}

async function search() {
    const request = ++queryNumber;
    const query = searchInput.value.trim();
    if (query.length < 2) {
        closeSearch();
        return;
    }
    searchPanel.hidden = false;
    searchInput.setAttribute('aria-expanded', 'true');
    searchStatus.textContent = 'Поиск…';
    searchList.replaceChildren();
    try {
        if (!indexPromise) {
            indexPromise = fetch('/assets/search-index.json').then((response) => {
                if (!response.ok) {
                    throw new Error('Search index unavailable');
                }
                return response.json();
            }).catch((error) => {
                indexPromise = null;
                throw error;
            });
        }
        const records = await indexPromise;
        if (request !== queryNumber) {
            return;
        }
        const terms = normalize(query).split(/\s+/).filter(Boolean);
        const matches = records.map((record) => {
            const title = normalize(record.title);
            const combined = record.subject + ' ' + record.title + ' ' + record.text + ' ' + (record.symbols || '');
            const score = (!searchScope.value || searchScope.value === record.slug) && window.StudySearch.matches(combined, query)
                ? terms.reduce((sum, term) => sum + (title.includes(term) ? 8 : 1), 0) : 0;
            return { record, score };
        }).filter((match) => match.score > 0).sort((first, second) => second.score - first.score);
        searchStatus.textContent = matches.length === 0 ? 'Совпадений нет' : 'Найдено разделов: ' + matches.length;
        if (matches.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'search-empty';
            empty.textContent = 'По этому запросу ничего не найдено.';
            searchList.append(empty);
        }
        for (const { record } of matches) {
            const link = document.createElement('a');
            link.className = 'search-result';
            link.href = record.url;
            if (record.url.startsWith('https://')) {
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
            }
            const subject = document.createElement('span');
            subject.className = 'search-subject';
            subject.textContent = record.subject;
            const title = document.createElement('span');
            title.className = 'search-result-title';
            highlight(title, record.title, terms);
            const excerpt = document.createElement('span');
            excerpt.className = 'search-snippet';
            highlight(excerpt, snippet(record.text, terms), terms);
            link.append(subject, title, excerpt);
            link.addEventListener('click', closeSearch);
            searchList.append(link);
        }
    } catch {
        if (request === queryNumber) {
            searchStatus.textContent = 'Поиск временно недоступен';
            const message = document.createElement('p');
            message.className = 'search-empty';
            message.textContent = 'Проверь соединение и повтори запрос.';
            searchList.append(message);
        }
    }
}

searchScope.addEventListener('change', search);
searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(search, 160);
});
searchInput.addEventListener('focus', () => {
    if (searchInput.value.trim().length >= 2) {
        search();
    }
});
document.querySelector('.search-form').addEventListener('submit', (event) => {
    event.preventDefault();
    clearTimeout(debounceTimer);
    search();
});
document.querySelector('.search-close').addEventListener('click', closeSearch);
menuButton.addEventListener('click', () => setNavigation(!document.body.classList.contains('nav-open')));
backdrop.addEventListener('click', () => {
    setNavigation(false);
    menuButton.focus();
});
document.querySelectorAll('.sidebar a').forEach((link) => link.addEventListener('click', () => setNavigation(false)));
document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchInput.focus();
    }
    if (event.key === 'Escape') {
        closeSearch();
        setNavigation(false);
    }
});
document.addEventListener('click', (event) => {
    if (!searchPanel.contains(event.target) && !event.target.closest('.search-form')) {
        closeSearch();
    }
    const link = event.target.closest('a[href]');
    const href = link?.getAttribute('href');
    if (href && (href.startsWith('#') || href.startsWith(location.pathname + '#'))) {
        revealHash(href.slice(href.indexOf('#')));
    }
});

function revealHash(hash = location.hash) {
    let id;
    try {
        id = decodeURIComponent(hash.slice(1));
    } catch {
        return;
    }
    const target = document.getElementById(id);
    if (target) {
        let disclosure = target.closest('details');
        while (disclosure) {
            disclosure.open = true;
            disclosure = disclosure.parentElement?.closest('details');
        }
        target.scrollIntoView({ block: 'start' });
    }
}
window.addEventListener('hashchange', () => revealHash());
revealHash();

const tocLinks = [...document.querySelectorAll('.toc .toc-link')];
const headingNodes = [...document.querySelectorAll('.note h2[id], .note h3[id]')];
if (headingNodes.length > 0 && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting);
        if (visible.length > 0) {
            const id = visible[0].target.id;
            for (const link of tocLinks) {
                link.classList.toggle('is-active', decodeURIComponent(link.hash.slice(1)) === id);
            }
        }
    }, { rootMargin: '-100px 0px -65% 0px', threshold: 0 });
    headingNodes.forEach((heading) => observer.observe(heading));
}
