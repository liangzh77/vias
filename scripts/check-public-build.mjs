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
for(const rel of files){
 if(rel.startsWith('static/research/'))continue;
 const b=fs.readFileSync(path.join(dir,rel)),sha=hash(b);
 if(b.subarray(0,4).equals(Buffer.from([0,5,22,7])))throw Error('AppleDouble payload');
 if(rel.startsWith('static/')){if(approved[rel]!==sha)throw Error('Unapproved static asset: '+rel);}
 else if(target==='mp-weixin'){
  if(!/^(app\.(js|json|wxss)|project\.config\.json|common\/[\w.-]+\.js|core\/track\.js|pages\/index\/index\.(js|json|wxml|wxss)|components\/(Icon|TrackMap)\.(js|json|wxml|wxss))$/.test(rel))throw Error('Unknown mini-program output: '+rel);
 }else {
  if(rel!=='index.html'&&!/^assets\/[A-Za-z0-9_.-]+\.(js|css|svg|png|woff2)$/.test(rel))throw Error('Unknown file: '+rel);
  if(inventory[rel]!==sha)throw Error('File not in exact compiler inventory: '+rel);
 }
 if(rel.endsWith('.woff2')&&!Object.values(approved).includes(sha))throw Error('Unknown font bytes: '+rel);
 if(/\.(js|css|json|html|svg|md|txt|wxml|wxss)$/.test(rel)){
  const text=b.toString();
  if(ids.some(id=>text.includes(id))||/static\/research|VIAS_RESEARCH=1|\/Users\/|data\/(?:imports|sixfoot|open-datasets)|collect-datasets|collection-plan|phone-debug|sourcesContent/.test(text))throw Error('Private identifier/path: '+rel);
  if(process.argv.includes('--public')&&/(?:["'=(:])\s*\/(?:static|assets|map)\/[A-Za-z0-9_{]/.test(text))throw Error('Root-path leak: '+rel);
 }
 seen.add(rel);
}
for(const rel of [...Object.keys(approved),...Object.keys(inventory||{})])if(!seen.has(rel))throw Error('Missing asset: '+rel);
for(const d of dirs)if(d!=='static/research'&&!files.some(f=>!f.startsWith('static/research/')&&f.startsWith(d+'/')))throw Error('Unknown empty directory: '+d);
for(const rel of files.filter(n=>n.startsWith('static/research/')))fs.unlinkSync(path.join(dir,rel));
if(fs.existsSync(path.join(dir,'static/research')))fs.rmdirSync(path.join(dir,'static/research'));
console.log('PUBLIC_CHECK_OK files='+seen.size);
