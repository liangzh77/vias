// The catalogue is split in two: an index fetched as JSON at runtime and geometry shards
// fetched when a route is opened. The repository only carries a small sample, so these tests
// pin the split, the preview/index consistency, the adoption and retry behaviour, and the
// rejection of malformed network payloads — a regression here puts coordinates back on the
// first screen or draws someone else's trail.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {shardFileName,shardMap,shardOf,unpackSegments} from '../src/core/shard-codec';
import {catalogError,catalogFull,catalogNotice,catalogSource,catalogState,loadGeometry,loadIndex,mergeGeometry,osmRoutes,validateCatalog} from '../src/core/osm-catalog';
import {exportGpx,exportKml,parseGpx} from '../src/core/track';

const sampleDir='catalog-sample';
const indexPath=`${sampleDir}/osm-index.json`;
const shardDir=`${sampleDir}/shards`;
type Entry={id:string;title:string;activity?:string;place?:string;distance:number;ascent:number;descent:number;maxEle?:number;points:number;start:[number,number];featured?:boolean};
type Catalog={source:string;extracted?:string;scope?:string;elevation:boolean;full?:boolean;shards:number[];routes:Entry[]};
const index:Catalog=JSON.parse(fs.readFileSync(indexPath,'utf8'));
const raw=fs.readFileSync(indexPath,'utf8');
const map=shardMap(index.shards);
const shardPath=(i:number)=>`${shardDir}/${shardFileName(i)}`;
const loadShard=(position:number):Record<string,unknown>=>JSON.parse(fs.readFileSync(shardPath(shardOf(map,position)),'utf8'));
const entryShard=(id:string)=>loadShard(index.routes.findIndex(r=>r.id===id))[id.slice('osm-'.length)];

// The sample catalogue is the one the app is built from in a fresh clone; the full local
// extraction, when present, must agree with it entry by entry.
const fullIndexPath='../data/catalog/osm-index.json';
const full:Catalog|null=fs.existsSync(fullIndexPath)?JSON.parse(fs.readFileSync(fullIndexPath,'utf8')):null;

/* ---------- fetching is stubbed: these tests never touch the network ---------- */
type Reply=(url:string)=>{status?:number;body?:unknown;throw?:boolean};
let replies:Reply=()=>{throw new Error('unexpected request')};
let requests:string[]=[];
const realFetch=globalThis.fetch;
globalThis.fetch=(async (input:RequestInfo|URL)=>{
 requests.push(String(input));
 const reply=replies(String(input));
 if(reply.throw)throw new Error('network down');
 const status=reply.status??200;
 return {ok:status>=200&&status<300,status,text:async()=>typeof reply.body==='string'?reply.body:JSON.stringify(reply.body)} as Response;
}) as typeof fetch;

test('the committed index carries metadata only — no coordinates in the first screen',()=>{
 // A fresh clone ships the sample; the full extraction is verified by scripts/verify-catalog.mjs.
 assert.ok(index.routes.length>=10&&index.routes.length<=20,'提交的目录应当只是小的示例子集');
 assert.equal(index.full,false,'提交的目录必须自述为非完整快照');
 assert.ok(index.source.includes('OpenStreetMap')&&index.elevation===true);
 assert.ok(index.extracted&&index.scope,'索引必须带提取时间与范围说明');
 assert.ok(!raw.includes('segments'),'索引不得包含 segments');
 assert.ok(!raw.includes('"lat"'),'索引不得包含坐标对象');
 assert.equal(index.routes.filter(r=>r.featured).length,index.routes.length,'示例目录里的路线都应当是精选');
 const keys=new Set(index.routes.flatMap(r=>Object.keys(r)));
 for(const key of keys)assert.ok(['id','title','activity','place','distance','ascent','descent','maxEle','points','start','featured'].includes(key),'意外的索引字段: '+key);
 assert.equal(map.total,index.routes.length);
 for(const [position,route] of index.routes.entries()){
  assert.match(route.id,/^osm-(w?\d+)$/);
  assert.ok(route.title.length>0);
  const [lat,lon]=route.start;
  assert.ok(lat>39&&lat<42&&lon>115&&lon<118,`起点不在北京范围: ${route.id}`);
  assert.ok(Number.isInteger(route.points)&&route.points>=2);
  assert.ok(route.distance>0);
  assert.equal(shardOf(map,position)>=0,true);
 }
});

