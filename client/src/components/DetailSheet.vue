<template>
 <view ref="root" class="interactive-detail" :data-sheet-state="state">
  <view class="interactive-map" :style="{height: mapHeight+'px'}"><slot name="map" /></view>
  <view class="interactive-panel" :style="{height: panelHeight+'px'}">
   <view ref="grip" class="sheet-grip">
    <view class="handle"></view><view class="sheet-summary"><slot name="summary" /></view>
   </view>
   <!-- #ifdef H5 -->
   <div class="sheet-controls"><div v-for="option in options" :key="option.state" role="button" tabindex="0" :aria-label="option.label+'详情'" @click="set(option.state)" @keydown.enter.prevent="set(option.state)" @keydown.space.prevent="set(option.state)">{{ option.text }}</div></div>
   <!-- #endif -->
   <!-- #ifndef H5 -->
   <view class="sheet-controls"><button aria-label="收起详情" @click="set('collapsed')">收起</button><button aria-label="半屏详情" @click="set('half')">摘要</button><button aria-label="展开详情" @click="set('expanded')">展开</button></view>
   <!-- #endif -->
   <scroll-view v-show="state!=='collapsed'||dragging" scroll-y class="interactive-content"><slot /></scroll-view>
  </view>
  <view class="interactive-actions"><slot name="actions" /></view>
 </view>
</template>
<script setup lang="ts">
import {ref,computed,onMounted,onBeforeUnmount} from 'vue';
type State='collapsed'|'half'|'expanded';
const options:{state:State;label:string;text:string}[]=[{state:'collapsed',label:'收起',text:'收起'},{state:'half',label:'半屏',text:'摘要'},{state:'expanded',label:'展开',text:'展开'}];
const root=ref(),grip=ref();const state=ref<State>('half'),height=ref(760),offset=ref<number|null>(null),dragging=ref(false);
const available=computed(()=>Math.max(200,height.value-64));
// Reserve room for the map's top controls, info/offline row and full attribution,
// including landscape. Expanded content scrolls instead of crushing the map.
const sizes=computed(()=>({collapsed:100,half:Math.min(available.value*.48,available.value-120),expanded:Math.min(available.value*.86,available.value-120)}));
const panelHeight=computed(()=>offset.value??sizes.value[state.value]);const mapHeight=computed(()=>available.value-panelHeight.value);
let pointer:number|null=null,start=0,initial=0,target:HTMLElement|null=null,observer:ResizeObserver|undefined;
let handle:HTMLElement|undefined;
const events={pointerdown:down,pointermove:move,pointerup:up,pointercancel:cancel,lostpointercapture:cancel};
function set(s:State){cancel();state.value=s;}
function down(e:PointerEvent){if(e.button!==0||pointer!==null||e.isPrimary===false)return;pointer=e.pointerId;target=e.currentTarget as HTMLElement;start=e.clientY;initial=panelHeight.value;dragging.value=true;target.setPointerCapture?.(pointer);e.preventDefault();}
function move(e:PointerEvent){if(e.pointerId!==pointer)return;offset.value=Math.max(sizes.value.collapsed,Math.min(sizes.value.expanded,initial+start-e.clientY));}
function up(e:PointerEvent){if(e.pointerId!==pointer)return;const h=panelHeight.value;const nearest=(Object.keys(sizes.value) as State[]).sort((a,b)=>Math.abs(sizes.value[a]-h)-Math.abs(sizes.value[b]-h))[0];cancel();state.value=nearest;}
function cancel(){const id=pointer;pointer=null;dragging.value=false;offset.value=null;if(id!=null&&target?.hasPointerCapture?.(id))target.releasePointerCapture(id);target=null;}
// #ifdef H5
onMounted(()=>{const el=root.value?.$el||root.value;handle=grip.value?.$el||grip.value;for(const [name,fn] of Object.entries(events))handle?.addEventListener(name,fn as EventListener);observer=new ResizeObserver(()=>{cancel();height.value=el.clientHeight;});observer.observe(el);height.value=el.clientHeight;});
onBeforeUnmount(()=>{cancel();observer?.disconnect();for(const [name,fn] of Object.entries(events))handle?.removeEventListener(name,fn as EventListener);});
// #endif
</script>
<style>
.interactive-detail{position:absolute;inset:0;overflow:hidden;display:flex;flex-direction:column}.interactive-map{flex:none;position:relative;min-height:0}.interactive-map :deep(.detail-map){height:100%;border-radius:0}.interactive-panel{flex:none;display:flex;flex-direction:column;background:white;overflow:hidden;border-radius:18px 18px 0 0;box-shadow:0 -3px 12px #0001}.sheet-grip{touch-action:none;cursor:ns-resize;padding:6px 14px 0;flex:none}.sheet-grip .handle{margin:0 auto 5px;width:40px;height:4px;background:#b8bec3;border-radius:4px}.sheet-summary{font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sheet-controls{display:flex;flex:none;height:36px}.sheet-controls button,.sheet-controls [role=button]{font-size:12px;flex:1;line-height:30px;background:white;color:#247858;text-align:center;cursor:pointer}.sheet-controls [role=button]:focus-visible{outline:2px solid #00865e;outline-offset:-2px}.interactive-content{flex:1;min-height:0;height:0;overscroll-behavior:contain}.interactive-content :deep(.detail-panel){padding-top:10px;border-radius:0;margin-top:0}.interactive-actions{height:64px;flex:none;padding-bottom:env(safe-area-inset-bottom);box-sizing:border-box}.interactive-actions :deep(.detail-actions){position:static;height:100%}
</style>
