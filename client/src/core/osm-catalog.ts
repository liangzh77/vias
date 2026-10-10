// Public OpenStreetMap catalogue.
//
// Two things travel separately at runtime:
//   1. the index — title, activity, place, distance, start point, point count — fetched as
//      `static/osm/index.json` right after the shell paints, so lists, search and distance
//      sorting cost no JavaScript bundle space;
//   2. geometry shards — `static/osm/routes/shard-NNN.json`, fetched the first time a route
//      is actually opened.
// A small committed preview (`featured-routes.json`, 10 entries, no coordinates) is bundled
// so the home screen and the 精选 tab have real content before the index arrives.
import {ref} from 'vue';
import preview from './featured-routes.json';
import {shardFileName, shardMap, shardOf, unpackSegments} from './shard-codec';
import type {Shard} from './shard-codec';
import type {Route} from './track';

export type Entry = {
  id: string; title: string; activity?: string; place?: string;
  distance: number; ascent: number; descent: number; maxEle?: number;
  points: number; start: [number, number]; featured?: boolean;
};
export type Catalog = {
  source: string; extracted?: string; scope?: string; elevation: boolean; elevationSource?: string;
  full?: boolean; shards: number[]; routes: Entry[];
};
export type IndexState = 'idle' | 'loading' | 'ready' | 'error';

const AUTHOR = 'OpenStreetMap 贡献者';
const LICENSE = 'ODbL 1.0';
const LICENSE_URL = 'https://opendatacommons.org/licenses/odbl/1-0/';
const ELEVATION_SOURCE = '海拔取自公开地形瓦片（terrarium，底层为 SRTM 等公有领域高程数据，约 30 m 分辨率）采样插值，非实测';

// Derived per route instead of stored: the same string for every entry, and the index is on
// the critical path of the first paint.
function sourceNotice(elevation: boolean): string {
  return elevation
    ? `路线数据 © OpenStreetMap 贡献者（ODbL 1.0）；${ELEVATION_SOURCE}；未经实走验证，不可导航`
    : '路线数据 © OpenStreetMap 贡献者（ODbL 1.0）；未经实走验证，不可导航';
}

function buildRoute(entry: Entry, elevation: boolean): Route {
  const key = entry.id.slice('osm-'.length);
  const relation = !key.startsWith('w');
  return {
    id: entry.id,
    title: entry.title,
    author: AUTHOR,
    activity: entry.activity ?? '徒步',
    difficulty: '未评估',
    place: entry.place ?? '北京市',
    distance: entry.distance,
    duration: 0,
    ascent: entry.ascent,
    descent: entry.descent,
    maxEle: entry.maxEle ?? 0,
    maxSpeed: 0,
    source: sourceNotice(elevation),
    sourceUrl: `https://www.openstreetmap.org/${relation ? 'relation' : 'way'}/${relation ? key : key.slice(1)}`,
    license: LICENSE,
    licenseUrl: LICENSE_URL,
    cover: `${baseUrl()}static/osm/${key}.png`,
    ...(entry.featured ? {featured: true} : {}),
    pointCount: entry.points,
    start: entry.start,
    segments: [], // fetched from a shard on first open
    waypoints: [],
  };
}

/* ---------- runtime validation ---------- *
 * The index is JSON from the network. TypeScript's assertion does not check it, and a
 * broken entry would show up as a wrong distance on a list row instead of an error, so the
 * whole document is checked before any of it becomes a Route.                        */

const isText = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

function entryAt(raw: unknown, at: number): Entry {
  const bad = (): never => { throw new Error(`路线目录第 ${at + 1} 条格式不正确`); };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) bad();
  const e = raw as Record<string, unknown>;
  if (!isText(e.id) || !/^osm-w?\d+$/.test(e.id)) bad();
  if (!isText(e.title) || e.title.length > 200) bad();
  if (e.activity != null && !isText(e.activity)) bad();
  if (e.place != null && !isText(e.place)) bad();
  for (const field of ['distance', 'ascent', 'descent'] as const) if (!isCount(e[field])) bad();
  if (e.maxEle != null && !isCount(e.maxEle)) bad();
  if (!isCount(e.points) || e.points < 2) bad();
  const start = e.start;
  if (!Array.isArray(start) || start.length !== 2 || !start.every(isCount)) bad();
  const [lat, lon] = start as number[];
  if (lat > 90 || lon > 180) bad();
  if (e.featured != null && typeof e.featured !== 'boolean') bad();
  return e as unknown as Entry;
}