test('every advertised route resolves to a real shard with the advertised points',()=>{
 const shards=fs.readdirSync(shardDir).filter(name=>name.endsWith('.json'));
 assert.equal(shards.length,map.starts.length,'分片文件数必须与分片表一致');
 const data=loadShard(0);
 assert.deepEqual(Object.keys(data).sort(),index.routes.map(r=>r.id.slice('osm-'.length)).sort(),'分片的键必须正好是索引里的路线');
 for(const entry of index.routes){
  const segments=unpackSegments(data[entry.id.slice('osm-'.length)]);
  assert.equal(segments.flat().length,entry.points);
  assert.ok(Math.abs(segments[0][0].lat-entry.start[0])<1e-6);
  assert.ok(Math.abs(segments[0][0].lon-entry.start[1])<1e-6);
  for(const point of segments.flat())assert.ok(Number.isFinite(point.lat)&&Number.isFinite(point.ele));
 }
});

test('the bundle preview matches the catalogue it was generated from',()=>{
 const preview=JSON.parse(fs.readFileSync('src/core/featured-routes.json','utf8'));
 assert.equal(preview.elevation,index.elevation);
 assert.equal(preview.routes.length,osmRoutes.value.length,'首屏预览的条目数必须与提交的索引一致');
 preview.routes.forEach((entry:Entry,at:number)=>{
  const route=osmRoutes.value[at];
  assert.equal(route.id,entry.id);
  assert.equal(route.title,entry.title);
  assert.equal(route.pointCount,entry.points);
  assert.deepEqual(route.start,entry.start);
  assert.equal(route.segments.length,0,'首屏不得内联几何');
  assert.match(route.cover as string,/static\/osm\/w?\d+\.png$/);
 });
 assert.equal(catalogState.value,'idle');
 assert.equal(catalogFull.value,false);
});

test('the home screen pins four real Beijing routes that the sample really carries',()=>{
 const classic=JSON.parse(fs.readFileSync('src/core/classic-routes.json','utf8')) as {ids:string[]};
 assert.equal(classic.ids.length,4,'首屏「经典线路」固定 4 条');
 assert.equal(new Set(classic.ids).size,4,'首屏 4 条经典线路不得重复');
 for(const id of classic.ids){
  const entry=index.routes.find(r=>r.id===id);
  assert.ok(entry,`首屏经典线路 ${id} 不在提交的示例子集里（全新克隆的首屏会缺卡）`);
  assert.equal(entry.featured,true,`首屏经典线路 ${id} 不是精选，首屏预览里不会有它`);
  assert.ok(osmRoutes.value.some(r=>r.id===id),`首屏预览里没有 ${id}`);
  assert.ok(fs.existsSync(`${sampleDir}/thumbs/${id.slice('osm-'.length)}.png`),`缺少 ${id} 的缩略图`);
  if(full)assert.equal(full.routes.find(r=>r.id===id)?.featured,true,`完整目录里 ${id} 也必须是精选`);
 }
});

test('a failing index keeps the preview usable; bad documents never replace the list',async()=>{
 replies=()=>({throw:true});
 await assert.rejects(()=>loadIndex(),/路线目录加载失败/);
 assert.equal(catalogState.value,'error');
 assert.match(catalogError.value,/network down/);
 assert.equal(osmRoutes.value.length,index.routes.length,'失败后仍应保留预览内容');
 const entry={id:'osm-1',title:'t',distance:1,ascent:0,descent:0,points:2,start:[40,116]};
 // The second attempt carries a duplicate id: only a retry that ignores the failed promise
 // can reach it, and a broken document must be rejected before anything is adopted.
 replies=()=>({body:{source:'s',elevation:true,shards:[2],routes:[entry,entry]}});
 await assert.rejects(()=>loadIndex(),/路线目录加载失败：路线目录包含重复 ID/);
 assert.equal(catalogState.value,'error');
 assert.equal(osmRoutes.value.length,index.routes.length,'坏目录不得替换当前列表');
 replies=()=>({body:{source:'s',elevation:true,shards:[2],routes:[entry]}});
 await assert.rejects(()=>loadIndex(),/分片表不匹配/);
 replies=()=>({body:index});
 await loadIndex();
 assert.equal(catalogState.value,'ready');
 assert.equal(osmRoutes.value.length,index.routes.length);
 assert.equal(catalogFull.value,false);
 assert.equal(catalogSource.value,index.source,'数据说明页必须拿到完整的来源说明');
 assert.ok(catalogNotice.value.includes(index.extracted as string)&&catalogNotice.value.includes(index.scope as string),'提示条只放提取时间与范围');
 assert.ok(!catalogNotice.value.includes(index.source),'提示条不应把整段来源塞进去');
});

