"""Verify optional signing inputs and prepare a public APK update feed."""
from pathlib import Path
import base64
import hashlib
import json
import os
import re
import shutil
import subprocess
import urllib.request
import urllib.error

root = Path(__file__).resolve().parents[1]
gradle = (root / 'android/app/build.gradle').read_text()
version_code = int(re.search(r'versionCode (\d+)', gradle)[1])
version_name = re.search(r"versionName '([^']+)'", gradle)[1]
unsigned = root / 'android/app/build/outputs/apk/release/app-release-unsigned.apk'
output = root / 'android/release-output'
if output.exists():
    shutil.rmtree(output)
output.mkdir(parents=True)
secrets = ['ANDROID_KEYSTORE_BASE64', 'ANDROID_KEYSTORE_PASSWORD', 'ANDROID_KEY_ALIAS', 'ANDROID_KEY_PASSWORD']
signed = all(os.environ.get(name) for name in secrets)
candidate = root / 'android/release-candidate.json'
if not signed and candidate.exists():
    record = json.loads(candidate.read_text())
    if record['versionCode'] == version_code and record['versionName'] == version_name:
        source = record['sourceCommit']
        if not re.fullmatch(r'[0-9a-f]{40}', source):
            raise ValueError('Invalid APK source commit')
        subprocess.run(['git', 'merge-base', '--is-ancestor', source, 'HEAD'], cwd=root, check=True)
        subprocess.run(['git', 'diff', '--exit-code', source, 'HEAD', '--', 'android/app', 'android/web'], cwd=root, check=True)
        # The public blob contains an already signed APK, never a private key.
        release_url = f'https://github.com/GrayMans1on/university-notes/releases/download/android-v{version_name}/app.apk'
        # Prefer the permanent release asset on repeated builds.
        try:
            with urllib.request.urlopen(release_url, timeout=90) as response:
                data = response.read(30 * 1024 * 1024 + 1)
        except urllib.error.HTTPError as error:
            if error.code != 404:
                raise
            parts = record.get('blobParts', [record.get('blobSha')])
            if not isinstance(parts, list) or not 1 <= len(parts) <= 40:
                raise ValueError('Invalid APK transfer parts')
            data = bytearray()
            for sha in parts:
                if not isinstance(sha, str) or not re.fullmatch(r'[0-9a-f]{40}', sha):
                    raise ValueError('Invalid APK blob SHA')
                request = urllib.request.Request(
                    'https://api.github.com/repos/GrayMans1on/university-notes/git/blobs/' + sha,
                    headers={'Accept': 'application/vnd.github.raw+json', 'User-Agent': 'university-notes-release'})
                token = os.environ.get('GH_TOKEN')
                if token:
                    request.add_header('Authorization', 'Bearer ' + token)
                with urllib.request.urlopen(request, timeout=90) as response:
                    part = response.read(30 * 1024 * 1024 + 1)
                data.extend(base64.b64decode(part, validate=True) if 'blobParts' in record else part)
                if len(data) > 30 * 1024 * 1024:
                    raise ValueError('Signed APK exceeds size limit')
        if len(data) != record['size'] or hashlib.sha256(data).hexdigest() != record['sha256']:
            raise ValueError('Signed APK size/hash mismatch')
        apk = output / 'app.apk'
        apk.write_bytes(data)
        sdk = Path(os.environ.get('ANDROID_HOME') or os.environ['ANDROID_SDK_ROOT'])
        tools = sdk / 'build-tools/35.0.0'
        verified = subprocess.check_output([str(tools / 'apksigner'), 'verify', '--print-certs', str(apk)], text=True)
        fingerprint = 'c2ae14afcf9d9343a8890c26016b309be15a3383e158f5ccdc398ecd9f390e38'
        if 'certificate SHA-256 digest: ' + fingerprint not in verified:
            raise ValueError('APK must use the original 1.1.1 signing certificate')
        badging = subprocess.check_output([str(tools / 'aapt2'), 'dump', 'badging', str(apk)], text=True)
        expected = f"package: name='ru.graymansion.study' versionCode='{version_code}' versionName='{version_name}'"
        if not badging.startswith(expected):
            raise ValueError('APK package/version mismatch')
        signed = True
        print('Original-key signed APK hash, certificate and package/version verified.')
if signed and not (output / 'app.apk').exists():
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
if signed:
    apk = output / 'app.apk'
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
