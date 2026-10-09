#!/usr/bin/env python3
"""Linux config CAS/backup/validate/reload. Explicit inputs; never called by packaging.
All publishers of the site must honor the adjacent lock. Unknown concurrent edits
are preserved, never automatically rolled back. Does not touch app services.
"""
import argparse, fcntl, hashlib, os, shlex, subprocess, tempfile
from pathlib import Path
p=argparse.ArgumentParser()
p.add_argument('config'); p.add_argument('candidate'); p.add_argument('expected_old_hash'); p.add_argument('backup')
p.add_argument('--validate',default='caddy validate --config /etc/caddy/Caddyfile')
p.add_argument('--reload',default='systemctl reload caddy')
p.add_argument('--restore',action='store_true',help='CAS restore an explicitly trusted prior backup; never an unreviewed candidate')
a=p.parse_args()
config=Path(a.config); candidate=Path(a.candidate)
def sha(b): return hashlib.sha256(b).hexdigest()
def replace(data):
 fd,name=tempfile.mkstemp(prefix='.vias-config-',dir=config.parent)
 try:
  with os.fdopen(fd,'wb') as f:
   f.write(data); f.flush(); os.fsync(f.fileno())
  os.chmod(name,0o644); os.replace(name,config)
 finally:
  if os.path.exists(name): os.unlink(name)
def run(cmd): subprocess.run(shlex.split(cmd),check=True)
with open(str(config)+'.vias.lock','a') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
 if config.is_symlink() or not config.is_file() or candidate.is_symlink(): raise SystemExit('Real config/candidate files required')
 old=config.read_bytes(); new=candidate.read_bytes(); newhash=sha(new)
 if sha(old)!=a.expected_old_hash: raise SystemExit('Expected-old-hash mismatch')
 # Refuse any unrelated modifications: candidate must equal our exact insertion.
 # Structural delta is checked by independently generating the expected candidate.
 if not a.restore:
  with tempfile.TemporaryDirectory() as d:
   expected=Path(d)/'candidate'
   subprocess.run(['python3',str(Path(__file__).with_name('caddy-vias.py')),str(config),str(expected)],check=True)
   if expected.read_bytes()!=new: raise SystemExit('Candidate changes more than Vias routes')
 with open(a.backup,'xb') as f: f.write(old); f.flush(); os.fsync(f.fileno())
 if sha(config.read_bytes())!=a.expected_old_hash: raise SystemExit('Concurrent config edit before replace')
 replace(new)
 try:
  run(a.validate)
  if sha(config.read_bytes())!=newhash: raise RuntimeError('Concurrent edit before reload')
  run(a.reload)
  if sha(config.read_bytes())!=newhash: raise RuntimeError('Concurrent edit after reload')
 except BaseException:
  if sha(config.read_bytes())!=newhash: raise SystemExit('Concurrent edit: rollback refused; manual recovery required')
  replace(old); run(a.validate); run(a.reload)
  raise
 print('CONFIG_OK backup='+a.backup+' hash='+newhash)
