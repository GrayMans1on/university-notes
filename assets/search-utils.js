(() => {
    const aliases = {
        'слу': 'систем линейн уравнен', 'det': 'определител', 'дет': 'определител',
        'крамер': 'крамер', 'гаусс': 'гаусс', 'слау': 'систем линейн уравнен',
        'inverse': 'обратн матриц', 'обратные матрицы': 'обратн матриц',
        'булеан': 'множеств подмножеств', 'xor': 'симметрическ разност',
        'эйлер': 'диаграмм', 'венн': 'диаграмм', 'биты': 'битов',
        'бин': 'двоичн', 'hex': 'шестнадцатеричн', 'binary': 'двоичн',
        'эпсилон': 'varepsilon', 'sin': 'синус', 'cos': 'косинус',
        'tg': 'тангенс', 'ctg': 'котангенс', 'arctg': 'арктангенс',
        'ln': 'логарифм', 'log': 'логарифм', 'sup': 'верхн гран', 'inf': 'нижн гран',
        'произведение матриц': 'умножен матриц', 'приращение скорости': 'изменен скорост',
    };
    function normalize(value) {
        return String(value).toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/[\\{}$]/g, ' ');
    }
    function stem(word) {
        if (/^[а-я]+$/.test(word) && word.length > 4) {
            return word.replace(/(?:иями|ами|ями|ого|ему|ому|ая|яя|ой|ый|ий|ые|ие|ов|ев|ам|ям|ах|ях|ы|и|а|я|у|ю|е|о)$/u, '');
        }
        return word;
    }
    function groups(query) {
        const q = normalize(query).trim();
        if (aliases[q]) {
            return [[q, ...aliases[q].split(' ').map(stem)]];
        }
        return q.split(/\s+/).filter(Boolean).map((word) => [stem(word), aliases[word]?.split(' ').map(stem)].filter(Boolean));
    }
    function matches(value, query) {
        const normalized = normalize(value);
        const q = normalize(query).trim();
        if (!q) {
            return true;
        }
        if (aliases[q] && (normalized.includes(q) || aliases[q].split(' ').every((word) => normalized.includes(stem(word))))) {
            return true;
        }
        return q.split(/\s+/).filter(Boolean).every((word) => normalized.includes(stem(word))
            || (aliases[word] && aliases[word].split(' ').every((part) => normalized.includes(stem(part)))));
    }
    window.StudySearch = { normalize, matches, groups };
})();