test('malformed catalogue documents are rejected by the validator itself',()=>{
 assert.throws(()=>validateCatalog(null),/格式不正确/);
 assert.throws(()=>validateCatalog({source:'s',elevation:true,routes:[],shards:[]}),/没有路线/);
 assert.throws(()=>validateCatalog({elevation:true,routes:[],shards:[]}),/缺少来源说明/);
 assert.throws(()=>validateCatalog({source:'s',routes:[],shards:[]}),/缺少海拔说明/);
 const entry={id:'osm-1',title:'t',distance:1,ascent:0,descent:0,points:2,start:[40,116]};
 assert.throws(()=>validateCatalog({source:'s',elevation:true,shards:[2],routes:[entry]}),/分片表不匹配/);
 assert.throws(()=>validateCatalog({source:'s',elevation:true,shards:[1],routes:[{...entry,id:'local-1'}]}),/格式不正确/);
 assert.throws(()=>validateCatalog({source:'s',elevation:true,shards:[1],routes:[{...entry,points:1}]}),/格式不正确/);
 assert.throws(()=>validateCatalog({source:'s',elevation:true,shards:[1],routes:[{...entry,start:[1]}]}),/格式不正确/);
 assert.throws(()=>validateCatalog({source:'s',elevation:true,shards:[1],routes:[{...entry,distance:'1'}]}),/格式不正确/);
 assert.throws(()=>validateCatalog({source:'s',elevation:'yes',shards:[1],routes:[entry]}),/缺少海拔说明/);
});

test('preview entries are adopted in place so a loaded shard is not thrown away',async()=>{
 const first=osmRoutes.value[0];
 const before=first.segments.length;
 mergeGeometry(first,entryShard(first.id));
 assert.ok(first.segments.length>before);
 assert.equal(osmRoutes.value[0],first,'索引到达后必须复用同一个对象');
 assert.ok(first.segments.length>0,'复用对象时不得丢掉已下载的几何');
 assert.equal(first.pointCount,index.routes[0].points);
});

// Shard failures come before the first successful fetch: the sample catalogue fits in one
// shard, so once it is cached every later attempt would be served from the cache.
test('a shard from another release is refused instead of drawn',async()=>{
 const route=osmRoutes.value[2];
 // A payload whose keys are not the routes of this shard: the JSON is valid, but it belongs
 // to a different catalogue version and must not be drawn.
 replies=()=>({body:{['w'+Date.now()]:[[40,116,50]]}});
 await assert.rejects(()=>loadGeometry(route),/版本不一致/);
 replies=()=>({status:404,body:{}});
 await assert.rejects(()=>loadGeometry(route),/HTTP 404/);
 replies=()=>({body:'{}'});
 await assert.rejects(()=>loadGeometry(route),/轨迹分片为空/);
 replies=()=>({body:'not json'});
 await assert.rejects(()=>loadGeometry(route),SyntaxError);
 assert.equal(route.segments.length,0,'失败的下载不得留下坐标');
});

test('geometry is fetched per route, verified against the index and cached once',async()=>{
 const route=osmRoutes.value[2];
 requests=[];
 replies=()=>({body:loadShard(2)});
 // The four failed attempts above left nothing cached, so this really is a fresh download.
 await loadGeometry(route);
 assert.equal(route.segments.flat().length,route.pointCount);
 assert.deepEqual(requests,['/static/osm/routes/shard-000.json'],'按需分片路径应当是 BASE_URL + 分片名');
 const cached=requests.length;
 await loadGeometry(route);
 assert.equal(requests.length,cached,'已经加载过的路线不得再次请求');
 // A second route in the same shard is served from that one download.
 await loadGeometry(osmRoutes.value[1]);
 assert.equal(requests.length,cached,'同一分片只下载一次');
 assert.equal(osmRoutes.value[1].segments.flat().length,osmRoutes.value[1].pointCount);
});

