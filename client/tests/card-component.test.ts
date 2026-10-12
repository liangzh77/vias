// Component lifecycle fixture: actual compiled SFC setup with a non-DOM renderer.
// Does not substitute for Chrome/real-provider rendering evidence.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {parse,compileScript} from '@vue/compiler-sfc';import ts from 'typescript';import * as Vue from 'vue';
import {cardLease,cardPoolSize} from '../src/core/card-map-pool';
test('same-id geometry replacement, ID replacement, hidden document, and late unmount cannot retain stale preview',async()=>{
 const {descriptor}=parse(fs.readFileSync('src/components/RouteCard.vue','utf8'));
 const code=ts.transpileModule(compileScript(descriptor,{id:'card-test'}).content,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const events=new Map<string,()=>void>();let notify:(entries:any[])=>void=()=>{};const oldDocument=globalThis.document,oldObserver=globalThis.IntersectionObserver;
 globalThis.document={hidden:false,addEventListener:(n:string,f:()=>void)=>events.set(n,f),removeEventListener:(n:string)=>events.delete(n)} as any;
 globalThis.IntersectionObserver=class{constructor(fn:any){notify=fn;}observe(){}disconnect(){}} as any;
 let release:(segments:any)=>void=()=>{};const requests:string[]=[];
 const module={exports:{} as any};new Function('require','exports',code)((name:string)=>{
  if(name==='vue')return Vue;if(name.endsWith('TrackMap.vue'))return {default:{}};
  if(name.endsWith('osm-catalog'))return {loadCardGeometry:(id:string)=>{requests.push(id);return new Promise(r=>release=r);}};
  if(name.endsWith('card-map-pool'))return {cardLease};throw Error('unexpected dependency '+name);
 },module.exports);
 const comp=module.exports.default;
 // SFC compiler's setup state is intentionally internal, not part of Vue's public instance type.
 const setupState=(instance:Vue.ComponentInternalInstance)=>(instance as Vue.ComponentInternalInstance & {setupState:Record<string,any>}).setupState;
 const renderer=Vue.createRenderer<any,any>({createElement:()=>({}),insert(){},remove(){},patchProp(){},createText:()=>({}),setText(){},createComment:()=>({}),setElementText(){},parentNode:()=>null,nextSibling:()=>null});
 comp.render=function(){const instance=Vue.getCurrentInstance()!;return Vue.h('div',{ref:(el:any)=>{setupState(instance).root=el;}});};
 const route=Vue.reactive({id:'demo-test',title:'fixture',segments:[[{lat:40,lon:116},{lat:40.1,lon:116.1}]],cover:'',activity:'徒步',distance:1,ascent:0});
 const app=renderer.createApp(comp,{route,tiles:true,active:true});
 try{
  app.mount({});notify([{isIntersecting:true,intersectionRatio:.001,intersectionRect:{height:2}}]);await Vue.nextTick();const state=setupState(app._instance!);assert.equal(state.segments[0][0].lat,40);
  route.segments=[[{lat:41,lon:117},{lat:41.1,lon:117.1}]];await Vue.nextTick();assert.equal(state.segments[0][0].lat,41,'same id replaced geometry is redrawn');
  route.id='osm-w123';await Vue.nextTick();assert.deepEqual(requests,['osm-w123']);assert.equal(state.segments.length,0,'old route geometry cleared before async read');
  const late=release;route.id='demo-new';route.segments=[[{lat:42,lon:118},{lat:42.1,lon:118.1}]];await Vue.nextTick();late([[{lat:9,lon:9}]]);await Promise.resolve();await Vue.nextTick();assert.equal(state.segments[0][0].lat,42,'late old ID cannot overwrite new card');
  (document as any).hidden=true;events.get('visibilitychange')!();await Vue.nextTick();assert.equal(state.leased,false);assert.equal(state.segments.length,0);assert.equal(cardPoolSize(),0);
  (document as any).hidden=false;events.get('visibilitychange')!();await Vue.nextTick();assert.equal(state.segments[0][0].lat,42);
  route.id='osm-w456';await Vue.nextTick();const detached=release;app.unmount();detached([[{lat:8,lon:8}]]);await Promise.resolve();await Vue.nextTick();assert.equal(cardPoolSize(),0);assert.equal(events.size,0);
 }finally{if(app._instance)app.unmount();globalThis.document=oldDocument;globalThis.IntersectionObserver=oldObserver;}
});
