(() => {
    'use strict';
    const functions = {
        Sin: Math.sin, Cos: Math.cos, Tan: Math.tan, Cot: (x) => 1 / Math.tan(x),
        Sec: (x) => 1 / Math.cos(x), Csc: (x) => 1 / Math.sin(x),
        Arcsin: Math.asin, Arccos: Math.acos, Arctan: Math.atan, Arccot: (x) => Math.atan2(1, x),
        Sinh: Math.sinh, Cosh: Math.cosh, Tanh: Math.tanh, Coth: (x) => 1 / Math.tanh(x),
        Arsinh: Math.asinh, Arcosh: Math.acosh, Artanh: Math.atanh,
        Sqrt: Math.sqrt, Abs: Math.abs, Ln: Math.log, Lg: Math.log10, Lb: Math.log2,
        Exp: Math.exp, Floor: Math.floor, Ceil: Math.ceil, Round: Math.round, Sign: Math.sign,
    };
    let engine;
    function compile(latex) {
        if (!latex || latex.length > 1200) { throw new Error('Введите формулу длиной до 1200 символов.'); }
        const ce = engine || (engine = new window.ComputeEngine.ComputeEngine());
        const expression = ce.parse(latex);
        if (!expression.isValid) { throw new Error('Формула не завершена или содержит ошибку.'); }
        let size = 0;
        function build(node, depth = 0) {
            if (++size > 1000 || depth > 60) { throw new Error('Слишком сложная формула.'); }
            if (typeof node === 'number') { return () => node; }
            if (typeof node === 'object' && !Array.isArray(node) && node?.num !== undefined) {
                const n = Number(node.num); return () => n;
            }
            if (typeof node === 'string') {
                const constants = { Pi: Math.PI, ExponentialE: Math.E, True: 1, False: 0, ComplexInfinity: NaN, PositiveInfinity: Infinity, NegativeInfinity: -Infinity, NaN: NaN };
                if (Object.hasOwn(constants, node)) { return () => constants[node]; }
                if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(node)) { throw new Error('Неподдерживаемый символ: ' + node); }
                return (scope) => {
                    if (!Object.hasOwn(scope, node)) { throw new Error('Не задана переменная ' + node); }
                    return Number(scope[node]);
                };
            }
            if (!Array.isArray(node)) { throw new Error('Неподдерживаемая запись.'); }
            const [op, ...args] = node;
            if (op === 'Sum' || op === 'Product') {
                const limits = args[1];
                if (!Array.isArray(limits) || !['Limits', 'Tuple'].includes(limits[0]) || limits.length !== 4) {
                    throw new Error('Для суммы и произведения нужны индекс и обе границы.');
                }
                const body = build(args[0], depth + 1); const from = build(limits[2], depth + 1);
                const to = build(limits[3], depth + 1); const name = limits[1];
                if (typeof name !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(name)) {
                    throw new Error('Некорректный индекс суммы.');
                }
                return (scope, budget) => {
                    const a = from(scope, budget); const b = to(scope, budget);
                    if (!Number.isInteger(a) || !Number.isInteger(b) || b - a > 999) {
                        throw new Error('Границы должны быть целыми; не более 1000 слагаемых.');
                    }
                    let value = op === 'Sum' ? 0 : 1; const local = { ...scope };
                    for (let i = a; i <= b; i += 1) {
                        if (--budget.left < 0) { throw new Error('Превышен предел вычислений.'); }
                        local[name] = i; const v = body(local, budget);
                        value = op === 'Sum' ? value + v : value * v;
                    }
                    return value;
                };
            }
            const parts = args.map((arg) => build(arg, depth + 1));
            if (Object.hasOwn(functions, op)) {
                if (parts.length !== 1) { throw new Error('Проверьте аргумент функции.'); }
                return (s, b) => functions[op](parts[0](s, b));
            }
            const operators = {
                Add: (a) => a.reduce((x, y) => x + y, 0), Multiply: (a) => a.reduce((x, y) => x * y, 1),
                Negate: (a) => -a[0], Subtract: (a) => a[0] - a[1], Divide: (a) => a[0] / a[1],
                Rational: (a) => a[0] / a[1], Power: (a) => a[0] ** a[1], Square: (a) => a[0] ** 2,
                Root: (a) => a[0] < 0 && a[1] % 2 === 1 ? -((-a[0]) ** (1 / a[1])) : a[0] ** (1 / a[1]),
                Log: (a) => a.length === 1 ? Math.log10(a[0]) : Math.log(a[0]) / Math.log(a[1]),
                Min: (a) => Math.min(...a), Max: (a) => Math.max(...a), Mod: (a) => a[0] % a[1],
                Factorial: (a) => {
                    if (!Number.isInteger(a[0]) || a[0] < 0 || a[0] > 170) { return NaN; }
                    let n = 1; for (let i = 2; i <= a[0]; i += 1) { n *= i; } return n;
                },
            };
            if (!Object.hasOwn(operators, op)) { throw new Error('Пока не поддерживается: ' + op); }
            return (scope, budget) => operators[op](parts.map((fn) => fn(scope, budget)));
        }
        const fn = build(expression.json);
        return (scope = {}) => fn(scope, { left: 10000 });
    }
    window.StudyMath = { compile };
})();
