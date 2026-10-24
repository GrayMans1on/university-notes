(() => {
    'use strict';
    function init() {
        const T = window.StudyTools; const W = window.StudyWorkspace;
        if (!T || !W) { return; }
        const make = (tag, text, className = '') => {
            const node = document.createElement(tag); node.className = className;
            if (text !== undefined) { node.textContent = text; } return node;
        };
        const button = (text, action) => {
            const node = make('button', text, 'reader-action'); node.type = 'button'; node.addEventListener('click', action); return node;
        };
        const article = document.querySelector('article.note:not(.quiz)');
        if (article) {
            const controls = make('div', undefined, 'reader-actions');
            const exit = button('Выйти из режима чтения', () => setReading(false)); exit.classList.add('reading-exit'); exit.hidden = true;
            function setReading(value) {
                document.body.classList.toggle('reading-mode', value); exit.hidden = !value;
                if (value) { exit.focus(); } else { mode.focus(); }
            }
            const mode = button('Режим чтения', () => setReading(true));
            document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !exit.hidden) { setReading(false); } });
            const status = make('span', '', 'tool-help'); status.setAttribute('role', 'status');
            const list = make('details'); list.append(make('summary', 'Мои выделения'));
            const markList = make('div'); list.append(markList);
            controls.append(mode, list, status); article.querySelector('.note-header').after(controls); document.body.append(exit);
            const selectionTools = make('div', undefined, 'selection-tools'); selectionTools.hidden = true;
            selectionTools.setAttribute('aria-label', 'Выделение текста'); document.body.append(selectionTools);
            let pending = null; let highlights = W.read().highlights; const history = new T.History(highlights);
            const undo = button('Отменить выделение', () => restore(history.undo()));
            const redo = button('Повторить выделение', () => restore(history.redo())); controls.append(undo, redo);
            function state() { undo.disabled = history.index === 0; redo.disabled = history.index === history.items.length - 1; }
            function textNodes(scope) {
                const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
                const nodes = []; let node;
                while ((node = walker.nextNode())) {
                    if (!node.parentElement.closest('button,summary,.topic-summary,.topic-tools,.app-bookmark,.katex,svg,script,style,.interactive,.reader-actions')) { nodes.push(node); }
                }
                return nodes;
            }
            function restore(value) {
                try { W.save('highlights', value); highlights = value; apply(); state(); }
                catch (error) { status.textContent = 'Не удалось сохранить выделения: ' + error.message; }
            }
            function persist(next) {
                W.save('highlights', next); highlights = next; history.push(next); state(); apply();
            }
            function apply() {
                for (const mark of article.querySelectorAll('mark.user-highlight')) {
                    const parent = mark.parentNode; mark.replaceWith(...mark.childNodes); parent.normalize();
                }
                const local = highlights.filter((mark) => mark.path === location.pathname);
                for (const mark of local) {
                    const scope = [...article.querySelectorAll('section.topic')].find((s) => s.dataset.topicKey === mark.scope);
                    if (!scope) { continue; }
                    const nodes = textNodes(scope); const text = nodes.map((n) => n.textContent).join('');
                    let start = mark.start;
                    if (text.slice(start, start + mark.quote.length) !== mark.quote) {
                        const found = text.indexOf(mark.quote);
                        if (found < 0 || text.indexOf(mark.quote, found + 1) >= 0) { continue; }
                        start = found;
                    }
                    const end = start + mark.quote.length; let position = 0;
                    for (const node of nodes) {
                        const length = node.textContent.length; const a = Math.max(0, start - position); const b = Math.min(length, end - position);
                        if (b > a) {
                            const range = document.createRange(); range.setStart(node, a); range.setEnd(node, b);
                            const wrapper = make('mark', undefined, 'user-highlight'); wrapper.dataset.color = mark.color; wrapper.dataset.highlight = mark.id;
                            range.surroundContents(wrapper);
                        }
                        position += length;
                    }
                }
                markList.replaceChildren();
                for (const mark of local) {
                    const row = make('p'); const quote = make('span', mark.quote.slice(0, 130));
                    row.append(quote, button('Убрать', () => {
                        try { persist(highlights.filter((m) => m.id !== mark.id)); } catch (e) { status.textContent = e.message; }
                    })); markList.append(row);
                }
                if (!local.length) { markList.append(make('p', 'Выделений на этой странице пока нет.')); }
            }
            function capture() {
                const selection = window.getSelection();
                if (!selection || selection.isCollapsed || !selection.rangeCount) { selectionTools.hidden = true; pending = null; return; }
                const range = selection.getRangeAt(0);
                const startElement = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
                const endElement = range.endContainer.nodeType === 1 ? range.endContainer : range.endContainer.parentElement;
                const scope = startElement.closest('section.topic');
                if (!scope || endElement.closest('section.topic') !== scope || !article.contains(scope)) { return; }
                const nodes = textNodes(scope); let position = 0; let start; let end;
                for (const node of nodes) {
                    if (range.intersectsNode(node)) {
                        if (start === undefined) { start = position + (range.startContainer === node ? range.startOffset : 0); }
                        end = position + (range.endContainer === node ? range.endOffset : node.textContent.length);
                    }
                    position += node.textContent.length;
                }
                if (start === undefined || end <= start || end - start > 10000) { return; }
                const text = nodes.map((n) => n.textContent).join('');
                pending = { path: location.pathname, scope: scope.dataset.topicKey, start, quote: text.slice(start, end) };
                selectionTools.hidden = false;
            }
            for (const [color, title] of [['yellow', 'Жёлтый'], ['green', 'Зелёный'], ['blue', 'Синий'], ['pink', 'Розовый']]) {
                const item = button(title, () => {
                    if (!pending) { return; }
                    try {
                        const record = { ...pending, id: 'highlight-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), color };
                        persist([...highlights, record]); status.textContent = 'Выделение сохранено на устройстве.';
                        selectionTools.hidden = true; pending = null; window.getSelection().removeAllRanges();
                    } catch (e) { status.textContent = 'Не удалось сохранить: ' + e.message; }
                });
                item.dataset.color = color; item.addEventListener('pointerdown', (event) => event.preventDefault()); selectionTools.append(item);
            }
            selectionTools.append(button('Закрыть', () => { selectionTools.hidden = true; }));
            document.addEventListener('mouseup', (event) => { if (!selectionTools.contains(event.target)) { capture(); } });
            document.addEventListener('keyup', capture);
            let timer;
            document.addEventListener('selectionchange', () => {
                clearTimeout(timer); timer = setTimeout(() => { if (!selectionTools.contains(document.activeElement)) { capture(); } }, 250);
            });
            state(); apply();
        }
        async function books() {
            const isLibrary = document.getElementById('textbook-library'); const isSubject = document.querySelector('body.reader-page article.note:not(.quiz)');
            if (!isLibrary && !isSubject) { return; }
            const response = await fetch('/assets/tool-catalog.json'); if (!response.ok) { return; }
            const data = await response.json();
            const defaultSubjects = { 'cudravcev-1': ['calculus'], berman: ['calculus'], kostrikin: ['linear-algebra'], infotech: ['english'] };
            const selected = (id) => W.read().bookBindings[id] ?? defaultSubjects[id] ?? [];
            if (isLibrary) {
                for (const card of document.querySelectorAll('.textbook[data-book-id]')) {
                    const id = card.dataset.bookId; const details = make('details'); details.append(make('summary', 'Привязка к дисциплинам'));
                    const inputs = [];
                    for (const subject of data.subjects) {
                        const label = make('label', undefined, 'book-subject-choice'); const input = document.createElement('input'); input.type = 'checkbox';
                        input.value = subject.slug; input.checked = selected(id).includes(subject.slug);
                        label.append(input, document.createTextNode(subject.title)); details.append(label); inputs.push(input);
                    }
                    const status = make('p', '', 'tool-help'); status.setAttribute('role', 'status');
                    details.append(button('Сохранить привязку', () => {
                        try { const bindings = W.read().bookBindings; bindings[id] = inputs.filter((x) => x.checked).map((x) => x.value);
                            W.save('bookBindings', bindings); status.textContent = 'Привязка сохранена на этом устройстве.'; }
                        catch (e) { status.textContent = e.message; }
                    }), status); card.append(details);
                }
            }
            if (isSubject) {
                const subject = data.subjects.find((s) => location.pathname.includes('/notes/' + s.slug + '/'));
                if (!subject) { return; }
                const matching = data.textbooks.filter((b) => selected(b.id).includes(subject.slug));
                const panel = make('aside', undefined, 'tool-book-links'); panel.append(make('h4', 'Учебники по дисциплине'));
                for (const book of matching) {
                    const link = make('a', book.author + ' — ' + book.title); link.href = '/textbooks/#book-' + book.id; panel.append(link);
                }
                if (!matching.length) { panel.append(make('p', 'Выберите учебник и привяжите его к дисциплине в каталоге.')); }
                const all = make('a', 'Каталог и офлайн-скачивание'); all.href = '/textbooks/'; panel.append(all);
                isSubject.querySelector('.note-header').after(panel);
            }
        }
        books().catch(() => {});
    }
    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }
})();
