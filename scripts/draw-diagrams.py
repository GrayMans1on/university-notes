from pathlib import Path
from math import exp
from html import escape


ASSETS = Path(__file__).resolve().parent.parent / 'assets'
BLUE = '#254cce'
GREEN = '#168276'
ORANGE = '#c26427'
INK = '#42536c'
GRID = '#dce3ee'


def begin(title, width=600, height=400):
    return [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" aria-labelledby="title">',
            f'<title id="title">{escape(title)}</title>',
            f'<rect width="{width}" height="{height}" fill="white"/>']


def label(parts, x, y, text, size=17, color=INK, anchor='middle'):
    parts.append(f'<text x="{x}" y="{y}" font-family="Arial,sans-serif" font-size="{size}" fill="{color}" text-anchor="{anchor}">{escape(text)}</text>')


def line(parts, coords, color=INK, width=2, dash=''):
    extra = f' stroke-dasharray="{dash}"' if dash else ''
    parts.append(f'<path d="{coords}" fill="none" stroke="{color}" stroke-width="{width}"{extra}/>')


def save(name, parts):
    (ASSETS / (name + '.svg')).write_text('\n'.join(parts) + '\n</svg>\n')


def chart(parts, xmax, ymax, xticks, yticks, xlabel, ylabel):
    def point(x, y):
        return (80 + x / xmax * 450, 315 - y / ymax * 260)
    for x in xticks:
        px, _ = point(x, 0)
        line(parts, f'M{px} 55V315', GRID, 1)
        label(parts, px, 342, str(x))
    for y in yticks:
        _, py = point(0, y)
        line(parts, f'M80 {py}H530', GRID, 1)
        label(parts, 58, py + 6, str(y))
    line(parts, 'M80 45V315H545', INK)
    line(parts, 'M75 55l5-10 5 10M535 310l10 5-10 5', INK)
    label(parts, 72, 342, '0')
    label(parts, 540, 375, xlabel, 16)
    label(parts, 80, 27, ylabel, 17)
    return point


parts = begin('Правило Саррюса: положительные и отрицательные диагонали', height=470)
subs = str.maketrans('123', '₁₂₃')
for offset, title, positive, color in [(0, 'Прибавить произведения по диагоналям ↘', True, BLUE), (230, 'Вычесть произведения по диагоналям ↙', False, ORANGE)]:
    label(parts, 300, offset + 32, title, 21)
    xs = [100, 190, 280, 370, 460]
    ys = [offset + 85, offset + 135, offset + 185]
    line(parts, f'M325 {ys[0]-25}V{ys[-1]+25}', GRID, 1.5, '5 5')
    for j in range(3):
        start, end = (j, j + 2) if positive else (j + 2, j)
        line(parts, f'M{xs[start]} {ys[0]}L{xs[end]} {ys[-1]}', color, 3)
    for i, y in enumerate(ys, 1):
        for j, x in enumerate(xs):
            parts.append(f'<rect x="{x-28}" y="{y-17}" width="56" height="31" rx="4" fill="white"/>')
            label(parts, x, y + 7, 'a' + str(i).translate(subs) + str(j % 3 + 1).translate(subs), 24)
save('sarrus', parts)

parts = begin('Преобразование экспоненты: e^(3−x), 2e^(3−x), 2e^(3−x)+1', height=435)
point = chart(parts, 8, 10, [1, 2, 3, 4, 5, 6, 7, 8], [2, 4, 6, 8, 10], 'x', 'y')
_, asymptote = point(0, 1)
line(parts, f'M80 {asymptote}H530', GRID, 2, '7 5')
label(parts, 503, asymptote - 8, 'y = 1', 15)
for multiplier, shift, color, title, ly in [(1, 0, BLUE, 'e³⁻ˣ', 385), (2, 0, GREEN, '2e³⁻ˣ', 405), (2, 1, ORANGE, '2e³⁻ˣ + 1', 425)]:
    points = []
    for i in range(801):
        x = i / 100
        y = multiplier * exp(3 - x) + shift
        if 0 <= y <= 10:
            px, py = point(x, y)
            points.append(f'{px:.3f},{py:.3f}')
    parts.append(f'<polyline points="{" ".join(points)}" fill="none" stroke="{color}" stroke-width="2.5"/>')
    px, py = point(3, multiplier + shift)
    parts.append(f'<circle cx="{px}" cy="{py}" r="4.5" fill="{color}"/>')
    label(parts, px + 13, py + 5, str(multiplier + shift), 16, color, 'start')
    line(parts, f'M220 {ly-5}H252', color, 2.5)
    label(parts, 265, ly, title, 17, color, 'start')
