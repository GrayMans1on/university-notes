from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse, unquote
import json
import re


ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / 'dist'
TEXTBOOK_URLS = {book['url'] for book in json.loads((ROOT / 'content/textbooks.json').read_text())['books']}


class PageParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = set()
        self.links = []
        self.math_count = 0
        self.h1_count = 0
        self.external = []
        self.resources = []
        self.list_items = []

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        if 'id' in attrs:
            assert attrs['id'] not in self.ids, 'Duplicate anchor: ' + attrs['id']
            self.ids.add(attrs['id'])
        if tag == 'a' and 'href' in attrs:
            self.links.append(attrs['href'])
        if tag in ['link', 'script']:
            value = attrs.get('href', attrs.get('src', ''))
            if value.startswith('/'):
                self.resources.append(value)
        if tag == 'img':
            assert attrs.get('alt'), 'Diagram needs a description'
            self.resources.append(attrs['src'])
        if tag == 'iframe':
            assert attrs.get('title'), 'Embedded map needs a description'
            assert attrs.get('src', '').startswith('/'), 'Map must use a local source'
            self.links.append(attrs['src'])
        if tag == 'li':
            self.list_items.append(False)
        if tag == 'h1':
            self.h1_count += 1
        if tag == 'math':
            self.math_count += 1

    def handle_data(self, data):
        if data.strip() and self.list_items:
            self.list_items[-1] = True

    def handle_endtag(self, tag):
        if tag == 'li':
            assert self.list_items.pop(), 'Empty list item'


pages = {}
for file in DIST.rglob('*.html'):
    parser = PageParser()
    parser.feed(file.read_text())
    assert parser.h1_count == 1, 'Expected one page title: ' + str(file)
    pages[file.resolve()] = parser


def validate_link(source, link):
    url = urlparse(link)
    if url.scheme:
        assert link in TEXTBOOK_URLS or link in {
            'https://github.com/GrayMans1on/UniversityProjects_Shparov/tree/main/lectures',
            'https://map.csu.ru/',
        }, link
        return
    if url.path:
        target = (DIST / unquote(url.path).lstrip('/')) if url.path.startswith('/') else source.parent / unquote(url.path)
        if target.is_dir():
            target = target / 'index.html'
    else:
        target = source
    target = target.resolve()
    assert target.exists(), 'Missing local target: ' + str(target)
    if url.fragment:
        assert unquote(url.fragment) in pages[target].ids, 'Missing anchor: ' + link


for file, parser in pages.items():
    for link in parser.links:
        validate_link(file, link)
    for resource in parser.resources:
        assert (DIST / resource.lstrip('/')).is_file(), 'Missing asset: ' + resource

search = json.loads((DIST / 'assets/search-index.json').read_text())
for entry in search:
    validate_link(DIST / 'index.html', entry['url'])
    assert entry['title'] and entry['subject']

for file in (ROOT / 'content').glob('*.md'):
    # «Фотоплёнка» и «рукопись» могут быть учебными видами носителей.
    # Запрещены указания на источник расшифровки и ссылки на исходные снимки.
    assert not re.search(r'(?:на|по|из|с)\s+(?:фото(?:графии|графий)?|блокнот\w*)\b|рукописн\w*\s+(?:конспект|запис)|\.jpg|\.png|Преподаватель|исходный архив', file.read_text(), re.I), file
    assert not re.search(r'зачёрк|чернов|фамилия|на странице|на полях|требует уточнения|не заполнен|неуверенное чтение', file.read_text(), re.I), file

assert not (DIST / 'notes/programming').exists()
expected = json.loads((ROOT / 'validation-report.json').read_text())
quiz_aliases = json.loads((ROOT / 'content/quiz-aliases.json').read_text())
assert len(pages) == len(expected['subjects']) + expected['studyTopics'] + len(quiz_aliases) + len(expected['utilityPages'])
report = json.loads((ROOT / 'validation-report.json').read_text())
assert report['mathErrors'] == []
for font in re.findall(r'url\(([^)]+)\)', (DIST / 'assets/katex.min.css').read_text()):
    assert (DIST / 'assets' / font.strip('"\'')).is_file(), 'Missing math font: ' + font

print(json.dumps({'pages': len(pages), 'search_sections': len(search), 'math_expressions': report['mathCount'], 'links_and_anchors': 'valid', 'source_references': 'absent', 'programming': 'external_link'}, ensure_ascii=False))
