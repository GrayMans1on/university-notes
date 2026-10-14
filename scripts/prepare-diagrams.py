from pathlib import Path
from collections import Counter
import json
import re
from lxml import etree
from matplotlib.font_manager import FontProperties
from matplotlib.textpath import TextPath, TextToPath
from matplotlib.path import Path as MplPath

ROOT = Path(__file__).resolve().parents[1]
NS = 'http://www.w3.org/2000/svg'
XLINK = 'http://www.w3.org/1999/xlink'
COLORS = {
    'ink': ('#36465e', '#dce6f7'), 'muted': ('#42536c', '#afbed3'),
    'grid': ('#dce3ee', '#455775'), 'blue': ('#254cce', '#8faaff'),
    'green': ('#168276', '#64c5b4'), 'orange': ('#bd5b22', '#f3a56d'),
    'violet': ('#7955ba', '#bca2ed'), 'blue-soft': ('#dce6ff', '#263c67'),
    'green-soft': ('#d7f0eb', '#204139'), 'orange-soft': ('#ffe6d7', '#57382b'),
    'violet-soft': ('#e6dcf8', '#3d3059'), 'soft': ('#f3f6fd', '#1d2b41'),
    'surface': ('white', '#172234'), 'on-accent': ('white', '#0f1827'),
}
ALIASES = {'#c26427': 'orange', '#dbe6ff': 'blue-soft', '#f5f7fb': 'soft',
    '#f2f5fa': 'soft', '#f8faff': 'soft', '#fff3e9': 'orange-soft',
    '#ecf8f5': 'green-soft', '#f4faf8': 'green-soft'}
COLOR_KEYS = {value[0]: key for key, value in COLORS.items() if key != 'on-accent'} | ALIASES
FONT = FontProperties(family='DejaVu Sans')
METRICS = TextToPath()

def palette(theme):
    index = 1 if theme == 'dark' else 0
    return ';'.join('--diagram-' + key + ':' + values[index] for key, values in COLORS.items())

def path_data(path):
    result = []
    commands = {MplPath.MOVETO: 'M', MplPath.LINETO: 'L', MplPath.CURVE3: 'Q', MplPath.CURVE4: 'C'}
    for points, code in path.iter_segments(curves=True, simplify=False):
        if code == MplPath.CLOSEPOLY:
            result.append('Z')
        else:
            result.append(commands[code] + ' '.join(f'{coordinate:.4f}'.rstrip('0').rstrip('.') for coordinate in points))
    return ''.join(result)

def outlined_text(node, width):
    def inherited(attribute, fallback):
        for ancestor in [node, *node.iterancestors()]:
            if ancestor.get(attribute) is not None:
                return ancestor.get(attribute)
        return fallback
    label = ''.join(node.itertext())
    subscript = str.maketrans('₀₁₂₃₄₅₆₇₈₉', '0123456789')
    def vector(match):
        suffix = match[2].translate(subscript)
        return '$\\vec{' + match[1] + '}' + ('_{' + suffix + '}' if suffix else '') + '$'
    content = re.sub(r'([A-Za-z])\u20d7([₀-₉AB]?)', vector, label)
    prop = FONT.copy()
    prop.set_size(float(inherited('font-size', '16')))
    # Match SVG baseline and anchoring while using portable glyph outlines.
    text_width, _, _ = METRICS.get_text_width_height_descent(content, prop, ismath='$' in content)
    x, y = float(node.get('x', '0')), float(node.get('y', '0'))
    anchor = inherited('text-anchor', 'start')
    available = 2 * min(x - 4, width - x - 4) if anchor == 'middle' else x - 4 if anchor == 'end' else width - x - 4
    scale = min(1, max(1, available) / max(1, text_width))
    offset = text_width * scale / 2 if anchor == 'middle' else text_width * scale if anchor == 'end' else 0
    group = etree.Element('{' + NS + '}g', {'class': 'diagram-label', 'aria-label': label,
        'role': 'img', 'transform': f'translate({x - offset:.4f} {y:.4f}) scale({scale:.6f} -1)'})
    group.set('fill', inherited('fill', '#36465e'))
    etree.SubElement(group, '{' + NS + '}path', {'d': path_data(TextPath((0, 0), content, prop=prop))})
    group.tail = node.tail
    node.getparent().replace(node, group)

