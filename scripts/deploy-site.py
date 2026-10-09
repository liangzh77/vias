#!/usr/bin/env python3
"""Linux explicit deploy coordinator. NOT run during packaging or Phase A.
Config-first supports first publication. File health failure restores current via
release-remote.sh, then restores only our unchanged config using CAS + validate/reload.
All paths/version/manifest must be pre-reviewed. No upload or service restart.
"""
import argparse, fcntl, hashlib, subprocess
from pathlib import Path
p=argparse.ArgumentParser()
p.add_argument('id');p.add_argument('manifest');p.add_argument('checker');p.add_argument('archive');p.add_argument('root');p.add_argument('base_url')
p.add_argument('--mode',choices=['deploy','switch'],default='deploy')
p.add_argument('--config');p.add_argument('--candidate');p.add_argument('--expected-old-hash');p.add_argument('--backup')
p.add_argument('--validate',default='caddy validate --config /etc/caddy/Caddyfile')
p.add_argument('--reload',default='systemctl reload caddy')
a=p.parse_args();s=Path(__file__).resolve().parent
root=Path(a.root)
if root.is_symlink() or not root.is_dir():p.error('Release root must be a real existing directory')
# All cooperating deployment/rollback invocations use this coordinator lock.
lock=open(root/'.site-transaction.lock','a')
fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
config_args=[a.config,a.candidate,a.expected_old_hash,a.backup]
if any(config_args) and not all(config_args):p.error('Config transaction requires all four config arguments')
changed=False
if a.config:
 subprocess.run(['python3',str(s/'config-transaction.py'),*config_args,'--validate',a.validate,'--reload',a.reload],check=True)
 changed=True
 newhash=hashlib.sha256(Path(a.candidate).read_bytes()).hexdigest()
try:
 subprocess.run(['bash',str(s/'release-remote.sh'),a.mode,a.id,a.manifest,a.checker,a.archive,a.root,a.base_url],check=True)
except BaseException:
 if changed:
  # Preserve any concurrent edit; config-transaction enforces the expected hash.
  subprocess.run(['python3',str(s/'config-transaction.py'),a.config,a.backup,newhash,a.backup+'.failed-candidate','--restore','--validate',a.validate,'--reload',a.reload],check=True)
 raise
print('DEPLOY_SITE_OK')
