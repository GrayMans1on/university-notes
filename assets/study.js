(() => {
    const settings = window.StudyPreferences.get();
    for (const [id, field] of [['theme-mode', 'theme'], ['font-scale', 'scale'], ['reading-width', 'width']]) {
        const control = document.getElementById(id);
        control.value = settings[field];
        control.addEventListener('change', () => window.StudyPreferences.set(field, control.value));
    }
    const topbar = document.querySelector('.topbar');
    function measureHeader() {
        document.documentElement.style.setProperty('--topbar-height', topbar.getBoundingClientRect().height + 'px');
    }
    measureHeader();
    if ('ResizeObserver' in window) {
        new ResizeObserver(measureHeader).observe(topbar);
    }
    document.addEventListener('click', (event) => {
        const settingsPanel = document.querySelector('.reading-settings');
        if (!settingsPanel.contains(event.target)) {
            settingsPanel.open = false;
        }
        document.querySelectorAll('.export-control').forEach((control) => {
            if (!control.contains(event.target)) {
                control.open = false;
            }
        });
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            document.querySelectorAll('.reading-settings, .export-control').forEach((control) => {
                control.open = false;
            });
        }
    });

    const catalogSearch = document.getElementById('catalog-search');
    const subjectFilter = document.getElementById('subject-filter');
    const topicFilter = document.getElementById('topic-filter');
    if (catalogSearch && subjectFilter) {
        const cards = [...document.querySelectorAll('.reference-card, .check-card')];
        const initial = new URLSearchParams(location.search);
        if ([...subjectFilter.options].some((option) => option.value === initial.get('subject'))) {
            subjectFilter.value = initial.get('subject');
        }
        function setTopicOptions(desired = '') {
            if (!topicFilter) {
                return;
            }
            const isReference = Boolean(document.querySelector('[data-catalog-kind="formulas"]'));
            topicFilter.replaceChildren(new Option(isReference ? 'Все разделы' : 'Все темы', ''));
            for (const card of cards) {
                if (!subjectFilter.value || card.dataset.subject === subjectFilter.value) {
                    topicFilter.add(new Option(card.querySelector('h2, h3').textContent, card.dataset.topic));
                }
            }
            if ([...topicFilter.options].some((option) => option.value === desired)) {
                topicFilter.value = desired;
            }
        }
        function filterCatalog() {
            let count = 0;
            for (const card of cards) {
                card.hidden = Boolean((subjectFilter.value && card.dataset.subject !== subjectFilter.value)
                    || (topicFilter?.value && card.dataset.topic !== topicFilter.value)
                    || !window.StudySearch.matches(card.dataset.search, catalogSearch.value));
                if (!card.hidden) {
                    count += 1;
                }
            }
            const groups = [...document.querySelectorAll('[data-check-group]')].reverse();
            groups.forEach((group) => {
                group.hidden = ![...group.querySelectorAll('.check-card')].some((card) => !card.hidden);
            });
            const label = document.querySelector('[data-catalog-kind="formulas"]') ? 'Разделов: ' : 'Тем: ';
            document.querySelector('.catalog-status').textContent = label + count;
            document.querySelector('.catalog-empty').hidden = count !== 0;
            const query = new URLSearchParams();
            if (subjectFilter.value) {
                query.set('subject', subjectFilter.value);
            }
            if (topicFilter?.value) {
                query.set('topic', topicFilter.value);
            }
            history.replaceState(null, '', location.pathname + (query.size ? '?' + query : ''));
        }
        setTopicOptions(initial.get('topic'));
        filterCatalog();
        subjectFilter.addEventListener('change', () => {
            setTopicOptions();
            filterCatalog();
        });
        topicFilter?.addEventListener('change', filterCatalog);
        catalogSearch.addEventListener('input', filterCatalog);
    }

    const quiz = document.querySelector('.quiz-form');
    if (quiz) {
        function showResult() {
            const choices = [...quiz.querySelectorAll('.choice-question')];
            const recalls = [...quiz.querySelectorAll('.recall-question')];
            const scored = choices.filter((q) => q.dataset.result);
            const rated = recalls.filter((q) => q.dataset.result);
            const correct = scored.filter((q) => q.dataset.result === 'yes').length;
            const remembered = rated.filter((q) => q.dataset.result === 'yes').length;
            quiz.querySelector('.quiz-result').textContent = !scored.length && !rated.length ? ''
                : `Выбор ответа: ${correct} из ${choices.length}; проверено ${scored.length}. Самооценка: вспомнил ${remembered} из ${recalls.length}; оценено ${rated.length}.`;
        }
        quiz.addEventListener('submit', (event) => event.preventDefault());
        quiz.querySelectorAll('.choice-question').forEach((question) => {
            question.querySelector('.check-answer').addEventListener('click', () => {
                const selected = question.querySelector('input:checked');
                const feedback = question.querySelector('.question-feedback');
                if (!selected) {
                    feedback.textContent = 'Выбери один ответ.';
                    return;
                }
                const correct = selected.dataset.correct === 'true';
                question.dataset.result = correct ? 'yes' : 'no';
                selected.closest('label').classList.add(correct ? 'choice-correct' : 'choice-wrong');
                feedback.replaceChildren(document.createTextNode(correct ? 'Верно.' : 'Неверно. Правильный ответ: '));
                if (!correct) {
                    const answer = question.querySelector('input[data-correct="true"]').closest('label');
                    answer.classList.add('choice-correct');
                    feedback.append(answer.querySelector('span').cloneNode(true));
                }
                question.disabled = true;
                showResult();
            });
        });
        quiz.querySelectorAll('.recall-question').forEach((question) => {
            question.querySelector('details').addEventListener('toggle', (event) => {
                question.querySelector('.recall-rating').hidden = !event.target.open;
            });
            question.querySelectorAll('[data-rating]').forEach((button) => {
                button.addEventListener('click', () => {
                    question.dataset.result = button.dataset.rating;
                    question.querySelectorAll('[data-rating]').forEach((item) => {
                        item.setAttribute('aria-pressed', String(item === button));
                    });
                    question.querySelector('.question-feedback').textContent = button.dataset.rating === 'yes'
                        ? 'Ответ вспомнил.' : 'Эту тему нужно повторить.';
                    showResult();
                });
            });
        });
        quiz.querySelector('.quiz-reset').addEventListener('click', () => {
            quiz.reset();
            quiz.querySelectorAll('.question').forEach((question) => {
                delete question.dataset.result;
                question.disabled = false;
                question.querySelector('.question-feedback').replaceChildren();
                question.querySelectorAll('.choice-correct, .choice-wrong').forEach((label) => {
                    label.classList.remove('choice-correct', 'choice-wrong');
                });
                question.querySelectorAll('[aria-pressed]').forEach((button) => button.removeAttribute('aria-pressed'));
                const disclosure = question.querySelector('details');
                if (disclosure) {
                    disclosure.open = false;
                }
            });
            showResult();
            quiz.querySelector('input, button').focus();
        });
    }

    let disclosures = [];
    let printing = false;
    function preparePrint() {
        if (printing) {
            return;
        }
        printing = true;
        disclosures = [...document.querySelectorAll('.proof, .recall-answer, .practice-example')]
            .map((node) => ({ node, open: node.open }));
        disclosures.forEach(({ node }) => { node.open = true; });
    }
    window.addEventListener('beforeprint', preparePrint);
    window.addEventListener('afterprint', () => {
        disclosures.forEach(({ node, open }) => { node.open = open; });
        printing = false;
        disclosures = [];
        document.body.classList.remove('print-single');
        document.querySelector('.print-target')?.classList.remove('print-target');
    });
    document.querySelectorAll('.print-button').forEach((button) => {
        button.addEventListener('click', () => {
            const key = button.dataset.printTopic;
            if (key) {
                const target = [...document.querySelectorAll('.topic')].find((topic) => topic.dataset.topicKey === key);
                target.classList.add('print-target');
                document.body.classList.add('print-single');
            }
            window.print();
        });
    });

    const images = document.querySelectorAll('.diagram-link');
    if (images.length && typeof HTMLDialogElement !== 'undefined') {
        const dialog = document.createElement('dialog');
        dialog.className = 'diagram-dialog';
        dialog.innerHTML = '<div class="diagram-dialog-bar"><span>Рисунок</span><label>Масштаб <input type="range" min="100" max="300" step="25" value="100"></label><button type="button">Закрыть</button></div><div class="diagram-dialog-scroll"></div>';
        document.body.append(dialog);
        const preview = dialog.querySelector('.diagram-dialog-scroll');
        const scale = dialog.querySelector('input');
        scale.addEventListener('input', () => { preview.children[0].style.width = scale.value + '%'; });
        dialog.querySelector('button').addEventListener('click', () => dialog.close());
        dialog.addEventListener('click', (event) => {
            if (event.target === dialog) {
                dialog.close();
            }
        });
        images.forEach((link) => {
            link.addEventListener('click', (event) => {
                if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
                    return;
                }
                event.preventDefault();
                const source = link.querySelector('svg, img');
                const picture = source.cloneNode(true);
                for (const node of [picture, ...picture.querySelectorAll('[id], [mask], [clip-path], [marker-end], [marker-start], [marker-mid], [aria-labelledby], [href], use')]) {
                    if (node.id) {
                        node.setAttribute('id', 'zoom-' + node.id);
                    }
                    for (const attribute of ['mask', 'clip-path', 'marker-end', 'marker-start', 'marker-mid', 'aria-labelledby']) {
                        const value = node.getAttribute(attribute);
                        if (value) {
                            node.setAttribute(attribute, attribute === 'aria-labelledby'
                                ? value.split(' ').map((id) => 'zoom-' + id).join(' ')
                                : value.replace(/url\(#([^)]+)\)/g, (_, id) => 'url(#zoom-' + id + ')'));
                        }
                    }
                    for (const attribute of ['href', 'xlink:href']) {
                        const value = node.getAttribute(attribute);
                        if (value?.startsWith('#')) node.setAttribute(attribute, '#zoom-' + value.slice(1));
                    }
                }
                preview.replaceChildren(picture);
                picture.style.width = '100%';
                scale.value = '100';
                dialog.showModal();
            });
        });
    }
})();
