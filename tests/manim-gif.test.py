"""Verify GIF conversion timing, animation and theme colors using a small MP4."""
from fractions import Fraction
import importlib.util
from pathlib import Path
import tempfile
import unittest

import av
from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('limit_media', ROOT / 'scripts/render-limit-videos.py')
media = importlib.util.module_from_spec(spec)
spec.loader.exec_module(media)


class GifExportTest(unittest.TestCase):
    def test_animation_duration_and_both_palettes(self):
        for background, ink in [('#ffffff', '#182333'), ('#172234', '#e4ebf5')]:
            with self.subTest(theme=background), tempfile.TemporaryDirectory() as directory:
                source = Path(directory) / 'sample.mp4'
                target = Path(directory) / 'sample.gif'
                with av.open(str(source), mode='w') as container:
                    stream = container.add_stream('libx264', rate=15)
                    stream.width = 320
                    stream.height = 180
                    stream.pix_fmt = 'yuv420p'
                    for index in range(60):
                        image = Image.new('RGB', (320, 180), background)
                        draw = ImageDraw.Draw(image)
                        draw.rectangle((20 + index, 70, 70 + index, 100), fill=ink)
                        frame = av.VideoFrame.from_image(image)
                        frame.pts = index
                        frame.time_base = Fraction(1, 15)
                        for packet in stream.encode(frame):
                            container.mux(packet)
                        image.close()
                    for packet in stream.encode():
                        container.mux(packet)
                colors = {'background': background, 'ink': ink, 'muted': ink, 'accent': ink}
                media.render_gif(source, target, colors)
                info = media.gif_info(target, media.video_duration(source))
                self.assertAlmostEqual(info['duration'], 4, delta=.1)
                self.assertGreater(info['frames'], 1)
                with Image.open(target) as gif:
                    first = gif.convert('RGB')
                    expected = bytes.fromhex(background[1:])
                    for actual, color in zip(first.getpixel((0, 0)), expected):
                        self.assertLessEqual(abs(actual - color), 4)
                    gif.seek(gif.n_frames - 1)
                    last = gif.convert('RGB')
                    self.assertIsNotNone(ImageChops.difference(first, last).getbbox())
                    first.close()
                    last.close()


if __name__ == '__main__':
    unittest.main()
