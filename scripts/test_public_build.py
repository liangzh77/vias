#!/usr/bin/env python3
import os, shutil, subprocess, tempfile, unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
BUILD=Path(os.environ.get('PUBLIC_TEST_BUILD',ROOT/'client/dist/build/h5'))
class CheckerTests(unittest.TestCase):
 def test_positive_and_negative(self):
  for bad in [None,'unknown.txt','assets/app.js.map','assets/unknown.js','static/demo/unknown.png','assets/unknown.woff2','._index.html','__MACOSX/bad','static/demo/banner.png','symlink','private.js','root.js','emptydir','static/research/unknown.jpg']:
   with self.subTest(bad=bad), tempfile.TemporaryDirectory() as d:
    dest=Path(d)/'h5';shutil.copytree(BUILD,dest)
    shutil.copyfile(BUILD.parent/'.vias-h5-inventory.json',Path(d)/'.vias-h5-inventory.json')
    if bad=='symlink': (dest/'assets/link.js').symlink_to('../index.html')
    elif bad=='emptydir': (dest/'emptydir').mkdir()
    elif bad:
     name={'private.js':'assets/private.js','root.js':'assets/root.js'}.get(bad,bad)
     f=dest/name;f.parent.mkdir(parents=True,exist_ok=True)
     f.write_text('"/Users/private/data/imports"' if bad=='private.js' else '"/static/demo/banner.png"' if bad=='root.js' else 'bad')
    r=subprocess.run(['node',str(ROOT/'scripts/check-public-build.mjs'),str(dest),'--public'],env=dict(os.environ,VIAS_RESEARCH='0'),capture_output=True,text=True)
    self.assertEqual(r.returncode==0,bad is None,r.stderr)
    if bad:
     r=subprocess.run(['python3',str(ROOT/'scripts/release.py'),'pack',str(dest),str(Path(d)/'manifest.json'),'--archive',str(Path(d)/'release.tgz')],capture_output=True,text=True)
     self.assertNotEqual(r.returncode,0);self.assertFalse((Path(d)/'release.tgz').exists())
if __name__=='__main__':unittest.main()
