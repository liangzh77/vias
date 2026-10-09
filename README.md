# 景行（Vias）

户外轨迹 H5 / 微信小程序研究项目，采用 **uni-app、Vue 3、TypeScript、Leaflet**。界面与交互研究参考六只脚，但不是其官方客户端，也未连接其账户、路线库或商业服务。

> **公开版本只包含原创示例插画和两条数学合成轨迹。示例不是真实道路，不可用于户外导航。** 原版图片、真实导出路线、手机截图和设备调试信息不在本仓库。

在线演示（公开合成示例版，非完整应用）：<https://liangz77.cn/vias/>

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
npm test                    # 11 个轨迹领域测试，无私有数据依赖
npm run build:h5
npm run build:mp-weixin
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

默认只监听 `127.0.0.1:8776`，不自动公开部署。生产构建地图依赖该服务器的 `/map/tiles/*`；开发模式直接请求 OSM。瓦片代理仅访问固定 OpenStreetMap 域名、校验坐标、按需请求、限量缓存，不提供批量下载或离线地图包。需系统 `curl`；界面保留 OSM 署名。

浏览器冒烟测试（先启动上述预览）：

```sh
cd client
npx playwright install chromium
npm run test:browser
# 也可以通过 PLAYWRIGHT_CHROMIUM_EXECUTABLE 指定已有 Chromium/Chrome
```

## 功能与边界

已实现：
- 首页、路线列表、基于本地数据的搜索筛选、详情、矢量地图及海拔图。
- 本地收藏、浏览历史、备注、轨迹库和圈子名称管理。
- GPX 导入、GPX / KML 路径导出；拒绝外部 XML 实体、异常坐标和超限文件，保留轨迹分段。
- 点选地图的直线规划、撤销及保存（**不是道路寻路**）。
- H5 前台 GPS 记录、暂停/继续和保存；定位成功后才开始，页面进入后台自动暂停。

未实现：原版云服务/全站路线搜索、账号与社交、支付会员、商业卫星图、离线地图包、道路/语音导航、罗盘雷达、相机标注、心率外设、锁屏后台 GPS。

这是**阶段性研究版本，未完成全功能或像素级验收**。自动化定位测试不能证明真实户外精度。手机 HTTP 页面一般不能定位，需要 HTTPS；localhost 可作为安全上下文。部分手机浏览器的强制深色模式会改写颜色。

## 数据与发布安全

- `client/src/core/demo-routes.json`：程序生成的示例，不代表真实行走轨迹。
- `client/src/static/demo/`：原创程序绘制插画；可用 `scripts/generate-demo.py` 重建（需 Python + Pillow）。
- 字体为更名后的 Noto Sans CJK / Roboto 子集，保留 OFL 授权与署名，见 `client/src/static/fonts/`。
- `.gitignore` 排除手机截图、原始轨迹、调试工具、私有研究目录、日志和环境密钥。公开仓库不代表第三方素材获得再发布许可。
- 可选的 `VIAS_RESEARCH=1` 仅供拥有本地研究数据的人切换目录；公开克隆不需要此开关。该模式的构建**不得直接对外发布**。
- 公共构建默认使用示例，并通过 npm postbuild 钩子移除本地研究图片、检查真实目录标识符泄露。应使用 `npm run build:*`，不要绕过 postbuild。

公开发布范围及验证记录见 [docs/PUBLICATION.md](docs/PUBLICATION.md)。本仓库未为项目自有代码另行选择开源许可证；公开可见不自动等于任意再授权。第三方字体及依赖按各自许可证使用。
