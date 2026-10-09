#!/usr/bin/env python3
"""Run the complete Linux release shell in temporary roots with loopback HTTP.
No Caddy, production paths, external HTTP, or persistent server processes.
"""
import functools
import hashlib
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import io
import json
import os
from pathlib import Path
import stat
import subprocess
import tarfile
import tempfile
import threading
import unittest

SCRIPTS = Path(__file__).resolve().parent
IDS = ['20260101T000000Z', '20260102T000000Z', '20260103T000000Z']


class ReleaseIntegration(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='vias-release-integration-')
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.root = self.base / 'site'
        (self.root / 'releases').mkdir(parents=True)
        self.fail_http = False
        owner = self

        class Handler(SimpleHTTPRequestHandler):
            def do_GET(self):
                if owner.fail_http:
                    self.send_error(503, 'Deliberate health failure')
                else:
                    super().do_GET()

            def log_message(self, *args):
                pass

        self.server = ThreadingHTTPServer(('127.0.0.1', 0),
            functools.partial(Handler, directory=str(self.root / 'current')))
        self.server.daemon_threads = True
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.close_server)
        self.url = f'http://127.0.0.1:{self.server.server_port}/'
        print(f'LOOPBACK_HTTP {self.url}', flush=True)

    def close_server(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=5)
        assert not self.thread.is_alive(), 'HTTP listener failed to terminate'

    def package(self, ident, extra=None):
        files = {'index.html': f'<h1>{ident}</h1>'.encode(),
                 'assets/app.js': f'const version="{ident}";'.encode(),
                 'assets/fonts/demo.woff2': b'synthetic-test-font'}
        manifest = self.base / f'{ident}.json'
        manifest.write_text(json.dumps({n: hashlib.sha256(b).hexdigest()
                                       for n, b in files.items()}))
        archive = self.base / f'{ident}.tgz'
        with tarfile.open(archive, 'w:gz', format=tarfile.USTAR_FORMAT) as tar:
            for name, data in files.items():
                entry = tarfile.TarInfo(name)
                entry.size = len(data)
                entry.mode = 0o600  # Shell must normalize permissions.
                tar.addfile(entry, io.BytesIO(data))
            if extra is not None:
                tar.addfile(extra, io.BytesIO(b'x') if extra.isreg() else None)
        return manifest, archive

    def run_release(self, ident, manifest, archive, *, ok=True, mode='deploy'):
        command = ['bash', str(SCRIPTS / 'release-remote.sh'), mode, ident,
                   str(manifest), str(SCRIPTS / 'release.py'), str(archive),
                   str(self.root), self.url]
        result = subprocess.run(command, text=True, capture_output=True, timeout=40)
        print(f'COMMAND mode={mode} id={ident} rc={result.returncode}\n'
              f'{result.stdout}{result.stderr}', flush=True)
        if ok:
            self.assertEqual(result.returncode, 0)
            self.assertIn('PUBLISH_OK', result.stdout)
        else:
            self.assertNotEqual(result.returncode, 0)
        self.assertFalse(list(self.root.glob('.link.*')))
        self.assertFalse(list((self.root / 'releases').glob('.staging-*')))
        return result

    def verify_release(self, ident, manifest):
        release = self.root / 'releases' / ident
        expected = json.loads(manifest.read_text())
        subprocess.run(['python3', str(SCRIPTS / 'release.py'), 'verify-tree',
                        str(release), str(manifest)], check=True)
        self.assertEqual(stat.S_IMODE(release.stat().st_mode), 0o755)
        for path in release.rglob('*'):
            self.assertFalse(path.is_symlink())
            self.assertEqual(stat.S_IMODE(path.stat().st_mode),
                             0o755 if path.is_dir() else 0o644)
            if path.is_file():
                self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(),
                                 expected[path.relative_to(release).as_posix()])
        self.assertEqual(sorted(p.name for p in self.root.iterdir()),
                         ['.publish.lock', 'current', 'releases'])
        self.assertEqual((self.root / 'current').readlink().as_posix(), f'releases/{ident}')

    def test_first_upgrade_and_switch(self):
        first = self.package(IDS[0])
        self.run_release(IDS[0], *first)
        self.verify_release(IDS[0], first[0])
        second = self.package(IDS[1])
        self.run_release(IDS[1], *second)
        self.verify_release(IDS[1], second[0])
        self.run_release(IDS[0], first[0], '-', mode='switch')
        self.verify_release(IDS[0], first[0])

    def test_first_http_failure_restores_absence(self):
        package = self.package(IDS[0])
        self.fail_http = True
        result = self.run_release(IDS[0], *package, ok=False)
        self.assertIn('HTTP Error 503', result.stderr)
        current = self.root / 'current'
        self.assertFalse(current.exists() or current.is_symlink())
        self.assertEqual(sorted(p.name for p in self.root.iterdir()),
                         ['.publish.lock', 'releases'])
        # Validated failed version is retained; no current means unpublished.
        self.assertTrue((self.root / 'releases' / IDS[0]).is_dir())

    def test_upgrade_http_failure_restores_previous(self):
        first = self.package(IDS[0])
        self.run_release(IDS[0], *first)
        self.fail_http = True
        result = self.run_release(IDS[1], *self.package(IDS[1]), ok=False)
        self.assertIn('HTTP Error 503', result.stderr)
        self.verify_release(IDS[0], first[0])
        self.fail_http = False
        subprocess.run(['python3', str(SCRIPTS / 'release.py'), 'verify-http',
                        self.url, str(first[0])], check=True)

    def test_polluted_archive_rejected_before_switch(self):
        for kind in ('unknown', 'symlink', 'hardlink'):
            with self.subTest(kind=kind):
                entry = tarfile.TarInfo('assets/pollution')
                if kind == 'unknown':
                    entry.size = 1
                else:
                    entry.type = tarfile.SYMTYPE if kind == 'symlink' else tarfile.LNKTYPE
                    entry.linkname = 'index.html'
                self.run_release(IDS[0], *self.package(IDS[0], entry), ok=False)
                self.assertFalse((self.root / 'current').is_symlink())
                self.assertEqual(list((self.root / 'releases').iterdir()), [])

    def test_polluted_existing_tree_rejected_before_switch(self):
        first = self.package(IDS[0])
        self.run_release(IDS[0], *first)
        second = self.package(IDS[1])
        self.run_release(IDS[1], *second)
        self.run_release(IDS[0], first[0], '-', mode='switch')
        target = self.root / 'releases' / IDS[1]
        for kind in ('unknown', 'empty-directory', 'symlink'):
            pollution = target / 'pollution'
            with self.subTest(kind=kind):
                if kind == 'unknown':
                    pollution.write_text('unapproved')
                elif kind == 'empty-directory':
                    pollution.mkdir()
                else:
                    pollution.symlink_to('index.html')
                try:
                    self.run_release(IDS[1], second[0], '-', mode='switch', ok=False)
                    self.verify_release(IDS[0], first[0])
                finally:
                    if pollution.is_dir() and not pollution.is_symlink():
                        pollution.rmdir()
                    else:
                        pollution.unlink()


if __name__ == '__main__':
    unittest.main(verbosity=2)