export function validateCatalog(raw: unknown): Catalog {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('路线目录格式不正确');
  const doc = raw as Record<string, unknown>;
  if (!isText(doc.source)) throw new Error('路线目录缺少来源说明');
  if (typeof doc.elevation !== 'boolean') throw new Error('路线目录缺少海拔说明');
  if (doc.full != null && typeof doc.full !== 'boolean') throw new Error('路线目录的完整标记不正确');
  if (!Array.isArray(doc.routes) || !doc.routes.length) throw new Error('路线目录没有路线');
  const routes = doc.routes.map(entryAt);
  const ids = new Set<string>();
  for (const entry of routes) {
    if (ids.has(entry.id)) throw new Error(`路线目录包含重复 ID：${entry.id}`);
    ids.add(entry.id);
  }
  const map = shardMap(doc.shards);
  if (map.total !== routes.length) throw new Error('路线目录与分片表不匹配');
  return {
    source: doc.source,
    extracted: typeof doc.extracted === 'string' ? doc.extracted : undefined,
    scope: typeof doc.scope === 'string' ? doc.scope : undefined,
    elevation: doc.elevation,
    elevationSource: typeof doc.elevationSource === 'string' ? doc.elevationSource : undefined,
    full: doc.full === true,
    shards: map.counts,
    routes,
  };
}

/* ---------- reactive state ---------- */

// Committed, generated from the same catalogue as the index, and validated on import: a
// drifted preview must fail the build/tests, not half-render the home screen.
function readPreview(raw: unknown): {elevation: boolean; routes: Entry[]} {
  const doc = raw as {elevation?: unknown; routes?: unknown};
  if (typeof doc?.elevation !== 'boolean' || !Array.isArray(doc.routes) || !doc.routes.length)
    throw new Error('精选预览格式不正确');
  return {elevation: doc.elevation, routes: doc.routes.map(entryAt)};
}

const previewDoc = readPreview(preview);

// Starts as the committed preview and is replaced by the full index in place, keeping the
// object identity of every preview entry so a geometry already downloaded is not lost.
export const osmRoutes = ref<Route[]>(previewDoc.routes.map(entry => buildRoute(entry, previewDoc.elevation)));
export const catalogState = ref<IndexState>('idle');
export const catalogError = ref('');
export const catalogFull = ref(false);
export const catalogSource = ref('');        // full provenance line, shown on the data notice page
export const catalogNotice = ref('');        // short extract/scope line for the information strip
export const catalogElevationSource = ref(''); // elevation method, kept separate from the route licence
export const osmCount = ref(osmRoutes.value.length);

let catalog: Catalog | null = null;
let indexPromise: Promise<void> | null = null;
let map = shardMap([osmRoutes.value.length]);
let positionById = new Map<string, number>(osmRoutes.value.map((route, position) => [route.id, position]));

function adopt(next: Catalog): void {
  catalog = next;
  map = shardMap(next.shards);
  positionById = new Map(next.routes.map((entry, position) => [entry.id, position]));
  const known = new Map(osmRoutes.value.map(route => [route.id, route]));
  osmRoutes.value = next.routes.map((entry, position) => {
    const existing = known.get(entry.id);
    if (existing) {
      // Same object as the preview: keep its identity, refresh its fields from the index.
      Object.assign(existing, buildRoute(entry, next.elevation), {segments: existing.segments});
      return existing;
    }
    return buildRoute(entry, next.elevation);
  });
  catalogFull.value = next.full === true;
  catalogSource.value = next.source;
  catalogNotice.value = [next.extracted ? `${next.extracted} 提取` : '', next.scope].filter(Boolean).join(' · ');
  catalogElevationSource.value = next.elevationSource ?? (next.elevation ? ELEVATION_SOURCE : '');
  osmCount.value = next.routes.length;
}

export function shardCount(): number {
  return map.counts.length;
}

export function baseDir(): string {
  return baseUrl();
}

/* ---------- fetching ---------- */

function baseUrl(): string {
  const env = (import.meta as unknown as {env?: {BASE_URL?: string}}).env;
  return env?.BASE_URL || '/';
}

