// Browser network fixtures supplement (never replace) real-provider rendering tests.
import {chromium} from '../client/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const url=process.env.MAP_FIRST_URL||'http://127.0.0.1:8791/vias/';const out=process.env.MAP_FIXTURE_OUT||'artifacts/map-first/interactive/fixtures';fs.mkdirSync(out,{recursive:true});
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
const routes=Array.from({length:6},(_,i)=>({id:`osm-w${90001+i}`,title:i===0?'Crossing outside start fixture':`Visible fixture ${i}`,distance:2,ascent:0,descent:0,points:2,start:[39,115],activity:'徒步',place:'测试',featured:false}));
const index={source:'Local synthetic test fixture, not production route data',elevation:false,full:false,scope:'fixture',shards:[6],routes};
const rows=routes.map(r=>[r.id,39,115,41,117,0]);
const spatial={version:1,indexHash:hash(JSON.stringify(index)),routesHash:hash(JSON.stringify(routes)),rows};
const geometry=Object.fromEntries(routes.map((r,i)=>[r.id.slice(4),[[[39,115+i*.001],[41,117+i*.001]]]]));
const report={tests:[],errors:[],aborted:[]};
const browser=await chromium.launch({channel:'chrome',headless:true});
let releaseIndex,releaseGeometry;const indexGate=new Promise(r=>releaseIndex=r),geometryGate=new Promise(r=>releaseGeometry=r);let held=false,firstGeometry=false;
const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
page.on('pageerror',e=>report.errors.push(e.message));page.on('requestfailed',r=>{if(r.url().includes('/static/osm/'))report.aborted.push(r.failure()?.errorText);});
await context.route('**/static/osm/index.json',async r=>{await indexGate;await r.fulfill({json:index});});
await context.route('**/static/osm/manifest.json',r=>r.fulfill({json:{index:{sha256:spatial.indexHash}}}));
await context.route('**/static/osm/spatial.json',r=>r.fulfill({json:spatial}));
await context.route('**/static/osm/routes/shard-000.json',async r=>{if(!held){held=true;firstGeometry=true;await geometryGate;}await r.fulfill({json:geometry}).catch(()=>{});});
try{
 await page.goto(url);await page.locator('.home-mode > *').filter({hasText:'地图'}).click();await page.getByText('范围查询中…').waitFor();assert.equal(await page.locator('.overview-cluster').count(),0);releaseIndex();await page.locator('.overview-cluster button').first().waitFor();report.tests.push('slow real index gate does not query preview shard positions; release adopts fixture index');
 await page.locator('.overview-cluster button').first().click();await page.waitForTimeout(500);await page.locator('.overview-cluster button').first().click();
 for(let i=0;i<100&&!firstGeometry;i++)await page.waitForTimeout(50);assert.ok(firstGeometry,'first bounded geometry request reached the actual network gate');
 const map=page.locator('.home-map-browser .map-canvas'),box=await map.boundingBox();await page.mouse.move(box.x+200,box.y+140);await page.mouse.down();await page.mouse.move(box.x+100,box.y+140,{steps:15});await page.mouse.up();
 await page.locator('.overview-cards > *').filter({hasText:'Crossing outside start fixture'}).waitFor();
 const v=JSON.parse(await page.locator('.home-map-browser .map-shell').getAttribute('data-viewport'));assert.ok(39<v.bounds[0]&&115<v.bounds[1],'fixture start is outside current view');
 assert.equal(await page.locator('.overview-cards > *').count(),6);assert.ok(report.aborted.some(t=>t.includes('ABORTED')),'obsolete geometry request aborted');
 const before=await page.locator('.overview-cards').innerText();releaseGeometry();await page.waitForTimeout(500);assert.equal(await page.locator('.overview-cards').innerText(),before,'late response cannot replace current scope');
 await page.locator('.overview-cards > *').filter({hasText:'Crossing outside start fixture'}).click();await page.screenshot({path:`out/crossing.png`.replace('out/',out+'/')});report.tests.push('crossing route start outside bbox retained among six non-classic routes; stale gated request aborted and cannot overwrite new query');
 // Mismatched spatial/index signature must not quietly produce arbitrary candidates.
 await page.locator('.home-mode > *').filter({hasText:'列表'}).click();await context.unroute('**/static/osm/spatial.json');await context.route('**/static/osm/spatial.json',r=>r.fulfill({json:{...spatial,routesHash:'wrong-release'}}));await page.locator('.home-mode > *').filter({hasText:'地图'}).click();await page.getByText('空间目录与已加载路线索引不匹配').waitFor();assert.equal(await page.locator('.overview-cards > *').count(),0);report.tests.push('same IDs but wrong spatial/index identity rejected visibly');
 await context.unroute('**/static/osm/spatial.json');await context.route('**/static/osm/spatial.json',r=>r.fulfill({json:spatial}));await context.unroute('**/static/osm/routes/shard-000.json');await context.route('**/static/osm/routes/shard-000.json',r=>r.fulfill({status:503,body:'geometry unavailable'}));await page.getByText('重试范围查询').click();await page.locator('.overview-cluster button').first().waitFor();await page.locator('.overview-cluster button').first().click();await page.waitForTimeout(400);await page.locator('.overview-cluster button').first().click();await page.getByText('请求失败（HTTP 503）').waitFor();assert.equal(await page.locator('.overview-cards > *').count(),0);await page.screenshot({path:`${out}/geometry-failure.png`});await context.unroute('**/static/osm/routes/shard-000.json');await context.route('**/static/osm/routes/shard-000.json',r=>r.fulfill({json:geometry}));await page.getByText('重试范围查询').click();await page.locator('.overview-cards > *').filter({hasText:'Crossing outside start fixture'}).waitFor();report.tests.push('geometry HTTP503 clears stale overlays, exposes real error, and retries the same stable viewport');
 await page.locator('.home-mode > *').filter({hasText:'列表'}).click();await page.waitForTimeout(500);assert.equal(await page.locator('.maplibregl-canvas').count(),0);assert.deepEqual(report.errors,[]);report.pass=true;
}catch(e){report.failure=String(e);await page.screenshot({path:`${out}/failure.png`}).catch(()=>{});process.exitCode=1;}finally{releaseIndex();releaseGeometry();fs.writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify(report,null,2));
