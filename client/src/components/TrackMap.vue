<template>
 <view class="map-shell" :class="{'preview-map':preview}" :data-viewport="viewportText" :data-state="baseState">
  <!-- #ifdef H5 -->
  <div ref="host" class="map-canvas" aria-label="路线交互地图"></div>
  <!-- #endif -->
  <!-- #ifdef MP-WEIXIN -->
  <map class="map-canvas" :latitude="center.lat" :longitude="center.lon" :scale="12" :polyline="nativeLines" :show-location="true" @tap="nativeTap" />
  <!-- #endif -->
  <!-- #ifdef H5 -->
  <div v-if="tiles&&!preview" class="map-credit compact" :data-basemap="baseState">
   <details class="map-info">
    <summary aria-label="地图说明" title="地图说明">ⓘ</summary>
    <div class="map-info-content" :style="{top:infoTop}">
     <div><a href="https://openfreemap.org/" target="_blank" rel="noopener">OpenFreeMap</a> <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">© OpenMapTiles</a> Data from <a :href="COPYRIGHT_URL" target="_blank" rel="noopener">OpenStreetMap</a></div>
     <div>当前视口请求发送至第三方 OpenFreeMap（可能经 Cloudflare）</div>
     <a class="renderer-license" href="#renderer-licenses" @click.prevent="showRendererLicenses">渲染库许可</a>
    </div>
   </details>
  </div>
  <div v-if="tiles&&!preview" class="map-attribution"><a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">© OpenMapTiles</a> · <a :href="COPYRIGHT_URL" target="_blank" rel="noopener">© OpenStreetMap</a></div>
  <div v-if="tiles&&baseState==='failed'" class="map-failure" role="status">{{preview?'底图不可用 · 仅轨迹':'底图加载失败，轨迹仍可查看'}}</div>
  <div v-if="preview&&tiles&&baseState==='loading'" class="map-failure" role="status">底图加载中 · 当前仅轨迹</div>
  <view v-if="!tiles&&!preview" class="map-credit">仅轨迹视图 · 无地形底图</view>
  <!-- #endif -->
  <!-- #ifndef H5 -->
  <view class="map-credit" :class="{linkable:tiles}" @click="openCopyright">{{ credit }}</view>
  <!-- #endif -->
 </view>
</template>
<script setup lang="ts">
import {ref,watch,onMounted,onBeforeUnmount,computed,nextTick} from 'vue';
import type {Point} from '../core/track';
// #ifdef H5
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
// #endif
const props=withDefaults(defineProps<{segments:Point[][];waypoints?:Point[];tiles?:boolean;editable?:boolean;position?:Point|null;preview?:boolean;overview?:boolean;initialViewport?:{center:[number,number];zoom:number};overlays?:{id:string;segments:Point[][]}[];clusters?:{lat:number;lon:number;count:number}[];selected?:string}>(),{tiles:true,editable:false});
// #ifdef H5
// Leaflet 1.9.4 deletes _mapPane in Map.remove() but never clears _animatingZoom (Map.stop()
// only cancels the fly-to frame and the pan animation). A transitionend still queued on the
// detached pane therefore reaches _onZoomTransitionEnd → _move → getPosition(undefined) and
// throws "Cannot read properties of undefined (reading '_leaflet_pos')" while switching routes.
{
  type TransitionMap={_mapPane?:unknown;_onZoomTransitionEnd:()=>void};
  const proto=L.Map.prototype as unknown as TransitionMap;
  const original=proto._onZoomTransitionEnd;
  proto._onZoomTransitionEnd=function(this:TransitionMap){if(!this._mapPane)return;original.call(this);};
}
// #endif