def share_matrix_glyphs(root, file):
    # Matrix zeros, ones and row labels repeat frequently. Keep standalone SVGs
    # portable without duplicating an identical glyph path for every cell.
    if not file.name.startswith('matrix-step-'):
        return
    # Retain both SVG 2 and SVG 1.1 references for older standalone viewers.
    def reference(identifier):
        return etree.Element('{' + NS + '}use', {'href': '#' + identifier,
            '{' + XLINK + '}href': '#' + identifier}, nsmap={'xlink': XLINK})
    for node in root.xpath('.//*[local-name()="use"]'):
        href = node.get('href') or node.get('{' + XLINK + '}href')
        if href and href.startswith('#'):
            replacement = reference(href[1:])
            replacement.tail = node.tail
            node.getparent().replace(node, replacement)
    nodes = root.xpath('.//*[local-name()="g" and @class="diagram-label"]/*[local-name()="path"]')
    counts = Counter(node.get('d') for node in nodes)
    repeated = {d: 'matrix-glyph-' + str(index + 1) for index, (d, count) in enumerate(counts.items()) if count > 1}
    if not repeated:
        return
    defs = etree.Element('{' + NS + '}defs')
    for d, identifier in repeated.items():
        etree.SubElement(defs, '{' + NS + '}path', {'id': identifier, 'd': d})
    root.insert(2, defs)
    for node in nodes:
        identifier = repeated.get(node.get('d'))
        if identifier:
            replacement = reference(identifier)
            replacement.tail = node.tail
            node.getparent().replace(node, replacement)

changed = []
labels = 0
stylesheet = '.study-diagram{' + palette('light') + '}@media(prefers-color-scheme:dark){.study-diagram{' + palette('dark') + '}}@media print{.study-diagram{' + palette('light') + '}}'
for file in sorted((ROOT / 'assets').glob('*.svg')):
    tree = etree.parse(str(file))
    root = tree.getroot()
    if root.get('data-prepared') == 'theme-outlines':
        style = root.find('{' + NS + '}style')
        share_matrix_glyphs(root, file)
        if style.text != stylesheet:
            style.text = stylesheet
        file.write_bytes(etree.tostring(root, encoding='utf-8'))
        continue
    width, height = map(float, root.get('viewBox').split()[2:])
    # Remove only a full-canvas background, never geometry used by masks.
    for node in list(root):
        if etree.QName(node).localname == 'rect' and float(node.get('width', '0')) == width and float(node.get('height', '0')) == height:
            root.remove(node)
    for node in root.xpath('.//*[local-name()="text"]'):
        outlined_text(node, width)
        labels += 1
    for node in root.iter():
        if any(etree.QName(parent).localname in ('mask', 'clipPath') for parent in node.iterancestors()):
            continue
        for attr in ('fill', 'stroke'):
            value = node.get(attr)
            key = 'on-accent' if value == 'white' and node.get('class') == 'diagram-label' else COLOR_KEYS.get(value)
            if key:
                node.set(attr, 'var(--diagram-' + key + ')')
    root.set('class', 'study-diagram')
    root.set('data-prepared', 'theme-outlines')
    style = etree.Element('{' + NS + '}style')
    style.text = stylesheet
    root.insert(1, style)
    share_matrix_glyphs(root, file)
    file.write_bytes(etree.tostring(root, encoding='utf-8'))
    changed.append(file.name)
print(json.dumps({'diagrams_prepared': len(changed), 'labels_outlined': labels}))
