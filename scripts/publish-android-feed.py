"""Attach the offline app's update feed to the GitHub Pages deployment."""
from pathlib import Path
import shutil

root = Path(__file__).resolve().parents[1]
source = root / 'android/generated/assets'
output = root / 'pages-output/android'
output.mkdir(parents=True, exist_ok=True)
shutil.copyfile(source / 'bundle-manifest.json', output / 'manifest.json')
# Only this generated directory is replaced; APK and release manifest are preserved.
if (output / 'content').exists():
    shutil.rmtree(output / 'content')
shutil.copytree(source / 'site', output / 'content')
print('Android Wi-Fi update feed prepared.')
