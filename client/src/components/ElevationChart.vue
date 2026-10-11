<template>
 <!-- #ifdef H5 -->
 <Teleport to="body" :disabled="!expanded">
 <!-- #endif -->
 <view :class="{'elevation-expanded':expanded}" class="elevation-component">
  <view class="elevation-title"><text>海拔</text><button :class="expanded?'elevation-collapse':'elevation-expand'" @click="expanded=!expanded">{{ expanded?'收起':'展开' }}</button></view>
  <view class="elevation-range">{{ range }}</view>
  <view class="elevation-plot">
   <image v-if="series.length" class="elevation-chart" :src="image" mode="scaleToFill"/><view v-else class="elevation-chart pending">无海拔数据</view>
   <view ref="touchLayer" class="elevation-touch" @touchstart.stop.prevent="start" @touchmove.stop.prevent="move" @touchend="end" @mousedown.prevent="start" @mousemove="move" @mouseup="end" @mouseleave="end"></view>
   <view v-if="reading" class="elevation-cursor" :style="{left:(fraction*100)+'%'}"></view>
   <view v-if="reading" class="elevation-readout"><text class="elevation-readout-km">{{ reading.km.toFixed(2) }}</text><text> km · 海拔 </text><text class="elevation-readout-ele">{{ Math.round(reading.ele) }}</text><text> 米</text></view>
  </view>
  <view class="chart-axis"><text v-for="f in [0,.25,.5,.75,1]" :key="f">{{ (total*f).toFixed(2) }} km</text></view>
  <view class="elevation-note">海拔来自公开地形瓦片采样插值（约 30 m），非实测，不可导航</view>
 </view>
 <!-- #ifdef H5 -->
 </Teleport>
 <!-- #endif -->
</template>
<script setup lang="ts">
import {computed,ref,watch,onMounted,onBeforeUnmount,getCurrentInstance} from 'vue';
import {type Point,elevationSeries,elevationAt,metrics} from '../core/track';
const touchLayer=ref<any>();const props=defineProps<{segments:Point[][]}>();const expanded=ref(false),fraction=ref(0),selected=ref(false);let dragging=false;const instance=getCurrentInstance();
const series=computed(()=>elevationSeries(props.segments));const total=computed(()=>metrics(props.segments).distance);const range=computed(()=>{const es=series.value.map(p=>p.ele);return es.length?`${Math.round(Math.min(...es))}–${Math.round(Math.max(...es))} 米`:'无海拔数据';});
const reading=computed(()=>{const km=total.value*fraction.value,ele=elevationAt(series.value,km);return selected.value&&ele!=null?{km,ele}:null;});
const image=computed(()=>{const pts=series.value;if(!pts.length)return '';const es=pts.map(p=>p.ele),min=Math.min(...es),span=Math.max(...es)-min||1;const sampled=Array.from({length:Math.min(400,pts.length)},(_,i)=>pts[Math.round(i*(pts.length-1)/(Math.min(400,pts.length)-1||1))]);const line=sampled.map(p=>`${p.km/(total.value||1)*360},${110-(p.ele-min)/span*95}`).join(' ');return 'data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 120"><path d="M0 15H360M0 60H360M0 110H360" stroke="#eee"/><polygon points="0,110 ${line} 360,110" fill="#00bf7922"/><polyline points="${line}" fill="none" stroke="#00bf79" stroke-width="2"/></svg>`);});
function update(e:any){const x=e.touches?.[0]?.clientX??e.changedTouches?.[0]?.clientX??e.clientX;if(!Number.isFinite(x))return;const apply=(rect:any)=>{if(rect?.width){fraction.value=Math.max(0,Math.min(1,(x-rect.left)/rect.width));selected.value=true;}};
// #ifdef H5
const node=touchLayer.value?.$el??touchLayer.value;const rect=node?.getBoundingClientRect?.();if(rect){apply(rect);return;}
// #endif
uni.createSelectorQuery().in(instance?.proxy).select('.elevation-touch').boundingClientRect(apply).exec();}
function start(e:any){dragging=true;update(e);}function move(e:any){if(dragging)update(e);}function end(){dragging=false;}function escape(e:KeyboardEvent){if(e.key==='Escape')expanded.value=false;}
watch(()=>props.segments,()=>{selected.value=false;expanded.value=false;});
onMounted(()=>{
// #ifdef H5
window.addEventListener('keydown',escape);
// #endif
});onBeforeUnmount(()=>{
// #ifdef H5
window.removeEventListener('keydown',escape);
// #endif
});
</script>
