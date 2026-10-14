"""Attach the offline app's update feed to the GitHub Pages deployment."""
from pathlib import Path
import shutil

root = Path(__file__).resolve().parents[1]
source = root / 'android/generated/assets'
output = root / 'pages-output/android'
output.mkdir(parents=True, exist_ok=True)
shutil.copyfile(source / 'bundle-manifest.json', output / 'manifest.json')
shutil.copytree(source / 'site', output / 'content', dirs_exist_ok=True)
print('Android Wi-Fi update feed prepared.')
