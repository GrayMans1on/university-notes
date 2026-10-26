"""Render verified course-limit scenes and publish compact, theme-matched MP4 files."""
from pathlib import Path
import json
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / '.manim-cache'
PUBLISH_ONLY = '--publish-only' in sys.argv
catalog = json.loads((CACHE / 'catalog.json').read_text())
output = ROOT / 'pages-output/assets/limit-videos'
output.mkdir(parents=True, exist_ok=True)
for video in catalog['videos']:
    for theme in ('light', 'dark'):
        name = Path(video[theme]).name
        target = CACHE / name
        if not PUBLISH_ONLY and not target.exists():
            scene = CACHE / (Path(name).stem + '.py')
            subprocess.run([
                sys.executable, '-m', 'manim', '-ql', '--fps', '15', '--disable_caching',
                '--media_dir', str(CACHE / 'media'), '-o', name, str(scene), 'LimitSolution',
            ], cwd=ROOT, check=True, timeout=180)
            candidates = list((CACHE / 'media/videos').rglob(name))
            if len(candidates) != 1:
                raise RuntimeError(f'Expected one Manim render for {name}, got {candidates}')
            shutil.copyfile(candidates[0], target)
        if not target.is_file() or target.stat().st_size < 1000:
            raise RuntimeError(f'Missing or empty video: {target}')
        if not PUBLISH_ONLY:
            import av
            with av.open(str(target)) as container:
                if not container.streams.video or container.duration is None:
                    raise RuntimeError(f'Missing video stream or duration: {name}')
                duration = container.duration / av.time_base
            if not 3 <= duration <= 120:
                raise RuntimeError(f'Unexpected video duration: {name}, {duration}')
        shutil.copyfile(target, output / name)
(output / 'catalog.json').write_text(json.dumps(catalog, ensure_ascii=False, indent=2))
print(f'Published {len(catalog["videos"]) * 2} Manim MP4s, {sum(p.stat().st_size for p in output.glob("*.mp4"))} bytes')
