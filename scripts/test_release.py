#!/usr/bin/env python3
import io
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile
import unittest
import release


class ReleaseSafetyTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.build = self.root / 'h5'
        self.build.mkdir()
        (self.build / 'index.html').write_bytes(b'hello')
        self.expected = {'index.html': release.digest(b'hello')}
        (self.root / '.vias-h5-inventory.json').write_text(json.dumps(self.expected))

    def archive(self, entries, fmt=tarfile.USTAR_FORMAT):
        path = self.root / 'test.tgz'
        with tarfile.open(path, 'w:gz', format=fmt) as tar:
            for name, data, kind in entries:
                entry = tarfile.TarInfo(name)
                entry.type = kind
                if kind == tarfile.REGTYPE:
                    entry.size = len(data)
                    tar.addfile(entry, io.BytesIO(data))
                else:
                    entry.linkname = 'index.html'
                    tar.addfile(entry)
        return path

    def test_valid_archive_and_tree(self):
        release.verify_tree(self.build, self.expected)
        release.verify_archive(self.archive([('index.html', b'hello', tarfile.REGTYPE)]), self.expected)

    def test_metadata_paths_rejected_in_tree_and_archive(self):
        for name in ['._index.html', 'assets/._app.js', '__MACOSX/._index.html', '.DS_Store']:
            with self.subTest(name=name):
                file = self.build / name
                file.parent.mkdir(parents=True, exist_ok=True)
                file.write_bytes(b'bad')
                with self.assertRaises(ValueError):
                    release.verify_tree(self.build, self.expected)
                file.unlink()
                with self.assertRaises(ValueError):
                    release.verify_archive(self.archive([
                        ('index.html', b'hello', tarfile.REGTYPE), (name, b'bad', tarfile.REGTYPE)
                    ]), self.expected)

    def test_archive_traversal_links_duplicates_extra_and_hashes(self):
        cases = [
            [('../index.html', b'hello', tarfile.REGTYPE)],
            [('/index.html', b'hello', tarfile.REGTYPE)],
            [('index.html', b'', tarfile.SYMTYPE)],
            [('index.html', b'', tarfile.LNKTYPE)],
            [('index.html', b'', tarfile.FIFOTYPE)],
            [('index.html', b'hello', tarfile.REGTYPE)] * 2,
            [('index.html', b'changed', tarfile.REGTYPE)],
            [('unexpected.js', b'x', tarfile.REGTYPE)],
            [('._metadata', b'', tarfile.DIRTYPE)],
            [],
        ]
        for entries in cases:
            with self.subTest(entries=entries), self.assertRaises(ValueError):
                release.verify_archive(self.archive(entries), self.expected)

    def test_appledouble_payload_even_with_allowed_name(self):
        data = b'\x00\x05\x16\x07' + b'\0' * 30
        (self.build / 'index.html').write_bytes(data)
        with self.assertRaises(ValueError):
            release.verify_tree(self.build, self.expected)
        with self.assertRaises(ValueError):
            release.verify_archive(self.archive([('index.html', data, tarfile.REGTYPE)]), self.expected)

    def test_tree_symlink_and_extra_directory_rejected(self):
        (self.build / 'link').symlink_to('index.html')
        with self.assertRaises(ValueError):
            release.verify_tree(self.build, self.expected)
        (self.build / 'link').unlink()
        (self.build / 'unused').mkdir()
        with self.assertRaises(ValueError):
            release.verify_tree(self.build, self.expected)

    def fake_repo(self):
        """A complete public build taken from the committed sample catalogue, plus a copy of the
        packaging tools so the checker's repo-relative catalogue reference is this tree. The
        sample is what a fresh clone has, which keeps the test fast and independent of the
        local extraction."""
        repo = Path(__file__).resolve().parents[1]
        tools = self.root / 'repo/scripts'
        tools.mkdir(parents=True)
        for name in ('release.py', 'check-public-build.mjs', 'public-assets.json'):
            shutil.copyfile(repo / 'scripts' / name, tools / name)
        sample = repo / 'client/catalog-sample'
        install = self.root / 'repo/client/src/static/osm'
        (install / 'routes').mkdir(parents=True)
        shutil.copyfile(sample / 'osm-index.json', install / 'index.json')
        shutil.copyfile(sample / 'manifest.json', install / 'manifest.json')
        for folder, dest in (('shards', install / 'routes'), ('thumbs', install)):
            for file in sorted((sample / folder).iterdir()):
                shutil.copyfile(file, dest / file.name)
        build = self.root / 'repo/client/dist/build/h5'
        shutil.copytree(install, build / 'static/osm')
        approved = json.loads((repo / 'scripts/public-assets.json').read_text())
        for name in approved:
            target = build / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(repo / 'client/src' / name, target)
        (build / 'assets').mkdir(parents=True)
        (build / 'index.html').write_bytes(b'hello')
        script = b'console.log(1);'
        (build / 'assets/app.js').write_bytes(script)
        self.expected = {'index.html': release.digest(b'hello'), 'assets/app.js': release.digest(script)}
        (build.parent / '.vias-h5-inventory.json').write_text(json.dumps(self.expected))
        os.environ['VIAS_BUILD_INVENTORY'] = str(build.parent / '.vias-h5-inventory.json')
        self.addCleanup(os.environ.pop, 'VIAS_BUILD_INVENTORY', None)
        spec = importlib.util.spec_from_file_location('fake_release', tools / 'release.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return build, module

    def test_pack_ustar_ignores_xattrs_and_matches_manifest(self):
        build, tools = self.fake_repo()
        if hasattr(os, 'setxattr'):
            try:
                os.setxattr(build / 'index.html', 'com.apple.FinderInfo' if os.uname().sysname == 'Darwin'
                            else 'user.test', b'\0' * 32)
            except OSError:
                pass
        archive, manifest = self.root / 'clean.tgz', self.root / 'manifest.json'
        tools.pack(build, archive, manifest)
        expected = release.manifest(manifest)
        release.verify_archive(archive, expected)
        with tarfile.open(archive) as tar:
            self.assertEqual(set(tar.getnames()), set(expected))
            self.assertTrue(all(m.isreg() and not m.pax_headers for m in tar))
        # An undeclared catalogue file must never be packaged.
        (build / 'static/osm/w99999999.png').write_bytes(b'smuggled')
        with self.assertRaises(ValueError):
            tools.pack(build, self.root / 'extra.tgz', self.root / 'extra.json')
        self.assertFalse((self.root / 'extra.tgz').exists())
        (build / 'static/osm/w99999999.png').unlink()
        # The manifest itself must stay consistent with the files it declares.
        original = (build / 'static/osm/manifest.json').read_text()
        (build / 'static/osm/manifest.json').write_text(original.replace('ODbL 1.0', 'proprietary'))
        with self.assertRaises(ValueError):
            tools.pack(build, self.root / 'bad-licence.tgz', self.root / 'bad-licence.json')
        (build / 'static/osm/manifest.json').write_text(original)
        (build / '._index.html').write_bytes(b'bad')
        with self.assertRaises(ValueError):
            tools.pack(build, self.root / 'bad.tgz', self.root / 'bad.json')
        self.assertFalse((self.root / 'bad.tgz').exists())

    def test_derived_catalogue_needs_a_manifest_and_exact_hashes(self):
        # Derived data cannot be hand-listed in public-assets.json, so the shipped manifest is
        # the gate: undeclared, altered or missing catalogue files must all be refused.
        (self.build / 'static/osm/routes').mkdir(parents=True)
        (self.build / 'static/osm/index.json').write_bytes(b'{}')
        (self.build / 'static/osm/w1.png').write_bytes(b'cover')
        (self.build / 'static/osm/routes/shard-000.json').write_bytes(b'{"1":[]}')
        declaration = None
        with self.assertRaises(ValueError):
            release.check_catalogue_file('static/osm/w1.png', release.digest(b'cover'), declaration)
        with self.assertRaises(ValueError):
            release.catalogue_declaration(self.build)
        manifest = {
            'license': {'name': 'ODbL 1.0', 'url': 'https://opendatacommons.org/licenses/odbl/1-0/',
                        'attributionZh': '© OpenStreetMap 贡献者'},
            'index': {'path': 'static/osm/index.json', 'sha256': release.digest(b'{}')},
            'shards': [{'path': 'static/osm/routes/shard-000.json', 'routes': 1,
                        'sha256': release.digest(b'{"1":[]}')}],
            'thumbnails': [{'path': 'static/osm/w1.png', 'sha256': release.digest(b'cover')}],
            'counts': {'routes': 1, 'relations': 1, 'namedPaths': 0, 'shards': 1, 'thumbnails': 1},
        }
        (self.build / 'static/osm/manifest.json').write_text(json.dumps(manifest))
        declaration = release.catalogue_declaration(self.build)
        release.check_catalogue_file('static/osm/w1.png', release.digest(b'cover'), declaration)
        release.check_catalogue_file('static/osm/manifest.json', release.digest(b'x'), declaration)
        with self.assertRaises(ValueError):
            release.check_catalogue_file('static/osm/w1.png', release.digest(b'other'), declaration)
        with self.assertRaises(ValueError):
            release.check_catalogue_file('static/osm/w2.png', release.digest(b'cover'), declaration)
        with self.assertRaises(ValueError):
            release.check_catalogue_file('static/osm/index.json', release.digest(b'{}'), None)
        # A manifest without the licence terms, or with counts that do not add up, is refused.
        for broken in ({**manifest, 'license': {'name': 'ODbL 1.0', 'url': 'x', 'attributionZh': 'y'}},
                       {**manifest, 'counts': {**manifest['counts'], 'routes': 5}},
                       {**manifest, 'thumbnails': manifest['thumbnails'] * 2}):
            with self.subTest(broken=sorted(broken)):
                (self.build / 'static/osm/manifest.json').write_text(json.dumps(broken))
                with self.assertRaises(ValueError):
                    release.catalogue_declaration(self.build)

    def test_build_checker_rejects_metadata(self):
        repo = Path(__file__).resolve().parents[1]
        (self.build / '._index.html').write_bytes(b'bad')
        result = subprocess.run(['node', str(repo / 'scripts/check-public-build.mjs'), str(self.build)],
                                capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Metadata/symlink prohibited', result.stderr)
        self.assertTrue(self.build.exists())  # Keep evidence; packaging is blocked.


if __name__ == '__main__':
    unittest.main()
