import fs from 'node:fs';
export const toolPages = [
    ['notes', 'Личные заметки', 'Записи сохраняются на этом устройстве.', 'menu_book'],
    ['flowcharts', 'Блок-схемы', 'Создание, редактирование и файлы схем.', 'account_tree'],
    ['formula-editor', 'Редактор формул', 'Формулы LaTeX с предпросмотром.', 'function'],
    ['calculator', 'Калькулятор', 'Научные функции и история вычислений.', 'atm'],
    ['graphs', 'Графики функций', 'Несколько функций на одной координатной плоскости.', 'grid_on'],
    ['converter', 'Конвертер единиц', 'Величины и согласованные единицы измерения.', 'memory'],
    ['teachers', 'Преподаватели', 'Дисциплины, кафедры и описания.', 'groups'],
    ['announcements', 'Объявления', 'Сообщения старосты и важная информация.', 'menu'],
];
export function buildToolPages(writePage, icons) {
    const cards = [['/map/', 'Карта ЧелГУ', 'Кабинеты, этажи и маршруты.', 'map'],
        ...toolPages.map(([id, title, text, icon]) => ['/tools/' + id + '/', title, text, icon]),
        ['/reference/', 'Формулы', 'Справочник по дисциплинам.', 'function'],
        ['/check/', 'Самопроверка', 'Задания и вопросы для повторения.', 'checkroom']];
    const links = cards.map(([url, title, text, icon]) => `<a class="tool-card" href="${url}"><span class="tool-card-icon" aria-hidden="true">${icons[icon] || fs.readFileSync('assets/material-icons/' + icon + '.svg', 'utf8').replace('<svg ', '<svg fill="currentColor" ')}</span><span><strong>${title}</strong><small>${text}</small></span></a>`).join('');
    writePage('tools', 'Доп. функции', 'Карта и учебные инструменты.', `<section class="study-tools"><h1>Доп. функции</h1><div class="tools-grid">${links}</div></section>`);
    for (const [id, title, description] of toolPages) {
        writePage('tools/' + id, title, description, `<section class="study-tools" data-study-tool="${id}"><div class="breadcrumbs"><a href="/tools/">Доп. функции</a><span>/</span><span>${title}</span></div><h1>${title}</h1><div id="tool-root"></div>${id === 'formula-editor' ? '<script defer src="/assets/katex.min.js"></script>' : ''}<p id="tool-status" role="status" aria-live="polite"></p><noscript>Для работы инструмента включите JavaScript.</noscript></section>`);
    }
}
