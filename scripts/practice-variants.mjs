const tex = String.raw;
const field = (label, expected, kind = 'number') => ({ label, kind, expected: kind === 'set' ? expected : String(expected) });
const task = (question, solution, fields) => ({ question, solution, fields, hint: '' });
const matrix = (rows) => tex`\begin{pmatrix}${rows.map((row) => row.join('&')).join('\\\\')}\end{pmatrix}`;
const set = (values) => tex`\{${values.join(',')}\}`;
const factorial = (n) => { let result = 1; for (let i = 2; i <= n; i += 1) { result *= i; } return result; };
const choose = (n, k) => factorial(n) / factorial(k) / factorial(n - k);
function random(seed) {
    let state = seed >>> 0;
    return (min, max) => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return min + Math.floor(state / 4294967296 * (max - min + 1));
    };
}
function hash(text) {
    let result = 2166136261;
    for (const character of text) { result = Math.imul(result ^ character.charCodeAt(0), 16777619); }
    return result >>> 0;
}
export function generatePracticeTask(source, seed) {
    const r = random(seed);
    const a = r(2, 16), b = r(2, 9), c = r(1, 6), d = r(1, 7);
    const numeric = (labels, values) => labels.map((label, i) => field(label, values[i]));
    switch (source.title) {
        case 'Обратное отображение': {
            const x = r(-5, 5), y = r(-6, 6), u = a * x - b, v = a * y - b;
            return task(tex`$f(x)=${a}x-${b}$. Найди прообраз $${u}$ и $f^{-1}(${v})$.`,
                tex`$y=${a}x-${b}\Rightarrow x=(y+${b})/${a}$. Прообраз: $${x}$; обратная функция: $${y}$.`,
                numeric([`Прообраз ${u}`, `f⁻¹(${v})`], [x, y]));
        }
        case 'Композиции': {
            const x = r(-4, 5);
            return task(tex`$f(x)=x+${a}$, $g(x)=x^2$. Вычисли $(g\circ f)(${x})$ и $(f\circ g)(${x})$.`,
                tex`$g(f(${x}))=(${x}+${a})^2=${(x + a) ** 2}$; $f(g(${x}))=${x}^2+${a}=${x * x + a}$.`,
                numeric(['g∘f', 'f∘g'], [(x + a) ** 2, x * x + a]));
        }
        case 'Грани и максимум': {
            const low = r(-8, 2), high = low + a;
            return task(tex`$X=(${low},${high}]$, $Y=(${low},${high})$. Найди $\inf X$, $\sup X$, $\max X$, $\sup Y$.`,
                tex`Нижняя грань $${low}$, верхняя $${high}$. В X верхняя граница принадлежит множеству и является максимумом.`,
                numeric(['inf X', 'sup X', 'max X', 'sup Y'], [low, high, high, high]));
        }
        case 'Целая и дробная части':
        case 'Проверка отрицательного числа': {
            const whole = -r(1, 8), tenth = r(1, 9), x = whole - tenth / 10, center = r(-6, 6), radius = r(1, 9) / 10;
            return task(tex`Найди $[x]$ и $\{x\}$ для $x=${x.toFixed(1)}$, а также границы $O_{${center}}^{${radius}}$.`,
                tex`$${whole - 1}\le${x.toFixed(1)}<${whole}$. Поэтому $[x]=${whole - 1}$ и $\{x\}=${(1 - tenth / 10).toFixed(1)}$. Границы окрестности: центр минус и плюс радиус.`,
                numeric(['[x]', '{x}', 'Левая граница', 'Правая граница'], [whole - 1, (10 - tenth) / 10, center - radius, center + radius]));
        }
        case 'Несколько преобразований':
            return task(tex`Для $y=${a}e^{-x+${b}}+${c}$ найди горизонтальную асимптоту и значения $y(${b})$, $y(${b + 1})$.`,
                tex`При $x\to+\infty$ экспонента стремится к нулю: $y=${c}$. В заданных точках показатели равны 0 и −1: $${a + c}$ и $${a}/e+${c}$.`,
                numeric(['Асимптота y=', `y(${b})`, `y(${b + 1})`], [c, a + c, `${a}/e+${c}`]));
        case 'Модуль графика':
            return task(tex`Для $y=|x-${a}|+${b}$ найди абсциссу вершины и $y(0)$.`,
                tex`Модуль равен нулю при $x=${a}$; $y(0)=${a}+${b}=${a + b}$.`, numeric(['Абсцисса вершины', 'y(0)'], [a, a + b]));
        case 'Композиция и разрывы':
            return task(tex`Для $y=\operatorname{arctg}\frac{x+${a}}{x-${b}}$ найди исключённый x, горизонтальную асимптоту и пределы слева и справа при $x\to${b}$.`,
                tex`Знаменатель обращается в нуль в ${b}. На бесконечности дробь стремится к 1, асимптота $\pi/4$. Числитель около ${b} положителен: слева $-\pi/2$, справа $\pi/2$.`,
                numeric(['Исключённый x', 'Асимптота y=', 'Слева', 'Справа'], [b, 'pi/4', '-pi/2', 'pi/2']));
        case 'Область логарифма':
            return task(tex`Для $y=\log_{${a}}|1-${b}^{-x}|$ найди исключённый x и $y(1)$.`,
                tex`Аргумент равен нулю только в 0. $y(1)=\ln(1-1/${b})/\ln ${a}$.`, numeric(['Исключённый x', 'y(1)'], [0, `ln(1-1/${b})/ln(${a})`]));
        case 'ε и номер': {
            const denominator = r(5, 25), limit = r(-4, 5);
            return task(tex`$a_n=${limit}+${a}/n$, $n\ge1$, $\varepsilon=1/${denominator}$. Найди предел и наименьшее целое $N\ge0$, для которого $|a_n-${limit}|<\varepsilon$ при всех $n>N$.`,
                tex`Предел ${limit}. Неравенство $${a}/n<1/${denominator}$ равносильно $n>${a * denominator}$, значит минимальное N=${a * denominator}.`, numeric(['Предел', 'Минимальное N'], [limit, a * denominator]));
        }
        case 'Предел и оценка хвоста': {
            const denominator = r(10, 40);
            return task(tex`$a_n=n/(n+${a})$, $\varepsilon=1/${denominator}$. Найди предел и минимальное целое $N\ge0$: $|a_n-L|<\varepsilon$ для всех $n>N$.`,
                tex`$L=1$, $|a_n-1|=${a}/(n+${a})$. Условие $n>${a * denominator - a}$ даёт N=${a * denominator - a}.`, numeric(['Предел', 'Минимальное N'], [1, a * denominator - a]));
        }
        case 'Бернулли как оценка':
            return task(tex`По неравенству Бернулли дай нижнюю оценку $(1+${a}/100)^{${b}}$, именно $1+n\alpha$.`,
                tex`$1+${b}\cdot${a}/100=${1 + a * b / 100}$.`, [field('Нижняя оценка', 1 + a * b / 100)]);
        case 'Сопряжённое и старшая степень':
        case 'Другая пара пределов':
            return task(tex`Вычисли $\lim_{n\to\infty}(\sqrt{n^2+${a}n}-n)$ и $\lim_{n\to\infty}\frac{${b}n^2-${c}n}{${d}n^2+${a}}$.`,
                tex`Первую разность умножаем на сопряжённое: $${a}n/(\sqrt{n^2+${a}n}+n)\to${a}/2$. Вторую дробь делим на $n^2$: предел $${b}/${d}$.`, numeric(['Первый предел', 'Второй предел'], [`${a}/2`, `${b}/${d}`]));
        case 'Модуль и направление':
        case 'Устранимая неопределённость': {
            const sign = r(0, 1) ? 1 : -1;
            return task(tex`Вычисли $\lim_{x\to${sign > 0 ? '+' : '-'}\infty}\sqrt{x^2+${a}}/x$ и $\lim_{x\to${b}}(x^2-${b * b})/(x-${b})$.`,
                tex`$\sqrt{x^2}=|x|$, поэтому первый предел ${sign}. Сокращаем $(x-${b})(x+${b})$: второй предел ${2 * b}.`, numeric(['Первый предел', 'Второй предел'], [sign, 2 * b]));
        }
        case 'Комбинация стандартных пределов':
        case 'Вариант с другой заменой':
            return task(tex`Вычисли $\lim_{x\to0}\sin(${a}x)/\sin(${b}x)$ и $\lim_{x\to0}(e^{${c}x}-1)/x$.`,
                tex`С помощью замен $t=${a}x$, $u=${b}x$ первый предел равен $${a}/${b}$. Во втором выделяем $${c}(e^{${c}x}-1)/(${c}x)$: ответ ${c}.`, numeric(['Первый предел', 'Второй предел'], [`${a}/${b}`, c]));
        case 'Логарифм и тригонометрия':
            return task(tex`Вычисли $\lim_{x\to0}\ln(1+${a}x)/\sin(${b}x)$.`, tex`Выделяем $\ln(1+${a}x)/(${a}x)$ и $${b}x/\sin(${b}x)$: ответ $${a}/${b}$.`, [field('Предел', `${a}/${b}`)]);
        case 'Выдели степень e':
            return task(tex`Вычисли $\lim_{x\to\infty}((x+${a})/(x-${b}))^{${c}x-${d}}$. Найди также предел произведения приращения основания на показатель.`,
                tex`Основание $1+(${a}+${b})/(x-${b})$. Произведение приращения на показатель стремится к $${c * (a + b)}$, ответ $e^{${c * (a + b)}}$.`, numeric(['Предел', 'Предел произведения'], [`e^${c * (a + b)}`, c * (a + b)]));
        case 'Две формы одного предела':
        case 'Другие коэффициенты': {
            const sign = r(0, 1) ? 1 : -1;
            return task(tex`Вычисли $\lim_{n\to\infty}(1${sign > 0 ? '+' : '-'}${a}/n)^{${b}n}$ и $\lim_{x\to0}(1+${c}x)^{${d}/x}$.`,
                tex`Произведения приращения и показателя равны ${sign * a * b} и ${c * d}; ответы $e^{${sign * a * b}}$, $e^{${c * d}}$.`, numeric(['Первый предел', 'Второй предел'], [`e^(${sign * a * b})`, `e^${c * d}`]));
        }
        case 'Квадрат аргумента в основании':
            return task(tex`Для $((x^2+${a})/(x^2-${a}))^{${b}x^2}$ при $x\to\infty$ найди предел u·v и исходный предел.`, tex`$u=${2 * a}/(x^2-${a})$, $v=${b}x^2$, $uv\to${2 * a * b}$. Ответ $e^{${2 * a * b}}$.`, numeric(['Предел u·v', 'Исходный предел'], [2 * a * b, `e^${2 * a * b}`]));
        case 'Синус и квадрат тангенса':
            return task(tex`Для $(\sin x)^{${a}\operatorname{tg}^2x}$ при $x\to\pi/2$ положи $t=\pi/2-x$ и найди L в ответе $e^L$.`, tex`$\ln\cos t\sim-t^2/2$, $\operatorname{ctg}^2t\sim1/t^2$, значит L=$-${a}/2$.`, [field('L', `-${a}/2`)]);
        case 'Чётные и нечётные номера':
            return task(tex`$x_n=${b}+${a}(-1)^n+${c}/n$. Найди пределы чётной и нечётной подпоследовательностей, liminf и limsup.`, tex`Добавка ${c}/n исчезает. Чётные члены стремятся к ${b + a}, нечётные к ${b - a}. Это верхний и нижний частичные пределы.`, numeric(['Чётные', 'Нечётные', 'liminf', 'limsup'], [b + a, b - a, b - a, b + a]));
        case 'Затухающие колебания':
            return task(tex`$y_n=${b}+${a}(-1)^n/n$. Найди liminf и limsup и реши, сходится ли последовательность.`, tex`$|y_n-${b}|=${a}/n\to0$, поэтому последовательность сходится к ${b}; обе грани равны ${b}.`, numeric(['liminf', 'limsup'], [b, b]));
        case 'Склейка в единице':
            return task(tex`$f(x)=${a}^x$ при $x<1$, $f(1)=${c}$, $f(x)=x-${b}$ при $x>1$. Найди пределы слева и справа, f(1) и величину скачка в 1.`, tex`Слева ${a}, справа ${1 - b}, значение ${c}. Величина скачка $|${1 - b}-${a}|=${a + b - 1}$.`, numeric(['Слева', 'Справа', 'f(1)', 'Величина скачка'], [a, 1 - b, c, a + b - 1]));
        case 'Кубические ветви':
            return task(tex`$f=${a}-x^3$ при $x<0$, $f=(x-1)^3$ при $0\le x\le2$, $f=${b}-x$ при $x>2$. Найди величины скачков в 0 и 2 и f(2).`, tex`В 0 пределы ${a} и −1; величина скачка ${a + 1}. В 2 пределы 1 и ${b - 2}; величина скачка ${Math.abs(b - 3)}. $f(2)=1$.`, numeric(['Скачок в 0', 'Скачок в 2', 'f(2)'], [a + 1, Math.abs(b - 3), 1]));
        case 'Доопределение логарифма':
            return task(tex`$f(x)=\ln((1+${a}x)/(1-${b}x))/x$. Каким значением доопределить f(0)? Используй два стандартных предела.`, tex`Разделяем логарифмы: $\ln(1+${a}x)/x-\ln(1-${b}x)/x\to${a}-(-${b})=${a + b}$.`, [field('f(0)', a + b)]);
        case 'Частичные суммы': {
            const n = r(2, 10);
            return task(tex`Для $\sum_{n=1}^{\infty}${a}(-1)^n$ найди $S_{${n}}$, $S_{${n + 1}}$, $S_{${n + 2}}$ и объясни, существует ли сумма.`, tex`Пары членов сокращаются. Чётные суммы 0, нечётные −${a}; общего предела и суммы ряда нет.`, numeric([`S${n}`, `S${n + 1}`, `S${n + 2}`], [n, n + 1, n + 2].map((i) => i % 2 ? -a : 0)));
        }
        case 'Линейность':
            return task(tex`Сходящиеся ряды $\sum x_n=${a}$, $\sum y_n=-${b}$. Найди $\sum(${c}x_n-${d}y_n)$.`, tex`По линейности $${c}\cdot${a}-${d}\cdot(-${b})=${c * a + d * b}$.`, [field('Сумма', c * a + d * b)]);
        case 'Предельное сравнение':
            return task(tex`$x_n=${a}n/(n^2+${b})$, $y_n=1/n$. Найди $L=\lim x_n/y_n$ и установи поведение ряда.`, tex`$x_n/y_n=${a}n^2/(n^2+${b})\to${a}>0$. Гармонический ряд расходится, поэтому данный ряд тоже расходится.`, [field('L', a)]);
        case 'Признак Даламбера':
            return task(tex`Для $\sum_{n=1}^{\infty}n/${a}^n$ найди $q=\lim x_{n+1}/x_n$ и установи сходимость.`, tex`$x_{n+1}/x_n=(n+1)/(${a}n)\to1/${a}<1$, ряд сходится.`, [field('q', `1/${a}`)]);
        case 'Коренной признак': {
            const denominator = a + b;
            return task(tex`$x_n=(${a}/${denominator})^n$. Найди $\lim\sqrt[n]{x_n}$ и установи сходимость ряда.`, tex`Корень равен ${a}/${denominator}<1, ряд сходится.`, [field('q', `${a}/${denominator}`)]);
        }
        case 'Выбор модели':
        case 'Другие размеры': {
            const n = r(5, 10), k = r(2, 4);
            const third = source.title === 'Выбор модели' ? factorial(n) : n ** k;
            return task(tex`Из ${n} различных элементов выбери ${k} без порядка, расположи ${k} без повторов; затем ${source.title === 'Выбор модели' ? `переставь все ${n}` : `составь строку длины ${k} с повторами`}.`, tex`$C_{${n}}^{${k}}=${choose(n, k)}$, $A_{${n}}^{${k}}=${factorial(n) / factorial(n - k)}$. Третье количество: ${third}.`, numeric(['Сочетания', 'Размещения', 'Третье количество'], [choose(n, k), factorial(n) / factorial(n - k), third]));
        }
        case 'Перестановки с повторениями': {
            const p = r(2, 4), q = r(2, 4), letters = r(2, 6), length = r(2, 5);
            return task(`Сколько разных строк содержат ровно ${p} букв А и ${q} букв Б? Сколько строк длины ${length} можно составить из ${letters} символов с повторениями?`, tex`Перестановки с повторениями: $(${p}+${q})!/(${p}!${q}!)=${choose(p + q, p)}$. Второй ответ $${letters}^{${length}}=${letters ** length}$.`, numeric(['Перестановки', 'Строки'], [choose(p + q, p), letters ** length]));
        }
        case 'Система с факториалами': {
            const m = r(2, 8), gap = r(1, 8), n = m + gap;
            return task(tex`Найди натуральные n,m: $(n-m+1)!/(n-m)!=${gap + 1}$; $(m-1)!(n-m+1)!/[m!(n-m)!]=${gap + 1}/${m}$.`, tex`Первая дробь равна n−m+1=${gap + 1}, вторая $(n-m+1)/m$. Значит m=${m}, n=${n}.`, numeric(['n', 'm'], [n, m]));
        }
        case 'Уравнение и область': {
            const x = r(1, 8), rhs = (x + 3) * (x + 2) / 2;
            return task(tex`Реши $12(x+3)!/[(x-1)!4!]=${rhs}A_{x+1}^2$ для целого x при определённости факториалов. Введи множество корней.`, tex`Область: x≥1. Сокращаем ненулевой множитель x(x+1): $(x+3)(x+2)=2\cdot${rhs}$. Корни ${x} и ${-5 - x}; допустим только ${x}.`, [field('Корни', [x], 'set')]);
        }
        case 'Строгое неравенство': {
            const threshold = r(12, 60), roots = [];
            for (let n = 1; n <= threshold; n += 1) { if ((n + 4) * (n + 3) < threshold * n) { roots.push(n); } }
            return task(tex`Найди натуральные n: $A_{n+4}^4/(n+2)!<${threshold}/(n-1)!$.`, tex`При n≥1 сокращаем факториалы и умножаем на n!: $(n+4)(n+3)<${threshold}n$. Решаем квадратное неравенство и оставляем натуральные числа: $${set(roots)}$.`, [field('n', roots, 'set')]);
        }
        case 'Сокращение размещений': {
            const n = r(20, 35), k = r(3, 10), m = r(12, 19), j = r(3, 8);
            const value = (n - k) ** 2 - (m - j) ** 2;
            return task(tex`Вычисли $(A_{${n}}^{${k + 2}}+A_{${n}}^{${k + 1}})/A_{${n}}^{${k}}-(A_{${m}}^{${j + 2}}+A_{${m}}^{${j + 1}})/A_{${m}}^{${j}}$.`, tex`$A_N^{K+1}/A_N^K=N-K$; сумма двух отношений равна $(N-K)(N-K-1)+(N-K)=(N-K)^2$. Ответ: $(${n}-${k})^2-(${m}-${j})^2=${value}$.`, [field('Значение', value)]);
        }
        case 'Другой корень': {
            const x = r(1, 15), value = (x + 2) * (x + 1);
            return task(tex`Реши $(x+2)!/x!=${value}$ для целого x≥0.`, tex`$(x+2)(x+1)=${value}$. Корни ${x} и ${-3 - x}; допустим x=${x}.`, [field('x', x)]);
        }
        case 'Четыре операции':
        case 'Повторение с тремя множествами':
        case 'Множества и пары': {
            const U = Array.from({ length: r(5, 9) }, (_, i) => i + 1);
            const A = U.filter(() => r(0, 1)), B = U.filter(() => r(0, 1)), C = U.filter(() => r(0, 1));
            if (source.title === 'Множества и пары') {
                const result = U.filter((i) => !B.includes(i));
                return task(tex`$U=${set(U)}$, $B=${set(B)}$, $C=${set(C)}$. Найди дополнение B в U и число пар C×B.`, tex`Дополнение содержит элементы U вне B: $${set(result)}$. Число пар — произведение мощностей: $${C.length}\cdot${B.length}=${C.length * B.length}$.`, [field('Дополнение B', result, 'set'), field('|C×B|', C.length * B.length)]);
            }
            const results = source.title === 'Четыре операции'
                ? [A.filter((i) => B.includes(i)), [...new Set([...A, ...B])], A.filter((i) => !B.includes(i)), U.filter((i) => !A.includes(i))]
                : [[...new Set([...A, ...B])].filter((i) => C.includes(i)), C.filter((i) => !A.includes(i) && !B.includes(i))];
            const labels = source.title === 'Четыре операции' ? ['A∩B', 'A∪B', 'A∖B', 'Дополнение A'] : ['(A∪B)∩C', '(C∖A)∖B'];
            return task(tex`$U=${set(U)}$, $A=${set(A)}$, $B=${set(B)}$, $C=${set(C)}$. Найди ${labels.join(' и ')}.`, labels.map((label, i) => `${label}: $${set(results[i])}$`).join('; '), labels.map((label, i) => field(label, results[i], 'set')));
        }
        case 'Мощность объединения': {
            const intersection = r(0, Math.min(a, b));
            return task(tex`$|A|=${a}$, $|B|=${b}$, $|A\cap B|=${intersection}$. Найди $|A\cup B|$, $|A\times B|$.`, tex`$|A\cup B|=${a}+${b}-${intersection}=${a + b - intersection}$; мощность произведения ${a * b}.`, numeric(['|A∪B|', '|A×B|'], [a + b - intersection, a * b]));
        }
        case 'Связь мощности и произведения':
            return task(tex`$|A|=${a}$, $|B|=${b}$. Найди $|A\times B|$, мощность булеана A и $|A\times B\times B|$.`, tex`Мощности: $${a}\cdot${b}$, $2^{${a}}$, $${a}\cdot${b}^2$.`, numeric(['|A×B|', '|P(A)|', '|A×B×B|'], [a * b, 2 ** a, a * b * b]));
        case 'Операции по разрядам':
        case 'От битов к множествам': {
            const A = Array.from({ length: 5 }, () => r(0, 1)), B = Array.from({ length: 5 }, () => r(0, 1));
            if (source.title === 'Операции по разрядам') {
                const values = [A.map((v, i) => v | B[i]), A.map((v, i) => v & B[i]), A.map((v, i) => v && !B[i] ? 1 : 0)].map((v) => v.join(''));
                return task(`Даны a=${A.join('')}, b=${B.join('')}. Найди битовые строки объединения, пересечения и A∖B. Вводи пять битов.`, values.join('; '), ['Объединение', 'Пересечение', 'Разность'].map((label, i) => ({ label, kind: 'text', accepted: [values[i]] })));
            }
            const xor = A.flatMap((v, i) => v !== B[i] ? [i + 1] : []), intersection = A.flatMap((v, i) => v && B[i] ? [i + 1] : []);
            return task(tex`$U=\{1,2,3,4,5\}$, $\mu_A=${A.join('')}$, $\mu_B=${B.join('')}$. Найди $A\oplus B$ и $A\cap B$.`, tex`Различающиеся биты дают $${set(xor)}$, общие единицы — $${set(intersection)}$.`, [field('A⊕B', xor, 'set'), field('A∩B', intersection, 'set')]);
        }
        case 'От правила к парам':
        case 'Делимость как отношение':
        case 'Матрица по условию':
        case 'Нечётная сумма': {
            const n = r(4, 10), row = r(2, n), modulus = r(2, 5), M = Array.from({ length: n }, (_, i) => i + 1);
            const rule = source.title === 'От правила к парам' ? (x, y) => x > y
                : source.title === 'Делимость как отношение' ? (x, y) => x % y === 0
                : source.title === 'Матрица по условию' ? (x, y) => x % modulus === y : (x, y) => (x + y) % 2 === 1;
            const count = M.reduce((sum, x) => sum + M.filter((y) => rule(x, y)).length, 0);
            const description = source.title === 'От правила к парам' ? '$x>y$' : source.title === 'Делимость как отношение' ? 'x делится на y'
                : source.title === 'Матрица по условию' ? tex`$x\bmod${modulus}=y$` : 'x+y нечётно';
            const zeroRows = M.filter((x) => !M.some((y) => rule(x, y)));
            const labels = source.title === 'Матрица по условию' ? ['Единицы', 'Нулевые строки', `Сумма столбца ${modulus}`] : ['Число пар', 'Петли', `y для x=${row}`];
            const values = source.title === 'Матрица по условию' ? [count, zeroRows, M.filter((x) => rule(x, modulus)).length]
                : [count, M.filter((x) => rule(x, x)).length, M.filter((y) => rule(row, y))];
            return task(tex`На $M=${set(M)}$ задано отношение: ${description}. Найди ${labels.join(', ')}.`, `Перебираем упорядоченные пары (x,y); петли соответствуют диагонали. Ответы: ${values.map((v) => Array.isArray(v) ? `{${v}}` : v).join('; ')}.`, labels.map((label, i) => field(label, values[i], Array.isArray(values[i]) ? 'set' : 'number')));
        }
        case 'Число пар':
            return task(`В городе A живут ${a} человек, в городе B — ${b}. Сколько пар, включая петли, содержит отношение «живут в одном городе»?`, `Каждый человек связан со всеми жителями своего города, включая себя: ${a}²+${b}²=${a * a + b * b}.`, [field('Число пар', a * a + b * b)]);
        case 'Произведение матриц': {
            const A = [[1, a], [0, 1]], B = [[b, c], [d, r(-4, 6)]];
            const values = [B[0][0] + a * B[1][0], B[0][1] + a * B[1][1], ...B[1]];
            return task(tex`$A=${matrix(A)}$, $B=${matrix(B)}$. Найди четыре элемента C=AB.`, tex`Умножаем строки A на столбцы B: $C=${matrix([values.slice(0, 2), values.slice(2)])}$.`, numeric(['c₁₁', 'c₁₂', 'c₂₁', 'c₂₂'], values));
        }
        case 'Степень матрицы': {
            const n = r(2, 12);
            return task(tex`Для $A=${matrix([[4, -1], [9, -2]])}$ дано $A^n=${matrix([['1+3n', '-n'], ['9n', '1-3n']])}$. Найди элементы $A^{${n}}$.`, tex`Подставляем n=${n}: $A^{${n}}=${matrix([[1 + 3 * n, -n], [9 * n, 1 - 3 * n]])}$.`, numeric(['a₁₁', 'a₁₂', 'a₂₁', 'a₂₂'], [1 + 3 * n, -n, 9 * n, 1 - 3 * n]));
        }
        case 'Минор, дополнение, определитель':
            return task(tex`$A=${matrix([[a, b], [c, d]])}$. Найди $M_{12}$, $A_{12}$ и det A.`, tex`Удаляем строку 1 и столбец 2: минор ${c}. Знак $(-1)^{1+2}$ даёт дополнение −${c}. Определитель $${a}\cdot${d}-${b}\cdot${c}=${a * d - b * c}$.`, numeric(['M₁₂', 'A₁₂', 'det A'], [c, -c, a * d - b * c]));
        case 'Свойства в цепочке':
            return task(`det A=${a} для матрицы 3×3. Поменяли две строки местами, затем одну строку умножили на ${b}, получили B. Найди det B и det(${c}A).`, `Перестановка меняет знак, множитель строки умножает определитель: det B=${-a * b}. Умножение всей матрицы даёт множитель ${c}³: ${a * c ** 3}.`, numeric(['det B', `det(${c}A)`], [-a * b, a * c ** 3]));
        case 'Выбор строки': {
            const A = [[a, b, 0], [c, d, 0], [r(-4, 7), r(-4, 7), r(2, 9)]], minor = a * d - b * c;
            return task(tex`Вычисли $\det${matrix(A)}$ и $M_{33}$.`, tex`Разлагаем по третьему столбцу: $M_{33}=${minor}$, $\det A=${A[2][2]}\cdot${minor}=${A[2][2] * minor}$.`, numeric(['M₃₃', 'Определитель'], [minor, A[2][2] * minor]));
        }
        case 'Обратная и проверка':
            return task(tex`$A=${matrix([[1, a], [0, 1]])}$. Найди элементы A⁻¹ преобразованием (A|E) до (E|A⁻¹).`, tex`Применяем $R_1\leftarrow R_1-${a}R_2$: справа получается $${matrix([[1, -a], [0, 1]])}$. Произведение с A равно E.`, numeric(['b₁₁', 'b₁₂', 'b₂₁', 'b₂₂'], [1, -a, 0, 1]));
        case 'Крамер целиком': {
            const x = r(-5, 5), y = r(-5, 5), u = a * x + y, v = x - y, delta = -a - 1;
            return task(tex`Реши $${a}x+y=${u}$, $x-y=${v}$ методом Крамера. Введи Δ, Δₓ, Δᵧ, x, y.`, tex`$\Delta=-${a}-1=${delta}$, $\Delta_x=-(${u})-(${v})=${delta * x}$, $\Delta_y=${a}\cdot(${v})-(${u})=${delta * y}$. Делим на Δ: x=${x}, y=${y}.`, numeric(['Δ', 'Δₓ', 'Δᵧ', 'x', 'y'], [delta, delta * x, delta * y, x, y]));
        }
        case 'Матричный метод': {
            const x = r(-5, 5), y = r(-5, 5);
            return task(tex`$A=${matrix([[1, a], [0, 1]])}$, $b=(${x + a * y},${y})^T$. Найди решение Ax=b через A⁻¹.`, tex`$A^{-1}=${matrix([[1, -a], [0, 1]])}$. Умножаем на b: $x=(${x},${y})^T$.`, numeric(['x₁', 'x₂'], [x, y]));
        }
        case 'Свободные переменные': {
            const s = r(-3, 3), t = r(-3, 3);
            return task(tex`После преобразований: $x_1-${a}x_2-${b}x_3=${c}$, $${d}x_2+${a}x_3+x_4=0$. Найди число свободных переменных, x₁ и x₄ при x₂=${s}, x₃=${t}.`, tex`Свободны x₂,x₃. $x_1=${c}+${a}x_2+${b}x_3=${c + a * s + b * t}$; $x_4=-${d}x_2-${a}x_3=${-d * s - a * t}$.`, numeric(['Число свободных', 'x₁', 'x₄'], [2, c + a * s + b * t, -d * s - a * t]));
        }
        case 'Координаты комбинации': {
            const A = [r(-4, 4), r(-4, 4), r(-4, 4)], B = [r(-4, 4), r(-4, 4), r(-4, 4)];
            const values = A.map((v, i) => a * v - b * B[i]);
            return task(tex`$a_1=(${A})$, $a_2=(${B})$. Найди координаты $${a}a_1-${b}a_2$.`, `Умножаем и складываем соответствующие координаты: (${values}).`, numeric(['Первая', 'Вторая', 'Третья'], values));
        }
        case 'Ненулевая связь': {
            const p = r(-4, 4), q = r(1, 5), A = [1, -2, 3], B = [-1, 1, 4], C = A.map((v, i) => -p * v - q * B[i]);
            return task(tex`$a_1=(${A})$, $a_2=(${B})$, $a_3=(${C})$. Найди α₁,α₂ в $\alpha_1a_1+\alpha_2a_2+a_3=0$. Доведи опорные столбцы до единичных.`, tex`Первые две координаты дают $\alpha_1-\alpha_2=${-C[0]}$, $-2\alpha_1+\alpha_2=${-C[1]}$. Складываем: $\alpha_1=${p}$; затем $\alpha_2=${q}$. Третья координата подтверждает связь.`, numeric(['α₁', 'α₂'], [p, q]));
        }
        case 'Ступенчатая матрица': {
            const k = r(1, 5), l = r(2, 6), m = r(1, 6), pivot = r(1, 8);
            const A = [[1, a, b, c], [k, k * a, k * b + 1, k * c + d], [l, l * a, l * b + m, l * c + m * d + pivot]];
            return task(tex`Найди ранг $A=${matrix(A)}$ и последний элемент после $R_2\leftarrow R_2-${k}R_1$, $R_3\leftarrow R_3-${l}R_1$, $R_3\leftarrow R_3-${m}R_2$.`, tex`После первых двух шагов строки: $(0,0,1,${d})$ и $(0,0,${m},${m * d + pivot})$. Последний шаг даёт $(0,0,0,${pivot})$. Три ненулевые строки: ранг 3.`, numeric(['Ранг', 'Последний элемент'], [3, pivot]));
        }
        case 'Пять неизвестных': {
            const unknowns = r(4, 9), rank = r(1, unknowns - 1);
            return task(`Совместная система с ${unknowns} неизвестными имеет ранг ${rank}. Сколько свободных переменных требуется для общего решения?`, `Число свободных переменных: ${unknowns}−${rank}=${unknowns - rank}.`, [field('Количество параметров', unknowns - rank)]);
        }
        default: { return null; }
    }
}
export function expandPracticeVariants(practice, count = 10) {
    return Object.fromEntries(Object.entries(practice).map(([key, original]) => {
        if (!/^(Матанализ|Дискретка|Линал)\|/.test(key)) { return [key, original]; }
        const candidates = original.filter((source) => source.type === 'input' && generatePracticeTask(source, 1));
        if (!candidates.length) { return [key, original]; }
        const tasks = [...original];
        const seen = new Map(candidates.map((source) => [source.id, new Set([source.question])]));
        const first = Math.max(...original.map((source) => source.variant)) + 1;
        for (let i = 0; i < count; i += 1) {
            const variant = first + i;
            const base = original.filter((source) => source.variant === (i % 2 + 1));
            const selected = candidates.filter((source) => base.includes(source));
            for (const source of selected.length ? selected : candidates) {
                let generated;
                for (let retry = 0; retry < 100; retry += 1) {
                    generated = generatePracticeTask(source, hash(`${key}|${source.id}|${variant}|${retry}`));
                    if (!seen.get(source.id).has(generated.question)) { break; }
                }
                if (seen.get(source.id).has(generated.question)) { throw new Error('Duplicate practice variant: ' + source.title); }
                seen.get(source.id).add(generated.question);
                tasks.push({ ...source, ...generated, variant, id: `${source.id}-variant-${variant}`, generated: true });
            }
            for (const source of base.filter((source) => source.type !== 'input')) {
                tasks.push({ ...source, variant, id: `${source.id}-variant-${variant}` });
            }
        }
        return [key, tasks];
    }));
}
