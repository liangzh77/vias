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
 assert.equal(await page.locator('.route-card').count(),2);
 assert.match(await page.locator('.route-card').first().innerText(),/合成示例/);
 await page.locator('.route-card').first().click();
 await page.waitForSelector('.track-marker-label');
 assert.match(await page.locator('.source-card').innerText(),/非真实道路/);
 assert.equal(await page.locator('.track-marker-label').first().evaluate(e=>getComputedStyle(e).borderRadius),'50%');
 await page.locator('.detail-actions uni-button').first().click();
 assert.match(await page.locator('.detail-actions').innerText(),/已收藏/);
 await page.locator('.detail-actions uni-button').nth(3).click();
 const [download]=await Promise.all([page.waitForEvent('download'),page.locator('.export-option').first().click()]);
 assert.equal(download.suggestedFilename(),'demo-loop.gpx');
 assert.deepEqual(errors,[]);assert.deepEqual(failedAssets,[]);
 console.log('Public browser smoke passed: demo catalog, assets, map fallback, styled markers, favorite and GPX download.');
}finally{await browser.close();}
