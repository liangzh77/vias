// Installs a catalogue into the source tree before a build or a dev server starts.
//
//   node scripts/prepare-catalog.mjs            # full when data/catalog exists, else sample
//   node scripts/prepare-catalog.mjs --full     # require the local full catalogue
//   node scripts/prepare-catalog.mjs --sample   # force the committed subset
//   node scripts/prepare-catalog.mjs --export-sample   # refresh client/catalog-sample from data/
//
// What it writes (all git-ignored except the sample directory and the preview):
//   client/src/static/osm/index.json           catalogue metadata, fetched at runtime
//   client/src/static/osm/<key>.png            list thumbnails
//   client/src/static/osm/routes/shard-NNN.json geometry shards
//   client/src/static/osm/manifest.json       machine-readable licence / origin / caveats
//   client/src/core/featured-routes.json       committed preview for the first paint
//
// The route data itself never enters git: only a small subset of real routes does, so a
// fresh clone can build and the public site works without the local extraction.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const fullDir = path.join(root, 'data/catalog');
const sampleSource = path.join(root, 'data/catalog/sample');
const sampleDir = path.join(root, 'client/catalog-sample');
const staticDir = path.join(root, 'client/src/static/osm');
const previewFile = path.join(root, 'client/src/core/featured-routes.json');
// The bundled preview must cover every featured route (the pinned selection plus the four
// featured ways): a preview that misses one would leave the home screen without its card, and
// client/tests/catalog.test.ts holds the preview to the committed sample entry for entry.
const PREVIEW_LIMIT = 20;

const args = process.argv.slice(2);
const exportSample = args.includes('--export-sample');
const source = exportSample ? sampleSource : (() => {
  if (args.includes('--full')) return fullDir;
  if (args.includes('--sample')) return sampleDir;
  return fs.existsSync(path.join(fullDir, 'osm-index.json')) ? fullDir
    : fs.existsSync(path.join(sampleDir, 'osm-index.json')) ? sampleDir
    : null;
})();
if (!source) {
  console.error('No catalogue available. Run scripts/build-osm-catalog.mjs --all --elevation, or commit client/catalog-sample.');
  process.exit(2);
}
const indexPath = path.join(source, 'osm-index.json');
if (!fs.existsSync(indexPath)) {
  console.error(`Missing ${path.relative(root, indexPath)} (full catalogue lives in data/catalog, sample in client/catalog-sample).`);
  process.exit(2);
}
const catalog = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
const label = path.relative(root, source);
/* ---------- machine-readable manifest for the published dataset ---------- */
// The catalogue is a redistributable ODbL extract, so any deployment must ship the terms,
// the origin and the caveats next to the data itself.
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function buildManifest(index, indexFile, shardDir, coverFiles) {  const relations = index.routes.filter(entry => !entry.id.startsWith('osm-w')).length;
  const shardFiles = fs.readdirSync(shardDir).sort();
  if (shardFiles.length !== index.shards.length) throw new Error(`shard count mismatch: ${shardFiles.length} files vs ${index.shards.length} entries`);
  if (coverFiles.length !== index.routes.length) throw new Error(`thumbnail count mismatch: ${coverFiles.length} files vs ${index.routes.length} entries`);
  // The shard files are numbered in catalogue order, so file i carries shards[i] routes.
  const shards = shardFiles.map((file, i) => ({
    path: `static/osm/routes/${file}`, routes: index.shards[i], sha256: sha256(path.join(shardDir, file)),
  }));
  if (shards.reduce((n, s) => n + s.routes, 0) !== index.routes.length) throw new Error('shard route counts do not add up to the route count');
  return {
    title: '景行（Vias）OpenStreetMap 北京路线快照',
    generated: new Date().toISOString(),
    full: index.full === true,
    source: index.source,
    extracted: index.extracted,
    scope: index.scope,
    license: {
      name: 'ODbL 1.0',
      url: 'https://opendatacommons.org/licenses/odbl/1-0/',
      attribution: '© OpenStreetMap contributors',
      attributionZh: '© OpenStreetMap 贡献者',
    },
    elevation: index.elevation ? {
      source: index.elevationSource,
      measured: false,
      navigable: false,
      note: '海拔为公开地形瓦片采样插值，非实测、未实走验证；爬升/下降未经平滑。',
    } : null,
    counts: {
      routes: index.routes.length,
      relations,
      namedPaths: index.routes.length - relations,
      points: index.routes.reduce((n, entry) => n + (entry.points || 0), 0),
      shards: index.shards.length,
      thumbnails: coverFiles.length,
    },
    index: {path: 'static/osm/index.json', sha256: sha256(indexFile)},
    shards,
    // Derived data cannot be listed by hand in scripts/public-assets.json: the manifest is the
    // single statement of what is published, so every thumbnail is pinned here too.
    thumbnails: coverFiles.map(file => ({
      path: `static/osm/${path.basename(file)}`, sha256: sha256(file),
    })),
    caveats: [
      '命名路径片段是 OpenStreetMap 中带名字的道路/步道几何，不是完整行程，也没有起点终点语义。',
      '全部轨迹未经实走验证，不可用于户外导航。',
      '数据按现状提供，OpenStreetMap 贡献者与本站不提供任何明示或默示担保。',
    ],
    reproduce: [
      '下载 Geofabrik 北京 OSM 抽取（ODbL 1.0）。',
      'node scripts/build-osm-catalog.mjs --all --elevation',
      'node scripts/prepare-catalog.mjs --full',
      'node scripts/verify-catalog.mjs data/catalog',
    ],
    client: 'https://github.com/liangzh77/vias',
  };
}
// A rebuild with unchanged inputs must not rewrite the published identity: when every declared
// hash matches the previous manifest, keep its generated stamp so unchanged data stays byte-identical.
function stampGenerated(manifest, previous) {
  if (!previous || typeof previous.generated !== 'string' || previous.generated === manifest.generated) return manifest;
  const strip = (value) => { const copy = {...value}; delete copy.generated; return JSON.stringify(copy); };
  return strip(previous) === strip(manifest) ? {...manifest, generated: previous.generated} : manifest;
}
const readManifest = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };

