import { createHash } from 'node:crypto';

export function topicKey(title) {
    return 'topic-' + createHash('sha256').update(title).digest('hex').slice(0, 10);
}

export function anchor(title) {
    return title.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-');
}

export function splitTopics(markdown) {
    let section = '';
    return markdown.split(/(?=^## |^### )/m).map((source) => {
        const match = /^(##|###) (.+)\n/.exec(source);
        if (match?.[1] === '##') {
            section = match[2];
        }
        return { source, title: match?.[2], topic: match?.[1] === '###', section };
    });
}

export function classifyStatements(html) {
    return html.replace(/<p>([\s\S]*?)<\/p>/g, (whole, text) => {
        const plain = text.replace(/<[^>]*>/g, '').trim();
        let kind = '';
        if (/^(?:Теорема|Лемма|Критерий|Принцип)(?:[ .:—]|$)/u.test(plain)) {
            kind = 'theorem';
        } else if (/^(?:Доказательство|Допустим,|Пусть .*счётно)/u.test(plain)) {
            kind = 'proof';
        } else if (/^<strong>[^<]+<\/strong>(?:[^<]{0,70})\s[—–]/u.test(text)) {
            kind = 'definition';
        } else if (/^(?:Пример|Правило|Условие|Приоритет)/u.test(plain)) {
            kind = 'example';
        }
        return kind ? `<p class="statement statement-${kind}">${text}</p>` : whole;
    });
}

export const relatedTopics = {
    "Линал|Операции и свойства алгебраического поля": ["Матанализ", "Действительные числа: свойства поля и счётность"],
    "Линал|Теорема Кронекера–Капелли": ["Линал", "Ранг матрицы и способы его нахождения"],
    "Матанализ|Ряд, частичные суммы и критерий Коши": ["Матанализ", "Подпоследовательности и частичные пределы"],
    "Линал|Правило Крамера": ["Линал", "Определители: определения, разложение и свойства"],
    "Линал|Обратная матрица: свойства и методы вычисления": ["Линал", "Определители: определения, разложение и свойства"],
    
    "Физика|Графики движения и сложение векторов": ["Физика", "Кинематика: модели, координаты, перемещение"],
};

export const interactiveTopics = {
    "Матанализ|Преобразования графиков": [
        "transform",
        "exponential",
        "cotangent"
    ],
    "Матанализ|Композиция функций и построение графиков": [
        "polynomial",
        "absolute-trig",
        "arctangent",
        "sine-reciprocal",
        "logarithm"
    ],
    "Матанализ|Элементы математической логики": [
        "logic"
    ],
    "Матанализ|Целая часть, промежутки и окрестности": [
        "neighborhood"
    ],
    "Матанализ|Изолированные точки, вложенные отрезки и покрытия": [
        "nested"
    ],
    "Матанализ|Предел последовательности: определение и свойства": [
        "epsilon"
    ],
    "Дискретка|Операции над множествами и их законы": [
        "sets",
        "de-morgan"
    ],
    "Дискретка|Битовые строки: представление и операции": [
        "bits",
        "homework-bits"
    ],
    "Дискретка|Бинарные отношения: определение и способы задания": [
        "divisibility",
        "greater",
        "relation-seven",
        "relation-triangular",
        "odd-sum",
        "square"
    ],
    "Дискретка|Свойства бинарных отношений": [
        "relation-properties",
        "relation-example"
    ],
    "Линал|Матрицы: виды и операции": [
        "matrix-cell",
        "matrix-types",
        "transpose",
        "matrix-product"
    ],
    "Линал|Определители: определения, разложение и свойства": [
        "determinant",
        "sarrus",
        "minor"
    ],
    "Линал|Обратная матрица: свойства и методы вычисления": [
        "inverse-steps"
    ],
    "Линал|Метод обратной матрицы и метод Гаусса": [
        "gauss-steps"
    ],
    "Физика|Кинематика: модели, координаты, перемещение": [
        "radius",
        "displacement"
    ],
    "Физика|Равноускоренное движение и торможение": [
        "braking"
    ],
    "Физика|Графики движения и сложение векторов": [
        "velocity-area",
        "acceleration-area",
        "vectors"
    ],
    "Информатика|Перевод двоичных чисел в шестнадцатеричные": [
        "binary"
    ],
    "Информатика|Вычисление факториала": [
        "factorial"
    ]
};

export const widgetTitles = {
    transform: 'Преобразования графика', exponential: 'Экспонента по шагам', cotangent: 'Котангенс по шагам',
    polynomial: 'Дробная композиция', 'absolute-trig': 'Модули синуса и косинуса', arctangent: 'Построение с арктангенсом',
    'sine-reciprocal': 'Сумма и обратная величина', logarithm: 'Логарифм по шагам', logic: 'Значения высказываний',
    neighborhood: 'Окрестность и целая часть', nested: 'Вложенные отрезки', epsilon: 'Предел и ε-окрестность',
    sets: 'Операции над кругами', 'de-morgan': 'Законы Де Моргана', bits: 'Множества и биты',
    divisibility: 'Делимость: граф и матрица', greater: 'Строгое сравнение: граф и матрица',
    'relation-properties': 'Петли и свойства отношений', 'relation-example': 'Связи на графе',
    'relation-seven': 'Три отношения на числах 1–7', 'relation-triangular': 'Равенство и нестрогое сравнение',
    'odd-sum': 'Отношение нечётной суммы', square: 'Соседние и противоположные вершины',
    'homework-bits': 'Операции с P и Q', 'matrix-cell': 'Строки, столбцы и элементы', 'matrix-types': 'Виды матриц',
    transpose: 'Транспонирование', 'matrix-product': 'Произведение: строка на столбец',
    determinant: 'Определитель 2×2', sarrus: 'Диагонали Саррюса', minor: 'Минор и алгебраическое дополнение',
    'inverse-steps': 'Обратная матрица: этапы', 'gauss-steps': 'Исключение неизвестных по шагам',
    radius: 'Проекции радиус-вектора', displacement: 'Радиус-векторы и перемещение', braking: 'Площадь при торможении',
    'velocity-area': 'Путь по графику скорости', 'acceleration-area': 'Изменение скорости по площади', vectors: 'Сложение векторов',
    binary: 'Тетрады и веса битов', factorial: 'Факториал по шагам',
};
