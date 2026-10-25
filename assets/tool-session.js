(() => {
    'use strict';
    class Session {
        constructor(save) {
            this.dirty = false; this.save = save; this.leaving = false; this.pending = null;
            window.addEventListener('beforeunload', (event) => {
                if (this.dirty && !this.leaving) { event.preventDefault(); event.returnValue = ''; }
            });
            document.addEventListener('click', (event) => {
                const link = event.target.closest('a[href]');
                if (!this.dirty || !link || event.defaultPrevented || event.button !== 0 || event.ctrlKey
                    || event.metaKey || event.shiftKey || event.altKey || link.hasAttribute('download')
                    || (link.target && link.target !== '_self')) { return; }
                const target = new URL(link.href, location.href);
                if (!['http:', 'https:'].includes(target.protocol)
                    || (target.pathname === location.pathname && target.search === location.search)) { return; }
                event.preventDefault(); event.stopImmediatePropagation();
                this.replace(() => { this.leaving = true; location.assign(target.href); });
            }, true);
            window.StudyActiveSession = this;
        }
        changed() { this.dirty = true; this.update(); }
        saved() { this.dirty = false; this.update(); }
        update() {
            const status = document.getElementById('session-status');
            if (status) { status.textContent = this.dirty ? 'Есть несохранённые изменения' : 'Рабочие данные — в этой вкладке'; }
        }
        async replace(action) {
            if (!this.dirty) { action(); return true; }
            if (this.pending) { return false; }
            const { element, button, row, say } = window.StudyToolUI;
            const dialog = element('dialog', undefined, 'tool-leave-dialog');
            dialog.setAttribute('aria-label', 'Несохранённая работа');
            dialog.append(element('h2', 'Сохранить работу перед выходом?'),
                element('p', 'Документ хранится только в памяти этой вкладки. Сохраните файл, чтобы открыть его позже.'));
            const result = await new Promise((resolve) => {
                this.pending = resolve;
                const finish = (value) => { this.pending = null; dialog.close?.(); dialog.remove(); resolve(value); };
                dialog.append(row(button('Сохранить файл и продолжить', async () => {
                    try { await this.save(); this.saved(); finish(true); } catch (error) { say(error.message); }
                }, 'primary'), button('Уйти без сохранения', () => finish(true)), button('Остаться', () => finish(false))));
                dialog.addEventListener('cancel', (event) => { event.preventDefault(); finish(false); });
                document.body.append(dialog); dialog.showModal();
            });
            if (result) { this.saved(); action(); }
            return result;
        }
    }
    function files(root, options) {
        const { element, button, row, exportFile, say } = window.StudyToolUI;
        const session = new Session(async () => {
            const value = options.validate(options.get());
            exportFile(options.filename, 'application/json', JSON.stringify(value, null, 2));
        });
        const file = element('input'); file.type = 'file'; file.accept = options.extension + ',.json,application/json'; file.hidden = true;
        file.addEventListener('change', async () => {
            try {
                const source = file.files[0]; if (!source) { return; }
                if (source.size > 1000000) { throw new Error('Размер документа превышает 1 МБ.'); }
                const value = options.validate(JSON.parse((await source.text()).replace(/^\uFEFF/, '')));
                await session.replace(() => { options.set(value); session.saved(); say('Документ открыт из файла.'); });
            } catch (error) { say('Не удалось открыть документ: ' + error.message); }
            finally { file.value = ''; }
        });
        const status = element('span', '', 'tool-help'); status.id = 'session-status';
        const toolbar = row(button('Сохранить файл', async () => { await session.save(); session.saved(); }),
            button('Открыть файл', () => file.click()), status);
        toolbar.classList.add('session-toolbar'); root.append(toolbar, file); session.update();
        if (options.legacy) {
            const legacy = options.legacy();
            if (legacy.length) {
                const details = element('details', undefined, 'legacy-documents');
                details.append(element('summary', 'Прежние локальные документы (' + legacy.length + ')'),
                    element('p', 'Старые записи сохранены в браузере. Их можно открыть и выгрузить в файл; новые изменения автоматически не записываются.', 'tool-help'));
                for (const item of legacy) {
                    details.append(button(item.title || 'Документ', async () => {
                        const value = options.validate(item.value);
                        await session.replace(() => { options.set(value); session.changed(); });
                    }), button('Скачать прежний документ', () => {
                        exportFile('previous' + options.extension, 'application/json', JSON.stringify(item.value, null, 2));
                    }));
                }
                root.append(details);
            }
        }
        return session;
    }
    window.StudySessions = { Session, files };
})();
