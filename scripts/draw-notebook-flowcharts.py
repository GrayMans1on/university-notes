from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INK = '#36465e'
BLUE = '#254cce'
SOFT = '#dce6ff'


def begin(title, width=1000, height=1040):
    return [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img"><title>{escape(title)}</title>',
            f'<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="{INK}"/></marker></defs>']


def label(parts, x, y, lines, size=21):
    for index, text in enumerate(lines):
        baseline = y + (index - (len(lines) - 1) / 2) * 28 + 7
        parts.append(f'<text x="{x}" y="{baseline}" font-family="DejaVu Sans" font-size="{size}" text-anchor="middle" fill="{INK}">{escape(text)}</text>')


def block(parts, x, y, lines, kind='process', width=250, height=80):
    left, top = x - width / 2, y - height / 2
    style = f'fill="{SOFT}" stroke="{BLUE}" stroke-width="2"'
    if kind == 'decision':
        parts.append(f'<path d="M{x} {top}L{x+width/2} {y}L{x} {y+height/2}L{left} {y}Z" {style}/>')
    elif kind == 'io':
        parts.append(f'<path d="M{left+20} {top}H{x+width/2+20}L{x+width/2-20} {y+height/2}H{left-20}Z" {style}/>')
    else:
        radius = 35 if kind == 'terminal' else 6
        parts.append(f'<rect x="{left}" y="{top}" width="{width}" height="{height}" rx="{radius}" {style}/>')
    label(parts, x, y, lines)


def arrow(parts, data):
    parts.append(f'<path d="{data}" fill="none" stroke="{INK}" stroke-width="2" marker-end="url(#arrow)"/>')


def save(name, parts):
    directory = ROOT / 'content/diagram-originals'
    directory.mkdir(exist_ok=True)
    data = '\n'.join(parts) + '\n</svg>\n'
    (directory / (name + '.svg')).write_text(data)
    (ROOT / 'assets' / (name + '.svg')).write_text(data)


for place in [False, True]:
    parts = begin('Объединение цифр: ' + ('заполнение разрядов' if place else 'приписывание справа'))
    block(parts, 500, 55, ['Начало'], 'terminal', height=60)
    block(parts, 500, 140, ['Ввести a, b'], 'io', height=60)
    block(parts, 500, 225, ['n = 0; L = 1'] if place else ['n = 0'], height=60)
    block(parts, 500, 330, ['a > 0 или b > 0?'], 'decision', width=340, height=110)
    block(parts, 500, 465, ['x = a % 10', 'y = b % 10'])
    block(parts, 500, 615, ['b = 0', 'или (a > 0 и x > y)?'], 'decision', width=520, height=130)
    block(parts, 250, 805, ['n = n + x*L', 'a = a // 10', 'L = 10*L'] if place else ['n = 10*n + x', 'a = a // 10'], height=120)
    block(parts, 750, 805, ['n = n + y*L', 'b = b // 10', 'L = 10*L'] if place else ['n = 10*n + y', 'b = b // 10'], height=120)
    block(parts, 880, 465, ['Вывести n'], 'io', width=170, height=60)
    block(parts, 880, 555, ['Конец'], 'terminal', width=170, height=60)
    for path in ['M500 85V110', 'M500 170V195', 'M500 255V275', 'M500 385V425', 'M500 505V550',
                 'M240 615H210V720H250V745', 'M760 615H790V720H750V745', 'M670 330H880V435', 'M880 495V525']:
        arrow(parts, path)
    label(parts, 535, 403, ['Да'], 18)
    label(parts, 725, 307, ['Нет'], 18)
    label(parts, 265, 694, ['Да'], 18)
    label(parts, 780, 694, ['Нет'], 18)
    parts.append(f'<path d="M250 865V950H750V865M500 950H40V330H330" fill="none" stroke="{INK}" stroke-width="2"/>')
    arrow(parts, 'M40 330H330')
    save('digit-merge-place' if place else 'digit-merge-right', parts)

parts = begin('Палиндром: разворот половины цифр', 1000, 1100)
block(parts, 450, 50, ['Начало'], 'terminal', height=60)
block(parts, 450, 140, ['Ввести n'], 'io', height=60)
block(parts, 450, 225, ['m = 0'], height=60)
block(parts, 450, 325, ['n ≠ 0 и n % 10 = 0?'], 'decision', width=490, height=110)
block(parts, 450, 485, ['n > m?'], 'decision', width=260, height=100)
block(parts, 450, 650, ['k = n % 10', 'm = 10*m + k', 'n = n // 10'], height=120)
block(parts, 450, 830, ['n = m', 'или n = m // 10?'], 'decision', width=390, height=120)
block(parts, 180, 960, ['Вывести True'], 'io', width=220, height=60)
block(parts, 800, 960, ['Вывести False'], 'io', width=220, height=60)
block(parts, 180, 1050, ['Конец'], 'terminal', width=220, height=60)
block(parts, 800, 1050, ['Конец'], 'terminal', width=220, height=60)
for path in ['M450 80V110', 'M450 170V195', 'M450 255V270', 'M450 380V435', 'M450 535V590',
             'M450 710V750H40V485H320', 'M580 485H680V740H450V770',
             'M695 325H930V880H800V930', 'M255 830H180V930', 'M645 830H800V930',
             'M180 990V1020', 'M800 990V1020']:
    arrow(parts, path)
for x, y, text in [(475, 402, 'Нет'), (755, 305, 'Да'), (480, 560, 'Да'), (615, 462, 'Нет'), (200, 805, 'Да'), (710, 805, 'Нет')]:
    label(parts, x, y, [text], 18)
save('palindrome-half', parts)
print('Three notebook flowcharts generated')
