import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {unpackSegments} from '../src/core/shard-codec';import {simplifyVisible} from '../src/core/spatial';
import {routeZoom,concreteRoutes,geometryIntersects,recommendRows,verifiedRoutes} from '../src/core/map-display';import type {SpatialRow,Bounds} from '../src/core/spatial';
const b:Bounds=[0,0,1,1];const p=(lat:number,lon:number)=>({lat,lon});
test('threshold finite integer default and exact boundary',()=>{for(const v of [undefined,null,'8',NaN,Infinity,7,19,12.5,{},true])assert.equal(routeZoom(v),12);for(const n of [8,12,18]){assert.equal(routeZoom(n),n);assert.equal(concreteRoutes(n-1,n),false);assert.equal(concreteRoutes(n,n),true);}});
test('exact geometry crossing, bbox false positive, tangent, isolated segments',()=>{assert.ok(geometryIntersects([[p(.5,-2),p(.5,3)]],b));assert.ok(geometryIntersects([[p(0,-2),p(0,3)]],b));assert.equal(geometryIntersects([[p(-1,.5),p(.5,2)]],b),false);assert.equal(geometryIntersects([[p(.5,-1)],[p(.5,2)]],b),false);assert.equal(geometryIntersects([],b),false);assert.ok(geometryIntersects([[p(1,1)]],b));});
const rows=(n:number):SpatialRow[]=>Array.from({length:n},(_,i)=>[`osm-w${i}`,0,0,1,1,i%9]);
test('0/1/99/100/101, >3 shards, false positives beyond first batch fill',async()=>{for(const n of [0,1,99,100,101]){const rs=rows(n);const result=await verifiedRoutes(rs,b,async ids=>ids.map(id=>({id,segments:[[p(.5,-1),p(.5,2)]]})),new AbortController().signal);assert.equal(result.routes.length,Math.min(n,100));assert.equal(result.exhausted,n<=100);}let calls=0;const rs=rows(220);const result=await verifiedRoutes(rs,b,async ids=>{calls++;return ids.map(id=>({id,segments:[Number(id.slice(5))<120?[p(-1,.5),p(.5,2)]:[p(.5,-1),p(.5,2)]]}));},new AbortController().signal);assert.equal(result.routes.length,100);assert.ok(calls>5);assert.ok(new Set(result.routes.map(g=>Number(g.id.slice(5))%9)).size>3);});
test('recommendation stable, curated then relation then name, spatial round robin',()=>{const rs:SpatialRow[]=[['osm-w1',0,0,.1,.1,0],['osm-w2',0,0,.1,.1,1],['osm-w3',.9,.9,1,1,2],['osm-4',0,0,1,1,3],['osm-w5',0,0,1,1,4]];const meta=rs.map(r=>({id:r[0],title:'命名路径',featured:r[0]==='osm-w5'}));const ordered=recommendRows(rs,b,meta);assert.deepEqual(ordered.map(r=>r[0]),['osm-w5','osm-4','osm-w1','osm-w3','osm-w2']);assert.deepEqual(recommendRows([...rs].reverse(),b,meta),ordered);assert.equal(recommendRows(rs,b,meta,['osm-w1'])[0][0],'osm-w1');assert.equal(recommendRows(rs,b,meta,[],'osm-w2')[0][0],'osm-w2');const unnamed=meta.map(m=>({...m,title:m.id==='osm-w1'?'':m.title}));assert.equal(recommendRows(rs,b,unnamed).at(-1)?.[0],'osm-w1');});
test('overview stored geometry bounded across huge segment counts',async()=>{const result=await verifiedRoutes(rows(1),b,async ids=>ids.map(id=>({id,segments:Array.from({length:1000},()=>Array.from({length:1000},(_,i)=>p(.5,i/1000)))})),new AbortController().signal);assert.equal(result.routes.length,1);assert.ok(result.routes[0].segments.flat().length<=512);assert.ok(result.routes[0].segments.length<=256);});
test('viewport clipping preserves excursions, closed loops and original gaps within budget',()=>{
 const segments=Array.from({length:140},()=>[p(10,10),p(11,11)]);
 segments.push([p(-2,-2),p(.4,-1),p(.4,2),p(-2,2)]);
 const visible=simplifyVisible(segments,b);assert.equal(visible.length,1);assert.deepEqual(visible[0].map(v=>[v.lat,v.lon]),[[.4,0],[.4,1]]);
 const separated=simplifyVisible([[p(.2,.2),p(.2,2),p(.8,2),p(.8,.8)],[p(.1,.1),p(.1,.3)]],b);assert.equal(separated.length,3);assert.ok(separated.flat().every(v=>v.lat>=0&&v.lat<=1&&v.lon>=0&&v.lon<=1));
 const loop=Array.from({length:1000},(_,i)=>p(.5+.1*Math.sin(i/999*2*Math.PI),.5+.1*Math.cos(i/999*2*Math.PI)));
 const closed=simplifyVisible(Array.from({length:256},()=>loop),b);assert.equal(closed.flat().length,512);assert.ok(closed.every(s=>Math.hypot(s[1].lat-s[0].lat,s[1].lon-s[0].lon)>.1));
});
test('three real fragmented routes at zoom18 retain visible geometry after verification',{skip:!fs.existsSync('src/static/osm/routes/shard-001.json')},async()=>{
 const cases:{id:string;shard:number;bounds:Bounds}[]=[
  {id:'19799028',shard:0,bounds:[39.89297044832231,116.43598616123201,39.895966697397775,116.43807828426363]},
  {id:'14107691',shard:1,bounds:[40.1325905431037,116.33188793848419,40.135461456896294,116.3339800615158]},
  {id:'16560336',shard:1,bounds:[39.83597929735498,116.1208969384842,39.83886270264502,116.12298906151581]}
 ];
 for(const {id,shard,bounds} of cases){const original=unpackSegments(JSON.parse(fs.readFileSync(`src/static/osm/routes/shard-${String(shard).padStart(3,'0')}.json`,'utf8'))[id]);assert.ok(geometryIntersects(original,bounds));
 const result=await verifiedRoutes([[`osm-${id}`,...bounds,shard]],bounds,async()=>[{id:`osm-${id}`,segments:original}],new AbortController().signal);
 assert.equal(result.routes.length,1);const visible=result.routes[0].segments;assert.ok(geometryIntersects(visible,bounds));assert.ok(visible.some(s=>s.some(v=>Math.hypot(v.lat-s[0].lat,v.lon-s[0].lon)>1e-8)));assert.ok(visible.flat().length<=512);}
});
test('missing/failed geometry and cancellation fail honestly',async()=>{await assert.rejects(verifiedRoutes(rows(1),b,async()=>[],new AbortController().signal));const c=new AbortController();c.abort();await assert.rejects(verifiedRoutes(rows(1),b,async()=>[],c.signal));await assert.rejects(verifiedRoutes(rows(1),b,async()=>{throw Error('HTTP failure');},new AbortController().signal));});
