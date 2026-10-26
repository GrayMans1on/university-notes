import { buildToolPages, toolPages } from './tool-pages.mjs';
import { loadSchedule } from './schedule-data.mjs';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { marked, Renderer } from 'marked';
import { anchor, splitTopics, topicKey, classifyStatements, relatedTopics, interactiveTopics, widgetTitles } from './study-tools.mjs';
import katex from 'katex';
import { renderPractice } from './render-practice.mjs';
import { expandPracticeVariants } from './practice-variants.mjs';
import { calibrateCampusMap, scheduleMapUrl } from '../assets/campus-map/model.mjs';

const root = process.cwd();
const output = path.join(root, 'dist');
const assets = path.join(output, 'assets');
// Recreate generated output so stale temporary files never enter the Android bundle.
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(assets, { recursive: true });
fs.cpSync(path.join(root, 'assets'), assets, { recursive: true });
fs.copyFileSync(path.join(root, 'textbooks-sw.js'), path.join(output, 'textbooks-sw.js'));
fs.writeFileSync(path.join(assets, 'campus-map/schedule.json'), JSON.stringify(loadSchedule(root)));
const capturedMap = JSON.parse(fs.readFileSync(path.join(root, 'content/campus-map/data.json'), 'utf8'));
const mapCalibration = JSON.parse(fs.readFileSync(path.join(root, 'content/campus-map/calibration.json'), 'utf8'));
const mapOutdoors = JSON.parse(fs.readFileSync(path.join(root, 'content/campus-map/outdoors.json'), 'utf8'));
const mapIcons = JSON.parse(fs.readFileSync(path.join(root, 'content/campus-map/material-icons.json'), 'utf8'));
fs.writeFileSync(path.join(assets, 'campus-map/data.json'), JSON.stringify(calibrateCampusMap(capturedMap, mapCalibration, mapOutdoors, mapIcons)));
fs.cpSync(path.join(root, 'node_modules/katex/dist/fonts'), path.join(assets, 'fonts'), { recursive: true });
fs.copyFileSync(path.join(root, 'node_modules/katex/dist/katex.min.css'), path.join(assets, 'katex.min.css'));
fs.copyFileSync(path.join(root, 'node_modules/katex/dist/katex.min.js'), path.join(assets, 'katex.min.js'));
for (const name of ['mathlive', '@cortex-js/compute-engine']) {
    const target = path.join(assets, name === 'mathlive' ? 'mathlive' : 'compute-engine');
    fs.mkdirSync(target, { recursive: true });
    if (name === 'mathlive') {
        fs.copyFileSync(path.join(root, 'node_modules/mathlive/mathlive.min.js'), path.join(target, 'mathlive.min.js'));
        fs.cpSync(path.join(root, 'node_modules/mathlive/fonts'), path.join(target, 'fonts'), { recursive: true });
        fs.copyFileSync(path.join(root, 'node_modules/mathlive/LICENSE.txt'), path.join(target, 'LICENSE.txt'));
    } else {
        fs.copyFileSync(path.join(root, 'node_modules/@cortex-js/compute-engine/dist/umd-min/compute-engine.cjs'), path.join(target, 'compute-engine.js'));
        fs.copyFileSync(path.join(root, 'node_modules/@cortex-js/compute-engine/LICENSE'), path.join(target, 'LICENSE.txt'));
    }
}
const limitsVersion = createHash('sha256').update(fs.readFileSync(path.join(assets, 'limits-engine.js')))
    .update(fs.readFileSync(path.join(assets, 'limits-worker.js'))).digest('hex').slice(0, 12);
const limitsUiPath = path.join(assets, 'limits-ui.js');
fs.writeFileSync(limitsUiPath, fs.readFileSync(limitsUiPath, 'utf8').replace('__LIMITS_BUILD__', limitsVersion));
const manimVersion = createHash('sha256').update(fs.readFileSync(path.join(assets, 'manim-scene.py')))
    .update(fs.readFileSync(path.join(assets, 'limits-engine.js'))).digest('hex').slice(0, 12);
const manimUiPath = path.join(assets, 'manim-export.js');
fs.writeFileSync(manimUiPath, fs.readFileSync(manimUiPath, 'utf8').replaceAll('__MANIM_BUILD__', manimVersion));
const serviceConfig = JSON.parse(fs.readFileSync(path.join(root, 'assets/schedule-service.json'), 'utf8'));
if (serviceConfig.schema !== 1 || typeof serviceConfig.url !== 'string') { throw new Error('Invalid schedule service config'); }
if (serviceConfig.url) {
    const url = new URL(serviceConfig.url);
    if (url.href !== serviceConfig.url || url.protocol !== 'https:' || !url.hostname.endsWith('.workers.dev')
        || url.username || url.password || url.port || url.search || url.hash || url.pathname !== '/changes') {
        throw new Error('Invalid schedule service endpoint');
    }
}
const subjects = JSON.parse(fs.readFileSync(path.join(root, 'content/subjects.json'), 'utf8'));
const disciplineIcons = JSON.parse(fs.readFileSync(path.join(root, 'scripts/subject-icons.json'), 'utf8'));
const interfaceIcons = JSON.parse(fs.readFileSync(path.join(root, 'scripts/interface-icons.json'), 'utf8'));
const study = JSON.parse(fs.readFileSync(path.join(root, 'content/study.json'), 'utf8'));
const practice = expandPracticeVariants(JSON.parse(fs.readFileSync(path.join(root, 'content/practice.json'), 'utf8')));
const aliases = JSON.parse(fs.readFileSync(path.join(root, 'content/topic-aliases.json'), 'utf8'));
const updates = JSON.parse(fs.readFileSync(path.join(root, 'content/updates.json'), 'utf8'));
const formulaGroups = JSON.parse(fs.readFileSync(path.join(root, 'content/formulas.json'), 'utf8'));
const quizAliases = JSON.parse(fs.readFileSync(path.join(root, 'content/quiz-aliases.json'), 'utf8'));
const widgetSources = JSON.parse(fs.readFileSync(path.join(root, 'content/widget-sources.json'), 'utf8'));
const stepExplanations = JSON.parse(fs.readFileSync(path.join(root, 'content/step-explanations.json'), 'utf8'));
const matrixSequences = JSON.parse(fs.readFileSync(path.join(root, 'content/matrix-steps.json'), 'utf8'));
// Rebuild generated routes so merged topics cannot leave obsolete visible content.
fs.rmSync(path.join(output, 'check'), { recursive: true, force: true });
fs.rmSync(path.join(output, 'downloads'), { recursive: true, force: true });
const catalog = [];
const widgetStages = {};
const github = 'https://github.com/GrayMans1on/UniversityProjects_Shparov/tree/main/lectures';
const orderedSubjects = [...subjects].sort((a, b) => a.title.localeCompare(b.title, 'ru'));
orderedSubjects.push({ title: 'Программирование', external: true });
const searchIndex = [];
const mathErrors = [];
let mathCount = 0;
let headings = [];
let usedIds = new Map();
let currentSubject;
let currentTopic = '';

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character]);
}

