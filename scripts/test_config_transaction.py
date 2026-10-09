#!/usr/bin/env python3
import hashlib, subprocess, tempfile, unittest
from pathlib import Path
S=Path(__file__).resolve().parent
class ConfigTests(unittest.TestCase):
 def test_transaction(self):
  for case in ('ok','stale','validate-fail','reload-fail','concurrent'):
   with self.subTest(case=case),tempfile.TemporaryDirectory() as d:
    d=Path(d);config=d/'site';candidate=d/'candidate';backup=d/'backup'
    old=b'liangz77.cn {\n    handle /hairplay/* {\n        respond "keep"\n    }\n    respond "main"\n}\n'
    config.write_bytes(old)
    subprocess.run(['python3',str(S/'caddy-vias.py'),str(config),str(candidate)],check=True)
    mock=d/'mock.py'
    mock.write_text('import pathlib,sys\np=pathlib.Path(sys.argv[1])\nmode=sys.argv[2]\nif b"/vias" in p.read_bytes():\n if mode=="concurrent": p.write_text("other publisher")\n if mode!="ok": sys.exit(1)\n')
    validate=f'python3 {mock} {config} '+('validate-fail' if case=='validate-fail' else 'ok')
    reload=f'python3 {mock} {config} '+(case if case in ('reload-fail','concurrent') else 'ok')
    r=subprocess.run(['python3',str(S/'config-transaction.py'),str(config),str(candidate),'0'*64 if case=='stale' else hashlib.sha256(old).hexdigest(),str(backup),'--validate',validate,'--reload',reload],capture_output=True,text=True)
    self.assertEqual(r.returncode==0,case=='ok',r.stderr)
    self.assertEqual(config.read_bytes(),candidate.read_bytes() if case=='ok' else b'other publisher' if case=='concurrent' else old)
    if case!='stale':self.assertEqual(backup.read_bytes(),old)
 def test_coordinator_restores_route_on_release_failure(self):
  with tempfile.TemporaryDirectory() as d:
   d=Path(d);config=d/'site';candidate=d/'candidate';backup=d/'backup'
   old=b'liangz77.cn {\n    respond "main"\n}\n';config.write_bytes(old)
   subprocess.run(['python3',str(S/'caddy-vias.py'),str(config),str(candidate)],check=True)
   r=subprocess.run(['python3',str(S/'deploy-site.py'),'20260101T000000Z','missing-manifest','missing-checker','missing-archive',str(d),'http://127.0.0.1:1/vias/','--config',str(config),'--candidate',str(candidate),'--backup',str(backup),'--expected-old-hash',hashlib.sha256(old).hexdigest(),'--validate','true','--reload','true'],capture_output=True,text=True)
   self.assertNotEqual(r.returncode,0);self.assertEqual(config.read_bytes(),old)
   self.assertEqual(backup.read_bytes(),old)
if __name__=='__main__':unittest.main()
