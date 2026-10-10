// Deep verification of a generated catalogue: every shard key maps to exactly one route in
// the index, every point count and start coordinate matches the packed geometry, every
// coordinate is inside the Beijing bounding box, and the statistics can be reproduced from
// the geometry. Sampling a few routes is not enough — a single swapped shard key would show
// someone else's trail on an otherwise healthy-looking list.
//
//   node scripts/verify-catalog.mjs [dir]        # default: data/catalog, else client/catalog-sample
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const explicit = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '';
const dir = explicit ? path.resolve(root, explicit)
  : fs.existsSync(path.join(root, 'data/catalog/osm-index.json')) ? path.join(root, 'data/catalog')
  : path.join(root, 'client/catalog-sample');
const label = path.relative(root, dir);

const catalog = JSON.parse(fs.readFileSync(path.join(dir, 'osm-index.json'), 'utf8'));
const problems = [];
const fail = message => problems.push(message);

// Same formula as client/src/core/track.ts, so a mismatch means the shipped statistics and
// the shipped geometry disagree.
const R = 6371008.8;
const distance = (a, b) => {
  const r = Math.PI / 180;
  const h = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lon - a.lon) * r / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
};

if (!Array.isArray(catalog.routes) || !catalog.routes.length) fail('索引没有路线');
if (!catalog.source || !catalog.scope) fail('索引缺少来源或范围说明');
if (typeof catalog.elevation !== 'boolean') fail('索引缺少海拔说明');
if (!Array.isArray(catalog.shards) || catalog.shards.some(c => !Number.isInteger(c) || c < 0)) fail('分片表不合法');
if (typeof catalog.full !== 'boolean') fail('索引缺少 full 标记');

const ids = new Map();
catalog.routes.forEach((entry, position) => {
  if (ids.has(entry.id)) fail(`重复 ID：${entry.id}`);
  ids.set(entry.id, position);
  if (!/^osm-w?\d+$/.test(entry.id)) fail(`ID 不符合规则：${entry.id}`);
  if (entry.points < 2) fail(`${entry.id} 点数少于 2`);
  if (!(entry.distance >= 0) || !(entry.ascent >= 0) || !(entry.descent >= 0)) fail(`${entry.id} 统计值为负`);
  if (entry.featured != null && typeof entry.featured !== 'boolean') fail(`${entry.id} featured 不是布尔`);
});
if (catalog.shards.reduce((n, c) => n + c, 0) !== catalog.routes.length) fail('分片计数之和 != 路线数');

// starts[shard] = first index of that shard, mirroring core/shard-codec.ts.
const starts = [];
let total = 0;
for (const count of catalog.shards) { starts.push(total); total += count; }
const shardOf = position => {
  let low = 0, high = starts.length - 1;
  while (low < high) { const mid = (low + high + 1) >> 1; if (starts[mid] <= position) low = mid; else high = mid - 1; }
  return low;
};

const shardFiles = fs.readdirSync(path.join(dir, 'shards')).filter(f => f.endsWith('.json')).sort();
if (shardFiles.length !== catalog.shards.length) fail(`分片文件数 ${shardFiles.length} != 分片表 ${catalog.shards.length}`);
const seen = new Map();
let checkedPoints = 0;
shardFiles.forEach((file, shard) => {
  const expected = new Set(catalog.routes.slice(starts[shard] ?? 0, (starts[shard] ?? 0) + (catalog.shards[shard] ?? 0)).map(r => r.id.slice(4)));
  const data = JSON.parse(fs.readFileSync(path.join(dir, 'shards', file), 'utf8'));
  const keys = Object.keys(data);
  if (keys.length !== expected.size) fail(`${file} 条目数 ${keys.length} != ${expected.size}`);
  for (const key of keys) {
    if (!expected.has(key)) fail(`${file} 含不属于本分片的 ${key}`);
    if (seen.has(key)) fail(`${key} 出现在多个分片`);
    seen.set(key, shard);
    const entry = catalog.routes[ids.get(`osm-${key}`)];
    const segments = data[key];
    if (!Array.isArray(segments) || !segments.length) { fail(`${entry.id} 几何为空`); return; }
    let points = 0;
    let meters = 0;
    for (const [si, segment] of segments.entries()) {
      if (!Array.isArray(segment) || !segment.length) { fail(`${entry.id} 第 ${si + 1} 段为空`); return; }
      let previous = null;
      for (const raw of segment) {
        if (!Array.isArray(raw) || raw.length < 2 || raw.length > 3) { fail(`${entry.id} 存在畸形点`); return; }
        const [lat, lon, ele] = raw;
        if (typeof lat !== 'number' || typeof lon !== 'number') { fail(`${entry.id} 坐标不是数字`); return; }
        if (!(lat >= 39 && lat <= 42) || !(lon >= 115 && lon <= 118)) { fail(`${entry.id} 坐标越出北京范围：${lat},${lon}`); return; }
        if (raw.length === 3 && !Number.isFinite(ele)) { fail(`${entry.id} 海拔不是数字`); return; }
        if (catalog.elevation && raw.length !== 3) { fail(`${entry.id} 缺少海拔`); return; }
        if (previous) meters += distance(previous, {lat, lon});
        previous = {lat, lon};
        points += 1;
      }
    }
    checkedPoints += points;
    if (points !== entry.points) fail(`${entry.id} 点数 ${points} != 索引里的 ${entry.points}`);
    const first = segments[0][0];
    if (Math.abs(first[0] - entry.start[0]) > 1e-6 || Math.abs(first[1] - entry.start[1]) > 1e-6) fail(`${entry.id} 起点与索引不符`);
    const km = meters / 1000;
    if (Math.abs(km - entry.distance) > Math.max(0.05, entry.distance * 0.02)) fail(`${entry.id} 里程 ${entry.distance} 与几何重算 ${km.toFixed(3)} 不符`);
    if (catalog.elevation && !(entry.maxEle >= 0)) fail(`${entry.id} maxEle 不合法`);
  }
});

const thumbs = fs.readdirSync(path.join(dir, 'thumbs')).filter(f => f.endsWith('.png'));
if (thumbs.length !== catalog.routes.length) fail(`缩略图 ${thumbs.length} != 路线数 ${catalog.routes.length}`);
const thumbNames = new Set(thumbs.map(f => f.replace(/\.png$/, '')));
for (const entry of catalog.routes) {
  const key = entry.id.slice(4);
  if (!thumbNames.has(key)) { fail(`缺少缩略图 ${key}.png`); break; }
}

const report = {
  dir: label,
  full: catalog.full === true,
  routes: catalog.routes.length,
  shards: catalog.shards.length,
  points: checkedPoints,
  thumbnails: thumbs.length,
  indexSha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, 'osm-index.json'))).digest('hex'),
  problems,
};
const out = path.join(root, 'artifacts/catalog-verify.json');
fs.mkdirSync(path.dirname(out), {recursive: true});
fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
console.log(`CATALOG_VERIFY ${problems.length ? 'FAIL' : 'OK'} dir=${label} full=${report.full} routes=${report.routes} shards=${report.shards} points=${report.points} thumbs=${report.thumbnails}`);
for (const problem of problems.slice(0, 20)) console.log(`  ✗ ${problem}`);
if (problems.length > 20) console.log(`  …还有 ${problems.length - 20} 条`);
process.exit(problems.length ? 1 : 0);
