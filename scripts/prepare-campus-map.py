import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess


ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('download_directory', type=Path)
args = parser.parse_args()
download = args.download_directory
source = ROOT / 'content/campus-map'
assets = ROOT / 'assets/campus-map'
source.mkdir(parents=True, exist_ok=True)
assets.mkdir(parents=True, exist_ok=True)

original_js = (download / 'index-CHM00tdg.js').read_text()
original_css = (download / 'index-OmgHWn0x.css').read_text()
patches = [
    ('const o4="https://map.csu.ru/api/map_data",c4="DELETED(temporarily)";',
     'const o4="/assets/campus-map/data.json",c4=o4;'),
    ('fetch("https://map.csu.ru/api/feedback/saveFeedback",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(A)})',
     'Promise.resolve({status:503})'),
    ('k.jsx("div",{className:"feedback",onClick:A,children:"Обратная связь"})', 'null'),
    ('k.jsx("div",{className:`cat-easter-egg ${d?"show":""}`,children:k.jsx("img",{src:"https://media.tenor.com/4YCgHLAsE3UAAAAi/rick-roll.gif",alt:"Рик Ролл"})})',
     'null'),
]
local_js = original_js
for before, after in patches:
    assert local_js.count(before) == 1, 'Upstream map changed: patch needs review'
    local_js = local_js.replace(before, after)
local_js += '\n// Stable exports for local map extensions and routing validation.\n'
local_js += 'export { jt as campusMapStore, l9 as buildCampusGraph, Ig as findCampusRoute };\n'

font_import = '@import"https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;700&display=swap";'
assert original_css.startswith(font_import), 'Upstream font import changed'
local_css = original_css.removeprefix(font_import)
font_css = (download / 'nunito-fonts.css').read_text()
font_urls = re.findall(r'url\(([^)]+)\)', font_css)
assert len(font_urls) == 3
for weight, url in zip([400, 500, 700], font_urls):
    filename = f'Nunito-{weight}.ttf'
    assert (download / filename).stat().st_size > 10000, 'Font download incomplete'
    shutil.copyfile(download / filename, assets / filename)
    font_css = font_css.replace(url, '/assets/campus-map/' + filename)

data_bytes = (download / 'map_data').read_bytes()
data = json.loads(data_bytes)
assert [layer['floorIndex'] for layer in data['layers']] == list(range(5))
(source / 'data.json').write_bytes(data_bytes)
(source / 'upstream.js').write_text(original_js)
(source / 'upstream.css').write_text(original_css)
(assets / 'map.js').write_text(local_js)
(assets / 'map.css').write_text(local_css)
(assets / 'fonts.css').write_text(font_css)
metadata = {
    'origin': 'https://map.csu.ru/',
    'captured_at': datetime.now(timezone.utc).isoformat(),
    'data_sha256': hashlib.sha256(data_bytes).hexdigest(),
    'upstream_js_sha256': hashlib.sha256(original_js.encode()).hexdigest(),
    'upstream_css_sha256': hashlib.sha256(original_css.encode()).hexdigest(),
    'floors': [layer['floorIndex'] for layer in data['layers']],
    'rooms': sum(len(layer['rooms']) for layer in data['layers']),
    'roads': sum(len(layer['roads']) for layer in data['layers']),
    'patches': [{'before': before, 'after': after} for before, after in patches],
}
(source / 'source.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({key: metadata[key] for key in ['floors', 'rooms', 'roads', 'data_sha256']}))
subprocess.run(['python3', str(ROOT / 'scripts/adapt-campus-map.py')], check=True)