save('exponential-transform', parts)

parts = begin('График скорости: V(0)=3 м/с, V(5)=0, путь до t=4', height=400)
point = chart(parts, 5, 3, [1, 2, 3, 4, 5], [1, 2, 3], 't, с', 'V, м/с')
coords = [point(0, 0), point(0, 3), point(4, 0.6), point(4, 0)]
parts.append('<polygon points="' + ' '.join(f'{x},{y}' for x, y in coords) + '" fill="#dbe6ff"/>')
px, py = point(4, 0.6)
line(parts, f'M{px} 315V{py}H80', INK, 1.5, '5 4')
a, b = point(0, 3), point(5, 0)
line(parts, f'M{a[0]} {a[1]}L{b[0]} {b[1]}', BLUE, 3)
parts.append(f'<circle cx="{px}" cy="{py}" r="5" fill="{BLUE}"/>')
label(parts, px + 10, py - 12, '(4; 0,6)', 17, BLUE, 'start')
label(parts, 228, 220, 'S — площадь', 18, BLUE)
save('velocity-area', parts)

parts = begin('График ускорения: треугольник, площадь от 0 до 17 с', height=400)
point = chart(parts, 20, 10, [5, 10, 15, 17, 20], [5, 10], 't, с', 'a, м/с²')
coords = [point(0, 0), point(10, 10), point(17, 3), point(17, 0)]
parts.append('<polygon points="' + ' '.join(f'{x},{y}' for x, y in coords) + '" fill="#d7f0eb"/>')
coords = [point(0, 0), point(10, 10), point(20, 0)]
parts.append('<polyline points="' + ' '.join(f'{x},{y}' for x, y in coords) + f'" fill="none" stroke="{GREEN}" stroke-width="3"/>')
px, py = point(17, 3)
line(parts, f'M{px} 315V{py}', INK, 1.5, '5 4')
label(parts, 300, 270, 'ΔV — площадь', 18, GREEN)
save('acceleration-area', parts)

parts = begin('Перемещение от A к B: разность радиус-векторов', height=360)
parts.append(f'<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0 0L6 3L0 6" fill="none" stroke="context-stroke" stroke-width="1.5"/></marker></defs>')
line(parts, 'M95 60V280H540', GRID, 2)
label(parts, 80, 308, 'O', 21)
label(parts, 550, 292, 'x', 18)
label(parts, 82, 48, 'y', 18)
for name, x, y in [('A', 260, 220), ('B', 435, 85)]:
    parts.append(f'<path d="M95 280L{x} {y}" fill="none" stroke="{BLUE}" stroke-width="2.5" marker-end="url(#arrow)"/>')
    parts.append(f'<circle cx="{x}" cy="{y}" r="4.5" fill="{INK}"/>')
    label(parts, x + 12, y + 7, name, 21, INK, 'start')
parts.append(f'<path d="M267 215L427 91" fill="none" stroke="{ORANGE}" stroke-width="3" marker-end="url(#arrow)"/>')
label(parts, 170, 215, 'r⃗A', 21, BLUE)
label(parts, 225, 143, 'r⃗B', 21, BLUE)
label(parts, 386, 173, 'Δr⃗', 21, ORANGE)
label(parts, 300, 337, 'Δr⃗ = r⃗B − r⃗A', 23)
save('displacement', parts)

print('Created 5 diagrams from existing notes')
