import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spatialSidecar,hash} from './spatial-sidecar.mjs';
const out=new URL('../artifacts/map-first/interactive/generator-fixture/',import.meta.url);fs.mkdirSync(out,{recursive:true});
test('offline bbox derivation includes complete segments, pins source bytes and leaves original files unchanged',()=>{
 const dir=fs.mkdtempSync(path.join(out.pathname,'case-'));fs.mkdirSync(path.join(dir,'routes'));
 const index={source:'synthetic offline crossing fixture',shards:[2],routes:[{id:'osm-1'},{id:'osm-w2'}]};
 const geometry={'1':[[[-2,-4],[2,4]],[[0,-7],[0,9]]],'w2':[[[10,20],[11,21]]]};
 fs.writeFileSync(path.join(dir,'index.json'),JSON.stringify(index));fs.writeFileSync(path.join(dir,'manifest.json'),'original-manifest');fs.writeFileSync(path.join(dir,'routes/shard-000.json'),JSON.stringify(geometry));
 const names=['index.json','manifest.json','routes/shard-000.json'];const before=names.map(n=>fs.readFileSync(path.join(dir,n)));
 const declaration=spatialSidecar(dir,index);const bytes=fs.readFileSync(path.join(dir,'spatial.json'));const doc=JSON.parse(bytes);
 assert.deepEqual(doc.rows,[['osm-1',-2,-7,2,9,0],['osm-w2',10,20,11,21,0]]);assert.equal(declaration.output.sha256,hash(bytes));assert.equal(doc.routesHash,hash(Buffer.from(JSON.stringify(index.routes))));assert.equal(declaration.indexHash,hash(before[0]));assert.equal(declaration.inputs[0].sha256,hash(before[2]));assert.equal(declaration.license,'ODbL 1.0');
 for(let i=0;i<names.length;i++)assert.ok(before[i].equals(fs.readFileSync(path.join(dir,names[i]))));
 const old=fs.readFileSync(path.join(dir,'spatial-manifest.json'));spatialSidecar(dir,index);assert.ok(old.equals(fs.readFileSync(path.join(dir,'spatial-manifest.json'))),'deterministic provenance');
});
