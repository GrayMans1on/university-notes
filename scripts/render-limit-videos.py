"""Render verified Manim scenes and publish theme-matched MP4 and animated GIF files."""
from pathlib import Path
import hashlib
import json
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / '.manim-cache'
GIF_WIDTH = 720
GIF_FPS = 10


def video_duration(path):
    import av
    with av.open(str(path)) as container:
        if not container.streams.video or container.duration is None:
            raise RuntimeError(f'Missing video stream or duration: {path.name}')
        duration = container.duration / av.time_base
    if not 3 <= duration <= 120:
        raise RuntimeError(f'Unexpected video duration: {path.name}, {duration}')
    return duration


def gif_palette(colors):
    from PIL import Image
    background = tuple(bytes.fromhex(colors['background'].lstrip('#')))
    values = []
    for color, count in [('ink', 128), ('muted', 64), ('accent', 64)]:
        foreground = tuple(bytes.fromhex(colors[color].lstrip('#')))
        for index in range(count):
            ratio = index / (count - 1)
            values.extend(round(a + (b - a) * ratio) for a, b in zip(background, foreground))
    palette = Image.new('P', (1, 1))
    palette.putpalette(values)
    return palette


def render_gif(source, target, colors):
    import av
    from PIL import Image
    frames = []
    palette = gif_palette(colors)
    temporary = target.with_suffix('.tmp')
    try:
        with av.open(str(source)) as container:
            stream = container.streams.video[0]
            sample = 0
            for index, frame in enumerate(container.decode(stream)):
                timestamp = frame.time if frame.time is not None else index / float(stream.average_rate)
                if timestamp + 1e-6 < sample / GIF_FPS:
                    continue
                image = frame.to_image()
                resized = image.resize((GIF_WIDTH, round(image.height * GIF_WIDTH / image.width)), Image.Resampling.LANCZOS)
                frames.append(resized.quantize(palette=palette, dither=Image.Dither.NONE))
                image.close()
                resized.close()
                sample += 1
                if sample > 120 * GIF_FPS:
                    raise RuntimeError('GIF duration exceeds 120 seconds')
        if len(frames) < 2:
            raise RuntimeError(f'Missing animation frames: {source.name}')
        frames[0].save(temporary, format='GIF', save_all=True, append_images=frames[1:],
                       duration=1000 // GIF_FPS, loop=0, disposal=1, optimize=False)
        temporary.replace(target)
    finally:
        palette.close()
        for frame in frames:
            frame.close()
        temporary.unlink(missing_ok=True)


def gif_info(path, expected_duration):
    from PIL import Image
    with Image.open(path) as image:
        width, height = image.size
        count = image.n_frames
        duration = 0
        for index in range(count):
            image.seek(index)
            duration += image.info.get('duration', 0) / 1000
        if image.format != 'GIF' or count < 2 or image.info.get('loop') != 0:
            raise RuntimeError(f'Invalid animated GIF: {path.name}')
    if width != GIF_WIDTH or not 200 <= height <= 720 or abs(duration - expected_duration) > .25:
        raise RuntimeError(f'GIF dimensions or timing do not match the Manim video: {path.name}')
    return {'width': width, 'height': height, 'frames': count, 'duration': round(duration, 2),
            'size': path.stat().st_size, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}


def publish(publish_only=False):
    catalog = json.loads((CACHE / 'catalog.json').read_text())
    output = ROOT / 'pages-output/assets/limit-videos'
    output.mkdir(parents=True, exist_ok=True)
    for video in catalog['videos']:
        for theme in ('light', 'dark'):
            name = Path(video[theme]).name
            target = CACHE / name
            if not publish_only and not target.exists():
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
            gif = CACHE / Path(video['gif'][theme]).name
            if not publish_only:
                duration = video_duration(target)
                if not gif.exists():
                    render_gif(target, gif, catalog['palettes'][theme])
                video.setdefault('gifInfo', {})[theme] = gif_info(gif, duration)
            info = video.get('gifInfo', {}).get(theme, {})
            if not gif.is_file() or gif.stat().st_size != info.get('size'):
                raise RuntimeError(f'Missing or incomplete GIF: {gif}')
            with gif.open('rb') as source:
                if source.read(6) not in (b'GIF87a', b'GIF89a'):
                    raise RuntimeError(f'Invalid GIF header: {gif.name}')
            if hashlib.sha256(gif.read_bytes()).hexdigest() != info.get('sha256'):
                raise RuntimeError(f'GIF checksum mismatch: {gif.name}')
            shutil.copyfile(target, output / name)
            shutil.copyfile(gif, output / gif.name)
    text = json.dumps(catalog, ensure_ascii=False, indent=2)
    (CACHE / 'catalog.json').write_text(text)
    (output / 'catalog.json').write_text(text)
    count = len(catalog['videos']) * 2
    print(f'Published {count} Manim MP4s and {count} animated GIFs, '
          f'{sum(p.stat().st_size for p in output.glob("*.gif"))} GIF bytes')


if __name__ == '__main__':
    publish('--publish-only' in sys.argv)
