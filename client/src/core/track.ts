import { XMLParser, XMLValidator } from 'fast-xml-parser';
export type Point = {lat:number;lon:number;ele?:number|null;time?:string|null};
export type Route = {id:string;title:string;author:string;activity:string;difficulty:string;place:string;distance:number;duration:number;ascent:number;descent:number;maxEle:number;maxSpeed:number;source:string;sourceUrl?:string;license?:string;licenseUrl?:string;cover?:string;featured?:boolean;pointCount?:number;start?:[number,number];segments:Point[][];waypoints:(Point & {name?:string})[]};
export function validPoint(p:Point){return Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&Math.abs(p.lat)<=90&&Math.abs(p.lon)<=180;}
export function distance(a:Point,b:Point){const r=Math.PI/180;const h=Math.sin((b.lat-a.lat)*r/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin((b.lon-a.lon)*r/2)**2;return 6371008.8*2*Math.asin(Math.sqrt(Math.min(1,h)));}
export function metrics(segments:Point[][]){let meters=0,ascent=0,descent=0,duration=0;const elevations:number[]=[];for(const points of segments){for(let i=0;i<points.length;i++){const p=points[i];if(p.ele!=null&&Number.isFinite(p.ele))elevations.push(p.ele);if(i){const prev=points[i-1];meters+=distance(prev,p);if(prev.ele!=null&&p.ele!=null){const d=p.ele-prev.ele;ascent+=Math.max(0,d);descent+=Math.max(0,-d);}if(prev.time&&p.time){const d=Date.parse(p.time)-Date.parse(prev.time);if(Number.isFinite(d)&&d>0)duration+=d/1000;}}}}return {distance:meters/1000,ascent:Math.round(ascent),descent:Math.round(descent),duration,maxEle:elevations.length?Math.max(...elevations):0};}
const array=(v:any):any[]=>v==null?[]:Array.isArray(v)?v:[v];
const str=(v:any)=>typeof v==='string'||typeof v==='number'?String(v):'';
export function parseGpx(xml:string):Route{
 if(xml.length>8_000_000)throw Error('文件超过 8 MB，请先分割轨迹');
 if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('不支持带外部实体的 XML');
 if(XMLValidator.validate(xml)!==true)throw Error('GPX XML 格式不正确');
 const parsed=new XMLParser({ignoreAttributes:false,attributeNamePrefix:'@',removeNSPrefix:true,parseTagValue:false,processEntities:true}).parse(xml);
 const g=parsed.gpx;if(!g)throw Error('请选择 GPX 格式文件');
 let count=0;
 const point=(v:any):Point=>{const p:Point={lat:Number(v['@lat']),lon:Number(v['@lon'])};if(v['@lat']==null||v['@lon']==null||!validPoint(p))throw Error('轨迹包含无效坐标');if(++count>50000)throw Error('最多支持 50,000 个轨迹点');if(v.ele!=null&&Number.isFinite(Number(v.ele)))p.ele=Number(v.ele);if(v.time&&!Number.isNaN(Date.parse(v.time)))p.time=String(v.time);return p;};
 const segments:Point[][]=array(g.trk).flatMap(t=>array(t.trkseg).map(s=>array(s.trkpt).map(point))).filter(s=>s.length);
 if(!segments.length)for(const r of array(g.rte)){const pts=array(r.rtept).map(point);if(pts.length)segments.push(pts);}
 if(!segments.some(s=>s.length>=2))throw Error('GPX 至少需要两个轨迹点');
 const first=array(g.trk)[0];const summary=g.metadata?.extensions?.track_summary;
 return {id:`local-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,title:(str(g.metadata?.name)||str(first?.name)||'导入的轨迹').slice(0,150),author:str(summary?.author)||'本地导入',activity:'徒步',difficulty:'未评估',place:str(summary?.start_place_name)||'GPX 导入',...metrics(segments),maxSpeed:0,source:'本地导入 GPX',sourceUrl:str(summary?.source_url),segments,waypoints:array(g.wpt).map(w=>({...point(w),name:str(w.name).slice(0,100)}))};
}
export function xmlEscape(s:string){return s.replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]!));}
// Attribution travels with the exported file: ODbL requires the licence (or a URI) to be
// redistributed with the database, and the source relation must stay traceable.
function attribution(r:Route){return [r.source,r.author,r.sourceUrl].filter(Boolean).join(' · ');}
export function exportGpx(r:Route){return `<?xml version="1.0" encoding="UTF-8"?><gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1" creator="Vias"><metadata><name>${xmlEscape(r.title)}</name><desc>${xmlEscape(attribution(r))}</desc><author><name>${xmlEscape(r.author)}</name></author>${r.licenseUrl?`<copyright author="${xmlEscape(r.author)}"><license>${xmlEscape(r.licenseUrl)}</license></copyright>`:''}</metadata>${r.waypoints.map(p=>`<wpt lat="${p.lat}" lon="${p.lon}"><name>${xmlEscape(p.name||'标注点')}</name></wpt>`).join('')}<trk><name>${xmlEscape(r.title)}</name>${r.segments.map(s=>`<trkseg>${s.map(p=>`<trkpt lat="${p.lat}" lon="${p.lon}">${p.ele!=null?`<ele>${p.ele}</ele>`:''}${p.time?`<time>${xmlEscape(p.time)}</time>`:''}</trkpt>`).join('')}</trkseg>`).join('')}</trk></gpx>`;}
export function exportKml(r:Route){return `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2" xmlns:atom="http://www.w3.org/2005/Atom"><Document><name>${xmlEscape(r.title)}</name><atom:author><atom:name>${xmlEscape(r.author)}</atom:name></atom:author>${r.licenseUrl?`<atom:link rel="license" href="${xmlEscape(r.licenseUrl)}"/>`:''}<description>${xmlEscape(attribution(r))}</description>${r.segments.map(s=>`<Placemark><name>${xmlEscape(r.title)}</name><description>${xmlEscape(attribution(r))}</description><LineString><coordinates>${s.map(p=>`${p.lon},${p.lat},${p.ele??0}`).join(' ')}</coordinates></LineString></Placemark>`).join('')}</Document></kml>`;}
export function durationLabel(seconds:number){const s=Math.max(0,Math.floor(seconds));return `${Math.floor(s/3600)}:${String(Math.floor(s/60)%60).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;}
export function makeRoute(title:string,segments:Point[][],source='本地手绘规划'):Route{return {id:`local-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,title,author:'本地用户',activity:'徒步',difficulty:'未评估',place:'本机保存',...metrics(segments),maxSpeed:0,source,segments,waypoints:[]};}
export class Recorder{
 state:'idle'|'recording'|'paused'='idle';segments:Point[][]=[];elapsed=0;private since=0;
 start(now=Date.now()){if(this.state!=='idle')throw Error('记录已开始');this.state='recording';this.since=now;this.elapsed=0;this.segments=[[]];}
 add(p:Point){if(this.state!=='recording'||!validPoint(p))return;const seg=this.segments[this.segments.length-1];const last=seg[seg.length-1];if(last&&p.time&&last.time&&Date.parse(p.time)<=Date.parse(last.time))return;seg.push(p);}
 pause(now=Date.now()){if(this.state!=='recording')return;this.elapsed+=Math.max(0,now-this.since);this.state='paused';}
 resume(now=Date.now()){if(this.state!=='paused')return;this.state='recording';this.since=now;this.segments.push([]);}
 seconds(now=Date.now()){return (this.elapsed+(this.state==='recording'?Math.max(0,now-this.since):0))/1000;}
 reset(){this.state='idle';this.segments=[];this.elapsed=0;this.since=0;}
}
