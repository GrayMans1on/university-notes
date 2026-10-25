(() => {
    'use strict';
    const owner = typeof window === 'undefined' ? self : window;
    function solve(expression, destination = '0', direction = 'both', options = {}) {
        const ce = new owner.ComputeEngine.ComputeEngine(); let operations = 0;
        const tick = () => { if (++operations > 12000) { throw new Error('Превышен предел сложности разбора.'); } };
        const boxed = (node) => ce.box(node);
        function exponentialIdentity(node) {
            if (!Array.isArray(node)) { return node; }
            const args = node.slice(1).map(exponentialIdentity); const op = node[0];
            if (op === 'Multiply') {
                const sum = args.findIndex((a) => Array.isArray(a) && a[0] === 'Add');
                if (sum >= 0 && args.some((a) => typeof a === 'number' || (Array.isArray(a) && a[0] === 'Rational'))) {
                    return ['Add', ...args[sum].slice(1).map((term) =>
                        ['Multiply', term, ...args.filter((a, i) => i !== sum)])];
                }
            }
            if (op === 'Exp' || (op === 'Power' && args[0] === 'ExponentialE')) {
                const exponent = op === 'Exp' ? args[0] : args[1];
                if (Array.isArray(exponent) && exponent[0] === 'Ln') { return exponent[1]; }
                if (Array.isArray(exponent) && exponent[0] === 'Multiply') {
                    const index = exponent.findIndex((v, i) => i > 0 && Array.isArray(v) && v[0] === 'Ln');
                    if (index > 0) {
                        return ['Power', exponent[index][1], ['Multiply', ...exponent.slice(1).filter((v, i) => i !== index - 1)]];
                    }
                }
            }
            return [op, ...args];
        }
        const exact = (node) => {
            tick(); const first = boxed(exponentialIdentity(node)).evaluate().json;
            const second = exponentialIdentity(first);
            return JSON.stringify(second) === JSON.stringify(first) ? first : boxed(second).evaluate().json;
        };
        const latex = (node) => ce.box(node, { canonical: false }).latex.replace(/\\exponentialE/g, 'e');
        const zero = (node) => JSON.stringify(exact(node)) === '0';
        const depends = (node) => node === 'x' || (Array.isArray(node) && node.slice(1).some(depends));
        const substitute = (node, point) => node === 'x' ? point
            : Array.isArray(node) ? node.map((value, i) => i ? substitute(value, point) : value) : node;
        const evaluate = (node, point) => {
            const value = boxed(substitute(node, point)).evaluate(); const numeric = value.N();
            const n = numeric.re; const imaginary = numeric.im ?? numeric.numericValue?.im ?? 0;
            return { ast: value.json, n: imaginary === 0 && typeof n === 'number' ? n : NaN };
        };
        const unknown = (text) => ({ kind: 'unknown', reason: text || 'Для этого выражения пока нет завершённого разбора.' });
        const domain = () => ({ kind: 'domain', reason: 'С этой стороны вблизи точки нет вещественной области определения.' });
        const finite = (value) => ({ kind: 'finite', value: reduceConstant(exact(value)) });
        const infinite = (sign) => ({ kind: 'infinite', sign: sign < 0 ? -1 : 1 });
        const resultTex = (result) => result.kind === 'finite' ? latex(result.value)
            : result.kind === 'infinite' ? (result.sign < 0 ? '-' : '+') + '\\infty' : '';
        const allowed = new Set(['Add', 'Subtract', 'Multiply', 'InvisibleOperator', 'Divide', 'Rational', 'Negate',
            'Power', 'Square', 'Sqrt', 'Root', 'Sin', 'Cos', 'Tan', 'Cot', 'Exp', 'Ln', 'Log', 'Lg', 'Lb',
            'Abs', 'Arcsin', 'Arccos', 'Arctan', 'Floor', 'Ceil', 'Sign', 'Factorial']);
        let nodes = 0;
        function validate(node, depth = 0) {
            if (++nodes > 250 || depth > 30) { throw new Error('Слишком сложное выражение.'); }
            if (typeof node === 'number') { if (!Number.isFinite(node)) { throw new Error('Недопустимая константа.'); } return; }
            if (typeof node === 'string') {
                if (!['x', 'Pi', 'ExponentialE'].includes(node)) { throw new Error('Задайте числовое значение параметра в разделе «Параметры»: ' + node); }
                return;
            }
            if (node?.num !== undefined) { if (!Number.isFinite(Number(node.num))) { throw new Error('Недопустимое число.'); } return; }
            if (!Array.isArray(node) || !allowed.has(node[0])) { throw new Error('Эта запись вне поддерживаемого языка инструмента. Решение по пройденным методам не построено.'); }
            node.slice(1).forEach((part) => validate(part, depth + 1));
        }
        function parse(text) {
            if (typeof text !== 'string' || text.length > 1200) { throw new Error('Формула превышает 1200 символов.'); }
            const value = ce.parse(text, { canonical: false });
            if (!value.isValid) { throw new Error('Завершите формулу и проверьте скобки.'); }
            return value.json;
        }
        function normalize(node) {
            if (typeof node === 'string' && Object.hasOwn(options.parameters || {}, node)) {
                const value = options.parameters[node];
                if (typeof value !== 'number' || !Number.isFinite(value)) { throw new Error('Значение параметра должно быть конечным числом.'); }
                return value;
            }
            if (node === 'n' && options.variable === 'n') { return 'x'; }
            if (node === 'e') { return 'ExponentialE'; }
            if (!Array.isArray(node)) { return node; }
            const args = node.slice(1).map(normalize);
            if (node[0] === 'Delimiter') { return args[0]; }
            if (node[0] === 'Power' && args[0] === 'ExponentialE') { return ['Exp', args[1]]; }
            const aliases = { tg: 'Tan', ctg: 'Cot', arctg: 'Arctan', arccos: 'Arccos', arcsin: 'Arcsin', lg: 'Lg' };
            return [aliases[node[0]] || (node[0] === 'InvisibleOperator' ? 'Multiply' : node[0]), ...args];
        }
        const variable = options.variable === 'n' ? 'n' : 'x';
        const raw = normalize(parse(expression)); validate(raw);
        const pointText = destination.replace(/^(\s*[+-]?\s*)(?:inf(?:inity)?|∞)\s*$/i, '$1\\infty');
        const pointAst = exact(normalize(parse(pointText)));
        const pointValue = pointAst === 'PositiveInfinity' ? Infinity : pointAst === 'NegativeInfinity' ? -Infinity
            : evaluate(pointAst, 0).n;
        if (depends(pointAst) || Number.isNaN(pointValue)) { throw new Error('Точка должна быть вещественным числом, +∞ или −∞.'); }
        if (!['both', 'left', 'right'].includes(direction)) { throw new Error('Выберите сторону приближения.'); }
        const add = (a, b) => exact(['Add', a, b]); const mul = (a, b) => exact(['Multiply', a, b]);
        function clean(coefficients) {
            while (coefficients.length > 1 && zero(coefficients.at(-1))) { coefficients.pop(); }
            if (coefficients.length > 33) { throw new Error('Степень многочлена превышает 32.'); } return coefficients;
        }
        function sumPoly(a, b) { return clean(Array.from({ length: Math.max(a.length, b.length) }, (_, i) => add(a[i] || 0, b[i] || 0))); }
        function productPoly(a, b) {
            if (a.length + b.length > 35) { throw new Error('Слишком высокая степень многочлена.'); }
            const result = Array(a.length + b.length - 1).fill(0);
            a.forEach((x, i) => b.forEach((y, j) => { result[i + j] = add(result[i + j], mul(x, y)); })); return clean(result);
        }
        function rational(node) {
            tick(); if (!depends(node)) {
                const value = evaluate(node, 0); return Number.isFinite(value.n) ? { p: [value.ast], q: [1] } : null;
            }
            if (node === 'x') { return { p: [0, 1], q: [1] }; }
            if (!Array.isArray(node)) { return null; }
            const [op, ...args] = node;
            if (op === 'Negate') { const a = rational(args[0]); return a && { p: a.p.map((v) => mul(-1, v)), q: a.q }; }
            if (op === 'Square') { return rational(['Power', args[0], 2]); }
            if (op === 'Power') {
                const n = evaluate(args[1], 0).n;
                if (depends(args[1]) || !Number.isInteger(n) || Math.abs(n) > 32) { return null; }
                const a = rational(args[0]); if (!a) { return null; }
                let p = [1]; let q = [1];
                for (let i = 0; i < Math.abs(n); i += 1) { p = productPoly(p, a.p); q = productPoly(q, a.q); }
                return n < 0 ? { p: q, q: p } : { p, q };
            }
            if (!['Add', 'Subtract', 'Multiply', 'InvisibleOperator', 'Divide'].includes(op)) { return null; }
            let total = rational(args[0]); if (!total) { return null; }
            for (const argument of args.slice(1)) {
                const b = rational(argument); if (!b) { return null; }
                if (op === 'Add' || op === 'Subtract') {
                    const right = productPoly(b.p, total.q).map((v) => op === 'Subtract' ? mul(-1, v) : v);
                    total = { p: sumPoly(productPoly(total.p, b.q), right), q: productPoly(total.q, b.q) };
                } else if (op === 'Divide') { total = { p: productPoly(total.p, b.q), q: productPoly(total.q, b.p) }; }
                else { total = { p: productPoly(total.p, b.p), q: productPoly(total.q, b.q) }; }
            }
            return total;
        }
        const polynomialAst = (p) => exact(['Add', ...p.map((c, i) => ['Multiply', c, i ? ['Power', 'x', i] : 1])]);
        const polyAt = (p, a) => p.reduceRight((total, c) => add(mul(total, a), c), 0);
        function factor(p, a) {
            let order = 0; let quotient = clean([...p]);
            if (quotient.length === 1 && zero(quotient[0])) { return { zero: true, order: 0, quotient, value: 0 }; }
            while (quotient.length > 1 && zero(polyAt(quotient, a))) {
                const next = Array(quotient.length - 1); next[next.length - 1] = quotient.at(-1);
                for (let i = next.length - 2; i >= 0; i -= 1) { next[i] = add(quotient[i + 1], mul(a, next[i + 1])); }
                quotient = clean(next); order += 1;
            }
            return { order, quotient, value: polyAt(quotient, a) };
        }
        function reduceConstant(value) {
            const entries = new Map();
            function collect(node) {
                if (node === 'Pi' || (Array.isArray(node) && ['Ln', 'Sin', 'Cos', 'Arctan'].includes(node[0]))) {
                    entries.set(JSON.stringify(node), node); return;
                }
                if (Array.isArray(node)) { node.slice(1).forEach(collect); }
            }
            collect(value); if (entries.size !== 1) { return value; }
            const [key, target] = [...entries][0];
            function replace(node, from, to) {
                if (JSON.stringify(node) === from) { return to; }
                return Array.isArray(node) ? node.map((v, i) => i ? replace(v, from, to) : v) : node;
            }
            const r = rational(replace(value, key, 'x')); if (!r || r.q.every(zero)) { return value; }
            let remainder = clean([...r.p]); const quotient = Array(Math.max(1, r.p.length - r.q.length + 1)).fill(0);
            while (remainder.length >= r.q.length && !remainder.every(zero)) {
                const degree = remainder.length - r.q.length; const c = divide(remainder.at(-1), r.q.at(-1));
                quotient[degree] = c;
                remainder = sumPoly(remainder, [...Array(degree).fill(0), ...r.q.map((v) => negate(mul(v, c)))]);
            }
            return remainder.every(zero) ? exact(replace(polynomialAst(quotient), JSON.stringify('x'), target)) : value;
        }
        function equalValues(a, b) {
            if (JSON.stringify(a) === JSON.stringify(b) || zero(['Subtract', a, b])) { return true; }
            if (Array.isArray(a) && Array.isArray(b) && a[0] === 'Power' && b[0] === 'Power'
                && JSON.stringify(a[1]) === JSON.stringify(b[1])) { return equalValues(a[2], b[2]); }
            function fraction(node) {
                if (!Array.isArray(node)) { return { p: node, q: 1 }; }
                const [op, ...args] = node;
                if (!['Add', 'Subtract', 'Negate', 'Multiply', 'Divide'].includes(op)) { return { p: node, q: 1 }; }
                const values = args.map(fraction); let total = values[0];
                if (op === 'Negate') { return { p: negate(total.p), q: total.q }; }
                for (const next of values.slice(1)) {
                    total = op === 'Multiply' ? { p: mul(total.p, next.p), q: mul(total.q, next.q) }
                        : op === 'Divide' ? { p: mul(total.p, next.q), q: mul(total.q, next.p) }
                            : { p: (op === 'Add' ? add : sub)(mul(total.p, next.q), mul(next.p, total.q)), q: mul(total.q, next.q) };
                }
                return total;
            }
            const x = fraction(a); const y = fraction(b);
            return zero(exact(['Expand', ['Subtract', ['Multiply', x.p, y.q], ['Multiply', y.p, x.q]]]));
        }
        function rationalLimit(rp, point, side, steps) {
            const trace = []; const finish = (result) => ({ ...result, chainExpressions: trace, traceBilateral: true });
            if (rp.q.every(zero)) { return domain(); }
            if (!Number.isFinite(pointValue)) {
                const p = clean(rp.p); const q = clean(rp.q); const degree = p.length - q.length;
                const ratio = exact(['Divide', p.at(-1), q.at(-1)]); const coefficient = evaluate(ratio, 0).n;
                if (p.length === 1 && q.length > 1) {
                    steps.push({ text: 'Числитель постоянный, модуль знаменателя неограниченно растёт. Сразу получаем ноль.',
                        math: `\\left[\\frac{${latex(p[0])}}{\\infty}\\right]=0` });
                    return finish(finite(0));
                }
                const denominatorDegree = q.length - 1;
                const normalized = (coefficients) => exact(['Add', ...coefficients.map((c, i) =>
                    i === denominatorDegree ? c : ['Multiply', c,
                        i - denominatorDegree === 1 ? 'x' : ['Power', 'x', i - denominatorDegree]])]);
                const form = ['Divide', normalized(p), normalized(q)];
                trace.push({ kind: 'limit', math: latex(form), note: 'Делим на старшую степень знаменателя.', source: 'algebra' });
                steps.push({ text: 'Делим числитель и знаменатель на старшую степень знаменателя. Отрицательные степени x стремятся к нулю; сохраняем знак x при отрицательной бесконечности.',
                    math: `\\frac{${latex(polynomialAst(p))}}{${latex(polynomialAst(q))}}=${latex(form)}` });
                if (p.every(zero) || degree < 0) { return finish(finite(0)); }
                if (degree === 0) { return finish(finite(ratio)); }
                return finish(infinite(Math.sign(coefficient) * (pointValue < 0 && degree % 2 ? -1 : 1)));
            }
            const p = factor(rp.p, point); const q = factor(rp.q, point);
            if (!q.order) {
                steps.push({ text: 'Знаменатель в точке не равен нулю. Подставляем значение x.',
                    math: `\\frac{${latex(polyAt(rp.p, point))}}{${latex(polyAt(rp.q, point))}}` });
                trace.push({ kind: 'value', math: latex(['Divide', polyAt(rp.p, point), polyAt(rp.q, point)]), source: 'continuity' });
                return finish(finite(['Divide', polyAt(rp.p, point), polyAt(rp.q, point)]));
            }
            const delta = zero(point) ? 'x' : ['Subtract', 'x', point];
            if (p.order || q.order) {
                const factorTerm = (order, quotient) => {
                    const polynomial = polynomialAst(quotient);
                    if (!order) { return polynomial; }
                    const term = order === 1 ? delta : ['Power', delta, order];
                    return zero(sub(polynomial, 1)) ? term : ['Multiply', term, polynomial];
                };
                const factored = ['Divide', factorTerm(p.order, p.quotient), factorTerm(q.order, q.quotient)];
                trace.push({ kind: 'limit', math: latex(factored), note: 'Выделяем обращающиеся в ноль множители.', source: 'algebra' });
                steps.push({ text: 'Выделяем множители, обращающиеся в ноль. Сокращение допустимо в проколотой окрестности точки.', math: latex(factored) });
                const quotient = ['Divide', polynomialAst(p.quotient), polynomialAst(q.quotient)];
                const reduced = exact(p.order === q.order ? quotient
                    : ['Multiply', ['Power', delta, p.order - q.order], quotient]);
                trace.push({ kind: 'limit', math: latex(reduced), note: 'Сокращаем в проколотой окрестности.', source: 'algebra' });
            }
            if (p.zero || p.order > q.order) { return finish(finite(0)); }
            const ratio = exact(['Divide', p.value, q.value]);
            if (p.order === q.order) {
                steps.push({ text: 'После сокращения подставляем точку в оставшееся выражение.',
                    math: `\\frac{${latex(polynomialAst(p.quotient))}}{${latex(polynomialAst(q.quotient))}}\\;\\longrightarrow\\;\\frac{${latex(p.value)}}{${latex(q.value)}}=${latex(ratio)}` });
                return finish(finite(ratio));
            }
            const power = q.order - p.order;
            steps.push({ text: 'Остаётся полюс. Знак степени разности зависит от стороны приближения.', math: `${latex(ratio)}\\,(${latex(delta)})^{-${power}}` });
            return finish(infinite(Math.sign(evaluate(ratio, 0).n) * (side < 0 && power % 2 ? -1 : 1)));
        }
        const sources = {
            algebra: ['Вычисление пределов функций', 'topic-52ef8193b2'],
            sequence: ['Вычисление пределов последовательностей', 'topic-323cceb218'],
            standard: ['Первый замечательный предел и замены переменных', 'topic-9801e7dbca'],
            second: ['Число e и второй замечательный предел', 'topic-8cf2991703'],
            squeeze: ['Свойства конечного предела функции', 'topic-9b76d49290'],
            continuity: ['Непрерывность и точки разрыва', 'topic-a5937df080'],
            oscillation: ['Подпоследовательности и частичные пределы', 'topic-98224f9517'],
        };
        const note = (steps, text, math, method = 'algebra') => {
            const value = { text, ...(math ? { math } : {}), source: method };
            if (!steps.some((s) => s.text === text && s.math === math)) { steps.push(value); }
        };
        const numeric = (a) => evaluate(a, 0).n;
        const divide = (a, b) => exact(['Divide', a, b]);
        const negate = (a) => mul(-1, a);
        const sub = (a, b) => add(a, negate(b));
        const fail = (reason) => { throw new Error(reason || 'Не удалось завершить преобразование изученными методами.'); };
        const noDomain = () => { const error = new Error(domain().reason); error.domain = true; throw error; };
        const isZero = (p) => p.size === 0;
        const poly = (c = 0, power = 0) => zero(c) ? new Map() : new Map([[power, c]]);
        const powerForms = new Map([[0, 0], [1, 1], [-1, -1]]);
        const powerForm = (key) => powerForms.get(key) ?? key;
        function powerKey(expression) {
            const value = exact(expression); const key = numeric(value);
            if (!Number.isFinite(key)) { fail('Не удалось точно представить степень.'); }
            if (powerForms.has(key) && !zero(sub(powerForms.get(key), value))) {
                fail('Степени слишком близки для точного различения; решение не построено.');
            }
            powerForms.set(key, value); return key;
        }
        function plus(a, b) {
            const out = new Map(a);
            for (const [power, c] of b) {
                const sum = add(out.get(power) || 0, c);
                if (zero(sum)) { out.delete(power); } else { out.set(power, sum); }
            }
            if (out.size > 80) { fail('После раскрытия скобок получилось больше 80 слагаемых.'); }
            return out;
        }
        function times(a, b) {
            tick(); let out = new Map();
            for (const [p, c] of a) {
                for (const [q, d] of b) { out = plus(out, poly(mul(c, d), powerKey(['Add', powerForm(p), powerForm(q)]))); }
            }
            return out;
        }
        const constant = (c) => ({ p: poly(c), q: poly(1) });
        const monomial = (c, p) => ({ p: poly(c, p), q: poly(1) });
        const gadd = (a, b) => ({ p: plus(times(a.p, b.q), times(b.p, a.q)), q: times(a.q, b.q) });
        const gmul = (a, b) => ({ p: times(a.p, b.p), q: times(a.q, b.q) });
        function gdiv(a, b) {
            if (isZero(b.p)) { noDomain(); }
            return { p: times(a.p, b.q), q: times(a.q, b.p) };
        }
        const gneg = (a) => gmul(constant(-1), a);
        const gsub = (a, b) => gadd(a, gneg(b));
        function gpower(a, n) {
            let out = constant(1);
            for (let i = 0; i < Math.abs(n); i += 1) { out = gmul(out, a); }
            return n < 0 ? gdiv(constant(1), out) : out;
        }
        let atoms; let atomIds;
        function replaceAtoms(node, values = false) {
            if (typeof node === 'string' && atoms.has(node)) {
                return values ? atoms.get(node).value : atoms.get(node).expression;
            }
            return Array.isArray(node) ? node.map((n, i) => i ? replaceAtoms(n, values) : n) : node;
        }
        const coefficientValue = (c) => exact(replaceAtoms(c, true));
        function polyAst(p, shift = 0) {
            return exact(['Add', ...[...p].sort((a, b) => a[0] - b[0]).map(([k, c]) => {
                const exponent = sub(powerForm(k), powerForm(shift));
                return zero(exponent) ? c : ['Multiply', c, zero(sub(exponent, 1)) ? 't' : ['Power', 't', exponent]];
            })]);
        }
        const germAst = (g) => exact(['Divide', polyAst(g.p), polyAst(g.q)]);
        const germTex = (g) => latex(replaceAtoms(germAst(g)));
        function first(p, allowVanishing = false) {
            if (isZero(p)) { return { power: 0, coefficient: 0, value: 0, zero: true }; }
            const power = Math.min(...p.keys()); const coefficient = p.get(power);
            const value = coefficientValue(coefficient);
            if (zero(value) && !allowVanishing) {
                fail('После преобразований остаётся разность стандартных отношений с одинаковыми пределами. Их разность нельзя заменять нулём: полного решения изученными методами пока нет.');
            }
            if (!Number.isFinite(numeric(value))) { fail('Не удалось проверить предел оставшегося множителя.'); }
            return { power, coefficient, value };
        }
        function leadingGerm(g, allowVanishing = false) {
            if (isZero(g.q)) { noDomain(); }
            const p = first(g.p, allowVanishing); const q = first(g.q);
            return { power: powerKey(['Subtract', powerForm(p.power), powerForm(q.power)]), value: divide(p.value, q.value),
                zero: p.zero, numerator: p, denominator: q };
        }
        function germLimit(g) {
            const l = leadingGerm(g, true);
            if (!l.zero && zero(l.value) && l.power < 0) { fail('Возникает произведение нулевого предела остатка и бесконечной степени t. Скорость остатка не установлена изученными преобразованиями.'); }
            if (l.zero || l.power > 0) { return finite(0); }
            if (l.power < 0) { return infinite(Math.sign(numeric(l.value))); }
            return finite(l.value);
        }
        function atom(expression, value, steps, text, method = 'continuity') {
            const key = JSON.stringify(expression);
            if (atomIds.has(key)) { return constant(atomIds.get(key)); }
            const symbol = 'K' + (atoms.size + 1);
            atoms.set(symbol, { expression, value: exact(value) }); atomIds.set(key, symbol);
            if (text) { note(steps, text, `\\lim_{t\\to0^+}${latex(expression)}=${latex(value)}`, method); }
            return constant(symbol);
        }
        function smallRatio(type, u, steps, parameter = 0) {
            if (isZero(u.p)) { return constant(1); }
            const limit = germLimit(u);
            if (limit.kind !== 'finite' || !zero(limit.value)) { fail('Внутренний аргумент стандартного предела не стремится к нулю.'); }
            const a = replaceAtoms(germAst(u)); let expression; let text;
            if (type === 'sin') { expression = ['Divide', ['Sin', a], a]; text = 'Внутренний аргумент стремится к нулю. Выделяем первый замечательный предел.'; }
            if (type === 'cos') { expression = ['Divide', ['Subtract', 1, ['Cos', a]], ['Divide', ['Square', a], 2]]; text = 'Используем записанное в конспекте следствие: (1−cos u)/(u²/2) → 1.'; }
            if (type === 'exp') { expression = ['Divide', ['Subtract', ['Exp', a], 1], a]; text = 'Выделяем стандартное отношение (eᵘ−1)/u при u → 0.'; }
            if (type === 'ln') { expression = ['Divide', ['Ln', ['Add', 1, a]], a]; text = 'Выделяем стандартное отношение ln(1+u)/u при u → 0; 1+u положительно вблизи точки.'; }
            if (type === 'arcsin' || type === 'arctan') {
                expression = ['Divide', [type === 'arcsin' ? 'Arcsin' : 'Arctan', a], a];
                text = 'Выделяем стандартный предел для обратной тригонометрической функции при u → 0.';
            }
            if (type === 'power') {
                expression = ['Divide', ['Subtract', ['Power', ['Add', 1, a], parameter], 1], ['Multiply', parameter, a]];
                text = 'Используем стандартный предел ((1+u)^α−1)/u → α; α — постоянная, 1+u > 0 вблизи точки.';
            }
            return atom(expression, 1, steps, text, 'standard');
        }
        function continuousFunction(op, g, point, side, steps) {
            const l = germLimit(g);
            if (l.kind !== 'finite') { fail(); }
            const a = l.value; const an = numeric(a); const u = gsub(g, constant(a));
            if (['Sin', 'Cos'].includes(op)) {
                const sinA = exact(['Sin', a]); const cosA = exact(['Cos', a]);
                const sinU = isZero(u.p) ? constant(0) : gmul(u, smallRatio('sin', u, steps));
                let cosU = constant(1);
                if (!isZero(u.p) && !zero(op === 'Sin' ? sinA : cosA)) {
                    cosU = gsub(constant(1), gmul(constant(divide(1, 2)), gmul(gpower(u, 2), smallRatio('cos', u, steps))));
                }
                if (!zero(a)) {
                    note(steps, 'Переносим аргумент к нулю и применяем формулу сложения.',
                        `${latex([op, ['Add', a, replaceAtoms(germAst(u))]])}=${latex(op === 'Sin'
                            ? ['Add', ['Multiply', sinA, ['Cos', replaceAtoms(germAst(u))]], ['Multiply', cosA, ['Sin', replaceAtoms(germAst(u))]]]
                            : ['Subtract', ['Multiply', cosA, ['Cos', replaceAtoms(germAst(u))]], ['Multiply', sinA, ['Sin', replaceAtoms(germAst(u))]]])}`, 'standard');
                }
                return op === 'Sin' ? gadd(gmul(constant(sinA), cosU), gmul(constant(cosA), sinU))
                    : gsub(gmul(constant(cosA), cosU), gmul(constant(sinA), sinU));
            }
            if (op === 'Exp') {
                return gmul(constant(exact(['Exp', a])), gadd(constant(1), gmul(u, smallRatio('exp', u, steps))));
            }
            if (op === 'Ln') {
                if (an < 0) { noDomain(); }
                if (an === 0) { fail('Логарифм у границы области требует проверки стороны.'); }
                const v = gdiv(u, constant(a));
                note(steps, 'Выносим положительное значение аргумента из логарифма и выделяем ln(1+u).',
                    `\\ln(${latex(a)}+${germTex(u)})=\\ln(${latex(a)})+\\ln\\left(1+${germTex(v)}\\right)`, 'standard');
                return gadd(constant(exact(['Ln', a])), gmul(v, smallRatio('ln', v, steps)));
            }
            if (['Arcsin', 'Arccos'].includes(op)) {
                if (Math.abs(an) > 1) { noDomain(); }
                if (Math.abs(an) === 1 && !isZero(u.p)) {
                    const outward = Math.sign(numeric(leadingGerm(u).value)) * an > 0;
                    if (outward) { noDomain(); }
                    note(steps, 'Проверяем область обратной тригонометрической функции: внутренний аргумент подходит к границе из [−1,1].',
                        '-1\\le u\\le1', 'continuity');
                }
            }
            if (['Arcsin', 'Arctan'].includes(op) && zero(a)) { return gmul(u, smallRatio(op.toLowerCase(), u, steps)); }
            return atom([op, replaceAtoms(germAst(g))], exact([op, a]), steps,
                'Внешняя функция непрерывна в предельном значении аргумента.');
        }
        function realPower(value, exponent) {
            const power = numeric(exponent); const n = numeric(value); const fraction = exact(exponent);
            if (Number.isInteger(power)) { return exact(['Power', value, power]); }
            if (n < 0) {
                if (Array.isArray(fraction) && fraction[0] === 'Rational' && Math.abs(fraction[2] % 2) === 1) {
                    return mul(Math.abs(fraction[1] % 2) === 1 ? -1 : 1,
                        exact(['Power', negate(value), fraction]));
                }
                noDomain();
            }
            return n === 0 && power > 0 ? 0 : exact(['Power', value, fraction]);
        }
        function powerGerm(g, exponent, point, side, steps) {
            const n = numeric(exponent);
            if (!Number.isFinite(n) || Math.abs(n) > 64) { fail('Слишком большая или переменная степень для этого преобразования.'); }
            if (Number.isInteger(n)) { return gpower(g, n); }
            const l = leadingGerm(g); const sign = Math.sign(numeric(l.value));
            if (sign < 0) { realPower(l.value, exponent); }
            if (l.zero) { return n > 0 ? constant(0) : noDomain(); }
            if (l.power !== 0) {
                const coefficient = gdiv(g, monomial(1, l.power));
                const c = atom(['Power', replaceAtoms(germAst(coefficient)), exponent], realPower(l.value, exponent), steps,
                    'Выносим степень малого положительного t из-под корня; знак коэффициента проверен.', 'sequence');
                return gmul(monomial(1, powerKey(['Multiply', powerForm(l.power), exponent])), c);
            }
            const a = l.value; const u = gdiv(gsub(g, constant(a)), constant(a));
            if (isZero(u.p)) { return constant(realPower(a, exponent)); }
            return gmul(constant(realPower(a, exponent)), gadd(constant(1),
                gmul(constant(exponent), gmul(u, smallRatio('power', u, steps, exponent)))));
        }
        function germ(node, point, side, steps, depth = 0) {
            tick(); if (depth > 30) { fail('Слишком глубокая композиция функций.'); }
            if (node === 'x') {
                return Number.isFinite(pointValue) ? gadd(constant(point), monomial(side, 1))
                    : monomial(pointValue < 0 ? -1 : 1, -1);
            }
            if (!depends(node)) {
                const v = evaluate(node, 0); if (!Number.isFinite(v.n)) { noDomain(); }
                return constant(v.ast);
            }
            if (!Array.isArray(node)) { fail(); }
            const [op, ...args] = node; const g = (n) => germ(n, point, side, steps, depth + 1);
            if (op === 'Negate') { return gneg(g(args[0])); }
            if (op === 'Add' || op === 'Subtract') {
                return args.slice(1).reduce((a, b) => op === 'Add' ? gadd(a, g(b)) : gsub(a, g(b)), g(args[0]));
            }
            if (op === 'Multiply') { return args.reduce((a, b) => gmul(a, g(b)), constant(1)); }
            if (op === 'Divide') { return gdiv(g(args[0]), g(args[1])); }
            if (op === 'Square') { return gpower(g(args[0]), 2); }
            if (op === 'Sqrt' || op === 'Root') {
                if (args[1] && depends(args[1])) { fail('Корень переменного порядка рассматривается через шкалу роста.'); }
                return powerGerm(g(args[0]), args[1] ? divide(1, args[1]) : divide(1, 2), point, side, steps);
            }
            if (op === 'Power') {
                if (!depends(args[1])) { return powerGerm(g(args[0]), exact(args[1]), point, side, steps); }
                if (!depends(args[0]) && numeric(args[0]) > 0) {
                    return continuousFunction('Exp', gmul(constant(exact(['Ln', args[0]])), g(args[1])), point, side, steps);
                }
                fail('Переменная степень требует отдельной проверки основания и показателя.');
            }
            if (op === 'Tan' || op === 'Cot') {
                note(steps, 'Выражаем тангенс или котангенс через синус и косинус.',
                    op === 'Tan' ? '\\tan u=\\frac{\\sin u}{\\cos u}' : '\\cot u=\\frac{\\cos u}{\\sin u}', 'standard');
                const sin = g(['Sin', args[0]]); const cos = g(['Cos', args[0]]);
                return op === 'Tan' ? gdiv(sin, cos) : gdiv(cos, sin);
            }
            if (['Sin', 'Cos', 'Exp', 'Ln', 'Arcsin', 'Arccos', 'Arctan'].includes(op)) {
                return continuousFunction(op, g(args[0]), point, side, steps);
            }
            if (['Log', 'Lg', 'Lb'].includes(op)) {
                const base = op === 'Lb' ? 2 : args[1] || 10;
                if (depends(base) || numeric(base) <= 0 || zero(sub(base, 1))) { fail('Основание логарифма должно быть постоянным, положительным и отличным от 1.'); }
                return gdiv(g(['Ln', args[0]]), constant(exact(['Ln', base])));
            }
            if (op === 'Abs') {
                const a = g(args[0]); const sign = Math.sign(numeric(leadingGerm(a).value));
                note(steps, 'Определяем знак выражения на выбранной стороне и раскрываем модуль.',
                    `|${latex(args[0])}|=${latex(sign < 0 ? ['Negate', args[0]] : args[0])}`);
                return sign < 0 ? gneg(a) : a;
            }
            if (['Floor', 'Ceil', 'Sign'].includes(op)) {
                const a = g(args[0]); const l = germLimit(a); if (l.kind !== 'finite') { fail(); }
                const n = numeric(l.value); const delta = gsub(a, constant(l.value));
                const sign = isZero(delta.p) ? 0 : Math.sign(numeric(leadingGerm(delta).value));
                const value = op === 'Sign' ? n === 0 ? sign : Math.sign(n)
                    : op === 'Floor' ? Math.floor(n) - (Number.isInteger(n) && sign < 0 ? 1 : 0)
                        : Math.ceil(n) + (Number.isInteger(n) && sign > 0 ? 1 : 0);
                note(steps, 'На этой стороне аргумент лежит в одном промежутке постоянства ступенчатой функции.',
                    `${latex(node)}=${value}`);
                return constant(value);
            }
            fail();
        }
        function rationalize(node, steps) {
            if (!Array.isArray(node)) { return node; }
            const [op, ...args] = node;
            const parts = args.map((a) => rationalize(a, steps));
            if (op !== 'Subtract' || parts.length !== 2) { return [op, ...parts]; }
            const [a, b] = parts;
            const root = (v) => Array.isArray(v) && (v[0] === 'Sqrt' ? { body: v[1], n: 2 }
                : v[0] === 'Root' && [2, 3].includes(numeric(v[2])) ? { body: v[1], n: numeric(v[2]) } : null);
            const left = root(a); const right = root(b); const n = left?.n || right?.n;
            if (!n || (left && right && left.n !== right.n)) { return [op, ...parts]; }
            const numerator = ['Subtract', left ? left.body : ['Power', a, n], right ? right.body : ['Power', b, n]];
            const denominator = n === 2 ? ['Add', a, b] : ['Add', ['Square', a], ['Multiply', a, b], ['Square', b]];
            const result = ['Divide', numerator, denominator];
            note(steps, n === 2 ? 'Умножаем разность корней на сопряжённое и делим на него.'
                : 'Используем разность кубов, чтобы убрать кубические корни из числителя.',
            `${latex(node)}=${latex(result)}`, 'sequence');
            return result;
        }
        function rewriteStandard(node, steps) {
            if (!Array.isArray(node)) { return node; }
            const [op, ...args] = node; const parts = args.map((a) => rewriteStandard(a, steps));
            if (op === 'Subtract' && parts.length === 2) {
                const [a, b] = parts;
                if (a?.[0] === 'Exp' && b?.[0] === 'Exp') {
                    const result = ['Multiply', b, ['Subtract', ['Exp', ['Subtract', a[1], b[1]]], 1]];
                    note(steps, 'Выносим общую экспоненту, чтобы получить стандартное приращение.',
                        `${latex([op, ...parts])}=${latex(result)}`, 'standard');
                    return result;
                }
                if (a?.[0] === 'Power' && b?.[0] === 'Power' && !depends(a[1])
                    && numeric(a[1]) > 0 && zero(sub(a[1], b[1]))) {
                    const result = ['Multiply', b, ['Subtract', ['Power', a[1], ['Subtract', a[2], b[2]]], 1]];
                    note(steps, 'Выносим общий показательный множитель.', `${latex([op, ...parts])}=${latex(result)}`, 'standard');
                    return result;
                }
            }
            return [op, ...parts];
        }
        function growthScale(a) {
            const x = pointValue < 0 ? ['Negate', 'x'] : 'x'; const w = a.weights;
            const factor = (base, rawExponent) => {
                const exponent = typeof rawExponent === 'number' ? powerForm(rawExponent) : rawExponent;
                return zero(exponent) ? 1 : zero(sub(exponent, 1)) ? base : ['Power', base, exponent];
            };
            return exact(['Multiply', factor(x, ['Multiply', w[0], x]), factor(['Factorial', x], w[1]),
                ['Exp', ['Multiply', a.rate, x]], factor(x, w[3]), factor(['Ln', x], w[4])]);
        }
        function growth(node, point, side, steps, depth = 0) {
            tick(); if (depth > 25) { fail(); }
            const item = (value, weights = [0, 0, 0, 0, 0], rate = weights[2]) => ({ value: exact(value), weights, rate });
            const compare = (a, b) => {
                for (let i = 0; i < 5; i += 1) {
                    const d = a[i] - b[i];
                    if (d !== 0 && Math.abs(d) < 1e-12) { fail('Не удалось точно сравнить скорости роста.'); }
                    if (d !== 0) { return Math.sign(d); }
                }
                return 0;
            };
            const product = (a, b, inverse = false) => {
                if (inverse && zero(b.value)) { noDomain(); }
                return item(inverse ? divide(a.value, b.value) : mul(a.value, b.value),
                    a.weights.map((w, i) => i === 2 ? w + (inverse ? -b.weights[i] : b.weights[i])
                        : powerKey([inverse ? 'Subtract' : 'Add', powerForm(w), powerForm(b.weights[i])])), inverse ? sub(a.rate, b.rate) : add(a.rate, b.rate));
            };
            const visit = (n) => growth(n, point, side, steps, depth + 1);
            if (!depends(node)) {
                const v = evaluate(node, 0); if (!Number.isFinite(v.n)) { noDomain(); } return item(v.ast);
            }
            if (node === 'x') { return item(pointValue < 0 ? -1 : 1, [0, 0, 0, 1, 0]); }
            const rp = rational(node);
            if (rp) {
                if (rp.q.every(zero)) { noDomain(); }
                const degree = rp.p.length - rp.q.length;
                return item(mul(divide(rp.p.at(-1), rp.q.at(-1)), pointValue < 0 && degree % 2 ? -1 : 1),
                    [0, 0, 0, degree, 0]);
            }
            if (!Array.isArray(node)) { fail(); }
            const [op, ...args] = node;
            if (op === 'Negate') { const a = visit(args[0]); return item(negate(a.value), a.weights, a.rate); }
            if (op === 'Add' || op === 'Subtract') {
                const visited = args.map(visit);
                const terms = visited.map((a, i) => op === 'Subtract' && i > 0 ? item(negate(a.value), a.weights, a.rate) : a)
                    .filter((a) => !zero(a.value));
                if (!terms.length) { return item(0); }
                terms.sort((a, b) => -compare(a.weights, b.weights)); const top = terms[0];
                const same = terms.filter((a) => compare(a.weights, top.weights) === 0);
                const value = exact(['Add', ...same.map((a) => a.value)]);
                if (zero(value)) { fail('Старшие множители сокращаются; нужно дополнительное тождественное преобразование.'); }
                const scale = growthScale(top);
                const normalized = args.map((arg, i) => ['Divide', op === 'Subtract' && i > 0 ? ['Negate', arg] : arg, scale]);
                note(steps, 'В сумме выделяем самый быстрый множитель и делим на него каждое слагаемое.',
                    `\\frac{${latex(node)}}{${latex(scale)}}=${latex(['Add', ...normalized])}`, 'sequence');
                args.forEach((arg, i) => {
                    const term = visited[i]; const sameScale = compare(term.weights, top.weights) === 0;
                    note(steps, sameScale ? 'Этот член имеет тот же масштаб; его оставшийся коэффициент имеет конечный предел.'
                        : 'Этот член растёт медленнее выбранного множителя; отношение стремится к нулю по шкале роста.',
                        `\\frac{${latex(arg)}}{${latex(scale)}}\\longrightarrow${sameScale ? latex(term.value) : '0'}`, 'sequence');
                });
                return item(value, top.weights, top.rate);
            }
            if (op === 'Multiply') { return args.reduce((a, b) => product(a, visit(b)), item(1)); }
            if (op === 'Divide') { return product(visit(args[0]), visit(args[1]), true); }
            if (op === 'Square') { const a = visit(args[0]); return item(mul(a.value, a.value), a.weights.map((v, i) => i === 2 ? 2 * v : powerKey(['Multiply', 2, powerForm(v)])), mul(2, a.rate)); }
            if (op === 'Abs') { const a = visit(args[0]); return item(exact(['Abs', a.value]), a.weights, a.rate); }
            if (op === 'Factorial') {
                if (variable !== 'n' || pointValue < 0) { fail('Факториалы рассматриваются для последовательности n → +∞.'); }
                const r = rational(args[0]);
                if (!r || r.q.length !== 1 || r.p.length !== 2 || !zero(sub(divide(r.p[1], r.q[0]), 1))) { fail(); }
                const k = numeric(divide(r.p[0], r.q[0]));
                if (!Number.isInteger(k) || Math.abs(k) > 20) { fail('Поддержан факториал n+k при целом |k|≤20.'); }
                const factors = Array.from({ length: Math.abs(k) }, (_, i) => ['Add', 'x', k > 0 ? i + 1 : -i]);
                const expanded = !k ? ['Factorial', 'x'] : [k > 0 ? 'Multiply' : 'Divide', ['Factorial', 'x'], ['Multiply', ...factors]];
                note(steps, 'Раскрываем сдвинутый факториал до общего n!; каждый линейный множитель после деления на n стремится к 1.',
                    `${latex(node)}=${latex(expanded)}`, 'sequence');
                return item(1, [0, 1, 0, k, 0]);
            }
            if (op === 'Power' || op === 'Root' || op === 'Sqrt') {
                const exponent = op === 'Power' ? args[1] : op === 'Sqrt' ? divide(1, 2) : ['Divide', 1, args[1]];
                if (!depends(exponent)) {
                    const a = visit(args[0]); const n = numeric(exponent);
                    return item(realPower(a.value, exponent), a.weights.map((v, i) => i === 2 ? v * n : powerKey(['Multiply', powerForm(v), exponent])), mul(exponent, a.rate));
                }
                if (!depends(args[0]) && numeric(args[0]) > 0) {
                    const r = rational(exponent);
                    if (r && r.q.length === 1 && r.p.length === 2) {
                        const rate = numeric(divide(r.p[1], r.q[0])) * Math.log(numeric(args[0])) * (pointValue < 0 ? -1 : 1);
                        return item(exact(['Power', args[0], divide(r.p[0], r.q[0])]), [0, 0, rate, 0, 0], mul(mul(divide(r.p[1], r.q[0]), exact(['Ln', args[0]])), pointValue < 0 ? -1 : 1));
                    }
                }
                const r = rational(exponent);
                if (pointValue > 0 && r && r.p.length === 1 && r.q.length === 2 && zero(r.q[0])
                    ) {
                    const a = visit(args[0]);
                    if (numeric(a.value) <= 0 || a.weights[0] !== 0 || a.weights[1] !== 0) { fail(); }
                    const answer = exact(['Exp', mul(a.rate, divide(r.p[0], r.q[1]))]);
                    note(steps, 'Выделяем самый быстрый показательный множитель под корнем переменного порядка. Корни n-й степени из постоянных и степеней n стремятся к 1.',
                        `\\left(\\sqrt[n]{${latex(args[0])}}\\right)^{${latex(divide(r.p[0], r.q[1]))}}\\longrightarrow ${latex(answer)}`, 'sequence');
                    return item(answer);
                }
                if (node[0] === 'Power' && args[0] === 'x' && args[1] === 'x' && pointValue > 0) {
                    return item(1, [1, 0, 0, 0, 0]);
                }
                fail();
            }
            if (op === 'Exp') {
                const r = rational(args[0]);
                if (r && r.q.length === 1 && r.p.length === 2) {
                    return item(exact(['Exp', divide(r.p[0], r.q[0])]),
                        [0, 0, numeric(divide(r.p[1], r.q[0])) * (pointValue < 0 ? -1 : 1), 0, 0]);
                }
                fail();
            }
            if (['Ln', 'Log', 'Lg', 'Lb'].includes(op)) {
                const a = visit(args[0]); if (numeric(a.value) <= 0) { noDomain(); }
                const base = op === 'Ln' ? 'ExponentialE' : op === 'Lb' ? 2 : args[1] || 10;
                if (depends(base) || numeric(base) <= 0 || zero(sub(base, 1))) { fail(); }
                const b = exact(['Ln', base]);
                if (a.weights[0] === 0 && a.weights[1] === 0 && a.weights[2] === 0 && a.weights[3] !== 0) {
                    return item(divide(a.weights[3], b), [0, 0, 0, 0, 1]);
                }
                if (a.weights[0] === 0 && a.weights[1] === 0 && a.weights[2] !== 0) {
                    return item(divide(a.rate, b), [0, 0, 0, 1, 0]);
                }
                fail();
            }
            if (op === 'Arctan') {
                const a = visit(args[0]);
                if (compare(a.weights, [0, 0, 0, 0, 0]) > 0) { return item(mul(Math.sign(numeric(a.value)), divide('Pi', 2))); }
            }
            fail();
        }
        const bounded = (node) => {
            if (!Array.isArray(node)) { return false; }
            if (node[0] === 'Negate') { return bounded(node[1]); }
            if (!['Sin', 'Cos', 'Arctan'].includes(node[0])) { return false; }
            const r = rational(node[1]); return Boolean(r && !r.q.every(zero));
        };
        function toResult(value) {
            if (value === 'PositiveInfinity') { return infinite(1); }
            if (value === 'NegativeInfinity') { return infinite(-1); }
            return Number.isFinite(numeric(value)) ? finite(value) : unknown();
        }
        function originalGermTrace(g, point, side) {
            const l = leadingGerm(g, true); const n = first(g.p, true); const d = first(g.q);
            const delta = Number.isFinite(pointValue) ? side > 0 ? sub('x', point) : sub(point, 'x')
                : ['Divide', pointValue < 0 ? -1 : 1, 'x'];
            function restore(node) {
                if (node === 't') { return delta; }
                return Array.isArray(node) ? node.map((part, i) => i ? restore(part) : part) : node;
            }
            function symbolicTex(node) {
                let text = latex(exact(restore(node)));
                for (const [symbol, atom] of atoms) {
                    const token = latex(symbol);
                    const expression = latex(restore(replaceAtoms(atom.expression)));
                    text = text.split(token).join('\\left(' + expression + '\\right)');
                }
                return text;
            }
            const normalized = exact(['Multiply', ['Power', 't', powerForm(l.power)],
                ['Divide', polyAst(g.p, n.power), polyAst(g.q, d.power)]]);
            const after = restore(exact(replaceAtoms(normalized, true)));
            return [{ kind: 'limit', math: symbolicTex(normalized),
                note: 'Тождественно выделяем стандартные отношения и общий множитель.', source: 'standard' },
            { kind: depends(after) ? 'limit' : 'value', math: latex(after),
                note: 'Стандартные отношения заменяем их пределами по арифметическим свойствам; знаменатель после выделения степени имеет ненулевой предел.', source: 'standard' }];
        }
        function analyticTrace(node) {
            if (!Array.isArray(node)) { return true; }
            if (['Abs', 'Floor', 'Ceil', 'Sign', 'Factorial'].includes(node[0])) { return false; }
            if (['Sqrt', 'Root', 'Power'].includes(node[0])) {
                const exponent = node[0] === 'Sqrt' ? .5 : node[0] === 'Root' ? 1 / numeric(node[2]) : numeric(node[2]);
                if (!Number.isInteger(exponent)) {
                    const value = evaluate(node[1], pointAst).n;
                    if (!(value > 0)) { return false; }
                }
            }
            if (['Arcsin', 'Arccos'].includes(node[0]) && !(Math.abs(evaluate(node[1], pointAst).n) < 1)) { return false; }
            return node.slice(1).every(analyticTrace);
        }
        function explainGerm(g, result, point, side, steps, node) {
            const l = leadingGerm(g, true); const n = first(g.p, true); const d = first(g.q);
            note(steps, Number.isFinite(pointValue) ? 'Переносим предельную точку в ноль; t положительно, поэтому направление учтено.'
                : 'Вводим положительное t → 0 и заменяем бесконечный аргумент обратной величиной.',
            Number.isFinite(pointValue) ? `x=${latex(point)}${side < 0 ? '-' : '+'}t,\\quad t\\to0^+`
                : `x=${pointValue < 0 ? '-' : ''}\\frac1t,\\quad t\\to0^+`, 'standard');
            const num = replaceAtoms(polyAst(g.p, n.power)); const den = replaceAtoms(polyAst(g.q, d.power));
            const remaining = latex(exact(['Divide', num, den]));
            note(steps, 'После тождественных преобразований выделяем общую степень t. Стандартные отношения в оставшихся множителях имеют указанные выше пределы.',
                `${latex(node)}\\big|_{x=${Number.isFinite(pointValue) ? latex(point) + (side < 0 ? '-' : '+') + 't' : (pointValue < 0 ? '-' : '') + '1/t'}}`
                + `=${l.power === 0 ? '' : 't^{' + latex(powerForm(l.power)) + '}\\cdot'}${remaining}`);
            note(steps, 'Вычисляем предел оставшегося частного: предел знаменателя отличен от нуля.',
                `\\frac{${latex(n.value)}}{${latex(d.value)}}=${latex(l.value)}`, 'squeeze');
            note(steps, l.zero || l.power > 0 ? 'Положительная степень t стремится к нулю; оставшийся множитель имеет конечный предел.'
                : l.power < 0 ? 'Отрицательная степень положительного t неограниченно растёт; знак задаёт оставшийся множитель.'
                    : 'Степень t равна нулю; остаётся предел частного.', resultTex(result));
        }
        // Require continuity of every original subtree before simplifying a substitution.
        // This preserves holes such as (x-x)/(x-x) and rejects boundary-only domains.
        function continuousValue(node, point) {
            tick();
            if (node === 'x') { return point; }
            if (!Array.isArray(node)) {
                return Number.isFinite(evaluate(node, point).n) ? exact(node) : null;
            }
            const [op, ...args] = node;
            const values = args.map((arg) => continuousValue(arg, point));
            if (values.some((value) => value === null)) { return null; }
            const numbers = values.map(numeric); const a = numbers[0];
            const arithmetic = ['Add', 'Subtract', 'Negate', 'Multiply', 'Rational', 'Square', 'Abs', 'Sin', 'Cos', 'Exp', 'Arctan'];
            if (op === 'Divide' && numbers[1] === 0) { return null; }
            if (['Ln', 'Log', 'Lg', 'Lb'].includes(op)) {
                const base = op === 'Ln' ? Math.E : op === 'Lb' ? 2 : numbers[1] ?? 10;
                if (!(a > 0) || !(base > 0) || base === 1) { return null; }
            } else if (['Arcsin', 'Arccos'].includes(op)) {
                if (!(Math.abs(a) < 1)) { return null; }
            } else if (op === 'Sqrt' || op === 'Root' || op === 'Power') {
                const exponent = op === 'Sqrt' ? divide(1, 2) : op === 'Root' ? divide(1, values[1]) : values[1];
                const power = numeric(exponent);
                if (!Number.isFinite(power) || (a === 0 && power <= 0)
                    || (op === 'Power' && a <= 0 && depends(args[1]))) { return null; }
                if (op === 'Root' && (!Number.isInteger(numbers[1]) || numbers[1] === 0 || depends(args[1]))) { return null; }
                if (a <= 0 && !Number.isInteger(power)) {
                    const fraction = exact(exponent);
                    if (depends(args[1]) || !Array.isArray(fraction) || fraction[0] !== 'Rational'
                        || Math.abs(fraction[2] % 2) !== 1) { return null; }
                }
                try {
                    const value = realPower(values[0], exponent);
                    return Number.isFinite(numeric(value)) ? value : null;
                } catch { return null; }
            } else if (['Floor', 'Ceil'].includes(op)) {
                if (Number.isInteger(a) && depends(args[0])) { return null; }
            } else if (op === 'Sign') {
                if (a === 0 && depends(args[0])) { return null; }
            } else if (['Tan', 'Cot'].includes(op)) {
                const denominator = exact([op === 'Tan' ? 'Cos' : 'Sin', values[0]]);
                if (zero(denominator)) { return null; }
            } else if (!arithmetic.includes(op) && op !== 'Divide') { return null; }
            const value = exact([op, ...values]);
            return Number.isFinite(numeric(value)) ? value : null;
        }
        // Recognize standard ratios in the original variable, without a coordinate change.
        function standardQuotient(node, point, side, steps) {
            if (node?.[0] !== 'Divide') { return null; }
            const numerator = node[1]; let argument; let scale = 1; let power = 1; let type;
            if (['Sin', 'Tan', 'Arcsin', 'Arctan'].includes(numerator?.[0])) {
                argument = numerator[1]; type = numerator[0];
            } else if (numerator?.[0] === 'Ln') {
                argument = ['Subtract', numerator[1], 1]; type = 'Ln';
            } else if (numerator?.[0] === 'Subtract' && zero(sub(numerator[2], 1))) {
                const first = numerator[1];
                if (first?.[0] === 'Exp') { argument = first[1]; type = 'Exp'; }
                if (first?.[0] === 'Power' && !depends(first[2]) && numeric(first[1]) !== Math.E) {
                    argument = ['Subtract', first[1], 1]; scale = first[2]; type = 'Power';
                }
                if (first?.[0] === 'Sqrt') {
                    argument = ['Subtract', first[1], 1]; scale = divide(1, 2); type = 'Power';
                }
            } else if (numerator?.[0] === 'Subtract' && zero(sub(numerator[1], 1)) && numerator[2]?.[0] === 'Cos') {
                argument = numerator[2][1]; scale = divide(1, 2); power = 2; type = 'Cos';
            }
            if (!argument) { return null; }
            argument = exact(argument);
            const inner = rational(argument);
            if (!inner || inner.p.every(zero) || inner.q.every(zero)
                || !zero(polyAt(inner.p, point)) || zero(polyAt(inner.q, point))) { return null; }
            const factorAst = power === 2 ? ['Square', argument] : argument;
            const ratio = rational(['Divide', factorAst, node[2]]);
            if (!ratio) { return null; }
            const proof = []; const coefficient = rationalLimit(ratio, point, side, proof);
            if (coefficient.kind !== 'finite') { return null; }
            const standard = ['Divide', numerator, factorAst];
            const answer = mul(scale, coefficient.value);
            note(steps, type === 'Sin' ? 'Выделяем первый замечательный предел; внутренний аргумент стремится к нулю.'
                : 'Выделяем стандартное отношение из конспекта; внутренний аргумент стремится к нулю.',
                `${latex(argument)}\\longrightarrow0,\\qquad ${latex(standard)}\\longrightarrow${latex(scale)}`, 'standard');
            const unitCoefficient = zero(sub(coefficient.value, 1));
            if (!unitCoefficient || JSON.stringify(argument) !== JSON.stringify(node[2])) {
                note(steps, 'Домножаем и делим на внутренний аргумент, чтобы применить этот предел.',
                    `${latex(node)}=${latex(standard)}\\cdot ${latex(['Divide', factorAst, node[2]])}`, 'standard');
                steps.push(...proof);
                note(steps, 'Перемножаем найденные пределы.',
                    `${latex(scale)}\\cdot ${latex(coefficient.value)}=${latex(answer)}`, 'standard');
            }
            const p = factor(ratio.p, point); const q = factor(ratio.q, point);
            const delta = zero(point) ? 'x' : sub('x', point);
            const quotient = ['Divide', polynomialAst(p.quotient), polynomialAst(q.quotient)];
            const remaining = exact(p.order === q.order ? quotient
                : ['Multiply', ['Power', delta, p.order - q.order], quotient]);
            const directStandard = zero(sub(remaining, 1));
            return { ...finite(answer), traceBilateral: true,
                chainExpressions: [...(directStandard ? [] : [{ kind: 'limit', math: (zero(sub(remaining, 1)) ? '' : latex(remaining) + '\\cdot ') + latex(standard),
                    note: 'Выделяем стандартное отношение в исходной переменной.', source: 'standard' }]),
                { kind: 'value', math: latex(exact(['Multiply', scale, coefficient.value])),
                    note: 'Применяем замечательный предел и арифметические свойства.', source: 'standard' }] };
        }
        function limit(node, point, side, steps, depth = 0) {
            tick(); if (depth > 12) { return unknown('Превышена глубина последовательных преобразований.'); }
            if (Number.isFinite(pointValue)) {
                const value = continuousValue(node, point);
                if (value !== null) {
                    note(steps, 'Прямая подстановка допустима: выражение непрерывно в этой точке.',
                        `${latex(node)}\\big|_{x=${latex(point)}}=${latex(value)}`, 'continuity');
                    return { ...finite(value), traceBilateral: true,
                        chainExpressions: [{ kind: 'value', math: latex(substitute(node, point)), note: 'Прямая подстановка по непрерывности.', source: 'continuity' }] };
                }
                if (node?.[0] === 'Divide') {
                    const a = continuousValue(node[1], point); const b = continuousValue(node[2], point);
                    if (a !== null && b !== null && zero(a) && zero(b)) {
                        note(steps, 'Прямая подстановка даёт неопределённость 0/0. Ищем подходящее преобразование.',
                            '\\frac{0}{0}');
                    }
                }
            }
            const r = rational(node);
            if (r) { return rationalLimit(r, point, side, steps); }
            if (Number.isFinite(pointValue)) {
                const standard = standardQuotient(node, point, side, steps);
                if (standard) { return standard; }
            }
            if (Number.isFinite(pointValue) && ['Add', 'Subtract', 'Negate', 'Multiply', 'Divide'].includes(node?.[0])) {
                const proof = [];
                const values = node.slice(1).map((arg) => limit(arg, point, side, proof, depth + 1));
                if (values.every((value) => value.kind === 'finite')
                    && (node[0] !== 'Divide' || !zero(values[1].value))) {
                    const constants = values.map((value) => value.value);
                    const answer = toResult(exact([node[0], ...constants]));
                    if (answer.kind === 'finite') {
                        steps.push(...proof);
                        note(steps, 'Применяем арифметические свойства к найденным пределам частей выражения.',
                            `${latex([node[0], ...constants])}=${resultTex(answer)}`, 'continuity');
                        return { ...answer, traceBilateral: values.every((v) => v.traceBilateral === true),
                            chainExpressions: [{ kind: 'value', math: latex([node[0], ...constants]), source: 'continuity',
                                note: 'Арифметические свойства конечных пределов частей выражения.' }] };
                    }
                }
            }
            let failure;
            const standardSteps = []; const prepared = rewriteStandard(node, standardSteps);
            for (let pass = 0; pass < 2; pass += 1) {
                const work = pass ? rationalize(prepared, standardSteps) : prepared;
                if (pass && JSON.stringify(work) === JSON.stringify(prepared)) { break; }
                try {
                    const proof = []; const g = germ(work, point, side, proof);
                    const result = germLimit(g);
                    const conclusion = []; explainGerm(g, result, point, side, conclusion, node);
                    steps.push(...standardSteps, conclusion.shift(), ...proof, ...conclusion);
                    return { ...result, chainExpressions: originalGermTrace(g, point, side), traceBilateral: analyticTrace(node) };
                } catch (error) { if (error.domain) { return domain(); } failure = error.message; }
            }
            if (!Array.isArray(node)) { return unknown(failure); }
            const [op, ...args] = node;
            const visit = (n, targetSteps = []) => limit(n, point, side, targetSteps, depth + 1);
            if (op === 'Power') {
                const base = visit(args[0]); const exponent = visit(args[1]);
                if (base.kind === 'finite' && zero(sub(base.value, 1)) && exponent.kind === 'infinite') {
                    const u = ['Subtract', args[0], 1]; const product = ['Multiply', u, args[1]];
                    note(steps, 'Основание стремится к 1 и положительно в достаточно малой окрестности. Выделяем u → 0 и применяем второй замечательный предел.',
                        `(1+u)^v=\\left((1+u)^{1/u}\\right)^{uv},\\quad u=${latex(u)},\\quad v=${latex(args[1])}`, 'second');
                    const innerSteps = []; const inner = visit(product, innerSteps); steps.push(...innerSteps);
                    if (inner.kind === 'finite') {
                        note(steps, 'Произведение u·v имеет конечный предел. По второму замечательному пределу получаем ответ.',
                            `\\lim uv=${latex(inner.value)},\\qquad L=e^{${latex(inner.value)}}`, 'second');
                        return { ...finite(['Exp', inner.value]), traceBilateral: true,
                            chainExpressions: [{ kind: 'limit', math: `\\left(\\left(${latex(args[0])}\\right)^{\\frac{1}{${latex(exact(u))}}}\\right)^{${latex(exact(product))}}`,
                                note: 'Выделяем второй замечательный предел без введения новой переменной.', source: 'second' },
                            { kind: 'value', math: latex(['Exp', inner.value]), source: 'second' }] };
                    }
                    return unknown('Не удалось завершить вычисление произведения u·v изученными методами.');
                }
                if (base.kind === 'finite' && numeric(base.value) > 0 && !zero(sub(base.value, 1))
                    && exponent.kind === 'infinite') {
                    const sign = Math.sign(Math.log(numeric(base.value))) * exponent.sign;
                    note(steps, 'Основание положительно и его предел отличается от 1. Проверяем, лежит ли оно выше или ниже 1, и направление бесконечного показателя.',
                        `a\\to${latex(base.value)},\\quad v\\to${resultTex(exponent)}`, 'second');
                    return sign > 0 ? infinite(1) : finite(0);
                }
            }
            if (!Number.isFinite(pointValue)) {
                try {
                    const proof = []; const a = growth(node, point, side, proof); const w = a.weights;
                    const index = w.findIndex((v) => v !== 0); const result = zero(a.value) || index < 0 ? finite(a.value)
                        : w[index] > 0 ? infinite(Math.sign(numeric(a.value))) : finite(0);
                    steps.push(...proof);
                    const scale = growthScale(a);
                    note(steps, 'Выделяем самый быстрый множитель. По шкале роста из конспекта логарифмы растут медленнее положительных степеней, затем идут экспоненты, факториалы и nⁿ.',
                        `\\frac{${latex(node)}}{${latex(exact(scale))}}\\longrightarrow ${latex(a.value)}`, 'sequence');
                    note(steps, 'Оставшийся коэффициент имеет конечный ненулевой предел; учитываем рост или убывание выделенного множителя.', resultTex(result), 'sequence');
                    const trace = [];
                    if (op === 'Divide') {
                        const denominator = growth(args[1], point, side, []); const normalizer = growthScale(denominator);
                        const normalize = (arg) => Array.isArray(arg) && ['Add', 'Subtract'].includes(arg[0])
                            ? [arg[0], ...arg.slice(1).map((term) => ['Divide', term, normalizer])] : ['Divide', arg, normalizer];
                        trace.push({ kind: 'limit', math: latex(['Divide', normalize(args[0]), normalize(args[1])]),
                            note: 'Делим каждое слагаемое на общий старший множитель знаменателя; используем шкалу роста.', source: 'sequence' });
                    }
                    trace.push({ kind: 'limit', math: latex(['Multiply', a.value, scale]),
                        note: 'По шкале роста и арифметическим свойствам предел равен пределу ведущего множителя с найденным коэффициентом.', source: 'sequence' });
                    return { ...result, chainExpressions: trace, traceBilateral: false };
                } catch (error) { if (error.domain) { return domain(); } failure = error.message; }
            }
            if (op === 'Divide'  && bounded(args[0])) {
                const d = visit(args[1]);
                if (d.kind === 'infinite') {
                    note(steps, 'Числитель ограничен, а модуль знаменателя стремится к бесконечности. Применяем теорему о зажатой функции.',
                        `\\left|${latex(node)}\\right|\\le\\frac{${args[0][0] === 'Arctan' ? '\\pi/2' : '1'}}{|${latex(args[1])}|}\\longrightarrow0`, 'squeeze');
                    return finite(0);
                }
            }
            if (op === 'Multiply') {
                const i = args.findIndex(bounded);
                if (i >= 0) {
                    const rest = ['Multiply', ...args.filter((_, j) => i !== j)]; const l = visit(rest);
                    if (l.kind === 'finite' && zero(l.value)) {
                        note(steps, 'Один множитель ограничен, другой стремится к нулю. Применяем теорему о зажатой функции.',
                            `|${latex(node)}|\\le ${args[i][0] === 'Arctan' ? '\\pi/2' : '1'}\\cdot|${latex(rest)}|\\longrightarrow0`, 'squeeze');
                        return finite(0);
                    }
                }
            }
            if (['Sin', 'Cos'].includes(op) && variable === 'x') {
                const a = visit(args[0]);
                if (a.kind === 'infinite' && rational(args[0])) {
                    note(steps, 'Аргумент непрерывно проходит сколь угодно большие значения. Можно выбрать последовательности, на которых синус или косинус равен 1 и −1; по Гейне общего предела нет.',
                        op === 'Sin' ? '\\sin(\\pi/2+2\\pi k)=1,\\quad\\sin(3\\pi/2+2\\pi k)=-1'
                            : '\\cos(2\\pi k)=1,\\quad\\cos(\\pi+2\\pi k)=-1', 'oscillation');
                    return { kind: 'dne', reason: 'Есть две последовательности аргументов с разными пределами значений функции.' };
                }
            }
            if (variable === 'n' && !Number.isFinite(pointValue)) {
                let changed = false;
                function parity(value, odd) {
                    if (!Array.isArray(value)) { return value; }
                    if (value[0] === 'Power' && !depends(value[1]) && numeric(value[1]) < 0) {
                        const r = rational(value[2]);
                        if (r && r.q.length === 1) {
                            const coefficients = r.p.map((c) => numeric(divide(c, r.q[0])));
                            if (coefficients.every(Number.isInteger)) {
                                const sign = coefficients.reduce((total, c, i) => total + c * (i === 0 ? 1 : odd), 0) % 2 ? -1 : 1;
                                changed = true;
                                return ['Multiply', sign, ['Power', negate(value[1]), value[2]]];
                            }
                        }
                    }
                    return value.map((part, i) => i ? parity(part, odd) : part);
                }
                const even = parity(node, 0); const odd = parity(node, 1);
                if (changed) {
                    const evenProof = []; const oddProof = []; const a = visit(even, evenProof); const b = visit(odd, oddProof);
                    if (a.kind === 'finite' && b.kind === 'finite') {
                        note(steps, 'Рассматриваем чётные и нечётные номера отдельно.',
                            `\\lim a_{2k}=${resultTex(a)},\\qquad\\lim a_{2k+1}=${resultTex(b)}`, 'oscillation');
                        steps.push(...evenProof, ...oddProof);
                        if (equalValues(a.value, b.value)) { return { ...a, chainExpressions: [{ kind: 'value', math: resultTex(a),
                            note: 'Чётная и нечётная подпоследовательности имеют один и тот же предел.', source: 'oscillation' }] }; }
                        return { kind: 'dne', reason: 'Чётная и нечётная подпоследовательности имеют разные пределы.' };
                    }
                }
            }
            if (['Add', 'Subtract', 'Negate', 'Multiply', 'Divide', 'Exp', 'Ln', 'Log', 'Lg', 'Lb', 'Sqrt', 'Abs'].includes(op)) {
                const proof = []; const values = args.map((a) => visit(a, proof));
                if (values.some((a) => a.kind === 'domain')) { return domain(); }
                if (values.every((a) => ['finite', 'infinite'].includes(a.kind))) {
                    const constants = values.map((a) => a.kind === 'finite' ? a.value : a.sign > 0 ? 'PositiveInfinity' : 'NegativeInfinity');
                    let result = unknown();
                    if (op === 'Exp' && values[0].kind === 'infinite') { result = values[0].sign > 0 ? infinite(1) : finite(0); }
                    else if (['Ln', 'Log', 'Lg', 'Lb'].includes(op) && values[0].kind === 'finite' && zero(values[0].value)) {
                        try {
                            const g = germ(args[0], point, side, []); const sign = Math.sign(numeric(leadingGerm(g).value));
                            if (sign <= 0) { return domain(); }
                            const base = op === 'Ln' ? Math.E : op === 'Lb' ? 2 : numeric(args[1] || 10);
                            if (!(base > 0) || base === 1) { return domain(); }
                            result = infinite(base > 1 ? -1 : 1);
                        } catch { result = unknown(); }
                    } else { result = toResult(exact([op, ...constants])); }
                    if (result.kind !== 'unknown') {
                        steps.push(...proof); note(steps, 'Применяем арифметические свойства пределов и поведение внешней элементарной функции; неопределённости не осталось.',
                            `${latex([op, ...constants])}\\longrightarrow${resultTex(result)}`, 'continuity');
                        return { ...result, chainExpressions: [{ kind: 'value', math: resultTex(result),
                            note: 'Применяем арифметические свойства и поведение внешней элементарной функции на найденных предельных значениях.', source: 'continuity' }] };
                    }
                }
            }
            return unknown(failure || 'Не удалось построить полное решение изученными методами. Это ограничение решателя, а не доказательство, что задачу не проходили.');
        }
        function decorate(steps) {
            return steps.map((s) => ({ ...s, source: s.source || 'algebra' }));
        }
        const sourceExpression = latex(raw).replace(/\bx\b/g, variable);
        const inputExpression = ['Add', 'Subtract'].includes(raw?.[0]) ? `\\left(${sourceExpression}\\right)` : sourceExpression;
        const initial = { text: 'Исходный предел', math: `\\lim_{${variable}\\to ${latex(pointAst)}${direction === 'left' ? '^-' : direction === 'right' ? '^+' : ''}}${inputExpression}` };
        function analyze(side) {
            atoms = new Map(); atomIds = new Map(); const steps = []; let result;
            try { result = limit(raw, pointAst, side, steps); } catch (error) { result = error.domain ? domain() : unknown(error.message); }
            if (resultTex(result)) { note(steps, 'Ответ', resultTex(result)); }
            const replaceVariable = (text) => variable === 'n' ? text.replace(/\bx\b/g, 'n') : text;
            return { side: side < 0 ? 'left' : 'right', ...result,
                steps: decorate(steps).map((s) => ({ ...s, ...(s.math ? { math: replaceVariable(s.math) } : {}) })) };
        }
        if (variable === 'n' && pointValue !== Infinity) { throw new Error('Для последовательности n выберите n → +∞.'); }
        const sides = Number.isFinite(pointValue) ? direction === 'both' ? [analyze(-1), analyze(1)]
            : [analyze(direction === 'left' ? -1 : 1)] : [analyze(pointValue < 0 ? -1 : 1)];
        let result = sides[0];
        if (sides.length === 2) {
            const right = sides[1]; const equal = result.kind === right.kind && (result.kind === 'finite'
                ? equalValues(result.value, right.value) : result.kind === 'infinite' && result.sign === right.sign);
            if (!equal) {
                result = ['finite', 'infinite'].includes(result.kind) && ['finite', 'infinite'].includes(right.kind)
                    ? result.kind === 'finite' && right.kind === 'finite'
                        && Math.abs(numeric(result.value) - numeric(right.value)) < 1e-10 * Math.max(1, Math.abs(numeric(result.value)))
                        ? unknown('Не удалось доказать равенство или различие двух точных выражений для сторон.')
                        : { kind: 'dne', reason: 'Левый и правый пределы различаются. Двусторонний предел не существует.' }
                    : sides.some((s) => s.kind === 'dne') ? { kind: 'dne', reason: 'Хотя бы с одной стороны предела нет.' }
                        : sides.every((s) => s.kind === 'domain') ? domain()
                            : unknown('Проверьте односторонние результаты: полного двустороннего решения изученными методами нет.');
            }
        }
        function annotation() {
            if (Number.isFinite(pointValue)) {
                if (raw?.[0] === 'Divide') {
                    const a = continuousValue(raw[1], pointAst); const b = continuousValue(raw[2], pointAst);
                    if (a !== null && b !== null && zero(a) && zero(b)) { return '\\frac00'; }
                }
                if (raw?.[0] === 'Subtract') {
                    const a = continuousValue(raw[1], pointAst); const b = continuousValue(raw[2], pointAst);
                    if (a !== null && b !== null && zero(a) && zero(b)) { return '0-0'; }
                }
                if (raw?.[0] === 'Power') {
                    const a = evaluate(raw[1], pointAst); const b = evaluate(raw[2], pointAst);
                    if (a.n === 1 && (displayed.chainExpressions || []).some((entry) => entry.source === 'second')) { return '1^{\\infty}'; }
                }
            } else {
                const rp = rational(raw);
                if (rp && rp.q.length > 1) { return `\\frac{${rp.p.length > 1 ? '\\infty' : latex(rp.p[0])}}{\\infty}`; }
                if (raw?.[0] === 'Subtract') {
                    const a = evaluate(raw[1], pointAst).n; const b = evaluate(raw[2], pointAst).n;
                    if (Math.abs(a) === Infinity && Math.abs(b) === Infinity && Math.sign(a) === Math.sign(b)) { return '\\infty-\\infty'; }
                    if (a === 0 && b === 0) { return '0-0'; }
                }
            }
            return '';
        }
        const displayed = sides.find((s) => s.side === 'right') || sides[0];
        const trace = displayed.chainExpressions || [];
        const compatible = sides.length === 1 || displayed.traceBilateral === true
            || JSON.stringify(trace) === JSON.stringify(sides[0].chainExpressions || []);
        const solved = ['finite', 'infinite'].includes(result.kind);
        let hint = ''; try { hint = annotation(); } catch { /* A display hint must not change a proven result. */ }
        const chain = [{ math: initial.math, kind: 'initial', annotation: hint }];
        if (solved && compatible) {
            for (const entry of trace) {
                const expression = variable === 'n' ? entry.math.replace(/\bx\b/g, 'n') : entry.math;
                const math = entry.kind === 'limit' ? `\\lim_{${variable}\\to${latex(pointAst)}}\\left(${expression}\\right)` : expression;
                if (chain.at(-1).math !== math) { chain.push({ ...entry, math }); }
            }
        }
        if (solved && chain.at(-1).math !== resultTex(result)) { chain.push({ kind: 'answer', math: resultTex(result), note: 'Ответ' }); }
        return { kind: result.kind, value: result.value, sign: result.sign, reason: result.reason,
            latex: resultTex(result), sides, steps: [initial], chain, chainComplete: compatible && (trace.length > 0 || solved && displayed.steps.length <= 2), expression, destination, direction, variable, sources };
    }
    owner.StudyLimits = { solve };
})();
