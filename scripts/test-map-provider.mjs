// Real Chrome behavior regression. Local preview only; evidence stays gitignored.
import {chromium} from '../client/node_modules/playwright/index.mjs';
import {PNG} from '../client/node_modules/pngjs/lib/png.js';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const out=process.env.MAP_TEST_OUT||'artifacts/map-provider/fix';
fs.mkdirSync(out,{recursive:true});
const url=process.env.MAP_TEST_URL||'http://127.0.0.1:8790/vias/';
const report={started:new Date().toISOString(),cards:[],errors:[],links:[]};
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2});
await context.addInitScript(()=>{
 window.__reads=[];
 for(const proto of [WebGLRenderingContext.prototype,WebGL2RenderingContext.prototype]){
  const orig=proto.readPixels;
  proto.readPixels=function(...args){const t=performance.now(),v=orig.apply(this,args);if(this.canvas.classList.contains('maplibregl-canvas'))window.__reads.push({t,ms:performance.now()-t});return v;};
 }
});
let diagnosticPage;const page=await context.newPage();diagnosticPage=page;page.on('pageerror',e=>report.errors.push(e.message));
const state=()=>page.evaluate(()=>({state:document.querySelector('.map-credit')?.dataset.basemap,evidence:JSON.parse(document.querySelector('.maplibregl-canvas')?.dataset.renderEvidence||'null'),paths:[...document.querySelectorAll('.leaflet-overlay-pane path')].map(p=>p.getAttribute('d')),markers:[...document.querySelectorAll('.track-marker-label')].map(x=>x.textContent),reads:window.__reads.length}));
const ready=()=>page.waitForFunction(()=>document.querySelector('.map-credit')?.dataset.basemap==='ready',null,{timeout:45000});
const failed=()=>page.waitForFunction(()=>document.querySelector('.map-credit')?.dataset.basemap==='failed',null,{timeout:28000});
const shot=name=>page.screenshot({path:`${out}/${name}.png`});
async function drag(from,to,steps=30){await page.mouse.move(from,140);await page.mouse.down();await page.mouse.move(to,140,{steps});await page.mouse.up();}
async function back(){await page.locator('.map-back').click();assert.equal(await page.locator('.interactive-detail .maplibregl-canvas').count(),0);assert.ok(await page.locator('.route-preview-card .maplibregl-canvas').count()<=6);}
try{
 await page.goto(url);await page.locator('.classic-card').first().waitFor();
 assert.equal(await page.locator('.classic-card').count(),4);assert.ok(await page.locator('.route-preview-card .maplibregl-canvas').count()<=6);
 for(const i of [0,1]){
  await page.locator('.classic-card').nth(i).click();await ready();
  const s=await state();assert.equal(s.paths.length,2);assert.equal(s.paths[0],s.paths[1]);assert.notEqual(s.paths[0],'M0 0');assert.deepEqual(s.markers,['起','终']);assert.ok(s.evidence.features>0&&s.evidence.pixelColors>1);
  const png=PNG.sync.read(await page.locator('.maplibregl-canvas').screenshot()),colors=new Set();for(let j=0;j<png.data.length;j+=4)colors.add(png.data.subarray(j,j+4).toString('hex'));s.colors=colors.size;assert.ok(colors.size>50);report.cards.push(s);await shot(`mac-card-${i}`);
  assert.equal(await page.locator('.map-info-content').isVisible(),false,'map explanation starts collapsed');
  await page.getByLabel('地图说明').click();
  assert.equal(await page.locator('.map-info-content').isVisible(),true);
  for(let j=0;j<3;j++){
   const link=page.locator('.map-credit a').nth(j),href=await link.getAttribute('href');
    await link.scrollIntoViewIfNeeded();await link.click({trial:true});
    await page.waitForFunction(el=>{const b=el.getBoundingClientRect();const hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);return hit===el||el.contains(hit);},await link.elementHandle());
   const requestPromise=context.waitForEvent('request',{predicate:r=>r.isNavigationRequest()&&r.url()===href,timeout:10000});
   const popupPromise=context.waitForEvent('page');await link.click();const popup=await popupPromise;
   const request=await requestPromise;assert.equal(request.frame().page(),popup);report.links.push(request.url());await popup.close();
  }
  if(i===0){
   // Actual keyboard activation as well as mouse download; exact complete license text.
   await page.locator('.renderer-license').focus();const pending=page.waitForEvent('download');await page.keyboard.press('Enter');const d=await pending;await d.saveAs(`${out}/downloaded-licenses.txt`);
   assert.equal(fs.readFileSync(`${out}/downloaded-licenses.txt`,'utf8'),fs.readFileSync('docs/MAP-LICENSES.txt','utf8'));
  }
  await page.getByLabel('地图说明').focus();await page.keyboard.press('Enter');
  assert.equal(await page.locator('.map-info-content').isVisible(),false,'keyboard closes map explanation');
  await back();
 }
 // Suspended initial style, bounded fail, then same-instance recovery.
 let release;const gate=new Promise(r=>release=r);await context.route('https://tiles.openfreemap.org/styles/liberty',async route=>{await gate;await route.continue().catch(()=>{});});
 await page.locator('.classic-card').first().click();const t=Date.now();await failed();report.initialTimeout={ms:Date.now()-t,...await state()};assert.notEqual(report.initialTimeout.paths[0],'M0 0');await shot('mac-timeout');release();await context.unroute('https://tiles.openfreemap.org/styles/liberty');await ready();await shot('mac-recovery');
 await page.waitForTimeout(1000);await page.evaluate(()=>window.__reads=[]);const t0=Date.now();
 for(let i=0;i<4;i++){await drag(i%2?245:145,i%2?145:245);await page.waitForTimeout(120);}
 await ready();await page.waitForTimeout(700);report.drag={ms:Date.now()-t0,reads:await page.evaluate(()=>window.__reads)};assert.ok(report.drag.reads.length<=100,`readPixels ${report.drag.reads.length}`);
 const n=await page.evaluate(()=>window.__reads.length);await page.waitForTimeout(1500);assert.equal(await page.evaluate(()=>window.__reads.length),n);
 // Uncached zoom-out + short pan retains the original route visibly in the viewport.
 await context.setOffline(true);await page.mouse.move(195,130);await page.mouse.wheel(0,2000);await page.waitForTimeout(900);await drag(195,155,10);await page.waitForTimeout(1000);
 report.preVisibleFailure=await state();await shot('mac-visible-route-pending');assert.equal((await state()).state,'loading');const tf=Date.now();await failed();report.visibleRouteFailure={waitMs:Date.now()-tf,...await state()};assert.notEqual(report.visibleRouteFailure.paths[0],'M0 0');assert.equal(report.visibleRouteFailure.paths.length,2);await shot('mac-visible-route-failed');
 // Same instance returns to the cached zoom, then unblocks provider. No stale ready.
 await context.setOffline(false);await page.mouse.move(195,130);await page.mouse.wheel(0,-2000);await ready();report.sameInstanceRecovery=await state();await shot('mac-same-instance-recovery');
 // Original reviewer reproduction: pan far to uncached viewport after ready.
 await context.setOffline(true);for(let i=0;i<5;i++){await drag(340,40,10);await page.waitForTimeout(400);}
 await failed();report.farPan=await state();assert.equal(report.farPan.state,'failed');await shot('mac-offline-pan');
 await context.setOffline(false);for(let i=0;i<5;i++){await drag(40,340,10);await page.waitForTimeout(400);}await ready();report.panRecovery=await state();
 await page.evaluate(()=>{const gl=document.querySelector('.maplibregl-canvas').getContext('webgl2');window.__loss=gl.getExtension('WEBGL_lose_context');window.__loss.loseContext();});await failed();report.contextLost=await state();await page.evaluate(()=>window.__loss.restoreContext());await ready();report.contextRestored=await state();
 report.stage='transition-unmount';for(const delay of [0,100,250]){report.transitionDelay=delay;await page.locator('.map-canvas').dblclick({position:{x:230,y:130}});if(delay)await page.waitForTimeout(delay);await back();await page.waitForTimeout(400);await page.locator('.classic-card').nth(delay%2).click();await ready();}
 await page.setViewportSize({width:392,height:846});await back();await page.waitForTimeout(500);
 report.stage='delayed-import';const c2=await browser.newContext(),p2=await c2.newPage();diagnosticPage=p2;p2.on('pageerror',e=>report.errors.push(e.message));
 let releaseImport,seen;const importGate=new Promise(r=>releaseImport=r),importSeen=new Promise(r=>seen=r);
 await c2.route('**/components-vector-basemap.*.js',async route=>{seen();await importGate;await route.continue().catch(()=>{});});
 await p2.goto(url);await p2.locator('.classic-card').first().click();await Promise.race([importSeen,new Promise((_,rej)=>setTimeout(()=>rej(Error('missing import interception')),10000))]);await p2.locator('.map-back').click();releaseImport();await p2.waitForTimeout(1500);assert.equal(await p2.locator('.interactive-detail .maplibregl-canvas').count(),0);assert.ok(await p2.locator('.route-preview-card .maplibregl-canvas').count()<=6);await p2.locator('.classic-card').nth(1).click();await p2.waitForFunction(()=>document.querySelector('.map-credit')?.dataset.basemap==='ready',null,{timeout:45000});assert.equal(await p2.locator('.maplibregl-canvas').count(),1);await c2.close();
 // A single failed tile among successful requests must not poison later viewports.
 report.stage='partial-tile-failure';const c3=await browser.newContext({viewport:{width:390,height:844}}),p3=await c3.newPage();diagnosticPage=p3;p3.on('pageerror',e=>report.errors.push(e.message));
 let aborted=false;
 await c3.route('**/*.pbf',async route=>{if(!aborted&&await p3.locator('.interactive-detail').count()&&route.request().url().includes('/planet/')){aborted=true;await route.abort('failed');}else await route.continue();});
 await p3.goto(url);await p3.locator('.classic-card').first().click();
 await p3.waitForFunction(()=>document.querySelector('.map-credit')?.dataset.basemap==='failed',null,{timeout:28000});assert.ok(aborted,'one vector tile failed');
 report.partialFailure=await p3.evaluate(()=>document.querySelector('.maplibregl-canvas').dataset.renderEvidence);
 report.stage='partial-tile-recovery';await p3.mouse.move(195,130);await p3.mouse.wheel(0,500);
 await p3.waitForFunction(()=>document.querySelector('.map-credit')?.dataset.basemap==='ready',null,{timeout:45000});report.partialRecovery=true;await c3.close();
 assert.deepEqual(report.errors,[]);report.finished=new Date().toISOString();report.pass=true;
}catch(e){report.diagnostic=await diagnosticPage.evaluate(()=>({state:document.querySelector('.map-credit')?.dataset.basemap,evidence:document.querySelector('.maplibregl-canvas')?.dataset.renderEvidence,viewport:document.querySelector('.map-shell')?.dataset.viewport})).catch(()=>null);report.failure=String(e);report.failureState=await state().catch(()=>null);await shot('mac-failure').catch(()=>{});process.exitCode=1;}finally{fs.writeFileSync(`${out}/mac-behavior.json`,JSON.stringify(report,null,2));await context.setOffline(false).catch(()=>{});await browser.close();}
console.log(JSON.stringify({pass:report.pass,failure:report.failure,dragReads:report.drag?.reads.length,initialTimeoutMs:report.initialTimeout?.ms,visibleRouteFailure:report.visibleRouteFailure?.state,farPan:report.farPan?.state,errors:report.errors},null,2));
