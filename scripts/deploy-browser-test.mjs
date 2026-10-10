import {chromium} from '../client/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';import fs from 'node:fs';
const base=process.env.PREVIEW_URL||'http://127.0.0.1:8787/vias/';const origin=new URL(base).origin;
const out=process.env.REPORT_DIR||'artifacts/deploy-check-run/browser';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const context=await browser.newContext({viewport:{width:384,height:783},acceptDownloads:true});
const page=await context.newPage();const errors=[],bad=[],requests=[],tiles=[],shards=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('request',r=>{const u=new URL(r.url());if(u.origin===origin){requests.push(u.pathname);if(!u.pathname.startsWith('/vias/'))bad.push('out-of-prefix '+r.url());if(/\/static\/osm\/routes\/shard-\d{3}\.json$/.test(u.pathname))shards.push(u.pathname);}if(u.hostname==='tile.openstreetmap.org')tiles.push(r.url());});
page.on('response',r=>{if(new URL(r.url()).origin===origin&&r.status()>=400)bad.push('HTTP '+r.status()+' '+r.url());});
page.on('requestfailed',r=>{if(new URL(r.url()).origin===origin)bad.push('failed '+r.url());});
await page.route('https://tile.openstreetmap.org/**',r=>r.fulfill({status:503,body:'Offline test'}));
const button=text=>page.locator('uni-button').filter({hasText:text}).last();
try{
 await page.goto(base);await page.waitForSelector('.home-head');await page.evaluate(()=>document.fonts.ready);
 await page.screenshot({path:out+'/01-home.png'});
 await page.locator('.home-entries uni-button').first().click();assert.equal(await page.locator('.route-card').count(),12,'精选 tab = 10 条 OSM 关系 + 2 条合成示例');
 await page.getByText('全部',{exact:true}).first().click();await page.waitForTimeout(700);
 assert.equal(await page.locator('.route-row').count(),40,'“全部”首屏分页 40 条');
 await page.getByText(/加载更多/).first().click();await page.waitForTimeout(500);
 assert.equal(await page.locator('.route-row').count(),80,'加载更多后 80 条');
 // The whole point of the shard split: browsing thousands of routes must not pull geometry.
 assert.deepEqual(shards,[],'浏览目录、加载更多时不得请求轨迹分片');
 await page.waitForTimeout(1000);
 assert.deepEqual(shards,[],'目录浏览后仍不得请求轨迹分片');
 await page.getByText('精选',{exact:true}).first().click();await page.waitForTimeout(500);
 assert.match(await page.locator('.route-card').first().innerText(),/西山三峰路线/);
 assert.match(await page.locator('.route-card').first().innerText(),/OpenStreetMap 贡献者/);
 // OpenStreetMap route: ODbL/SRTM attribution, honest time stats, offline tile fallback with vectors kept.
 await page.locator('.route-card').first().click();await page.waitForSelector('.source-card');
 assert.equal(shards.length,1,'打开第一条路线恰好多取一个分片');
 assert.match(shards[0],/shard-000\.json$/,'首条精选路线应落在 000 分片');
 assert.match(await page.locator('.source-card').innerText(),/ODbL 1\.0/);
 assert.match(await page.locator('.source-card').innerText(),/terrarium/);
 assert.match(await page.locator('.stats-grid').innerText(),/用时未记录/);
 await page.waitForFunction(()=>document.querySelector('.map-credit')?.textContent.includes('加载失败'));
 assert.ok(await page.locator('.leaflet-overlay-pane path').count()>0);assert.ok(tiles.length>0);
 await page.screenshot({path:out+'/02-detail-osm-offline.png'});
 // A KML/GPX export without the ODbL licence and source relation is a real redistribution defect.
 await page.locator('.detail-actions uni-button').nth(3).click();
 const [osmGpx]=await Promise.all([page.waitForEvent('download'),page.locator('.export-option').first().click()]);
 assert.equal(osmGpx.suggestedFilename(),'osm-16205150.gpx');
 const osmGpxText=fs.readFileSync(await osmGpx.path(),'utf8');
 assert.match(osmGpxText,/<license>https:\/\/opendatacommons\.org\/licenses\/odbl\/1-0\/<\/license>/);
 assert.ok(osmGpxText.includes('ODbL 1.0'));
 assert.ok(osmGpxText.includes('https://www.openstreetmap.org/relation/16205150'));
 assert.ok(osmGpxText.includes('<ele>'));
 await page.locator('.sheet-head uni-button').click();
 await page.locator('.detail-actions uni-button').nth(3).click();
 const [osmKml]=await Promise.all([page.waitForEvent('download'),page.locator('.export-option').nth(1).click()]);
 assert.equal(osmKml.suggestedFilename(),'osm-16205150.kml');
 const osmKmlText=fs.readFileSync(await osmKml.path(),'utf8');
 assert.match(osmKmlText,/<atom:link rel="license" href="https:\/\/opendatacommons\.org\/licenses\/odbl\/1-0\/"\/>/);
 assert.ok(osmKmlText.includes('ODbL 1.0'));
 assert.ok(osmKmlText.includes('https://www.openstreetmap.org/relation/16205150'));
 assert.ok(osmKmlText.includes('<coordinates>'));
 fs.writeFileSync(out+'/osm-export.gpx',osmGpxText);fs.writeFileSync(out+'/osm-export.kml',osmKmlText);
 await page.locator('.sheet-head uni-button').click();
 await page.getByLabel('返回',{exact:true}).click();
 // Regression guard: repeatedly opening a route and the export sheet while a Leaflet zoom
 // transition was still in flight used to throw
 // "Cannot read properties of undefined (reading '_leaflet_pos')" (visible in errors[] below).
 for(const name of ['玉皇山登山步道','环二环绿道','玉皇山登山步道']){
  await page.locator('.route-card').filter({hasText:name}).first().click();
  await page.locator('.detail-actions uni-button').nth(3).click();
  await page.locator('.sheet-head uni-button').click();
  await page.getByLabel('返回',{exact:true}).click();
 }
 assert.ok(!errors.some(e=>e.includes('_leaflet_pos')),'Leaflet pane transition errors: '+JSON.stringify(errors));
 assert.equal(shards.length,new Set(shards).size,'同一个分片只能下载一次');
 // The synthetic example keeps the waypoint markers used by the remaining checks.
 const demo=page.locator('.route-card').filter({hasText:'合成示例环线'});
 assert.match(await demo.innerText(),/合成示例/);
 await demo.click();await page.waitForSelector('.track-marker-label');
 assert.match(await page.locator('.source-card').innerText(),/非真实道路/);
 await page.waitForFunction(()=>document.querySelector('.map-credit')?.textContent.includes('加载失败'));
 assert.ok(await page.locator('.leaflet-overlay-pane path').count()>0);assert.ok(tiles.length>0);
 await page.locator('.detail-actions uni-button').first().click();assert.match(await page.locator('.detail-actions').innerText(),/已收藏/);
 await page.screenshot({path:out+'/02-detail-offline.png'});
 await page.locator('.detail-actions uni-button').nth(3).click();
 const [download]=await Promise.all([page.waitForEvent('download'),page.locator('.export-option').first().click()]);
 assert.equal(download.suggestedFilename(),'demo-loop.gpx');await download.saveAs(out+'/synthetic-export.gpx');
 assert.match(fs.readFileSync(out+'/synthetic-export.gpx','utf8'),/<trkpt/);
 await page.getByLabel('关闭弹窗').click();await page.getByLabel('返回',{exact:true}).click();await page.getByLabel('返回',{exact:true}).click();
 await page.locator('.bottom-tabs uni-button').last().click();await button('轨迹库').click();
 const [chooser]=await Promise.all([page.waitForEvent('filechooser'),page.getByLabel('导入轨迹',{exact:true}).click()]);
 await chooser.setFiles({name:'synthetic.gpx',mimeType:'application/gpx+xml',buffer:Buffer.from('<gpx version="1.1"><trk><name>Phase A 自造轨迹</name><trkseg><trkpt lat="35" lon="110"><ele>10</ele></trkpt><trkpt lat="35.001" lon="110.001"><ele>12</ele></trkpt></trkseg></trk></gpx>')});
 await page.waitForSelector('.detail-panel');assert.equal(await page.locator('.detail-title').innerText(),'Phase A 自造轨迹');
 await page.reload();await page.waitForSelector('.home-head');await page.locator('.bottom-tabs uni-button').last().click();await button('轨迹库').click();assert.equal(await page.locator('.route-row').count(),1);
 await page.screenshot({path:out+'/03-imported.png'});
 await page.evaluate(()=>document.fonts.ready);
 const fonts=await page.evaluate(()=>[...document.fonts].map(f=>({family:f.family,status:f.status})));
 assert.ok(fonts.filter(f=>f.family.startsWith('Vias')).every(f=>f.status==='loaded'));
 assert.ok(requests.some(r=>r.endsWith('.woff2')));
 assert.ok(requests.some(r=>r.includes('route-demo-loop.png')));
 assert.ok(requests.some(r=>r.includes('static/osm/16205150.png')));
 // Loading state: hold a shard request open and check the detail page says what it is doing
 // instead of showing an empty map. Fresh load, so nothing is cached client-side.
 const slow=/\/static\/osm\/routes\/shard-\d{3}\.json$/;
 await page.goto(base);await page.waitForSelector('.home-head');await page.evaluate(()=>document.fonts.ready);
 await page.route(slow,async route=>{await new Promise(resolve=>setTimeout(resolve,1500));await route.continue();});
 await page.locator('.home-entries uni-button').first().click();
 await page.getByText('全部',{exact:true}).first().click();await page.waitForTimeout(600);
 await page.getByText(/加载更多/).first().click();await page.waitForTimeout(600);
 const beforePending=shards.length;
 await page.locator('.route-row').nth(75).click();
 await page.waitForSelector('.map-pending');
 assert.match(await page.locator('.map-pending').innerText(),/轨迹数据按需加载中/,'未就绪时应提示按需加载');
 assert.ok(await page.locator('.detail-actions').isVisible(),'加载中仍需保留操作栏');
 // Give the first paint a moment: a screenshot at frame 0 catches icons before the inline
 // SVG data URIs have been painted, which is not what a user sees.
 await page.waitForTimeout(300);
 assert.equal(await page.locator('.map-pending').count(),1,'300ms 后分片仍未到，占位应保持');
 await page.screenshot({path:out+'/02c-detail-loading.png'});
 await page.waitForFunction(()=>!document.querySelector('.map-pending'),null,{timeout:20000});
 assert.equal(shards.length,beforePending+1,'加载完成后只多一个分片请求');
 assert.ok(await page.locator('.leaflet-overlay-pane path').count()>0,'按需加载完成后应立即绘制轨迹');
 await page.screenshot({path:out+'/02d-detail-loaded.png'});
 await page.unroute(slow);
 await page.getByLabel('返回',{exact:true}).click();await page.waitForTimeout(300);
 assert.deepEqual(errors,[]);assert.deepEqual(bad,[]);
 fs.writeFileSync(out+'/report.json',JSON.stringify({status:'passed',base,errors,bad,requests,fonts,tiles,shards,checks:['home/routes/detail','OSM catalog first','ODbL/SRTM attribution','GPX and KML exports keep licence, author and source','honest unrecorded time stats','synthetic labels','favorite','GPX export/import/persistence','fonts and images','same-origin prefix','OSM failure vector fallback','geometry fetched per route on demand','no shard request while browsing the catalog','one shard download per shard','explicit pending state while a shard loads']},null,2));
 console.log('BROWSER_OK '+out);
}catch(e){await page.screenshot({path:out+'/failure.png'});fs.writeFileSync(out+'/report.json',JSON.stringify({status:'failed',error:String(e),errors,bad,requests,shards},null,2));throw e;}finally{await browser.close();}
