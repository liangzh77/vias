// Fail closed after uni-app's static-copy step. Unknown files are never deleted.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const target=process.argv[2];
if(process.env.VIAS_RESEARCH==='1'){
 if(process.argv.includes('--public'))throw Error('Research output cannot be published');
 console.log('Private local research build; not publishable');process.exit(0);
}
const dir=['h5','mp-weixin'].includes(target)?path.join(root,'client/dist/build',target):path.resolve(target);
const approved=JSON.parse(fs.readFileSync(path.join(root,'scripts/public-assets.json'),'utf8'));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const researchNames=new Set(['banner.jpg','brand.jpg','entry-circle.jpg','entry-destination.jpg','entry-photo.jpg','entry-route.jpg','footprint-1.jpg','footprint-2.jpg','photo-1.jpg','photo-2.jpg','photo-3.jpg','photo-4.jpg','route-100125142.jpg','route-100126401.jpg']);
const files=[];const dirs=[];
function walk(base){for(const e of fs.readdirSync(base,{withFileTypes:true})){
 const f=path.join(base,e.name),rel=path.relative(dir,f).split(path.sep).join('/');
 if(e.isSymbolicLink()||e.name.startsWith('._')||['__MACOSX','.DS_Store'].includes(e.name))throw Error('Metadata/symlink prohibited: '+rel);
 if(e.isDirectory()){dirs.push(rel);walk(f);}else if(e.isFile())files.push(rel);else throw Error('Special file prohibited');
}}
if(fs.lstatSync(dir).isSymbolicLink())throw Error('Build root symlink');walk(dir);
// Remove only known private copies whose bytes match their local source, not arbitrary content.
for(const rel of files.filter(n=>n.startsWith('static/research/'))){
 const name=rel.slice('static/research/'.length),source=path.join(root,'client/src',rel);
 if(!researchNames.has(name)||!fs.existsSync(source)||hash(fs.readFileSync(source))!==hash(fs.readFileSync(path.join(dir,rel))))throw Error('Unknown research file: '+rel);
}
const inventoryPath=process.env.VIAS_BUILD_INVENTORY||path.join(path.dirname(dir),'.vias-h5-inventory.json');
const inventory=target==='mp-weixin'?null:JSON.parse(fs.readFileSync(inventoryPath,'utf8'));
const seen=new Set();
const privateSource=path.join(root,'client/src/core/routes.json');
const ids=fs.existsSync(privateSource)?JSON.parse(fs.readFileSync(privateSource,'utf8')).map(r=>String(r.id)):['100125142','100126401'];
// Generated catalogue art is derived data: instead of hand-copied hashes for 14k files, the
// installed index (client/src/static/osm/index.json, written by scripts/prepare-catalog.mjs)
// is the source of truth. Every cover it names must exist, and a thumbnail or geometry shard
// whose name it does not name is still rejected as an unapproved asset.
const indexPath=path.join(root,'client/src/static/osm/index.json');
if(!fs.existsSync(indexPath))throw Error('Missing client/src/static/osm/index.json — run `node scripts/prepare-catalog.mjs` before building');
const indexText=fs.readFileSync(indexPath,'utf8');
const index=JSON.parse(indexText);
if(typeof index.source!=='string'||!index.source||typeof index.scope!=='string'||!index.scope)throw Error('Catalogue index is missing its provenance notice');
if(typeof index.elevation!=='boolean'||typeof index.full!=='boolean')throw Error('Catalogue index is missing its elevation/full marker');
if(index.elevation&&!index.elevationSource)throw Error('Catalogue index claims elevation but names no source');
// The licence manifest ships next to the data and must agree with the index it describes.
const manifestPath=path.join(root,'client/src/static/osm/manifest.json');
if(!fs.existsSync(manifestPath))throw Error('Missing client/src/static/osm/manifest.json — run `node scripts/prepare-catalog.mjs` before building');
const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
if(manifest.license?.name!=='ODbL 1.0'||!manifest.license.url)throw Error('Catalogue manifest is missing its licence terms');
if(manifest.license.attributionZh!=='© OpenStreetMap 贡献者')throw Error('Catalogue manifest is missing the OpenStreetMap attribution');
if(manifest.source!==index.source)throw Error('Catalogue manifest source differs from the index');
if(manifest.full!==index.full)throw Error('Catalogue manifest full marker differs from the index');
if(manifest.counts?.routes!==index.routes.length||manifest.counts?.shards!==index.shards.length)throw Error('Catalogue manifest counts disagree with the index');
if(manifest.counts.relations+manifest.counts.namedPaths!==index.routes.length)throw Error('Catalogue manifest route split does not add up');
if(manifest.counts.points!==index.routes.reduce((n,r)=>n+(r.points||0),0))throw Error('Catalogue manifest point total disagrees with the index');
if(manifest.index?.sha256!==hash(fs.readFileSync(indexPath)))throw Error('Catalogue manifest index hash does not match the shipped index');
const manifestShards=new Map((manifest.shards||[]).map(s=>[s.path.split('/').pop(),s]));
index.shards.forEach((count,i)=>{const name='shard-'+String(i).padStart(3,'0')+'.json';const entry=manifestShards.get(name);
 if(!entry||entry.routes!==count)throw Error('Catalogue manifest is missing shard counts for '+name);
 if(entry.sha256!==hash(fs.readFileSync(path.join(root,'client/src/static/osm/routes',name))))throw Error('Catalogue manifest hash disagrees for '+name);});
