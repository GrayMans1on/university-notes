(() => {
    'use strict';
    const owner = typeof window === 'undefined' ? self : window;
    function solve(expression, destination = '0', direction = 'both') {
        const ce = new owner.ComputeEngine.ComputeEngine(); let operations = 0;
        const tick = () => { if (++operations > 12000) { throw new Error('Превышен предел сложности разбора.'); } };
        const boxed = (node) => ce.box(node);
        const exact = (node) => { tick(); return boxed(node).evaluate().json; };
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
        const finite = (value) => ({ kind: 'finite', value: exact(value) });
        const infinite = (sign) => ({ kind: 'infinite', sign: sign < 0 ? -1 : 1 });
        const resultTex = (result) => result.kind === 'finite' ? latex(result.value)
            : result.kind === 'infinite' ? (result.sign < 0 ? '-' : '+') + '\\infty' : '';
        const allowed = new Set(['Add', 'Subtract', 'Multiply', 'InvisibleOperator', 'Divide', 'Rational', 'Negate',
            'Power', 'Square', 'Sqrt', 'Root', 'Sin', 'Cos', 'Tan', 'Cot', 'Exp', 'Ln', 'Log', 'Lg', 'Lb',
            'Abs', 'Arcsin', 'Arccos', 'Arctan', 'Sinh', 'Cosh', 'Tanh', 'Floor', 'Ceil', 'Sign']);
        let nodes = 0;
        function validate(node, depth = 0) {
            if (++nodes > 250 || depth > 30) { throw new Error('Слишком сложное выражение.'); }
            if (typeof node === 'number') { if (!Number.isFinite(node)) { throw new Error('Недопустимая константа.'); } return; }
            if (typeof node === 'string') {
                if (!['x', 'Pi', 'ExponentialE'].includes(node)) { throw new Error('Для предела доступна переменная x; неизвестный символ: ' + node); }
                return;
            }
            if (node?.num !== undefined) { if (!Number.isFinite(Number(node.num))) { throw new Error('Недопустимое число.'); } return; }
            if (!Array.isArray(node) || !allowed.has(node[0])) { throw new Error('Этот вид выражения пока не поддерживается.'); }
            node.slice(1).forEach((part) => validate(part, depth + 1));
        }
        function parse(text) {
            if (typeof text !== 'string' || text.length > 1200) { throw new Error('Формула превышает 1200 символов.'); }
            const value = ce.parse(text, { canonical: false });
            if (!value.isValid) { throw new Error('Завершите формулу и проверьте скобки.'); }
            return value.json;
        }
        function normalize(node) {
            if (node === 'e') { return 'ExponentialE'; }
            if (!Array.isArray(node)) { return node; }
            const args = node.slice(1).map(normalize);
            if (node[0] === 'Delimiter') { return args[0]; }
            if (node[0] === 'Power' && args[0] === 'ExponentialE') { return ['Exp', args[1]]; }
            return [node[0] === 'InvisibleOperator' ? 'Multiply' : node[0], ...args];
        }
        const raw = normalize(parse(expression)); validate(raw);
        const pointAst = exact(parse(destination));
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
        const derivative = (node) => {
            tick(); const value = normalize(exact(['D', node, 'x']));
            if (JSON.stringify(value).includes('"D"') || JSON.stringify(value).length > 16000) { throw new Error('Не удалось завершить символьное дифференцирование.'); }
            return value;
        };
        function leading(node, point) {
            const rp = rational(node);
            if (rp && rp.q.length === 1 && !zero(rp.q[0])) {
                const f = factor(rp.p, point); return { ...f, value: exact(['Divide', f.value, rp.q[0]]) };
            }
            let d = node; let factorial = 1;
            for (let order = 0; order <= 8; order += 1) {
                const value = evaluate(d, point);
                if (!Number.isFinite(value.n)) { return null; }
                if (!zero(value.ast)) { return { order, value: exact(['Divide', value.ast, factorial]) }; }
                d = derivative(d); factorial *= order + 1;
                if (zero(d)) { return { zero: true, order: 0, value: 0 }; }
            }
            return null;
        }
        function nearSign(node, point, side) {
            const term = leading(node, point);
            if (!term || term.zero) { return term?.zero ? 0 : null; }
            const n = evaluate(term.value, 0).n;
            return Number.isFinite(n) && n !== 0 ? Math.sign(n) * (side < 0 && term.order % 2 ? -1 : 1) : null;
        }
        function regular(node, point) {
            if (!Array.isArray(node)) { return Number.isFinite(evaluate(node, point).n); }
            const [op, ...args] = node; if (!args.every((a) => regular(a, point))) { return false; }
            const values = args.map((a) => evaluate(a, point).n);
            if (op === 'Divide' || op === 'Rational') { return values[1] !== 0; }
            if (['Ln', 'Log', 'Lg', 'Lb', 'Sqrt'].includes(op)) { return values[0] > 0 && (args.length < 2 || (values[1] > 0 && values[1] !== 1)); }
            if (op === 'Power') { return !depends(args[1]) && Number.isInteger(values[1]) ? values[0] !== 0 || values[1] >= 0 : values[0] > 0; }
            if (op === 'Root') { return values[0] > 0; }
            if (['Arcsin', 'Arccos'].includes(op)) { return Math.abs(values[0]) < 1; }
            if (op === 'Tan') { return !zero(evaluate(['Cos', args[0]], point).ast); }
            if (op === 'Cot') { return !zero(evaluate(['Sin', args[0]], point).ast); }
            return !['Abs', 'Floor', 'Ceil', 'Sign'].includes(op);
        }
        function piecewise(node, point, side, steps) {
            if (!Array.isArray(node)) { return node; }
            const [op, ...rawArgs] = node; const args = rawArgs.map((a) => piecewise(a, point, side, steps));
            if (op === 'Abs') {
                const sign = nearSign(args[0], point, side);
                if (sign !== null) {
                    const replacement = sign < 0 ? ['Negate', args[0]] : args[0];
                    steps.push({ text: 'Раскрываем модуль с учётом знака выражения с выбранной стороны.', math: latex(['Equal', ['Abs', args[0]], replacement]) });
                    return replacement;
                }
            }
            if (['Floor', 'Ceil', 'Sign'].includes(op)) {
                const value = evaluate(args[0], point);
                if (Number.isFinite(value.n)) {
                    const sign = nearSign(['Subtract', args[0], value.ast], point, side);
                    if (sign !== null) {
                        const n = op === 'Sign' ? value.n === 0 ? sign : Math.sign(value.n)
                            : op === 'Floor' ? Math.floor(value.n) - (Number.isInteger(value.n) && sign < 0 ? 1 : 0)
                                : Math.ceil(value.n) + (Number.isInteger(value.n) && sign > 0 ? 1 : 0);
                        steps.push({ text: 'Определяем значение ступенчатой функции в односторонней окрестности.', math: latex(['Equal', [op, args[0]], n]) });
                        return n;
                    }
                }
            }
            return [op, ...args];
        }
        function rationalLimit(rp, point, side, steps) {
            if (rp.q.every(zero)) { return domain(); }
            if (!Number.isFinite(pointValue)) {
                const p = clean(rp.p); const q = clean(rp.q); const degree = p.length - q.length;
                const ratio = exact(['Divide', p.at(-1), q.at(-1)]); const coefficient = evaluate(ratio, 0).n;
                steps.push({ text: 'Делим числитель и знаменатель на старшую степень x; младшие степени после деления стремятся к нулю.',
                    math: `\\frac{${latex(polynomialAst(p))}}{${latex(polynomialAst(q))}}\\sim ${latex(ratio)}x^{${degree}}` });
                if (p.every(zero) || degree < 0) { return finite(0); }
                if (degree === 0) { return finite(ratio); }
                return infinite(Math.sign(coefficient) * (pointValue < 0 && degree % 2 ? -1 : 1));
            }
            const p = factor(rp.p, point); const q = factor(rp.q, point);
            if (!q.order) {
                steps.push({ text: 'Знаменатель в точке не равен нулю. Подставляем значение x.',
                    math: `\\frac{${latex(polyAt(rp.p, point))}}{${latex(polyAt(rp.q, point))}}` });
                return finite(['Divide', polyAt(rp.p, point), polyAt(rp.q, point)]);
            }
            const delta = ['Subtract', 'x', point];
            if (p.order || q.order) {
                steps.push({ text: 'Выделяем множители, обращающиеся в ноль. Сокращение допустимо в проколотой окрестности точки.',
                    math: `\\frac{(${latex(delta)})^{${p.order}}(${latex(polynomialAst(p.quotient))})}{(${latex(delta)})^{${q.order}}(${latex(polynomialAst(q.quotient))})}` });
            }
            if (p.zero || p.order > q.order) { return finite(0); }
            const ratio = exact(['Divide', p.value, q.value]);
            if (p.order === q.order) {
                steps.push({ text: 'После сокращения подставляем точку в оставшееся выражение.',
                    math: `\\frac{${latex(polynomialAst(p.quotient))}}{${latex(polynomialAst(q.quotient))}}\\;\\longrightarrow\\;\\frac{${latex(p.value)}}{${latex(q.value)}}=${latex(ratio)}` });
                return finite(ratio);
            }
            const power = q.order - p.order;
            steps.push({ text: 'Остаётся полюс. Знак степени разности зависит от стороны приближения.',
                math: `${latex(ratio)}\\,(${latex(delta)})^{-${power}}` });
            return infinite(Math.sign(evaluate(ratio, 0).n) * (side < 0 && power % 2 ? -1 : 1));
        }
        const bounded = (node) => {
            if (!Array.isArray(node)) { return false; }
            if (node[0] === 'Negate') { return bounded(node[1]); }
            if (!['Sin', 'Cos', 'Arctan', 'Tanh'].includes(node[0])) { return false; }
            const arg = rational(node[1]);
            return arg ? !arg.q.every(zero) : Number.isFinite(pointValue) && regular(node[1], pointAst);
        };
        function sideLimit(node, point, side, steps, depth = 0) {
            tick(); if (depth > 10) { return unknown(); }
            const rp = rational(node); if (rp) { return rationalLimit(rp, point, side, steps); }
            if (Number.isFinite(pointValue)) {
                const prepared = piecewise(node, point, side, steps);
                if (JSON.stringify(prepared) !== JSON.stringify(node)) { return sideLimit(prepared, point, side, steps, depth + 1); }
                if (regular(node, point)) {
                    const value = evaluate(node, point);
                    if (Number.isFinite(value.n)) {
                        steps.push({ text: 'Функция непрерывна в точке; подставляем значение аргумента.', math: `${latex(substitute(node, point))}=${latex(value.ast)}` });
                        return finite(value.ast);
                    }
                }
                if (node[0] === 'Divide' && regular(node[1], point) && regular(node[2], point)) {
                    let numerator = node[1]; let denominator = node[2];
                    for (let i = 0; i <= 8; i += 1) {
                        const n = evaluate(numerator, point); const d = evaluate(denominator, point);
                        if (!Number.isFinite(n.n) || !Number.isFinite(d.n)) { return unknown(); }
                        if (!zero(d.ast)) {
                            steps.push({ text: 'После преобразований знаменатель не равен нулю. Подставляем точку.', math: `\\frac{${latex(n.ast)}}{${latex(d.ast)}}` });
                            return finite(['Divide', n.ast, d.ast]);
                        }
                        if (!zero(n.ast)) {
                            const leadingDenominator = leading(denominator, point);
                            if (!leadingDenominator || leadingDenominator.zero) { return unknown(); }
                            const coefficient = evaluate(['Divide', n.ast, leadingDenominator.value], 0).n;
                            steps.push({ text: 'Числитель стремится к ненулевому числу, знаменатель — к нулю. Учитываем знак первого ненулевого члена знаменателя.',
                                math: `${latex(leadingDenominator.value)}(x-${latex(point)})^{${leadingDenominator.order}}` });
                            return infinite(Math.sign(coefficient) * (side < 0 && leadingDenominator.order % 2 ? -1 : 1));
                        }
                        const leadingDenominator = leading(denominator, point);
                        if (!leadingDenominator || leadingDenominator.zero || i === 8) { return unknown(); }
                        steps.push({ text: 'Получили 0/0. Числитель и знаменатель аналитичны в окрестности; производная знаменателя не обращается в ноль достаточно близко к точке, кроме самой точки. Применяем правило Лопиталя.',
                            math: `\\frac{${latex(numerator)}}{${latex(denominator)}}\\ \\longrightarrow\\ \\frac{${latex(derivative(numerator))}}{${latex(derivative(denominator))}}` });
                        numerator = derivative(numerator); denominator = derivative(denominator);
                    }
                }
            }
            if (!Array.isArray(node)) { return unknown(); }
            const [op, ...args] = node;
            if (op === 'Tan' || op === 'Cot') {
                return sideLimit(['Divide', [op === 'Tan' ? 'Sin' : 'Cos', args[0]], [op === 'Tan' ? 'Cos' : 'Sin', args[0]]], point, side, steps, depth + 1);
            }
            if (op === 'Divide' && bounded(args[0])) {
                const denominator = sideLimit(args[1], point, side, [], depth + 1);
                if (denominator.kind === 'infinite') {
                    steps.push({ text: 'Числитель ограничен, модуль знаменателя растёт без ограничения. По теореме о зажатой функции предел равен нулю.' });
                    return finite(0);
                }
            }
            if (['Multiply', 'InvisibleOperator'].includes(op)) {
                const index = args.findIndex(bounded);
                if (index >= 0) {
                    const other = sideLimit(['Multiply', ...args.filter((_, i) => i !== index)], point, side, [], depth + 1);
                    if (other.kind === 'finite' && zero(other.value)) {
                        steps.push({ text: 'Один множитель ограничен, другой стремится к нулю. По теореме о зажатой функции произведение стремится к нулю.' }); return finite(0);
                    }
                }
            }
            if (['Sin', 'Cos'].includes(op)) {
                const inner = rational(args[0]);
                if (inner) {
                    const limit = rationalLimit(inner, point, side, []);
                    if (limit.kind === 'infinite') { return { kind: 'dne', reason: 'Аргумент непрерывно уходит в бесконечность, а тригонометрическая функция продолжает принимать разные предельные значения: возникают колебания.' }; }
                }
            }
            if (['Sqrt', 'Ln', 'Log', 'Lg', 'Lb'].includes(op) && Number.isFinite(pointValue)) {
                const value = evaluate(args[0], point);
                if (zero(value.ast)) {
                    const sign = nearSign(args[0], point, side);
                    if (sign !== null && sign <= 0) { return domain(); }
                    if (sign > 0) {
                        steps.push({ text: 'Аргумент стремится к нулю с положительной стороны.', math: latex(args[0]) + '\\to 0^+' });
                        if (op === 'Sqrt') { return finite(0); }
                        const base = op === 'Lb' ? 2 : op === 'Ln' ? Math.E : args.length > 1 ? evaluate(args[1], point).n : 10;
                        if (!(base > 0) || base === 1 || depends(args[1])) { return unknown('Проверьте основание логарифма.'); }
                        return infinite(base > 1 ? -1 : 1);
                    }
                }
            }
            if (op === 'Power') {
                const base = sideLimit(args[0], point, side, [], depth + 1);
                const exponent = sideLimit(args[1], point, side, [], depth + 1);
                if (base.kind === 'finite' && zero(['Subtract', base.value, 1]) && exponent.kind === 'infinite') {
                    const denominator = ce.box(['Divide', 1, args[1]]).simplify().json;
                    steps.push({ text: 'Получили неопределённость 1 в бесконечной степени. Логарифмируем положительное основание и вычисляем предел логарифма.',
                        math: `\\ln L=\\lim\\frac{\\ln(${latex(args[0])})}{${latex(denominator)}}` });
                    const inner = sideLimit(['Divide', ['Ln', args[0]], denominator], point, side, steps, depth + 1);
                    if (inner.kind === 'finite') {
                        steps.push({ text: 'Возвращаемся от логарифма к исходному пределу.', math: `L=e^{${latex(inner.value)}}` });
                        return finite(['Power', 'ExponentialE', inner.value]);
                    }
                }
            }
            if (!Number.isFinite(pointValue)) {
                if (args.length === 1 && !['Abs', 'Floor', 'Ceil', 'Sign'].includes(op)) {
                    const inner = sideLimit(args[0], point, side, [], depth + 1);
                    if (inner.kind === 'finite' && regular([op, inner.value], 0)) {
                        steps.push({ text: 'Аргумент имеет конечный предел, внешняя функция в нём непрерывна.', math: latex([op, inner.value]) });
                        return finite([op, inner.value]);
                    }
                }
                if (['Add', 'Subtract', 'Negate', 'Multiply'].includes(op)) {
                    const values = args.map((arg) => sideLimit(arg, point, side, [], depth + 1));
                    if (values.every((value) => ['finite', 'infinite'].includes(value.kind))) {
                        const constants = values.map((value) => value.kind === 'finite' ? value.value
                            : value.sign > 0 ? 'PositiveInfinity' : 'NegativeInfinity');
                        const value = exact([op, ...constants]);
                        if (['PositiveInfinity', 'NegativeInfinity'].includes(value)) {
                            steps.push({ text: 'Сочетаем пределы слагаемых или множителей; неопределённости не возникает.', math: latex([op, ...constants]) });
                            return infinite(value === 'PositiveInfinity' ? 1 : -1);
                        }
                        if (Number.isFinite(evaluate(value, 0).n)) { return finite(value); }
                    }
                }
                if (['Exp', 'Ln', 'Sqrt', 'Abs'].includes(op)) {
                    const inner = sideLimit(args[0], point, side, steps, depth + 1);
                    if (inner.kind === 'infinite') {
                        if (op === 'Exp') { steps.push({ text: 'Используем поведение экспоненты при бесконечном аргументе.' }); return inner.sign > 0 ? infinite(1) : finite(0); }
                        if (op === 'Abs') { return infinite(1); }
                        return inner.sign > 0 ? infinite(1) : domain();
                    }
                    if (inner.kind === 'finite' && regular([op, inner.value], 0)) { return finite([op, inner.value]); }
                }
                if (op === 'Divide') {
                    const n = sideLimit(args[0], point, side, [], depth + 1);
                    const d = sideLimit(args[1], point, side, [], depth + 1);
                    if (n.kind === 'finite' && d.kind === 'infinite') { steps.push({ text: 'Числитель имеет конечный предел, знаменатель по модулю стремится к бесконечности.' }); return finite(0); }
                    if (n.kind === 'infinite' && d.kind === 'finite' && !zero(d.value)) { return infinite(n.sign * Math.sign(evaluate(d.value, 0).n)); }
                    if (n.kind === 'infinite' && d.kind === 'infinite' && depth < 8) {
                        const numerator = derivative(args[0]); const denominator = derivative(args[1]);
                        const denominatorPolynomial = rational(denominator);
                        if (denominatorPolynomial && !denominatorPolynomial.p.every(zero)) {
                            steps.push({ text: 'Получили бесконечность/бесконечность. В выбранном хвосте области определения применяем правило Лопиталя; производная знаменателя — ненулевая рациональная функция вне конечного множества точек.',
                                math: `\\frac{${latex(numerator)}}{${latex(denominator)}}` });
                            return sideLimit(['Divide', numerator, denominator], point, side, steps, depth + 1);
                        }
                    }
                }
            }
            return unknown();
        }
        const initial = { text: 'Исходный предел', math: `\\lim_{x\\to ${latex(pointAst)}${direction === 'left' ? '^-' : direction === 'right' ? '^+' : ''}}${expression}` };
        function analyze(side) {
            const steps = []; let result;
            try { result = sideLimit(raw, pointAst, side, steps); }
            catch (error) { result = unknown(error.message); }
            if (resultTex(result)) { steps.push({ text: 'Итог одностороннего вычисления', math: resultTex(result) }); }
            return { side: side < 0 ? 'left' : 'right', ...result, steps };
        }
        if (!Number.isFinite(pointValue)) {
            const result = analyze(pointValue < 0 ? -1 : 1);
            return { ...result, steps: [initial, ...result.steps], latex: resultTex(result), expression, destination, direction };
        }
        const sides = direction === 'both' ? [analyze(-1), analyze(1)] : [analyze(direction === 'left' ? -1 : 1)];
        let result = sides[0];
        if (sides.length === 2) {
            const right = sides[1]; const equal = result.kind === right.kind && (result.kind === 'finite'
                ? zero(['Subtract', result.value, right.value]) : result.kind === 'infinite' && result.sign === right.sign);
            if (!equal) {
                result = ['finite', 'infinite'].includes(result.kind) && ['finite', 'infinite'].includes(right.kind)
                    ? { kind: 'dne', reason: 'Левый и правый пределы различаются. Двусторонний предел не существует.' }
                    : sides.some((side) => side.kind === 'dne') ? { kind: 'dne', reason: 'Хотя бы с одной стороны предела нет.' }
                        : unknown('Сравните односторонние результаты. Полный двусторонний разбор не завершён.');
            }
        }
        return { kind: result.kind, value: result.value, sign: result.sign, reason: result.reason,
            latex: resultTex(result), sides, steps: [initial], expression, destination, direction };
    }
    owner.StudyLimits = { solve };
})();
