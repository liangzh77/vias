# 景行（Vias）

户外轨迹 H5 / 微信小程序研究项目，采用 **uni-app、Vue 3、TypeScript、Leaflet**。界面与交互研究参考六只脚，但不是其官方客户端，也未连接其账户、路线库或商业服务。

> **公开版应用的北京快照包含 14,430 条来自 OpenStreetMap 的线路（ODbL 1.0，2026-10-09 提取：23 条关系 + 14,407 条命名路径片段）和 2 条数学合成示例；路线缩略图按真实 OSM 几何绘制，公开版不放占位插画或照片，海拔为公开地形瓦片采样插值。命名路径片段不是完整行程，全部轨迹未经实走验证，不可用于户外导航。** 六只脚原版图片、其账户导出的真实路线、手机截图和设备调试信息不在本仓库。

在线演示（公开版，非完整应用）：<https://liangz77.cn/vias/>

## 快速开始

需要 Node.js 22、npm。

```sh
git clone https://github.com/liangzh77/vias.git
cd vias/client
npm ci
npm run dev:h5
```

打开 <http://localhost:8776/>。可以自行导入有权使用的 GPX 文件；数据保存在当前浏览器，不上传到六只脚服务。

```sh
npm run typecheck
npm test                    # 轨迹/目录/空间查询/分段/导出/地图提供方，无私有数据依赖
npm run build:h5
npm run build:mp-weixin
npm run verify:catalog      # 逐条校验本地目录：分片、点数、起点、里程、缩略图
```

小程序产物：`client/dist/build/mp-weixin`。**目前只验证编译，未通过微信开发者工具/真机验收**；需要自己的 AppID、隐私声明、权限配置，并验证字体/SVG、原生地图坐标系和定位行为。

## 构建预览

在项目根目录运行：

```sh
node scripts/serve.mjs
# 可选：指定自己的 Tailscale 地址，仅额外绑定该地址
TAILSCALE_BIND=<本机的Tailscale地址> node scripts/serve.mjs
# 可选：公网地图网络不通时，为瓦片转发配置自己的 HTTP 代理
MAP_HTTP_PROXY=http://127.0.0.1:<代理端口> node scripts/serve.mjs
```

默认只监听 `127.0.0.1:8776`，不自动公开部署。本地研究预览服务器可通过 `/map/tiles/*` 请求瓦片，**生产站点不使用该代理**。旧版 `20261011T025121Z` 由手机直连 `tile.openstreetmap.org` 超时，轨迹仍可见；该真机失败记录保留。不能把本地研究代理搬到生产。

**当前线上 release `20261012T060140Z`**：H5 在打开地图时异步加载 MapLibre GL Leaflet + OpenFreeMap 官方 Liberty 向量样式，用户设备直接从第三方获取当前视口资源，Vias 不代理、不缓存全量底图。保留 Leaflet/WGS84 轨迹和可点单行署名，右下角详细说明默认收起为 ⓘ，展开后可查看 OpenFreeMap、© OpenMapTiles、OpenStreetMap 链接、第三方请求披露和渲染库许可；可见特征、真实绘制与无失败瓦片后才报告就绪，新视口失败约 25 秒后诚实降级。服务无 SLA。**本次首页交互地图及详情三态面板已获 Astra 独立本地桌面 approve；正式 URL 的协调者桌面回归与全量 HTTP 哈希校验通过，真机验收仍未进行。** 非商用/自用不自动免除中国公开地图适用的审图与服务要求；本次技术发布不代表已取得审批、法律合规结论或导航资质。

浏览器冒烟测试（先启动上述预览）：

```sh
cd client
npx playwright install chromium
npm run test:browser
# 也可以通过 PLAYWRIGHT_CHROMIUM_EXECUTABLE 指定已有 Chromium/Chrome
```

## 地图优先交互子阶段（已发布，仅含首页地图与详情面板）

