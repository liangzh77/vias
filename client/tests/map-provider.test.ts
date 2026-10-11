import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const component=readFileSync(new URL('../src/components/TrackMap.vue',import.meta.url),'utf8');
const provider=readFileSync(new URL('../src/components/vector-basemap.ts',import.meta.url),'utf8');
test('official vector style, lazy H5 integration and linked attribution',()=>{
 assert.ok(provider.includes("style:'https://tiles.openfreemap.org/styles/liberty'"));
 assert.ok(component.includes("await import('./vector-basemap')"));
 const h5=component.slice(component.indexOf('// #ifdef H5\nlet map:'),component.indexOf('\nfunction fit()'));
 assert.ok(h5.includes("await import('./vector-basemap')"));
 for(const url of ['https://openfreemap.org/','https://www.openmaptiles.org/','https://www.openstreetmap.org/copyright'])assert.ok(component.includes(url));
 assert.ok(component.includes('当前视口请求发送至第三方 OpenFreeMap（可能经 Cloudflare）'));
 assert.ok(!component.includes('tile.openstreetmap.org'));
});
test('mini-program component whitelist remains closed and includes the elevation chart',()=>{
 const checker=readFileSync(new URL('../../scripts/check-public-build.mjs',import.meta.url),'utf8');
 const pattern=checker.match(/if\(!\/(\^\(app\\[\s\S]*?)\/\.test\(rel\)\)throw Error\('Unknown mini-program output:/)?.[1];
 assert.ok(pattern,'explicit mini-program output whitelist');
 const allowed=new RegExp(pattern);
 for(const name of ['Icon','TrackMap','ElevationChart'])for(const ext of ['js','json','wxml','wxss'])assert.ok(allowed.test(`components/${name}.${ext}`));
 for(const name of ['components/Unknown.js','components/ElevationChart.js.map','components/ElevationChartExtra.js','components/nested/ElevationChart.js'])assert.ok(!allowed.test(name),name);
});
test('readiness requires visible vector data and rendered pixel variation, not metadata',()=>{
 assert.ok(component.includes('gl.isStyleLoaded(),tilesLoaded=gl.areTilesLoaded()'));
 assert.ok(component.includes('gl.queryRenderedFeatures()'));
 assert.ok(component.includes('ctx.readPixels('));
 assert.ok(component.includes('if(features>0&&colors.size>1)'));
 assert.ok(component.includes('setTimeout(fail,25000)'));
 assert.ok(component.includes('底图加载失败，轨迹仍可查看'));
 assert.ok(component.includes('generation!==baseGeneration'));
});
