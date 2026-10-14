"""Draw exact SVG illustrations of examples already present in the notes."""

from pathlib import Path
from html import escape
from math import atan, cos, hypot, isfinite, log, pi, sin
import json


ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / 'assets'
BLUE = '#254cce'
GREEN = '#168276'
ORANGE = '#bd5b22'
INK = '#36465e'
GRID = '#dce3ee'
PALE = '#dce6ff'
PURPLE = '#7955ba'
RECORDS = []


class SVG:
    def __init__(self, title, width=640, height=440):
        self.width, self.height = width, height
        self.parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" aria-labelledby="title">',
                      f'<title id="title">{escape(title)}</title>',
                      f'<rect width="{width}" height="{height}" fill="white"/>',
                      '<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M1 1L7 4L1 7" fill="none" stroke="context-stroke" stroke-width="1.5"/></marker></defs>']
        self.serial = 0

    def add(self, value):
        self.parts.append(value)

    def text(self, x, y, value, size=21, color=INK, anchor='middle'):
        self.add(f'<text x="{x}" y="{y}" font-family="Arial,sans-serif" font-size="{size}" fill="{color}" text-anchor="{anchor}">{escape(str(value))}</text>')

    def path(self, d, color=INK, width=2, dash='', arrow=False):
        extra = f' stroke-dasharray="{dash}"' if dash else ''
        extra += ' marker-end="url(#arrow)"' if arrow else ''
        self.add(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{width}"{extra}/>')

    def rect(self, x, y, width, height, fill='none', stroke=GRID, radius=0):
        self.add(f'<rect x="{x}" y="{y}" width="{width}" height="{height}" rx="{radius}" fill="{fill}" stroke="{stroke}" stroke-width="1.6"/>')

    def circle(self, x, y, radius, fill='white', stroke=INK, width=2):
        self.add(f'<circle cx="{x}" cy="{y}" r="{radius}" fill="{fill}" stroke="{stroke}" stroke-width="{width}"/>')

    def save(self, name, subject, heading, description):
        (ASSETS / f'{name}.svg').write_text('\n'.join(self.parts) + '\n</svg>\n')
        RECORDS.append({'asset': name, 'subject': subject, 'heading': heading, 'description': description})


def venn(svg, bounds, circles, predicate, color=PALE):
    """Shade disjoint membership regions with exact SVG clips and masks."""
    x, y, width, height = bounds
    svg.serial += 1
    prefix = f'venn{svg.serial}'
    svg.add('<defs>')
    for i, (cx, cy, radius, _) in enumerate(circles):
        svg.add(f'<clipPath id="{prefix}-c{i}"><circle cx="{cx}" cy="{cy}" r="{radius}"/></clipPath>')
    for bits in range(1 << len(circles)):
        if not predicate([bool(bits & (1 << i)) for i in range(len(circles))]):
            continue
        svg.add(f'<mask id="{prefix}-m{bits}" maskUnits="userSpaceOnUse" x="{x}" y="{y}" width="{width}" height="{height}">')
        svg.add(f'<rect x="{x}" y="{y}" width="{width}" height="{height}" fill="white"/>')
        for i, (cx, cy, radius, _) in enumerate(circles):
            if not bits & (1 << i):
                svg.add(f'<circle cx="{cx}" cy="{cy}" r="{radius}" fill="black"/>')
        svg.add('</mask>')
    svg.add('</defs>')
    for bits in range(1 << len(circles)):
        if not predicate([bool(bits & (1 << i)) for i in range(len(circles))]):
            continue
        included = [i for i in range(len(circles)) if bits & (1 << i)]
        svg.add(f'<g mask="url(#{prefix}-m{bits})">')
        for i in included:
            svg.add(f'<g clip-path="url(#{prefix}-c{i})">')
        svg.rect(x, y, width, height, color, 'none')
        svg.add('</g>' * (len(included) + 1))
    svg.rect(x, y, width, height, stroke=GRID, radius=8)
    for cx, cy, radius, _ in circles:
        svg.circle(cx, cy, radius, 'none')


def plot(svg, title, functions, xr, yr, xticks, yticks, top=100, bottom=350, breaks=(), asym_x=(), asym_y=()):
    left, right = 82, 594
    xmin, xmax = xr
    ymin, ymax = yr

    def point(x, y):
        return left + (x-xmin)/(xmax-xmin)*(right-left), bottom-(y-ymin)/(ymax-ymin)*(bottom-top)

    svg.text(320, top-70, title, 24)
    for i, (_, color, name) in enumerate(functions):
        row = top-43 + 24*i
        svg.path(f'M90 {row-6}H118', color, 3)
        svg.text(130, row, name, 19, color, 'start')
    if len(functions) == 3:
        top += 24
    svg.serial += 1
    clip = f'plot{svg.serial}'
    svg.add(f'<defs><clipPath id="{clip}"><rect x="{left}" y="{top}" width="{right-left}" height="{bottom-top}"/></clipPath></defs>')
    for value, name in xticks:
        px, _ = point(value, 0)
        svg.path(f'M{px} {top}V{bottom}', GRID, 1)
        svg.text(px, bottom+28, name, 18)
    for value, name in yticks:
        _, py = point(0, value)
        svg.path(f'M{left} {py}H{right}', GRID, 1)
        svg.text(left-13, py+6, name, 18, anchor='end')
    if xmin <= 0 <= xmax:
        px, _ = point(0, 0)
        svg.path(f'M{px} {bottom}V{top-8}', INK, 1.8, arrow=True)
    if ymin <= 0 <= ymax:
        _, py = point(0, 0)
        svg.path(f'M{left} {py}H{right+8}', INK, 1.8, arrow=True)
    svg.text(right+17, min(max(point(0, 0)[1], top+18), bottom-12), 'x', 19)
    svg.text(max(left+12, min(point(0, 0)[0]+16, right-12)), top-9, 'y', 19)
    for value, name in asym_x:
        px, _ = point(value, 0)
        svg.path(f'M{px} {top}V{bottom}', PURPLE, 1.5, '6 5')
        if name:
            svg.text(px+6, top+22, name, 17, PURPLE, 'start')
    for value, name in asym_y:
        _, py = point(0, value)
        svg.path(f'M{left} {py}H{right}', PURPLE, 1.5, '6 5')
        if name:
            svg.text(right-5, py-9, name, 17, PURPLE, 'end')
    intervals = [xmin] + sorted(v for v in breaks if xmin < v < xmax) + [xmax]
    svg.add(f'<g clip-path="url(#{clip})">')
    for func, color, _ in functions:
        for a, b in zip(intervals, intervals[1:]):
            points, previous = [], None
            for i in range(601):
                x = a+(b-a)*(i+0.03)/600.06
                try:
                    y = func(x)
                except (ValueError, ZeroDivisionError, OverflowError):
                    y = float('nan')
                if not isfinite(y) or abs(y) > 20*max(abs(ymin), abs(ymax), 1):
                    if len(points) > 1:
                        svg.path('M'+'L'.join(points), color, 2.8)
                    points, previous = [], None
                    continue
                if previous is not None and abs(y-previous) > 2*(ymax-ymin):
                    if len(points) > 1:
                        svg.path('M'+'L'.join(points), color, 2.8)
                    points = []
                px, py = point(x, y)
                points.append(f'{px:.3f} {py:.3f}')
                previous = y
            if len(points) > 1:
                svg.path('M'+'L'.join(points), color, 2.8)
    svg.add('</g>')
    return point


def node(svg, x, y, name, color=BLUE):
    svg.circle(x, y, 21, 'white', color, 2.2)
    svg.text(x, y+7, name, 22, color)


def edge(svg, start, end, color=BLUE, bend=0, both=False):
    x1, y1 = start
    x2, y2 = end
    if start == end:
        svg.path(f'M{x1-14} {y1-16}C{x1-53} {y1-73} {x1+53} {y1-73} {x1+14} {y1-16}', color, 2.1, arrow=True)
        return
    if bend:
        mx, my = (x1+x2)/2+bend, (y1+y2)/2
        d1, d2 = hypot(mx-x1, my-y1), hypot(mx-x2, my-y2)
        ax, ay = x1+23*(mx-x1)/d1, y1+23*(my-y1)/d1
        bx, by = x2+23*(mx-x2)/d2, y2+23*(my-y2)/d2
        svg.path(f'M{ax} {ay}Q{mx} {my} {bx} {by}', color, 2.1, arrow=True)
    else:
        length = hypot(x2-x1, y2-y1)
        ax, ay = x1+23*(x2-x1)/length, y1+23*(y2-y1)/length
        bx, by = x2-23*(x2-x1)/length, y2-23*(y2-y1)/length
        if both:
            svg.path(f'M{(ax+bx)/2} {(ay+by)/2}L{ax} {ay}', color, 2.1, arrow=True)
        svg.path(f'M{ax} {ay}L{bx} {by}', color, 2.1, arrow=True)


def matrix(svg, values, x, y, step=50, highlight=None):
    rows, cols = len(values), len(values[0])
    for i, row in enumerate(values):
        for j, value in enumerate(row):
            fill = highlight(i, j) if highlight else None
            if fill:
                svg.rect(x+j*step-step*.43, y+i*step-step*.4, step*.86, step*.8, fill, 'none', 5)
            svg.text(x+j*step, y+i*step+8, value, 24)
    svg.path(f'M{x-29} {y-26}h-8v{(rows-1)*step+52}h8M{x+(cols-1)*step+29} {y-26}h8v{(rows-1)*step+52}h-8')


# Discrete mathematics: Euler circles and relation graphs.
s = SVG('Операции над множествами: шесть диаграмм Эйлера', height=850)
operations = [('A ∪ B', lambda p: p[0] or p[1]), ('A ∩ B', lambda p: p[0] and p[1]),
              ('A ∖ B', lambda p: p[0] and not p[1]), ('B ∖ A', lambda p: p[1] and not p[0]),
              ('A △ B', lambda p: p[0] != p[1]), ('U ∖ A', lambda p: not p[0])]
for i, (title, predicate) in enumerate(operations):
    x, y = 16+(i%2)*320, 20+(i//2)*280
    s.text(x+145, y+25, title, 26)
    circles = [(x+108, y+146, 76, 'A'), (x+185, y+146, 76, 'B')]
    venn(s, (x, y+48, 292, 208), circles, predicate)
    s.text(x+71, y+148, 'A', 23)
    s.text(x+223, y+148, 'B', 23)
    s.text(x+270, y+74, 'U', 19)
s.save('set-operations', 'Дискретка', 'Операции над множествами и их законы', 'Шесть круговых схем: объединение, пересечение, две разности, симметрическая разность и дополнение.')

s = SVG('Законы Де Моргана: одинаковые выделенные области', height=580)
for i, (title, predicate) in enumerate([('U ∖ (A ∪ B) = (U ∖ A) ∩ (U ∖ B)', lambda p: not (p[0] or p[1])),
                                      ('U ∖ (A ∩ B) = (U ∖ A) ∪ (U ∖ B)', lambda p: not (p[0] and p[1]))]):
    y = 20+i*285
    s.text(320, y+26, title, 22)
    circles = [(260, y+156, 82, 'A'), (380, y+156, 82, 'B')]
    venn(s, (95, y+55, 450, 218), circles, predicate)
    s.text(225, y+164, 'A', 24)
    s.text(415, y+164, 'B', 24)
    s.text(516, y+82, 'U', 20)
s.save('de-morgan', 'Дискретка', 'Продолжение законов множеств', 'Две диаграммы к законам Де Моргана.')

s = SVG('Буквенные множества E, F, H и их элементы', height=430)
venn(s, (40, 30, 560, 360), [(240, 210, 150, 'E'), (365, 210, 140, 'F'), (240, 260, 75, 'H')], lambda p: p[0] and p[1] and p[2])
for x, y, label in [(158,100,'E'),(460,110,'F'),(186,248,'H'),(310,137,'g'),(485,218,'m'),(204,285,'e'),(287,258,'f, h')]:
    s.text(x, y, label, 25)
s.save('letter-euler', 'Дискретка', 'Пример с буквенными множествами', 'Круги E, F, H с элементами e, f, h, g, m в соответствующих областях.')

four = [(['(A ∩ D) ∪ ((B ∩ C) ∖ A)'], lambda p: (p[0] and p[3]) or (p[1] and p[2] and not p[0])),
        (['(B ∩ C) ∪ (B ∩ D) ∪ (C ∩ D)'], lambda p: (p[1] and p[2]) or (p[1] and p[3]) or (p[2] and p[3])),
        (['(C ∩ D) ∖ (A ∩ B)'], lambda p: p[2] and p[3] and not (p[0] and p[1])),
        (['((A ∩ B) ∪ (B ∩ D) ∪ (D ∩ C) ∪ (A ∩ C))', '∖ ((A ∩ D) ∪ (B ∩ C))', 'с добавлением A ∩ B ∩ C ∩ D'], lambda p: (((p[0] and p[1]) or (p[1] and p[3]) or (p[3] and p[2]) or (p[0] and p[2])) and not ((p[0] and p[3]) or (p[1] and p[2]))) or all(p))]
for i, (titles, predicate) in enumerate(four, 1):
    s = SVG(f'Четыре множества: область выражения {i}', height=530)
    for j, title in enumerate(titles):
        s.text(320, 29+j*28, title, 21)
    circles = [(320,235,118,'A'),(397,310,118,'B'),(320,385,118,'C'),(243,310,118,'D')]
    venn(s, (70,105,500,410), circles, predicate)
    for x, y, label in [(320,150,'A'),(480,318,'B'),(320,482,'C'),(161,318,'D')]:
        s.text(x,y,label,25)
    s.save(f'four-circle-{i}', 'Дискретка', 'Выражения для четырёх диаграмм', f'Цветное выделение области выражения № {i} на кругах A, B, C, D.')

s = SVG('Задача о шарах: красные и потрескавшиеся', height=945)
for i, (title, predicate) in enumerate([('Красные и потрескавшиеся: B ∩ C', lambda p:p[0] and p[1]),
                                      ('Красные и непотрескавшиеся: B ∖ C', lambda p:p[0] and not p[1]),
                                      ('Некрасные и непотрескавшиеся: A ∖ (B ∪ C)', lambda p:not (p[0] or p[1]))]):
    y = 12+i*310
    s.text(320,y+25,title,21)
    venn(s,(65,y+50,510,225),[(257,y+163,94,'B'),(383,y+163,94,'C')],predicate)
    s.text(222,y+169,'B',24)
    s.text(420,y+169,'C',24)
    s.text(98,y+81,'A',24)
    s.text(320,y+302,'B — красные; C — потрескавшиеся',18)
s.save('balls-euler', 'Дискретка', 'Задача о шарах', 'Три области внутри множества всех шаров A: B∩C, B∖C и A∖(B∪C).')

s = SVG('Множества и характеристические векторы на S={1,2,3,4,5}', height=460)
s.text(320,30,'Порядок элементов S = {1, 2, 3, 4, 5}',23)
for j in range(5):
    s.text(230+j*76,75,j+1,24)
rows = [('A', [1,0,1,0,1]), ('B', [0,0,1,1,0]), ('A ∪ B', [1,0,1,1,1]), ('A ∩ B', [0,0,1,0,0]), ('S ∖ B', [1,1,0,0,1])]
for i,(title,bits) in enumerate(rows):
    y=115+i*62
    s.text(38,y+25,title,22,anchor='start')
    for j,bit in enumerate(bits):
        s.rect(203+j*76,y-9,54,48,BLUE if bit else '#f2f5fa',GRID,6)
        s.text(230+j*76,y+24,bit,24,'white' if bit else INK)
s.text(320,445,'1 — элемент входит; 0 — не входит',20)
s.save('characteristic-vectors', 'Дискретка', 'Битовые строки и характеристические векторы', 'Принадлежность элементов S подсвечена по столбцам для A, B, объединения, пересечения и дополнения B.')

s = SVG('Отношение между X и Y: пары (1,1), (3,2)', height=400)
s.text(320,35,'ρ = {(1, 1), (3, 2)}',26)
s.rect(95,75,140,265,'#f8faff',GRID,55)
s.rect(405,75,140,265,'#f4faf8',GRID,55)
s.text(165,105,'X',25,BLUE)
s.text(475,105,'Y',25,GREEN)
for name,y in [(1,150),(2,220),(3,290)]:
    node(s,165,y,name)
for name,y in [(1,165),(2,270)]:
    node(s,475,y,name,GREEN)
edge(s,(165,150),(475,165))
edge(s,(165,290),(475,270))
s.text(320,380,'Первый элемент пары в X, второй — в Y',20)
s.save('relation-pairs', 'Дискретка', 'Способы задания бинарного отношения', 'Две стрелки между раздельно обозначенными множествами X и Y из примера 1.18.')

s = SVG('Граф делимости: стрелка от числа к его делителю', height=440)
s.text(320,31,'a → b: a делится на b',24)
positions={1:(320,190),2:(160,310),3:(490,310),4:(120,115),5:(510,115)}
for a,b in [(2,1),(3,1),(4,1),(5,1),(4,2)]:
    edge(s,positions[a],positions[b])
for n,p in positions.items():
    edge(s,p,p)
    node(s,*p,n)
s.text(320,416,'Петля у каждого числа: a делится на a',21)
s.save('divisibility-graph', 'Дискретка', 'Пример 1.19: делимость', 'Ориентированный граф со всеми десятью парами отношения делимости на числах 1–5.')

s = SVG('Граф строгого сравнения на числах 1–6: пятнадцать дуг', height=560)
s.text(320,30,'a → b при a > b',25)
positions={i:(155,80+(i-1)*83) for i in range(1,7)}
for a in range(2,7):
    for b in range(1,a):
        edge(s,positions[a],positions[b],bend=75*(a-b))
for n,p in positions.items():
    node(s,*p,n)
s.text(390,480,'Все 15 дуг направлены',21)
s.text(390,508,'к меньшему числу',21)
s.text(390,538,'Петель нет',21)
s.save('greater-graph', 'Дискретка', 'Пример 1.20: «быть строго больше»', 'Граф всех 15 пар строгого сравнения на множестве от 1 до 6.')

s = SVG('Рефлексивность: петли у всех, ни у кого и у части вершин', height=880)
cases=[('Рефлексивное',set('abcd'),[('a','b'),('b','c')]),('Антирефлексивное',set(),[('a','b'),('b','c')]),('Нерефлексивное',set('abd'),[('a','d'),('d','b')])]
for i,(title,loops,edges) in enumerate(cases):
    y=i*290
    s.text(320,y+30,title,25)
    pos={'a':(155,y+110),'b':(485,y+110),'c':(485,y+225),'d':(155,y+225)}
    for a,b in edges:
        edge(s,pos[a],pos[b])
    for n,p in pos.items():
        if n in loops:
            edge(s,p,p)
        node(s,*p,n)
s.save('reflexivity-graphs', 'Дискретка', 'Свойства бинарных отношений', 'Три графа на a, b, c, d, показывающие рефлексивность, антирефлексивность и нерефлексивность.')

s = SVG('Координатные графики трёх отношений упражнения 2.2', height=1260)
predicates=[('R₁: x % 3 = y',lambda x,y:x%3==y),('R₂: x + y = 9',lambda x,y:x+y==9),('R₃: xy ≥ 8',lambda x,y:x*y>=8)]
for i,(title,predicate) in enumerate(predicates):
    offset=i*420
    point=plot(s,title,[],(0,8),(0,8),[(n,str(n)) for n in range(1,8)],[(n,str(n)) for n in range(1,8)],top=offset+105,bottom=offset+355)
    for x in range(1,8):
        for y in range(1,8):
            if predicate(x,y):
                px,py=point(x,y)
                s.circle(px,py,5,BLUE,BLUE)
s.save('relation-coordinate-plots', 'Дискретка', 'Графики отношений 2.2 и декартовы произведения 2.16, 2.20', 'Три координатных графика: остаток по модулю 3, сумма 9 и произведение не меньше 8.')

s = SVG('Графы отношений: остаток по модулю 3 и сумма 9', height=740)
for i,title in enumerate(['R₁: x % 3 = y','R₂: x + y = 9']):
    offset=i*365
    s.text(320,offset+32,title,25)
    pos={1:(155,offset+130),2:(485,offset+130),3:(75,offset+285),4:(175,offset+285),5:(365,offset+285),6:(565,offset+285),7:(270,offset+130)}
    if i==0:
        for a,b in [(1,1),(2,2),(4,1),(5,2),(7,1)]:
            edge(s,pos[a],pos[b])
    else:
        pos={1:(90,offset+120),2:(280,offset+120),7:(505,offset+120),3:(280,offset+210),6:(505,offset+210),4:(280,offset+300),5:(505,offset+300)}
        for a,b in [(2,7),(3,6),(4,5)]:
            edge(s,pos[a],pos[b],both=True)
    for n,p in pos.items():
        node(s,*p,n)
s.save('relation-exercise-graphs', 'Дискретка', 'Практика 2.34, 2.36: матрица и отношения на схеме', 'Графы R₁ и R₂ упражнения 2.2 с петлями, направленными и двусторонними связями и изолированными вершинами.')

s = SVG('Соседние и противоположные положения вокруг квадрата', height=700)
for i,(title,pairs) in enumerate([('R₁ — соседние',[('a','b'),('b','c'),('c','d'),('d','a')]),('R₂ — противоположные',[('a','c'),('b','d')])]):
    offset=i*350
    s.text(320,offset+30,title,25)
    pos={'a':(320,offset+92),'b':(475,offset+203),'c':(320,offset+315),'d':(165,offset+203)}
    for a,b in pairs:
        edge(s,pos[a],pos[b],both=True)
    for n,p in pos.items():
        node(s,*p,n)
s.save('square-relations', 'Дискретка', 'Практика 2.34, 2.36: матрица и отношения на схеме', 'Две схемы упражнения 2.36: связи между соседними и противоположными вершинами.')

# Calculus: each curve is evaluated from the formula in the notes.
ticks_pi=[(-pi,'−π'),(-pi/2,'−π/2'),(0,'0'),(pi/2,'π/2'),(pi,'π')]
s=SVG('Логарифм: сдвиг, отражение аргумента и отражение функции',height=860)
plot(s,'Сдвиг аргумента',[(lambda x:log(x,2),BLUE,'log₂ x'),(lambda x:log(x+2,2),GREEN,'log₂(x + 2)')],(-4,4),(-4,3),[(x,str(x)) for x in [-4,-2,0,2,4]],[(-4,'−4'),(-2,'−2'),(0,'0'),(2,'2')],top=125,bottom=355,breaks=(-2,0),asym_x=((-2,''),(0,'')))
plot(s,'Отражения',[(lambda x:log(2-x,2),BLUE,'log₂(2 − x)'),(lambda x:-log(2-x,2),ORANGE,'−log₂(2 − x)')],(-4,4),(-4,4),[(x,str(x)) for x in [-4,-2,0,1,2,4]],[(-4,'−4'),(-2,'−2'),(0,'0'),(2,'2'),(4,'4')],top=550,bottom=780,breaks=(2,),asym_x=((2,'x = 2'),))
s.save('logarithm-transform', 'Матанализ', 'Преобразования графиков элементарных функций', 'Два рисунка промежуточных логарифмов: сдвиг и два отражения.')

s=SVG('Котангенс: модуль аргумента, сдвиг и модуль значения',height=950)
cot=lambda x:cos(x)/sin(x)
breaks=sorted(set([k*pi for k in range(-3,4)]+[k*pi-pi/4 for k in range(-3,4)]))
plot(s,'Аргумент: модуль и сдвиг',[(lambda x:cot(x),BLUE,'ctg x'),(lambda x:cot(abs(x)),GREEN,'ctg |x|'),(lambda x:cot(abs(x+pi/4)),ORANGE,'ctg |x + π/4|')],(-5*pi/4,pi),(-4,4),[(-5*pi/4,'−5π/4'),(-pi,'−π'),(-pi/2,'−π/2'),(-pi/4,'−π/4'),(0,'0'),(pi/2,'π/2'),(pi,'π')],[(-4,'−4'),(-2,'−2'),(0,'0'),(2,'2'),(4,'4')],top=150,bottom=405,breaks=breaks)
plot(s,'Значение: +1 и модуль',[(lambda x:cot(abs(x+pi/4))+1,BLUE,'ctg |x + π/4| + 1'),(lambda x:abs(cot(abs(x+pi/4))+1),ORANGE,'|ctg |x + π/4| + 1|')],(-5*pi/4,pi),(-3,5),[(-pi,'−π'),(-pi/2,'−π/2'),(-pi/4,'−π/4'),(0,'0'),(pi/2,'π/2'),(pi,'π')],[(-2,'−2'),(0,'0'),(1,'1'),(3,'3'),(5,'5')],top=620,bottom=885,breaks=breaks,asym_x=tuple((k*pi-pi/4,'') for k in range(-2,3)))
s.save('cotangent-transform', 'Матанализ', 'Практика преобразования графиков', 'Пять промежуточных и итоговых графиков котангенса в двух системах координат, включая отражение отрицательных частей вверх.')

s=SVG('Композиция: (|x|−2)²−1 и обратная величина',height=860)
f=lambda x:(abs(x)-2)**2-1
plot(s,'Вспомогательная функция f(x)',[(f,BLUE,'f(x) = (|x| − 2)² − 1')],(-5,5),(-2,5),[(x,str(x)) for x in [-5,-3,-2,-1,0,1,2,3,5]],[(-1,'−1'),(0,'0'),(3,'3'),(5,'5')],top=110,bottom=355)
pt=plot(s,'Итоговая функция 1 / f(x)',[(lambda x:1/f(x),ORANGE,'y = 1 / (x² − 4|x| + 3)')],(-5,5),(-4,4),[(x,str(x)) for x in [-5,-3,-2,-1,0,1,2,3,5]],[(-4,'−4'),(-1,'−1'),(0,'0'),(1,'1'),(4,'4')],top=535,bottom=785,breaks=(-3,-1,1,3),asym_x=tuple((x,'') for x in [-3,-1,1,3]))
for x,y,dx,dy,name in [(0,1/3,28,-16,'(0; 1/3)'),(-2,-1,-50,28,'(−2; −1)'),(2,-1,50,28,'(2; −1)')]:
    px,py=pt(x,y)
    s.circle(px,py,4,ORANGE,ORANGE)
    s.text(px+dx,py+dy,name,17,ORANGE)
s.save('composition-polynomial', 'Матанализ', 'Пример 1', 'Вспомогательная функция и итоговый дробный график с четырьмя вертикальными асимптотами и точками из таблицы.')

s=SVG('Сумма модулей синуса и косинуса',height=460)
f=lambda x:abs(sin(x))+abs(cos(x))
plot(s,'Вспомогательная функция',[(f,BLUE,'f(x) = |sin x| + |cos x|')],(-pi,pi),(0,1.7),ticks_pi,[(0,'0'),(1,'1'),(2**.5,'√2')],top=115,bottom=375,asym_y=((1,''),(2**.5,'')))
s.save('absolute-trig-sum', 'Матанализ', 'Пример 2', 'Периодический график |sin x|+|cos x| с минимумами 1 и максимумами √2.')
s=SVG('Композиция 2 в степени суммы модулей синуса и косинуса',height=460)
plot(s,'Итоговая композиция',[(lambda x:2**(abs(sin(x))+abs(cos(x))),ORANGE,'y = 2ᶠ⁽ˣ⁾,  f(x) = |sin x| + |cos x|')],(-pi,pi),(0,3.1),ticks_pi,[(0,'0'),(2,'2'),(2**(2**.5),'2^√2')],top=115,bottom=375,asym_y=((2,''),(2**(2**.5),'')))
s.save('absolute-trig-exponential', 'Матанализ', 'Пример 2', 'Итоговый периодический график 2^(|sin x|+|cos x|) с уровнями 2 и 2^√2.')

s=SVG('Сдвиг гиперболы на три единицы вправо',height=460)
plot(s,'Сдвиг гиперболы',[(lambda x:1/x,BLUE,'1/x'),(lambda x:1/(x-3),GREEN,'1/(x − 3)')],(-4,8),(-4,4),[(x,str(x)) for x in [-4,-2,0,2,3,4,6,8]],[(-4,'−4'),(-1,'−1'),(0,'0'),(1,'1'),(4,'4')],top=140,bottom=375,breaks=(0,3),asym_x=((0,''),(3,'x = 3')))
s.save('hyperbola-shift', 'Матанализ', 'Композиция с арктангенсом: начало подробного построения', 'Гиперболы 1/x и 1/(x−3), исходная и сдвинутая вертикальные асимптоты.')
s=SVG('Масштаб и вертикальный сдвиг гиперболы',height=460)
plot(s,'Масштаб и сдвиг',[(lambda x:5/(x-3),BLUE,'5/(x − 3)'),(lambda x:1+5/(x-3),GREEN,'1 + 5/(x − 3)')],(-6,12),(-8,8),[(x,str(x)) for x in [-6,-2,0,3,6,9,12]],[(-8,'−8'),(-5,'−5'),(0,'0'),(1,'1'),(5,'5'),(8,'8')],top=140,bottom=375,breaks=(3,),asym_x=((3,'x = 3'),),asym_y=((1,'y = 1'),))
s.save('hyperbola-affine', 'Матанализ', 'Композиция с арктангенсом: таблица и итоговый график', 'Графики 5/(x−3) и 1+5/(x−3) с общим разрывом и разными горизонтальными асимптотами.')
s=SVG('Арктангенс (x+2)/(x−3): итоговый график',height=490)
pt=plot(s,'Итоговая композиция',[(lambda x:atan((x+2)/(x-3)),ORANGE,'y = arctg ((x + 2)/(x − 3))')],(-10,12),(-1.9,1.9),[(x,str(x)) for x in [-10,-5,-2,0,3,6,12]],[(-pi/2,'−π/2'),(0,'0'),(pi/4,'π/4'),(pi/2,'π/2')],top=120,bottom=385,breaks=(3,),asym_y=((pi/4,'y = π/4'),))
for y in [-pi/2,pi/2]:
    s.circle(*pt(3,y),5,'white',ORANGE)
s.text(320,457,'x = 3 исключён; пределы слева −π/2, справа π/2',19)
s.save('arctangent-composition', 'Матанализ', 'Композиция с арктангенсом: таблица и итоговый график', 'Две убывающие ветви арктангенса, выколотые предельные точки при x=3 и горизонтальный уровень π/4.')

s=SVG('Синус, косинус и их сумма',height=490)
plot(s,'Сложение графиков',[(sin,BLUE,'sin x'),(cos,GREEN,'cos x'),(lambda x:sin(x)+cos(x),ORANGE,'sin x + cos x')],(-pi,3*pi/2),(-1.8,1.8),[(-pi,'−π'),(-pi/2,'−π/2'),(0,'0'),(pi/2,'π/2'),(pi,'π'),(3*pi/2,'3π/2')],[(-2**.5,'−√2'),(-1,'−1'),(0,'0'),(1,'1'),(2**.5,'√2')],top=160,bottom=405)
s.save('sine-cosine-sum', 'Матанализ', 'Композиция: обратная величина суммы синуса и косинуса', 'Наложение синуса, косинуса и суммы в одной системе координат.')
s=SVG('Обратная величина суммы синуса и косинуса',height=470)
pt=plot(s,'Итоговая обратная величина',[(lambda x:1/(sin(x)+cos(x)),ORANGE,'y = 1 / (sin x + cos x)')],(-pi,3*pi/2),(-4,4),[(-3*pi/4,'−3π/4'),(-pi/4,'−π/4'),(pi/4,'π/4'),(3*pi/4,'3π/4'),(5*pi/4,'5π/4')],[(-4,'−4'),(-1/2**.5,'−1/√2'),(0,'0'),(1/2**.5,'1/√2'),(4,'4')],top=125,bottom=380,breaks=(-pi/4,3*pi/4),asym_x=((-pi/4,''),(3*pi/4,'')))
s.save('sine-cosine-reciprocal', 'Матанализ', 'Композиция: обратная величина суммы синуса и косинуса', 'Положительная и отрицательные ветви 1/(sin x+cos x) с асимптотами −π/4 и 3π/4.')

s=SVG('Промежуточные экспоненты перед логарифмом',height=490)
plot(s,'Отражения экспоненты',[(lambda x:2**x,BLUE,'2ˣ'),(lambda x:2**(-x),GREEN,'2⁻ˣ'),(lambda x:-2**(-x),ORANGE,'−2⁻ˣ')],(-3,3),(-5,5),[(x,str(x)) for x in [-3,-2,-1,0,1,2,3]],[(-4,'−4'),(-2,'−2'),(-1,'−1'),(0,'0'),(1,'1'),(2,'2'),(4,'4')],top=160,bottom=405)
s.save('logarithm-exponential-stages', 'Матанализ', 'Композиция: логарифм модуля экспоненциального выражения', 'Три промежуточные экспоненты 2^x, 2^(−x) и −2^(−x).')
s=SVG('Сдвиг экспоненты и взятие модуля',height=470)
plot(s,'Сдвиг и модуль',[(lambda x:1-2**(-x),BLUE,'1 − 2⁻ˣ'),(lambda x:abs(1-2**(-x)),ORANGE,'|1 − 2⁻ˣ|')],(-3,5),(-4,4),[(x,str(x)) for x in [-3,-1,0,1,3,5]],[(-3,'−3'),(-1,'−1'),(0,'0'),(1,'1'),(3,'3')],top=140,bottom=385,asym_y=((1,'y = 1'),))
s.save('logarithm-modulus-stages', 'Матанализ', 'Композиция: логарифм модуля экспоненциального выражения', 'Функции 1−2^(−x) и |1−2^(−x)|; отражение отрицательной ветви вверх.')
s=SVG('Логарифм модуля экспоненциального выражения: итоговый график',height=470)
pt=plot(s,'Итоговый логарифм',[(lambda x:log(abs(1-2**(-x)),5),ORANGE,'y = log₅ |1 − 2⁻ˣ|')],(-7,6),(-3,3),[(x,str(x)) for x in [-7,-4,-1,0,3,6]],[(-3,'−3'),(-1,'−1'),(0,'0'),(1,'1'),(3,'3')],top=120,bottom=380,breaks=(0,),asym_x=((0,''),))
s.circle(*pt(-1,0),4,ORANGE,ORANGE)
s.text(320,450,'x = 0 исключён; справа y → 0 снизу',20)
s.save('logarithm-modulus-final', 'Матанализ', 'Композиция: логарифм модуля экспоненциального выражения', 'Итоговый log₅|1−2^(−x)|, нуль x=−1, вертикальная асимптота и приближение к y=0 справа.')

# Linear algebra: use the numeric and symbolic matrices from the notes.
s=SVG('Строки, столбцы и диагонали матрицы',height=650)
s.text(320,35,'a₂₃: строка 2, столбец 3',25)
matrix(s,[[1,2,3],[4,5,6]],225,115,80,lambda i,j:'#d7f0eb' if (i,j)==(1,2) else (PALE if i==1 or j==2 else None))
s.text(485,201,'a₂₃ = 6',23,GREEN)
s.text(320,303,'Главная и побочная диагонали',25)
values=[['a₁₁','a₁₂','a₁₃'],['a₂₁','a₂₂','a₂₃'],['a₃₁','a₃₂','a₃₃']]
matrix(s,values,230,385,90,lambda i,j:'#e6dcf8' if i==j and i+j==2 else (PALE if i==j else ('#ffe6d7' if i+j==2 else None)))
s.text(210,621,'Главная ↘',22,BLUE)
s.text(445,621,'Побочная ↙',22,ORANGE)
s.save('matrix-structure', 'Линал', 'Матрицы и их виды', 'Выделены строка и столбец элемента a₂₃, главная и побочная диагонали.')

s=SVG('Виды матриц: расположение нулей и диагональных элементов',height=900)
types=[('Нулевая',[[0,0,0],[0,0,0],[0,0,0]]),('Диагональная',[['a₁₁',0,0],[0,'a₂₂',0],[0,0,'a₃₃']]),('Единичная',[[1,0,0],[0,1,0],[0,0,1]]),('Верхняя треугольная',[[1,2,3],[0,4,5],[0,0,6]]),('Скалярная xE',[['x',0,0],[0,'x',0],[0,0,'x']])]
for i,(title,values) in enumerate(types):
    x,y=(i%2)*320,(i//2)*300
    s.text(x+160,y+35,title,22)
    matrix(s,values,x+95,y+105,65,lambda r,c:PALE if r==c else None)
s.save('matrix-types', 'Линал', 'Матрицы и их виды', 'Пять схем матриц: нулевая, диагональная, единичная, верхняя треугольная и скалярная.')

s=SVG('Транспонирование: строки становятся столбцами',height=670)
s.text(320,33,'A: 3 × 4',25)
matrix(s,[[1,2,3,-2],[4,5,6,-4],[7,8,9,-6]],200,105,80,lambda i,j:PALE if i==1 else None)
s.path('M320 312V368',ORANGE,3,arrow=True)
s.text(320,405,'Aᵀ: 4 × 3',25)
matrix(s,[[1,4,7],[2,5,8],[3,6,9],[-2,-4,-6]],240,460,55,lambda i,j:PALE if j==1 else None)
s.save('matrix-transpose', 'Линал', 'Операции над матрицами', 'Числовой пример транспонирования 3×4 в 4×3 с одной строкой и соответствующим столбцом одного цвета.')

s=SVG('Умножение матриц: строка на столбец',height=560)
s.text(320,35,'c₁₂ — строка 1 матрицы A × столбец 2 матрицы B',21)
matrix(s,[[2,-3,1],[4,5,0]],115,125,65,lambda i,j:PALE if i==0 else None)
s.text(326,161,'×',32)
matrix(s,[[3,1],[-1,2],[1,3]],445,95,65,lambda i,j:'#d7f0eb' if j==1 else None)
s.text(320,319,'c₁₂ = 2·1 + (−3)·2 + 1·3 = −1',24)
matrix(s,[[10,-1],[7,14]],280,405,80,lambda i,j:'#ffe6d7' if (i,j)==(0,1) else None)
s.save('matrix-product', 'Линал', 'Операции над матрицами', 'Выделены первая строка A и второй столбец B, вычисление и место элемента c₁₂=−1.')

s=SVG('Определитель второго порядка: ad минус bc',height=450)
s.text(320,35,'det A = ad − bc',28)
s.path('M215 135L425 280',BLUE,4)
s.path('M425 135L215 280',ORANGE,4)
for x,y,v in [(215,135,'a'),(425,135,'b'),(215,280,'c'),(425,280,'d')]:
    s.rect(x-22,y-25,44,48,'white','none')
    s.text(x,y+9,v,31)
s.path('M170 104h-10v210h10M470 104h10v210h-10',INK,2.5)
s.text(210,388,'+ ad',28,BLUE)
s.text(430,388,'− bc',28,ORANGE)
s.save('determinant-two', 'Линал', 'Определители: определения и примеры', 'Диагональные произведения определителя 2×2: прибавить ad, вычесть bc.')

s=SVG('Минор M₂₃: вычеркнуть вторую строку и третий столбец',height=620)
s.text(320,32,'Минор M₂₃',27)
matrix(s,[[1,2,3],[4,5,6],[7,8,9]],230,125,90,lambda i,j:'#ffe6d7' if i==1 or j==2 else PALE)
s.path('M180 215H460M410 89V342',ORANGE,3,'5 3')
s.path('M320 365V403',BLUE,3,arrow=True)
matrix(s,[[1,2],[7,8]],280,450,80)
s.text(320,603,'M₂₃ = 1·8 − 2·7 = −6;  B₂₃ = (−1)⁵M₂₃',20)
s.save('matrix-minor', 'Линал', 'Пример 1', 'Вычёркивание строки 2 и столбца 3, оставшаяся матрица минора и знак алгебраического дополнения.')

# Physics: schematic vector directions, without inventing numeric measurements.
s=SVG('Радиус-вектор точки в трёхмерной системе координат',height=480)
origin=(180,355)
x=(555,355)
y=(65,435)
z=(180,75)
for endpoint,name,dx,dy in [(x,'x',16,7),(y,'y',-15,14),(z,'z',-16,-9)]:
    s.path(f'M{origin[0]} {origin[1]}L{endpoint[0]} {endpoint[1]}',INK,2,arrow=True)
    s.text(endpoint[0]+dx,endpoint[1]+dy,name,24)
base=(398,385)
target=(398,150)
for d in ['M465 355L398 385L113 385','M398 150V385','M180 120L398 150','M465 355V120L398 150','M113 385V150L398 150']:
    s.path(d,GRID,1.7,'6 5')
s.path('M180 355L398 150',BLUE,3,arrow=True)
s.circle(*target,4,BLUE,BLUE)
s.text(412,146,'M(xₘ, yₘ, zₘ)',21,BLUE,'start')
s.text(290,224,'r⃗',28,BLUE)
s.text(174,384,'O',22)
s.text(465,381,'xₘ',20)
s.text(102,403,'yₘ',20)
s.text(155,123,'zₘ',20)
s.text(400,450,'r⃗ = xₘ i⃗ + yₘ j⃗ + zₘ k⃗',23)
s.save('radius-vector-3d', 'Физика', 'Характеристики движения', 'Трёхмерная схема радиус-вектора M с проекциями xₘ, yₘ, zₘ и координатными осями.')

s=SVG('Равномерное торможение: путь как площадь треугольника',height=440)
s.text(320,35,'Равномерное торможение',25)
s.add('<polygon points="95,100 95,345 535,345" fill="#dce6ff"/>')
s.path('M95 65V345H565',INK,2,arrow=True)
s.path('M95 100L535 345',BLUE,3)
s.text(64,108,'V₀',25)
s.text(79,377,'0',22)
s.text(535,377,'t₀',24)
s.text(590,352,'t',23)
s.text(80,58,'V',24)
s.text(250,285,'S = V₀t₀ / 2',25,BLUE)
s.text(320,421,'0 = V₀ + at₀',24)
s.save('braking-triangle', 'Физика', 'Торможение', 'Убывающая прямая скорости от V₀ до нуля и площадь треугольника S=V₀t₀/2.')

s=SVG('Сложение векторов скорости: V₃=V₁+V₂',height=480)
o=(320,355)
v1=(475,210)
v2=(180,205)
v3=(335,60)
s.path('M65 355H590M320 435V40',GRID,1.8)
s.text(596,363,'x',22)
s.text(295,40,'y',22)
s.path(f'M{v1[0]} {v1[1]}L{v3[0]} {v3[1]}L{v2[0]} {v2[1]}',INK,1.5,'6 5')
for endpoint,label,color,tx,ty in [(v1,'V⃗₁',BLUE,455,292),(v2,'V⃗₂',GREEN,205,295),(v3,'V⃗₃',ORANGE,365,135)]:
    s.path(f'M{o[0]} {o[1]}L{endpoint[0]} {endpoint[1]}',color,3,arrow=True)
    s.text(tx,ty,label,25,color)
s.text(302,385,'O',22)
s.text(320,447,'V⃗₃ = V⃗₁ + V⃗₂',26)
s.save('velocity-vector-sum', 'Физика', '№ 13', 'Два вектора скорости и их сумма по правилу параллелограмма.')

# Informatics: the two notebook examples.
s=SVG('Четыре бита соответствуют одной шестнадцатеричной цифре',height=430)
s.text(320,34,'1100 1110 0110₂ → CE6₁₆',27)
for i,(bits,letter,color) in enumerate([('1100','C',BLUE),('1110','E',GREEN),('0110','6',ORANGE)]):
    x=25+i*208
    for j,bit in enumerate(bits):
        s.rect(x+j*45,88,40,53,'#f5f7fb',GRID,4)
        s.text(x+j*45+20,123,bit,25,color)
        s.text(x+j*45+20,176,[8,4,2,1][j],21)
    s.path(f'M{x+87} 195V247',color,2.5,arrow=True)
    s.text(x+87,288,letter,35,color)
    s.text(x+87,323,[12,14,6][i],21)
s.text(320,371,'Веса битов: 8, 4, 2, 1',23)
s.text(320,409,'1100₂ = 1·8 + 1·4 + 0·2 + 0·1 = 12 = C₁₆',20)
s.save('binary-to-hex', 'Информатика', 'Перевод двоичных чисел в шестнадцатеричные', 'Цветные тетрады двоичного числа, веса разрядов и соответствующие шестнадцатеричные цифры C, E, 6.')

s=SVG('Блок-схема вычисления факториала неотрицательного целого n',height=770)
s.rect(225,25,190,55,'#f3f6fd',BLUE,28)
s.text(320,60,'Начало',23)
s.path('M320 80V115',BLUE,2.3,arrow=True)
s.add('<polygon points="230,120 440,120 410,180 200,180" fill="#f3f6fd" stroke="#254cce" stroke-width="2"/>')
s.text(320,158,'Ввод n; Q = 1',22)
s.path('M320 180V233',BLUE,2.3,arrow=True)
s.add('<polygon points="320,240 440,320 320,400 200,320" fill="#fff3e9" stroke="#bd5b22" stroke-width="2"/>')
s.text(320,328,'n ≥ 1?',26,ORANGE)
s.path('M440 320H545V455',BLUE,2.3,arrow=True)
s.text(480,307,'Да',21,BLUE)
s.rect(445,462,175,92,'#f3f6fd',BLUE,8)
s.text(532,500,'Q = Q·n',23)
s.text(532,535,'n = n − 1',23)
s.path('M532 554V590H632V209H320V233',BLUE,2.3,arrow=True)
s.path('M200 320H115V453',GREEN,2.3,arrow=True)
s.text(157,307,'Нет',21,GREEN)
s.add('<polygon points="45,460 225,460 205,525 25,525" fill="#ecf8f5" stroke="#168276" stroke-width="2"/>')
s.text(125,500,'Результат Q',22,GREEN)
s.path('M125 525V584',GREEN,2.3,arrow=True)
s.rect(40,592,170,55,'#ecf8f5',GREEN,28)
s.text(125,628,'Конец',23,GREEN)
s.text(320,720,'Для n = 0 цикл не выполняется: Q = 1',21)
s.save('factorial-flowchart', 'Информатика', 'Вычисление факториала', 'Блок-схема с вводом, условием n≥1, ветвями Да/Нет, умножением, уменьшением n и возвратом к проверке.')

(ROOT / 'scripts/visualization-map.json').write_text(json.dumps(RECORDS, ensure_ascii=False, indent=2)+'\n')
print(f'Created {len(RECORDS)} additional diagrams from existing notes')