- H5 首页保留经典列表，新增“地图”切换：全目录 bbox 候选聚合；放大后每次范围查询最多 12 条路线、3 个几何分片，轨迹可点选高亮、联动卡片、打开详情并返回原视口/选择。过期查询取消；范围数据失败有明确错误和重试。bbox 候选不等同于精确道路相交，界面据实标为候选。
- 详情三态面板可拖把手、按钮与键盘控制；地图真实随面板调整大小，不重建实例。390×844 模拟移动视口收起后地图约占 81%，保留滚动、高程、分段和三种导出。展开/横屏保留至少 120px 地图区供控件与完整署名；ⓘ 说明按可用视口定位，短地图时放在地图下方，不裁切来源链接、第三方请求披露或许可下载。裁切问题返工后经 Astra 独立复验通过，正式 URL 三态/旋转回归也通过。
- `prepare-catalog.mjs` 从已有 ODbL 分片离线派生 `spatial.json` + `spatial-manifest.json`；原 index / 94 分片 / 14,430 几何小图及原 manifest 不改。新 sidecar 单独记录来源、输入与输出 SHA-256；构建/打包封闭白名单仅增加这两个指定文件，Git 不含全量 sidecar。没有底图批量采集、截图缓存或后台队列。
- **真实底图卡片截图持久缓存尚未实施**：提供方自动收集条款的许可待澄清。卡片仍显示明确标注的几何小图，不把此次两个交互目标说成全部三项目标完成。
- 本地桌面 Chrome + 390×844/横屏自动回归：`scripts/test-map-first.mjs`；crossing、慢索引、取消/过期响应和空间目录版本错配：`scripts/test-map-first-fixtures.mjs`。原 `scripts/test-map-provider.mjs` 的真实第三方绘制、失败恢复和 GPU 读取预算断言保留。运行日志/截图在 gitignored `artifacts/map-first/interactive/`。
- 功能提交 `a14b959`，已推送并发布为 `20261012T060140Z`；原 `20261011T154426Z` 保留回退。包共 14,546 文件、JS 1,593,567 B，逐文件 HTTP SHA-256 一致；独立本地批准仅覆盖这两个交互目标，线上回归不冒充新的独立审查。手机完全未操作，真机/微信平台仍留待后续人工验证；中国公开地图审图与服务要求未核实。

## 功能与边界

已实现：
- 首页、路线列表、基于本地数据的搜索筛选、详情、矢量轨迹及可触摸/展开的海拔剖面、真实每公里分段。附近列表可按真实起点距离（需定位）、路线里程或爬升排序。
- 首页「经典线路」是 4 条真实知名北京路线（箭扣西段长城、下马威·东灵山小道、妙峰古道中道、京西古道·门潭段），缩略图按真实 OpenStreetMap 几何绘制；**公开版不内置任何占位插画或示例照片**——没有真实照片时照片墙就是空状态。
- 本地收藏、浏览历史、备注、轨迹库和圈子名称管理。
- GPX 导入、GPX / KML（轨迹）/ KML（路径）三种导出；无原始时间的 OSM 线路不会在轨迹 KML 中编造时间。拒绝外部 XML 实体、异常坐标和超限文件，保留轨迹分段与来源/许可。
- 点选地图的直线规划、撤销及保存（**不是道路寻路**）。
- H5 前台 GPS 记录、暂停/继续和保存；定位成功后才开始，页面进入后台自动暂停。

未实现：原版云服务/全站路线搜索、账号与社交、支付会员、商业卫星图、离线地图包、道路/语音导航、罗盘雷达、相机标注、心率外设、锁屏后台 GPS。

这是**阶段性研究版本，未完成全功能或像素级验收**。自动化定位测试不能证明真实户外精度。手机 HTTP 页面一般不能定位，需要 HTTPS；localhost 可作为安全上下文。部分手机浏览器的强制深色模式会改写颜色。旧版在 SM-S9280 / Samsung Internet 上验证了详情、触摸剖面、分段与公开 GPX 下载，但 OSM 公共瓦片直连超时。OpenFreeMap 的**旧本地预览**曾在同机真实绘图；最新修复版已发布线上，但手机不在用户身边，**新版线上真机验收待补**，不能用旧预览截图冒充新版本验收。这不是 Vias 原生 Android App 验收。

## 数据与发布安全

**仓库里只有示例子集，完整快照在服务器上。** 数据集分成三层：

1. **仓库提交的示例子集** `client/catalog-sample/`（17 个文件 / 357,648 B）：14 条精选线路（10 条关系 + 4 条经典命名路径）的索引、目录清单、缩略图与一个几何分片，克隆后无需任何私有数据即可构建、运行并跑通全部测试。
2. **首屏预览** `client/src/core/featured-routes.json`：构建产物，由 `scripts/prepare-catalog.mjs` 从目录索引生成，让“精选”tab 在第一帧就有内容（不含坐标）。
3. **本地完整快照**（Git 忽略）：`data/catalog/{osm-index.json,thumbs/,shards/}`。由 `scripts/build-osm-catalog.mjs --all --elevation` 从本地（Git 忽略）的 OSM 北京抽取生成，再用 `scripts/prepare-catalog.mjs --full` 安装到 `client/src/static/osm/`（构建产物，同样忽略）。**不会随 Git 发布**；只有部署到自己的服务器时才会公开。

