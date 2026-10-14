import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=(relative:string)=>readFileSync(new URL(relative,import.meta.url),'utf8');

test('current Chinese brand is 行止 across H5, mini-program and in-app copy',()=>{
 const html=read('../index.html');
 const manifest=JSON.parse(read('../src/manifest.json'));
 const pages=JSON.parse(read('../src/pages.json'));
 const app=read('../src/pages/index/index.vue');
 assert.match(html,/<title>行止 Vias · 户外轨迹<\/title>/);
 assert.equal(manifest.name,'行止');
 assert.equal(manifest.h5.title,'行止 Vias · 户外轨迹');
 assert.equal(pages.globalStyle.navigationBarTitleText,'行止 Vias');
 assert.equal(JSON.parse(read('../catalog-sample/manifest.json')).title,'行止（Vias）OpenStreetMap 北京路线快照');
 assert.match(read('../../scripts/prepare-catalog.mjs'),/title: '行止（Vias）OpenStreetMap 北京路线快照'/);
 assert.match(app,/<text>行止 Vias · 户外轨迹研究<\/text>/);
 assert.match(app,/titles\[page.value\]\|\|'行止'/);
 for(const source of [html,read('../src/manifest.json'),read('../src/pages.json'),app])assert.ok(!source.includes('景行'));
});
