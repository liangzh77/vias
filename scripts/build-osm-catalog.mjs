// Build the public OpenStreetMap route catalog from the local (git-ignored) Beijing
// extraction, plus generated track thumbnails.
//
//   node scripts/build-osm-catalog.mjs [--elevation]
//
// Input : data/open-datasets/beijing/osm/{index.json,routes/relation-*.gpx}  (ODbL, local only)
// Output: client/src/core/osm-routes.json      (committed, public)
//         client/src/static/osm/<id>.png       (committed, generated art)
//
// Elevation is *not* in the extraction. With --elevation we sample each route and ask
// OpenTopoData (SRTM 90 m) for sampled heights, then interpolate along the route.
// Results are cached in artifacts/ (git-ignored).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const osmDir = path.join(root, 'data/open-datasets/beijing/osm');
const cachePath = path.join(root, 'artifacts/osm-elevation-cache.json');
// Elevation must be chosen explicitly: a silent default previously dropped every <ele>
// value and the ascent/descent statistics while still producing a plausible catalogue.
if (!process.argv.includes('--elevation') && !process.argv.includes('--no-elevation')) {
  console.error('Refusing to run: pass --elevation (SRTM sampling, cached) or --no-elevation explicitly.');
  process.exit(2);
}
const wantElevation = process.argv.includes('--elevation');
const proxy = process.env.VIAS_HTTP_PROXY || '';

// Chosen from the 23 OSM route relations in the Beijing extract: all 7 foot/hiking
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

// Node's fetch has no env-proxy support and undici is not installed here, so go through curl.
function apiFetch(url, {proxyUrl = proxy} = {}) {
  const args = ['-fsS', '--http1.1', '--max-time', '30', '--retry', '5', '--retry-delay', '3', url];
  if (proxyUrl) args.unshift('-x', proxyUrl);
  const out = execFileSync('curl', args, {encoding: 'utf8', maxBuffer: 32 * 1024 * 1024});
  return JSON.parse(out);
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

async function elevationFor(id, flat, cache) {
  const {distances, picked} = samplePoints(flat, 90);
  const key = String(id);
  if (!cache[key] || cache[key].length !== picked.length) {
    const heights = [];
    for (let i = 0; i < picked.length; i += 90) {
      const chunk = picked.slice(i, i + 90);
      const locations = chunk.map(p => `${flat[p.index].lat.toFixed(5)},${flat[p.index].lon.toFixed(5)}`).join('|');
      const data = apiFetch(`https://api.opentopodata.org/v1/srtm90m?locations=${encodeURIComponent(locations)}`);
      if (data.status !== 'OK' || !Array.isArray(data.results) || data.results.length !== chunk.length) {
        throw new Error('bad elevation payload for ' + id + ': ' + JSON.stringify(data).slice(0, 200));
      }
      heights.push(...data.results.map(r => Number(r.elevation)));
      await new Promise(resolve => setTimeout(resolve, 1200));  // public API allows 1 request/second
    }
    cache[key] = heights;
    fs.mkdirSync(path.dirname(cachePath), {recursive: true});
    fs.writeFileSync(cachePath, JSON.stringify(cache));
  }
  const samples = cache[key];
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
    chunk('IDAT', zlib.deflateSync(raw, {level: 9})),
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
    const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])));
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
const byId = new Map(index.filter(e => e.type === 'relation').map(e => [e.id, e]));
const cache = fs.existsSync(cachePath) ? JSON.parse(fs.readFileSync(cachePath, 'utf8')) : {};
const routes = [];
const thumbDir = path.join(root, 'client/src/static/osm');
fs.mkdirSync(thumbDir, {recursive: true});

for (const entry of SELECTION) {
  const meta = byId.get(entry.id);
  if (!meta) throw new Error('relation ' + entry.id + ' not in the Beijing index');
  const segments = parseGpx(path.join(osmDir, 'routes', `relation-${entry.id}.gpx`));
  const flat = segments.flat();
  if (wantElevation) {
    const heights = await elevationFor(entry.id, flat, cache);
    let cursor = 0;
    for (const segment of segments) {
      for (const point of segment) point.ele = heights[cursor++];
    }
  }
  const stats = metrics(segments);
  const name = meta.tags.name;
  routes.push({
    id: `osm-${entry.id}`,
    title: name,
    author: 'OpenStreetMap 贡献者',
    activity: entry.activity,
    difficulty: '未评估',
    place: entry.place,
    distance: Math.round(stats.distance * 1000) / 1000,
    duration: 0,
    ascent: stats.ascent,
    descent: stats.descent,
    maxEle: wantElevation ? Math.round(Math.max(...flat.map(p => p.ele))) : 0,
    maxSpeed: 0,
    source: wantElevation
      ? '路线数据 © OpenStreetMap 贡献者（ODbL 1.0）；海拔取自 SRTM 90 m（NASA/USGS，公有领域）采样插值，非实测；未经实走验证，不可导航'
      : '路线数据 © OpenStreetMap 贡献者（ODbL 1.0）；未经实走验证，不可导航',
    sourceUrl: `https://www.openstreetmap.org/relation/${entry.id}`,
    license: 'ODbL 1.0',
    licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
    cover: `static/osm/${entry.id}.png`,
    segments,
    waypoints: [],
  });
  fs.writeFileSync(path.join(thumbDir, `${entry.id}.png`), drawRoute(segments));
}

const out = path.join(root, 'client/src/core/osm-routes.json');
fs.writeFileSync(out, JSON.stringify(routes, null, 0) + '\n');
const points = routes.reduce((n, r) => n + r.segments.reduce((m, s) => m + s.length, 0), 0);
console.log(`OSM_CATALOG routes=${routes.length} points=${points} bytes=${fs.statSync(out).size} elevation=${wantElevation}`);
for (const r of routes) console.log(`  ${r.id.padEnd(14)} ${r.activity} ${String(r.distance.toFixed(1)).padStart(6)} km  ${String(r.ascent).padStart(5)} m↑  ${String(r.maxEle).padStart(4)} m max  ${r.title}`);