公开客户端按需加载：

- `client/src/static/osm/index.json`：目录索引（14,430 条，2.25 MB；gzip 后约 426 KB），只含标题、类型、里程、起点、点数与精选标记，**不含坐标**。首屏不等待它：首页先渲染预览中的四条真实经典路线卡，合成示例留在列表里；索引在首帧之后（`requestIdleCallback`）才请求，进入“全部”或搜索页会立即触发。
- `client/src/static/osm/routes/shard-NNN.json`：坐标按约 5,000 点/片切成 94 个分片，**打开哪条线路才下载哪个分片**（单条约 40 KB gzip；同一分片只下载一次，失败即缓存清除以便重试）。索引与分片在运行时都会做结构校验：重复 ID、分片键与目录不符、越界坐标、非数字坐标一律拒绝渲染。
- `client/src/static/osm/manifest.json`：机器可读的数据清单（来源、提取日期、许可、海拔来源、计数、索引与每个分片/缩略图的 SHA-256、复现步骤），由 `scripts/prepare-catalog.mjs` 与数据一起写盘。它是发布快照的**唯一声明**：目录数据无法用人工白名单列出（14,430 张缩略图不具可审阅性），所以 `scripts/release.py` 改为读回这份清单，未经声明或哈希不符的 `static/osm/*` 一律拒绝打包。
- **回归闸门**：`scripts/check-public-build.mjs` 会拒绝超过 6 MB 的 JS 分块、H5 全部 JS 超过 2 MB、任何未在索引里出现的 `static/osm/*` 文件与哈希不符的缩略图/分片，并证明索引没有被内联进 bundle（比对索引尾部与抽样标题）。

许可与署名：

- 线路数据 © OpenStreetMap 贡献者，许可 **ODbL 1.0**（<https://opendatacommons.org/licenses/odbl/1-0/>），可按关系/路径 ID 溯源；再分发必须保留署名与许可，也不得暗示官方认可。
- 海拔取自公开地形瓦片（terrarium，底层为 SRTM 等公有领域高程数据，约 30 m），为采样插值，**非实测、未实走验证、不可导航**；许可与线路数据分开说明。
- 命名路径片段是 OSM 中带名字的道路/步道几何，**不是完整行程**，也没有起点终点语义；截至 2026-10-09 提取。
- 应用内“数据说明与许可”页（线路页提示条 → 数据说明）给出同样的说明、许可链接与可复制的目录/清单地址。

**务必注意**：把完整快照部署到服务器等于公开该数据集（Git 忽略只是不提交，不是访问控制）。要改成只发布示例子集：`node scripts/build-public.mjs --sample`。

- `client/src/core/public-routes.ts`：公开构建的合成示例入口；不含任何 OSM 几何，几何只从分片按需下载。
- `client/src/core/demo-routes.json`：程序生成的数学合成示例，不代表真实行走轨迹。
- `client/src/static/demo/`：仅保留原创品牌图和两条数学合成示例路线的封面；公开版没有照片墙或首页占位插画。可用 `scripts/generate-demo.py` 重建（需 Python + Pillow）。
- 字体为更名后的 Noto Sans CJK / Roboto 子集，保留 OFL 授权与署名，见 `client/src/static/fonts/`。
- `.gitignore` 排除手机截图、原始轨迹、调试工具、私有研究目录、日志和环境密钥。公开仓库不代表第三方素材获得再发布许可。
- 可选的 `VIAS_RESEARCH=1` 仅供拥有本地研究数据的人切换目录；公开克隆不需要此开关。该模式的构建**不得直接对外发布**。
- 公共构建默认使用 `public-routes.ts`（OSM 线路 + 合成示例），并通过 npm postbuild 钩子移除本地研究图片、检查真实目录标识符泄露。应使用 `npm run build:*`，不要绕过 postbuild。H5 构建产物内置 OSM/ODbL 与地形瓦片署名。

公开发布范围及验证记录见 [docs/PUBLICATION.md](docs/PUBLICATION.md)。本仓库未为项目自有代码另行选择开源许可证；公开可见不自动等于任意再授权。第三方字体及依赖按各自许可证使用。
