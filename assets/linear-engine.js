(() => {
    'use strict';
    const abs = (n) => n < 0n ? -n : n;
    function gcd(a, b) { while (b) { [a, b] = [b, a % b]; } return abs(a); }
    class Fraction {
        constructor(n, d = 1n) {
            n = BigInt(n); d = BigInt(d);
            if (!d) { throw new Error('Деление на ноль.'); }
            const g = gcd(n, d); this.n = (d < 0n ? -n : n) / g; this.d = abs(d) / g;
            if (this.n.toString().length + this.d.toString().length > 2048) {
                throw new Error('Слишком большие промежуточные числа.');
            }
        }
        static parse(value) {
            const s = String(value).trim().replace(',', '.').replace('−', '-');
            if (s.length > 80 || !/^[+-]?\d+(?:\.\d+|\/[+-]?\d+)?$/.test(s)) {
                throw new Error('Элемент матрицы — целое число, десятичная или обычная дробь: −2, 0.5, 1/3.');
            }
            if (s.includes('/')) { const [n, d] = s.split('/'); return new Fraction(n, d); }
            const [whole, decimal = ''] = s.split('.');
            return new Fraction(BigInt(whole + decimal), 10n ** BigInt(decimal.length));
        }
        add(b) { return new Fraction(this.n * b.d + b.n * this.d, this.d * b.d); }
        sub(b) { return this.add(b.neg()); }
        mul(b) { return new Fraction(this.n * b.n, this.d * b.d); }
        div(b) { return new Fraction(this.n * b.d, this.d * b.n); }
        neg() { return new Fraction(-this.n, this.d); }
        get zero() { return this.n === 0n; }
        get one() { return this.n === this.d; }
        toString() { return this.d === 1n ? String(this.n) : this.n + '/' + this.d; }
        tex() { return this.d === 1n ? String(this.n) : (this.n < 0n ? '-' : '') + `\\frac{${abs(this.n)}}{${this.d}}`; }
    }
    const F = (n) => Fraction.parse(n);
    function parse(text) {
        if (typeof text !== 'string' || text.length > 6000) { throw new Error('Матрица слишком велика.'); }
        const rows = text.trim().split(/\n|;/).map((row) => row.trim().split(/\s+/).map(F));
        if (!rows.length || rows.length > 6 || !rows[0].length || rows[0].length > 12
            || rows.some((row) => row.length !== rows[0].length)) {
            throw new Error('Нужны строки одинаковой длины; до 6 строк и 6 неизвестных.');
        }
        return rows;
    }
    const copy = (a) => a.map((r) => [...r]);
    const strings = (a) => a.map((r) => r.map(String));
    function parseEquations(text) {
        if (typeof text !== 'string' || text.length > 6000) { throw new Error('Система слишком велика.'); }
        const lines = text.trim().split(/\n|;/).filter((line) => line.trim());
        if (!lines.length || lines.length > 6) { throw new Error('Введите от 1 до 6 уравнений, каждое в своей строке.'); }
        let highest = 0;
        const vector = (constant = F(0)) => [constant, ...Array.from({ length: 6 }, () => F(0))];
        const hasVariable = (value) => value.slice(1).some((v) => !v.zero);
        function side(source) {
            const value = source.replace(/−/g, '-').replace(/,/g, '.').replace(/x_\{([1-6])\}|x_([1-6])/g, 'x$1$2');
            const tokens = value.match(/x[1-6](?!\d)|\d+(?:\.\d+)?|[()+*/-]/g) || [];
            if (tokens.join('') !== value.replace(/\s/g, '')) { throw new Error('Используйте x1…x6, числа, скобки и + − * /.'); }
            let index = 0;
            function atom() {
                const token = tokens[index++];
                if (token === '+' || token === '-') {
                    const a = atom(); return token === '-' ? a.map((v) => v.neg()) : a;
                }
                if (token === '(') {
                    const a = sum(); if (tokens[index++] !== ')') { throw new Error('Закройте скобку.'); } return a;
                }
                if (/^x[1-6]$/.test(token || '')) {
                    const n = Number(token[1]); highest = Math.max(highest, n); const a = vector(); a[n] = F(1); return a;
                }
                if (!/^\d+(?:\.\d+)?$/.test(token || '')) { throw new Error('Не завершён член уравнения.'); }
                return vector(F(token));
            }
            function product() {
                let a = atom();
                while (index < tokens.length && (['*', '/'].includes(tokens[index]) || /^(?:x|\d|\()/.test(tokens[index]))) {
                    const explicit = ['*', '/'].includes(tokens[index]); const op = explicit ? tokens[index++] : '*';
                    const b = atom();
                    if (op === '/') {
                        if (hasVariable(b)) { throw new Error('Деление на выражение с неизвестной не является линейным.'); }
                        a = a.map((v) => v.div(b[0]));
                    } else {
                        if (hasVariable(a) && hasVariable(b)) { throw new Error('Произведение неизвестных не является линейным.'); }
                        a = hasVariable(b) ? b.map((v) => v.mul(a[0])) : a.map((v) => v.mul(b[0]));
                    }
                }
                return a;
            }
            function sum() {
                let a = product();
                while (tokens[index] === '+' || tokens[index] === '-') {
                    const op = tokens[index++]; const b = product(); a = a.map((v, i) => op === '+' ? v.add(b[i]) : v.sub(b[i]));
                }
                return a;
            }
            const a = sum(); if (index !== tokens.length) { throw new Error('Проверьте скобки и знаки.'); } return a;
        }
        const rows = lines.map((line, i) => {
            try {
                const parts = line.split('='); if (parts.length !== 2) { throw new Error('Нужен один знак =.'); }
                const left = side(parts[0]); const right = side(parts[1]); return left.map((v, j) => v.sub(right[j]));
            } catch (error) { throw new Error('Строка ' + (i + 1) + ': ' + error.message); }
        });
        if (!highest) { throw new Error('Укажите хотя бы одну неизвестную x1…x6.'); }
        return rows.map((a) => [...a.slice(1, highest + 1), a[0].neg()]);
    }
    function equations(text) {
        return parse(text).map((row) => row.slice(0, -1).map((v, i) => '(' + v + ')*x' + (i + 1)).join(' + ') + ' = ' + row.at(-1)).join('\n');
    }
    function tex(a, split = 0, determinant = false) {
        const columns = a[0].length;
        const format = split ? 'r'.repeat(split) + '|' + 'r'.repeat(columns - split) : 'r'.repeat(columns);
        return `\\left${determinant ? '|' : '('}\\begin{array}{${format}}`
            + a.map((r) => r.map((v) => v.tex()).join('&')).join('\\\\') + `\\end{array}\\right${determinant ? '|' : ')'}`;
    }
    function orderFor(order, n) {
        if (!order?.trim()) { return Array.from({ length: n }, (_, i) => i); }
        const list = order.trim().split(/[\s,;]+/).map((v) => Number(v) - 1);
        if (list.length !== n || new Set(list).size !== n || list.some((v) => !Number.isInteger(v) || v < 0 || v >= n)) {
            throw new Error('Порядок опорных столбцов — все номера без повторов, например: 3 4 1 2.');
        }
        return list;
    }
    function reduce(a, columns, order, steps, split) {
        let row = 0; const pivots = [];
        const record = (operation) => steps.push({ text: 'Операция применяется ко всей строке.', operation, math: tex(a, split), matrix: strings(a) });
        for (const col of orderFor(order, columns)) {
            const pivot = a.findIndex((r, i) => i >= row && !r[col].zero);
            if (pivot < 0) { continue; }
            if (pivot !== row) {
                [a[row], a[pivot]] = [a[pivot], a[row]];
                record(`R_{${row + 1}}\\leftrightarrow R_{${pivot + 1}}`);
            }
            const p = a[row][col];
            if (!p.one) {
                a[row] = a[row].map((v) => v.div(p));
                record(`R_{${row + 1}}\\leftarrow \\frac{1}{${p.tex()}}R_{${row + 1}}`);
            }
            for (let i = 0; i < a.length; i += 1) {
                if (i === row || a[i][col].zero) { continue; }
                const c = a[i][col]; a[i] = a[i].map((v, j) => v.sub(c.mul(a[row][j])));
                record(`R_{${i + 1}}\\leftarrow R_{${i + 1}}-\\left(${c.tex()}\\right)R_{${row + 1}}`);
            }
            pivots.push(col); row += 1;
            if (row === a.length) { break; }
        }
        return pivots;
    }
    function determinant(a) {
        if (a.length !== a[0].length) { throw new Error('Для определителя нужна квадратная матрица.'); }
        const m = copy(a); const steps = [{ text: 'Исходный определитель', math: tex(m, 0, true), matrix: strings(m) }];
        let sign = F(1);
        for (let col = 0; col < m.length; col += 1) {
            const pivot = m.findIndex((row, i) => i >= col && !row[col].zero);
            if (pivot < 0) {
                steps.push({ text: 'В ступенчатой матрице есть нулевой опорный столбец: определитель равен нулю.', math: '\\det A=0' });
                return { kind: 'determinant', value: '0', latex: '0', steps };
            }
            if (pivot !== col) {
                [m[pivot], m[col]] = [m[col], m[pivot]]; sign = sign.neg();
                steps.push({ text: 'Перестановка строк меняет знак определителя.',
                    operation: `R_{${pivot + 1}}\\leftrightarrow R_{${col + 1}}`, math: tex(m, 0, true), matrix: strings(m) });
            }
            for (let i = col + 1; i < m.length; i += 1) {
                if (m[i][col].zero) { continue; }
                const c = m[i][col].div(m[col][col]); m[i] = m[i].map((v, j) => v.sub(c.mul(m[col][j])));
                steps.push({ text: 'Прибавление кратной строки сохраняет определитель.',
                    operation: `R_{${i + 1}}\\leftarrow R_{${i + 1}}-\\left(${c.tex()}\\right)R_{${col + 1}}`,
                    math: tex(m, 0, true), matrix: strings(m) });
            }
        }
        const value = m.reduce((v, row, i) => v.mul(row[i]), sign);
        steps.push({ text: 'Определитель треугольной матрицы — произведение диагональных элементов. Учитываем перестановки.',
            math: `\\det A=${sign.tex()}\\cdot ${m.map((row, i) => `\\left(${row[i].tex()}\\right)`).join('\\cdot')}=${value.tex()}` });
        return { kind: 'determinant', value: String(value), latex: value.tex(), steps };
    }
    function multiply(a, b) {
        return a.map((row) => b[0].map((_, j) => row.reduce((v, x, k) => v.add(x.mul(b[k][j])), F(0))));
    }
    function solve(text, mode = 'system', order = '') {
        const input = mode === 'system' && text.includes('=') ? parseEquations(text) : parse(text);
        const columns = input[0].length;
        if (mode === 'determinant') { return determinant(input); }
        if (!['system', 'inverse'].includes(mode)) { throw new Error('Неизвестный режим.'); }
        const n = mode === 'system' ? columns - 1 : columns;
        if (n < 1 || n > 6 || (mode === 'inverse' && n !== input.length)) {
            throw new Error('СЛУ: до 6 неизвестных и последний столбец — правая часть. Обратная: квадратная матрица до 6×6.');
        }
        const a = mode === 'system' ? copy(input) : input.map((row, i) => [...row, ...row.map((_, j) => F(i === j ? 1 : 0))]);
        const steps = [{ text: mode === 'system' ? 'Расширенная матрица системы' : 'Приписываем единичную матрицу', math: tex(a, n), matrix: strings(a) }];
        const pivots = reduce(a, n, order, steps, n);
        if (mode === 'inverse') {
            if (pivots.length !== n) {
                return { kind: 'singular', reason: 'Не удалось получить единичную матрицу: det A = 0, обратной матрицы нет.', steps };
            }
            // With a custom pivot order, restore identity row order before reading the inverse.
            const inverse = Array.from({ length: n }, (_, col) => a[pivots.indexOf(col)].slice(n));
            steps.push({ text: 'Располагаем строки по номерам опорных столбцов. Слева E, справа обратная матрица.',
                math: tex(inverse.map((row, i) => [...row.map((_, j) => F(i === j ? 1 : 0)), ...row]), n) });
            const check = multiply(input, inverse);
            if (check.some((row, i) => row.some((v, j) => String(v) !== (i === j ? '1' : '0')))) { throw new Error('Проверка обратной матрицы не прошла.'); }
            steps.push({ text: 'Проверка умножением исходной матрицы на результат', math: `AA^{-1}=${tex(check)}=E` });
            return { kind: 'inverse', matrix: strings(inverse), latex: tex(inverse), steps };
        }
        const inconsistent = a.some((row) => row.slice(0, n).every((v) => v.zero) && !row[n].zero);
        if (inconsistent) {
            steps.push({ text: 'Получили строку 0 = b при b ≠ 0. Система несовместна.', math: '0\\ne b' });
            return { kind: 'inconsistent', steps };
        }
        const free = Array.from({ length: n }, (_, i) => i).filter((i) => !pivots.includes(i));
        const particular = Array.from({ length: n }, () => F(0));
        pivots.forEach((col, row) => { particular[col] = a[row][n]; });
        const basis = free.map((col) => {
            const vector = Array.from({ length: n }, () => F(0)); vector[col] = F(1);
            pivots.forEach((p, row) => { vector[p] = a[row][col].neg(); }); return vector;
        });
        const vectorTex = (v) => tex(v.map((x) => [x]));
        const latex = 'X=' + vectorTex(particular) + basis.map((v, i) => `+x_{${free[i] + 1}}${vectorTex(v)}`).join('');
        steps.push({ text: free.length ? 'Свободные переменные: ' + free.map((i) => 'x' + (i + 1)).join(', ') + '. Записываем общее решение.' : 'Все неизвестные определены.', math: latex });
        const coefficients = input.map((r) => r.slice(0, n));
        for (const [index, v] of [particular, ...basis].entries()) {
            const residual = multiply(coefficients, v.map((x) => [x]));
            if (residual.some((row, i) => !row[0].sub(index === 0 ? input[i][n] : F(0)).zero)) {
                throw new Error('Проверка подстановкой не прошла.');
            }
        }
        steps.push({ text: 'Подстановка проверена в исходной системе для частного решения и всех свободных направлений.', math: 'AX=B' });
        return { kind: free.length ? 'infinite' : 'unique', latex, particular: particular.map(String), basis: basis.map((v) => v.map(String)), free: free.map((i) => i + 1), pivots: pivots.map((i) => i + 1), steps };
    }
    window.StudyLinear = { Fraction, parse, parseEquations, equations, solve, determinant, tex };
})();
