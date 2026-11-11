import fs from 'node:fs';
import path from 'node:path';

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character]);
}

export function buildExams({ root, output, writePage, renderMarkdown, searchIndex, plain, anchor }) {
    const catalog = JSON.parse(fs.readFileSync(path.join(root, 'content/exams.json'), 'utf8'));
    if (catalog.schema !== 1 || !Array.isArray(catalog.entries)) {
        throw new Error('Invalid exam catalog');
    }
    const ids = new Set();
    const cards = [];
    const routes = [];
    for (const entry of catalog.entries) {
        if (!/^[a-z0-9-]+$/.test(entry.id) || ids.has(entry.id)
            || !['credit', 'exam'].includes(entry.kind) || !entry.subject || !entry.title
            || entry.content !== 'exams/' + entry.id + '.md') {
            throw new Error('Invalid exam entry');
        }
        ids.add(entry.id);
        const kind = entry.kind === 'credit' ? 'зачёт' : 'экзамен';
        const heading = entry.subject + ' (' + kind + ')';
        let date = 'не указана';
        if (entry.date !== null) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date)
                || new Date(entry.date).toISOString().slice(0, 10) !== entry.date) {
                throw new Error('Invalid exam date');
            }
            date = new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC' }).format(new Date(entry.date));
        }
        const markdown = fs.readFileSync(path.join(root, 'content', entry.content), 'utf8');
        const numbers = [...markdown.matchAll(/^### №(\d+)\./gm)].map((match) => Number(match[1]));
        if (JSON.stringify(numbers) !== JSON.stringify(entry.questions.map((question) => question.number))) {
            throw new Error('Exam answers do not match the question catalog');
        }
        const rendered = renderMarkdown(markdown);
        const prefix = entry.id + '-';
        const html = rendered.html.replace(/id="([^"]+)"/g, (_, id) => 'id="' + prefix + id + '"')
            .replace(/href="#([^"]+)"/g, (_, id) => 'href="#' + prefix + id + '"');
        const headings = rendered.headings.map((item) => ({ ...item, id: prefix + item.id }));
        const portableMarkdown = markdown.replace(/\]\(\//g, '](https://graymans1on.github.io/university-notes/');
        const download = '/downloads/exams/' + entry.id + '.md';
        const folder = path.join(output, 'downloads/exams');
        fs.mkdirSync(folder, { recursive: true });
        fs.writeFileSync(path.join(folder, entry.id + '.md'), '# ' + heading + '\n\n'
            + entry.title + '\n\nДата: ' + date + '\n\n' + portableMarkdown);
        let expandedLink = '';
        if (entry.expandedContent) {
            if (entry.expandedContent !== 'exams/' + entry.id + '-expanded.md') {
                throw new Error('Invalid expanded exam content path');
            }
            const expanded = fs.readFileSync(path.join(root, 'content', entry.expandedContent), 'utf8');
            fs.writeFileSync(path.join(folder, entry.id + '-expanded.md'), expanded.replace(/\]\(\//g,
                '](https://graymans1on.github.io/university-notes/'));
            expandedLink = `<a class="exam-expanded" href="/downloads/exams/${entry.id}-expanded.md" download>`
                + 'Подробные ответы (Markdown)</a>';
        }
        const toc = headings.filter((item) => item.depth === 3).map((item) =>
            `<a href="#${encodeURIComponent(item.id)}">${escapeHtml(item.title)}</a>`).join('');
        const route = 'exams/' + entry.id;
        const url = '/' + route + '/';
        routes.push(route);
        const dateHtml = entry.date === null ? 'не указана'
            : `<time datetime="${entry.date}">${date}</time>`;
        cards.push(`<a class="exam-card" id="${entry.id}" href="${url}">`
            + `<strong>${escapeHtml(entry.title)}</strong><span>${escapeHtml(heading)}</span>`
            + `<span>Дата: ${dateHtml}</span></a>`);
        writePage(route, entry.title + ' · ' + heading, 'Вопросы и ответы для подготовки.',
            '<link rel="stylesheet" href="/assets/exams.css"><div class="reading-column exams-page">'
            + '<a class="exam-back" href="/exams/">К списку зачётов и экзаменов</a>'
            + `<article class="note exam-entry" id="${entry.id}"><header><h1>${escapeHtml(entry.title)}</h1>`
            + `<p>${escapeHtml(heading)}</p><p class="exam-date">Дата: ${dateHtml}</p>`
            + `<div class="exam-actions"><a class="exam-download" href="${download}" download>Ответы (Markdown)</a>`
            + expandedLink
            + '<button class="print-button" type="button">Печать / PDF</button></div></header>'
            + `<nav class="exam-contents" aria-label="Вопросы: ${escapeHtml(heading)}">${toc}</nav>`
            + `<div class="exam-answers">${html}</div></article></div>`, 'exams');
        for (const section of markdown.split(/(?=^### №\d+\.)/m).filter((block) => block.startsWith("### №"))) {
            const title = section.match(/^### (.+)/)[1];
            searchIndex.push({ subject: heading, slug: 'exams', title, text: plain(section), symbols: section,
                url: url + '#' + encodeURIComponent(prefix + anchor(title)) });
        }
    }
    writePage('exams', 'Зачёты и экзамены', 'Даты и подробные материалы для подготовки.',
        '<link rel="stylesheet" href="/assets/exams.css"><div class="reading-column exams-page">'
        + '<div class="library-header"><h1>Зачёты и экзамены</h1></div>'
        + `<nav class="exam-list" aria-label="Зачёты и экзамены">${cards.join('')}</nav>`
        + '</div>', 'exams');
    return routes;
}
