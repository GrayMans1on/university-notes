"""Export the checked static build for GitHub Pages project hosting."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit
import re
import shutil

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'pages-output'
PREFIX = '/university-notes'
ORIGIN = 'https://graymans1on.github.io'
OLD_ORIGIN = 'https://vlad-study-notes.graymansiongamedev.chatgpt.site'
LOCAL_PATH = re.compile(r'''(["'`(])(/(?=(?:assets|notes|check|map|reference|downloads|textbooks|tools|disciplines|schedule|bookmarks|settings)(?:/|["'`)?#])))''')

if OUTPUT.exists():
    shutil.rmtree(OUTPUT)
shutil.copytree(ROOT / 'dist', OUTPUT)
for file in OUTPUT.rglob('*'):
    if file.suffix in {'.html', '.js', '.mjs', '.css', '.json', '.md'}:
        text = file.read_text()
        text = LOCAL_PATH.sub(lambda match: match[1] + PREFIX + match[2], text)
        if file.suffix == '.html':
            text = text.replace('href="/"', 'href="' + PREFIX + '/"')
            text = text.replace('href="/#', 'href="' + PREFIX + '/#')
        text = text.replace(OLD_ORIGIN, ORIGIN + PREFIX)
        file.write_text(text)
(OUTPUT / '.nojekyll').touch()


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = set()
        self.urls = []

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        if 'id' in attrs:
            self.ids.add(attrs['id'])
        for name in ('href', 'src'):
            if name in attrs:
                self.urls.append(attrs[name])


pages = {}
for file in OUTPUT.rglob('*.html'):
    page = Links()
    page.feed(file.read_text())
    pages[file.resolve()] = page
checked = 0
for source, page in pages.items():
    for link in page.urls:
        url = urlsplit(link)
        if url.scheme or url.netloc:
            continue
        if url.path.startswith('/'):
            assert url.path.startswith(PREFIX + '/'), (source, link)
            target = OUTPUT / unquote(url.path[len(PREFIX) + 1:])
        else:
            target = source.parent / unquote(url.path) if url.path else source
        if target.is_dir():
            target /= 'index.html'
        target = target.resolve()
        assert target.is_file(), (source, link)
        if url.fragment and target in pages:
            assert unquote(url.fragment) in pages[target].ids, (source, link)
        checked += 1
print(f'GitHub Pages export: {len(pages)} pages, {checked} links and resources checked.')