const emit=defineEmits<{(e:'point',p:Point):void;(e:'viewport',v:{bounds:[number,number,number,number];zoom:number}):void;(e:'select',id:string):void}>();
const viewportText=ref('');const infoTop=ref('64px');
const COPYRIGHT_URL='https://www.openstreetmap.org/copyright';
const credit=computed(()=>props.tiles?(tileError.value?'© OpenStreetMap contributors · 底图加载失败，轨迹仍可查看':'© OpenStreetMap contributors'):'仅轨迹视图 · 无地形底图');
function openCopyright(){
 if(!props.tiles)return;
 uni.setClipboardData({data:COPYRIGHT_URL,success:()=>uni.showToast({title:'已复制版权链接',icon:'none'})});
}
const host=ref<HTMLElement>();const tileError=ref(false);
const baseState=ref<'loading'|'ready'|'failed'>('loading');
const center=computed(()=>props.segments.flat()[0]||{lat:39.993587,lon:116.196528});
const nativeLines=computed(()=>props.segments.map(s=>({points:s.map(p=>({latitude:p.lat,longitude:p.lon})),color:'#00be78',width:5})));
function nativeTap(e:any){if(props.editable&&e.detail?.latitude)emit('point',{lat:e.detail.latitude,lon:e.detail.longitude});}
// #ifdef H5
let map:L.Map|undefined, lines:L.LayerGroup|undefined, base:L.Layer|undefined, dot:L.CircleMarker|undefined, observer:ResizeObserver|undefined;
let overviewLines:L.LayerGroup|undefined;
let unmounted=false,infoDetails:HTMLDetailsElement|undefined;
// Fixed positioning escapes the sheet's clipped map area. In short maps put
// disclosure below the map, leaving its attribution and controls uncovered.
function positionInfo(){
 const shell=host.value?.parentElement,content=shell?.querySelector<HTMLElement>('.map-info[open] .map-info-content');
 if(!shell||!content)return;
 const b=shell.getBoundingClientRect(),h=content.getBoundingClientRect().height;
 const desired=b.height>=h+76?b.top+54:b.bottom+8;
 infoTop.value=Math.max(20,Math.min(desired,window.innerHeight-h-20))+'px';
}
const licenseUrls=new Map<string,ReturnType<typeof setTimeout>>();
async function showRendererLicenses(){
 const {rendererLicenses}=await import('./vector-basemap');
 if(unmounted)return;
 const url=URL.createObjectURL(new Blob([rendererLicenses],{type:'text/plain;charset=utf-8'}));
 const link=document.createElement('a');link.href=url;link.download='map-renderer-licenses.txt';link.click();
 licenseUrls.set(url,setTimeout(()=>{URL.revokeObjectURL(url);licenseUrls.delete(url);},60000));
}
let baseGeneration=0, baseTimer:ReturnType<typeof setTimeout>|undefined, disposeBase:(()=>void)|undefined;
function clearBase(){baseGeneration++;clearTimeout(baseTimer);disposeBase?.();disposeBase=undefined;if(base&&map)map.removeLayer(base);base=undefined;}
function draw(fit=true){if(!map||!lines)return;lines.clearLayers();for(const seg of props.segments){if(!seg.length)continue;const pts=seg.map(p=>[p.lat,p.lon] as L.LatLngTuple);L.polyline(pts,{color:'#fff',weight:8,opacity:.9}).addTo(lines);L.polyline(pts,{color:'#00bd74',weight:4}).addTo(lines);}
const points=props.segments.flat();if(points.length){if(!props.preview)for(const [i,label,color] of [[0,'起','#00bb78'],[points.length-1,'终','#ff664a']] as const){const p=points[i];L.marker([p.lat,p.lon],{icon:L.divIcon({className:'track-marker',html:`<div class="track-marker-label" style="background:${color}">${label}</div>`,iconSize:[24,24],iconAnchor:[12,12]})}).addTo(lines);}if(fit)map.fitBounds(L.latLngBounds(points.map(p=>[p.lat,p.lon] as L.LatLngTuple)),{padding:props.preview?[14,14]:[36,50],maxZoom:16,animate:!props.preview});}
(props.waypoints||[]).forEach((p,i)=>L.circleMarker([p.lat,p.lon],{color:'#fff',weight:2,fillColor:'#fb6874',fillOpacity:1,radius:4}).bindTooltip(`标注点 ${i+1}`).addTo(lines!));}
async function setTiles(){
 clearBase();tileError.value=false;baseState.value='loading';if(!map||!props.tiles)return;
 const generation=baseGeneration;
 let stopSampling=()=>{};
 const fail=()=>{if(generation===baseGeneration){stopSampling();baseState.value='failed';tileError.value=true;}};
 const pending=()=>{clearTimeout(baseTimer);baseTimer=setTimeout(fail,25000);};
 pending();
 try{
  const {vectorBasemap}=await import('./vector-basemap');
  if(generation!==baseGeneration||!map||!props.tiles)return;
  const layer=vectorBasemap();base=layer;layer.addTo(map);
  const gl=layer.getMaplibreMap();
  const leaflet=map,canvas=gl.getCanvas();
  let moving=false,lost=false,disposed=false,pixelRounds=0,retryFailed=false;
  // MapLibre counts errored tiles as 'loaded'. Retain only error-event tile
  // references for this viewport, not provider URLs or an unbounded history.
  type ErrorTile={state:string;tileID:{overscaledZ:number;canonical:{z:number;x:number;y:number}}};
  const errorTiles=new Set<ErrorTile>();
  const visibleErrors=()=>{
   const bounds=gl.getBounds(),zoom=Math.floor(gl.getZoom());let count=0;
   for(const tile of errorTiles){
    if(tile.state!=='errored'){errorTiles.delete(tile);continue;}
    const {canonical:c,overscaledZ}=tile.tileID,n=2**c.z;
    const west=c.x/n*360-180,east=(c.x+1)/n*360-180;
    const lat=(y:number)=>Math.atan(Math.sinh(Math.PI*(1-2*y/n)))*180/Math.PI;
    if(overscaledZ===zoom&&west<bounds.getEast()&&east>bounds.getWest()&&lat(c.y)>bounds.getSouth()&&lat(c.y+1)<bounds.getNorth())count++;
    else errorTiles.delete(tile);
   }
   return count;
  };
  let sampleTimer:ReturnType<typeof setTimeout>|undefined;
  const active=()=>!disposed&&generation===baseGeneration;
  // Render is subscribed only for a scheduled validation frame, never a permanent
  // per-frame hot path. At most six nine-pixel rounds per stable viewport; no GPU
  // readback while interacting, and none after ready. HTTP/errored tiles alone
  // cannot pass: visible vector geometry AND nonuniform actual pixels are required.
  const cancelSample=()=>{clearTimeout(sampleTimer);sampleTimer=undefined;gl.off('render',verify);};
  stopSampling=cancelSample;
  const schedule=(delay=600)=>{
   if(!active()||moving||lost||baseState.value==='ready'||sampleTimer||pixelRounds>=6)return;
   sampleTimer=setTimeout(()=>{
    sampleTimer=undefined;if(!active()||moving||lost)return;
    gl.once('render',verify);gl.triggerRepaint();
   },delay);
  };
  function verify(){
   if(!active()||moving||lost||baseState.value==='ready')return;
   const styleReady=gl.isStyleLoaded(),tilesLoaded=gl.areTilesLoaded();
   const rendered=styleReady&&tilesLoaded?gl.queryRenderedFeatures().filter(f=>f.source&&f.geometry):[];
   const features=rendered.length;
   const failedTiles=visibleErrors(),colors=new Set<string>();
   if(features>0&&failedTiles===0){
    pixelRounds++;
    const ctx=canvas.getContext('webgl2')||canvas.getContext('webgl');
    const pixel=new Uint8Array(4);
    if(ctx){
     // A fixed grid can miss all thin roads/labels in a genuinely drawn frame.
     // Keep nine reads, vary the grid per bounded attempt, and aim three samples
     // at visible vector line/point vertices (still test actual GPU pixels).
     const offset=(pixelRounds-1)*.073;
     const samples:[number,number][]=[];
     for(const x of [.2,.5,.8])for(const y of [.2,.5,.8])samples.push([((x+offset)% .8)+.05,((y+offset*.7)% .8)+.05]);
     let aimed=0,vertices=0;
     for(const f of rendered){
      const g=f.geometry,coords=g.type==='LineString'?g.coordinates:g.type==='Point'?[g.coordinates]:[];
      for(const p of coords){
       if(++vertices>64||aimed===3)break;
       const projected=gl.project([p[0],p[1]]),x=projected.x/canvas.clientWidth,y=1-projected.y/canvas.clientHeight;
       if(x>.05&&x<.95&&y>.05&&y<.95)samples[6+aimed++]=[x,y];
      }
      if(vertices>64||aimed===3)break;
     }
     for(const [x,y] of samples){
      ctx.readPixels(Math.floor(canvas.width*x),Math.floor(canvas.height*y),1,1,ctx.RGBA,ctx.UNSIGNED_BYTE,pixel);colors.add(Array.from(pixel).join(','));
     }
    }
   }
   canvas.dataset.renderEvidence=JSON.stringify({styleReady,tilesLoaded,features,pixelColors:colors.size,failedTiles});
   if(features>0&&colors.size>1){clearTimeout(baseTimer);baseState.value='ready';tileError.value=false;cancelSample();}
   else if(baseState.value==='loading')schedule(1500);
  }
  // The adapter emits GL move, not reliably GL movestart. Leaflet is the source
  // of viewport truth (drag, zoom, fitBounds, setView and invalidateSize).
  const invalidate=()=>{
   if(!active())return;
   retryFailed ||= baseState.value==='failed'||errorTiles.size>0;
   cancelSample();delete canvas.dataset.renderEvidence;pixelRounds=0;
   baseState.value='loading';tileError.value=false;
   clearTimeout(baseTimer);baseTimer=setTimeout(()=>{cancelSample();fail();},25000);
  };
  const start=()=>{moving=true;invalidate();};
  const end=()=>{
   moving=false;
   if(retryFailed&&!lost){
    retryFailed=false;
    // Errored tiles are not automatically retried by areTilesLoaded(). Use the
    // public vector-source API only after a new stable user viewport, not a
    // permanent retry loop or an error-triggered request storm.
    for(const [id,style] of Object.entries(gl.getStyle()?.sources||{}))if(style.type==='vector'){
     const source=gl.getSource(id) as unknown as {tiles?:string[];setTiles?:(tiles:string[])=>void};
     if(source?.tiles&&source.setTiles)source.setTiles(source.tiles);
    }
   }
   schedule();
  };
  const resize=()=>{invalidate();end();};
  const data=()=>schedule(); // canceled/partial requests are not terminal errors
  const error=(e:unknown)=>{
   const tile=(e as {tile?:ErrorTile}).tile;if(!tile||!active())return;
   errorTiles.add(tile);
   if(baseState.value==='ready'&&visibleErrors()>0){baseState.value='loading';tileError.value=false;pending();}
   schedule();
  };
  const contextLost=()=>{lost=true;cancelSample();delete canvas.dataset.renderEvidence;clearTimeout(baseTimer);fail();};
  const contextRestored=()=>{lost=false;invalidate();schedule();};
  leaflet.on('movestart zoomstart',start);leaflet.on('moveend zoomend',end);leaflet.on('resize',resize);
  gl.on('data',data);gl.on('error',error);
  canvas.addEventListener('webglcontextlost',contextLost);
  canvas.addEventListener('webglcontextrestored',contextRestored);
  // Stop polling at the deadline; real subsequent data or a new viewport can
  // still validate and recover this same instance after a provider outage.
  disposeBase=()=>{
   disposed=true;cancelSample();clearTimeout(baseTimer);
   leaflet.off('movestart zoomstart',start);leaflet.off('moveend zoomend',end);leaflet.off('resize',resize);
   gl.off('data',data);gl.off('error',error);errorTiles.clear();canvas.removeEventListener('webglcontextlost',contextLost);canvas.removeEventListener('webglcontextrestored',contextRestored);
   delete canvas.dataset.renderEvidence;
  };
  schedule();
 }catch{if(base&&map){try{map.removeLayer(base);}catch{}base=undefined;}fail();}
}
function overviewDraw(){
 if(!map||!overviewLines)return;overviewLines.clearLayers();
 for(const r of props.overlays||[])for(const seg of r.segments){if(seg.length<2)continue;L.polyline(seg.map(p=>[p.lat,p.lon] as L.LatLngTuple),{color:r.id===props.selected?'#f45b34':'#009d6b',weight:r.id===props.selected?7:4}).on('click',e=>{L.DomEvent.stopPropagation(e);emit('select',r.id);}).addTo(overviewLines);}
 for(const c of props.clusters||[])L.marker([c.lat,c.lon],{icon:L.divIcon({className:'overview-cluster',html:`<button aria-label="放大路线聚合 ${c.count}">${c.count}</button>`,iconSize:[38,38]})}).on('click',()=>map?.setView([c.lat,c.lon],map.getZoom()+2)).addTo(overviewLines);
}
function viewport(){if(!map)return;const b=map.getBounds();const v={bounds:[b.getSouth(),b.getWest(),b.getNorth(),b.getEast()] as [number,number,number,number],zoom:map.getZoom(),center:[map.getCenter().lat,map.getCenter().lng] as [number,number]};viewportText.value=JSON.stringify(v);emit('viewport',v);}
function updatePosition(){if(!map)return;if(dot)map.removeLayer(dot);if(props.position)dot=L.circleMarker([props.position.lat,props.position.lon],{color:'#fff',weight:3,fillColor:'#248dff',fillOpacity:1,radius:8}).addTo(map);}
onMounted(async()=>{await nextTick();if(!host.value)return;infoDetails=host.value.parentElement?.querySelector<HTMLDetailsElement>('.map-info')||undefined;infoDetails?.addEventListener('toggle',positionInfo);map=L.map(host.value,{zoomControl:false,attributionControl:false,fadeAnimation:false,dragging:!props.preview,scrollWheelZoom:!props.preview,touchZoom:!props.preview,doubleClickZoom:!props.preview,boxZoom:!props.preview,keyboard:!props.preview,zoomAnimation:!props.preview}).setView([center.value.lat,center.value.lon],12);lines=L.layerGroup().addTo(map);overviewLines=L.layerGroup().addTo(map);if(props.overview)map.setView(props.initialViewport?.center||[40.03,116.2],props.initialViewport?.zoom??9);setTiles();draw();overviewDraw();map.on('moveend',viewport);viewport();map.on('click',e=>{if(props.editable)emit('point',{lat:e.latlng.lat,lon:e.latlng.lng});});observer=new ResizeObserver(()=>{map?.invalidateSize();positionInfo();});observer.observe(host.value);updatePosition();});
watch([()=>props.overlays,()=>props.clusters,()=>props.selected],overviewDraw,{deep:true});
watch(()=>props.tiles,async()=>{infoDetails?.removeEventListener('toggle',positionInfo);await nextTick();if(unmounted)return;infoDetails=host.value?.parentElement?.querySelector<HTMLDetailsElement>('.map-info')||undefined;infoDetails?.addEventListener('toggle',positionInfo);});
watch(()=>props.segments,()=>draw(!props.editable&&!props.overview),{deep:true});watch(()=>props.waypoints,()=>draw(false),{deep:true});watch(()=>props.tiles,setTiles);watch(()=>props.position,updatePosition,{deep:true});
// A zoom transition that is still animating when the container goes away leaves Leaflet's
// internal pane position undefined, and its transition end handler then throws
// "Cannot read properties of undefined (reading '_leaflet_pos')" while switching routes.
// stop() cancels in-flight animations/transitions before the map is torn down.
onBeforeUnmount(()=>{unmounted=true;infoDetails?.removeEventListener('toggle',positionInfo);for(const [url,timer] of licenseUrls){clearTimeout(timer);URL.revokeObjectURL(url);}licenseUrls.clear();clearBase();observer?.disconnect();if(map){try{map.stop();(map as unknown as {_animatingZoom?:boolean})._animatingZoom=false;map.off();}catch{}map.remove();}});
// #endif
function fit(){
// #ifdef H5
draw(true);
// #endif
}
function zoom(delta:number){
// #ifdef H5
if(map)map.setZoom(map.getZoom()+delta);
// #endif
}
function locate(){
// #ifdef H5
if(map&&props.position)map.setView([props.position.lat,props.position.lon],16);
// #endif
}
defineExpose({fit,zoom,locate});
</script>
<style>
.preview-map{pointer-events:none}.preview-map .map-failure{top:6px;font-size:11px}.map-shell{height:100%;width:100%;position:relative;background:#e0e5dc}.map-canvas{height:100%;width:100%;z-index:0;background-color:#dce2d5;background-image:repeating-radial-gradient(ellipse at 25% 50%,transparent 0px,transparent 32px,#c9d4c844 33px,#c9d4c844 34px)}.map-credit{position:absolute;bottom:22px;right:5px;padding:2px 4px;background:#ffffffd9;font-size:9px;color:#555;z-index:2;pointer-events:none}
.map-credit.compact{padding:0;background:transparent;pointer-events:auto;font-size:12px;z-index:4}.map-info{position:relative}.map-info>summary{list-style:none;cursor:pointer;width:32px;height:32px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:#fffffff0;color:#365b60;font-size:20px}.map-info>summary::-webkit-details-marker{display:none}.map-info>summary:focus-visible{outline:2px solid #365b60;outline-offset:2px}.map-info-content{position:fixed;top:64px;bottom:auto;right:max(20px,calc((100vw - 430px)/2 + 20px));z-index:20;box-sizing:border-box;width:284px;max-width:calc(100vw - 40px);max-height:calc(100dvh - 84px);overflow:auto;padding:12px;background:#fffffff5;border-radius:8px;box-shadow:0 2px 12px #0002;line-height:1.6}.map-info-content>div{margin-bottom:8px}.map-failure{position:absolute;top:54px;left:10px;right:10px;text-align:center;padding:5px 8px;background:#ffffffe6;border-radius:6px;color:#765127;font-size:12px;z-index:2;pointer-events:none}
.map-attribution{position:absolute;bottom:2px;right:5px;z-index:2;background:#ffffffe8;padding:2px 4px;font-size:10px;line-height:14px}.map-attribution a{color:#365b60;text-decoration:underline}.overview-cluster button{background:#00865e;color:white;border:2px solid white;border-radius:50%;width:38px;height:38px;padding:0;font-size:12px;box-shadow:0 2px 5px #0003}
.map-credit.linkable{pointer-events:auto;max-width:calc(100% - 10px);line-height:1.5}.map-credit a{color:#365b60;text-decoration:underline}.renderer-license{all:unset;position:relative;display:inline-block;color:#365b60;text-decoration:underline;cursor:pointer}.renderer-license::after{display:none;pointer-events:none}.renderer-license:focus-visible{outline:2px solid #365b60;outline-offset:2px}.leaflet-gl-layer{pointer-events:none}
a.map-credit{display:block}:deep(.track-marker-label){display:block;width:24px;height:24px;line-height:24px;text-align:center;color:white;border:2px solid white;border-radius:50%;font-size:12px;box-shadow:0 1px 4px #3335}.leaflet-container{font-family:inherit}:deep(.leaflet-tile){mix-blend-mode:normal}
</style>
