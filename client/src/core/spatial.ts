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
 const lat=(bounds[0]+bounds[2])/2,lon=(bounds[1]+bounds[3])/2;
 const sorted=[...rows].sort((a,b)=>Math.hypot((a[1]+a[3])/2-lat,(a[2]+a[4])/2-lon)-Math.hypot((b[1]+b[3])/2-lat,(b[2]+b[4])/2-lon));
 const shards=new Set<number>();return sorted.filter(r=>{if(!shards.has(r[5])&&shards.size>=3)return false;shards.add(r[5]);return true;}).slice(0,12);
}
export function simplify(segments:Point[][]){return segments.map(s=>{const stride=Math.max(1,Math.ceil(s.length/128));return s.filter((_,i)=>i%stride===0||i===s.length-1);});}
