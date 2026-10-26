import fs from 'node:fs';
export const toolPages = [
    ['notes', 'Личные заметки', 'Записи сохраняются на этом устройстве.', 'menu_book'],
    ['flowcharts', 'Блок-схемы', 'Создание, запуск и файлы алгоритмов.', 'account_tree'],
    ['calculator', 'Калькулятор и формулы', 'Математический блокнот, значения и переменные.', 'calculate'],
    ['limits', 'Пределы с решением', 'Пошаговый символьный разбор пределов.', 'function'],
    ['derivatives', 'Производные', 'Табличные правила и пошаговое дифференцирование.', 'function'],
    ['systems', 'Системы уравнений', 'Метод Гаусса, свободные переменные и проверка.', 'account_tree'],
    ['matrices', 'Матрицы', 'Определители и обратные матрицы с точными дробями.', 'grid_on'],
    ['radix', 'Системы счисления', 'Перевод и арифметика столбиком в основаниях 2–36.', 'swap_vert'],
    ['venn', 'Диаграммы Эйлера — Венна', 'Множества, операции и редактируемые диаграммы.', 'groups'],
    ['relations', 'Бинарные отношения', 'Список, матрица, граф и график одного отношения.', 'account_tree'],
    ['graphs', 'Графики функций', 'Несколько функций на одной координатной плоскости.', 'show_chart'],
    ['converter', 'Конвертер единиц', 'Величины и согласованные единицы измерения.', 'swap_vert'],
    ['teachers', 'Преподаватели', 'Дисциплины, описание и замечания.', 'groups'],
    ['announcements', 'Объявления', 'Сообщения старосты и важная информация.', 'campaign'],
];
export function buildToolPages(writePage, icons) {
    const cards = [['/map/', 'Карта ЧелГУ', 'Кабинеты, этажи и маршруты.', 'map'],
        ...toolPages.map(([id, title, text, icon]) => ['/tools/' + id + '/', title, text, icon]),
        ['/reference/', 'Формулы', 'Справочник по дисциплинам.', 'calculate'],
        ['/check/', 'Самопроверка', 'Задания и вопросы для повторения.', 'fact_check']];
    const links = cards.map(([url, title, text, icon]) => `<a class="tool-card" href="${url}"><span class="tool-card-icon" aria-hidden="true">${icons[icon] || fs.readFileSync('assets/material-icons/' + icon + '.svg', 'utf8').replace('<svg ', '<svg fill="currentColor" ')}</span><span><strong>${title}</strong><small>${text}</small></span></a>`).join('');
    writePage('tools', 'Доп. функции', 'Карта и учебные инструменты.', `<section class="study-tools"><h1>Доп. функции</h1><div class="tools-grid">${links}</div></section>`);
    for (const [id, title, description] of [...toolPages, ['formula-editor', 'Калькулятор и формулы', 'Совместимый адрес математического блокнота.']]) {
        writePage('tools/' + id, title, description, `<section class="study-tools" data-study-tool="${id}"><div class="breadcrumbs"><a href="/tools/">Доп. функции</a><span>/</span><span>${title}</span></div><h1>${title}</h1><div id="tool-root"></div><p id="tool-status" role="status" aria-live="polite"></p><noscript>Для работы инструмента включите JavaScript.</noscript></section>`);
    }
}
