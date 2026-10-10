<template>
 <view class="app-frame">
  <view v-if="!['home','profile','record','plan','detail'].includes(page)" class="topbar">
   <button class="icon-button" aria-label="返回" @click="back"><Icon name="back" /></button>
   <text>{{ pageTitle }}</text>
   <button class="icon-button" :aria-label="page==='library'?'导入轨迹':'搜索'" @click="page==='library'?importFile():go('search')"><Icon :name="page==='library'?'upload':'search'" :size="22" /></button>
  </view>

  <scroll-view v-if="page==='home'" scroll-y class="page-scroll with-tabs">
   <view class="home-head"><image class="brand" :src="asset('brand')" mode="aspectFit" /><button class="search-pill" @click="go('search')">搜索目的地/线路</button><button class="icon-button" aria-label="消息" @click="unavailable('消息','本地研究版没有连接六只脚账号或消息服务器。')"><Icon name="mail" :size="28" /></button></view>
   <view class="hero-wrap"><image class="hero" :src="asset('banner')" mode="aspectFill" @click="unavailable('本地展示横幅',research?'此横幅仅作为本地视觉研究素材，不提供租车或商业活动入口。':'此图片是程序生成的原创示例插画，不对应真实地点或商业活动。')"/><text class="hero-caption">奔赴山野 自在出行</text></view>
   <view class="home-entries"><button v-for="entry in entries" :key="entry.page" @click="go(entry.page)"><image :src="asset('entry-'+entry.asset)"/><text>{{ entry.name }}</text></button></view>
   <view class="section-bar"></view>
   <view class="section-title"><text>精选脚印</text><button @click="go('photos')"><Icon name="clock" :size="15"/> 查看更多</button></view>
   <scroll-view scroll-x class="footprints"><view class="footprint-row"><button v-for="(photo,i) in photos" :key="photo" class="footprint-card" :aria-label="photoPlaces[i]+'的公开脚印图片'" @click="previewPhoto(i)"><image :src="photo" mode="aspectFill"/><text v-if="!research || i>1">{{ photoPlaces[i] }}</text></button></view></scroll-view>
   <view class="section-title route-section"><text>精选线路</text><button @click="go('routes')">查看全部 ›</button></view>
   <button v-for="r in routes.slice(0,2)" :key="r.id" class="home-route" @click="openRoute(r)"><image :src="r.cover" mode="aspectFill"/><view><text>{{ r.title }}</text><text class="muted">{{ r.activity }} · {{ r.distance.toFixed(2) }} 公里</text></view></button>
   <button class="research-link" @click="sheet='about'">本地研究 · 数据来源与功能边界</button>
  </scroll-view>

  <template v-if="page==='routes'">
   <view class="tabs"><button :class="{active:routeTab==='featured'}" @click="routeTab='featured'">精选</button><button :class="{active:routeTab==='nearby'}" @click="routeTab='nearby'">附近</button></view>
   <scroll-view scroll-y class="page-scroll">
    <view v-if="routeTab==='nearby'" class="info-strip">仅有 {{ routes.length }} 条本地路线，不是全站附近列表。<button @click="locate">定位排序</button></view>
    <button v-for="r in displayedRoutes" :key="r.id" :class="routeTab==='featured'?'route-card':'route-row'" @click="openRoute(r)">
     <view v-if="routeTab==='featured'" class="route-author"><view class="avatar">{{ r.author[0] }}</view><text>{{ r.author }}</text></view>
     <image v-if="r.cover" :src="r.cover" mode="aspectFill"/><view v-else class="route-cover-placeholder"><Icon name="route" :size="45" color="#00bc79"/></view>
     <view class="route-title"><text>{{ r.title }}</text><text v-if="routeTab==='nearby'" class="muted">{{ r.activity }} {{ r.distance.toFixed(2) }} km · {{ r.place }}<text v-if="position"> · 距起点 {{ (distance(position,r.segments[0][0])/1000).toFixed(1) }} km</text></text></view>
    </button>
    <view class="list-end">已展示全部 {{ routes.length }} 条本地路线 · 示例 / 研究数据 / 本地导入</view>
   </scroll-view>
  </template>

  <scroll-view v-if="page==='search'" scroll-y class="page-scroll">
   <view class="search-input"><Icon name="search" :size="20"/><input v-model="query" placeholder="输入关键字、目的地、行程编号" confirm-type="search" @confirm="searchDone=true"/><button v-if="query" @click="query=''"><Icon name="close" :size="18"/></button></view>
   <text class="field-label">过滤条件</text>
   <button class="cell" @click="sheet='region'"><text>地区</text><text class="muted">{{ region }} ›</text></button>
   <button class="cell" @click="sheet='activityFilter'"><text>类型</text><text class="muted">{{ activityFilter }} ›</text></button>
   <button class="cell" @click="sheet='distanceFilter'"><text>里程</text><text class="muted">{{ distanceFilter }} ›</text></button>
   <view class="cell"><text>只看已收藏</text><switch :checked="onlyFavorites" color="#00bf7c" @change="onlyFavorites=eventValue($event)" /></view>
   <button class="primary search-submit" @click="searchDone=true">搜索</button>
   <template v-if="searchDone"><view class="field-label">本地结果 · {{ searchResults.length }} 条</view><button v-for="r in searchResults" :key="r.id" class="route-row" @click="openRoute(r)"><image v-if="r.cover" :src="r.cover" mode="aspectFill"/><Icon v-else name="route" :size="40"/><view class="route-title"><text>{{ r.title }}</text><text class="muted">{{ r.activity }} · {{ r.distance.toFixed(2) }} km · #{{ r.id }}</text></view></button><view v-if="!searchResults.length" class="empty"><Icon name="search" :size="42" color="#bbb"/><text>没有找到匹配的本地路线</text><button @click="resetSearch">清除筛选</button></view></template>
  </scroll-view>

  <template v-if="page==='detail'">
   <scroll-view scroll-y class="page-scroll detail-scroll">
    <view class="detail-map"><TrackMap :key="current.id" :segments="current.segments" :waypoints="current.waypoints" :tiles="tiles"/><button class="map-back floating" aria-label="返回" @click="back"><Icon name="back" :size="27"/></button><button class="map-more floating" aria-label="路线菜单" @click="sheet='routeMenu'"><Icon name="more" :size="28"/></button><button class="offline floating" @click="sheet='offline'"><Icon name="cloud" :size="25"/> 离线地图</button></view>
    <view class="detail-panel"><view class="handle"></view><view class="detail-author"><view class="avatar">{{ current.author[0] }}</view><text class="author-name">{{ current.author }}</text><view class="route-meta"><text>{{routeOrigin(current)}}　{{ current.activity }}</text><text class="muted">#{{ current.id }}</text></view></view>
     <view class="detail-info"><Icon name="clock" :size="21"/><text>{{ routeDates }}</text></view><view v-if="current.waypoints.length" class="detail-info"><Icon name="pin" :size="21"/><text>文件含 {{ current.waypoints.length }} 个标注点</text></view><view class="detail-info"><Icon name="pin" :size="21"/><text>{{ current.place }}</text></view>
     <text class="detail-title">{{ current.title }}</text><view class="distance-value"><text>{{ current.distance.toFixed(2) }}</text><text>里程(公里)</text></view><view class="difficulty">难度： <text>{{ current.difficulty==='难'?'☹':'☺' }} {{ current.difficulty }}</text></view>
     <view class="stats-grid"><view v-for="stat in currentStats" :key="stat[1]"><text>{{ stat[0] }}</text><text>{{ stat[1] }}</text></view></view>
     <view class="elevation-title">海拔 <text class="muted">{{ elevationRange }} 米</text></view><image class="elevation-chart" :src="elevationImage" mode="scaleToFill"/><view class="chart-axis"><text>0 km</text><text>{{ current.distance.toFixed(2) }} km</text></view>
     <view class="source-card"><text>{{ current.source }}</text><text>作者：{{ current.author }} · {{ current.segments.reduce((n,s)=>n+s.length,0) }} 个轨迹点</text><text selectable>{{ current.sourceUrl || '数据仅保存在本设备浏览器' }}</text><text>轨迹仅供研究参考，不代表道路可通行。出发前请自行核实。</text></view>
    </view>
   </scroll-view>
   <view class="detail-actions"><button @click="toggleFavorite(current.id)"><Icon name="star" :color="favorites.includes(current.id)?'#00bd7b':'#333'"/><text>{{ favorites.includes(current.id)?'已收藏':'收藏' }}</text></button><button @click="sheet='notes'"><Icon name="comment"/><text>备注</text></button><button @click="followRoute"><Icon name="pin"/><text>循迹</text></button><button @click="sheet='export'"><Icon name="share"/><text>导出</text></button><button class="navigate" @click="followRoute">导航</button></view>
  </template>

  <view v-if="page==='record'||page==='plan'" class="record-view">
   <view class="gps-bar"><text>{{ position ? position.lat.toFixed(5)+'° N, '+position.lon.toFixed(5)+'° E' : '未获取当前位置 · 点击右侧定位' }}</text><text>GPS <text :class="position?'green':'muted'">▥</text></text></view>
   <view class="record-map"><TrackMap ref="recordMap" :segments="mapSegments" :tiles="tiles" :editable="page==='plan'" :position="position" @point="addPlanPoint"/>
    <view class="map-top-tools"><button class="floating" aria-label="返回" @click="leaveRecord"><Icon name="back"/></button><button class="map-chip" @click="sheet='tracks'">轨迹({{ following?1:0 }}) › <Icon name="eye" :size="18" color="#38ba80"/></button><button class="map-chip" @click="unavailable('雷达','需要位置权限与实际设备方位传感器；本版暂未实现雷达视图。')">雷达 <Icon name="eye" :size="18"/></button><button class="map-chip" @click="unavailable('大指南针','尚未接入罗盘校准与设备方向传感器，不能用作户外定向工具。')">大指南针</button></view>
    <view class="map-right"><button class="floating compass" @click="recordMap?.fit()"><text>▲</text><text>北</text></button><view class="vertical-tools"><button v-for="t in mapTools" :key="t.name" @click="mapTool(t.name)"><Icon :name="t.icon" :size="24" :color="t.name==='叠加'?'#00be7e':'#333'"/><text>{{t.name}}</text></button></view><button class="floating" aria-label="定位" @click="locate"><Icon name="target" :size="28"/></button><view class="zoom-stack"><button aria-label="放大" @click="recordMap?.zoom(1)"><text class="zoom-plus">＋</text></button><button aria-label="缩小" @click="recordMap?.zoom(-1)"><text class="zoom-plus">－</text></button></view></view>
    <button v-if="page==='record'" class="create-route floating" @click="startPlan"><Icon name="edit"/> 创建线路</button><view v-else class="plan-hint">点击地图添加途经点 · 仅直线规划，不提供道路寻路</view>
   </view>
   <view class="record-panel" v-if="page==='record'"><view v-if="recordState!=='idle'" class="record-stats"><view><text>{{ recordDistance.toFixed(2) }}</text><text>公里</text></view><view><text>{{ durationLabel(recordSeconds) }}</text><text>{{recordState==='paused'?'已暂停':'记录中'}}</text></view><view><text>{{ recordPoints }}</text><text>GPS 点</text></view></view><view v-else class="record-indicators"><button @click="sheet='tracks'"><Icon name="route" :size="28"/></button><button @click="unavailable('运动数据','开始 GPS 记录后显示真实距离与时间，不生成模拟运动数据。')"><Icon name="chart" :size="28"/></button><button @click="unavailable('心率','未连接心率设备。H5 不提供虚构的心率读数。')"><Icon name="heart" :size="28"/></button></view>
    <view class="record-buttons"><button class="activity-button" @click="sheet='activity'"><Icon name="walk"/> {{ activity }} ▾</button><button v-if="recordState==='idle'" class="start-button" @click="startRecord">开始</button><template v-else><button class="start-button" @click="toggleRecord">{{recordState==='paused'?'继续':'暂停'}}</button><button class="end-button" @click="finishRecord">结束</button></template></view><text v-if="locationError" class="location-error">{{locationError}}</text><text v-if="following" class="following-hint">参考：{{current.title}} · 非实时道路导航</text>
   </view>
   <view v-else class="record-panel plan-panel"><view class="cell"><text>{{planPoints.length}} 个途经点 · {{metrics([planPoints]).distance.toFixed(2)}} km</text><button @click="planPoints.pop()">撤销</button></view><input v-model="planTitle" placeholder="线路名称" class="name-input"/><button class="primary" @click="savePlan">保存本地规划</button></view>
  </view>

  <scroll-view v-if="page==='profile'" scroll-y class="page-scroll with-tabs profile">
   <view class="profile-head"><view class="avatar large"><Icon name="user" :size="25" color="#00bd7b"/></view><text>本地研究用户</text><button aria-label="设置" @click="go('settings')"><Icon name="gear"/></button></view><view class="profile-social">粉丝 0　　关注 0　　小队 {{groups.length}}</view>
   <view class="profile-stats"><view><text>{{localRoutes.reduce((n,r)=>n+r.distance,0).toFixed(2)}}</text><text>总里程 km</text></view><view><text>{{Math.round(localRoutes.reduce((n,r)=>n+r.ascent,0))}}</text><text>总爬升 m</text></view><view><text>{{(localRoutes.reduce((n,r)=>n+r.duration,0)/3600).toFixed(1)}}</text><text>总时长 h</text></view></view>
   <view class="profile-record"><text>♜</text><view>--<text>单次最远</text></view><view>--<text>单次最大爬升</text></view></view>
   <button class="vip-banner" @click="unavailable('六只脚 PRO','原版会员服务需要官方账户与授权。本地版不提供试用、支付或伪造会员状态。')"><text>PRO　探索更多可能</text><text>功能说明 ›</text></button>
   <button v-for="item in profileItems" :key="item.label" class="cell profile-cell" @click="profileAction(item.page)"><Icon :name="item.icon"/><text>{{item.label}}</text><text class="muted">{{item.page==='library'?'本地'+localRoutes.length+'条':item.page==='favorites'?favorites.length:item.page==='following'?(following?1:0):''}} ›</text></button>
   <button class="research-link" @click="sheet='about'">本地数据 · 不关联原版账户</button>
  </scroll-view>

  <template v-if="page==='library'||page==='favorites'||page==='history'">
   <view v-if="page==='library'" class="tabs"><button :class="{active:libraryTab==='local'}" @click="libraryTab='local'">本地({{localRoutes.length}})</button><button :class="{active:libraryTab==='cloud'}" @click="libraryTab='cloud'">云端(未连接)</button></view>
   <scroll-view scroll-y class="page-scroll"><template v-if="libraryTab==='local'||page!=='library'"><template v-if="page==='library'"><button class="library-entry" @click="importFile"><Icon name="folder" :size="30" color="#00be7d"/><view><text>导入的轨迹</text><text class="muted">GPX 文件导入</text></view><text>＋</text></button><button class="library-entry" @click="startPlan"><Icon name="edit" :size="30" color="#00be7d"/><view><text>线路规划</text><text class="muted">通过地图点击创建本地路线</text></view><text>›</text></button><view class="section-bar"></view><view class="field-label">记录与导入 · {{localRoutes.length}}条</view></template>
    <button v-for="r in libraryRoutes" :key="r.id" class="route-row" @click="openRoute(r)"><image v-if="r.cover" :src="r.cover" mode="aspectFill"/><Icon v-else name="route" :size="36" color="#00be7d"/><view class="route-title"><text>{{r.title}}</text><text class="muted">{{r.distance.toFixed(2)}} km · {{r.source}}</text></view></button><view v-if="!libraryRoutes.length" class="empty"><Icon name="route" :size="54" color="#ccc"/><text>暂无{{page==='favorites'?'收藏':page==='history'?'浏览记录':'轨迹'}}</text><text class="muted">开始记录你的山野之旅吧～</text><button class="primary" @click="go('record')">开始记录</button><button v-if="page==='library'" @click="importFile">导入 GPX</button></view>
   </template><view v-else class="empty"><Icon name="cloud" :size="45"/><text>未连接云端服务</text><text class="muted">本地数据不会上传到六只脚账户</text></view></scroll-view>
  </template>

  <scroll-view v-if="page==='destinations'" scroll-y class="page-scroll"><view class="info-strip">本地已有轨迹的目的地 · 不是全站目的地目录</view><button v-for="(d,i) in destinations" :key="d" class="destination-card" @click="region=d;query='';searchDone=true;go('search')"><image :src="officialRoutes[i].cover" mode="aspectFill"/><view><text>{{ d }}</text><text>{{routeOrigin(officialRoutes[i])}} · 不可导航</text></view></button></scroll-view>
  <scroll-view v-if="page==='photos'" scroll-y class="page-scroll"><view class="photo-grid"><button v-for="(p,i) in photos" :key="p" @click="previewPhoto(i)"><image :src="p" mode="widthFix"/><text>{{photoPlaces[i]}}</text></button></view><view class="list-end">{{research?'原版公开页面的本地研究裁图 · 非实时照片流':'原创示例插画 · 不是真实照片或地点'}}</view></scroll-view>
  <scroll-view v-if="page==='circles'" scroll-y class="page-scroll"><view class="tabs"><button class="active">我的</button><button @click="unavailable('全部圈子','没有官方社交接口，不能查询或加入原版圈子。')">全部</button></view><view class="info-strip">仅本机保存的研究用圈子，无在线成员或消息同步</view><view class="group-form"><input v-model="groupName" placeholder="圈子名称（本地）" maxlength="30"/><button class="primary" @click="createGroup">创建圈子</button></view><view v-for="g in groups" :key="g" class="cell"><Icon name="group"/><text>{{g}}</text><button @click="removeGroup(g)">删除</button></view></scroll-view>
  <scroll-view v-if="page==='settings'" scroll-y class="page-scroll"><view class="field-label">地图与记录</view><view class="cell"><text>在线 OpenStreetMap 底图</text><switch :checked="tiles" color="#00be7d" @change="setTiles(eventValue($event))"/></view><button class="cell" @click="requestWake"><text>保持屏幕唤醒</text><text class="muted">{{wakeActive?'已开启':'点击开启'}} ›</text></button><button class="cell" @click="sheet='offline'"><text>离线资源</text><Icon name="chevron" :size="16"/></button><view class="field-label">数据</view><button class="cell" @click="importFile">导入 GPX <Icon name="upload" :size="20"/></button><button class="cell" @click="sheet='about'">数据来源与功能边界 <Icon name="chevron" :size="16"/></button><button class="cell danger" @click="clearLocal">清除本地研究数据</button><view class="source-card"><text>仅本地研究。位置和轨迹保存在浏览器，不发送到原版服务。在线底图请求会向 OpenStreetMap 暴露所浏览的地图区域。</text><text>H5 不能保证锁屏或后台持续 GPS；手机上定位需要 HTTPS。请勿把本版作为唯一户外导航工具。</text></view></scroll-view>

  <view v-if="page==='home'||page==='profile'" class="bottom-tabs"><button :class="{selected:page==='home'}" @click="tab('home')"><Icon name="home" :color="page==='home'?'#242330':'#bebdc2'" :size="25"/><text>首页</text></button><button class="record-tab" @click="tab('record')"><view><Icon name="play" color="white" :size="22"/></view><text>记录</text></button><button :class="{selected:page==='profile'}" @click="tab('profile')"><Icon name="user" :color="page==='profile'?'#242330':'#bebdc2'" :size="25"/><text>我的</text></button></view>

  <view v-if="sheet" class="sheet-mask" @click="sheet=''"><view class="sheet" @click.stop><view class="sheet-head"><text>{{sheetTitle}}</text><button aria-label="关闭弹窗" @click="sheet=''"><Icon name="close" :size="22"/></button></view><scroll-view scroll-y class="sheet-content">
   <template v-if="sheet==='about'"><view class="sheet-copy"><text>景行 Vias · 户外轨迹研究</text><text>{{research?'当前为私有本地研究模式，内置数据来自官方 GPX 导出；公开可见不等于可以再次公开分发。':'公开版内置 10 条来自 OpenStreetMap 的北京线路（绿道、登山步道、长城游览段）与 2 条数学合成示例；路线缩略图由程序按几何绘制。不含六只脚真实路线、原版图片或任何设备信息。所有轨迹均未经实走验证，不可用于户外导航。'}}</text><text>实现：本地检索筛选、交互地图、海拔图、收藏与浏览历史、GPX 导入、GPX/KML 导出、本地规划、前台 GPS 记录与本地备注。</text><text>未实现：官方账户、全站路线搜索、社交、支付会员、商业卫星图、道路寻路、后台轨迹、蓝牙设备、离线地图下载。</text><text>{{research?'这是研究界面，不是六只脚官方客户端。图片与轨迹不得随本项目公开发布。地图是 OpenStreetMap，与原版高德卫星图不同。':'线路数据 © OpenStreetMap 贡献者（ODbL 1.0），按关系 ID 可溯源；海拔取自 SRTM 90 m（NASA/USGS，公有领域），为采样插值而非实测。地图瓦片 © OpenStreetMap 贡献者。本页不是六只脚官方客户端。'}}</text></view></template>
   <template v-else-if="sheet==='routeMenu'"><button class="cell" @click="followRoute">导航至起终点 <Icon name="pin"/></button><button class="cell" @click="sheet='offline'">离线地图 <Icon name="cloud"/></button><button class="cell" @click="sheet='export'">导出轨迹文件 <Icon name="download"/></button><button v-if="current.id.startsWith('local-')" class="cell danger" @click="deleteCurrent">删除本地轨迹</button></template>
   <template v-else-if="sheet==='export'"><button class="export-option" @click="download('gpx')"><text>GPX格式</text><text>保留轨迹分段、海拔、时间与标注点名称</text></button><button class="export-option" @click="download('kml')"><text>KML格式（路径）</text><text>仅包含经纬度和海拔信息</text></button><view class="info-strip">仅导出当前路线，不访问原版私有接口</view></template>
   <template v-else-if="sheet==='layers'"><view class="layer-options"><button :class="{chosen:tiles}" @click="setTiles(true)"><view class="tile-thumb">OSM</view><text>街道地图</text></button><button :class="{chosen:!tiles}" @click="setTiles(false)"><view class="tile-thumb plain">⌁</view><text>仅轨迹</text></button><button @click="unavailable('商业地图','原版高德、天地图及星图服务需各自授权/密钥，本版不复用原版密钥。')"><view class="tile-thumb unavailable">＋</view><text>其他地图</text></button></view><button class="primary" @click="sheet='offline'">离线地图说明</button></template>
   <template v-else-if="sheet==='offline'"><view class="sheet-copy"><text>轨迹可本地保存，离线底图尚未实现。</text><text>本版不批量缓存 OpenStreetMap 瓦片。收藏或导出 GPX 不等于已下载离线地图。断网时可关闭在线底图查看轨迹形状，但无地形信息。</text></view><button class="primary" @click="download('gpx')">导出当前 GPX</button></template>
   <template v-else-if="sheet==='notes'"><view class="info-strip">仅保存本地备注，不向原版发布评论</view><textarea v-model="noteDraft" maxlength="1000" placeholder="写下路线备注…" class="note-input"/><button class="primary" @click="saveNote">保存本地备注</button></template>
   <template v-else-if="['activity','activityFilter','region','distanceFilter'].includes(sheet)"><button v-for="option in sheetOptions" :key="option" class="cell" @click="selectOption(option)">{{option}} <Icon name="chevron" :size="17"/></button></template>
   <template v-else-if="sheet==='tracks'"><button class="cell" @click="following=!following;sheet=''">{{following?'隐藏参考轨迹':'显示当前参考轨迹'}}<Icon name="eye"/></button><button v-for="r in routes" :key="r.id" class="cell" @click="current=r;following=true;sheet=''">{{r.title}}<Icon name="route" :size="20"/></button></template>
  </scroll-view></view></view>
 </view>