function plain(value) {
    return value.replace(/<[^>]*>/g, ' ').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/[#$*_`]/g, '').replace(/\\(?:begin|end)\{[^}]*\}/g, ' ')
        .replace(/\\[a-zA-Z]+/g, ' ').replace(/[{}]/g, ' ').replace(/\s+/g, ' ').trim();
}

function renderMath(source, display) {
    mathCount += 1;
    const pronunciation = /^\[\s*\\text\{([^{}]*)\}\s*\]$/.exec(source.trim());
    if (!display && pronunciation) {
        return `<span class="pronunciation">[${escapeHtml(pronunciation[1])}]</span>`;
    }
    try {
        const html = katex.renderToString(source.trim(), {
            displayMode: display, throwOnError: true, strict: 'ignore', trust: false,
            macros: { '\\tg': '\\tan', '\\ctg': '\\cot', '\\arctg': '\\arctan' },
        });
        return display ? `<div class="math-scroll">${html}</div>` : `<span class="inline-math-scroll">${html}</span>`;
    } catch (error) {
        mathErrors.push({ source, error: error.message });
        return `<code class="math-fallback">${escapeHtml(source)}</code>`;
    }
}

const renderer = new Renderer();
const defaultTable = renderer.table;
let diagramCount = 0;
renderer.image = function (token) {
    const description = plain(token.text);
    const source = escapeHtml(token.href);
    if (/^\/assets\/[a-z0-9-]+\.svg$/.test(token.href)) {
        const prefix = 'diagram-' + (++diagramCount) + '-';
        let svg = fs.readFileSync(path.join(root, token.href.slice(1)), 'utf8');
        svg = svg.replace(/\bid="([^"]+)"/g, (_, id) => `id="${prefix}${id}"`)
            .replace(/url\(#([^)]+)\)/g, (_, id) => `url(#${prefix}${id})`)
            .replace(/\bhref="#([^"]+)"/g, (_, id) => `href="#${prefix}${id}"`)
            .replace(/aria-labelledby="([^"]+)"/g, (_, ids) => `aria-labelledby="${ids.split(' ').map((id) => prefix + id).join(' ')}"`)
            .replace('<svg ', `<svg id="${prefix}image" `);
        return `<a class="diagram-link" href="${source}" target="_blank" rel="noopener noreferrer" aria-label="Открыть крупнее: ${escapeHtml(description)}">${svg}</a>`;
    }
    return `<a class="diagram-link" href="${source}" target="_blank" rel="noopener noreferrer" aria-label="Открыть крупнее: ${escapeHtml(description)}"><img src="${source}" alt="${escapeHtml(description)}" loading="lazy" decoding="async"></a>`;
};
renderer.heading = function (token) {
    if (token.depth === 1) {
        return '';
    }
    const title = plain(token.text);
    const base = title.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-');
    const occurrence = (usedIds.get(base) ?? 0) + 1;
    usedIds.set(base, occurrence);
    const id = base + (occurrence > 1 ? '-' + occurrence : '');
    headings.push({ title, id, depth: token.depth });
    const html = this.parser.parseInline(token.tokens);
    return `<h${token.depth} id="${escapeHtml(id)}">${html}<a class="heading-link" href="#${encodeURIComponent(id)}" aria-label="Ссылка на раздел ${escapeHtml(title)}">§</a></h${token.depth}>\n`;
};
renderer.table = function (token) {
    return '<div class="table-scroll" tabindex="0" role="region" aria-label="Таблица">'
        + defaultTable.call(this, token) + '</div>';
};
marked.use({
    renderer,
    gfm: true,
    breaks: false,
    extensions: [
        {
            name: 'matrixSteps', level: 'block',
            start(source) { return source.indexOf(':::matrix-steps '); },
            tokenizer(source) {
                const match = /^:::matrix-steps ([a-z0-9-]+)(?:\n|$)/.exec(source);
                if (match) return { type: 'matrixSteps', raw: match[0], sequence: match[1] };
            },
            renderer(token) {
                const sequence = matrixSequences[token.sequence];
                if (!sequence) throw new Error('Unknown matrix sequence: ' + token.sequence);
                return '<div class="matrix-sequence" aria-label="Преобразования: ' + escapeHtml(sequence.title) + '">'
                    + sequence.steps.map((step, index) => renderMatrixStep(token.sequence, step, index)).join('') + '</div>';
            },
        },
        {
            name: 'practiceExample', level: 'block',
            start(source) { return source.search(/:::example |:::exercise /); },
            tokenizer(source) {
                const match = /^:::(example|exercise) ([^\n]+)\n([\s\S]*?)\n:::(?:\n|$)/.exec(source);
                if (match) {
                    return { type: 'practiceExample', raw: match[0], kind: match[1], title: match[2], source: match[3],
                        tokens: this.lexer.blockTokens(match[3]) };
                }
            },
            renderer(token) {
                const base = 'example-' + topicKey(currentTopic + '|' + token.title).replace(/^topic-/, '');
                const occurrence = (usedIds.get(base) ?? 0) + 1;
                usedIds.set(base, occurrence);
                const id = base + (occurrence > 1 ? '-' + occurrence : '');
                const label = token.kind === 'exercise' ? 'Задача' : 'Пример';
                const source = expandMatrixMarkdown(token.source).replace(/^:::widget [a-z-]+\n?/gm, '');
                searchIndex.push({ subject: currentSubject.title, slug: currentSubject.slug,
                    title: label + ' · ' + plain(token.title), text: plain(source), symbols: source,
                    url: '/notes/' + currentSubject.slug + '/#' + id });
                return '<details class="practice-example" id="' + id + '" data-kind="' + token.kind + '"><summary>'
                    + '<span class="example-label">' + label + '</span>'
                    + '<span class="example-title">' + marked.parseInline(token.title) + '</span></summary>'
                    + '<div class="example-content">' + this.parser.parse(token.tokens) + '</div></details>';
            },
        },
        {
            name: 'inlineWidget', level: 'block',
            start(source) { return source.indexOf(':::widget '); },
            tokenizer(source) {
                const match = /^:::widget ([a-z-]+)(?:\n|$)/.exec(source);
                if (match) {
                    return { type: 'inlineWidget', raw: match[0], widget: match[1] };
                }
            },
            renderer(token) { return renderWidget(token.widget); },
        },
        {
            name: 'displayMath', level: 'block',
            start(source) { return source.indexOf('$$'); },
            tokenizer(source) {
                const match = /^\$\$\s*\n?([\s\S]*?)\n?\$\$(?:\n|$)/.exec(source);
                if (match) {
                    return { type: 'displayMath', raw: match[0], text: match[1] };
                }
            },
            renderer(token) { return renderMath(token.text, true); },
        },
        {
            name: 'inlineMath', level: 'inline',
            start(source) { return source.indexOf('$'); },
            tokenizer(source) {
                const match = /^\$(?!\$)((?:\\.|[^$\n])+?)\$(?!\$)/.exec(source);
                if (match) {
                    return { type: 'inlineMath', raw: match[0], text: match[1] };
                }
            },
            renderer(token) { return renderMath(token.text, false); },
        },
    ],
});