if(manifestShards.size!==index.shards.length)throw Error('Catalogue manifest lists unknown geometry shards');
const osmCovers=new Set();const osmShards=new Set();
for(const route of index.routes){
 const key=String(route.id||'').replace(/^osm-/,'');
 if(!/^w?\d+$/.test(key))throw Error('Catalogue index has an unexpected id: '+route.id);
 if(osmCovers.has('static/osm/'+key+'.png'))throw Error('Catalogue index repeats an id: '+route.id);
 osmCovers.add('static/osm/'+key+'.png');
}
// Shards are named by position, so the table is the whole contract: no extra shard may be
// shipped, and the last one must carry exactly the remaining routes.
const shardStart=[];let shardTotal=0;
for(const count of index.shards){if(!Number.isInteger(count)||count<=0)throw Error('Catalogue shard table has a bad count');shardStart.push(shardTotal);shardTotal+=count;}
if(index.routes.length!==shardTotal)throw Error('Catalogue index and shard table disagree: '+index.routes.length+' vs '+shardTotal);
index.shards.forEach((_,i)=>osmShards.add('static/osm/routes/shard-'+String(i).padStart(3,'0')+'.json'));
for(const rel of files){
 if(rel.startsWith('static/research/'))continue;
 const b=fs.readFileSync(path.join(dir,rel)),sha=hash(b);
 if(b.subarray(0,4).equals(Buffer.from([0,5,22,7])))throw Error('AppleDouble payload');
 if(rel.startsWith('static/')){if(rel==='static/osm/index.json'){if(!b.equals(fs.readFileSync(indexPath)))throw Error('Shipped catalogue index differs from the installed one');}
  else if(rel==='static/osm/manifest.json'){if(!b.equals(fs.readFileSync(manifestPath)))throw Error('Shipped catalogue manifest differs from the installed one');}
  else if(!osmCovers.has(rel)&&!osmShards.has(rel)&&approved[rel]!==sha)throw Error('Unapproved static asset: '+rel);}
 else if(target==='mp-weixin'){
  if(!/^(app\.(js|json|wxss)|project\.config\.json|common\/[\w.-]+\.js|core\/(track|shard-codec|osm-catalog|public-routes)\.js|pages\/index\/index\.(js|json|wxml|wxss)|components\/(Icon|TrackMap)\.(js|json|wxml|wxss))$/.test(rel))throw Error('Unknown mini-program output: '+rel);
 }else {
  if(rel!=='index.html'&&!/^assets\/[A-Za-z0-9_.-]+\.(js|css|svg|png|woff2)$/.test(rel))throw Error('Unknown file: '+rel);
  if(inventory[rel]!==sha)throw Error('File not in exact compiler inventory: '+rel);
  // Route coordinates must stay out of the first screen: the whole catalog used to be
  // bundled here as one 28 MB chunk, twice over — once as the index, once as geometry.
  if(/^assets\/.*\.js$/.test(rel)){
   if(b.length>6*1024*1024)throw Error('Chunk too large (geometry bundled again?): '+rel+' '+b.length+' bytes');
   const text=b.toString();
   // Proof rather than a size guess: if the catalogue were inlined, its tail and its route
   // titles would appear verbatim in the bundle.
   if(text.includes(indexText.slice(-200)))throw Error('Catalogue index is bundled into the app: '+rel);
   const markers=[];for(let i=0;i<index.routes.length;i+=Math.max(1,Math.floor(index.routes.length/60)))markers.push(String(index.routes[i].title));
   for(const marker of markers)if(marker.length>=6&&text.includes(marker)&&!index.routes.find(r=>String(r.title)===marker&&r.featured))throw Error('Route data is bundled into the app: '+rel+' contains '+marker);
  }
 }
 if(rel.endsWith('.woff2')&&!Object.values(approved).includes(sha))throw Error('Unknown font bytes: '+rel);
 if(/\.(js|css|json|html|svg|md|txt|wxml|wxss)$/.test(rel)){
  const text=b.toString();
  if(ids.some(id=>text.includes(id))||/static\/research|VIAS_RESEARCH=1|\/Users\/|data\/(?:imports|sixfoot|open-datasets)|collect-datasets|collection-plan|phone-debug|sourcesContent/.test(text))throw Error('Private identifier/path: '+rel);
  if(process.argv.includes('--public')&&/(?:["'=(:])\s*\/(?:static|assets|map)\/[A-Za-z0-9_{]/.test(text))throw Error('Root-path leak: '+rel);
 }
 seen.add(rel);
}
// Every shard must contain exactly the routes its slice of the table claims, so a swapped or
// truncated shard cannot pass as healthy.
let shardKeys=0;
for(let i=0;i<index.shards.length;i++){
 const rel='static/osm/routes/shard-'+String(i).padStart(3,'0')+'.json';
 const file=path.join(dir,rel);
 if(fs.existsSync(file)){
  const data=JSON.parse(fs.readFileSync(file,'utf8'));
  const keys=Object.keys(data);
  if(keys.length!==index.shards[i])throw Error(rel+' has '+keys.length+' routes, expected '+index.shards[i]);
  const want=new Set(index.routes.slice(shardStart[i],shardStart[i]+index.shards[i]).map(r=>String(r.id).replace(/^osm-/,'')));
  for(const key of keys)if(!want.has(key))throw Error(rel+' contains '+key+', which belongs to another shard');
  shardKeys+=keys.length;
 }
}
if(shardKeys!==index.routes.length)throw Error('Shard contents cover '+shardKeys+' of '+index.routes.length+' catalogue routes');
const totalJs=files.filter(n=>/^assets\/.*\.js$/.test(n)).reduce((n,f)=>n+fs.statSync(path.join(dir,f)).size,0);
if(target==='h5'&&totalJs>2*1024*1024)throw Error('First-screen JavaScript budget exceeded: '+totalJs+' bytes');
for(const rel of osmCovers)if(!seen.has(rel))throw Error('Missing generated catalogue thumbnail: '+rel);
for(const rel of osmShards)if(!seen.has(rel))throw Error('Missing generated geometry shard: '+rel);
for(const rel of ['static/osm/index.json','static/osm/manifest.json'])if(!seen.has(rel))throw Error('Missing published catalogue file: '+rel);
for(const rel of [...Object.keys(approved),...Object.keys(inventory||{})])if(!seen.has(rel))throw Error('Missing asset: '+rel);
for(const d of dirs)if(d!=='static/research'&&!files.some(f=>!f.startsWith('static/research/')&&f.startsWith(d+'/')))throw Error('Unknown empty directory: '+d);
for(const rel of files.filter(n=>n.startsWith('static/research/')))fs.unlinkSync(path.join(dir,rel));
if(fs.existsSync(path.join(dir,'static/research')))fs.rmdirSync(path.join(dir,'static/research'));
console.log('PUBLIC_CHECK_OK files='+seen.size+' routes='+index.routes.length+' shards='+index.shards.length+' full='+index.full+' js_bytes='+totalJs);
