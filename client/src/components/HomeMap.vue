<template>
 <view class="home-map-browser">
  <TrackMap v-if="active" :segments="[]" :tiles="tiles" overview :initial-viewport="savedViewport" :overlays="overlays" :clusters="groups" :selected="selected" @viewport="query" @select="select" />
  <view class="overview-status" role="status">{{ message }}<button v-if="error" @click="retry">重试范围查询</button></view>
  <view class="overview-selection-stack">
  <view class="overview-cards"><button v-for="r in visibleRoutes" :key="r.id" :class="{chosen:selected===r.id}" @click="select(r.id)">{{ r.title }}</button></view>
  <view v-if="selectedRoute" class="overview-selected"><RouteCard :route="selectedRoute" :tiles="tiles" :active="active" @open="$emit('open',$event)" /></view>
  </view>
 </view>
</template>
<script setup lang="ts">
import {ref,computed,watch,onBeforeUnmount} from 'vue';
import TrackMap from './TrackMap.vue';
import RouteCard from './RouteCard.vue';
import {loadIndex,loadOverviewGeometry,osmRoutes,baseDir,catalogEntries,catalogShardCounts} from '../core/osm-catalog';
import {validateSpatial,candidates,clusters,type SpatialRow,type Bounds} from '../core/spatial';
import type {Route,Point} from '../core/track';
import {concreteRoutes,recommendRows,verifiedRoutes} from '../core/map-display';
import classicList from '../core/classic-routes.json';
const props=defineProps<{tiles:boolean;active:boolean;threshold?:number;legacyZoom?:number}>();defineEmits<{(e:'open',route:Route):void}>();
const selected=ref(''),message=ref('移动地图浏览路线'),error=ref(false);
const overlays=ref<{id:string;segments:Point[][]}[]>([]),groups=ref<{lat:number;lon:number;count:number}[]>([]),visibleRoutes=ref<Route[]>([]);
const selectedRoute=computed(()=>osmRoutes.value.find(r=>r.id===selected.value));
let rows:SpatialRow[]|null=null,epoch=0,controller:AbortController|undefined;
const savedViewport=ref<{center:[number,number];zoom:number}>();
let last:{bounds:Bounds;zoom:number;scale:number}|undefined;
async function read(url:string,signal:AbortSignal){const r=await fetch(url,{signal});if(!r.ok)throw Error(`范围数据 HTTP ${r.status}`);return r.json();}
async function query(v:{bounds:Bounds;zoom:number;scale:number;center?:[number,number]}){
 if(!props.active)return;
 last=v;savedViewport.value={center:v.center||[(v.bounds[0]+v.bounds[2])/2,(v.bounds[1]+v.bounds[3])/2],zoom:v.zoom};const token=++epoch;controller?.abort();if(!props.active)return;
 controller=new AbortController();const signal=controller.signal;error.value=false;message.value='范围查询中…';overlays.value=[];groups.value=[];visibleRoutes.value=[];
 try{
  await loadIndex();if(token!==epoch)return;
  if(!rows){const [raw,manifest]=await Promise.all([read(baseDir()+'static/osm/spatial.json',signal),read(baseDir()+'static/osm/manifest.json',signal)]);if(token!==epoch)return;if(raw.indexHash!==manifest.index.sha256)throw Error('空间目录与路线版本不匹配');const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(catalogEntries())));if(token!==epoch)return;const signature=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');if(raw.routesHash!==signature)throw Error('空间目录与已加载路线索引不匹配');rows=validateSpatial(raw,osmRoutes.value.map(r=>r.id),catalogShardCounts());}
  const hits=candidates(rows,v.bounds);
  if(!(props.legacyZoom!==undefined?concreteRoutes(v.zoom,props.legacyZoom):v.scale>0&&v.scale<=(props.threshold??2000))){groups.value=clusters(hits,v.bounds);message.value=`${hits.length} 条 bbox 候选 · 点聚合放大查看更多`;return;}
  const chosen=recommendRows(hits,v.bounds,osmRoutes.value,classicList.ids,selected.value);const byId=new Map(osmRoutes.value.map(r=>[r.id,r]));
  const verified=await verifiedRoutes(chosen,v.bounds,ids=>loadOverviewGeometry(ids,signal),signal);if(token!==epoch||!props.active)return;
  const results=verified.routes;
  const routes=verified.routes.map(g=>{const route=byId.get(g.id);if(!route)throw Error('范围路线不匹配');return route;});
  if(selected.value&&!routes.some(r=>r.id===selected.value))selected.value='';
  overlays.value=results;visibleRoutes.value=routes;message.value=`范围 bbox 候选 ${hits.length} 条 · 显示 ${results.length} 条推荐路线${verified.exhausted?' · 相交验证完成':' · 最多100条，未统计精确总数'} · 元数据与视野推荐，非人气或安全排名`;
 }catch(e){if(token!==epoch||signal.aborted)return;controller?.abort();error.value=true;message.value=e instanceof Error?e.message:'范围查询失败';}
}
function select(id:string){selected.value=id;}
function retry(){rows=null;if(last)query(last);}
watch([()=>props.threshold,()=>props.legacyZoom],()=>{if(props.active&&last)query(last);});
watch(()=>props.active,active=>{epoch++;controller?.abort();if(active&&last)query(last);});
onBeforeUnmount(()=>{epoch++;controller?.abort();rows=null;overlays.value=[];groups.value=[];});
</script>
<style>
.home-map-browser{position:relative;height:100%;min-height:300px}.overview-status{position:absolute;top:8px;left:8px;right:8px;background:#fffffff0;padding:6px;font-size:12px;z-index:3;border-radius:8px}.overview-status button{font-size:12px}.overview-selection-stack{position:absolute;bottom:44px;left:8px;right:8px;max-height:calc(100% - 110px);display:flex;flex-direction:column;gap:8px;z-index:3}.overview-cards{display:flex;gap:6px;overflow:auto;flex-shrink:0}.overview-cards button{flex:none;font-size:12px;background:white;padding:0 10px;line-height:32px}.overview-cards button.chosen{background:#00865e;color:white}.overview-selected{min-height:0;overflow:auto;display:flex;align-items:flex-start;background:white;text-align:left;padding:6px;border-radius:10px;font-size:12px;line-height:20px}.overview-selected .route-preview-card{margin:0;width:100%}.overview-selected .route-preview-picture{height:120px}.overview-selected image{width:70px;height:64px;margin-right:8px}.overview-selected text{display:block}
</style>
