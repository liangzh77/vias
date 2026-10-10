// Build the public OpenStreetMap route catalog from the local (git-ignored) Beijing
// extraction, plus generated track thumbnails.
//
//   node scripts/build-osm-catalog.mjs --all --elevation
//
// Flags: --all          include every named path in the extract (14,407 ways), not just
//                       the 23 route relations
//        --elevation    sample height along each route and interpolate  (required choice)
//        --no-elevation skip height entirely
//        --limit=N      stop after N routes (dry runs)
//
// Input : data/open-datasets/beijing/osm/{index.json,paths/*.gpx,routes/*.gpx}  (ODbL, local only)
// Output: data/catalog/                              (git-ignored: metadata + thumbnails + shards)
//           osm-index.json        metadata only, no geometry
//           thumbs/<key>.png      generated art
//           shards/shard-NNN.json geometry, fetched on demand
//         data/catalog/sample/                          (git-ignored: the subset that is committed)
// The committed subset lives in client/catalog-sample/ and is written by
// `node scripts/prepare-catalog.mjs --export-sample`; nothing under client/ is generated here.
//
// Geometry is NOT bundled into the app. The index (title, activity, place, distance,
// start point, point count) ships with the app so lists, search and sorting work
// instantly; the coordinates of a route are fetched from its shard only when the user
// opens it. Shards hold consecutive runs of catalogue entries with a bounded point
// count, so opening any single route costs roughly the same small download.
//
// Elevation is *not* in the extraction. With --elevation each route is sampled against the
// Mapzen/AWS "terrarium" terrain tiles (public-domain DEMs, ~30 m, no key, no rate limit),
// then interpolated along the route. Tiles and sampled heights are cached in artifacts/
// (git-ignored), so a re-run needs no network at all.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const osmDir = path.join(root, 'data/open-datasets/beijing/osm');
const cachePath = path.join(root, 'artifacts/terrain-elevation-cache.json');
// Elevation must be chosen explicitly: a silent default previously dropped every <ele>
// value and the ascent/descent statistics while still producing a plausible catalogue.
if (!process.argv.includes('--elevation') && !process.argv.includes('--no-elevation')) {
  console.error('Refusing to run: pass --elevation (SRTM sampling, cached) or --no-elevation explicitly.');
  process.exit(2);
}
const wantElevation = process.argv.includes('--elevation');
// --all is opted into explicitly: shipping 14,430 routes changes the shipped payload size
// by two orders of magnitude, so it must never happen by accident.
const wantAll = process.argv.includes('--all');
const limitArg = process.argv.find(a => a.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.slice('--limit='.length)) : 0;
const proxy = process.env.VIAS_HTTP_PROXY || '';

// Pinned to the top of the catalog and featured on the home page: all 7 foot/hiking
// relations plus 3 named greenways.
const SELECTION = [
  {id: 16205150, activity: '登山', place: '北京市 · 西山三峰'},
  {id: 18359613, activity: '登山', place: '北京市 · 玉皇山'},
  {id: 17213433, activity: '徒步', place: '北京市 · 八达岭长城'},
  {id: 17501897, activity: '徒步', place: '北京市 · 八达岭水关长城'},
  {id: 19799028, activity: '徒步', place: '北京市 · 二环'},
  {id: 17507479, activity: '徒步', place: '北京市 · 潞城中路'},
  {id: 14127934, activity: '骑行', place: '北京市 · 温榆河'},
  {id: 17507480, activity: '骑行', place: '北京市 · 北运河'},
  {id: 14107691, activity: '骑行', place: '北京市 · 昌平42km'},
  {id: 12098807, activity: '骑行', place: '北京市 · 海淀三山五园'},
];
// Four well-known Beijing outings, flagged as featured so the home screen can show real
// routes (with thumbnails drawn from their real geometry) instead of stand-in artwork.
// This is a pure overlay on the length-ordered way list: the 14,430 entries keep their exact
// positions and bytes, so pinning a route can never reshuffle the published shards.
const FEATURED_WAYS = [
  {id: 92160463, activity: '登山', place: '北京市 · 怀柔 · 箭扣长城'},
  {id: 659656629, activity: '登山', place: '北京市 · 门头沟 · 东灵山'},
  {id: 162162027, activity: '登山', place: '北京市 · 门头沟 · 妙峰山'},
  {id: 55280954, activity: '徒步', place: '北京市 · 门头沟 · 京西古道'},
];

