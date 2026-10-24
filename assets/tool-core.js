(() => {
    'use strict';
    const clone = (value) => JSON.parse(JSON.stringify(value));
    class History {
        constructor(value) { this.items = [clone(value)]; this.index = 0; }
        push(value) {
            if (JSON.stringify(value) === JSON.stringify(this.items[this.index])) { return; }
            this.items = this.items.slice(0, this.index + 1);
            this.items.push(clone(value));
            if (this.items.length > 50) { this.items.shift(); }
            this.index = this.items.length - 1;
        }
        undo() { this.index = Math.max(0, this.index - 1); return clone(this.items[this.index]); }
        redo() { this.index = Math.min(this.items.length - 1, this.index + 1); return clone(this.items[this.index]); }
    }
    const storage = {
        read(key, fallback) {
            try { return JSON.parse(localStorage.getItem(key) || window.StudyNative?.get(key) || 'null') ?? clone(fallback); }
            catch { return clone(fallback); }
        },
        write(key, value) {
            const text = JSON.stringify(value);
            if (new TextEncoder().encode(text).length > 1800000) { throw new Error('Личное хранилище заполнено. Сохраните схемы и заметки файлами.'); }
            localStorage.setItem(key, text);
            window.StudyNative?.put(key, text);
        },
    };
    function compile(input) {
        const source = String(input).toLowerCase().replace(/[−–]/g, '-').replace(/π/g, 'pi')
            .replace(/[×·]/g, '*').replace(/,/g, '.').replace(/\s/g, '');
        if (!source || source.length > 240) { throw new Error('Введите выражение длиной до 240 символов.'); }
        const tokens = source.match(/(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|[a-z]+|[()+*/%^!\-]/g) || [];
        if (tokens.join('') !== source) { throw new Error('В выражении есть неподдерживаемый символ.'); }
        let i = 0;
        let depth = 0;
        const functions = { sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos,
            atan: Math.atan, sqrt: Math.sqrt, ln: Math.log, log: Math.log10, exp: Math.exp,
            abs: Math.abs, floor: Math.floor, ceil: Math.ceil, round: Math.round };
        function atom() {
            if (++depth > 45) { throw new Error('Слишком много вложенных выражений.'); }
            const token = tokens[i++];
            let result;
            if (token === '(') {
                result = sum();
                if (tokens[i++] !== ')') { throw new Error('Не закрыта скобка.'); }
            } else if (token === 'x' || token === 'ans') {
                result = (values) => Number(values[token] ?? 0);
            } else if (token === 'pi' || token === 'e') {
                result = () => token === 'pi' ? Math.PI : Math.E;
            } else if (Object.hasOwn(functions, token)) {
                if (tokens[i++] !== '(') { throw new Error('После функции нужна скобка.'); }
                const argument = sum();
                if (tokens[i++] !== ')') { throw new Error('Не закрыта скобка функции.'); }
                result = (values) => functions[token](argument(values));
            } else if (token && /^(\d|\.)/.test(token)) {
                result = () => Number(token);
            } else { throw new Error('Ожидается число, x или функция.'); }
            while (tokens[i] === '!') {
                i += 1;
                const before = result;
                result = (values) => {
                    const n = before(values);
                    if (!Number.isInteger(n) || n < 0 || n > 170) { return NaN; }
                    let total = 1;
                    for (let k = 2; k <= n; k += 1) { total *= k; }
                    return total;
                };
            }
            depth -= 1;
            return result;
        }
        function power() {
            const left = atom();
            if (tokens[i] === '^') { i += 1; const right = unary(); return (v) => left(v) ** right(v); }
            return left;
        }
        function unary() {
            if (++depth > 45) { throw new Error('Слишком сложное выражение.'); }
            let result;
            if (tokens[i] === '+' || tokens[i] === '-') {
                const sign = tokens[i++] === '-' ? -1 : 1;
                const operand = unary();
                result = (v) => sign * operand(v);
            } else { result = power(); }
            depth -= 1;
            return result;
        }
        function product() {
            let left = unary();
            while (['*', '/', '%'].includes(tokens[i])) {
                const operator = tokens[i++]; const right = unary(); const before = left;
                left = (v) => operator === '*' ? before(v) * right(v)
                    : operator === '/' ? before(v) / right(v) : before(v) % right(v);
            }
            return left;
        }
        function sum() {
            let left = product();
            while (tokens[i] === '+' || tokens[i] === '-') {
                const operator = tokens[i++]; const right = product(); const before = left;
                left = (v) => operator === '+' ? before(v) + right(v) : before(v) - right(v);
            }
            return left;
        }
        const expression = sum();
        if (i !== tokens.length) { throw new Error('Между числами и переменными нужен знак операции.'); }
        return (values = {}) => expression(values);
    }
    const units = {
        'Длина': { 'м': 1, 'км': 1000, 'см': .01, 'мм': .001, 'мкм': 1e-6 },
        'Масса': { 'кг': 1, 'г': .001, 'мг': 1e-6, 'т': 1000 },
        'Площадь': { 'м²': 1, 'см²': 1e-4, 'мм²': 1e-6, 'км²': 1e6, 'га': 1e4 },
        'Объём': { 'м³': 1, 'л': .001, 'мл': 1e-6, 'см³': 1e-6 },
        'Время': { 'с': 1, 'мс': .001, 'мин': 60, 'ч': 3600, 'сут': 86400 },
        'Скорость': { 'м/с': 1, 'км/ч': 1 / 3.6, 'см/с': .01 },
        'Давление': { 'Па': 1, 'кПа': 1000, 'МПа': 1e6, 'бар': 1e5, 'атм': 101325 },
        'Энергия': { 'Дж': 1, 'кДж': 1000, 'МДж': 1e6, 'Вт·ч': 3600, 'кВт·ч': 3.6e6 },
        'Мощность': { 'Вт': 1, 'кВт': 1000, 'МВт': 1e6 },
        'Угол': { 'рад': 1, 'градус': Math.PI / 180, 'оборот': 2 * Math.PI },
        'Информация': { 'байт': 1, 'бит': 1 / 8, 'КБ': 1000, 'МБ': 1e6, 'КиБ': 1024, 'МиБ': 1048576 },
        'Температура': { '°C': 1, 'K': 1, '°F': 1 },
    };
    function convert(value, category, from, to) {
        if (!Number.isFinite(value) || !Object.hasOwn(units[category] || {}, from)
            || !Object.hasOwn(units[category], to)) { throw new Error('Проверьте значение и единицы.'); }
        if (category === 'Температура') {
            const c = from === 'K' ? value - 273.15 : from === '°F' ? (value - 32) / 1.8 : value;
            if (c < -273.15 - 1e-9) { throw new Error('Температура ниже абсолютного нуля.'); }
            return to === 'K' ? c + 273.15 : to === '°F' ? c * 1.8 + 32 : c;
        }
        return value * units[category][from] / units[category][to];
    }
    function validateFlow(raw) {
        if (raw?.format !== 'csu-flowchart' || raw.version !== 1 || !Array.isArray(raw.nodes)
            || !Array.isArray(raw.edges) || raw.nodes.length > 100 || raw.edges.length > 200) {
            throw new Error('Это не файл блок-схемы ЧелГУ версии 1.');
        }
        const ids = new Set();
        const nodes = raw.nodes.map((n) => {
            if (!n || typeof n.id !== 'string' || !/^[a-zA-Z0-9-]{1,60}$/.test(n.id) || ids.has(n.id)
                || !['start', 'end', 'process', 'decision', 'input', 'output'].includes(n.type)
                || typeof n.text !== 'string' || n.text.length > 300
                || !Number.isFinite(n.x) || !Number.isFinite(n.y) || n.x < 5 || n.x > 1020 || n.y < 5 || n.y > 900) {
                throw new Error('Недопустимый или повторяющийся блок.');
            }
            ids.add(n.id);
            return { id: n.id, type: n.type, text: n.text, x: n.x, y: n.y };
        });
        const edges = raw.edges.map((e) => {
            if (!e || !ids.has(e.from) || !ids.has(e.to) || typeof e.label !== 'string' || e.label.length > 50) {
                throw new Error('Связь ссылается на отсутствующий блок.');
            }
            return { from: e.from, to: e.to, label: e.label };
        });
        return { format: 'csu-flowchart', version: 1, title: String(raw.title || 'Блок-схема').slice(0, 120), nodes, edges };
    }
    const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
    function flowSvg(flow, dark = false) {
        const ink = dark ? '#dce6f7' : '#36465e'; const blue = dark ? '#8faaff' : '#254cce';
        const fill = dark ? '#263c67' : '#dce6ff';
        const parts = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1220 1020" role="img" aria-label="${escape(flow.title)}"><title>${escape(flow.title)}</title><defs><marker id="flow-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0L8 4L0 8Z" fill="${ink}"/></marker></defs>`];
        for (const edge of flow.edges) {
            const a = flow.nodes.find((n) => n.id === edge.from); const b = flow.nodes.find((n) => n.id === edge.to);
            let path; let labelX; let labelY;
            if (a.id === b.id) {
                path = `M${a.x + 170} ${a.y + 38}h25v-60h-110v22`;
                labelX = a.x + 190; labelY = a.y - 22;
            } else if (b.y > a.y + 105) {
                const mid = (a.y + 76 + b.y) / 2;
                path = `M${a.x + 85} ${a.y + 76}V${mid}H${b.x + 85}V${b.y}`;
                labelX = (a.x + b.x) / 2 + 93; labelY = mid - 7;
            } else if (b.x >= a.x + 190 || b.x + 190 <= a.x) {
                const right = b.x > a.x;
                const x = a.x + (right ? 170 : 0); const target = b.x + (right ? 0 : 170);
                const mid = (x + target) / 2;
                path = `M${x} ${a.y + 38}H${mid}V${b.y + 38}H${target}`;
                labelX = mid + 8; labelY = (a.y + b.y) / 2 + 30;
            } else {
                const x = Math.max(a.x, b.x) + 195;
                path = `M${a.x + 170} ${a.y + 38}H${x}V${b.y + 38}H${b.x + 170}`;
                labelX = x + 8; labelY = (a.y + b.y) / 2 + 30;
            }
            parts.push(`<path d="${path}" fill="none" stroke="${ink}" stroke-width="2" marker-end="url(#flow-arrow)"/><text x="${labelX}" y="${labelY}" fill="${ink}" font-size="16">${escape(edge.label)}</text>`);
        }
        for (const n of flow.nodes) {
            let shape;
            if (n.type === 'decision') { shape = '<path d="M85 0L170 38L85 76L0 38Z"'; }
            else if (['input', 'output'].includes(n.type)) { shape = '<path d="M16 0H170L154 76H0Z"'; }
            else { shape = `<rect width="170" height="76" rx="${['start', 'end'].includes(n.type) ? 38 : 5}"`; }
            parts.push(`<g data-node="${escape(n.id)}" transform="translate(${n.x} ${n.y})" tabindex="0" role="button" aria-label="${escape(n.text)}">${shape} fill="${fill}" stroke="${blue}" stroke-width="2"/>`);
            const words = n.text.split(/\s+/); const lines = [''];
            for (const word of words) {
                if ((lines[lines.length - 1] + ' ' + word).length > 18 && lines[lines.length - 1]) { lines.push(''); }
                lines[lines.length - 1] += (lines[lines.length - 1] ? ' ' : '') + word;
            }
            lines.slice(0, 3).forEach((line, i) => parts.push(`<text x="85" y="${38 + (i - (Math.min(3, lines.length) - 1) / 2) * 18}" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif" font-size="15" fill="${ink}">${escape(line)}</text>`));
            parts.push('</g>');
        }
        return parts.join('') + '</svg>';
    }
    window.StudyTools = { History, storage, compile, units, convert, validateFlow, flowSvg, escape, clone };
})();
