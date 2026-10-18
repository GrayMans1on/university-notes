"""Assemble original PDFs for Pages only, keeping books out of Android feeds and APKs."""
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]


def assemble(output):
    manifest = json.loads((ROOT / 'books/sources.json').read_text())
    catalog = json.loads((ROOT / 'content/textbooks.json').read_text())
    assert manifest['schema'] == 1
    books = {book['id']: book for book in catalog['books']}
    assert len(books) == len(manifest['books'])
    output.mkdir(parents=True, exist_ok=True)
    for source in manifest['books']:
        book = books[source['id']]
        assert re.fullmatch(r'[a-z0-9-]+\.pdf', source['fileName'])
        assert source['size'] == book['size'] and source['sha256'] == book['sha256']
        assert urlsplit(book['url']).path.endswith('/books/' + source['fileName'])
        digest = hashlib.sha256()
        size = 0
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(dir=output, delete=False) as destination:
                temporary = Path(destination.name)
                for part in source['parts']:
                    path = (ROOT / part['path']).resolve()
                    assert path.is_relative_to((ROOT / 'books/source').resolve())
                    part_hash = hashlib.sha256()
                    part_size = 0
                    with path.open('rb') as stream:
                        while chunk := stream.read(1024 * 1024):
                            destination.write(chunk)
                            digest.update(chunk)
                            part_hash.update(chunk)
                            part_size += len(chunk)
                    assert part_size == part['size'] and part_hash.hexdigest() == part['sha256'], path
                    size += part_size
            assert size == book['size'] and digest.hexdigest() == book['sha256'], book['id']
            with temporary.open('rb') as stream:
                assert stream.read(5) == b'%PDF-'
            os.replace(temporary, output / source['fileName'])
            print(f"Published {source['fileName']}: {size} bytes, SHA-256 verified")
        finally:
            if temporary and temporary.exists():
                temporary.unlink()


if __name__ == '__main__':
    assemble(ROOT / 'pages-output/books')
