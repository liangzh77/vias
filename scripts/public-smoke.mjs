import {chromium} from '../client/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
try{
 const context=await browser.newContext({viewport:{width:384,height:783}});
 const page=await context.newPage();const errors=[],failedAssets=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('response',r=>{if(r.url().includes('/static/')&&r.status()>=400)failedAssets.push(r.url());});
 await page.route('**/map/tiles/**',r=>r.fulfill({status:503,body:'Offline test'}));
 await page.goto(process.env.PREVIEW_URL||'http://127.0.0.1:8776');
 await page.locator('.home-entries uni-button').first().click();
 // Real OpenStreetMap routes come first, the two synthetic examples last.
 const cards=page.locator('.route-card');
 assert.equal(await cards.count(),12);
 const first=await cards.first().innerText();
 assert.match(first,/西山三峰路线/);
 assert.match(first,/OpenStreetMap/);
 assert.match(await cards.last().innerText(),/合成示例/);
 await cards.first().click();
 await page.waitForSelector('.source-card');
 const osmSource=await page.locator('.source-card').innerText();
 assert.match(osmSource,/OpenStreetMap 贡献者/);
 assert.match(osmSource,/ODbL 1\.0/);
 assert.match(osmSource,/SRTM 90 m/);
 assert.match(await page.locator('.route-meta').innerText(),/OpenStreetMap/);
 assert.match(await page.locator('.stats-grid').innerText(),/用时未记录/);
 assert.ok((await page.locator('.elevation-title').innerText()).includes('米'));
 await page.locator('.detail-actions uni-button').first().click();
 assert.match(await page.locator('.detail-actions').innerText(),/已收藏/);
 await page.locator('.detail-actions uni-button').nth(3).click();
 const [download]=await Promise.all([page.waitForEvent('download'),page.locator('.export-option').first().click()]);
 assert.equal(download.suggestedFilename(),'osm-16205150.gpx');
 // Close the export sheet, then go back and open the synthetic example.
 await page.locator('.sheet-head uni-button').click();
 await page.locator('.map-back').click();
 await cards.last().click();
 await page.waitForSelector('.track-marker-label');
 assert.match(await page.locator('.source-card').innerText(),/非真实道路/);
 assert.equal(await page.locator('.track-marker-label').first().evaluate(e=>getComputedStyle(e).borderRadius),'50%');
 assert.deepEqual(errors,[]);assert.deepEqual(failedAssets,[]);
 console.log('Public browser smoke passed: OSM catalog first, ODbL/SRTM attribution, honest time stats, favorite, GPX download, synthetic example markers.');
}finally{await browser.close();}
