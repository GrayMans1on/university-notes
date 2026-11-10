import fs from 'node:fs';
import path from 'node:path';

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character]);
}

function subjectList(subjects) {
    return subjects.map((subject) => `<li><span>${escapeHtml(subject.title)}</span><small>${subject.credits} з.е. · ${subject.hours} ч.</small></li>`).join('');
}

export function buildCurriculum(root, writePage) {
    const curriculum = JSON.parse(fs.readFileSync(path.join(root, 'content/curriculum.json'), 'utf8'));
    if (curriculum.schema !== 1 || curriculum.courses.length !== 4 || curriculum.program.totalCredits !== 240) {
        throw new Error('Invalid curriculum catalog');
    }
    const program = curriculum.program;
    const courseCards = curriculum.courses.map((course) => `<article class="curriculum-course"><span>${course.course} курс</span><strong>${course.credits} з.е.</strong><small>${course.semesters.map((credits, index) => `${course.course * 2 - 1 + index} семестр — ${credits}`).join(' · ')}</small></article>`).join('');
    const firstYear = curriculum.firstYear.map((semester) => `<details class="curriculum-semester"${semester.semester === 1 ? ' open' : ''}><summary><span>${semester.semester} семестр</span><strong>${semester.credits} з.е.</strong></summary><ol>${semester.subjects.map((subject) => `<li>${escapeHtml(subject)}</li>`).join('')}</ol></details>`).join('');
    const groups = curriculum.groups.map((group) => `<section class="curriculum-group"><h2>${escapeHtml(group.title)}</h2><ul>${subjectList(group.subjects)}</ul></section>`).join('');
    const electives = curriculum.electives.map((module, index) => `<article><span>Модуль ${index + 1}</span><ul>${module.map((subject) => `<li>${escapeHtml(subject)}</li>`).join('')}</ul></article>`).join('');
    const content = `<link rel="stylesheet" href="/assets/curriculum.css"><section class="curriculum-page"><div class="curriculum-hero"><div><span class="eyebrow">Учебный план 2026</span><h1>${program.code} · ${escapeHtml(program.title)}</h1><p>${escapeHtml(program.profile)}</p><div class="curriculum-tags"><span>${program.form}</span><span>${program.qualification}</span><span>${program.duration}</span></div></div><div class="curriculum-actions"><a class="curriculum-primary" href="${curriculum.source}" download>Скачать оригинал PDF</a><a href="${curriculum.source}" target="_blank" rel="noopener noreferrer">Открыть оригинал</a></div></div><p class="curriculum-source-note">Официальный подписанный документ ЧелГУ. Представление ниже подготовлено для быстрого чтения; при расхождениях ориентируйтесь на оригинал.</p><div class="curriculum-stats"><article><strong>${program.totalCredits}</strong><span>зачётных единиц</span></article><article><strong>${program.totalHours}</strong><span>академических часов</span></article><article><strong>${curriculum.practice.credits}</strong><span>з.е. практики</span></article><article><strong>${curriculum.attestation.credits}</strong><span>з.е. итоговой аттестации</span></article></div><section><div class="curriculum-heading"><div><span class="eyebrow">Нагрузка</span><h2>По курсам и семестрам</h2></div></div><div class="curriculum-courses">${courseCards}</div></section><section><div class="curriculum-heading"><div><span class="eyebrow">Текущий курс</span><h2>Первый год обучения</h2></div><p>Дисциплины показаны в порядке учебного плана.</p></div><div class="curriculum-semesters">${firstYear}</div></section><section><div class="curriculum-heading"><div><span class="eyebrow">Каталог</span><h2>Дисциплины программы</h2></div><p>Объём указан за весь период изучения дисциплины.</p></div><div class="curriculum-groups">${groups}</div></section><section><div class="curriculum-heading"><div><span class="eyebrow">Выбор</span><h2>Элективные модули</h2></div><p>В каждом модуле выбирается одна из предложенных дисциплин.</p></div><div class="curriculum-electives">${electives}</div></section><section class="curriculum-final"><article><span>Практика</span><strong>${curriculum.practice.credits} з.е. · ${curriculum.practice.hours} ч.</strong><p>Учебная и производственная практики, включая преддипломную.</p></article><article><span>Государственная итоговая аттестация</span><strong>${curriculum.attestation.credits} з.е. · ${curriculum.attestation.hours} ч.</strong><p>Завершение образовательной программы.</p></article></section></section>`;
    writePage('curriculum', 'Учебный план', 'Учебный план направления 09.03.04 по курсам, дисциплинам и объёму обучения.', content);
}
