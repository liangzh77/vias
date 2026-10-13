import type {Point} from './track';
import {shardMap,shardOf} from './shard-codec';
export type Bounds=[number,number,number,number]; // south west north east
export type SpatialRow=[string,number,number,number,number,number];
export function intersects(a:Bounds,b:Bounds){return a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];}
export function validateSpatial(raw:unknown,ids:string[],counts?:number[]):SpatialRow[]{
 const table=counts?shardMap(counts):null;
 const doc=raw as {version:number;rows:SpatialRow[]};
 if(doc?.version!==1||!Array.isArray(doc.rows)||doc.rows.length!==ids.length)throw Error('空间目录版本不匹配');
 return doc.rows.map((r,i)=>{if(!Array.isArray(r)||r.length!==6||r[0]!==ids[i]||!r.slice(1).every(Number.isFinite)||r[1]<-90||r[3]>90||r[2]<-180||r[4]>180||r[1]>r[3]||r[2]>r[4]||!Number.isInteger(r[5])||r[5]<0||(table&&r[5]!==shardOf(table,i)))throw Error('空间目录格式错误');return r;});
}
export function candidates(rows:SpatialRow[],bounds:Bounds){return rows.filter(r=>intersects([r[1],r[2],r[3],r[4]],bounds));}
export function clusters(rows:SpatialRow[],bounds:Bounds){
 const groups=new Map<string,{lat:number;lon:number;count:number}>();
 const dy=Math.max(.000001,(bounds[2]-bounds[0])/6),dx=Math.max(.000001,(bounds[3]-bounds[1])/6);
 for(const r of rows){const lat=Math.max(bounds[0],Math.min(bounds[2],(r[1]+r[3])/2)),lon=Math.max(bounds[1],Math.min(bounds[3],(r[2]+r[4])/2));const key=`${Math.floor((lat-bounds[0])/dy)}:${Math.floor((lon-bounds[1])/dx)}`;const g=groups.get(key);if(g){g.lat+=lat;g.lon+=lon;g.count++;}else groups.set(key,{lat,lon,count:1});}
 return [...groups.values()].map(g=>({lat:g.lat/g.count,lon:g.lon/g.count,count:g.count}));
}
export function limitedRows(rows:SpatialRow[],bounds:Bounds){
 return candidates(rows,bounds).sort((a,b)=>a[0].localeCompare(b[0])).slice(0,100);
}
// Generic overview only: <=256 separate segments, <=512 points; never join segment gaps.
// Home overview must first clip to its viewport (below); cards/details keep originals.
export function simplify(segments:Point[][]){const kept=segments.filter(s=>s.length>=2).slice(0,256);const budget=Math.min(128,Math.max(2,Math.floor(512/Math.max(1,kept.length))));return kept.map(s=>{if(s.length<=budget)return s;return Array.from({length:budget},(_,i)=>s[Math.round(i*(s.length-1)/(budget-1))]);});}
// Clip original line edges before assigning the overview budget. Every retained point
// lies in the convex viewport, so sampling cannot discard the entire visible excursion.
// Exit/re-entry and original segment boundaries remain separate (no fabricated bridges).
export function simplifyVisible(segments:Point[][],b:Bounds):Point[][]{
 const same=(a:Point,c:Point)=>Math.abs(a.lat-c.lat)<1e-12&&Math.abs(a.lon-c.lon)<1e-12;
 const length=(s:Point[])=>s.reduce((n,p,i)=>i?n+Math.hypot(p.lat-s[i-1].lat,p.lon-s[i-1].lon):n,0);
 let kept:{points:Point[];length:number;order:number}[]=[];let order=0;
 const retain=(points:Point[])=>{if(points.length<2)return;kept.push({points,length:length(points),order:order++});if(kept.length>256){kept.sort((a,c)=>c.length-a.length||a.order-c.order);kept.length=256;}};
 for(const s of segments){let chain:Point[]=[];
  for(let i=1;i<s.length;i++){
   const a=s[i-1],c=s[i],dx=c.lon-a.lon,dy=c.lat-a.lat;let lo=0,hi=1;
   const ps=[-dx,dx,-dy,dy],qs=[a.lon-b[1],b[3]-a.lon,a.lat-b[0],b[2]-a.lat];let hit=true;
   for(let k=0;k<4;k++){if(ps[k]===0){if(qs[k]<0){hit=false;break;}}else{const t=qs[k]/ps[k];if(ps[k]<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);if(lo>hi){hit=false;break;}}}
   if(!hit){retain(chain);chain=[];continue;}
   const at=(t:number):Point=>({...a,lat:Math.max(b[0],Math.min(b[2],a.lat+t*dy)),lon:Math.max(b[1],Math.min(b[3],a.lon+t*dx))});
   const start=at(lo),end=at(hi);
   if(chain.length&&!same(chain[chain.length-1],start)){retain(chain);chain=[];}
   if(!chain.length)chain.push(start);chain.push(end);
   if(hi<1){retain(chain);chain=[];}
  }
  retain(chain);
 }
 // If fragmented beyond budget, retain the longest visible pieces, with stable ties.
 // For closed visible loops preserve an interior point: two equal endpoints vanish.
 kept.sort((a,c)=>a.order-c.order);
 const budget=Math.min(128,Math.max(2,Math.floor(512/Math.max(1,kept.length))));
 return kept.map(({points:s})=>{if(s.length<=budget)return s;const out=Array.from({length:budget},(_,i)=>s[Math.round(i*(s.length-1)/(budget-1))]);if(out.every(p=>same(p,out[0]))){const far=s.reduce((best,p)=>Math.hypot(p.lat-s[0].lat,p.lon-s[0].lon)>Math.hypot(best.lat-s[0].lat,best.lon-s[0].lon)?p:best,s[0]);out[Math.floor(budget/2)]=far;}return out;});
}
