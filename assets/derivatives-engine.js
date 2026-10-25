(() => {
    'use strict';
    function solve(expression) {
        if (typeof expression !== 'string' || !expression.trim() || expression.length > 1200) {
            throw new Error('Введите формулу длиной до 1200 символов.');
        }
        const ce = new window.ComputeEngine.ComputeEngine(); const steps = []; const conditions = new Set();
        const functionAliases = { sh: 'sinh', ch: 'cosh', th: 'tanh', cth: 'coth', tg: 'tan', ctg: 'cot', arctg: 'arctan' };
        const source = expression.replace(/\\operatorname\{(sh|ch|th|cth|tg|ctg|arctg)\}/g, (_, name) => '\\' + functionAliases[name]);
        const parsed = ce.parse(source, { canonical: false });
        if (!parsed.isValid) { throw new Error('Проверьте формулу и скобки.'); }
        const depends = (node) => node === 'x' || (Array.isArray(node) && node.slice(1).some(depends));
        const exact = (node) => ce.box(node).evaluate().json;
        const tex = (node) => ce.box(node, { canonical: false }).latex.replace(/\\exponentialE/g, 'e');
        const add = (...args) => ['Add', ...args]; const mul = (...args) => ['Multiply', ...args];
        const div = (a, b) => ['Divide', a, b]; const power = (a, n) => ['Power', a, n];
        const neg = (a) => ['Negate', a]; const sub = (a, b) => ['Subtract', a, b];
        const num = (node) => ce.box(node).N().re;
        let count = 0;
        function normalize(node) {
            if (++count > 250) { throw new Error('Формула слишком сложная.'); }
            if (node === 'e') { return 'ExponentialE'; }
            if (!Array.isArray(node)) { return node; }
            const args = node.slice(1).map(normalize);
            if (node[0] === 'Delimiter') { return args[0]; }
            const aliases = { tg: 'Tan', ctg: 'Cot', arctg: 'Arctan', sh: 'Sinh', ch: 'Cosh', th: 'Tanh', cth: 'Coth', lg: 'Lg' };
            return [aliases[node[0]] || (node[0] === 'InvisibleOperator' ? 'Multiply' : node[0]), ...args];
        }
        const raw = normalize(parsed.json);
        function requireCondition(node, relation) {
            const reduced = exact(node); const value = num(reduced);
            if (!depends(reduced) && typeof value === 'number' && Number.isFinite(value)) {
                if ((relation === '>0' && value <= 0) || (relation === '\\ne0' && value === 0)
                    || (relation === '\\ne1' && value === 1)) { throw new Error('Выражение не определено в вещественных числах.'); }
                return;
            }
            conditions.add(`${tex(node)}${relation}`);
        }
        function visit(node, depth = 0) {
            if (depth > 24 || ++count > 600) { throw new Error('Формула слишком сложная.'); }
            if (typeof node === 'number' || node?.num !== undefined) { return 0; }
            if (typeof node === 'string') {
                if (node === 'x') { return 1; }
                if (/^[a-df-wyz]$/.test(node) || ['Pi', 'ExponentialE'].includes(node)) { return 0; }
                throw new Error('Неподдерживаемая переменная или константа: ' + node);
            }
            if (!Array.isArray(node)) { throw new Error('Неподдерживаемая запись.'); }
            const [op, ...args] = node; const u = args[0]; const v = args[1]; let answer; let rule;
            if (op === 'Add' || op === 'Subtract') { answer = [op, ...args.map((a) => visit(a, depth + 1))]; rule = 'Производная суммы / разности'; }
            else if (op === 'Negate') { answer = neg(visit(u, depth + 1)); rule = 'Постоянный множитель'; }
            else if (op === 'Multiply') {
                const derivatives = args.map((a) => visit(a, depth + 1));
                answer = add(...args.map((_, i) => mul(...args.map((a, j) => i === j ? derivatives[j] : a))));
                rule = 'Правило произведения: дифференцируем множители по очереди';
            } else if (op === 'Divide' || op === 'Rational') {
                requireCondition(v, '\\ne0');
                answer = div(sub(mul(visit(u, depth + 1), v), mul(u, visit(v, depth + 1))), power(v, 2)); rule = 'Правило частного';
            } else if (op === 'Square' || op === 'Sqrt' || op === 'Root') {
                const exponent = op === 'Square' ? 2 : div(1, op === 'Root' ? v : 2);
                if (op === 'Root' && (depends(v) || !Number.isInteger(num(v)) || num(v) < 2)) {
                    throw new Error('Для корня нужен постоянный целый порядок ≥ 2.');
                }
                if (op === 'Root' && num(v) % 2 === 1) {
                    requireCondition(u, '\\ne0');
                    answer = div(visit(u, depth + 1), mul(v, ['Root', power(u, num(v) - 1), v]));
                    rule = 'Производная корня нечётного порядка и правило сложной функции; подкоренное выражение отлично от нуля';
                } else {
                    if (op !== 'Square') { requireCondition(u, '>0'); }
                    answer = mul(exponent, power(u, sub(exponent, 1)), visit(u, depth + 1));
                    rule = 'Переписываем корень как степень и применяем правило сложной функции';
                }
            } else if (op === 'Power') {
                if (!depends(v)) {
                    const exponent = num(v);
                    if (!Number.isInteger(exponent)) { requireCondition(u, '>0'); }
                    else if (exponent <= 0) { requireCondition(u, '\\ne0'); }
                    // A zero exponent is constant, but the original base domain is still visited.
                    const du = visit(u, depth + 1);
                    answer = exponent === 0 ? 0 : exponent === 1 ? du : mul(v, power(u, sub(v, 1)), du); rule = 'Степенная функция и цепное правило';
                } else if (!depends(u)) {
                    requireCondition(u, '>0'); answer = mul(node, ['Ln', u], visit(v, depth + 1));
                    rule = 'Показательная функция и цепное правило';
                } else {
                    requireCondition(u, '>0');
                    answer = mul(node, add(mul(visit(v, depth + 1), ['Ln', u]), div(mul(v, visit(u, depth + 1)), u)));
                    rule = 'При положительном основании записываем степень как exp(v ln u), применяем цепное правило и правило произведения';
                }
            } else if (['Log', 'Lg', 'Lb'].includes(op)) {
                const base = op === 'Lb' ? 2 : v || 10;
                requireCondition(u, '>0'); requireCondition(base, '>0'); requireCondition(base, '\\ne1');
                answer = visit(div(['Ln', u], ['Ln', base]), depth + 1); rule = 'Переход к натуральным логарифмам';
            } else if (op === 'Ln' && u?.[0] === 'Abs') {
                requireCondition(u[1], '\\ne0'); answer = div(visit(u[1], depth + 1), u[1]); rule = 'Производная ln|u| на исходной области';
            } else {
                const table = {
                    Sin: ['Cos', u], Cos: neg(['Sin', u]), Tan: div(1, power(['Cos', u], 2)),
                    Cot: neg(div(1, power(['Sin', u], 2))), Exp: ['Exp', u], Ln: div(1, u),
                    Arcsin: div(1, ['Sqrt', sub(1, power(u, 2))]), Arccos: neg(div(1, ['Sqrt', sub(1, power(u, 2))])),
                    Arctan: div(1, add(1, power(u, 2))), Arccot: neg(div(1, add(1, power(u, 2)))),
                    Sinh: ['Cosh', u], Cosh: ['Sinh', u], Tanh: div(1, power(['Cosh', u], 2)),
                    Coth: neg(div(1, power(['Sinh', u], 2))),
                };
                if (!Object.hasOwn(table, op) || args.length !== 1) {
                    throw new Error('Не удалось применить изученные правила к этой записи: ' + op + '.');
                }
                if (op === 'Ln') { requireCondition(u, '>0'); }
                if (op === 'Tan') { requireCondition(['Cos', u], '\\ne0'); }
                if (op === 'Cot') { requireCondition(['Sin', u], '\\ne0'); }
                if (op === 'Coth') { requireCondition(['Sinh', u], '\\ne0'); }
                if (['Arcsin', 'Arccos'].includes(op)) { conditions.add(`\\left|${tex(u)}\\right|<1`); }
                answer = mul(table[op], visit(u, depth + 1)); rule = 'Табличная производная и правило сложной функции';
            }
            const simplified = exact(answer);
            if (depends(node)) {
                steps.push({ text: rule, math: `\\left(${tex(node)}\\right)'=${tex(answer)}=${tex(simplified)}` });
            }
            return simplified;
        }
        const derivative = visit(raw); const latex = tex(derivative);
        return { kind: 'solved', expression, latex, ast: derivative, conditions: [...conditions], steps,
            chain: `\\left(${tex(raw)}\\right)'=${latex}` };
    }
    window.StudyDerivatives = { solve };
})();
