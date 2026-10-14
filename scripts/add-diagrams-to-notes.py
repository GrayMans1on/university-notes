"""Insert the new illustrations while retaining every existing note line."""

from pathlib import Path
import json
import re


ROOT = Path(__file__).resolve().parent.parent
records = json.loads((ROOT / 'scripts/visualization-map.json').read_text())
grouped = {}
for record in records:
    grouped.setdefault((record['subject'], record['heading']), []).append(record)

for (subject, heading), diagrams in grouped.items():
    path = ROOT / 'content' / f'{subject}.md'
    content = path.read_text()
    additions = [f"![{d['description']}](/assets/{d['asset']}.svg)" for d in diagrams
                 if f"/assets/{d['asset']}.svg" not in content]
    if not additions:
        continue
    match = re.search(r'^#{2,6} '+re.escape(heading)+r'\s*$', content, re.M)
    if match is None:
        raise ValueError(f'Missing heading: {subject}: {heading}')
    following = re.search(r'^#{2,6} ', content[match.end():], re.M)
    position = match.end()+following.start() if following else len(content)
    # Only add image paragraphs; preserve the surrounding original bytes.
    content = content[:position]+'\n\n'+'\n\n'.join(additions)+'\n\n'+content[position:]
    path.write_text(content.rstrip()+'\n')

index = ROOT / 'content/subjects.json'
subjects = json.loads(index.read_text())
for subject in subjects:
    subject['content_bytes'] = (ROOT / 'content' / f"{subject['title']}.md").stat().st_size
index.write_text(json.dumps(subjects, ensure_ascii=False, indent=2)+'\n')
print(f'Inserted {len(records)} diagram references in five disciplines')
