<template>
 <view ref="root" class="route-preview-card" :data-route-id="route.id" :data-active="leased">
  <button class="route-preview-open" :class="{'classic-card':classic}" role="button" tabindex="0" :aria-label="'打开 '+route.title" @click="$emit('open',route)" @keydown.enter.prevent="$emit('open',route)" @keydown.space.prevent="$emit('open',route)">
   <view class="route-preview-picture">
    <!-- #ifdef H5 -->
    <TrackMap v-if="leased&&segments.length" :key="generation" :segments="segments" :tiles="tiles" preview />
    <!-- #endif -->
    <image v-if="!leased||!segments.length" :src="route.cover" mode="aspectFit" />
    <!-- #ifdef H5 -->
    <text v-if="!segments.length" class="preview-error">{{error?'轨迹暂不可用 · 仍可打开详情':leased?'轨迹加载中 · 几何预览':'几何预览 · 可见时按需加载'}}</text>
    <!-- #endif -->
    <!-- #ifndef H5 -->
    <text class="preview-error">几何预览 · 小程序降级</text>
    <!-- #endif -->
   </view>
   <view class="route-preview-title"><text>{{route.title}}</text><text class="muted">{{route.activity}} · {{route.distance.toFixed(2)}} km · 爬升 {{route.ascent}} m</text></view>
  </button>
  <!-- #ifdef H5 -->
  <view v-if="tiles&&leased" class="card-map-attribution" @click.stop><a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">© OpenMapTiles</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a></view>
  <view class="preview-credit" @click.stop>
   <text v-if="!tiles">仅轨迹 · 在线底图已关闭</text>
   <details class="card-info"><summary aria-label="卡片地图说明">ⓘ</summary><text>地图请求说明：可见卡片区域由设备直连第三方 <a href="https://openfreemap.org/" target="_blank" rel="noopener">OpenFreeMap</a>（可能经 Cloudflare）。私有轨迹文件与 GPS 逐点不上传；地图区域会暴露。不保存截图或持久缓存地图，可在设置关闭。</text><text>{{route.source}}</text><a v-if="safeLink(route.sourceUrl)" :href="route.sourceUrl" target="_blank" rel="noopener">路线来源</a><a v-if="safeLink(route.licenseUrl)" :href="route.licenseUrl" target="_blank" rel="noopener">{{route.license}}</a><button @click.stop="rendererLicense">渲染库许可</button></details>
  </view>
  <button v-if="leased" class="preview-retry" @click.stop="retry">{{error?'重试轨迹预览':'重新加载预览'}}</button>
  <!-- #endif -->
  <button v-if="route.id.startsWith('local-')" class="preview-delete" @click.stop="$emit('delete',route)">删除本地轨迹</button>
 </view>
</template>
<script setup lang="ts">
import {ref,watch,onMounted,onBeforeUnmount} from 'vue';
import type {Route,Point} from '../core/track';
// #ifdef H5
import TrackMap from './TrackMap.vue';
import {loadCardGeometry} from '../core/osm-catalog';
import {cardLease} from '../core/card-map-pool';
// #endif
const props=withDefaults(defineProps<{route:Route;tiles:boolean;active?:boolean;classic?:boolean}>(),{active:true});
defineEmits<{(e:'open',route:Route):void;(e:'delete',route:Route):void}>();
const root=ref(),leased=ref(false),segments=ref<Point[][]>([]),error=ref(false),generation=ref(0);
function safeLink(url?:string){return !!url&&/^https?:\/\//i.test(url);}
function rendererLicense(){
// #ifdef H5
import('./vector-basemap').then(({rendererLicenses})=>uni.showModal({title:'渲染库许可',content:rendererLicenses,showCancel:false}));
// #endif
}
// #ifdef H5
let visible=false,release:(()=>void)|undefined,observer:IntersectionObserver|undefined,controller:AbortController|undefined,disposed=false;
const key={};
async function geometry(){controller?.abort();const token=++generation.value;controller=new AbortController();const signal=controller.signal;segments.value=[];error.value=false;
 try{const route=props.route;const data=route.id.startsWith('osm-')?await loadCardGeometry(route.id,signal):route.segments;
 if(disposed||signal.aborted||token!==generation.value||!leased.value)return;
 if(!data.length)throw Error('无轨迹');segments.value=data;
 }catch{if(!disposed&&!signal.aborted&&token===generation.value)error.value=true;}
}
function stop(){controller?.abort();generation.value++;segments.value=[];leased.value=false;}
function sync(){const want=visible&&props.active&&!document.hidden&&!disposed;
 if(want&&!release)release=cardLease(key,active=>{if(active===leased.value)return;leased.value=active;if(active)geometry();else stop();});
 if(!want&&release){const free=release;release=undefined;free();stop();}
}
watch(()=>props.active,sync);
watch([()=>props.route,()=>props.route.id,()=>props.route.segments],()=>{if(leased.value)geometry();});
onMounted(()=>{const el=root.value?.$el||root.value;observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting&&entries[0].intersectionRatio>0;sync();},{threshold:[0,.01]});if(el)observer.observe(el);document.addEventListener('visibilitychange',sync);});
onBeforeUnmount(()=>{disposed=true;observer?.disconnect();document.removeEventListener('visibilitychange',sync);release?.();release=undefined;stop();});
// #endif
function retry(){
// #ifdef H5
if(leased.value)geometry();
// #endif
}
</script>
<style>
.route-preview-card{position:relative;display:block;background:white;border-radius:10px;overflow:hidden;margin:10px 12px;border:1px solid #e3e8e5;min-width:0}.card-map-attribution{position:absolute;top:148px;right:2px;background:#fffffff0;font-size:10px;line-height:20px;z-index:2}.card-map-attribution a{color:#365b60;text-decoration:underline}.classic-grid .card-map-attribution{top:128px}.overview-selected .card-map-attribution{top:98px}.preview-delete{color:#b32525;font-size:13px;line-height:32px}.route-preview-open{display:block;width:100%;padding:0;text-align:left;background:white;line-height:1.4;border-radius:0}.route-preview-open::after{display:none}.route-preview-picture{height:170px;position:relative}.route-preview-picture image{width:100%;height:100%}.route-preview-title{padding:8px 10px}.route-preview-title text{display:block;font-size:14px}.route-preview-title .muted{font-size:12px;margin-top:4px}.preview-credit{padding:5px 8px;font-size:11px;line-height:18px;color:#47605a;background:#f4f8f5}.preview-credit a{display:inline-block;white-space:nowrap;color:#365b60;text-decoration:underline}.preview-credit details{font-size:12px}.preview-credit summary{cursor:pointer}.preview-credit details text{display:block}.preview-error{position:absolute;bottom:5px;left:5px;background:#fff;padding:3px;font-size:12px}.preview-retry{font-size:12px;line-height:30px}.classic-grid .route-preview-card{margin:0}.classic-grid .route-preview-picture{height:150px}
</style>