test('a route that is not in the catalogue is refused, and the index is loaded first',async()=>{
 const foreign={...osmRoutes.value[0],id:'osm-999999999',segments:[]};
 replies=(url:any)=>String(url).includes('index.json')?{body:index}:{body:{}};
 await assert.rejects(()=>loadGeometry(foreign as typeof osmRoutes.value[0]),/不在公开目录中/);
});

test('malformed shard payloads are rejected instead of drawn',()=>{
 assert.throws(()=>unpackSegments([]));
 assert.throws(()=>unpackSegments([[]]));
 assert.throws(()=>unpackSegments([[[91,0]]]));
 assert.throws(()=>unpackSegments([[[39,116,'x']]]));
 assert.throws(()=>unpackSegments([[[null,116]]]),'不得把 null 当成 0');
 assert.throws(()=>unpackSegments([[[true,116]]]),'不得把布尔当成坐标');
 assert.throws(()=>unpackSegments([[[39,116,50,1]]]),'三元素以外的点必须被拒绝');
 assert.throws(()=>shardMap([]));
 assert.throws(()=>shardMap([1.5]));
 assert.throws(()=>shardMap([-1]));
 const small=shardMap([2,3]);
 assert.equal(small.total,5);
 assert.equal(shardOf(small,0),0);
 assert.equal(shardOf(small,1),0);
 assert.equal(shardOf(small,2),1);
 assert.equal(shardOf(small,4),1);
 assert.throws(()=>shardOf(small,5));
 assert.throws(()=>shardOf(small,-1));
 assert.equal(shardFileName(7),'shard-007.json');
});

test('OSM exports keep author, source URL and ODbL licence after shard loading',()=>{
 for(const position of [0,index.routes.length-1]){
  const route=osmRoutes.value[position];
  if(!route.segments.length)mergeGeometry(route,entryShard(route.id));
  assert.equal(route.license,'ODbL 1.0');
  assert.equal(route.licenseUrl,'https://opendatacommons.org/licenses/odbl/1-0/');
  assert.match(route.sourceUrl as string,/^https:\/\/www\.openstreetmap\.org\/(relation|way)\/\d+$/);
  const url=route.sourceUrl as string;
  const gpx=exportGpx(route);
  assert.match(gpx,/<copyright author="OpenStreetMap 贡献者">/);
  assert.match(gpx,/<license>https:\/\/opendatacommons\.org\/licenses\/odbl\/1-0\/<\/license>/);
  assert.ok(gpx.includes(url));
  // Machine-readable provenance must be a real attribute, not only prose in <desc>.
  assert.ok(gpx.includes(`<link href="${url}"><text>${route.author}</text></link>`),'GPX metadata link href');
  assert.ok(gpx.includes(`<src>${route.source}</src>`),'GPX trk src');
  assert.equal((gpx.match(/<link href=/g)||[]).length,2,'metadata link + trk link');
  const kml=exportKml(route);
  assert.match(kml,/<atom:link rel="license" href="https:\/\/opendatacommons\.org\/licenses\/odbl\/1-0\/"\/>/);
  assert.ok(kml.includes(`<atom:link rel="related" href="${url}"/>`),'KML related link');
  assert.ok(kml.includes('terrarium'));
  assert.ok(kml.includes('非实测'));
  assert.ok(kml.includes(url));
  const back=parseGpx(gpx);
  assert.equal(back.segments.flat().length,route.pointCount);
  assert.equal(back.sourceUrl,url,'source link survives a GPX round trip');
 }
});

test('the committed sample stays consistent with the local full extraction',{skip:!full},()=>{
 const byId=new Map(full!.routes.map(r=>[r.id,r]));
 for(const entry of index.routes){
  const other=byId.get(entry.id);
  assert.ok(other,`示例里的 ${entry.id} 不在本地完整目录里`);
  assert.deepEqual(other,entry,'示例条目必须与完整目录逐字段一致');
 }
});

test.after(()=>{globalThis.fetch=realFetch});
