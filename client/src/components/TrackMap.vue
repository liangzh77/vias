<template>
 <view class="map-shell">
  <!-- #ifdef H5 -->
  <div ref="host" class="map-canvas" aria-label="路线交互地图"></div>
  <!-- #endif -->
  <!-- #ifdef MP-WEIXIN -->
  <map class="map-canvas" :latitude="center.lat" :longitude="center.lon" :scale="12" :polyline="nativeLines" :show-location="true" @tap="nativeTap" />
  <!-- #endif -->
  <!-- #ifdef H5 -->
  <a v-if="tiles" class="map-credit linkable" :href="COPYRIGHT_URL" target="_blank" rel="noopener">{{ credit }}</a>
  <view v-else class="map-credit">{{ credit }}</view>
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
const props=withDefaults(defineProps<{segments:Point[][];waypoints?:Point[];tiles?:boolean;editable?:boolean;position?:Point|null}>(),{tiles:true,editable:false});
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

const emit=defineEmits<{(e:'point',p:Point):void}>();
const COPYRIGHT_URL='https://www.openstreetmap.org/copyright';
const credit=computed(()=>props.tiles?(tileError.value?'© OpenStreetMap contributors · 底图加载失败，轨迹仍可查看':'© OpenStreetMap contributors'):'仅轨迹视图 · 无地形底图');
function openCopyright(){
 if(!props.tiles)return;
 uni.setClipboardData({data:COPYRIGHT_URL,success:()=>uni.showToast({title:'已复制版权链接',icon:'none'})});
}
const host=ref<HTMLElement>();const tileError=ref(false);
const center=computed(()=>props.segments.flat()[0]||{lat:39.993587,lon:116.196528});
const nativeLines=computed(()=>props.segments.map(s=>({points:s.map(p=>({latitude:p.lat,longitude:p.lon})),color:'#00be78',width:5})));
function nativeTap(e:any){if(props.editable&&e.detail?.latitude)emit('point',{lat:e.detail.latitude,lon:e.detail.longitude});}
// #ifdef H5
let map:L.Map|undefined, lines:L.LayerGroup|undefined, base:L.TileLayer|undefined, dot:L.CircleMarker|undefined, observer:ResizeObserver|undefined;
function draw(fit=true){if(!map||!lines)return;lines.clearLayers();for(const seg of props.segments){if(!seg.length)continue;const pts=seg.map(p=>[p.lat,p.lon] as L.LatLngTuple);L.polyline(pts,{color:'#fff',weight:8,opacity:.9}).addTo(lines);L.polyline(pts,{color:'#00bd74',weight:4}).addTo(lines);}
const points=props.segments.flat();if(points.length){for(const [i,label,color] of [[0,'起','#00bb78'],[points.length-1,'终','#ff664a']] as const){const p=points[i];L.marker([p.lat,p.lon],{icon:L.divIcon({className:'track-marker',html:`<div class="track-marker-label" style="background:${color}">${label}</div>`,iconSize:[24,24],iconAnchor:[12,12]})}).addTo(lines);}if(fit)map.fitBounds(L.latLngBounds(points.map(p=>[p.lat,p.lon] as L.LatLngTuple)),{padding:[36,50],maxZoom:16});}
(props.waypoints||[]).forEach((p,i)=>L.circleMarker([p.lat,p.lon],{color:'#fff',weight:2,fillColor:'#fb6874',fillOpacity:1,radius:4}).bindTooltip(`标注点 ${i+1}`).addTo(lines!));}
function setTiles(){if(!map)return;if(base)map.removeLayer(base);tileError.value=false;if(props.tiles){base=L.tileLayer(__VIAS_RESEARCH__&&import.meta.env.PROD?'/map/tiles/{z}/{x}/{y}.png':'https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'© OpenStreetMap contributors'});base.on('tileerror',()=>tileError.value=true);base.addTo(map);}}
function updatePosition(){if(!map)return;if(dot)map.removeLayer(dot);if(props.position)dot=L.circleMarker([props.position.lat,props.position.lon],{color:'#fff',weight:3,fillColor:'#248dff',fillOpacity:1,radius:8}).addTo(map);}
onMounted(async()=>{await nextTick();if(!host.value)return;map=L.map(host.value,{zoomControl:false,attributionControl:false,fadeAnimation:false}).setView([center.value.lat,center.value.lon],12);lines=L.layerGroup().addTo(map);setTiles();draw();map.on('click',e=>{if(props.editable)emit('point',{lat:e.latlng.lat,lon:e.latlng.lng});});observer=new ResizeObserver(()=>map?.invalidateSize());observer.observe(host.value);updatePosition();});
watch(()=>props.segments,()=>draw(!props.editable),{deep:true});watch(()=>props.waypoints,()=>draw(false),{deep:true});watch(()=>props.tiles,setTiles);watch(()=>props.position,updatePosition,{deep:true});
// A zoom transition that is still animating when the container goes away leaves Leaflet's
// internal pane position undefined, and its transition end handler then throws
// "Cannot read properties of undefined (reading '_leaflet_pos')" while switching routes.
// stop() cancels in-flight animations/transitions before the map is torn down.
onBeforeUnmount(()=>{observer?.disconnect();if(map){try{map.stop();(map as unknown as {_animatingZoom?:boolean})._animatingZoom=false;map.off();}catch{}map.remove();}});
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
.map-shell{height:100%;width:100%;position:relative;background:#e0e5dc}.map-canvas{height:100%;width:100%;z-index:0;background-color:#dce2d5;background-image:repeating-radial-gradient(ellipse at 25% 50%,transparent 0px,transparent 32px,#c9d4c844 33px,#c9d4c844 34px)}.map-credit{position:absolute;bottom:22px;right:5px;padding:2px 4px;background:#ffffffd9;font-size:9px;color:#555;z-index:2;pointer-events:none}
.map-credit.linkable{pointer-events:auto;cursor:pointer;text-decoration:underline}
a.map-credit{display:block}:deep(.track-marker-label){display:block;width:24px;height:24px;line-height:24px;text-align:center;color:white;border:2px solid white;border-radius:50%;font-size:12px;box-shadow:0 1px 4px #3335}.leaflet-container{font-family:inherit}:deep(.leaflet-tile){mix-blend-mode:normal}
</style>
