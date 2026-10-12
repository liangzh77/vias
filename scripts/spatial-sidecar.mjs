// Offline derived bbox metadata only: no network or basemap collection.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
export const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
export function spatialSidecar(dir,index){
 const rows=[];const inputs=[];let position=0;
 for(let i=0;i<index.shards.length;i++){
  const name=`shard-${String(i).padStart(3,'0')}.json`,bytes=fs.readFileSync(path.join(dir,'routes',name));inputs.push({path:`static/osm/routes/${name}`,sha256:hash(bytes)});
  const data=JSON.parse(bytes);for(const entry of index.routes.slice(position,position+index.shards[i])){
   const segments=data[entry.id.slice(4)];if(!segments?.length)throw Error('Missing geometry '+entry.id);
   let south=90,west=180,north=-90,east=-180;
   for(const segment of segments)for(const p of segment){if(!Number.isFinite(p[0])||!Number.isFinite(p[1]))throw Error('Invalid geometry');south=Math.min(south,p[0]);north=Math.max(north,p[0]);west=Math.min(west,p[1]);east=Math.max(east,p[1]);}
   rows.push([entry.id,south,west,north,east,i]);
  }position+=index.shards[i];
 }
 const indexHash=hash(fs.readFileSync(path.join(dir,'index.json')));
 const bytes=Buffer.from(JSON.stringify({version:1,indexHash,routesHash:hash(Buffer.from(JSON.stringify(index.routes))),rows})+'\n');
 fs.writeFileSync(path.join(dir,'spatial.json'),bytes);
 const provenance={version:1,algorithm:'segment-bbox-v1',license:'ODbL 1.0',attribution:'© OpenStreetMap contributors',source:index.source,indexHash,inputs,output:{path:'static/osm/spatial.json',sha256:hash(bytes)},routes:rows.length};
 fs.writeFileSync(path.join(dir,'spatial-manifest.json'),JSON.stringify(provenance,null,2)+'\n');
 return provenance;
}
