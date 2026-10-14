"""Verify optional signing inputs and prepare a public APK update feed."""
from pathlib import Path
import base64
import hashlib
import json
import os
import re
import shutil
import subprocess

root = Path(__file__).resolve().parents[1]
gradle = (root / 'android/app/build.gradle').read_text()
version_code = int(re.search(r'versionCode (\d+)', gradle)[1])
version_name = re.search(r"versionName '([^']+)'", gradle)[1]
unsigned = root / 'android/app/build/outputs/apk/release/app-release-unsigned.apk'
output = root / 'android/release-output'
output.mkdir(parents=True, exist_ok=True)
secrets = ['ANDROID_KEYSTORE_BASE64', 'ANDROID_KEYSTORE_PASSWORD', 'ANDROID_KEY_ALIAS', 'ANDROID_KEY_PASSWORD']
signed = all(os.environ.get(name) for name in secrets)
if signed:
    sdk = Path(os.environ.get('ANDROID_HOME') or os.environ['ANDROID_SDK_ROOT'])
    tools = sdk / 'build-tools/35.0.0'
    keystore = Path(os.environ['RUNNER_TEMP']) / 'notes-release.keystore'
    try:
        keystore.write_bytes(base64.b64decode(os.environ['ANDROID_KEYSTORE_BASE64'], validate=True))
        keystore.chmod(0o600)
        aligned = output / 'aligned.apk'
        apk = output / 'app.apk'
        subprocess.run([str(tools / 'zipalign'), '-f', '-p', '4', str(unsigned), str(aligned)], check=True)
        subprocess.run([str(tools / 'apksigner'), 'sign', '--ks', str(keystore), '--ks-key-alias',
                        os.environ['ANDROID_KEY_ALIAS'], '--ks-pass', 'env:ANDROID_KEYSTORE_PASSWORD',
                        '--key-pass', 'env:ANDROID_KEY_PASSWORD', '--out', str(apk), str(aligned)], check=True)
        subprocess.run([str(tools / 'apksigner'), 'verify', '--verbose', str(apk)], check=True)
        aligned.unlink()
    finally:
        keystore.unlink(missing_ok=True)
    data = apk.read_bytes()
    manifest = {'schema': 1, 'packageName': 'ru.graymansion.study', 'versionCode': version_code,
                'versionName': version_name, 'size': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
    (output / 'app-release.json').write_text(json.dumps(manifest, indent=2) + '\n')
    feed = root / 'pages-output/android'
    shutil.copyfile(apk, feed / 'app.apk')
    shutil.copyfile(output / 'app-release.json', feed / 'app-release.json')
else:
    shutil.copyfile(unsigned, output / 'app-release-unsigned.apk')
    (output / 'SIGNING_REQUIRED.txt').write_text(
        'This APK is unsigned and cannot be installed. Sign it with the original application key.\n'
        'No substitute key was generated. Automatic APK publication is disabled without all signing secrets.\n')
with open(os.environ['GITHUB_OUTPUT'], 'a') as handle:
    handle.write(f'signed={str(signed).lower()}\nversion={version_name}\n')
with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as handle:
    handle.write(f'Android {version_name}: ' + ('signed APK verified and published in the update feed.\n' if signed else
                                             'unsigned APK artifact only; original signing secrets are missing.\n'))
