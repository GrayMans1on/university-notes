(() => {
    'use strict';
    const validName = (name) => /^[a-z][a-z0-9_]{0,30}$/.test(name)
        && !['constructor', 'prototype', '__proto__', 'pi', 'e', 'ans'].includes(name);
    const comparisons = { '>': (a, b) => a > b, '<': (a, b) => a < b, '>=': (a, b) => a >= b,
        '<=': (a, b) => a <= b, '==': (a, b) => a === b, '!=': (a, b) => a !== b };
    function statements(text) {
        if (typeof text !== 'string' || text.length > 6000) { throw new Error('Блок действий превышает 6000 символов.'); }
        const lines = text.split(/\r?\n|;/).map((line) => line.replace(/#.*/, '').trim()).filter(Boolean);
        if (!lines.length || lines.length > 80) { throw new Error('Введите от 1 до 80 команд присваивания.'); }
        return lines.map((line, index) => {
            const match = /^([a-z][a-z0-9_]*)\s*(\*\*=|\/\/=|[+*/%\-]?=)\s*(.+)$/.exec(line);
            if (!match || !validName(match[1])) { throw new Error('Строка ' + (index + 1) + ': требуется присваивание, например a = a * 2.'); }
            return { name: match[1], operator: match[2], expression: match[3], fn: window.StudyTools.compile(match[3]) };
        });
    }
    function execute(text, scope) {
        const next = Object.assign(Object.create(null), scope);
        for (const statement of statements(text)) {
            let value = statement.fn(next); const name = statement.name;
            if (statement.operator !== '=') {
                if (!Object.hasOwn(next, name)) { throw new Error('Не задана переменная ' + name); }
                const left = next[name];
                const operations = { '+=': () => left + value, '-=': () => left - value, '*=': () => left * value,
                    '/=': () => left / value, '//=': () => Math.floor(left / value), '**=': () => left ** value,
                    '%=': () => left - Math.floor(left / value) * value };
                value = operations[statement.operator]();
            }
            if (!Number.isFinite(value)) { throw new Error('Не определён результат присваивания ' + name); }
            next[name] = value;
        }
        Object.assign(scope, next);
    }
    class Runner {
        constructor(document) {
            this.document = window.StudyTools.validateFlow(document);
            const starts = this.document.nodes.filter((node) => node.type === 'start');
            if (starts.length !== 1) { throw new Error('В схеме должен быть ровно один блок «Начало».'); }
            this.next = starts[0].id; this.variables = Object.create(null); this.output = [];
            this.steps = 0; this.done = false; this.waiting = null; this.current = null;
        }
        evaluate(text) {
            const result = window.StudyTools.compile(text)(this.variables);
            if (!Number.isFinite(result)) { throw new Error('Результат не определён: ' + text); }
            return result;
        }
        provide(values) {
            if (!this.waiting) { throw new Error('Схема не ожидает ввода.'); }
            const result = {};
            for (const name of this.waiting.variables) {
                if (String(values[name] ?? '').trim() === '') { throw new Error('Введите значение ' + name); }
                const number = Number(String(values[name]).replace(',', '.'));
                if (!Number.isFinite(number)) { throw new Error('Для ' + name + ' требуется конечное число.'); }
                result[name] = number;
            }
            Object.assign(this.variables, result); this.waiting = null; this.follow(this.current);
        }
        follow(node, branch) {
            let edges = this.document.edges.filter((edge) => edge.from === node.id);
            if (node.type === 'decision') {
                const yes = ['да', 'true', '1']; const no = ['нет', 'false', '0'];
                const yesEdges = edges.filter((edge) => yes.includes(edge.label.toLowerCase().trim()));
                const noEdges = edges.filter((edge) => no.includes(edge.label.toLowerCase().trim()));
                if (edges.length !== 2 || yesEdges.length !== 1 || noEdges.length !== 1) {
                    throw new Error('У условия нужны ровно две стрелки: «Да» и «Нет».');
                }
                edges = branch ? yesEdges : noEdges;
            }
            if (edges.length !== 1) { throw new Error('Из блока «' + node.text + '» должна выходить одна стрелка.'); }
            this.next = edges[0].to;
        }
        step() {
            if (this.done || this.waiting) { return; }
            if (++this.steps > 10000) { throw new Error('Выполнение остановлено после 10 000 шагов: проверьте цикл.'); }
            const node = this.document.nodes.find((item) => item.id === this.next);
            if (!node) { throw new Error('Не найден следующий блок.'); }
            this.current = node; const config = node.config || {}; let branch;
            if (node.type === 'end') { this.done = true; this.next = null; return; }
            if (node.type === 'input') {
                const variables = (config.variable || '').split(',').map((name) => name.trim());
                if (!variables.length || variables.length > 20 || !variables.every(validName)
                    || new Set(variables).size !== variables.length) {
                    throw new Error('Укажите разные имена переменных: a, b, radius. Используйте латинские строчные буквы.');
                }
                this.waiting = { variables }; return;
            }
            if (node.type === 'process' && config.program !== undefined) {
                execute(config.program, this.variables);
            }
            if (node.type === 'process' && config.program === undefined) {
                if (!validName(config.variable || '')) { throw new Error('Задайте переменную результата в блоке вычисления.'); }
                const operation = config.operation || 'expression'; let value;
                if (operation === 'expression') { value = this.evaluate(config.expression || ''); }
                else {
                    const left = this.evaluate(config.left || '');
                    if (['+', '-', '*', '/', '^', '%'].includes(operation)) {
                        const right = this.evaluate(config.right || '');
                        const operations = { '+': () => left + right, '-': () => left - right, '*': () => left * right,
                            '/': () => left / right, '^': () => left ** right, '%': () => left % right };
                        value = operations[operation]();
                    } else if (['sqrt', 'sin', 'cos', 'tan', 'ln', 'log', 'exp', 'abs'].includes(operation)) {
                        value = this.evaluate(operation + '(' + config.left + ')');
                    } else { throw new Error('Неизвестная операция.'); }
                }
                if (!Number.isFinite(value)) { throw new Error('Результат вычисления не определён.'); }
                this.variables[config.variable] = value;
            }
            if (node.type === 'decision') {
                if (!Object.hasOwn(comparisons, config.operator)) { throw new Error('Выберите сравнение в условии.'); }
                branch = comparisons[config.operator](this.evaluate(config.left || ''), this.evaluate(config.right || ''));
            }
            if (node.type === 'output') {
                const expression = config.expression || '';
                this.output.push({ label: expression, value: this.evaluate(expression) });
            }
            this.follow(node, branch);
        }
    }
    window.StudyFlow = { Runner, validName, statements, execute };
})();
