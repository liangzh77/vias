import type {Point} from './track';
import {simplifyVisible,type Bounds,type SpatialRow} from './spatial';
export const DEFAULT_ROUTE_ZOOM=12;
export function routeZoom(value:unknown):number{return typeof value==='number'&&Number.isInteger(value)&&value>=8&&value<=18?value:DEFAULT_ROUTE_ZOOM;}
export function concreteRoutes(zoom:number,threshold:unknown){return zoom>=routeZoom(threshold);}
// Liang–Barsky clipping, inclusive edges. Never connect distinct segments.
export function geometryIntersects(segments:Point[][],b:Bounds):boolean{
 const inside=(p:Point)=>p.lat>=b[0]&&p.lat<=b[2]&&p.lon>=b[1]&&p.lon<=b[3];
 for(const s of segments){for(let i=0;i<s.length;i++){if(inside(s[i]))return true;if(!i)continue;const a=s[i-1],c=s[i];const dx=c.lon-a.lon,dy=c.lat-a.lat;let lo=0,hi=1;const ps=[-dx,dx,-dy,dy],qs=[a.lon-b[1],b[3]-a.lon,a.lat-b[0],b[2]-a.lat];let hit=true;for(let k=0;k<4;k++){if(ps[k]===0){if(qs[k]<0){hit=false;break;}}else{const t=qs[k]/ps[k];if(ps[k]<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);if(lo>hi){hit=false;break;}}}if(hit)return true;}}
 return false;
}
export type RecommendMeta={id:string;title:string;featured?:boolean};
// Lexicographic priority: curated, relation, named. Coverage is bbox overlap / viewport
// (not visible track length). Round-robin 4x4 cells within each priority tier.
export function recommendRows(rows:SpatialRow[],bounds:Bounds,meta:readonly RecommendMeta[],classics:readonly string[]=[],selected=''):SpatialRow[]{
 const byId=new Map(meta.map(m=>[m.id,m]));const pinned=new Set(classics);
 const dy=Math.max(1e-9,bounds[2]-bounds[0]),dx=Math.max(1e-9,bounds[3]-bounds[1]);
 const score=(r:SpatialRow)=>{const m=byId.get(r[0]);return (pinned.has(r[0])||m?.featured?4:0)+(!r[0].startsWith('osm-w')?2:0)+(m?.title.trim()?1:0);};
 const coverage=(r:SpatialRow)=>Math.max(0,Math.min(r[3],bounds[2])-Math.max(r[1],bounds[0]))/dy*Math.max(0,Math.min(r[4],bounds[3])-Math.max(r[2],bounds[1]))/dx;
 const cell=(r:SpatialRow)=>`${Math.max(0,Math.min(3,Math.floor(((r[1]+r[3])/2-bounds[0])/dy*4)))}:${Math.max(0,Math.min(3,Math.floor(((r[2]+r[4])/2-bounds[1])/dx*4)))}`;
 const unique=[...new Map(rows.map(r=>[r[0],r])).values()];const out:SpatialRow[]=[];
 for(const tier of [...new Set(unique.map(score))].sort((a,b)=>b-a)){
  const cells=new Map<string,SpatialRow[]>();for(const r of unique.filter(r=>score(r)===tier)){const key=cell(r);const g=cells.get(key)||[];g.push(r);cells.set(key,g);}
  const groups=[...cells.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([,g])=>g.sort((a,b)=>Number(b[0]===selected)-Number(a[0]===selected)||coverage(b)-coverage(a)||a[0].localeCompare(b[0])));
  while(groups.some(g=>g.length))for(const g of groups){const r=g.shift();if(r)out.push(r);}
 }
 // Keep one reasonable previously chosen candidate stable; still verified below.
 const at=out.findIndex(r=>r[0]===selected);if(at>0)out.unshift(...out.splice(at,1));
 return out;
}
export async function verifiedRoutes(rows:SpatialRow[],bounds:Bounds,load:(ids:string[])=>Promise<{id:string;segments:Point[][]}[]>,signal:AbortSignal,limit=100){
 const found:{id:string;segments:Point[][]}[]=[];let checked=0;
 for(let i=0;i<rows.length&&found.length<limit;i+=24){if(signal.aborted)throw Error('范围查询已取消');const batch=rows.slice(i,i+24);const geometries=await load(batch.map(r=>r[0]));if(signal.aborted)throw Error('范围查询已取消');const byId=new Map(geometries.map(g=>[g.id,g]));for(const r of batch){const g=byId.get(r[0]);if(!g)throw Error('范围几何缺失');checked++;if(geometryIntersects(g.segments,bounds))found.push({id:g.id,segments:simplifyVisible(g.segments,bounds)});if(found.length===limit)break;}await new Promise(resolve=>setTimeout(resolve,0));}
 return {routes:found,checked,exhausted:checked===rows.length};
}
