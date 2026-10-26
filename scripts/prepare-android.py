"""Prepare a self-contained Android bundle and a checksummed update feed."""
from pathlib import Path
from html import escape
import hashlib
import json
import re
import shutil
from urllib.parse import quote
import cairosvg

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'android/generated/assets'
SITE = OUTPUT / 'site'
if OUTPUT.exists():
    shutil.rmtree(OUTPUT)
SITE.mkdir(parents=True)
shutil.copytree(ROOT / 'dist', SITE, dirs_exist_ok=True, ignore=shutil.ignore_patterns('*.pdf', '*.PDF', '.*'))
# Site-only tools must never enter the offline application or its update feed.
shutil.rmtree(SITE / 'tools', ignore_errors=True)
for name in ('tools.css', 'tools-v2.css', 'tool-core.js', 'reader-tools.js', 'tools.js', 'tools-v2.js',
             'flow-editor.js', 'flow-runtime.js', 'math-tools.js', 'math-runtime.js',
             'tool-session.js', 'limits-ui.js', 'limits-worker.js', 'limits-engine.js',
             'manim-export.js', 'manim-scene.py', 'flow-export.js', 'derivatives-engine.js', 'linear-engine.js', 'radix-engine.js', 'academic-tools-ui.js', 'discrete-engine.js', 'discrete-ui.js',
             'tool-catalog.json', 'teachers.json', 'announcements.json', 'katex.min.js'):
    (SITE / 'assets' / name).unlink(missing_ok=True)
shutil.rmtree(SITE / 'assets/mathlive', ignore_errors=True)
shutil.rmtree(SITE / 'assets/compute-engine', ignore_errors=True)
for page in SITE.rglob('*.html'):
    text = page.read_text()
    text = re.sub(r'<(?:script|link)\b[^>]*(?:manim-export\.js|flow-export\.js|derivatives-engine\.js|linear-engine\.js|radix-engine\.js|academic-tools-ui\.js|discrete-engine\.js|discrete-ui\.js|tool-session\.js|limits-ui\.js|tools\.css|tools-v2\.css|tool-core\.js|reader-tools\.js|tools\.js|tools-v2\.js|flow-editor\.js|flow-runtime\.js|math-tools\.js|math-runtime\.js)[^>]*>(?:</script>)?', '', text)
    text = re.sub(r'<a\b[^>]*href="/tools/[^"\s]*"[^>]*>.*?</a>', '', text, flags=re.S)
    page.write_text(text)
renamed = {}
for file in list(SITE.rglob('*')):
    if file.is_file() and not file.name.isascii():
        target = file.with_name(file.parent.name + file.suffix)
        old = file.relative_to(SITE).as_posix()
        new = target.relative_to(SITE).as_posix()
        renamed[old] = new
        file.rename(target)
for file in SITE.rglob('*'):
    if file.suffix in {'.html', '.js', '.mjs', '.json', '.md'}:
        text = file.read_text()
        for old, new in renamed.items():
            text = text.replace(quote(old), new).replace(old, new)
        text = text.replace('https://vlad-study-notes.graymansiongamedev.chatgpt.site',
                            'https://graymans1on.github.io/university-notes')
        file.write_text(text)
for name in ('mobile.js', 'mobile.css'):
    shutil.copyfile(ROOT / 'android/web' / name, SITE / 'assets' / name)
shutil.copyfile(ROOT / 'android/web/bookmark.svg', SITE / 'assets/material-icons/bookmark.svg')
for file in SITE.rglob('*.html'):
    text = file.read_text()
    controls = '<link rel="stylesheet" href="/assets/form-controls.css"><script defer src="/assets/form-controls.js"></script>'
    file.write_text(text.replace('</head>', controls + '</head>'))
    if file.relative_to(SITE).as_posix() == 'map/view/index.html':
        continue
    text = file.read_text()
    extra = '<link rel="stylesheet" href="/assets/mobile.css">'
    if 'src="/assets/schedule.js"' not in text:
        extra += '<script defer src="/assets/schedule.js"></script>'
    extra += '<script defer src="/assets/mobile.js"></script>'
    file.write_text(text.replace('</head>', extra + '</head>'))

schedule = json.loads((ROOT / 'dist/assets/campus-map/schedule.json').read_text())
map_data = json.loads((SITE / 'assets/campus-map/data.json').read_text())
rooms = []
for layer in map_data['layers']:
    for room in layer['rooms']:
        rooms.append((room, layer))


def normal(value):
    return re.sub(r'[\s–—-]', '', (value or '').lower().replace('а', 'a').replace('б', 'b'))


def points(room):
    if 'x' in room:
        return [(room['x'], room['y']), (room['x'] + room.get('width', 0), room['y'] + room.get('height', 0))]
    result = []
    x = y = 0
    for match in re.finditer(r'([MLHV])([^MLHVZ]*)', room.get('data', ''), re.I):
        values = [float(n) for n in re.findall(r'-?\d+(?:\.\d+)?', match[2])]
        command = match[1].upper()
        if command in ('H', 'V'):
            for n in values:
                if command == 'H':
                    x = n
                else:
                    y = n
                result.append((x, y))
        else:
            for i in range(0, len(values) - 1, 2):
                x, y = values[i:i + 2]
                result.append((x, y))
    return result