const R = 6371008.8;
const rad = Math.PI / 180;
function haversine(a, b) {
  const h = Math.sin((b.lat - a.lat) * rad / 2) ** 2
    + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((b.lon - a.lon) * rad / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

function parseGpx(file) {
  const xml = fs.readFileSync(file, 'utf8');
  const segments = [];
  for (const seg of xml.matchAll(/<trkseg>([\s\S]*?)<\/trkseg>/g)) {
    const points = [];
    for (const m of seg[1].matchAll(/<trkpt\s+lat="([-\d.]+)"\s+lon="([-\d.]+)"\s*\/?>(?:<ele>([-\d.]+)<\/ele>)?/g)) {
      points.push({lat: Number(m[1]), lon: Number(m[2]), ...(m[3] ? {ele: Number(m[3])} : {})});
    }
    if (points.length) segments.push(points);
  }
  if (!segments.length) throw new Error('no track points in ' + file);
  return segments;
}

function metrics(segments) {
  let meters = 0, ascent = 0, descent = 0;
  for (const points of segments) {
    for (let i = 1; i < points.length; i++) {
      meters += haversine(points[i - 1], points[i]);
      if (points[i - 1].ele != null && points[i].ele != null) {
        const d = points[i].ele - points[i - 1].ele;
        ascent += Math.max(0, d);
        descent += Math.max(0, -d);
      }
    }
  }
  return {distance: meters / 1000, ascent: Math.round(ascent), descent: Math.round(descent)};
}

/* ---------- elevation from public-domain terrain tiles ---------- */
// Verified against OpenTopoData SRTM 90 m on a 28 km Beijing mountain route: median
// difference 4 m, maximum 14 m over 90 samples.
const TILE_Z = 12;
const tileDir = path.join(root, 'artifacts/terrain-tiles');
const tileCache = new Map();
function tileX(lon) { return Math.floor((lon + 180) / 360 * 2 ** TILE_Z); }
function tileY(lat) { const l = lat * rad; return Math.floor((1 - Math.log(Math.tan(l) + 1 / Math.cos(l)) / Math.PI) / 2 * 2 ** TILE_Z); }
function decodePng(buffer) {
  let offset = 8, width = 0, height = 0, depth = 0, colorType = 0;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); depth = data[8]; colorType = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    offset += 12 + length;
  }
  if (depth !== 8 || colorType !== 2) throw new Error(`unexpected terrain tile (depth ${depth}, colour type ${colorType})`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * 3, pixels = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= 3 ? pixels[y * stride + x - 3] : 0;
      const b = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const c = x >= 3 && y > 0 ? pixels[(y - 1) * stride + x - 3] : 0;
      let value = line[x];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      pixels[y * stride + x] = value & 255;
    }
  }
  return {width, height, pixels, stride};
}
async function terrainTile(x, y) {
  const key = `${TILE_Z}_${x}_${y}`;
  const cached = tileCache.get(key);
  if (cached) return cached;
  const file = path.join(tileDir, key + '.png');
  let buffer;
  if (fs.existsSync(file)) buffer = fs.readFileSync(file);
  else {
    const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${TILE_Z}/${x}/${y}.png`;
    let body;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error('HTTP ' + response.status);
      body = Buffer.from(await response.arrayBuffer());
    } catch (error) {
      if (!proxy) throw error;
      body = execFileSync('curl', ['-fsS', '--max-time', '30', '-x', proxy, url], {maxBuffer: 16 * 1024 * 1024});
    }
    fs.mkdirSync(tileDir, {recursive: true});
    fs.writeFileSync(file, body);
    buffer = body;
    await new Promise(resolve => setTimeout(resolve, 60));
  }
  const tile = decodePng(buffer);
  tileCache.set(key, tile);
  return tile;
}
async function elevationAt(lat, lon) {
  const x = tileX(lon), y = tileY(lat), tile = await terrainTile(x, y);
  const n = 2 ** TILE_Z, latRad = lat * rad;
  const fx = (lon + 180) / 360 * n - x;
  const fy = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n - y;
  const px = Math.min(tile.width - 1, Math.max(0, Math.round(fx * tile.width)));
  const py = Math.min(tile.height - 1, Math.max(0, Math.round(fy * tile.height)));
  const i = py * tile.stride + px * 3;
  return tile.pixels[i] * 256 + tile.pixels[i + 1] + tile.pixels[i + 2] / 256 - 32768;
}

// Sample up to `max` points evenly along the flattened route, keeping cumulative distance.
function samplePoints(flat, max) {
  const distances = [0];
  for (let i = 1; i < flat.length; i++) distances.push(distances[i - 1] + haversine(flat[i - 1], flat[i]));
  const total = distances[distances.length - 1];
  const count = Math.min(max, flat.length);
  const picked = [];
  for (let k = 0; k < count; k++) {
    const want = total * k / (count - 1 || 1);
    let i = picked.length ? picked[picked.length - 1].index : 0;
    while (i < flat.length - 1 && distances[i] < want) i++;
    picked.push({index: i, distance: distances[i]});
  }
  return {distances, total, picked};
}

async function elevationFor(key, flat, cache, max) {
  const {distances, picked} = samplePoints(flat, max);
  // Cache key = route + sample count + a hash of the sampled coordinates: the same route
  // re-extracted with slightly different geometry must not inherit the old heights.
  const stamp = `${max}:${picked.map(p => `${p.index}:${flat[p.index].lat.toFixed(5)},${flat[p.index].lon.toFixed(5)}`).join('|')}`;
  const entry = cache[key];
  if (!entry || entry.stamp !== stamp || !Array.isArray(entry.heights)) {
    const heights = [];
    for (const point of picked) heights.push(await elevationAt(flat[point.index].lat, flat[point.index].lon));
    cache[key] = {stamp, heights: heights.map(h => Math.round(h * 10) / 10)};
  }
  const samples = cache[key].heights;
  // Linear interpolation of the sampled profile onto every route point.
  const at = picked.map((p, i) => ({distance: p.distance, ele: samples[i]}));
  let cursor = 0;
  return distances.map(d => {
    while (cursor < at.length - 2 && at[cursor + 1].distance < d) cursor++;
    const a = at[cursor], b = at[Math.min(cursor + 1, at.length - 1)];
    if (b.distance === a.distance) return a.ele;
    const t = (d - a.distance) / (b.distance - a.distance);
    return Math.round((a.ele + (b.ele - a.ele) * Math.max(0, Math.min(1, t))) * 10) / 10;
  });
}

/* ---------- minimal PNG writer (no dependencies) ---------- */
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();
function crc32(buf) {
  let c = -1;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(body));
  return Buffer.concat([head, body, tail]);
}
function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, {level: 6})),  // 14k thumbnails: level 6 is ~2x faster for ~3% larger files
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------- thumbnail art ---------- */
const W = 348, H = 200;
class Canvas {
  constructor(w, h, background) {
    this.w = w; this.h = h;
    this.data = Buffer.alloc(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      this.data[i * 4] = background[0];
      this.data[i * 4 + 1] = background[1];
      this.data[i * 4 + 2] = background[2];
      this.data[i * 4 + 3] = 255;
    }
  }
  blend(x, y, rgb, alpha) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    for (let k = 0; k < 3; k++) this.data[i + k] = Math.round(this.data[i + k] * (1 - alpha) + rgb[k] * alpha);
  }
  disc(cx, cy, radius, rgb, alpha = 1) {
    for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
      for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (d <= radius) this.blend(x, y, rgb, alpha * Math.min(1, radius - d + 0.5));
      }
    }
  }
  line(a, b, width, rgb, alpha = 1) {
    // Clamped: a degenerate bounding box would otherwise project to huge coordinates and
    // make this loop effectively infinite.
    const steps = Math.min(4096, Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]))));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.disc(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, width / 2, rgb, alpha);
    }
  }
  png() { return encodePng(this.w, this.h, this.data); }
}

function drawRoute(segments) {
  const canvas = new Canvas(W, H, [238, 243, 238]);
  for (let x = 24; x < W; x += 48) canvas.line([x, 0], [x, H], 1, [224, 232, 224], 0.7);
  for (let y = 20; y < H; y += 40) canvas.line([0, y], [W, y], 1, [224, 232, 224], 0.7);
  const points = segments.flat();
  const midLat = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const kx = Math.cos(midLat * rad);
  const xs = points.map(p => p.lon * kx), ys = points.map(p => p.lat);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const pad = 22;
  const scale = Math.min((W - pad * 2) / Math.max(maxX - minX, 1e-9), (H - pad * 2) / Math.max(maxY - minY, 1e-9));
  const offX = (W - (maxX - minX) * scale) / 2, offY = (H - (maxY - minY) * scale) / 2;
  const project = p => [offX + (p.lon * kx - minX) * scale, H - offY - (p.lat - minY) * scale];
  const projected = segments.map(seg => seg.map(project));
  for (const seg of projected) for (let i = 1; i < seg.length; i++) canvas.line(seg[i - 1], seg[i], 3.4, [0, 191, 125], 0.18);
  for (const seg of projected) for (let i = 1; i < seg.length; i++) canvas.line(seg[i - 1], seg[i], 2.4, [0, 186, 121]);
  const all = projected.flat();
  canvas.disc(all[0][0], all[0][1], 5.6, [255, 255, 255]);
  canvas.disc(all[0][0], all[0][1], 3.6, [31, 138, 90]);
  const last = all[all.length - 1];
  canvas.disc(last[0], last[1], 5.6, [255, 255, 255]);
  canvas.disc(last[0], last[1], 3.6, [60, 66, 60]);
  return canvas.png();
}

/* ---------- build ---------- */
const index = JSON.parse(fs.readFileSync(path.join(osmDir, 'index.json'), 'utf8'));
const relationById = new Map(index.filter(e => e.type === 'relation').map(e => [e.id, e]));
const wayById = new Map(index.filter(e => e.type === 'way').map(e => [e.id, e]));
const featuredInfo = new Map([...SELECTION, ...FEATURED_WAYS].map(e => [e.id, e]));
// Fail loudly instead of publishing a catalogue whose home screen lost a pinned route: an id
// that is not in the extract would otherwise be marked featured and then silently missing.
const unfeatured = [...featuredInfo.keys()].filter(id => !relationById.has(id) && !wayById.has(id));
if (unfeatured.length) throw new Error(`featured entries missing from the extract: ${unfeatured.join(', ')}`);
const wayActivity = () => '徒步';
const activityFor = route => route === 'bicycle' ? '骑行' : route === 'hiking' ? '登山' : '徒步';
// Chinese mappers in this extract store annotations such as «（非成熟路线）» straight in the
// OSM name tag (verified against the live OSM API for way/118260787). Nothing is filtered
// out, but those 9,100 paths are sorted last and every card shows its OSM id.
const annotated = name => /^[（(].*[)）]$/.test(name);
const relations = index.filter(e => e.type === 'relation');
const ways = index.filter(e => e.type === 'way');
const byLength = (a, b) => b.length_m - a.length_m;
const ordered = (wantAll ? [
  ...SELECTION.map(e => relationById.get(e.id)),
  ...relations.filter(e => !featuredInfo.has(e.id)).sort(byLength),
  ...ways.filter(e => !annotated(e.tags.name)).sort(byLength),
  ...ways.filter(e => annotated(e.tags.name)).sort(byLength),
] : [...SELECTION.map(e => relationById.get(e.id)), ...FEATURED_WAYS.map(e => wayById.get(e.id))]).slice(0, limit || undefined);
const cache = fs.existsSync(cachePath) ? JSON.parse(fs.readFileSync(cachePath, 'utf8')) : {};
const routes = [];
let sampled = 0;
// One whole-file write per sample would be quadratic (14k routes); flush in batches.
const flushCache = () => { fs.mkdirSync(path.dirname(cachePath), {recursive: true}); fs.writeFileSync(cachePath, JSON.stringify(cache)); };
const thumbDir = path.join(root, 'data/catalog/thumbs');
// Generated catalogue output is a single unit: a shard or thumbnail left over from an
// earlier run (e.g. after a route was dropped) must never survive a rebuild.
const shardDir = path.join(root, 'data/catalog/shards');
fs.mkdirSync(thumbDir, {recursive: true});
fs.rmSync(shardDir, {recursive: true, force: true});
fs.mkdirSync(shardDir, {recursive: true});
let done = 0;
// The subset that is committed to git (14 featured routes): kept aside while the full
// catalogue streams to disk.
const sampleKeys = [];
const sampleShard = {};
const sampleThumbs = new Map();

const TARGET_SHARD_POINTS = 5000;
const shardCounts = [];
let shard = {};
let shardPoints = 0;
const r6 = v => Math.round(v * 1e6) / 1e6;
const r1 = v => Math.round(v * 10) / 10;
// Coordinates are stored as bare triples (rounded to ~0.1 m, elevation to 0.1 m): the same
// numbers as the GPX source, about a third smaller than objects and faster to parse.
const pack = segs => segs.map(seg => seg.map(p => (p.ele == null ? [r6(p.lat), r6(p.lon)] : [r6(p.lat), r6(p.lon), r1(p.ele)])));
const writeShard = () => {
  fs.writeFileSync(path.join(shardDir, `shard-${String(shardCounts.length).padStart(3, '0')}.json`), JSON.stringify(shard));
  shardCounts.push(Object.keys(shard).length);
  shard = {};
  shardPoints = 0;
};

for (const meta of ordered) {
  if (!meta) throw new Error('selected entry not in the Beijing index');
  const isRelation = meta.type === 'relation';
  const key = isRelation ? String(meta.id) : 'w' + meta.id;
  const info = featuredInfo.get(meta.id);
  const segments = parseGpx(path.join(osmDir, meta.path));
  const flat = segments.flat();
  if (wantElevation) {
    const heights = await elevationFor(key, flat, cache, isRelation ? 90 : 24);
    let cursor = 0;
    for (const segment of segments) {
      for (const point of segment) point.ele = heights[cursor++];
    }
    if (++sampled % 200 === 0) flushCache();
  }
  const stats = metrics(segments);
  const name = meta.tags.name;
  const activity = info ? info.activity : isRelation ? activityFor(meta.tags.route) : wayActivity();
  // Values the client can derive or default (author, licence, source URL, cover path,
  // difficulty, duration) are deliberately not stored: the index is bundled with the app,
  // so every byte here is a byte on the critical path.
  const place = info ? info.place : isRelation ? `北京市 · ${name}` : '北京市';
  routes.push({
    id: `osm-${key}`,
    title: name,
    ...(activity !== '徒步' ? {activity} : {}),
    ...(place !== '北京市' ? {place} : {}),
    distance: Math.round(stats.distance * 1000) / 1000,
    ascent: stats.ascent,
    descent: stats.descent,
    maxEle: wantElevation ? Math.round(Math.max(...flat.map(p => p.ele))) : 0,
    points: flat.length,
    start: [r6(segments[0][0].lat), r6(segments[0][0].lon)],
    ...(info ? {featured: true} : {}),
  });
  shard[key] = pack(segments);
  shardPoints += flat.length;
  if (info) { sampleKeys.push(key); sampleShard[key] = shard[key]; sampleThumbs.set(key, drawRoute(segments)); }
  if (shardPoints >= TARGET_SHARD_POINTS) writeShard();
  fs.writeFileSync(path.join(thumbDir, `${key}.png`), info ? sampleThumbs.get(key) : drawRoute(segments));
  if (++done % 1000 === 0) console.log(`  … ${done}/${ordered.length}`);
}
if (Object.keys(shard).length) writeShard();
if (wantElevation) flushCache();

const stamp = (() => {
  try {
    const provenance = JSON.parse(fs.readFileSync(path.join(root, 'data/open-datasets/provenance.json'), 'utf8'));
    const file = provenance.files.find(f => f.source_id === 'beijing/osm' && f.url.includes('beijing-latest.osm.pbf'));
    return file ? String(file.acquired_at).slice(0, 10) : '';
  } catch { return ''; }
})();
const header = {
  // "北京全量" would be wrong: 14,407 of the 14,430 entries are named path fragments, not
  // complete outings. The extract date and scope travel with the data.
  source: 'OpenStreetMap 北京抽取（Geofabrik beijing-latest.osm.pbf，ODbL 1.0，© OpenStreetMap 贡献者）',
  ...(stamp ? {extracted: stamp} : {}),
  scope: '北京市行政区域 · 23 个路线关系 + 命名路径片段',
  elevation: wantElevation,
  ...(wantElevation ? {elevationSource: 'terrarium 地形瓦片（公有领域 DEM，约 30 m 分辨率）采样插值，非实测'} : {}),
  full: wantAll,
  shards: shardCounts,
  routes: routes,
};
const out = path.join(root, 'data/catalog/osm-index.json');
fs.mkdirSync(path.dirname(out), {recursive: true});
fs.writeFileSync(out, JSON.stringify(header, null, 0) + '\n');

// The committed subset: a real, openable catalogue for clones that do not have data/.
const sampleDir = path.join(root, 'data/catalog/sample');
fs.rmSync(sampleDir, {recursive: true, force: true});
fs.mkdirSync(path.join(sampleDir, 'thumbs'), {recursive: true});
fs.mkdirSync(path.join(sampleDir, 'shards'), {recursive: true});
fs.writeFileSync(path.join(sampleDir, 'osm-index.json'), JSON.stringify({
  ...header,
  source: `${header.source} · 示例（已提交到仓库的子集）`,
  scope: `${header.scope} · 仅示例`, 
  full: false,
  shards: [sampleKeys.length],
  routes: routes.filter(r => sampleKeys.includes(r.id.slice('osm-'.length))),
}, null, 0) + '\n');
fs.writeFileSync(path.join(sampleDir, 'shards/shard-000.json'), JSON.stringify(sampleShard));
for (const [key, png] of sampleThumbs) fs.writeFileSync(path.join(sampleDir, `thumbs/${key}.png`), png);
// The old single-file catalogue would otherwise linger half-consumed by the app.
fs.rmSync(path.join(root, 'client/src/core/osm-routes.json'), {force: true});
const points = routes.reduce((n, r) => n + r.points, 0);
console.log(`OSM_CATALOG routes=${routes.length} points=${points} index_bytes=${fs.statSync(out).size} shards=${shardCounts.length} thumbnails=${done} sample_routes=${sampleKeys.length} elevation=${wantElevation} all=${wantAll} tiles=${tileCache.size}`);
for (const r of routes.slice(0, 5)) console.log(`  ${r.id.padEnd(16)} ${r.activity ?? '徒步'} ${String(r.distance.toFixed(2)).padStart(8)} km  ${String(r.ascent).padStart(5)} m↑  ${String(r.maxEle).padStart(4)} m max  ${r.title}`);
