#!/usr/bin/env python3
"""Produce a narrowly scoped Vias route candidate; apply with config-transaction.py."""
import argparse
from pathlib import Path
p=argparse.ArgumentParser()
p.add_argument('source'); p.add_argument('output'); a=p.parse_args()
s=Path(a.source).read_bytes().decode('utf-8')
if '/vias' in s: raise SystemExit('Vias route already present: manual review required')
# Preserve every existing byte, including mixed CRLF/LF. Patch only the
# shared main-site snippet when present, otherwise a simple single host.
lines=s.splitlines(keepends=True)
openers=[i for i,l in enumerate(lines) if l.strip() == '(main_site_routes) {']
if not openers:
 openers=[i for i,l in enumerate(lines) if l.strip() in ('liangz77.cn {','liangz77.cn, www.liangz77.cn {')]
if len(openers)!=1: raise SystemExit('Unexpected site header; do not guess')
route='''    # Vias public synthetic demo; no SPA fallback or tile proxy.
    redir /vias /vias/ 301
    handle_path /vias/* {
        root * /srv/sites/liangz77.cn/vias/current
        file_server
    }
'''
lines.insert(openers[0]+1,route)
with open(a.output,'xb') as f: f.write(''.join(lines).encode('utf-8'))
