(() => {
    'use strict';
    function universe(text, maximum = 16) {
        if (typeof text !== 'string' || text.length > 10000) { throw new Error('Слишком длинная запись множества.'); }
        const source = text.trim().replace(/^\{([\s\S]*)\}$/, '$1');
        const values = source ? source.split(/[,;\s]+/).filter(Boolean) : [];
        if (values.length > maximum || values.some((v) => v.length > 24 || /[(){}<>"\\]/.test(v))) {
            throw new Error('Не более ' + maximum + ' элементов, до 24 символов в названии; разделяйте их пробелами или запятыми.');
        }
        if (new Set(values).size !== values.length) { throw new Error('Элементы множества не должны повторяться.'); }
        return values;
    }
    function normalize(elements, pairs) {
        if (!Array.isArray(pairs) || pairs.length > elements.length ** 2) { throw new Error('Слишком много пар.'); }
        const matrix = elements.map(() => elements.map(() => 0));
        for (const pair of pairs) {
            if (!Array.isArray(pair) || pair.length !== 2 || pair.some((v) => typeof v !== 'string' || !elements.includes(v))) {
                throw new Error('Оба элемента каждой пары должны принадлежать универсуму.');
            }
            matrix[elements.indexOf(pair[0])][elements.indexOf(pair[1])] = 1;
        }
        return fromMatrix(elements, matrix);
    }
    function fromMatrix(elements, matrix) {
        if (!Array.isArray(matrix) || matrix.length !== elements.length
            || matrix.some((r) => !Array.isArray(r) || r.length !== elements.length || r.some((v) => v !== 0 && v !== 1))) {
            throw new Error('Нужна квадратная матрица из 0 и 1 в порядке элементов универсума.');
        }
        return matrix.flatMap((row, i) => row.flatMap((v, j) => v ? [[elements[i], elements[j]]] : []));
    }
    function matrix(elements, pairs) {
        const result = elements.map(() => elements.map(() => 0));
        for (const [a, b] of normalize(elements, pairs)) { result[elements.indexOf(a)][elements.indexOf(b)] = 1; }
        return result;
    }
    function parsePairs(text, elements) {
        if (typeof text !== 'string' || text.length > 10000) { throw new Error('Слишком длинный список пар.'); }
        let source = text.trim().replace(/^\{([\s\S]*)\}$/, '$1').trim();
        if (!source || source === '∅') { return []; }
        const pairs = [];
        if (source.includes('(')) {
            while (source) {
                const match = /^\(\s*([^,()\s]+)\s*,\s*([^,()\s]+)\s*\)/.exec(source);
                if (!match) { throw new Error('Пары записываются как (a, b), (b, c).'); }
                pairs.push([match[1], match[2]]); source = source.slice(match[0].length);
                if (source && !/^[,;\s]/.test(source)) { throw new Error('Разделяйте пары запятыми или переводом строки.'); }
                source = source.replace(/^[,;\s]+/, '');
            }
        } else {
            for (const line of source.split(/[;\n]+/)) {
                const pair = line.trim().split(/\s*(?:→|->|,)\s*|\s+/);
                if (pair.length !== 2) { throw new Error('Каждая строка содержит пару a → b или (a, b).'); }
                pairs.push(pair);
            }
        }
        return normalize(elements, pairs);
    }
    function operate(elements, left, right, operation) {
        const a = matrix(elements, left); const b = matrix(elements, right);
        const compose = (x, y, i, j) => x[i].some((v, k) => v && y[k][j]);
        const operations = {
            union: (i, j) => a[i][j] || b[i][j], intersection: (i, j) => a[i][j] && b[i][j],
            difference: (i, j) => a[i][j] && !b[i][j], xor: (i, j) => a[i][j] !== b[i][j],
            inverse: (i, j) => a[j][i], complement: (i, j) => !a[i][j],
            compose: (i, j) => compose(a, b, i, j), reverse: (i, j) => compose(b, a, i, j),
            square: (i, j) => compose(a, a, i, j),
        };
        if (!operations[operation]) { throw new Error('Неизвестная операция.'); }
        return fromMatrix(elements, elements.map((_, i) => elements.map((__, j) => Number(Boolean(operations[operation](i, j))))));
    }
    function properties(elements, pairs) {
        const a = matrix(elements, pairs); const n = elements.length; const values = [];
        const check = (name, failures) => {
            const witness = failures[0]; values.push({ name, holds: !witness, witness: witness || '' }); return !witness;
        };
        const reflexive = check('Рефлексивность', elements.filter((_, i) => !a[i][i]).map((v) => `Нет пары (${v}, ${v}).`));
        check('Антирефлексивность', elements.filter((_, i) => a[i][i]).map((v) => `Есть петля (${v}, ${v}).`));
        const symmetry = []; const antisymmetry = []; const asymmetry = []; const transitivity = [];
        for (let i = 0; i < n; i += 1) {
            for (let j = 0; j < n; j += 1) {
                if (a[i][j] && !a[j][i]) { symmetry.push(`Есть (${elements[i]}, ${elements[j]}), нет обратной пары.`); }
                if (a[i][j] && a[j][i]) {
                    const witness = `Есть (${elements[i]}, ${elements[j]}) и (${elements[j]}, ${elements[i]}).`;
                    asymmetry.push(witness); if (i !== j) { antisymmetry.push(witness); }
                }
                for (let k = 0; k < n; k += 1) {
                    if (a[i][j] && a[j][k] && !a[i][k]) {
                        transitivity.push(`Есть ${elements[i]} → ${elements[j]} → ${elements[k]}, нет (${elements[i]}, ${elements[k]}).`);
                    }
                }
            }
        }
        const symmetric = check('Симметричность', symmetry); check('Антисимметричность', antisymmetry);
        check('Асимметричность', asymmetry); const transitive = check('Транзитивность', transitivity);
        const equivalence = reflexive && symmetric && transitive;
        const classes = []; const visited = new Set();
        if (equivalence) {
            elements.forEach((v, i) => {
                if (visited.has(v)) { return; }
                const group = elements.filter((_, j) => a[i][j]); group.forEach((x) => visited.add(x)); classes.push(group);
            });
        }
        return { values, equivalence, classes,
            domain: elements.filter((_, i) => a[i].some(Boolean)), range: elements.filter((_, j) => a.some((r) => r[j])) };
    }
    function setExpression(expression, elements, sets) {
        if (typeof expression !== 'string' || expression.length > 300) { throw new Error('Выражение слишком длинное.'); }
        const source = expression.replace(/\bunion\b/gi, '∪').replace(/\bintersect\b/gi, '∩').replace(/\bnot\b/gi, '¬').replace(/\s/g, '');
        const tokens = source.match(/[ABCU∅∪∩△\\\-¬'()]/g) || [];
        if (tokens.join('') !== source) { throw new Error('Допустимы A, B, C, U, ∅, ∪, ∩, \\, △, ¬, скобки и штрих дополнения.'); }
        let index = 0;
        const complement = (a) => new Set(elements.filter((v) => !a.has(v)));
        function atom() {
            const token = tokens[index++]; let result;
            if (token === '¬') { return complement(atom()); }
            if (token === '(') {
                result = union(); if (tokens[index++] !== ')') { throw new Error('Закройте скобку.'); }
            } else if (['A', 'B', 'C'].includes(token)) { result = new Set(sets[token]); }
            else if (token === 'U') { result = new Set(elements); }
            else if (token === '∅') { result = new Set(); }
            else { throw new Error('Не завершено выражение множеств.'); }
            while (tokens[index] === "'") { index += 1; result = complement(result); }
            return result;
        }
        function intersection() {
            let result = atom();
            while (['∩', '\\', '-'].includes(tokens[index])) {
                const op = tokens[index++]; const b = atom();
                result = new Set([...result].filter((v) => op === '∩' ? b.has(v) : !b.has(v)));
            }
            return result;
        }
        function union() {
            let result = intersection();
            while (tokens[index] === '∪' || tokens[index] === '△') {
                const op = tokens[index++]; const b = intersection();
                result = op === '∪' ? new Set([...result, ...b]) : new Set([...result, ...b].filter((v) => result.has(v) !== b.has(v)));
            }
            return result;
        }
        const result = union(); if (index !== tokens.length) { throw new Error('Проверьте скобки и операции.'); }
        return elements.filter((v) => result.has(v));
    }
    function document(data, type) {
        if (!data || data.format !== 'csu-' + type || data.version !== 1 || !Array.isArray(data.universe)
            || data.universe.some((v) => typeof v !== 'string')) { throw new Error('Неверный формат документа.'); }
        const elements = universe(data.universe.join(', '), type === 'venn' ? 200 : 16);
        if (JSON.stringify(elements) !== JSON.stringify(data.universe)) { throw new Error('Недопустимые названия элементов.'); }
        if (type === 'relations') {
            if (!['list', 'matrix', 'graph', 'plot'].includes(data.mode) || !['R', 'S'].includes(data.active)) { throw new Error('Неизвестный режим отношения.'); }
            return { format: data.format, version: 1, universe: elements, R: normalize(elements, data.R), S: normalize(elements, data.S), mode: data.mode, active: data.active };
        }
        if (![2, 3].includes(data.count) || !data.sets || typeof data.expression !== 'string') { throw new Error('Неверный документ диаграммы.'); }
        const sets = {};
        for (const name of ['A', 'B', 'C']) {
            if (!Array.isArray(data.sets[name]) || data.sets[name].some((v) => typeof v !== 'string' || !elements.includes(v))) { throw new Error('Множества должны быть подмножествами U.'); }
            sets[name] = universe(data.sets[name].join(', '), 200);
        }
        if (data.count === 2 && (/C/.test(data.expression) || sets.C.length)) { throw new Error('Для множества C включите три множества.'); }
        setExpression(data.expression, elements, sets);
        return { format: data.format, version: 1, universe: elements, sets, expression: data.expression, count: data.count };
    }
    window.StudyDiscrete = { universe, normalize, matrix, fromMatrix, parsePairs, operate, properties, setExpression, document };
})();