/* ---------- --export-sample: copy the generated subset into the committed directory ---------- */
if (exportSample) {
  if (!fs.existsSync(path.join(sampleSource, 'osm-index.json'))) {
    console.error('Missing data/catalog/sample — run scripts/build-osm-catalog.mjs --all --elevation first.');
    process.exit(2);
  }
  const subset = JSON.parse(fs.readFileSync(path.join(sampleSource, 'osm-index.json'), 'utf8'));
  if (subset.full === true) {
    console.error('Refusing to commit a sample that claims to be the full catalogue.');
    process.exit(2);
  }
  const previous = readManifest(path.join(sampleDir, 'manifest.json'));
  fs.rmSync(sampleDir, {recursive: true, force: true});
  fs.cpSync(sampleSource, sampleDir, {recursive: true});
  fs.writeFileSync(path.join(sampleDir, 'manifest.json'), JSON.stringify(stampGenerated(buildManifest(subset, path.join(sampleDir, 'osm-index.json'), path.join(sampleDir, 'shards'), fs.readdirSync(path.join(sampleDir, 'thumbs')).sort().map(file => path.join(sampleDir, 'thumbs', file))), previous), null, 2) + '\n', 'utf8');
  console.log(`EXPORTED_SAMPLE ${path.relative(root, sampleSource)} -> ${path.relative(root, sampleDir)} routes=${subset.routes.length}`);
  process.exit(0);
}

/* ---------- install into client/src/static/osm ---------- */
const previousManifest = readManifest(path.join(staticDir, 'manifest.json'));
if (fs.existsSync(staticDir)) fs.rmSync(staticDir, {recursive: true, force: true});
fs.mkdirSync(path.join(staticDir, 'routes'), {recursive: true});
fs.copyFileSync(indexPath, path.join(staticDir, 'index.json'));
let covers = 0;
const coverFiles = [];
for (const entry of catalog.routes) {
  const key = entry.id.slice('osm-'.length);
  const from = path.join(source, 'thumbs', `${key}.png`);
  if (!fs.existsSync(from)) throw new Error(`missing thumbnail for ${entry.id}: ${path.relative(root, from)}`);
  fs.copyFileSync(from, path.join(staticDir, `${key}.png`));
  coverFiles.push(path.join(staticDir, `${key}.png`));
  covers += 1;
}
let shards = 0;
for (const file of fs.readdirSync(path.join(source, 'shards'))) {
  fs.copyFileSync(path.join(source, 'shards', file), path.join(staticDir, 'routes', file));
  shards += 1;
}

/* ---------- committed preview for the first paint ---------- */
const featured = catalog.routes.filter(entry => entry.featured).slice(0, PREVIEW_LIMIT);
if (!featured.length) throw new Error('catalogue has no featured routes to preview');
fs.writeFileSync(previewFile, JSON.stringify({
  note: '构建产物：由 scripts/prepare-catalog.mjs 从目录索引生成，供首屏“精选”tab 立即渲染（不含坐标）',
  elevation: catalog.elevation,
  routes: featured,
}, null, 2) + '\n');

/* ---------- machine-readable manifest ---------- */
const manifest = stampGenerated(buildManifest(catalog, path.join(staticDir, 'index.json'), path.join(staticDir, 'routes'), coverFiles), previousManifest);
fs.writeFileSync(path.join(staticDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');

const bytes = (dir) => {
  let total = 0;
  for (const item of fs.readdirSync(dir, {withFileTypes: true})) {
    const target = path.join(dir, item.name);
    total += item.isDirectory() ? bytes(target) : fs.statSync(target).size;
  }
  return total;
};
console.log(`CATALOG_READY source=${label} full=${catalog.full === true} routes=${catalog.routes.length} covers=${covers} shards=${shards} preview=${featured.length} manifest=${manifest.counts.relations}+${manifest.counts.namedPaths} static_bytes=${bytes(staticDir)}`);
if (!catalog.full) console.log('note: the committed sample is installed; the full local catalogue is under data/catalog.');