def center(room):
    p = points(room)
    if not p:
        return None
    xs, ys = zip(*p)
    return ((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2)


def shape(room, selected):
    fill = '#dae5ff' if selected else '#ffffff'
    stroke = '#254cce' if selected else '#8b98aa'
    width = '2' if selected else '1'
    style = f'fill="{fill}" stroke="{stroke}" stroke-width="{width}"'
    if 'data' in room:
        return f'<path d="{escape(room["data"], quote=True)}" {style}/>'
    if 'x' in room:
        return f'<rect x="{room["x"]}" y="{room["y"]}" width="{room.get("width", 0)}" height="{room.get("height", 0)}" {style}/>'
    return ''


thumbs = SITE / 'assets/room-thumbnails'
thumbs.mkdir(exist_ok=True)
created = {}
preview_lessons = [(lesson, lesson) for lesson in schedule['lessons']]
for event in schedule['exceptions'] + [dict(event, source={'lessonId': event['lessonId']}, target={'lesson': event['patch']}) for event in schedule['permanentChanges'] if event.get('patch')]:
    if not event.get('target'):
        continue
    patch = event['target']['lesson']
    if event['action'] == 'add' or any(field in patch for field in ('room', 'place', 'note')):
        original = next((lesson for lesson in schedule['lessons'] if lesson['id'] == event.get('source', {}).get('lessonId')), {})
        effective = {**original, **patch}
        if 'room' in patch:
            effective.pop('place', None)
        if 'place' in patch:
            effective.pop('room', None)
        preview_lessons.append((effective, patch))
for lesson, output_lesson in preview_lessons:
    if lesson.get('onlineCourse') or 'онлайн' in lesson.get('note', '').lower():
        output_lesson['mapUrl'] = None
        continue
    target = next(((r, l) for r, l in rooms if r['id'] == 'fok'), None) if lesson.get('place') == 'ФОК ЧелГУ' else None
    names = lesson.get('room', '').split('/')
    matches = [(r, l) for name in names for r, l in rooms if normal(r.get('name', '')) == normal(name) and name]
    if target is not None:
        matches = [target]
    if not matches:
        continue
    room, layer = matches[0]
    key = hashlib.sha256(room['id'].encode()).hexdigest()[:16]
    file = 'assets/room-thumbnails/' + key + '.png'
    output_lesson['thumbnail'] = file
    output_lesson['mapUrl'] = '/map/?place=fok' if target is not None else '/map/?' + ('rooms=' if len(matches) > 1 else 'room=') + ','.join(r['id'] for r, _ in matches)
    if key in created:
        continue
    c = center(room)
    if c is None:
        continue
    selected_points = points(room)
    xs, ys = zip(*selected_points)
    w = max(220, (max(xs) - min(xs)) * 2.6, (max(ys) - min(ys)) * 3.4)
    h = w * 0.58
    svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="480" height="278" viewBox="{c[0]-w/2} {c[1]-h/2} {w} {h}">',
           f'<rect x="{c[0]-w/2}" y="{c[1]-h/2}" width="{w}" height="{h}" fill="#f5f7fb"/>']
    labels = []
    for neighbour in layer['rooms']:
        n = center(neighbour)
        if n is None or abs(n[0] - c[0]) > w * 1.3 or abs(n[1] - c[1]) > h * 1.3:
            continue
        svg.append(shape(neighbour, neighbour['id'] == room['id']))
        label = neighbour.get('name', '')
        if label and len(label) < 12:
            labels.append(f'<text x="{n[0]}" y="{n[1]}" text-anchor="middle" dominant-baseline="middle" font-family="DejaVu Sans" font-size="{w/35}" fill="#182333">{escape(label)}</text>')
    svg.extend(labels)
    svg.append('</svg>')
    cairosvg.svg2png(bytestring=''.join(svg).encode(), write_to=str(SITE / file))
    dark_svg = ''.join(svg)
    for source, target in [('#f5f7fb', '#0f1827'), ('#ffffff', '#1d2b40'), ('#dae5ff', '#253557'),
                           ('#8b98aa', '#8495b0'), ('#254cce', '#a8bcff'), ('#182333', '#e4ebf5')]:
        dark_svg = dark_svg.replace(source, target)
    cairosvg.svg2png(bytestring=dark_svg.encode(), write_to=str(SITE / file.replace('.png', '-dark.png')))
    created[key] = room['id']
(SITE / 'assets/app-data.json').write_text(json.dumps({'schedule': schedule}, ensure_ascii=False))
files = {}
for file in sorted(SITE.rglob('*')):
    if file.is_file():
        data = file.read_bytes()
        files[file.relative_to(SITE).as_posix()] = {'size': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
version = hashlib.sha256(json.dumps(files, sort_keys=True).encode()).hexdigest()
manifest = {'schema': 1, 'minAppVersion': 7, 'version': version, 'files': files}
(OUTPUT / 'bundle-manifest.json').write_text(json.dumps(manifest))
print(json.dumps({'files': len(files), 'bytes': sum(f['size'] for f in files.values()), 'thumbnails': len(created), 'version': version}))
