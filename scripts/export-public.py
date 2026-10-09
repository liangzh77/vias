#!/usr/bin/env python3
"""Export tracked + nonignored new files only, never private ignored data."""
import subprocess, sys, shutil
from pathlib import Path
root=Path(__file__).resolve().parents[1]; out=Path(sys.argv[1]).resolve()
out.mkdir(exist_ok=False,parents=True)
names=subprocess.check_output(['git','ls-files','-z','--cached','--others','--exclude-standard'],cwd=root).split(b'\0')
for raw in names:
 if not raw: continue
 name=raw.decode(); source=root/name
 if not source.exists(): continue
 if source.is_symlink() or not source.is_file(): raise SystemExit('Not regular: '+name)
 target=out/name; target.parent.mkdir(parents=True,exist_ok=True); shutil.copyfile(source,target)
print('EXPORTED',out)
