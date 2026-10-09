// npm postbuild hook: uni-app copies static assets outside Rollup's bundle hooks.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const target=process.argv[2];
if(!['h5','mp-weixin'].includes(target))throw Error('Expected h5 or mp-weixin');
if(process.env.VIAS_RESEARCH==='1'){console.log('Private local research build; do not publish this output.');process.exit(0);}
const dir=path.join(root,'client/dist/build',target);
if(!fs.existsSync(dir))throw Error('Build output missing');
fs.rmSync(path.join(dir,'static/research'),{recursive:true,force:true});
const privateCatalog=path.join(root,'client/src/core/routes.json');
const ids=fs.existsSync(privateCatalog)?JSON.parse(fs.readFileSync(privateCatalog,'utf8')).map(r=>String(r.id)):[];
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}
for(const file of walk(dir))if(/\.(js|json|html|wxml|wxss|css)$/.test(file)){
 const content=fs.readFileSync(file,'utf8');
 if(ids.some(id=>content.includes(id)))throw Error('Private catalog identifier found in public build: '+path.relative(dir,file));
}
console.log('Public build checked: no private research assets or catalog identifiers.');
