// Real Chrome/localhost regression for the interactive substage, never a phone test.
import {chromium} from '../client/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const url=process.env.MAP_FIRST_URL||'http://127.0.0.1:8791/vias/';
const out=process.env.MAP_FIRST_OUT||'artifacts/map-first/interactive/browser';fs.mkdirSync(out,{recursive:true});
const report={tests:[],errors:[],requests:[]};
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true});
const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
page.on('request',r=>{if(r.url().includes('/static/osm/routes/'))report.requests.push(r.url());});
const shot=name=>page.screenshot({path:`${out}/${name}.png`});
const view=locator=>locator.getAttribute('data-viewport').then(JSON.parse);
const detail=()=>page.locator('.interactive-detail');
const detailMap=()=>detail().locator('.map-shell');
const home=()=>page.locator('.home-map-browser');
async function state(s){await page.waitForFunction(s=>document.querySelector('.interactive-detail')?.dataset.sheetState===s,s);}
async function dragHandle(dy){const box=await page.locator('.sheet-grip').boundingBox();await page.mouse.move(box.x+box.width/2,box.y+8);await page.mouse.down();await page.mouse.move(box.x+box.width/2,Math.max(5,Math.min(820,box.y+8+dy)),{steps:20});await page.mouse.up();}
async function disclosureChecks(name){
 const scale=detail().locator('.leaflet-control-scale-line');const sv=await view(detailMap());const metric=await scale.evaluate(el=>({text:el.textContent,width:parseFloat(el.style.width)}));const metres=metric.text.includes('km')?parseFloat(metric.text)*1000:parseFloat(metric.text);const mpp=40075016.686*Math.cos(sv.center[0]*Math.PI/180)/(256*2**sv.zoom);assert.ok(Math.abs(metres/metric.width-mpp)/mpp<.02,`${name}: real metric scale ${JSON.stringify({metric,sv,mpp,actual:metres/metric.width})}`);
 const sb=await scale.boundingBox(),mb=await detail().locator('.map-canvas').boundingBox();assert.ok(sb.y>=mb.y&&sb.y+sb.height<=mb.y+mb.height,`${name}: scale not clipped`);
 for(const control of await detail().locator('.offline, .map-info > summary, .map-attribution').all()){const cb=await control.boundingBox();assert.ok(!(sb.x<cb.x+cb.width&&sb.x+sb.width>cb.x&&sb.y<cb.y+cb.height&&sb.y+sb.height>cb.y),`${name}: scale separate from required controls`);}
 const info=detail().locator('.map-info');
 if(await info.getAttribute('open')===null)await page.getByLabel('地图说明',{exact:true}).click();
 const content=info.locator('.map-info-content');await content.waitFor({state:'visible'});
 for(const link of await info.locator('a').all()){
  await link.scrollIntoViewIfNeeded();await link.click({trial:true});
  assert.ok(await link.evaluate(el=>{const b=el.getBoundingClientRect();return b.top>=0&&b.left>=0&&b.bottom<=innerHeight&&b.right<=innerWidth&&[.1,.5,.9].every(x=>[.2,.8].every(y=>{const hit=document.elementFromPoint(b.left+b.width*x,b.top+b.height*y);return hit===el||el.contains(hit);}));}),`${name}: complete link visible and unobscured`);
 }
 for(const link of await info.locator('a[target="_blank"]').all()){
  const href=await link.getAttribute('href'),opened=page.waitForEvent('popup');
  const requested=context.waitForEvent('request',{predicate:r=>r.isNavigationRequest()&&r.url()===href,timeout:10000});
  await link.click();const popup=await opened;assert.equal((await requested).frame().page(),popup);await popup.close();
 }
 const disclosure=content.getByText('当前视口请求发送至第三方 OpenFreeMap（可能经 Cloudflare）',{exact:true});
 await disclosure.scrollIntoViewIfNeeded();assert.ok(await disclosure.evaluate(el=>{const b=el.getBoundingClientRect();return b.top>=0&&b.bottom<=innerHeight&&[.1,.5,.9].every(x=>[.2,.8].every(y=>{const hit=document.elementFromPoint(b.left+b.width*x,b.top+b.height*y);return hit===el||el.contains(hit);}));}),`${name}: third-party disclosure fully visible`);
 const downloadEvent=page.waitForEvent('download');await info.locator('.renderer-license').click();const download=await downloadEvent;
 await download.saveAs(`${out}/${name}-licenses.txt`);assert.equal(fs.readFileSync(`${out}/${name}-licenses.txt`,'utf8'),fs.readFileSync('docs/MAP-LICENSES.txt','utf8'));
 for(const link of await detail().locator('.map-attribution a').all()){
  await link.click({trial:true});assert.ok(await link.evaluate(el=>{const b=el.getBoundingClientRect();return [.1,.5,.9].every(x=>[.2,.8].every(y=>{const hit=document.elementFromPoint(b.left+b.width*x,b.top+b.height*y);return hit===el||el.contains(hit);}));}),`${name}: attribution also unobscured while info is open`);
 }
 await shot(`${name}-info`);await page.getByLabel('地图说明',{exact:true}).focus();await page.keyboard.press('Enter');assert.equal(await content.isVisible(),false);
 for(const target of await detail().locator('.map-attribution a, .map-back, .map-more, .offline, .map-info > summary').all()){
  await target.click({trial:true});assert.ok(await target.evaluate(el=>{const b=el.getBoundingClientRect();return b.top>=0&&b.bottom<=innerHeight&&[.1,.5,.9].every(x=>[.2,.8].every(y=>{const hit=document.elementFromPoint(b.left+b.width*x,b.top+b.height*y);return hit===el||el.contains(hit);}));}),`${name}: attribution/control unobscured`);
 }
}
async function pan(locator,dx){const b=await locator.boundingBox();await page.mouse.move(b.x+b.width/2,b.y+Math.min(130,b.height/2));await page.mouse.down();await page.mouse.move(b.x+b.width/2+dx,b.y+Math.min(130,b.height/2),{steps:15});await page.mouse.up();await page.waitForTimeout(500);}
try{
 await page.goto(url);await page.locator('.classic-card').first().click();await state('half');
 await page.waitForFunction(()=>document.querySelector('.interactive-detail .map-credit')?.dataset.basemap==='ready',null,{timeout:45000});
 const canvas=await detail().locator('.maplibregl-canvas').elementHandle();const initial=await view(detailMap());
 await dragHandle(300);await state('collapsed');await page.waitForTimeout(900);
 const frame=await detail().boundingBox(),box=await detail().locator('.map-canvas').boundingBox();assert.ok(box.height/frame.height>=.70,`actual map fraction ${box.height/frame.height}`);report.mapFraction=box.height/frame.height;
 assert.equal(await canvas.evaluate(e=>e===document.querySelector('.interactive-detail .maplibregl-canvas')),true,'same GL canvas after drag');
 const collapsed=await view(detailMap());assert.equal(collapsed.zoom,initial.zoom);assert.ok(Math.abs(collapsed.center[0]-initial.center[0])<.0001);await shot('mobile-collapsed');
 const beforePan=await view(detailMap());await pan(detail().locator('.map-canvas'),60);const afterPan=await view(detailMap());assert.notDeepEqual(afterPan.center,beforePan.center,'map pan not intercepted by sheet');
 await page.getByLabel('展开详情',{exact:true}).focus();await page.keyboard.press('Enter');await state('expanded');await page.waitForTimeout(600);
 const expanded=await view(detailMap());assert.equal(expanded.zoom,afterPan.zoom);assert.ok(Math.abs(expanded.center[0]-afterPan.center[0])<.0001);assert.equal(await canvas.evaluate(e=>e===document.querySelector('.interactive-detail .maplibregl-canvas')),true);
 await page.locator('.interactive-content').hover();await page.mouse.wheel(0,1000);await page.waitForTimeout(500);await page.locator('.elevation-title').scrollIntoViewIfNeeded();assert.ok(await page.locator('.elevation-title').isVisible());assert.ok(await page.locator('.splits').count());await shot('mobile-expanded');
 for(const label of ['GPX格式','KML格式（轨迹）','KML格式（路径）']){await page.locator('.detail-actions > *').filter({hasText:'导出'}).click();const pending=page.waitForEvent('download');await page.locator('.export-option').filter({hasText:label}).click();const download=await pending;await download.saveAs(`${out}/${download.suggestedFilename()}`);await page.getByLabel('关闭弹窗').click();}
 await page.getByLabel('半屏详情',{exact:true}).click();await state('half');const grip=await page.locator('.sheet-grip').boundingBox();await page.mouse.move(grip.x+50,grip.y+8);await page.mouse.down();await page.mouse.move(grip.x+50,grip.y+70);await page.locator('.sheet-grip').dispatchEvent('pointercancel',{pointerId:1});await page.mouse.up();await state('half');
 await page.setViewportSize({width:844,height:390});await page.waitForTimeout(600);assert.equal(await page.locator('.maplibregl-canvas').count(),1);await shot('landscape');await page.setViewportSize({width:390,height:844});await page.getByLabel('收起详情',{exact:true}).click();await state('collapsed');await dragHandle(-650);await state('expanded');
 await page.getByLabel('地图说明',{exact:true}).click();await page.setViewportSize({width:844,height:390});await page.waitForTimeout(400);await disclosureChecks('rotate-open-expanded');
 for(const viewport of [{width:390,height:844},{width:844,height:390}]){
  await page.setViewportSize(viewport);
  for(const s of ['collapsed','half','expanded']){
   await page.getByLabel(({collapsed:'收起',half:'半屏',expanded:'展开'})[s]+'详情',{exact:true}).click();await state(s);await page.waitForTimeout(350);
   await disclosureChecks(`${viewport.width}-${s}`);
   assert.equal(await canvas.evaluate(e=>e===document.querySelector('.interactive-detail .maplibregl-canvas')),true,'responsive disclosure preserves map instance');
  }
 }
 await page.setViewportSize({width:390,height:844});report.tests.push('all three sheet states in portrait/landscape: full unobscured attribution/controls, disclosure and three source links, complete license download and keyboard close');
 await page.locator('.map-back').click();assert.equal(await page.locator('.interactive-detail .maplibregl-canvas').count(),0);assert.ok(await page.locator('.route-preview-card .maplibregl-canvas').count()<=6);report.tests.push('detail real drag down/up, keyboard/button, actual >=70% map, map pan isolation, same canvas/viewport, scroll/elevation/three exports, cancel/rotate/back');
 await page.locator('.home-mode > *').filter({hasText:'地图'}).click();await home().locator('.overview-cluster button').first().waitFor({timeout:30000});await page.waitForFunction(()=>document.querySelector('.home-map-browser .map-credit')?.dataset.basemap==='ready',null,{timeout:45000});await shot('home-clusters');
 const overview=await view(home().locator(':scope > .map-shell'));assert.equal(overview.zoom,9);
 await home().locator('.overview-cluster button').first().click();await page.waitForTimeout(500);await home().locator('.overview-cluster button').first().click();await home().locator('.overview-cards > *').first().waitFor({timeout:30000});
 assert.ok(await home().locator('.overview-cards > *').count()<=100);await home().locator('.overview-cards > *').first().click();assert.ok(await home().locator('.overview-selected').isVisible());await page.waitForFunction(()=>document.querySelector('.home-map-browser .map-credit')?.dataset.basemap==='ready',null,{timeout:45000});
 for(const size of [{width:390,height:844},{width:844,height:390},{width:390,height:844}]){
  await page.setViewportSize(size);await home().locator('.overview-cards > *').first().waitFor();
  const disclosure=home().locator('.overview-selected summary');if(await disclosure.count())await disclosure.click();
  const candidate=home().locator('.overview-cards > :not(.chosen)').first();await candidate.waitFor();const title=await candidate.innerText();await candidate.click();assert.ok((await home().locator('.overview-selected .route-preview-title').innerText()).includes(title));
  await shot(`candidate-hit-${size.width}`);
 }
 report.tests.push('selected card dynamic stack: another candidate clickable in portrait/landscape with expanded request disclosure');
 const tap=await home().locator(':scope > .map-shell .map-canvas').evaluate(host=>{const b=host.getBoundingClientRect();for(const path of host.querySelectorAll('.leaflet-overlay-pane path')){if(path.getAttribute('stroke')==='#f45b34')continue;for(const fraction of Array.from({length:21},(_,i)=>i/20)){const p=path.getPointAtLength(path.getTotalLength()*fraction),point=new DOMPoint(p.x,p.y).matrixTransform(path.getScreenCTM());if(point.x>b.left+20&&point.x<b.right-20&&point.y>b.top+80&&point.y<b.bottom-80&&document.elementFromPoint(point.x,point.y)===path)return {x:point.x,y:point.y};}}return null;});assert.ok(tap,'unselected route stroke has a visible tap target');
 const oldTitle=await home().locator('.overview-selected').innerText();await page.mouse.click(tap.x,tap.y);await page.waitForTimeout(200);assert.notEqual(await home().locator('.overview-selected').innerText(),oldTitle,'actual geometry tap selects a different route');assert.ok(await home().locator('path[stroke="#f45b34"]').count());await shot('home-selected');
 const selectedText=await home().locator('.overview-selected').innerText(),saved=await view(home().locator(':scope > .map-shell'));const homeCanvas=await home().locator(':scope > .map-shell .maplibregl-canvas').elementHandle();
 await home().locator('.overview-selected .route-preview-open').click();await state('half');await detail().locator('.maplibregl-canvas').waitFor();assert.equal(await home().locator('.maplibregl-canvas').count(),0);assert.equal(await page.locator('.maplibregl-canvas').count(),1);await page.locator('.map-back').click();await home().locator('.overview-cards > *').first().waitFor();assert.equal(await home().locator('.overview-selected').innerText(),selectedText);const restored=await view(home().locator(':scope > .map-shell'));assert.deepEqual(restored.center,saved.center);assert.equal(restored.zoom,saved.zoom);assert.equal(await homeCanvas.evaluate(e=>e.isConnected),false,'hidden big map releases GL; return recreates saved viewport');assert.ok(await page.locator('.maplibregl-canvas').count()<=2);
 const before=await view(home().locator(':scope > .map-shell'));await pan(home().locator(':scope > .map-shell .map-canvas'),-140);const after=await view(home().locator(':scope > .map-shell'));assert.notDeepEqual(before.center,after.center);await home().locator('.overview-status').filter({hasText:/显示|候选/}).waitFor();await page.waitForFunction(()=>document.querySelector('.home-map-browser .map-credit')?.dataset.basemap==='ready',null,{timeout:45000});await shot('second-region');report.tests.push('home all-catalog bbox candidates/clusters -> zoom -> bounded routes -> select/card/detail -> return same canvas/viewport/selection; pan to second region');
 await page.setViewportSize({width:1100,height:900});await page.waitForTimeout(500);await shot('desktop-home');await page.locator('.home-mode > *').filter({hasText:'列表'}).click();assert.equal(await home().locator('.maplibregl-canvas').count(),0);assert.ok(await page.locator('.route-preview-card .maplibregl-canvas').count()<=6);await page.locator('.classic-card').nth(1).click();await page.getByLabel('收起详情',{exact:true}).click();await state('collapsed');await shot('desktop-detail');await page.locator('.map-back').click();
 for(let i=0;i<4;i++){await page.locator('.home-mode > *').filter({hasText:'地图'}).click();await page.waitForTimeout(i*60);await page.locator('.home-mode > *').filter({hasText:'列表'}).click();}await page.waitForTimeout(800);assert.equal(await home().locator('.maplibregl-canvas').count(),0);assert.ok(await page.locator('.route-preview-card .maplibregl-canvas').count()<=6);report.tests.push('desktop screenshots + repeated rapid mode switches remove canvases');
 // HTTP failure is a genuine visible failure, not a zero-candidate success.
 await context.route('**/static/osm/spatial.json',r=>r.fulfill({status:503,body:'failure'}));await page.locator('.home-mode > *').filter({hasText:'地图'}).click();await home().getByText('范围数据 HTTP 503').waitFor();await shot('spatial-failure');await context.unroute('**/static/osm/spatial.json');await home().getByText('重试范围查询').click();await home().locator('.overview-cluster button').first().waitFor();report.tests.push('spatial HTTP503 visible error and user retry');
 assert.deepEqual(report.errors,[]);report.pass=true;
}catch(e){report.failure=String(e);await shot('failure').catch(()=>{});process.exitCode=1;}finally{fs.writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify(report,null,2));
