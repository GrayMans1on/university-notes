(() => {
    'use strict';
    function expression(source, language) {
        window.StudyTools.compile(source);
        source = source.toLowerCase().replace(/[−–]/g, '-').replace(/π/g, 'pi').replace(/[×·]/g, '*')
            .replace(/math\.(?=(sqrt|sin|cos|tan|asin|acos|atan|sinh|cosh|tanh|exp|log|floor|ceil)\()/g, '')
            .replace(/,/g, '.').replace(/\s/g, '');
        const tokens = source.match(/(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|[a-z][a-z0-9_]*|\*\*|\/\/|[()+*/%^!\-]/g);
        const py = language === 'python'; let index = 0;
        const funcs = { sqrt: 'Sqrt', sin: 'Sin', cos: 'Cos', tan: 'Tan', asin: 'Asin', acos: 'Acos', atan: 'Atan',
            sinh: 'Sinh', cosh: 'Cosh', tanh: 'Tanh', asinh: 'Asinh', acosh: 'Acosh', atanh: 'Atanh',
            ln: 'Log', log: 'Log10', exp: 'Exp', abs: 'Abs', floor: 'Floor', ceil: 'Ceiling' };
        const call = (name, ...args) => (py ? name : name === 'math.pow' ? 'Math.Pow' : name) + '(' + args.join(', ') + ')';
        function atom() {
            const token = tokens[index++]; let value;
            if (token === '(') { value = sum(); index += 1; value = '(' + value + ')'; }
            else if (/^(\d|\.)/.test(token)) {
                const number = Number(token); if (!Number.isFinite(number)) { throw new Error('Слишком большая константа.'); }
                value = String(number) + (py ? (Number.isInteger(number) && !String(number).includes('e') ? '.0' : '') : 'd');
            } else if (token === 'pi' || token === 'e') { value = py ? 'math.' + token : token === 'pi' ? 'Math.PI' : 'Math.E'; }
            else if (tokens[index] === '(') {
                index += 1; const arg = sum(); index += 1;
                if (token === 'round') { value = (py ? 'math.floor' : 'Math.Floor') + '((' + arg + ') + 0.5)'; }
                else if (token === 'abs') { value = (py ? 'abs' : 'Math.Abs') + '(' + arg + ')'; }
                else {
                    const name = py ? 'math.' + (token === 'ln' ? 'log' : token === 'log' ? 'log10' : token)
                        : 'Math.' + funcs[token];
                    value = call(name, arg);
                }
            } else { value = 'v[' + JSON.stringify(token) + ']'; }
            while (tokens[index] === '!') { index += 1; value = call(py ? 'factorial' : 'Factorial', value); }
            return value;
        }
        function power() {
            let a = atom();
            if (['^', '**'].includes(tokens[index])) { index += 1; a = call('math.pow', a, unary()); }
            return a;
        }
        function unary() {
            if (['+', '-'].includes(tokens[index])) { return '(' + tokens[index++] + unary() + ')'; }
            return power();
        }
        function product() {
            let a = unary();
            while (['*', '/', '//', '%'].includes(tokens[index])) {
                const op = tokens[index++]; const b = unary();
                a = op === '//' ? (py ? 'math.floor' : 'Math.Floor') + '((' + a + ') / (' + b + '))'
                    : op === '%' ? '(' + a + ' - ' + (py ? 'math.floor' : 'Math.Floor') + '((' + a + ') / (' + b + ')) * (' + b + '))'
                        : '(' + a + ' ' + op + ' ' + b + ')';
            }
            return a;
        }
        function sum() {
            let a = product();
            while (['+', '-'].includes(tokens[index])) { const op = tokens[index++]; a = '(' + a + ' ' + op + ' ' + product() + ')'; }
            return a;
        }
        return sum();
    }
    function code(document, language = 'python') {
        if (!['python', 'csharp'].includes(language)) { throw new Error('Выберите Python или C#.'); }
        const doc = window.StudyTools.validateFlow(document); const runner = new window.StudyFlow.Runner(doc);
        const py = language === 'python'; const e = (value) => expression(value, language);
        const safe = (value) => (py ? 'finite' : 'Finite') + '(' + e(value) + ')';
        const names = (value) => {
            const result = (value || '').split(',').map((name) => name.trim());
            if (!result.length || result.length > 20 || new Set(result).size !== result.length
                || !result.every(window.StudyFlow.validName)) { throw new Error('Проверьте имена переменных ввода.'); }
            return result;
        };
        function target(node, branch) {
            if (node.type === 'end') { return null; }
            let edges = doc.edges.filter((edge) => edge.from === node.id);
            if (node.type === 'decision') {
                const yes = edges.filter((edge) => ['да', 'true', '1'].includes(edge.label.toLowerCase().trim()));
                const no = edges.filter((edge) => ['нет', 'false', '0'].includes(edge.label.toLowerCase().trim()));
                if (edges.length !== 2 || yes.length !== 1 || no.length !== 1) { throw new Error('У условия нужны стрелки «Да» и «Нет».'); }
                return (branch ? yes : no)[0].to;
            }
            if (edges.length !== 1) { throw new Error('Из каждого обычного блока должна выходить одна стрелка.'); }
            return edges[0].to;
        }
        const blocks = [];
        for (const node of doc.nodes) {
            const config = node.config || {}; const body = [];
            const line = (value) => body.push(value + (py ? '' : ';'));
            if (node.type === 'end') { body.push(py ? 'break' : 'return;'); }
            else {
                if (node.type === 'input') {
                    for (const name of names(config.variable)) {
                        line('v[' + JSON.stringify(name) + '] = ' + (py ? `finite(float(input(${JSON.stringify(name + ' = ')}).replace(',', '.')))`
                            : `Finite(double.Parse(Console.ReadLine() ?? "", CultureInfo.InvariantCulture))`));
                    }
                } else if (node.type === 'process') {
                    let program = config.program;
                    if (program === undefined) {
                        const operation = config.operation || 'expression';
                        const value = operation === 'expression' ? config.expression
                            : ['+', '-', '*', '/', '^', '%'].includes(operation) ? `(${config.left}) ${operation} (${config.right})`
                                : `${operation}(${config.left})`;
                        program = `${config.variable} = ${value}`;
                    }
                    for (const { name, operator, expression: source } of window.StudyFlow.statements(program)) {
                        let value = source;
                        if (operator !== '=') { value = `${name} ${operator.slice(0, -1)} (${source})`; }
                        line('v[' + JSON.stringify(name) + '] = ' + safe(value));
                    }
                } else if (node.type === 'output') {
                    line((py ? 'print' : 'Console.WriteLine') + '(' + safe(config.expression || '') + ')');
                }
                if (node.type === 'decision') {
                    if (!['>', '<', '>=', '<=', '==', '!='].includes(config.operator)) { throw new Error('Укажите сравнение в условии.'); }
                    const condition = safe(config.left || '') + ' ' + config.operator + ' ' + safe(config.right || '');
                    line('state = ' + (py ? JSON.stringify(target(node, true)) + ' if ' + condition + ' else ' + JSON.stringify(target(node, false))
                        : condition + ' ? ' + JSON.stringify(target(node, true)) + ' : ' + JSON.stringify(target(node, false))));
                } else { line('state = ' + JSON.stringify(target(node))); }
            }
            if (py) {
                blocks.push(`    ${blocks.length ? 'elif' : 'if'} state == ${JSON.stringify(node.id)}:\n` + body.map((s) => '        ' + s).join('\n'));
            } else { blocks.push(`                case ${JSON.stringify(node.id)}:\n` + body.map((s) => '                    ' + s).join('\n') + (node.type === 'end' ? '' : '\n                    break;')); }
        }
        if (py) {
            return '# Generated from a CSU flowchart. Python 3; numeric variables use floats.\nimport math\n\n'
                + 'def finite(value):\n    if not math.isfinite(value):\n        raise ValueError("Non-finite value")\n    return value\n\n'
                + 'def factorial(value):\n    if value < 0 or value > 170 or value != math.floor(value):\n        raise ValueError("Invalid factorial")\n    return float(math.factorial(int(value)))\n\n'
                + 'v = {}\nstate = ' + JSON.stringify(runner.next) + '\nfor step in range(10000):\n' + blocks.join('\n')
                + '\n    else:\n        raise ValueError("Unknown block")\nelse:\n    raise RuntimeError("Step budget exceeded")\n';
        }
        return '// Generated from a CSU flowchart. .NET 8 console application.\nusing System;\nusing System.Collections.Generic;\nusing System.Globalization;\n\n'
            + 'public static class Program\n{\n    private static double Finite(double value)\n    {\n        if (!double.IsFinite(value)) { throw new ArithmeticException("Non-finite value"); }\n        return value;\n    }\n'
            + '    private static double Factorial(double value)\n    {\n        if (value < 0 || value > 170 || value != Math.Floor(value)) { throw new ArithmeticException("Invalid factorial"); }\n        double result = 1;\n        for (int i = 2; i <= value; i++) { result *= i; }\n        return result;\n    }\n'
            + '    public static void Main()\n    {\n        var v = new Dictionary<string, double>();\n        string state = ' + JSON.stringify(runner.next)
            + ';\n        for (int step = 0; step < 10000; step++)\n        {\n            switch (state)\n            {\n'
            + blocks.join('\n') + '\n                default: throw new InvalidOperationException("Unknown block");\n            }\n        }\n        throw new InvalidOperationException("Step budget exceeded");\n    }\n}\n';
    }
    window.StudyFlowExport = { code, expression };
})();
