<template>
 <view class="home-map-browser">
  <TrackMap :segments="[]" :tiles="tiles" overview :overlays="overlays" :clusters="groups" :selected="selected" @viewport="query" @select="select" />
  <view class="overview-status" role="status">{{ message }}<button v-if="error" @click="retry">重试范围查询</button></view>
  <view class="overview-cards"><button v-for="r in visibleRoutes" :key="r.id" :class="{chosen:selected===r.id}" @click="select(r.id)">{{ r.title }}</button></view>
  <button v-if="selectedRoute" class="overview-selected" @click="$emit('open',selectedRoute)"><image :src="selectedRoute.cover"/><view><text>{{ selectedRoute.title }}</text><text>{{ selectedRoute.distance.toFixed(2) }} km · 打开详情 ›</text><text class="muted">几何小图无底图 · 未实走，不可导航</text></view></button>
 </view>
</template>
<script setup lang="ts">
import {ref,computed,watch,onBeforeUnmount} from 'vue';
import TrackMap from './TrackMap.vue';
import {loadIndex,loadOverviewGeometry,osmRoutes,baseDir,catalogEntries,catalogShardCounts} from '../core/osm-catalog';
import {validateSpatial,candidates,clusters,limitedRows,simplify,type SpatialRow,type Bounds} from '../core/spatial';
import type {Route,Point} from '../core/track';
const props=defineProps<{tiles:boolean;active:boolean}>();defineEmits<{(e:'open',route:Route):void}>();
const selected=ref(''),message=ref('移动地图浏览路线'),error=ref(false);
const overlays=ref<{id:string;segments:Point[][]}[]>([]),groups=ref<{lat:number;lon:number;count:number}[]>([]),visibleRoutes=ref<Route[]>([]);
const selectedRoute=computed(()=>osmRoutes.value.find(r=>r.id===selected.value));
let rows:SpatialRow[]|null=null,epoch=0,controller:AbortController|undefined;
let last:{bounds:Bounds;zoom:number}|undefined;
async function read(url:string,signal:AbortSignal){const r=await fetch(url,{signal});if(!r.ok)throw Error(`范围数据 HTTP ${r.status}`);return r.json();}
async function query(v:{bounds:Bounds;zoom:number}){
 last=v;const token=++epoch;controller?.abort();if(!props.active)return;
 controller=new AbortController();const signal=controller.signal;error.value=false;message.value='范围查询中…';overlays.value=[];groups.value=[];visibleRoutes.value=[];
 try{
  await loadIndex();if(token!==epoch)return;
  if(!rows){const [raw,manifest]=await Promise.all([read(baseDir()+'static/osm/spatial.json',signal),read(baseDir()+'static/osm/manifest.json',signal)]);if(token!==epoch)return;if(raw.indexHash!==manifest.index.sha256)throw Error('空间目录与路线版本不匹配');const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(catalogEntries())));if(token!==epoch)return;const signature=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');if(raw.routesHash!==signature)throw Error('空间目录与已加载路线索引不匹配');rows=validateSpatial(raw,osmRoutes.value.map(r=>r.id),catalogShardCounts());}
  const hits=candidates(rows,v.bounds);
  if(v.zoom<12){groups.value=clusters(hits,v.bounds);message.value=`${hits.length} 条 bbox 候选 · 点聚合放大查看更多`;return;}
  const chosen=limitedRows(hits,v.bounds);const byId=new Map(osmRoutes.value.map(r=>[r.id,r]));
  const geometry=await loadOverviewGeometry(chosen.map(r=>r[0]),signal);if(token!==epoch||!props.active)return;
  const results=geometry.map(g=>({id:g.id,segments:simplify(g.segments)}));
  const routes=chosen.map(row=>{const route=byId.get(row[0]);if(!route)throw Error('范围路线不匹配');return route;});
  overlays.value=results;visibleRoutes.value=routes;message.value=`${hits.length} 条 bbox 候选 · 显示 ${results.length} 条（最多12条/3分片）${hits.length>results.length?' · 放大查看更多':''}`;
 }catch(e){if(token!==epoch||signal.aborted)return;error.value=true;message.value=e instanceof Error?e.message:'范围查询失败';}
}
function select(id:string){selected.value=id;}
function retry(){rows=null;if(last)query(last);}
watch(()=>props.active,active=>{epoch++;controller?.abort();if(active&&last)query(last);});
onBeforeUnmount(()=>{epoch++;controller?.abort();rows=null;overlays.value=[];groups.value=[];});
</script>
<style>
.home-map-browser{position:relative;height:100%;min-height:300px}.overview-status{position:absolute;top:8px;left:8px;right:8px;background:#fffffff0;padding:6px;font-size:12px;z-index:3;border-radius:8px}.overview-status button{font-size:12px}.overview-cards{position:absolute;bottom:128px;left:8px;right:8px;display:flex;gap:6px;overflow:auto;z-index:3}.overview-cards button{flex:none;font-size:12px;background:white;padding:0 10px;line-height:32px}.overview-cards button.chosen{background:#00865e;color:white}.overview-selected{position:absolute;bottom:44px;left:8px;right:8px;display:flex;align-items:center;background:white;text-align:left;padding:6px;z-index:3;border-radius:10px;font-size:12px;line-height:20px}.overview-selected image{width:70px;height:64px;margin-right:8px}.overview-selected text{display:block}
</style>
