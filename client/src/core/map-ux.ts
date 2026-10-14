import {distance,type Point} from './track';
export const SCALE_VALUES=[100,200,500,1000,2000,5000,10000,20000] as const;
export function scaleThreshold(v:unknown){return typeof v==='number'&&SCALE_VALUES.includes(v as any)?v:2000;}
export function scalePreference(stored:unknown,oldZoom:unknown){return {threshold:scaleThreshold(stored),legacyZoom:stored===null&&typeof oldZoom==='number'&&Number.isInteger(oldZoom)&&oldZoom>=8&&oldZoom<=18?oldZoom:undefined};}
// Matches Leaflet Control.Scale._getRoundNum, not a whole-screen distance.
export function roundedScale(m:number){if(!Number.isFinite(m)||m<=0)return 0;const p=10**(String(Math.floor(m)).length-1),n=m/p;return p*(n>=10?10:n>=5?5:n>=3?3:n>=2?2:1);}
export function scaleLabel(m:number){return m>=1000?`${m/1000} km`:`${m} m`;}
export type ScreenPoint={x:number;y:number};
export function segmentDistance(p:ScreenPoint,a:ScreenPoint,b:ScreenPoint){const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);}
export function nearestRoute(p:ScreenPoint,routes:{id:string;segments:Point[][]}[],project:(p:Point)=>ScreenPoint,tolerance=16){let best='',min=Infinity;for(const r of routes)for(const s of r.segments)for(let i=1;i<s.length;i++){const d=segmentDistance(p,project(s[i-1]),project(s[i]));if(d<=tolerance&&(d<min-1e-7||Math.abs(d-min)<=1e-7&&(!best||r.id<best))){min=d;best=r.id;}}return best;}
export type Fix={point:Point;accuracy:number;timestamp:number};
export function validFix(f:Fix,now=Date.now()){return Number.isFinite(f.point.lat)&&Math.abs(f.point.lat)<=90&&Number.isFinite(f.point.lon)&&Math.abs(f.point.lon)<=180&&Number.isFinite(f.accuracy)&&f.accuracy>=0&&f.accuracy<=50&&Number.isFinite(f.timestamp)&&now-f.timestamp>=-1000&&now-f.timestamp<=15000;}
export function firstPoint(segments:Point[][]){return segments.flat().find(p=>Number.isFinite(p.lat)&&Math.abs(p.lat)<=90&&Number.isFinite(p.lon)&&Math.abs(p.lon)<=180);}
export function navigationDecision(f:Fix,start:Point,now=Date.now()){if(!validFix(f,now))return {kind:'invalid' as const,meters:NaN};const meters=distance(f.point,start);return {kind:Math.abs(meters-200)<=f.accuracy?'uncertain' as const:meters<=200?'near' as const:'far' as const,meters};}
export function destinationUri(p:Point,apple=false){return apple?`https://maps.apple.com/?daddr=${p.lat},${p.lon}`:`geo:${p.lat},${p.lon}?q=${p.lat},${p.lon}`;}
// Shortest distance on the sphere to each actual great-circle segment, including endpoints.
export function distanceToSegments(p:Point,segments:Point[][]){let min=Infinity;const rad=Math.PI/180,R=6371008.8;const bearing=(a:Point,b:Point)=>{const d=(b.lon-a.lon)*rad;return Math.atan2(Math.sin(d)*Math.cos(b.lat*rad),Math.cos(a.lat*rad)*Math.sin(b.lat*rad)-Math.sin(a.lat*rad)*Math.cos(b.lat*rad)*Math.cos(d));};for(const s of segments)for(let i=1;i<s.length;i++){const a=s[i-1],b=s[i],length=distance(a,b),from=distance(a,p)/R,angle=bearing(a,p)-bearing(a,b),along=Math.atan2(Math.sin(from)*Math.cos(angle),Math.cos(from))*R;const cross=Math.abs(Math.asin(Math.max(-1,Math.min(1,Math.sin(from)*Math.sin(angle))))*R);min=Math.min(min,length>0&&along>=0&&along<=length?cross:Math.min(distance(a,p),distance(b,p)));}return min;}
export class DeviationMonitor{
 count=0;since=0;active=false;lastAlert=-Infinity;lastFix=-Infinity;
 reset(){this.count=0;this.since=0;this.active=false;this.lastFix=-Infinity;}
 update(f:Fix,segments:Point[][],now=Date.now(),foreground=true){if(!foreground||!validFix(f,now)){this.reset();return {active:false,alert:false};}if(f.timestamp<=this.lastFix)return {active:this.active,alert:false};const d=distanceToSegments(f.point,segments);if(!Number.isFinite(d)){this.reset();return {active:false,alert:false};}this.lastFix=f.timestamp;if(d<40){this.reset();return {active:false,alert:false};}if(d>60){if(!this.count)this.since=f.timestamp;this.count++;if(this.count>=3&&f.timestamp-this.since>=15000){this.active=true;if(now-this.lastAlert>=30000){this.lastAlert=now;return {active:true,alert:true};}}}else{this.count=0;this.since=0;}return {active:this.active,alert:false};}
}
export function localDeletion<T extends {id:string}>(id:string,routes:T[],favorites:string[],history:string[],notes:Record<string,string>){if(!id.startsWith('local-')||!routes.some(r=>r.id===id))return null;const nextNotes={...notes};delete nextNotes[id];return {routes:routes.filter(r=>r.id!==id),favorites:favorites.filter(x=>x!==id),history:history.filter(x=>x!==id),notes:nextNotes};}
