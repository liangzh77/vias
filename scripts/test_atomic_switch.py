#!/usr/bin/env python3
"""Linux/GNU mv test of the exact production switch and rollback functions.
Run locally on Linux or copy beside release-remote.sh into a server /tmp directory.
Only touches a TemporaryDirectory; never touches the live site.
"""
from pathlib import Path
import subprocess
import tempfile

source = Path(__file__).with_name('release-remote.sh').read_text()
functions = source[source.index('atomic_switch() {'):source.index('trap cleanup EXIT')]
with tempfile.TemporaryDirectory(prefix='vias-atomic-test-') as temp:
    script = r'''
set -euo pipefail
root=$1
mkdir -p "$root/releases/20260101T000000Z" "$root/releases/20260102T000000Z"
ln -s releases/20260101T000000Z "$root/current"
link_dir='' staging='' switched=0
old_target=releases/20260101T000000Z
id=20260102T000000Z
''' + functions + r'''
trap cleanup EXIT
python3 - "$root" <<'PY' &
import os, pathlib, sys
root = pathlib.Path(sys.argv[1])
allowed = {'releases/20260101T000000Z', 'releases/20260102T000000Z'}
count = 0
while not (root / 'done').exists():
    assert os.readlink(root / 'current') in allowed
    assert (root / 'current').is_dir()
    count += 1
print(f'ATOMIC_READER_OK observations={count}')
PY
reader=$!
for ((i=0; i<100; i++)); do
  atomic_switch releases/20260102T000000Z
  atomic_switch releases/20260101T000000Z
done
touch "$root/done"
wait "$reader"
'''
    # A fresh non-conditional shell preserves Bash errexit/ERR semantics.
    subprocess.run(['bash', '-s', '--', temp], input=script, text=True, check=True)
    rollback_script = 'set -euo pipefail\nroot=$1\nlink_dir="" staging="" switched=1\nold_target=releases/20260101T000000Z\nid=20260102T000000Z\n' + functions + '''
trap cleanup EXIT
trap rollback ERR
atomic_switch releases/20260102T000000Z
false
'''
    result = subprocess.run(['bash', '-s', '--', temp], input=rollback_script, text=True)
    assert result.returncode != 0, 'Forced health failure must fail command'
    assert (Path(temp) / 'current').readlink().as_posix() == 'releases/20260101T000000Z'
    assert not list(Path(temp).glob('.link.*'))
    first_script = 'set -euo pipefail\nroot=$1\nlink_dir="" staging="" switched=0\nold_target=""\nid=20260102T000000Z\n' + functions + '''
rm "$root/current"
trap cleanup EXIT
trap rollback ERR
atomic_switch releases/$id
switched=1
false
'''
    result = subprocess.run(['bash', '-s', '--', temp], input=first_script, text=True)
    assert result.returncode != 0
    assert not (Path(temp) / 'current').exists() and not (Path(temp) / 'current').is_symlink()
    print('ATOMIC_SWITCH_OK switches=200; existing/first-release failure rollback=PASS (mv -T)')