const bookIcon = interfaceIcons.menu_book;
const searchIcon = interfaceIcons.search;
const menuIcon = interfaceIcons.menu;
const favicon = bookIcon.replace('fill="currentColor"', 'fill="#254cce"');

function shell(title, description, content, current = null, toc = '', route = '') {
    const navigation = orderedSubjects.map((subject) => {
        if (subject.external) {
            return `<a class="subject-link external-link" href="${github}" target="_blank" rel="noopener noreferrer">${disciplineIcons[subject.title]}<span>Программирование<small>Лекции в GitHub</small></span><span class="external-label" aria-label="Откроется в новой вкладке">GitHub</span></a>`;
        }
        return `<a class="subject-link${current === subject.slug ? ' is-current' : ''}" href="/notes/${subject.slug}/"${current === subject.slug ? ' aria-current="page"' : ''}>${disciplineIcons[subject.title]}<span>${escapeHtml(subject.title)}</span></a>`;
    }).join('');
    const toolNavigation = toolPages.map(([id, title, description, icon]) =>
        `<a class="library-link tool-sidebar-link${route === 'tools/' + id ? ' is-current' : ''}" href="/tools/${id}/">${interfaceIcons[icon]}<span>${title}</span></a>`).join('');
    const mathScripts = ['tools/calculator', 'tools/graphs', 'tools/formula-editor', 'tools/limits', 'tools/derivatives'].includes(route)
        ? '<script defer src="/assets/compute-engine/compute-engine.js"></script><script defer src="/assets/mathlive/mathlive.min.js"></script><script defer src="/assets/katex.min.js"></script>' : ['tools/systems', 'tools/matrices'].includes(route) ? '<script defer src="/assets/katex.min.js"></script>' : '';
    const discreteScripts = ['tools/venn', 'tools/relations'].includes(route)
        ? '<script defer src="/assets/discrete-engine.js"></script><script defer src="/assets/discrete-ui.js"></script>' : '';
    const academicScripts = ['tools/derivatives', 'tools/systems', 'tools/matrices', 'tools/radix'].includes(route)
        ? '<script defer src="/assets/derivatives-engine.js"></script><script defer src="/assets/linear-engine.js"></script><script defer src="/assets/radix-engine.js"></script><script defer src="/assets/academic-tools-ui.js"></script>' : '';
    return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="${escapeHtml(description)}"><meta name="robots" content="noindex,nofollow"><title>${escapeHtml(title)} · Конспекты</title><link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${encodeURIComponent(favicon)}"><link rel="stylesheet" href="/assets/katex.min.css"><script src="/assets/preferences.js"></script><link rel="stylesheet" href="/assets/site.css"><link rel="stylesheet" href="/assets/study.css"><link rel="stylesheet" href="/assets/schedule-admin.css"><script defer src="/assets/schedule-overrides.js"></script><script defer src="/assets/schedule.js"></script><script defer src="/assets/schedule-admin.js"></script><script defer src="/assets/search-utils.js"></script><script defer src="/assets/site.js"></script><script defer src="/assets/study.js"></script><script defer src="/assets/practice.js"></script><script defer src="/assets/widget-stages.js"></script><script defer src="/assets/interactives.js"></script><link rel="stylesheet" href="/assets/tools.css"><link rel="stylesheet" href="/assets/tools-v2.css"><script defer src="/assets/tool-core.js"></script><script defer src="/assets/reader-tools.js"></script><script defer src="/assets/math-runtime.js"></script><script defer src="/assets/math-tools.js"></script><script defer src="/assets/flow-runtime.js"></script><script defer src="/assets/flow-export.js"></script><script defer src="/assets/flow-editor.js"></script>${mathScripts}${academicScripts}${discreteScripts}<script defer src="/assets/tool-session.js"></script><script defer src="/assets/manim-export.js"></script><script defer src="/assets/limits-ui.js"></script><script defer src="/assets/tools.js"></script></head>
<body class="${current ? 'reader-page' : 'library-page'}"><a class="skip-link" href="#main">Перейти к конспекту</a>
<button class="nav-backdrop" type="button" aria-label="Закрыть меню" hidden></button>
<aside class="sidebar" id="sidebar"><a class="brand" href="/">${bookIcon}<span>Учёба<span class="brand-caption">Конспекты</span></span></a><div class="semester">1 курс, 1 семестр</div><nav aria-label="Разделы сайта"><a class="library-link schedule-nav-link" href="/#schedule">Расписание</a><a class="library-link map-nav-link${route === 'map' ? ' is-current' : ''}" href="/map/"${route === 'map' ? ' aria-current="page"' : ''}>Карта ЧелГУ</a><a class="library-link${route === 'textbooks' ? ' is-current' : ''}" href="/textbooks/">Учебники</a><a class="library-link${route === '' ? ' is-current' : ''}" href="/#disciplines"${route === '' ? ' aria-current="page"' : ''}>Все дисциплины</a><div class="nav-label">Учебные инструменты</div>${toolNavigation}<a class="library-link tool-sidebar-link" href="/reference/">${interfaceIcons.function}<span>Справочник формул</span></a><a class="library-link tool-sidebar-link" href="/check/">${interfaceIcons.fact_check}<span>Самопроверка</span></a></nav></aside>
<div class="workspace"><header class="topbar"><button class="menu-button icon-button" type="button" aria-label="Открыть меню" aria-controls="sidebar" aria-expanded="false">${menuIcon}</button><form class="search-form" role="search">${searchIcon}<label class="sr-only" for="search">Поиск по всем конспектам</label><input id="search" name="q" type="search" autocomplete="off" placeholder="Поиск по всем конспектам" aria-controls="search-results" aria-expanded="false"><kbd aria-hidden="true">Ctrl K</kbd><select id="search-scope" aria-label="Область поиска"><option value="">Везде</option>${current ? `<option value="${current}">Этот предмет</option>` : subjectOptions().replace('<option value="">Все предметы</option>', '')}</select></form><nav class="tool-nav" aria-label="Настройки"><details class="reading-settings"><summary aria-label="Настройки чтения">${interfaceIcons.tune}</summary><div class="settings-panel"><label>Тема<select id="theme-mode"><option value="auto">Как в системе</option><option value="light">Светлая</option><option value="dark">Тёмная</option></select></label><label>Размер текста<select id="font-scale"><option value="1">Обычный</option><option value="1.12">Крупный</option><option value="1.25">Очень крупный</option></select></label><label>Ширина текста<select id="reading-width"><option value="normal">Обычная</option><option value="narrow">Узкая</option><option value="wide">Широкая</option></select></label><span class="settings-note">Сохраняется в этом браузере</span></div></details></nav></header>
<section class="search-panel" id="search-results" aria-label="Результаты поиска" hidden><div class="search-panel-header"><span id="search-status" role="status" aria-live="polite"></span><button class="search-close" type="button">Закрыть</button></div><div id="search-list"></div></section>
<main id="main" class="${current ? 'reader-layout' : 'library-layout' + (content.includes('home-dashboard') ? ' home-layout' : route === 'map' ? ' map-layout' : '')}" tabindex="-1">${content}${toc}</main><footer class="site-credit"><p>Сделано с помощью ChatGPT. Соавтор — Влад Шпаров.</p><p>Не официальный сайт ЧелГУ</p></footer></div></body></html>`;
}

const toolAssetVersions = new Map();
function versionToolAssets(html) {
    return html.replace(/(src|href)="(\/assets\/(?:tools(?:-v2)?\.css|tool-session\.js|limits-ui\.js|manim-export\.js|tool-core\.js|reader-tools\.js|tools\.js|math-runtime\.js|math-tools\.js|flow-runtime\.js|flow-editor\.js|flow-export\.js|derivatives-engine\.js|linear-engine\.js|radix-engine\.js|academic-tools-ui\.js|discrete-engine\.js|discrete-ui\.js|compute-engine\/compute-engine\.js|mathlive\/mathlive\.min\.js))"/g, (match, attribute, url) => {
        if (!toolAssetVersions.has(url)) {
            const bytes = fs.readFileSync(path.join(output, url));
            toolAssetVersions.set(url, createHash('sha256').update(bytes).digest('hex').slice(0, 12));
        }
        return `${attribute}="${url}?v=${toolAssetVersions.get(url)}"`;
    });
}
function writePage(route, title, description, content, current = null, toc = '') {
    const folder = path.join(output, route);
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, 'index.html'), versionToolAssets(shell(title, description, content, current, toc, route)));
}

function md(value) {
    return marked.parse(value);
}

function matrixAtom(value) {
    const [numerator, denominator] = String(value).split('/');
    if (!denominator) return numerator;
    return (numerator.startsWith('-') ? '-' : '') + '\\frac{' + numerator.replace('-', '') + '}{' + denominator + '}';
}

function matrixExpression(matrix, sequence) {
    const body = matrix.map((row) => row.map(matrixAtom).join('&')).join('\\\\');
    if (sequence.determinant) return '\\begin{vmatrix}' + body + '\\end{vmatrix}';
    if (sequence.split === null) return '\\begin{pmatrix}' + body + '\\end{pmatrix}';
    const columns = 'r'.repeat(sequence.split) + '|' + 'r'.repeat(matrix[0].length - sequence.split);
    return '\\left(\\begin{array}{' + columns + '}' + body + '\\end{array}\\right)';
}

function matrixOperations(step) {
    return step.operations.map((op) => {
        const row = (i) => 'R_' + i;
        const column = (i) => 'C_' + i;
        if (op.kind === 'add' || op.kind === 'add-column') {
            const name = op.kind === 'add' ? row : column;
            return name(op.target) + '\\leftarrow ' + name(op.target) + '+\\bigl(' + matrixAtom(op.factor) + '\\bigr)' + name(op.source);
        }
        if (op.kind === 'scale') return row(op.row) + '\\leftarrow\\bigl(' + matrixAtom(op.factor) + '\\bigr)' + row(op.row);
        if (op.kind === 'swap') return row(op.rows[0]) + '\\leftrightarrow ' + row(op.rows[1]);
        if (op.kind === 'reorder') return '\\text{порядок строк: }' + op.order.join(',');
        if (op.kind === 'drop') return row(op.row) + '=\\bigl(' + matrixAtom(op.factor) + '\\bigr)' + row(op.duplicate) + '\\;\\Rightarrow\\;\\text{удаляем }' + row(op.row);
        if (op.kind === 'minor') return 'a_{' + op.row + op.column + '}(-1)^{' + op.row + '+' + op.column + '}=' + matrixAtom(op.cofactor);
        throw new Error('Unknown matrix operation: ' + op.kind);
    });
}

function renderMatrixStep(key, step, index) {
    const svg = renderer.image({ href: '/assets/matrix-step-' + key + '-' + (index + 1) + '.svg', text: step.text });
    return '<figure class="matrix-transition" data-matrix-sequence="' + key + '" data-transition="' + (index + 1) + '">'
        + '<figcaption><span class="matrix-step-number">' + (index + 1) + '.</span>' + md(step.text) + '</figcaption>'
        + '<div class="matrix-diagram-scroll" tabindex="0" role="region" aria-label="Схема преобразования">' + svg + '</div>'
        + '<details class="matrix-operation-notation"><summary>Запись операции</summary>'
        + matrixOperations(step).map((formula) => renderMath(formula, true)).join('') + '</details></figure>';
}

function expandMatrixMarkdown(source) {
    return source.replace(/^:::matrix-steps ([a-z0-9-]+)\s*$/gm, (_, key) => {
        const sequence = matrixSequences[key];
        if (!sequence) throw new Error('Unknown exported matrix sequence: ' + key);
        let before = sequence.initial;
        return sequence.steps.map((step, index) => {
            const block = '**' + (index + 1) + '.** ' + step.text + '\n\n'
                + '![' + sequence.title + ': переход ' + (index + 1) + '](/assets/matrix-step-' + key + '-' + (index + 1) + '.svg)\n\n'
                + matrixOperations(step).map((formula) => '$$\n' + formula + '\n$$').join('\n\n')
                + '\n\n$$\n' + matrixExpression(before, sequence)
                + (sequence.determinant ? '=' : '\\sim') + matrixExpression(step.after, sequence) + '\n$$\n';
            before = step.after;
            return block;
        }).join('\n');
    });
}

function recordedMatrixGroup(key) {
    const sequence = matrixSequences[key];
    return { title: sequence.title,
        steps: [renderMath(matrixExpression(sequence.initial, sequence), true),
            ...sequence.steps.map((step, index) => renderMatrixStep(key, step, index))],
        explanations: ['<p>Исходная расширенная матрица. Все операции выполняем над целой строкой.</p>',
            ...sequence.steps.map(() => '<p>Обведённая опора, множитель сбоку и стрелка к изменяемой строке показаны на схеме.</p>')] };
}

function downloadPath(subject, key = subject.title) {
    return `/downloads/${subject.slug}/${encodeURIComponent(key)}.md`;
}

function exportMarkdown(subject, key, markdown) {
    const folder = path.join(output, 'downloads', subject.slug);
    fs.mkdirSync(folder, { recursive: true });
    const exported = expandMatrixMarkdown(markdown).replace(/^:::(example|exercise) (.+)\n([\s\S]*?)\n:::/gm,
        (_, kind, title, body) => '<details>\n<summary>' + (kind === 'exercise' ? 'Задача: ' : 'Пример: ')
            + escapeHtml(title) + '</summary>\n\n' + body + '\n\n</details>')
        .replace(/^:::widget [a-z-]+\n?/gm, '');
    fs.writeFileSync(path.join(folder, key + '.md'), exported.replace(/\]\(\/assets\//g, '](' + 'https://vlad-study-notes.graymansiongamedev.chatgpt.site/assets/'));
}

function renderWidget(type) {
    if (!widgetTitles[type]) {
        throw new Error('Unknown inline widget: ' + type);
    }
    return `<details class="interactive"><summary>${widgetTitles[type]}</summary><div class="interactive-body" data-widget="${type}"></div></details>`;
}

function exportControl(subject, key, topic = '') {
    return `<details class="export-control"><summary>Скачать</summary><div class="export-menu"><a href="${downloadPath(subject, key)}" download>Markdown</a><button type="button" class="print-button" data-print-topic="${topic}">PDF / печать</button></div></details>`;
}

function topicFooter(subject, record, editorial) {
    const quiz = `/check/${subject.slug}/${record.key}/`;
    const related = relatedTopics[subject.title + '|' + record.title];
    const target = related && subjects.find((s) => s.title === related[0]);
    const link = related ? `<p class="related-topic">Связь: <a href="/notes/${target.slug}/#${encodeURIComponent(anchor(related[1]))}">${escapeHtml(related[1])}</a></p>` : '';
    return `<aside class="topic-summary" aria-label="Итог темы"><span class="summary-label">Итог</span><ul>${editorial.summary.map((line) => `<li>${md(line)}</li>`).join('')}</ul></aside>${link}<div class="topic-tools"><a class="check-link" href="${quiz}">Самопроверка</a>${exportControl(subject, record.key, record.key)}</div>`;
}

for (const subject of subjects) {
    currentSubject = subject;
    const markdown = fs.readFileSync(path.join(root, 'content', subject.title + '.md'), 'utf8');
    headings = [];
    usedIds = new Map();
    let exported = '# ' + subject.title + '\n\n';
    let html = '';
    for (const block of splitTopics(markdown)) {
        currentTopic = block.title ?? '';
        let blockHtml = classifyStatements(md(block.source));
        if (!block.topic) {
            html += blockHtml;
            exported += block.source.replace(/^# [^\n]+\n/, '');
            continue;
        }
        const key = subject.title + '|' + block.title;
        const editorial = study[key];
        if (!editorial) {
            throw new Error('Study content missing: ' + key);
        }
        const heading = headings.find((h) => h.depth === 3 && h.title === block.title);
        const record = { subject: subject.title, slug: subject.slug, title: block.title, section: block.section,
            key: topicKey(block.title), anchor: heading.id, url: `/notes/${subject.slug}/#${encodeURIComponent(heading.id)}`, ...editorial };
        record.practice = practice[key];
        if (!record.practice?.length) {
            throw new Error('Practice tasks missing: ' + key);
        }
        catalog.push(record);
        const legacy = Object.entries(aliases[subject.title] ?? {}).filter(([old, target]) => {
            while (aliases[subject.title]?.[target]) {
                target = aliases[subject.title][target];
            }
            return target === block.title && !headings.some((h) => h.id === anchor(old));
        }).map(([old]) => `<span class="legacy-anchor" id="${escapeHtml(anchor(old))}"></span>`).join('');
        blockHtml = blockHtml.replace(/<h([45])([^>]*)>(Доказательство[\s\S]*?)<\/h\1>([\s\S]*?)(?=<h[2345]\b|$)/g,
            '<details class="proof" open><summary><span$2>$3</span></summary><div class="proof-content">$4</div></details>');
        for (const type of (interactiveTopics[key] ?? [])) {
            if (type === 'inverse-steps') {
                widgetStages[type] = [recordedMatrixGroup('inverse')];
            } else if (type === 'gauss-steps') {
                widgetStages[type] = ['unique-system', 'inconsistent-system'].map(recordedMatrixGroup);
            } else if (type.endsWith('-steps')) {
                const stageSource = widgetSources[type] ?? block.source;
                const examples = type === 'gauss-steps' ? stageSource.split(/\*\*Пример \d\.\*\*/).slice(1) : [stageSource];
                widgetStages[type] = examples.map((source, index) => {
                    const expressions = [...source.matchAll(/\$\$\s*([\s\S]*?)\s*\$\$/g)].map((match) => match[1]);
                    const steps = expressions.filter((expression) => expression.includes('array')
                        || (type === 'inverse-steps' && /^A(?:=|\^)/.test(expression.trim()))
                        || (type === 'gauss-steps' && expression.trim().startsWith('[0\\quad')))
                        .flatMap((expression) => expression.split(/\\sim\s*/).filter((part) => part.trim()))
                        .map((expression) => renderMath(expression, true));
                    const descriptions = stepExplanations[type][index];
                    if (descriptions.length !== steps.length) {
                        throw new Error(`Missing transition explanation: ${type}, example ${index + 1}`);
                    }
                    const explanations = descriptions.map((item) => md(item.text)
                        + (item.formula ? renderMath(item.formula, true) : '')
                        + (item.calculation ? '<details class="step-calculation"><summary>Вычисление</summary>'
                            + renderMath(item.calculation, true) + '</details>' : ''));
                    return { title: type === 'gauss-steps' ? 'Пример ' + (index + 1) : 'Обратная матрица', steps, explanations };
                });
            }
        }
        const widgets = (interactiveTopics[key] ?? []).filter((type) => !block.source.includes(':::widget ' + type))
            .map((type) => renderWidget(type)).join('');
        html += `<section class="topic" data-topic-key="${record.key}">${legacy}${blockHtml}${widgets}${topicFooter(subject, record, editorial)}</section>`;
        const summaryMd = '\n\n**Итог**\n' + editorial.summary.map((line) => '- ' + line).join('\n') + '\n';
        exported += block.source + summaryMd;
        exportMarkdown(subject, record.key, '# ' + subject.title + '\n\n' + block.source.replace(/^### /, '## ') + summaryMd);
    }
    subject.headings = [...headings];
    subject.topics = headings.filter((heading) => heading.depth === 3).length;
    const tocItems = headings.filter((heading) => heading.depth <= 3).map((heading) =>
        `<a class="toc-link depth-${heading.depth}" href="#${encodeURIComponent(heading.id)}">${escapeHtml(heading.title)}</a>`).join('');
    const toc = `<aside class="toc"><div class="toc-title">На этой странице</div><nav aria-label="Оглавление">${tocItems}</nav></aside>`;
    const mobileToc = `<details class="mobile-toc"><summary>Оглавление</summary><nav aria-label="Оглавление на телефоне">${tocItems}</nav></details>`;
    const content = `<div class="reading-column"><div class="breadcrumbs"><a href="/">Дисциплины</a><span>/</span><span>${escapeHtml(subject.title)}</span></div><article class="note"><header class="note-header"><span class="eyebrow">1 курс, 1 семестр</span><div class="note-title-row"><h1>${escapeHtml(subject.title)}</h1>${exportControl(subject, subject.title)}</div></header>${mobileToc}${html}</article></div>`;
    writePage('notes/' + subject.slug, subject.title, subject.description, content, subject.slug, toc);
    exportMarkdown(subject, subject.title, exported);
    const sections = markdown.split(/(?=^#{2,6} )/m).filter((section) => /^#{2,6} /.test(section));
    sections.forEach((section, index) => {
        const heading = headings[index];
        if (heading) {
            searchIndex.push({ subject: subject.title, slug: subject.slug, title: heading.title, text: plain(section.replace(/^.*\n/, '')), symbols: section,
                url: '/notes/' + subject.slug + '/#' + encodeURIComponent(heading.id) });
        }
    });
}

const cards = orderedSubjects.map((subject, index) => {
    const number = `<div class="card-heading"><span class="card-number">${String(index + 1).padStart(2, '0')}</span><span class="card-icon">${disciplineIcons[subject.title]}</span></div>`;
    if (subject.external) {
        return `<a class="subject-card programming-card" href="${github}" target="_blank" rel="noopener noreferrer">${number}<h2>Программирование</h2><p>Лекции в репозитории UniversityProjects_Shparov</p><span class="card-topics">GitHub · lectures</span></a>`;
    }
    return `<a class="subject-card" href="/notes/${subject.slug}/">${number}<h2>${escapeHtml(subject.title)}</h2><p>${escapeHtml(subject.description)}</p><span class="card-topics">${subject.topics} ${subject.topics % 10 === 1 && subject.topics !== 11 ? 'тема' : subject.topics % 10 >= 2 && subject.topics % 10 <= 4 && (subject.topics < 12 || subject.topics > 14) ? 'темы' : 'тем'}</span></a>`;
}).join('');
const textbooks = JSON.parse(fs.readFileSync(path.join(root, 'content/textbooks.json'), 'utf8'));
if (textbooks.schema !== 1 || !Array.isArray(textbooks.books)) { throw new Error('Invalid textbook catalog'); }
const bookIds = new Set();
for (const book of textbooks.books) {
    if (!/^[a-z0-9-]{1,80}$/.test(book.id || '') || bookIds.has(book.id) || !book.title
        || !/^https:\/\//.test(book.url || '') || !/^[a-f0-9]{64}$/.test(book.sha256 || '')
        || !Number.isSafeInteger(book.size) || book.size < 5 || book.size > 200 * 1024 * 1024) {
        throw new Error('Invalid textbook entry: ' + book.id);
    }
    bookIds.add(book.id);
}
fs.writeFileSync(path.join(assets, 'textbooks.json'), JSON.stringify(textbooks));
const staff = new Map();
for (const lesson of loadSchedule(root).lessons) {
    if (!lesson.teacher) { continue; }
    const person = staff.get(lesson.teacher) || { id: anchor(lesson.teacher), name: lesson.teacher, description: '', subjects: [] };
    if (!person.subjects.includes(lesson.title)) { person.subjects.push(lesson.title); }
    staff.set(lesson.teacher, person);
}
const teacherCatalog = JSON.parse(fs.readFileSync(path.join(root, 'content/teachers.json'), 'utf8'));
for (const person of teacherCatalog.people) {
    const key = person.scheduleName || person.name;
    staff.set(key, { ...staff.get(key), ...person });
}
fs.writeFileSync(path.join(assets, 'teachers.json'), JSON.stringify({ schema: 1, people: [...staff.values()] }));
fs.copyFileSync(path.join(root, 'content/announcements.json'), path.join(assets, 'announcements.json'));
fs.writeFileSync(path.join(assets, 'tool-catalog.json'), JSON.stringify({ subjects, textbooks: textbooks.books }));

const newest = updates[0];
const updateHtml = `<section class="updates" aria-labelledby="update-title"><div class="update-title-row"><h2 id="update-title">Последнее обновление</h2><time datetime="${newest.date}">${newest.date.split('-').reverse().join('.')}</time></div><ul>${newest.items.map((item) => `<li><a href="${escapeHtml(item.url)}">${escapeHtml(item.text)}</a></li>`).join('')}</ul></section>`;
const schedule = loadSchedule(root);
const campusMap = JSON.parse(fs.readFileSync(path.join(root, 'content/campus-map/data.json'), 'utf8'));
const campusRooms = campusMap.layers.flatMap((layer) => layer.rooms);
for (const lesson of schedule.lessons) {
    lesson.mapUrl = scheduleMapUrl(lesson, campusRooms);
}
for (const event of [...schedule.exceptions.filter((item) => item.target), ...schedule.permanentChanges.filter((item) => item.patch).map((item) => ({ ...item, source: { lessonId: item.lessonId }, target: { lesson: item.patch } }))]) {
    const patch = event.target.lesson;
    if (event.action === 'add' || ['room', 'place', 'note'].some((field) => Object.hasOwn(patch, field))) {
        const original = schedule.lessons.find((lesson) => lesson.id === event.source?.lessonId);
        const effective = { ...original, ...patch };
        if (Object.hasOwn(patch, 'room')) {
            delete effective.place;
        }
        if (Object.hasOwn(patch, 'place')) {
            delete effective.room;
        }
        try {
            patch.mapUrl = /онлайн/i.test(effective.note || '') ? null : scheduleMapUrl(effective, campusRooms);
        } catch (error) {
            if (!error.message.startsWith('Unmapped schedule room:')) {
                throw error;
            }
            patch.mapUrl = null;
        }
    }
}
const scheduleData = JSON.stringify(schedule);
const scheduleHtml = `<section class="schedule" id="schedule" aria-labelledby="schedule-title"><link rel="stylesheet" href="/assets/schedule.css"><span class="eyebrow home-semester">1 курс, 1 семестр</span><div class="schedule-heading"><h1 id="schedule-title">Расписание<a class="heading-link" href="#schedule" aria-label="Ссылка на расписание">§</a></h1><div class="schedule-controls"><button type="button" data-schedule="previous" aria-label="Предыдущая неделя">Пред. неделя</button><button type="button" data-schedule="today">Сегодня</button><button type="button" data-schedule="tomorrow">Завтра</button><button type="button" data-schedule="next" aria-label="Следующая неделя">След. неделя</button></div></div><div class="schedule-filters"><label>Дата<input type="date" id="schedule-date"></label><label>Английский<select id="schedule-group"><option value="1">1-я подгруппа</option><option value="2">2-я подгруппа</option></select></label></div><p class="schedule-week-label"></p><div class="schedule-days" role="group" aria-label="Дни недели"></div><h3 id="schedule-day-title"></h3><ul class="schedule-agenda" aria-labelledby="schedule-day-title"></ul><p class="schedule-note">Двухнедельный цикл. Ограничения по учебным неделям указаны у занятий; разовые изменения применяются только к указанным датам и группам.</p><span class="sr-only schedule-status" role="status" aria-live="polite"></span><noscript>Для переключения дней включите JavaScript.</noscript><script id="schedule-data" type="application/json">${scheduleData.replace(/</g, '\\u003c')}</script></section>`;
writePage('', 'Расписание и дисциплины', 'Расписание, карта ЧелГУ и конспекты первого семестра.', `<div class="home-dashboard">${scheduleHtml}<hr class="home-divider"><section class="home-subjects" id="disciplines" aria-labelledby="disciplines-title"><div class="home-section-heading"><h2 id="disciplines-title">Дисциплины</h2></div><div class="subject-grid">${cards}</div></section></div>${updateHtml}`);

writePage('disciplines', 'Дисциплины', 'Конспекты по дисциплинам первого семестра.', `<section class="home-subjects" id="disciplines"><div class="home-section-heading"><h1>Дисциплины</h1></div><div class="subject-grid">${cards}</div></section>`);
writePage('schedule', 'Расписание', 'Расписание первого семестра.', scheduleHtml);
const textbookCards = textbooks.books.map((book) => `<article class="textbook" id="book-${escapeHtml(book.id)}" data-book-id="${escapeHtml(book.id)}"><p class="textbook-subject">${escapeHtml(book.subject)}</p><h2>${escapeHtml(book.title)}</h2><p>${escapeHtml(book.author)}</p><p class="textbook-meta">PDF · ${(book.size / 1048576).toFixed(1)} МБ</p><div class="textbook-actions"><a href="${escapeHtml(book.url)}" class="textbook-online">Открыть онлайн</a><button type="button" class="textbook-offline" disabled>Скачать офлайн</button></div><p class="textbook-status" role="status">Доступен онлайн · офлайн-копия ещё не скачана</p></article>`).join('');
writePage('textbooks', 'Учебники', 'Учебники в PDF для онлайн- и офлайн-чтения.', `<link rel="stylesheet" href="/assets/textbooks.css"><section id="textbook-library"><h1>Учебники</h1><p>Открывайте PDF онлайн или сохраните нужную книгу для чтения без сети. Скачивание начинается только по вашей кнопке.</p><div class="textbook-list">${textbookCards || '<p>Учебники ещё не добавлены.</p>'}</div><noscript>Для сохранения офлайн включите JavaScript. Ссылки на PDF доступны без него.</noscript></section><script id="textbook-data" type="application/json">${JSON.stringify(textbooks).replace(/</g, '\\u003c')}</script><script defer src="/assets/textbooks.js"></script>`);
buildToolPages(writePage, interfaceIcons);
for (const [route, title] of [['bookmarks', 'Закладки'], ['settings', 'Настройки']]) {
    writePage(route, title, title + ' приложения.', `<h1>${title}</h1><p>Этот раздел доступен в Android-приложении.</p>`);
}

writePage('map', 'Карта ЧелГУ', 'Карта ЧелГУ с поиском кабинетов, этажами и маршрутами.', `<div class="map-page-header"><div class="library-header"><span class="eyebrow">ЧелГУ</span><h1>Карта университета</h1></div><a class="map-source-link" href="/map/view/" target="_blank" rel="noopener noreferrer">Открыть карту отдельно<span class="sr-only"> в новой вкладке</span></a></div><p class="map-description">Выберите кабинет на схеме или найдите его через поиск. Маршрут и ссылки доступны в инструментах карты.</p><div class="campus-map"><iframe src="/map/view/" title="Интерактивная карта ЧелГУ" allow="clipboard-write" allowfullscreen></iframe></div><p class="map-hint">Масштабы корпусов и положение ФОКа уточнены по спутниковому снимку. Наружная схема приблизительная; расстояния в метрах не указаны. Основа — <a href="https://map.csu.ru/" target="_blank" rel="noopener noreferrer">карты ЧелГУ</a> · копия от 09.10.2026.</p><script type="module" src="/assets/campus-map/page.js"></script>`);

const mapView = path.join(output, 'map/view');
fs.mkdirSync(mapView, { recursive: true });
fs.writeFileSync(path.join(mapView, 'index.html'), `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'"><title>Карта ЧелГУ · Конспекты</title><link rel="stylesheet" href="/assets/campus-map/fonts.css"><link rel="stylesheet" href="/assets/campus-map/map.css"><link rel="stylesheet" href="/assets/campus-map/view.css"><script src="/assets/preferences.js"></script><script src="/assets/schedule-overrides.js"></script><script src="/assets/schedule.js"></script><script type="module" src="/assets/campus-map/view.js"></script></head><body><h1 class="visually-hidden">Карта ЧелГУ</h1><div id="root"></div><div id="map-ui"></div><noscript>Для поиска кабинетов и переключения этажей включите JavaScript.</noscript></body></html>`);

function subjectOptions() {
    return '<option value="">Все предметы</option>' + orderedSubjects.filter((s) => !s.external).map((s) => `<option value="${s.slug}">${escapeHtml(s.title)}</option>`).join('');
}

const formulaSubjectOptions = '<option value="">Все предметы</option>' + orderedSubjects
    .filter((subject) => formulaGroups.some((group) => group.slug === subject.slug))
    .map((subject) => `<option value="${subject.slug}">${escapeHtml(subject.title)}</option>`).join('');
const filters = `<div class="catalog-filters" data-catalog-kind="formulas"><label class="sr-only" for="catalog-search">Поиск формул</label><input id="catalog-search" type="search" placeholder="Найти формулу" autocomplete="off"><label class="sr-only" for="subject-filter">Предмет</label><select id="subject-filter">${formulaSubjectOptions}</select><label class="sr-only" for="topic-filter">Раздел формул</label><select id="topic-filter"><option value="">Все разделы</option></select></div><p class="catalog-status" role="status" aria-live="polite"></p>`;
const referenceCards = formulaGroups.map((group) => {
    const sources = group.sources.map((title) => catalog.find((record) => record.subject === group.subject && record.title === title));
    if (sources.some((source) => !source)) {
        throw new Error('Formula source missing: ' + group.title);
    }
    return `<section class="reference-card" data-subject="${group.slug}" data-topic="${group.id}" data-search="${escapeHtml(plain(group.subject + ' ' + group.title + ' ' + group.formulas.join(' ')) + ' ' + group.formulas.join(' '))}"><div class="reference-heading"><span>${escapeHtml(group.subject)}</span><h2>${escapeHtml(group.title)}</h2></div><ul>${group.formulas.map((formula) => `<li>${md(formula)}</li>`).join('')}</ul><a class="reference-source" href="${sources[0].url}">К конспекту</a></section>`;
}).join('');
writePage('reference', 'Формулы', 'Формулы по математическим разделам: пределы, комбинаторика, матрицы и кинематика.', `<div class="library-header"><span class="eyebrow">Справочник</span><h1>Формулы</h1></div>${filters}<div class="reference-list">${referenceCards}</div><p class="catalog-empty" hidden>Совпадений нет.</p>`);

function questionCount(count) {
    const ending = count % 100 >= 11 && count % 100 <= 14 ? 'вопросов' : count % 10 === 1 ? 'вопрос' : count % 10 >= 2 && count % 10 <= 4 ? 'вопроса' : 'вопросов';
    return count + ' ' + ending;
}

const checkFilters = `<div class="catalog-filters"><label class="sr-only" for="catalog-search">Найти тему</label><input id="catalog-search" type="search" placeholder="Найти тему или раздел" autocomplete="off"><label class="sr-only" for="subject-filter">Предмет</label><select id="subject-filter">${subjectOptions()}</select><label class="sr-only" for="topic-filter">Тема</label><select id="topic-filter"><option value="">Все темы</option></select></div><p class="catalog-status" role="status" aria-live="polite"></p>`;
const checkGroups = orderedSubjects.filter((subject) => !subject.external).map((subject) => {
    const records = catalog.filter((record) => record.slug === subject.slug);
    const sections = [...new Set(records.map((record) => record.section))];
    return `<section class="check-subject" data-check-group><h2>${escapeHtml(subject.title)}</h2>${sections.map((section) => {
        const cards = records.filter((record) => record.section === section).map((record) => {
            const variants = [...new Set(record.practice.map((task) => task.variant))];
            const counts = variants.map((variant) => record.practice.filter((task) => task.variant === variant).length);
            const largest = Math.max(...counts);
            const ending = largest % 100 >= 11 && largest % 100 <= 14 ? 'заданий' : largest % 10 === 1 ? 'задание' : largest % 10 >= 2 && largest % 10 <= 4 ? 'задания' : 'заданий';
            const quantity = Math.min(...counts) === Math.max(...counts) ? counts[0] : Math.min(...counts) + '–' + Math.max(...counts);
            return `<a class="check-card" href="/check/${record.slug}/${record.key}/" data-subject="${record.slug}" data-topic="${record.key}" data-search="${escapeHtml(record.subject + ' ' + record.section + ' ' + record.title)}"><h3>${escapeHtml(record.title)}</h3><small>${quantity} ${ending}${variants.length > 1 ? ' · ' + variants.length + ' варианта' : ''} · ${questionCount(record.questions.length)} для повторения</small></a>`;
        }).join('');
        return `<section class="check-section" data-check-group><h3 class="check-section-title">${escapeHtml(section)}</h3><div class="check-grid">${cards}</div></section>`;
    }).join('')}</section>`;
}).join('');
writePage('check', 'Проверка', 'Задания по предметам, разделам и темам: вычисления, сопоставления, доказательства и поиск ошибок.', `<div class="library-header"><span class="eyebrow">По предметам и темам</span><h1>Проверка</h1></div>${checkFilters}<div class="check-catalog">${checkGroups}</div><p class="catalog-empty" hidden>Совпадений нет.</p>`);

for (const record of catalog) {
    const questions = record.questions.map((q, i) => {
        if (q.type === 'choice') {
            const ordered = q.choices.map((text, index) => ({ text, correct: index === q.correct }));
            const shift = parseInt(record.key.slice(-2), 16) % ordered.length;
            const choices = [...ordered.slice(shift), ...ordered.slice(0, shift)];
            return `<fieldset class="question choice-question"><legend><span class="question-number">${i + 1}</span>${marked.parseInline(q.question)}</legend>${choices.map((choice, j) => `<label class="choice-option"><input type="radio" name="question-${i}" value="${j}" data-correct="${choice.correct}"><span>${marked.parseInline(choice.text)}</span></label>`).join('')}<button class="check-answer" type="button">Проверить</button><div class="question-feedback" role="status" aria-live="polite"></div></fieldset>`;
        }
        return `<section class="question recall-question" aria-labelledby="question-${i}"><h2 id="question-${i}"><span class="question-number">${i + 1}</span>${marked.parseInline(q.question)}</h2><details class="recall-answer"><summary>Показать ответ</summary><div>${md(q.answer)}</div></details><div class="recall-rating" hidden><button type="button" data-rating="yes">Вспомнил</button><button type="button" data-rating="no">Нужно повторить</button></div><div class="question-feedback" role="status" aria-live="polite"></div></section>`;
    }).join('');
    writePage(`check/${record.slug}/${record.key}`, record.title + ' · Самопроверка', 'Вопросы по теме: ' + record.title,
        `<div class="quiz-column"><div class="breadcrumbs"><a href="/check/">Самопроверка</a><span>/</span><a href="/notes/${record.slug}/">${escapeHtml(record.subject)}</a></div><article class="note quiz"><header class="note-header"><span class="eyebrow">${escapeHtml(record.subject)}</span><h1>${escapeHtml(record.title)}</h1></header>${renderPractice(record.practice, md, escapeHtml)}<details class="basic-questions"><summary>Вопросы для повторения · ${questionCount(record.questions.length)}</summary><form class="quiz-form">${questions}<div class="quiz-result" role="status" aria-live="polite"></div><div class="quiz-actions"><button class="quiz-reset" type="button">Начать заново</button><a href="${record.url}">Вернуться к теме</a></div></form></details></article></div>`, record.slug);
}

// Keep saved self-check links and downloads usable after topics are joined.
for (const [oldKey, newKey] of Object.entries(quizAliases)) {
    const [subject, oldTitle] = oldKey.split('|');
    const [, newTitle] = newKey.split('|');
    const record = catalog.find((topic) => topic.subject === subject && topic.title === newTitle);
    if (!record) {
        throw new Error('Quiz alias target missing: ' + newKey);
    }
    const destination = `/check/${record.slug}/${record.key}/`;
    writePage(`check/${record.slug}/${topicKey(oldTitle)}`, record.title + ' · Самопроверка', 'Проверка объединённой темы.',
        `<div class="quiz-column"><h1>${escapeHtml(record.title)}</h1><p><a href="${destination}">Открыть самопроверку</a></p><script>location.replace(${JSON.stringify(destination)});</script></div>`, record.slug);
    fs.copyFileSync(path.join(output, 'downloads', record.slug, record.key + '.md'),
        path.join(output, 'downloads', record.slug, topicKey(oldTitle) + '.md'));
}

searchIndex.push({ subject: 'Программирование', slug: 'programming', title: 'Лекции в GitHub',
    text: 'Массивы, списки, возврат нескольких значений, структуры и классы, исключения try catch finally throw, рекурсия и стек вызовов. Программирование C#.', url: github });
fs.writeFileSync(path.join(assets, 'search-index.json'), JSON.stringify(searchIndex));
fs.writeFileSync(path.join(assets, 'widget-stages.js'), 'window.StudyStages=' + JSON.stringify(widgetStages) + ';');
fs.writeFileSync(path.join(assets, 'study-catalog.json'), JSON.stringify(catalog.map(({ subject, slug, title, key }) => ({ subject, slug, title, key }))));
fs.writeFileSync(path.join(root, 'validation-report.json'), JSON.stringify({
    subjects: subjects.map(({ title, slug, topics }) => ({ title, slug, topics })),
    utilityPages: ['', 'reference', 'check', 'map', 'map/view', 'disciplines', 'schedule', 'textbooks', 'bookmarks', 'settings', 'tools', 'tools/notes', 'tools/flowcharts', 'tools/formula-editor', 'tools/calculator', 'tools/graphs', 'tools/converter', 'tools/teachers', 'tools/announcements', 'tools/limits', 'tools/derivatives', 'tools/systems', 'tools/matrices', 'tools/radix', 'tools/venn', 'tools/relations'],
    searchSections: searchIndex.length, mathCount, mathErrors, studyTopics: catalog.length,
    referenceEntries: formulaGroups.reduce((sum, group) => sum + group.formulas.length, 0),
    formulaGroups: formulaGroups.length,
    questions: catalog.reduce((sum, topic) => sum + topic.questions.length, 0),
    practiceTasks: catalog.reduce((sum, topic) => sum + topic.practice.length, 0),
    practiceTypes: [...new Set(Object.values(practice).flat().map((task) => task.type))],
    widgets: Object.values(interactiveTopics).flat().length,
}, null, 2));
console.log(JSON.stringify({ pages: subjects.length + catalog.length + Object.keys(quizAliases).length + 20, searchSections: searchIndex.length, mathCount, mathErrors, studyTopics: catalog.length }));
if (mathErrors.length > 0) {
    process.exitCode = 1;
}