async function readJson(url: string): Promise<unknown> {
  if (typeof fetch === 'function') {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`请求失败（HTTP ${response.status}）`);
    return JSON.parse(await response.text());
  }
  // Mini-program: the index and the shards must be reachable over HTTPS from a whitelisted
  // domain, and the main package is far too small to carry them.
  return await new Promise<unknown>((resolve, reject) => {
    uni.request({
      url,
      dataType: 'json',
      success: result => resolve(result.data),
      fail: () => reject(new Error('请求失败：小程序需要已配置的 HTTPS 服务端')),
    });
  });
}

// Idempotent; a failed attempt is dropped so 重试 really retries. Loading the index also
// happens implicitly when a route is opened before the list is ready.
export function loadIndex(): Promise<void> {
  if (catalog) return Promise.resolve();
  if (indexPromise) return indexPromise;
  catalogState.value = 'loading';
  catalogError.value = '';
  const pending = readJson(`${baseUrl()}static/osm/index.json`)
    .then(data => {
      adopt(validateCatalog(data));
      catalogState.value = 'ready';
    })
    .catch((error: unknown) => {
      catalogState.value = 'error';
      catalogError.value = error instanceof Error ? error.message : '路线目录加载失败';
      indexPromise = null;   // retry from scratch
      throw new Error(`路线目录加载失败：${catalogError.value}`);
    });
  indexPromise = pending.then(() => undefined);
  return indexPromise;
}

// Keeping every visited shard for the whole session would hold a second copy of the
// geometry after the routes are merged, so only a handful stay cached.
const SHARD_CACHE_MAX = 12;
const shards = new Map<number, Promise<Shard>>();

function cacheShard(shard: number, pending: Promise<Shard>): Promise<Shard> {
  shards.set(shard, pending);
  pending.catch(() => shards.delete(shard));
  if (shards.size > SHARD_CACHE_MAX) {
    for (const key of shards.keys()) {
      if (key !== shard) { shards.delete(key); break; }
    }
  }
  return pending;
}

function fetchShard(shard: number): Promise<Shard> {
  const cached = shards.get(shard);
  if (cached) return cached;
  const pending = readJson(`${baseUrl()}static/osm/routes/${shardFileName(shard)}`).then(data => {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('轨迹分片格式不正确');
    const keys = Object.keys(data as object);
    // An empty object parses fine and would be cached as a success, so the shape is checked
    // here and the contents are checked against the index in loadGeometry.
    if (!keys.length) throw new Error('轨迹分片为空');
    return data as Shard;
  });
  return cacheShard(shard, pending);
}

// A shard belongs to exactly one index: the counts come from the index, and every key must
// be a route the index knows. A mismatch means the shard file and the index come from
// different releases, which must fail loudly instead of drawing someone else's geometry.
function checkShard(shard: number, data: Shard): void {
  const keys = Object.keys(data);
  if (keys.length !== map.counts[shard]) throw new Error('轨迹分片与当前目录版本不一致（分片条目数不符）');
  for (const key of keys) {
    const position = positionById.get(`osm-${key}`);
    if (position == null || shardOf(map, position) !== shard) throw new Error('轨迹分片与当前目录版本不一致（分片内容不符）');
  }
}

// Attaches packed geometry to a route object. Split out from the fetch so the decode path
// can be exercised directly against a committed shard.
export function mergeGeometry(route: Route, packed: unknown): Route {
  route.segments = unpackSegments(packed);
  return route;
}

export function isGeometryLoaded(route: Route): boolean {
  return route.segments.length > 0;
}

// Loads the geometry of one route into that same route object and returns it. Callers pass
// `current.value` so the assignment is seen by Vue's reactivity.
export async function loadGeometry(route: Route): Promise<Route> {
  if (route.segments.length) return route;
  if (!positionById.has(route.id)) await loadIndex();
  const position = positionById.get(route.id);
  if (position == null) throw new Error('这条轨迹不在公开目录中，无法按需下载');
  const shard = shardOf(map, position);
  try {
    const data = await fetchShard(shard);
    checkShard(shard, data);
    const packed = data[route.id.slice('osm-'.length)];
    if (!packed) throw new Error('轨迹分片中没有这条线路的坐标');
    return mergeGeometry(route, packed);
  } catch (error) {
    // Anything wrong with this shard must not be cached as usable — not the request, not the
    // payload, not a decode failure — so 重试 can fetch it again.
    shards.delete(shard);
    throw error;
  }
}
