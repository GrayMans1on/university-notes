(() => {
    'use strict';
    const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    function baseValue(value) {
        const base = Number(value);
        if (!Number.isInteger(base) || base < 2 || base > 36) { throw new Error('Основание — целое число от 2 до 36.'); }
        return base;
    }
    const trim = (a) => { while (a.length > 1 && a.at(-1) === 0) { a.pop(); } return a; };
    const text = (a) => [...a].reverse().map((d) => alphabet[d]).join('');
    function parse(value, base) {
        base = baseValue(base);
        if (typeof value !== 'string' || value.length > 130 || !/^[+-]?[0-9A-Z]+(?:[.,][0-9A-Z]+)?$/i.test(value.trim())) {
            throw new Error('Введите до 128 цифр, при необходимости с точкой и знаком.');
        }
        const sign = value.trim().startsWith('-') ? -1 : 1;
        const parts = value.trim().toUpperCase().replace(/^[+-]/, '').replace(',', '.').split('.');
        const digits = parts.join('').split('').reverse().map((d) => alphabet.indexOf(d));
        if (digits.some((d) => d < 0 || d >= base)) { throw new Error('В числе есть цифра, недопустимая для основания ' + base + '.'); }
        return { digits: trim(digits), scale: parts[1]?.length || 0, sign };
    }
    function format(digits, scale = 0, sign = 1) {
        let s = text(trim([...digits])).padStart(scale + 1, '0');
        if (scale) { s = s.slice(0, -scale) + '.' + s.slice(-scale); s = s.replace(/0+$/, '').replace(/\.$/, ''); }
        return sign < 0 && digits.some(Boolean) ? '-' + s : s;
    }
    function compare(a, b) {
        if (a.length !== b.length) { return a.length - b.length; }
        for (let i = a.length - 1; i >= 0; i -= 1) { if (a[i] !== b[i]) { return a[i] - b[i]; } }
        return 0;
    }
    function add(a, b, base, trace = []) {
        const out = []; let carry = 0;
        for (let i = 0; i < Math.max(a.length, b.length) || carry; i += 1) {
            const x = a[i] || 0; const y = b[i] || 0; const incoming = carry; const total = x + y + incoming;
            out.push(total % base); carry = Math.floor(total / base);
            trace.push({ column: i, text: `${alphabet[x]} + ${alphabet[y]} + ${alphabet[incoming]} = ${total.toString(base).toUpperCase()}; цифра ${alphabet[out[i]]}, перенос ${alphabet[carry]}.` });
        }
        return trim(out.length ? out : [0]);
    }
    function subtract(a, b, base, trace = []) {
        const out = []; let borrow = 0;
        for (let i = 0; i < a.length; i += 1) {
            const x = a[i]; const y = b[i] || 0; const incoming = borrow; let d = x - incoming - y;
            borrow = d < 0 ? 1 : 0; if (borrow) { d += base; } out.push(d);
            trace.push({ column: i, text: `Разряд ${i + 1}: ${alphabet[x]} − ${alphabet[y]}, входящий заём ${incoming}; цифра ${alphabet[d]}, заём из следующего разряда ${borrow}.` });
        }
        return trim(out);
    }
    function digitProduct(a, digit, base, trace = []) {
        const out = []; let carry = 0;
        for (let i = 0; i < a.length || carry; i += 1) {
            const incoming = carry; const total = (a[i] || 0) * digit + incoming;
            out.push(total % base); carry = Math.floor(total / base);
            trace.push({ column: i, text: `${alphabet[a[i] || 0]} × ${alphabet[digit]} + ${incoming.toString(base).toUpperCase()} = ${total.toString(base).toUpperCase()}; цифра ${alphabet[out[i]]}, перенос ${carry.toString(base).toUpperCase()}.` });
        }
        return trim(out.length ? out : [0]);
    }
    function divide(a, b, base, precision) {
        if (!b.some(Boolean)) { throw new Error('Деление на ноль.'); }
        let remainder = [0]; const integer = []; const fraction = []; const steps = []; const seen = new Map();
        function next(digit, fractional) {
            const before = text(remainder); remainder = trim([digit, ...remainder]);
            const brought = text(remainder); let q = 0;
            while (q + 1 < base && compare(digitProduct(b, q + 1, base), remainder) <= 0) { q += 1; }
            const product = digitProduct(b, q, base); remainder = subtract(remainder, product, base);
            steps.push({ before, brought, digit: alphabet[q], product: text(product), remainder: text(remainder), fractional,
                text: `${brought} − ${text(product)} = ${text(remainder)}; следующая цифра частного ${alphabet[q]}.` });
            return alphabet[q];
        }
        for (const digit of [...a].reverse()) { integer.push(next(digit, false)); }
        let repeat = -1;
        while (remainder.some(Boolean) && fraction.length < precision) {
            const key = text(remainder);
            if (seen.has(key)) { repeat = seen.get(key); break; }
            seen.set(key, fraction.length); fraction.push(next(0, true));
        }
        const whole = integer.join('').replace(/^0+(?=.)/, '');
        const frac = repeat >= 0 ? fraction.slice(0, repeat).join('') + '(' + fraction.slice(repeat).join('') + ')' : fraction.join('');
        return { result: whole + (frac ? '.' + frac : ''), steps, approximate: repeat < 0 && remainder.some(Boolean), remainder: text(remainder) };
    }
    function calculate(left, right, operator, base, precision = 24) {
        base = baseValue(base);
        if (!Number.isInteger(precision) || precision < 1 || precision > 64) { throw new Error('Точность — от 1 до 64 разрядов.'); }
        const x = parse(left, base); const y = parse(right, base); const steps = []; const partials = [];
        const scale = Math.max(x.scale, y.scale); const pad = (v) => trim([...Array(scale - v.scale).fill(0), ...v.digits]);
        const a = pad(x); const b = pad(y); let result;
        if (operator === '+' || operator === '-') {
            const sign = operator === '-' ? -y.sign : y.sign; let digits; let outputSign;
            if (x.sign === sign) { digits = add(a, b, base, steps); outputSign = x.sign; }
            else if (compare(a, b) >= 0) { digits = subtract(a, b, base, steps); outputSign = x.sign; }
            else { digits = subtract(b, a, base, steps); outputSign = sign; }
            result = format(digits, scale, outputSign);
        } else if (operator === '*') {
            let digits = [0];
            for (let i = 0; i < y.digits.length; i += 1) {
                const product = [...Array(i).fill(0), ...digitProduct(x.digits, y.digits[i], base, steps)];
                partials.push(text(product)); digits = add(digits, product, base, steps);
            }
            result = format(digits, x.scale + y.scale, x.sign * y.sign);
        } else if (operator === '/') {
            const division = divide(a, b, base, precision);
            return { ...division, base, operator, left, right, normalized: [text(a), text(b)],
                result: x.sign * y.sign < 0 && division.result !== '0' ? '-' + division.result : division.result };
        } else { throw new Error('Выберите +, −, × или ÷.'); }
        return { result, base, operator, left, right, steps, partials, approximate: false };
    }
    function convert(value, from, to, precision = 32) {
        from = baseValue(from); to = baseValue(to);
        if (!Number.isInteger(precision) || precision < 1 || precision > 64) { throw new Error('Точность — от 1 до 64 разрядов.'); }
        const parsed = parse(value, from); let numerator = 0n; const denominator = BigInt(from) ** BigInt(parsed.scale);
        for (const d of [...parsed.digits].reverse()) { numerator = numerator * BigInt(from) + BigInt(d); }
        let whole = numerator / denominator; let rem = numerator % denominator; const steps = []; const integer = [];
        do {
            const q = whole / BigInt(to); const r = whole % BigInt(to);
            steps.push(`${whole} ÷ ${to} = ${q}, остаток ${alphabet[Number(r)]}`); integer.unshift(alphabet[Number(r)]); whole = q;
        } while (whole);
        const seen = new Map(); const fraction = []; let repeat = -1;
        while (rem && fraction.length < precision) {
            if (seen.has(String(rem))) { repeat = seen.get(String(rem)); break; }
            seen.set(String(rem), fraction.length);
            const before = rem; rem *= BigInt(to); const d = rem / denominator; rem %= denominator;
            fraction.push(alphabet[Number(d)]);
            steps.push(`${before}/${denominator} × ${to} = ${d} + ${rem}/${denominator}; цифра ${alphabet[Number(d)]}`);
        }
        const frac = repeat >= 0 ? fraction.slice(0, repeat).join('') + '(' + fraction.slice(repeat).join('') + ')' : fraction.join('');
        const result = (parsed.sign < 0 && numerator ? '-' : '') + integer.join('') + (frac ? '.' + frac : '');
        return { result, from, to, steps, approximate: repeat < 0 && rem !== 0n };
    }
    window.StudyRadix = { parse, calculate, convert };
})();