</template>
<script setup lang="ts">
import {ref,computed,watch,onMounted,onBeforeUnmount} from 'vue';
import TrackMap from '../../components/TrackMap.vue';import Icon from '../../components/Icon.vue';
import rawRoutes from 'virtual:vias-catalog';
const research=__VIAS_RESEARCH__;
const prefix=import.meta.env.BASE_URL || '/';
const asset=(name:string)=>prefix+(research?`static/research/${name}.jpg`:`static/demo/${name}.png`);
function routeOrigin(r:Route){return research?'六只脚':r.id.startsWith('osm-')?'OpenStreetMap':'Vias 示例';}
import {type Route,type Point,parseGpx,exportGpx,exportKml,durationLabel,distance,metrics,makeRoute,Recorder,xmlEscape} from '../../core/track';
type Page='home'|'routes'|'search'|'detail'|'record'|'plan'|'profile'|'library'|'favorites'|'history'|'destinations'|'photos'|'circles'|'settings';
const officialRoutes=(rawRoutes as Route[]).map(r=>({...r,cover:r.cover&&/^\/?static\//.test(r.cover)?prefix+r.cover.replace(/^\//,''):r.cover}));
function readStore<T>(key:string,fallback:T):T{try{const value=uni.getStorageSync('vias:'+key);return value?JSON.parse(value):fallback;}catch{return fallback;}}
function saveStore(key:string,value:unknown){try{uni.setStorageSync('vias:'+key,JSON.stringify(value));return true;}catch{toast('保存失败：本地存储空间不足，请先导出备份');return false;}}
const localRoutes=ref<Route[]>(readStore('routes',[])),favorites=ref<string[]>(readStore('favorites',[])),history=ref<string[]>(readStore('history',[])),notes=ref<Record<string,string>>(readStore('notes',{})),groups=ref<string[]>(readStore('groups',[]));
const routes=computed(()=>[...officialRoutes,...localRoutes.value]);const page=ref<Page>('home');const stack:Page[]=[];const current=ref<Route>(officialRoutes[0]);const sheet=ref('');const routeTab=ref('featured');const libraryTab=ref('local');const tiles=ref(readStore('tiles',true));const query=ref('');const searchDone=ref(false);const region=ref('不限');const activityFilter=ref('不限');const distanceFilter=ref('不限');const onlyFavorites=ref(false);const noteDraft=ref('');const groupName=ref('');const position=ref<Point|null>(null);const locationError=ref('');const following=ref(false);const activity=ref('徒步');const planPoints=ref<Point[]>([]);const planTitle=ref('我的规划线路');const recordMap=ref<InstanceType<typeof TrackMap>>();
const entries:{name:string;asset:string;page:Page}[]=[{name:'线路',asset:'route',page:'routes'},{name:'目的地',asset:'destination',page:'destinations'},{name:'照片墙',asset:'photo',page:'photos'},{name:'圈子',asset:'circle',page:'circles'}];
const photos=['footprint-1','footprint-2','photo-1','photo-2','photo-3','photo-4'].map(asset);const photoPlaces=research?['繁峙县','易县','临安市','安福县','安福县','永嘉县']:['示例插画 A','示例插画 B','示例插画 C','示例插画 D','示例插画 E','示例插画 F'];const destinations=officialRoutes.map(r=>r.place);
const titles:Partial<Record<Page,string>>={routes:'线路游记',search:'搜索线路',library:'我的轨迹',favorites:'我的收藏',history:'最近浏览',destinations:'目的地',photos:'照片墙',circles:'圈子',settings:'设置'};
const pageTitle=computed(()=>titles[page.value]||'景行');
const profileItems=[{label:'轨迹库',icon:'folder',page:'library'},{label:'探索足迹',icon:'pin',page:'photos'},{label:'离线资源',icon:'download',page:'offline'},{label:'自定义图层管理',icon:'layers',page:'layers'},{label:'运动数据',icon:'chart',page:'stats'},{label:'我的循迹',icon:'route',page:'following'},{label:'我的收藏',icon:'star',page:'favorites'},{label:'最近浏览',icon:'clock',page:'history'}];
const mapTools=[{name:'图层',icon:'layers'},{name:'组队',icon:'group'},{name:'拍照',icon:'photo'},{name:'叠加',icon:'layers'},{name:'设置',icon:'gear'}];
function eventValue(event:any):boolean{return Boolean(event.detail?.value);}
function toast(title:string){uni.showToast({title,icon:'none',duration:2500});}
function unavailable(title:string,content:string){sheet.value='';uni.showModal({title,content,showCancel:false});}
function go(p:Page){stack.push(page.value);page.value=p;sheet.value='';}
function back(){sheet.value='';page.value=stack.pop()||'home';}
function tab(p:Page){stack.length=0;page.value=p;}
function openRoute(r:Route){current.value=r;const next=[r.id,...history.value.filter(id=>id!==r.id)].slice(0,100);if(saveStore('history',next))history.value=next;go('detail');}
function toggleFavorite(id:string){const next=favorites.value.includes(id)?favorites.value.filter(x=>x!==id):[...favorites.value,id];if(saveStore('favorites',next)){favorites.value=next;toast(next.includes(id)?'已收藏到本机':'已取消收藏');}}
const displayedRoutes=computed(()=>routeTab.value==='nearby'&&position.value?[...routes.value].sort((a,b)=>distance(position.value!,a.segments[0][0])-distance(position.value!,b.segments[0][0])):routes.value);
const searchResults=computed(()=>routes.value.filter(r=>(!query.value.trim()||[r.title,r.id,r.place,r.author].some(s=>s.toLowerCase().includes(query.value.trim().toLowerCase())))&&(region.value==='不限'||r.place.includes(region.value))&&(activityFilter.value==='不限'||r.activity===activityFilter.value)&&(!onlyFavorites.value||favorites.value.includes(r.id))&&(distanceFilter.value==='不限'||(distanceFilter.value==='10公里以下'?r.distance<10:distanceFilter.value==='10–30公里'?r.distance>=10&&r.distance<=30:r.distance>30))));
function resetSearch(){query.value='';region.value='不限';activityFilter.value='不限';distanceFilter.value='不限';onlyFavorites.value=false;}
const libraryRoutes=computed(()=>page.value==='favorites'?routes.value.filter(r=>favorites.value.includes(r.id)):page.value==='history'?history.value.map(id=>routes.value.find(r=>r.id===id)).filter((r):r is Route=>!!r):localRoutes.value);
const hasTime=computed(()=>current.value.segments.some(s=>s.some(p=>!!p.time)));
const currentStats=computed(()=>[[hasTime.value?durationLabel(current.value.duration):'—',hasTime.value?'总时间':'用时未记录'],[current.value.maxSpeed>0?current.value.maxSpeed.toFixed(1):'—','最快速度(km/h)'],[current.value.duration?(current.value.distance/(current.value.duration/3600)).toFixed(1):'—','平均速度(km/h)'],[String(current.value.maxEle),'最高海拔(米)'],[String(current.value.ascent),'累计爬升(米)'],[String(current.value.descent),'累计下降(米)']]);
const routeDates=computed(()=>{const pts=current.value.segments.flat();const start=pts[0]?.time,end=pts[pts.length-1]?.time;const format=(t:string)=>{const d=new Date(t);return `${d.getFullYear()}.${d.getMonth()+1}.${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;};return start&&end?format(start)+' - '+format(end):'未包含记录时间';});
const elePoints=computed(()=>current.value.segments.flat().filter(p=>p.ele!=null));
const elevationRange=computed(()=>{const es=elePoints.value.map(p=>p.ele!);return es.length?Math.round(Math.min(...es))+' – '+Math.round(Math.max(...es)):'无海拔数据';});
const elevationImage=computed(()=>{const pts=elePoints.value;if(!pts.length)return 'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="360" height="120"><text x="100" y="65" fill="#999">无海拔数据</text></svg>');const es=pts.map(p=>p.ele!);const min=Math.min(...es),range=Math.max(...es)-min||1;let total=0;const dist:number[]=[];for(const segment of current.value.segments){segment.forEach((p,i)=>{if(i)total+=distance(segment[i-1],p);if(p.ele!=null)dist.push(total);});}const step=Math.max(1,Math.floor(pts.length/400));const sampled=pts.map((p,i)=>[8+dist[i]/(total||1)*344,110-(p.ele!-min)/range*95,i]).filter((p,i)=>i%step===0||i===pts.length-1);const line=sampled.map(p=>p.slice(0,2).join(',')).join(' ');const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 120"><path d="M8 15H352M8 60H352M8 110H352" stroke="#eee"/><polygon points="8,110 ${line} 352,110" fill="#00bf7922"/><polyline points="${xmlEscape(line)}" fill="none" stroke="#00bf79" stroke-width="2"/></svg>`;return 'data:image/svg+xml,'+encodeURIComponent(svg);});
const sheetTitles:Record<string,string>={about:'关于本地研究',routeMenu:'路线操作',export:'导出轨迹文件',layers:'选择地图',offline:'离线资源',notes:'本地路线备注',activity:'运动类型',activityFilter:'类型',region:'地区',distanceFilter:'里程筛选',tracks:'参考轨迹'};const sheetTitle=computed(()=>sheetTitles[sheet.value]||'');const sheetOptions=computed(()=>sheet.value==='activity'?['徒步','登山','骑行','跑步','自驾']:sheet.value==='activityFilter'?['不限','徒步','登山','骑行','跑步','自驾']:sheet.value==='region'?['不限',...destinations]:['不限','10公里以下','10–30公里','30公里以上']);
watch(sheet,v=>{if(v==='notes')noteDraft.value=notes.value[current.value.id]||'';});
function selectOption(v:string){if(sheet.value==='activity')activity.value=v;else if(sheet.value==='activityFilter')activityFilter.value=v;else if(sheet.value==='region')region.value=v;else distanceFilter.value=v;sheet.value='';}
function setTiles(v:boolean){if(saveStore('tiles',v))tiles.value=v;}
function saveNote(){const next={...notes.value,[current.value.id]:noteDraft.value};if(saveStore('notes',next)){notes.value=next;sheet.value='';toast('已保存本地备注');}}
function createGroup(){const n=groupName.value.trim();if(!n)return toast('请输入名称');if(groups.value.includes(n))return toast('名称已存在');const next=[...groups.value,n];if(saveStore('groups',next)){groups.value=next;groupName.value='';}}
function removeGroup(name:string){uni.showModal({title:'删除本地圈子？',content:name,success:r=>{if(r.confirm){const next=groups.value.filter(g=>g!==name);if(saveStore('groups',next))groups.value=next;}}});}
function previewPhoto(i:number){uni.previewImage({urls:photos,current:photos[i]});}
function profileAction(p:string){if(['offline','layers'].includes(p))sheet.value=p;else if(p==='stats')go('library');else if(p==='following'){following.value=true;go('record');}else go(p as Page);}
function mapTool(name:string){if(recordState.value!=='idle'&&['组队','设置'].includes(name))return toast('请先结束记录，再离开记录页面');if(name==='图层')sheet.value='layers';else if(name==='设置')go('settings');else if(name==='叠加')sheet.value='tracks';else if(name==='组队')go('circles');else unavailable('轨迹照片','照片关联与相机权限尚未实现。不会读取你的相册或自动上传照片。');}
function persistRoute(r:Route){const next=[r,...localRoutes.value];if(saveStore('routes',next)){localRoutes.value=next;return true;}return false;}
function importXml(xml:string){try{const r=parseGpx(xml);if(persistRoute(r)){openRoute(r);toast('GPX 已导入本机');}}catch(e){unavailable('导入失败',e instanceof Error?e.message:'文件读取失败');}}
function importFile(){
// #ifdef H5
const input=document.createElement('input');input.type='file';input.accept='.gpx,application/gpx+xml,application/xml,text/xml';input.onchange=async()=>{const f=input.files?.[0];if(!f)return;if(f.size>8_000_000)return unavailable('文件过大','最多支持 8 MB GPX。');try{importXml(await f.text());}catch{unavailable('导入失败','无法读取文件');}};input.click();
// #endif
// #ifdef MP-WEIXIN
uni.chooseMessageFile({count:1,type:'file',extension:['gpx'],success:r=>{uni.getFileSystemManager().readFile({filePath:r.tempFiles[0].path,encoding:'utf8',success:data=>importXml(String(data.data)),fail:()=>toast('读取失败')});}});
// #endif
}
function download(format:'gpx'|'kml'){
const content=format==='gpx'?exportGpx(current.value):exportKml(current.value);const filename=current.value.id+'.'+format;
// #ifdef H5
const url=URL.createObjectURL(new Blob([content],{type:format==='gpx'?'application/gpx+xml':'application/vnd.google-earth.kml+xml'}));const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);toast('已生成导出文件');
// #endif
// #ifdef MP-WEIXIN
const fs=uni.getFileSystemManager();const path=wx.env.USER_DATA_PATH+'/'+filename;fs.writeFile({filePath:path,data:content,encoding:'utf8',success:()=>{wx.shareFileMessage({filePath:path,fileName:filename,fail:()=>toast('分享已取消或不可用')});},fail:()=>toast('写入文件失败')});
// #endif
}
function deleteCurrent(){uni.showModal({title:'删除这条本地轨迹？',content:'不会影响原版数据，删除后不能恢复。',success:r=>{if(r.confirm){const next=localRoutes.value.filter(x=>x.id!==current.value.id);if(saveStore('routes',next)){localRoutes.value=next;sheet.value='';back();}}}});}
function clearLocal(){uni.showModal({title:'清除本地研究数据？',content:'将删除本地轨迹、收藏、历史、备注和圈子；内置官方导出路线不删除。建议先逐条导出。',success:r=>{if(r.confirm){for(const k of ['routes','favorites','history','notes','groups'])uni.removeStorageSync('vias:'+k);localRoutes.value=[];favorites.value=[];history.value=[];notes.value={};groups.value=[];toast('已清除本地数据');}}});}
function followRoute(){following.value=true;sheet.value='';go('record');toast('参考轨迹已载入；不提供语音转向导航');}
function startPlan(){if(recordState.value!=='idle')return toast('请先结束当前记录');planPoints.value=[];planTitle.value='我的规划线路';go('plan');}
function addPlanPoint(p:Point){planPoints.value.push(p);}
function savePlan(){if(planPoints.value.length<2)return toast('请至少添加两个途经点');if(!planTitle.value.trim())return toast('请输入线路名称');const r=makeRoute(planTitle.value.trim(),[[...planPoints.value]]);if(persistRoute(r)){back();openRoute(r);}}
const recorder=new Recorder();const recordState=ref(recorder.state);const recordSeconds=ref(0);const recorded=ref<Point[][]>([]);const recordPoints=computed(()=>recorded.value.reduce((n,s)=>n+s.length,0));const recordDistance=computed(()=>metrics(recorded.value).distance);const mapSegments=computed(()=>page.value==='plan'?[planPoints.value]:recordState.value!=='idle'?recorded.value:following.value?current.value.segments:[]);
let watchId:number|undefined,timer:ReturnType<typeof setInterval>|undefined;let locationGeneration=0;const wakeActive=ref(false);let wake:any;
async function requestWake(){
// #ifdef H5
try{if(!('wakeLock' in navigator))return toast('当前浏览器不支持屏幕唤醒锁');wake=await (navigator as any).wakeLock.request('screen');wakeActive.value=true;wake.addEventListener('release',()=>wakeActive.value=false);}catch{toast('无法保持屏幕唤醒，请检查浏览器权限');}
// #endif
// #ifdef MP-WEIXIN
uni.setKeepScreenOn({keepScreenOn:true,success:()=>wakeActive.value=true,fail:()=>toast('设置失败')});
// #endif
}
function receivePosition(p:Point){position.value=p;locationError.value='';if(recorder.state==='recording'){recorder.add(p);recorded.value=recorder.segments.map(s=>[...s]);}}
function locationFailure(message:string){locationError.value=message;}
function locate(){
// #ifdef H5
if(!window.isSecureContext)return unavailable('定位需要安全连接','请在这台 Mac 打开 http://localhost:8776；手机访问需配置 HTTPS。HTTP 的 Tailscale IP 可以预览，但浏览器通常不允许定位。');if(!navigator.geolocation)return toast('浏览器不支持定位');navigator.geolocation.getCurrentPosition(p=>{receivePosition({lat:p.coords.latitude,lon:p.coords.longitude,ele:p.coords.altitude,time:new Date(p.timestamp).toISOString()});recordMap.value?.locate();},e=>{locationFailure(e.message);toast('定位失败，请检查位置权限');},{enableHighAccuracy:true,timeout:15000});
// #endif
// #ifdef MP-WEIXIN
uni.getLocation({type:'wgs84',success:p=>{receivePosition({lat:p.latitude,lon:p.longitude,ele:p.altitude,time:new Date().toISOString()});},fail:()=>locationFailure('定位失败，请检查位置权限与 AppID')});
// #endif
}
function startRecord(){
if(recorder.state!=='idle')return;
// #ifdef H5
if(!window.isSecureContext)return unavailable('无法启动 GPS 记录','手机 HTTP 页面不能使用定位，请先配置 HTTPS。桌面请通过 localhost 打开并授予位置权限。');if(!navigator.geolocation)return unavailable('无法记录','当前浏览器不支持地理位置。');const generation=++locationGeneration;locationError.value='正在获取 GPS，尚未开始记录…';navigator.geolocation.getCurrentPosition(p=>{if(generation!==locationGeneration||page.value!=='record'||recorder.state!=='idle')return;if(p.coords.accuracy>100){locationFailure('未开始记录：定位精度超过 100 米，请移至开阔处后重试');return;}recorder.start();recordState.value=recorder.state;receivePosition({lat:p.coords.latitude,lon:p.coords.longitude,ele:p.coords.altitude,time:new Date(p.timestamp).toISOString()});watchId=navigator.geolocation.watchPosition(p=>{if(p.coords.accuracy>100){locationFailure('定位精度超过 100 米，暂不写入轨迹');return;}receivePosition({lat:p.coords.latitude,lon:p.coords.longitude,ele:p.coords.altitude,time:new Date(p.timestamp).toISOString()});},e=>locationFailure('GPS 中断：'+e.message),{enableHighAccuracy:true,maximumAge:0,timeout:20000});requestWake();},e=>locationFailure('未开始记录：'+e.message),{enableHighAccuracy:true,maximumAge:0,timeout:15000});
// #endif
// #ifdef MP-WEIXIN
unavailable('小程序 GPS 记录待验证','小程序位置权限及持续记录尚未在开发者工具/真机验收，当前不启动模拟记录。');
// #endif
}
function toggleRecord(){if(recorder.state==='recording')recorder.pause();else recorder.resume();recordState.value=recorder.state;}
function stopGps(){locationGeneration++;
// #ifdef H5
if(watchId!==undefined)navigator.geolocation.clearWatch(watchId);watchId=undefined;wake?.release();
// #endif
wakeActive.value=false;}
function finishRecord(){if(recorder.state==='recording')recorder.pause();recordState.value=recorder.state;uni.showModal({title:'结束并保存轨迹？',content:`已记录 ${recordPoints.value} 个点，${recordDistance.value.toFixed(2)} 公里。${recordPoints.value<2?'GPS 点不足，确认后仅结束，不保存空轨迹。':''}`,success:result=>{if(!result.confirm)return;if(recordPoints.value>=2){const r=makeRoute(new Date().toLocaleDateString('zh-CN')+' '+activity.value,recorder.segments.filter(s=>s.length),'本地前台 GPS 记录');r.duration=recorder.seconds();r.activity=activity.value;if(!persistRoute(r))return;current.value=r;stopGps();recorder.reset();recordState.value='idle';recorded.value=[];go('detail');}else{stopGps();recorder.reset();recordState.value='idle';recorded.value=[];toast('记录结束，未保存空轨迹');}}});}
function leaveRecord(){if(page.value==='record'&&recordState.value!=='idle')return toast('请先暂停并结束记录');locationGeneration++;back();}
function visibilityChanged(){
// #ifdef H5
if(document.hidden&&recorder.state==='recording'){recorder.pause();recordState.value='paused';locationFailure('页面进入后台，已暂停记录；返回后请手动继续。');}
// #endif
}
function beforeUnload(e:BeforeUnloadEvent){if(recorder.state!=='idle'){e.preventDefault();e.returnValue='';}}
onMounted(()=>{timer=setInterval(()=>recordSeconds.value=recorder.seconds(),1000);
// #ifdef H5
document.addEventListener('visibilitychange',visibilityChanged);window.addEventListener('beforeunload',beforeUnload);
// #endif
});
onBeforeUnmount(()=>{if(timer)clearInterval(timer);stopGps();
// #ifdef H5
document.removeEventListener('visibilitychange',visibilityChanged);window.removeEventListener('beforeunload',beforeUnload);
// #endif
});
</script>
<style src="./style.css"></style>
