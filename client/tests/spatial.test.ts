import {test} from 'node:test';
import assert from 'node:assert/strict';
import {candidates,clusters,limitedRows,validateSpatial,simplify,type SpatialRow} from '../src/core/spatial';
test('bbox intersection keeps a route starting outside and crossing the viewport, including edges',()=>{
 const rows:SpatialRow[]=[['crossing',0,-2,0,2,0],['outside',3,3,4,4,0],['edge',1,1,2,2,0]];
 assert.deepEqual(candidates(rows,[-1,-1,1,1]).map(r=>r[0]),['crossing','edge']);
});
test('full overview clusters and bounded geometry are independent of four pinned routes',()=>{
 const rows:SpatialRow[]=Array.from({length:14430},(_,i)=>[`osm-${i}`,0,i/14430,1,i/14430+0.01,i%94]);
 const bounds:[number,number,number,number]=[-1,-1,2,2];
 const groups=clusters(rows,bounds);assert.equal(groups.reduce((n,g)=>n+g.count,0),14430);assert.ok(groups.length<=49);
 const limited=limitedRows(rows,bounds);assert.ok(limited.length<=12);assert.ok(new Set(limited.map(r=>r[5])).size<=3);
});
test('invalid or wrong-version spatial documents fail closed',()=>{
 const row:SpatialRow=['osm-1',0,0,1,1,0];assert.equal(validateSpatial({version:1,rows:[row]},['osm-1']).length,1);
 for(const doc of [{version:2,rows:[row]},{version:1,rows:[]},{version:1,rows:[['osm-2',0,0,1,1,0]]},{version:1,rows:[['osm-1',2,0,1,1,0]]}])assert.throws(()=>validateSpatial(doc,['osm-1']));
});
test('overview simplification is bounded and preserves each segment endpoints',()=>{
 const s=Array.from({length:10000},(_,i)=>({lat:i/10000,lon:0}));const result=simplify([s,s.slice(0,2)]);assert.ok(result[0].length<=129);assert.equal(result[0][0],s[0]);assert.equal(result[0].at(-1),s.at(-1));assert.equal(result[1].length,2);
});
