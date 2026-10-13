// Real Chrome: full scale labels, not merely control presence. No GPS/recording.
import {chromium} from '../client/node_modules/playwright/index.mjs';
import fs from 'node:fs';import assert from 'node:assert/strict';
const url=process.env.SCALE_TEST_URL||'http://127.0.0.1:8813/vias/';
const out=process.env.SCALE_TEST_OUT||'artifacts/map-display/release-fix/scale';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});const report={checks:[],errors:[]};
async function check(page,root,label){
 const evidence=await root.evaluate(root=>{
  const el=root.querySelector('.leaflet-control-scale-line'),map=root.querySelector('.map-canvas');
  const box=e=>e.getBoundingClientRect().toJSON(),scale=box(el),host=box(map);
  const controls=[...root.querySelectorAll('.map-back,.map-more,.offline,.map-info > summary,.map-attribution,.map-credit:not(.compact),.map-failure')].map(e=>({name:e.className,box:box(e)}));
  const range=document.createRange();range.selectNodeContents(el);const textBox=range.getBoundingClientRect().toJSON();
  // Probe paint order with opaque pointer-events:none overlays enabled as well.
  // Restore styles immediately; geometry assertions independently cover the overlays.
  const overlays=[...root.querySelectorAll('.map-failure,.map-credit:not(.compact)')];
  const saved=overlays.map(e=>e.style.pointerEvents);overlays.forEach(e=>e.style.pointerEvents='auto');
  const old=el.style.pointerEvents;el.style.pointerEvents='auto';
  const readable=[.05,.5,.95].every(x=>[.2,.8].every(y=>{const hit=document.elementFromPoint(textBox.left+textBox.width*x,textBox.top+textBox.height*y);return hit===el||el.contains(hit);}));el.style.pointerEvents=old;overlays.forEach((e,i)=>e.style.pointerEvents=saved[i]);
  return {scale,host,textBox,controls,readable,text:el.textContent,viewport:JSON.parse(root.querySelector('.map-shell').dataset.viewport)};
 });
 report.checks.push({label,...evidence});
 assert.match(evidence.text,/^\d+(?:\.\d+)? (?:m|km)$/);
 assert.ok(evidence.readable,`${label}: actual scale label covered`);
 const {scale:s,host:h,textBox:t}=evidence;
 assert.ok(s.left>=h.left&&s.right<=h.right&&s.top>=h.top&&s.bottom<=h.bottom,`${label}: scale clipped`);
 assert.ok(t.left>=s.left&&t.right<=s.right&&t.top>=s.top&&t.bottom<=s.bottom,`${label}: text clipped`);
 for(const {name,box:b} of evidence.controls)assert.ok(!(s.left<b.right&&s.right>b.left&&s.top<b.bottom&&s.bottom>b.top),`${label}: scale overlaps ${name}`);
 for(const target of await root.locator('.map-back,.map-more,.offline,.map-info > summary,.map-attribution a').all())await target.click({trial:true});
 await page.screenshot({path:`${out}/${label}.png`});
}
try{
 // Put the known failing short-map case first, so baseline run preserves it.
 for(const mode of (process.env.SCALE_TEST_FAILED_ONLY?['failed']:['off','on','failed']))for(const size of [{width:844,height:390},{width:390,height:844},{width:320,height:844},{width:1100,height:900}]){
  const tiles=mode!=='off';
  const c=await browser.newContext({viewport:size});await c.addInitScript(v=>localStorage.setItem('vias:tiles',JSON.stringify(v)),tiles);
  // Real provider failure and production timeout, never a fake DOM banner.
  if(mode==='failed')await c.route('https://tiles.openfreemap.org/styles/liberty',r=>r.abort());
  const p=await c.newPage();p.on('pageerror',e=>report.errors.push(e.message));await p.goto(url);assert.equal(await p.locator('.route-preview-card .leaflet-control-scale').count(),0);
  await p.locator('.classic-card').first().click();await p.locator('.interactive-detail .leaflet-control-scale-line').waitFor();
  for(const state of ['expanded','half','collapsed']){
   await p.getByLabel(({expanded:'展开',half:'半屏',collapsed:'收起'})[state]+'详情',{exact:true}).click();await p.waitForTimeout(650);
   if(mode==='failed')await p.locator('.interactive-detail .map-failure').waitFor({timeout:35000});
   await check(p,p.locator('.interactive-detail'),`${mode}-${size.width}-${state}`);
  }
  await p.locator('.map-back').click();await p.locator('.bottom-tabs > *').filter({hasText:'记录'}).click();await p.waitForTimeout(650);
  if(mode==='failed')await p.locator('.record-map .map-failure').waitFor({timeout:35000});
  await check(p,p.locator('.record-map'),`${mode}-${size.width}-record`);
  // Static planning view only; no geolocation, point creation or save.
  await p.locator('.create-route').click();await p.waitForTimeout(650);
  if(mode==='failed')await p.locator('.record-map .map-failure').waitFor({timeout:35000});
  await check(p,p.locator('.record-map'),`${mode}-${size.width}-plan`);
  await c.close();
 }
 assert.deepEqual(report.errors,[]);report.pass=true;
}catch(e){report.failure=String(e);process.exitCode=1;for(const c of browser.contexts())for(const p of c.pages())await p.screenshot({path:`${out}/failure.png`}).catch(()=>{});}
finally{fs.writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify(report,null,2));
