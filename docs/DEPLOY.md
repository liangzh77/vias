# Vias 公开静态部署

当前公开版包含北京 OpenStreetMap 提取快照（14,430 条路线/命名路径片段）、数学合成轨迹、程序绘制的缩略图、原创插画和开源字体。**公网部署即公开完整数据集**，再分发必须遵守 ODbL 署名与许可。命名路径片段不是完整行程；海拔来自地形插值、非实测，轨迹未经实走验证，**不可用于导航**。账户、支付、组队与离线地图等未接入服务。收藏、备注和 GPX 导入保存在浏览器；导出在本机生成。GPS 需要 HTTPS 和主动授权，不应向站点上传私人轨迹。

## 最新发布：20261012T060140Z（2026-10-12）

- 用户明确“提交、推送、部署”；发布功能提交 `a14b959`，只含首页交互路线地图/列表切换及详情三态可拖动面板。收起时390×844模拟移动视口地图占80.57%，返回保留首页视口/选择。**卡片真实底图截图缓存仍未实现**，许可待澄清；本次不包含它。
- 真实 Sol6.1 medium 实施、Astra high 独立两轮验收，第二轮 `approve`；首轮展开/横屏说明裁切R1修复。报告 `artifacts/map-first/interactive/review-2/REVIEW.md`；49项客户端测试、11项公开构建/发布/config离线测试、sidecar测试、typecheck、H5/MP构建、目录校验及完整Chrome回归通过。手机完全未连接/操作，独立批准仅限桌面交互子阶段，不是法律或真机结论。
- 发布包从干净 `git archive a14b959` 构建，复用本地依赖和完整目录。初次干净构建因没有旧manifest而生成新时间戳，数据核对发现仅原manifest变化；该包留作证据、未上传。以已核对SHA的原manifest作为 `stampGenerated` 输入重新构建，原14,526文件全部字节不变，仅新增 `spatial.json`、`spatial-manifest.json`（ODbL派生bbox，输入/输出哈希可追溯）。两个新增文件与独立验收哈希相同，14,430路线/94分片未变。
- 最终包14,546文件 / 72,947,085 B，H5 JS 1,593,567 B；archive SHA-256 `dad53d43d68989379561e05c33160909cc6e1616f1b73e7d0f9d4f445c6e76c2`；扁平manifest SHA-256 `097aa7fafcde2d071f487bc68d85e9f4815d0e4db567557a99d0c64c157f72eb`。包/manifest/三份发布工具上传前后SHA一致。
- 远端 detached `setsid nohup` 发布完整成功：`HTTP_OK files=14546 SHA-256 matches; metadata_404=14554`、`PUBLISH_OK`、`DEPLOY_SITE_OK`、`DEPLOY_EXIT=0`。`current=releases/20261012T060140Z`，旧 `20261011T154426Z` 和其 `.deploy-20261011T154426Z/manifest.json` 保留回退。当前清单在 `.deploy-20261012T060140Z/manifest.json`，不在公开树根。
- 干净包localhost及正式URL均完整通过 `test-map-first.mjs`、未削弱的 `test-map-provider.mjs`：地图/面板/链接/许可/旋转/三种导出/失败恢复、0pageerrors、拖动readPixels9。正式URL是协调者桌面回归，不是新的独立审查。主站/Fleeting/HairPlay入口响应前后逐字节相同；Caddy站点与主配置SHA不变，无reload/服务重启。
- 本轮发布证据：gitignored `artifacts/map-first/publish/`。回退用旧版自己的manifest与协调锁、`--mode switch`；不删除旧版、不恢复数据目录、不改Caddy。

## 历史发布：20261011T154426Z（2026-10-11）

- 功能提交 `618f6cf`：按用户要求，将 H5 地图右下角三行说明收起为 ⓘ；展开后保留来源链接、第三方请求披露及渲染库许可证下载。正常状态不再显示“已绘制”，失败时单独显示提示；修正无底图提示的条件。收起署名不代表已满足提供方署名要求，个人测试不自动豁免。
- 类型检查、45 项单测、公开构建及更新后的完整地图行为回归通过；本地首轮链接 popup 等待超时保留在 `artifacts/compact-credit/browser.log`，修正条件后的完整重跑通过，正式 URL 同脚本也通过（拖动读回9次、失败/恢复、说明点击/键盘收起与链接/许可下载、errors=[]）。H5 JS 1,582,436 B。未做新的独立审查或真机验收，未连接手机。
- 已提交并推送。远端 `HTTP_OK files=14544 SHA-256 matches; metadata_404=14552`、`PUBLISH_OK`、`DEPLOY_SITE_OK`、`DEPLOY_EXIT=0`。`current=releases/20261011T154426Z`；上一版 `20261011T094122Z` 保留回退；包清单在 `.deploy-20261011T154426Z/manifest.json`。未改 Caddy 配置或发布工具。证据在 gitignored `artifacts/compact-credit/`。
- 下文 OpenFreeMap 首次发布章节及其独立 approve 仅描述历史版本，不能当作本次 UI 变更的新独立审查。

## 本地准备

```sh
npm --prefix client ci
npm --prefix client run typecheck
npm --prefix client test
npm --prefix client run build:public
VIAS_RESEARCH=0 npm --prefix client run build:mp-weixin
python3 scripts/test_release.py
python3 scripts/test_public_build.py
python3 scripts/test_config_transaction.py
# GNU/Linux（仅临时目录 + 127.0.0.1 随机端口）:
# python3 scripts/test_atomic_switch.py
# python3 scripts/test_release_remote.py
```

`build:public` 强制 `VIAS_RESEARCH=0`、资源基址 `/vias/`，不会继承私有研究模式。根路径本地开发仍用 `dev:h5`、`build:h5`；私有研究只在本机使用 `VIAS_RESEARCH=1`，绝不发布其输出。历史 release `20261011T025121Z` 直接加载 `https://tile.openstreetmap.org/`，真机底图失败；OpenFreeMap 首次上线 release `20261011T094122Z` 的 H5 按需异步加载 MapLibre GL Leaflet 与官方 `https://tiles.openfreemap.org/styles/liberty` 向量样式，保留 Leaflet/WGS84 轨迹；公开显示 OpenFreeMap、© OpenMapTiles、OpenStreetMap 三个可点署名链接与第三方视口请求披露。外部服务失败保留轨迹，不提供瓦片代理、批量预取或离线包。用户明确要求先发布、后补最新修复版的独立真机复验，故当前是**待真机验收的临时技术版本**；桌面独立 approve 不等于真机或中国地图审批/导航资质已通过。

`check-public-build.mjs` 校验 `scripts/public-assets.json` 的 SHA-256，动态编译文件必须与 Rollup 生成的独立 `.vias-h5-inventory.json` 文件集和哈希完全匹配，并只允许限定类型；该清单位于构建目录的父目录，不进入公开包。复制构建到其他路径打包时必须同步父目录清单，或用 `VIAS_BUILD_INVENTORY` 指定可信清单；字体即使在 `assets/` 也必须匹配批准字体哈希。未知文件、source map、元数据、软链接、私有标识或路径都会阻断打包。仅清理与已知本机研究源文件逐字节匹配的已知研究副本；未知研究文件也拒绝。失败产物保留用于调查，不能上传。

目录数据（`static/osm/**`）不在 `public-assets.json` 里：14,430 张缩略图既无法人工审阅，也无法用小型白名单表达。它在两处被独立约束：`check-public-build.mjs` 从 **索引** 推导封面与分片集合、要求清单里的每个缩略图/分片哈希与磁盘一致、并校验清单与索引的来源/许可/计数互洽；`release.py pack` 则读回随数据一起发布的 `static/osm/manifest.json`，**只有清单声明且哈希相符的 `static/osm/*` 才能打包**，未声明、多余或清单里声明却未构建的文件都会失败。新增空间索引使用独立 `spatial-manifest.json` 声明并绑定原index/分片SHA与派生输出 `spatial.json`，封闭白名单只补这两个指定文件，原manifest保持不变。两份检查都不能用环境变量绕过；发布完整快照仍需要显式运行 `node scripts/prepare-catalog.mjs --full`。

推荐 `python3 scripts/export-public.py <全新导出目录>`，只导出 Git 跟踪与非 ignored 新文件（未提交修改也会导出），复用本机依赖后在导出目录构建。不要把私有目录、仓库、依赖或源码上传。

```sh
bash scripts/package-release.sh <公开h5目录> <全新包目录>
python3 scripts/release.py verify-archive <包目录>/release.tgz <包目录>/manifest.json
node scripts/preview-release.mjs <公开h5目录> 8787
PREVIEW_URL=http://127.0.0.1:8787/vias/ node scripts/deploy-browser-test.mjs
```

包是 Python USTAR，没有 macOS 资源叉；manifest 列出真实文件集和 SHA-256。`verify-tree` 拒绝多余文件或目录。权限为目录 755、文件 644。

## Linux 隔离验证

已在 GNU/Linux（GNU coreutils 9.4、Python 3.11.6）实际通过 `test_atomic_switch.py`：200 次原子切换、连续读者无断链、首次和已有版本失败恢复。`test_release_remote.py` 的 5 项集成测试调用完整 `release-remote.sh`，验证首次发布、升级、显式旧版本切换、真实回环 HTTP 503 导致首次/已有版本回滚、逐文件 SHA-256、目录 755/文件 644，以及额外文件/空目录/软硬链接污染拒绝。所有合成测试数据和发布根位于临时目录，HTTP 仅监听 `127.0.0.1` 随机端口，结束关闭服务并删除临时目录。未据此声称已验证生产 Caddy 或公网发布。

## 部署与回滚（仅独立 Gate approve 且协调者明确指示后）

不得执行全站发布脚本。只读获取线上单站点片段，使用 `caddy-vias.py <实际片段副本> <候选>` 生成仅新增 `/vias` 301 和 `/vias/*` 静态路由的候选；实际生产片段使用 `(main_site_routes)`，脚本仅插入该片段且保留原有混合换行字节。无 SPA fallback，未知路径必须 404。脚本拒绝未知站点头和已存在的 Vias 路由，需人工审阅；绝不能用旧本地整站配置替换生产。

远端先创建独立 `vias/releases` 目录、传输已验证包、manifest 和最小验证工具。部署根目录、URL 必须明确给出；`release-remote.sh deploy <UTC版本> <manifest> <checker> <archive> <绝对发布根> <公开URL>` 使用锁、逐文件校验和 GNU `mv -T` 原子切换 `current`。首次不存在 current 也支持失败恢复为未发布；已有 current 必须是 `releases/<UTC版本>` 相对软链。HTTP 检查失败会恢复旧 current；未知并发修改不会覆盖。首次部署由 `deploy-site.py <UTC版本> <manifest> <checker> <archive> <绝对发布根> <公开URL> --config <站点片段> --candidate <候选> --expected-old-hash <原hash> --backup <全新备份>` 协调：先启用路由，再切换与探活；发布脚本失败会 CAS 恢复本次配置，任何他人新修改则拒绝覆盖。后续已存在且已核实路由的部署不提供配置参数。所有合作发布者必须通过此协调脚本持有 `.site-transaction.lock`，不要绕过它直接并发调用底层切换脚本。

`config-transaction.py <生产站点片段> <候选> <expected-old-sha256> <全新备份路径>` 比对原哈希、独立重新生成路由候选、备份、原子替换、验证 Caddy 主入口、平滑 reload；验证或 reload 失败恢复旧片段。全程只重载 Caddy，不重启应用。所有配置发布者必须遵守同一片段锁；外部发布者修改被检测到时不擅自回滚，转人工恢复。此工具的自动回滚只覆盖本次验证/reload 失败；后续撤销路由需要确认实际哈希和备份内容，用 `config-transaction.py <片段> <可信旧备份> <当前hash> <全新撤销备份> --restore` 执行受锁 CAS 恢复、validate、reload；不要把未经审核内容当作旧备份。

回退文件：用旧版本自己的 manifest，执行 `deploy-site.py <旧UTC版本> <旧manifest> <checker> - <绝对发布根> <公开URL> --mode switch`（不传配置参数）。底层 `release-remote.sh` 支持 `switch`，但不要绕过协调锁并发运行。首次撤销可在持锁且确认 current 仍属本次版本时移除链接，并 CAS 恢复配置到备份；不要 `ln -sfn` 或盲目复制配置。

上线后必须逐文件 HTTP 200 + SHA-256，确认 `/vias` 301、未知与研究/元数据路径 404，以及实际树无额外文件；全新 Chrome context 验证首页→线路→详情、收藏、GPX、字体/图片、无同源跨前缀请求和运行时错误。比较主站、private、Fleeting、HairPlay 原基线。仅 HTTP 200 不构成浏览器验收。独立 check-run approve 前不宣称通过部署验收。

## 实际发布记录

### 2026-10-10：完整目录异步加载/按需分片（A–F 验收脚本完成，待独立复核）

用户授权后，从干净提交 `f1cc6b18ccc2ed8d3da6a3741061536843963161` 重新构建，公开检查、打包及本机浏览器命令成功；未改应用功能。公开 URL：**https://liangz77.cn/vias/**。

- 实际 `current`：`releases/20261010T044533Z`；旧 `releases/20261010T005058Z` 保留。仅一次原子切换，没有再次部署或手动回退。
- 包 SHA-256：`89763a0fc68d7462952e3522f35cae71e0fe63820411bce7443fbd7fd5cb06e1`。
- 发布 manifest SHA-256：`790502abf41a52b0c5c28e130dd2d1dad7836712b6f4d488ef48d3f6568344cb`；14,553 个公开文件，14,430 条 OSM 路线、94 分片。
- 索引 SHA-256：`5b9d0b38487961555cc8b4083297d9b2848f9161603a9bbd321e6a0c37f07c2e`。H5 JS 490,633 字节。
- 站点片段 SHA-256 前后均为 `e8300438db4e7f303ce60a45b48d7496de346bcb59c1b7a85138d943adb63aea`；主 Caddyfile 前后均为 `d31cec4506c8de7fe088a7119132964d7b56c087c0c590a4ffba18f6079f3739`。无配置修改、reload、服务重启或其他应用操作。
- 全量实际发布树 `verify-tree` 成功：14,553 文件逐文件 SHA-256、无多余文件/目录/软链，目录 755/文件 644。
- 本机直连公网 HTTP：全部 123 个非 OSM 缩略图文件（含 HTML/JS/CSS/字体/索引/清单/全部 94 分片）200/hash 一致；14,430 张 OSM 缩略图抽取 500 张随机内部文件 + 字典序首末各 1 张，502 张（3.48%）均 200/hash 一致，HTTP 总覆盖 625 个文件。随机种子及逐文件结果保留在执行证据。
- 索引与 shard-000 实际 `Content-Encoding: gzip`，压缩体分别 431,282 / 42,506 字节，解压 hash 匹配。`/vias` 301 至 `/vias/`；源码、research、`.git`、版本目录 manifest、`__MACOSX`、不存在的 shard-999 均 404。
- 主站/private/Fleeting/HairPlay：原记录的 12 项 + HairPlay 当前 3 项资源，共 15 项前后状态/URL/hash/字节完全一致；原 HairPlay 3 个旧资源在 before 已 404，未把历史值当本轮基线。
- **发布完成信号缺失**：已核对的 `deploy-site.py`（不传配置参数）调用 `release-remote.sh`，输出全量归档/磁盘校验成功并已切换；随后串行 `verify-http` 超过 1,800 秒，SSH 工具超时，未获得远端退出码或 `PUBLISH_OK`/`DEPLOY_SITE_OK`。随后只读观察无残留发布进程、current 仍为新版本，未观察到自动回退；不据此声称自动发布流程完整成功。
- **时序口径修正（PLAN-D）**：上一轮 index 请求起点 154.8 ms、FCP 160 ms 的失败证据保留。索引请求与 FCP 在同一帧内相差数毫秒属竞态，不作为通过依据；首屏不依赖目录由「目录挂起仍正常渲染 + 0 分片」的确定性实验证明。本轮真实公网 Chrome 场景 A：目录请求持续挂起不返回，FCP **152 ms**（< 1500 ms），首页头部/入口可见且可进入「全部」，显示「正在载入路线目录…（先显示 10 条精选）」，没有错误或误导的已完成 0 条/本地示例结果，0 分片、无 pageerror。已人工查看新截图。正常场景仅记录同一 performance 时钟：index 144.9 ms、FCP 148 ms，差 -3.1 ms，不作时序断言。
- **本轮公网 B/C 已执行**：全部列表 14,430 条（14,407 条命名路径片段），点击加载更多后行数增加，打开前 0 分片；打开首条路线仅请求一次 shard-000，矢量路径与海拔图可见。数据说明包含提取日期、来源、ODbL、非实测与 94 分片，两按钮实际剪贴板内容分别与公网 index/manifest 地址相符，无 pageerror。
- **D 口径裁定及复跑（PLAN-D2）**：协调者裁定来源链接内嵌在 metadata/desc 即符合当前契约，没有独立 `sourceUrl` 字段；机器可读 link 属另行改进，本轮不改应用。保留原失败证据，仅改 D 断言，严格核对 copyright 的 author 为 OpenStreetMap 贡献者、author/name、license 中 ODbL URL、desc 中 `https://www.openstreetmap.org/relation/16205150`、ele 及「非实测/不可导航」。公网和本机均通过，GPX 均 202,334 字节，SHA-256 `08b9558b856bf2b828356a0cb91e4e328cfdf49ded0412397d306b25c335d51c`。
- **A–F 脚本结果全部通过，非独立 check-run 结论**：公网同一脚本 A–E 退出 0；本次 A 挂起目录 FCP 172 ms、0 分片，正常 B index 150.4 ms/FCP 152 ms（仅记录）。上一轮 A **152 ms**、B index **144.9 ms/FCP 148 ms** 的证据与结论保留。E 强制 OSM 瓦片 503，加载失败提示出现、矢量路径仍渲染、OpenStreetMap 署名仍在；unroute 后换路线，提示消失、路径渲染，截图 E1/E2 保留。F 使用 `node scripts/preview-release.mjs client/dist/build/h5 8787 127.0.0.1` 和 `PREVIEW_URL=http://127.0.0.1:8787/vias/` 跑同一脚本 A–D（亦完成 E），退出 0、无 pageerror；本机 A FCP 96 ms、目录挂起仍正常渲染且 0 分片，B index 90.2 ms/FCP 96 ms 仅记录。证据分别在 `browser2/public/` 和 `browser2/local/`。仅关闭本轮 8787，41133/8776 未动；未重新发布、修改远端、reload 或更改应用代码。
- **本机首屏测量**：`node artifacts/measure-first-load.mjs` 退出 0，输出 `FIRST_LOAD_OK`（见 `artifacts/deploy-check-run2/measure-first-load.log`）。挂起目录 FCP **108 ms**，正常 FCP **96 ms**、index **87.7 ms**，0 分片；解码 JS 490,633 字节（< 2 MB），测得总响应体 3,157,033 字节。均为页面 performance 同基准时钟，正常时序仅诊断；首屏承诺的依据仍是「目录挂起仍正常渲染 + 0 分片」，没有放宽阈值或删断言。上述版本/hash/文件树/HTTP/gzip/404/301/15 项基线/Caddy hash 接续 Phase B 留存记录，本轮未重新执行远端核验。
- 微信产物仅编译检查，完整主包超 2 MB，仍需分包及 HTTPS 白名单；无手机、账户、真实 GPS 操作。**公网部署即公开完整数据集（14,430 条，53.4 MB 归档）**。可在仓库根运行 `node scripts/build-public.mjs --sample` 一键构建示例子集（只改本机构建，不会自动切换线上；上线仍须复核与授权）。**尚未通过独立 check-run；等待 Astra high 独立复核。**

服务器受限目录 `/srv/sites/liangz77.cn/vias/.deploy-20261010T044533Z`（700）仅上传包、manifest、核对过的 `release.py`；复用旧目录中 hash 已核对的协调器与 shell 工具。若后续获准回退，先确认 current 仍为本版本，再用旧版本自己的 manifest 和协调锁执行（本轮未执行）：

```sh
cd /srv/sites/liangz77.cn/vias/.deploy-20261010T005058Z
readlink ../current  # 必须仍为 releases/20261010T044533Z
python3 deploy-site.py 20261010T005058Z manifest.json release.py - \
  /srv/sites/liangz77.cn/vias https://liangz77.cn/vias/ --mode switch
```

回退不传配置参数，不改/reload Caddy，不删除任何旧发布目录。执行证据留在 `artifacts/deploy-check-run2/`，不提交仓库。

### 历史记录：2026-10-09 合成演示

2026-10-09 发布至 **https://liangz77.cn/vias/**，版本 `20261009T051547Z`；Phase A 独立 Gate 已批准，Phase B 已获协调者授权。应用包未改变；最终线上独立复核已由独立模型（Astra high）通过，**仅覆盖本次公开合成演示部署所验证的范围**，不代表完整应用或全功能验收。

- `current`：`releases/20261009T051547Z`（首次发布，无旧 current）。
- 包 SHA-256：`304ab53bf3edbf40f30e489b7490720403a590f4aa64fb0cc1c90585a45a2e90`。
- manifest SHA-256：`413a55d0527d31b29142980f033062f184a6c68eadffe6d44134a8d690cbc0fb`，27 个公开文件。
- 站点配置原 SHA-256：`28aa0e079ac7912e0f711bdccde45b052bc8f006b38e8921673cbdbfb13a1dd2`；新 SHA-256：`f4016d02cbdec2cfab647401913228a7c2a44e16b8f3dc824018085de2686daf`。
- 原配置备份：`/etc/caddy/sites-enabled/liangz77.cn.caddy.bak-before-vias-20261009T051547Z`。配置只增加 Vias 路由，实际 validate 和平滑 reload 成功。
- 发布树精确匹配 manifest；目录 755、文件 644。公网逐文件 200/hash 一致，`/vias` 301，未知文件、研究路径和元数据路径 404。
- 全新 Chrome context 验证首页→线路→详情、示例标识、收藏、自造 GPX 导入导出及持久化、字体图片、无越界同源请求或运行时异常。强制 OSM 503 时保留轨迹与失败提示；另一次无拦截观测 6 张 OSM 瓦片 200，不承诺外部网络持续可用。
- 主站、private、Fleeting、HairPlay 共 12 项 HTTP/稳定资源基线完全一致；另行 Chrome 检查四个入口 200、无运行时异常。没有重启应用或操作手机。

服务器保留受限目录 `/srv/sites/liangz77.cn/vias/.deploy-20261009T051547Z`（700），内含本次核对过的工具、包和 manifest，不在 file_server 根内（**补注 2026-10-10**：这个最早期的暂存目录与对应的 release 目录后来已被清理，见文末「服务器上还留着什么」）。后续复核可在该目录运行 `python3 release.py verify-http https://liangz77.cn/vias/ manifest.json`。

勘误：`verify-tree` **拒绝把软链当作根**，所以不要对 `../current` 调用它；先 `readlink ../current` 确认指向，再把**真实发布目录**（本次为 `../releases/20261009T051547Z`）传给 `verify-tree`：

```sh
cd /srv/sites/liangz77.cn/vias/.deploy-20261009T051547Z
readlink ../current   # 期望 releases/20261009T051547Z
python3 release.py verify-tree ../releases/20261009T051547Z manifest.json
```

首次发布撤销须由运维授权：同时持有发布根 `.site-transaction.lock` 与 `.publish.lock`，确认 current 仍为上述版本、实际配置仍为上述新哈希、旧备份哈希仍为上述原哈希；用保留的 `config-transaction.py` 执行下列 CAS 恢复（备份输出路径必须全新），成功后再次核对 current 并只移除该软链，恢复未发布状态。任何哈希/链接变化则停止，不覆盖其他发布者。不要删除 release 或备份，以便恢复本版本。

```sh
python3 config-transaction.py \
  /etc/caddy/sites-enabled/liangz77.cn.caddy \
  /etc/caddy/sites-enabled/liangz77.cn.caddy.bak-before-vias-20261009T051547Z \
  f4016d02cbdec2cfab647401913228a7c2a44e16b8f3dc824018085de2686daf \
  <全新撤销备份路径> --restore
```

自动失败恢复已在 Linux 隔离测试中实际验证；本次生产发布成功，未为了演示而撤销线上版本。截图、HTTP/hash、生产树和浏览器报告留在私有执行证据中，不提交公开仓库。

### 2026-10-10：机器可读导出来源与 detached 发布

本条汇总 PLAN-E4/E5 已完成的发布与验证事实；PLAN-E6 仅实测文件数/总字节、整理证据和提交记录，没有重新验证、构建、打包、上传或发布，不替代独立 check-run 结论。证据根目录为 `artifacts/deploy-check-run2/`，逐项读回结果见 `e6/facts.json`。

- **发布身份**：release `20261010T061904Z`，本地 `client/dist/build/h5` 与远端 `current` 用 find/stat 实测均为 **14,553 文件、70,911,674 B**（公开文件未压缩总量；`e6/release-size.json`）。包 SHA-256 `6ebfca0b4affe53619b429c1b84254ca83623eb0125d29c978512ffd8c1e8221`，53,425,847 B；发布 manifest SHA-256 `e68bdd4bb2547f435c5656cf90fce559f713589275dc6a382586229203fdaba2`，1,454,855 B。发布 manifest 是扁平 `{相对路径: sha256}` 映射，没有 `files`/`bytes` 容器。`static/osm/index.json` SHA-256 `5b9d0b38487961555cc8b4083297d9b2848f9161603a9bbd321e6a0c37f07c2e`；js_bytes **491,053**（`e4/local-hashes.txt`、`e4/version.txt`、`e4/build-identity.json`）。切换前 current 为 `releases/20261010T044533Z`；该版本与 `releases/20261010T005058Z` 均保留为回退点。一次 `mv -T` 原子切换，无回滚（`e4/deploy.log`、`e4/remote-before.txt`、`e4/remote-after.txt`）。
- **流程变更**：本轮发布改为 detached 远端执行（`setsid nohup` + 轮询 `deploy.log`），不再受前台 SSH 等待时限中断；全量 `verify-http` 首次真正跑完，实际输出 `HTTP_OK files=14553 SHA-256 matches; metadata_404=14561`、`PUBLISH_OK`、`DEPLOY_SITE_OK`、`DEPLOY_EXIT=0 ELAPSED_SECONDS=1239`。1239 s 是完整发布包装器耗时（`execution-e4.md`、`e4/deploy.log`、`e4/verify-http-timing.json`）。后置独立抽样 http-audit 覆盖 **625 文件**（123 非缩略图 + 502 缩略图，含全部 94 分片），均 200/hash 一致；源码、研究、Git、版本元数据、macOS 元数据、不存在分片探针均 404，`/vias` 301 至 `/vias/`，作为复核而非替代全量检查（`e4/http-audit.json`）。
- **目录逐字节对照与稳定化**：**切换前**的线上版本 `20261010T044533Z` 与本次本机构建对照：`static/osm/**` 的 **14,525 个数据文件**（index 1 + 分片 94 + 缩略图 14,430）逐字节相同，同目录下另 1 个目录 manifest（合计 14,526）仅 `generated` 一处差异，旧版 `2026-10-10T04:40:33.200Z` → 本机构建 `2026-10-10T05:59:06.869Z`（`e4/catalog-unchanged.json`）。**本轮发布后该差异已不存在**：当前 release `20261010T061904Z` 的目录 manifest 与本机构建逐字节相同，实测双方 `generated` 均为 `2026-10-10T05:59:06.869Z`、差异键 0（`review-e1/review.md` 第 4 节）。因此上句的 `04:40:33.200Z` 只描述切换前的旧版本（`20261010T044533Z`），不可误读为当前线上值。`scripts/prepare-catalog.mjs` 新增 `stampGenerated()`：输入未变时沿用上一枚 `generated`，既有本机连续两次 `build:public` 后 `static/osm/**`（含 manifest）逐字节不变，before→first 与 double_run 均 identical（`e3/rebuild-stability.json`）；本次收尾没有再运行构建。
- **新导出契约**：GPX `<metadata>` 内 `<link href="来源"><text>作者</text></link>` 紧随 `<copyright>`，`<trk>` 内 `<src>` + `<link>` 紧随 `<name>`；KML `<atom:link rel="related" href="来源"/>` 紧随 license atom link。`parseGpx` 增加从 `metadata/link/@href` 回读 `sourceUrl`；无来源的本地轨迹不输出 link/src/related。这是 ODbL 署名的机器可读位置，下游工具可自动校验来源与许可，导出→导入往返不丢来源；原有文本署名与许可保留（`client/src/core/track.ts`、`e5/xml_check.py`、`e5/browser-public/report.json`）。
- **既有公网浏览器 A–E**：report.status=completed，A–E 全 pass，errors=[]（`e5/browser-public/report.json`）。A 挂起目录 FCP **176 ms**、0 分片，占位文案「正在载入路线目录…（先显示 10 条精选）」正确；B **14,430 条**、加载更多、浏览期 0 分片、首条仅请求 shard-000，矢量路径与海拔图可见；C 说明页来源/许可/非实测文案与两个实际剪贴板目录地址一致；D GPX/KML 由 ElementTree 真解析，断言 GPX 两处 link、href 与来源一致、`<src>`、copyright、ODbL、desc、ele、非实测不可导航，以及 KML license/related 顺序，真实手绘轨迹无来源字段；E 瓦片 503 降级仍保留矢量路径、列表与署名，解除拦截换路线后恢复。XML 细则见 `e5/xml_check.py` 与 `execution-e5.md`，未删或放宽断言。
- **既有本机浏览器与 first-load**：本机同脚本 A–E 全 pass，completed、errors=[]；A FCP **96 ms**，B index **88.2 ms** / FCP **92 ms**，仅记录、不断言顺序（`e5/browser-local/report.json`）。first-load 实际输出 `FIRST_LOAD_OK`：pendingFcp **88 ms** / normalFcp **92 ms** / **0 分片** / jsDecoded **491,053 B** / 首屏总量 **3,157,453 B**（未压缩，`e5/measure-first-load.log`）。首屏不依赖目录的依据是挂起目录仍渲染且不加载分片，不以正常加载毫秒级先后作为断言。
- **独立复核**：本轮由另一模型（`openai-codex/gpt-6-astra`，high）独立复核，先用自写脚本复算了源码导出/往返、24 项仓库测试、隔离目录双次构建稳定性、发布树与线上全量 HTTP 哈希（14,553/14,553）、Caddy 未变，以及自写浏览器 A–E；首轮 `VERDICT: reject` 只因本条目录计数与 `generated` 出处标注有误，勘误提交 `e241432` 后复核 `VERDICT: approve`。报告：`artifacts/deploy-check-run2/review-e1/review.md`、`review-e2/review.md`（私有证据，不随仓库发布）。
- **邻居站点与 Caddy**：**HairPlay 与本项目无关**，只是同服务器邻居站点，纳入基线只为确认本次发布没有影响到别人；本轮 **15 项**基线 before/after 完全一致（`e4/baseline-comparison.json`）。Caddy 站点片段 SHA-256 `e8300438db4e7f303ce60a45b48d7496de346bcb59c1b7a85138d943adb63aea` 与主配置 `d31cec4506c8de7fe088a7119132964d7b56c087c0c590a4ffba18f6079f3739` 前后未变；MainPID **7884** / ActiveEnterTimestamp **2026-06-09 11:33:54 CST** 未变，本轮未改配置、未 reload（`e4/remote-before.txt`、`e4/remote-after.txt`）。


### 2026-10-10：首页换成 4 条真实经典线路，去掉全部占位插画（构建与本地验证）

本条记录发布前的构建与本地验证阶段；打包、切换与线上校验见下一节。本节里「线上仍是 release `20261010T061904Z`」描述的是**构建时**的状态，现已不成立；证据根目录 `artifacts/classics/`（私有，不随仓库发布）。

- **首屏内容改成真实的**：`client/src/core/classic-routes.json` 固定 4 条知名北京路线（`osm-w92160463` 箭扣西段长城、`osm-w659656629` 下马威·东灵山小道、`osm-w162162027` 妙峰古道中道、`osm-w55280954` 京西古道·门潭段），全部是真实 OpenStreetMap 名称与几何，缩略图即目录里的真实几何缩略图。`scripts/build-osm-catalog.mjs` 新增 `FEATURED_WAYS` 与 `wayById`，把这 4 条标记为 `featured`；`scripts/prepare-catalog.mjs` 的 `PREVIEW_LIMIT` 由 10 提到 20，使首屏预览覆盖全部 14 条精选。
- **精选必须是纯覆盖（一次真实缺陷）**：第一版把 4 条方式从分组里剔除再追加到队尾，等于改变排序位置——分段是按位置切分的，于是 **89/94 个分片被改写**（首个顺序差异在第 60 位，末尾计数 `[456,485,574,266] → [460,496,639,84]`）。改为“保留原位、只叠加 `featured` 标记”后重跑，全部恢复一致：**94/94 分片逐字节相同**，实测与线上现有 `static/osm` 对照 `static/osm` 共 **14,526 个文件**，只有 `index.json` 与 `manifest.json` 两个文件不同（其余 14,524 = 14,430 缩略图 + 94 分片逐字节相同，`local-static-osm.sha` / `remote-static-osm.sha`）。顺带把这次事故写进流程：改目录顺序前先抓 baseline 与线上索引做差分。
- **索引只多了 4 条的字段**：`index.json` 2,254,236 B → **2,254,547 B**（+311 B，仅 4 条新增 `activity`/`place`/`featured:true`；顺序与线上索引逐项相同，`live-index-before.json`），SHA-256 `5b9d0b38…` → `00d49587f129778620910fbe4ef14744158d827fea1dddeb3de6d5d684463532`；目录清单 `static/osm/manifest.json`（两者同为 2,036,614 B）SHA-256 `66d7ca3b85c20df2c94c538ac175dcf8e8ac0decf2c7c0c9c30c7eff5d8e8c84` → `7a3eef05239981a0c4ca7f0295a12788a14c60ac1665a6e76feb263a44756774`；把两份清单递归展开成叶子字段后逐项比对（展开口径不同会让总数相差几个计数条目，所以这里只断言差异项）实测**恰好只有 2 项不同**：`generated` `2026-10-10T05:59:06.869Z` → `2026-10-10T08:19:00.252Z`，以及 `index.sha256` `5b9d0b38…` → `00d49587…`（94 个分片与 14,430 张缩略图的哈希一处未变）。**注意别把两个 `manifest` 搞混**：更早一节里的 `e68bdd4b…`（1,454,855 B）是**发布包**的扁平 `{相对路径: sha256}` 清单，也就是发布时上传到服务器暂存目录 `/srv/sites/liangz77.cn/vias/.deploy-<ID>/manifest.json` 的那一份（那个 ID 的那份现在仍在 `.deploy-20261010T061904Z/manifest.json`）；`releases/<ID>/` 里只有发布树本身，**没有**这份清单，所以别写成 `releases/<ID>/manifest.json`。它也不是目录里的 `static/osm/manifest.json`。
- **公开版不再内置任何占位插画**：删除 `client/src/static/demo/` 下 11 张程序生成插画（banner、entry-×4、footprint-×2、photo-×4），保留 `brand.png` 与两条合成示例路线的封面；`scripts/public-assets.json` 白名单 19 → **8** 条，`scripts/generate-demo.py` 不再生成它们，`scripts/test_public_build.py` 的夹具改用仍在白名单里的 `static/demo/brand.png`（仍是“哈希不符必须拒绝”这条断言，未放宽）。首屏导航入口改为图标（不再用插画），照片墙在没有真实照片时给空状态。
- **构建结果**：`node scripts/prepare-catalog.mjs --full` → `CATALOG_READY … preview=14 … static_bytes=69748510`；`npm run build:public` → `PUBLIC_CHECK_OK files=14542 routes=14430 shards=94 full=true js_bytes=493846`。H5 构建树 **14,542 文件 / 70,825,465 B**（上一轮 14,553 / 70,911,674 B：少 11 张插画、JS +2,793 B）。提交的示例子集 `client/catalog-sample/` 由 13 文件 / 300,610 B 变为 **17 文件 / 357,648 B**（14 条精选：10 关系 + 4 命名路径 + 各自的缩略图、`osm-index.json`、目录清单 `manifest.json`、1 个几何分片）。
- **测试**：`cd client && npm test` **25/25**（新增一条：首屏 4 条经典线路必须都在提交的示例子集里、都是 `featured`、缩略图存在；同时把缩略图路径断言放宽为 `static/osm/w?\d+\.png`，因为命名路径的键带 `w` 前缀）；`python3 scripts/test_release.py` 8/8；`PUBLIC_TEST_BUILD=… python3 scripts/test_public_build.py` OK；`node scripts/verify-catalog.mjs data/catalog` → `CATALOG_VERIFY OK … routes=14430 shards=94 points=470359 thumbs=14430`。
- **本地浏览器（Playwright + 真实 Chrome）**：`artifacts/classics/home-check.mjs` → `VERDICT: PASS`。4 张卡片（箭扣西段长城 2.17 km / 下马威·东灵山小道 4.84 km / 妙峰古道中道 4.41 km / 京西古道·门潭段 3.01 km）缩略图均已绘出（`naturalWidth=348`，四张封面互不相同：`2d1ee481…` / `9be5b553…` / `c2800029…` / `a9c8d5ee…`），无 hero 横幅、无插画请求；导航 4 个入口全部是矢量图标（uni-app 把 `<image>` 渲染成 `uni-image`，所以这四个 SVG 图标各是一个带 `.ico` 的 `uni-image`；断言写的是「没有不带 `.ico` 的 `uni-image`」，即没有插画）；首页与照片墙都是空状态文案；点第一张卡进入详情只请求 `routes/shard-018.json` 并渲染统计（1150 米最高海拔、380 米爬升……）；0 个 console 错误、0 个已删除插画的请求。**注意**：这条只验证了「索引已就绪」时的点卡路径；索引还在途时点卡会踩到竞态，见下一节。
- **视觉复核（`openai-codex/gpt-6-astra` high，看截图）**：首轮报 `VERDICT: fail`，理由是“底部导航遮住了『精选脚印』空状态文字”。实测这是**可滚动页面的正常折页**：真正的滚动容器是 uni-app 的 `.uni-scroll-view`（`scrollHeight=994`、`clientHeight=780`、最大滚动 214），滚到底后“还没有照片/去记录”整块都在底部导航之上（按钮 643–682 < 导航顶 780），内容可完整读到最后一行；把“未滚动”和“滚到底”两张截图一起交给同一模型复核后改为 `VERDICT: pass`。这条误判本身记在这里，避免以后又当成缺陷。

### 2026-10-10：发布 `20261010T092030Z`（首页真实内容版上线）

- **发布身份**：`current -> releases/20261010T092030Z`，远端实测 **14,542 文件 / 70,825,465 B**（与本地 `client/dist/build/h5` 数字一致）。回退点保留 `20261010T061904Z`（切换前 current）、`20261010T044533Z`、`20261010T005058Z`。一次 `mv -T` 原子切换，无回滚。
- **打包**：`bash scripts/package-release.sh client/dist/build/h5 artifacts/classics/release-48c1137` → `PACK_OK files=14542`、`VERIFY_ARCHIVE_OK files=14542`、`PACKAGE_OK`。发布清单 `manifest.json` 1,453,758 B，SHA-256 `4ccd0c4233ab1c5e3fb43645afcf2848f94254c5137e47b6bcb9468ccbed2725`；`release.tgz` 53,387,860 B，SHA-256 `73a83f74eab9becbbeb584f7331336f8dee64d2266f6c48d35776407bc45bd6e`。清单是扁平 `{相对路径: sha256}`，14542 条，逐条与本地构建树比对 0 缺失 0 不符。清单本身可复现（两次打包同哈希），`release.tgz` 因 gzip 头含时间戳不可逐字节复现，以清单为准。
- **远端发布**：沿用 detached 方式（`setsid nohup python3 deploy-site.py <ID> manifest.json release.py release.tgz /srv/sites/liangz77.cn/vias https://liangz77.cn/vias/ --mode deploy`），发布工具 `deploy-site.py` / `release-remote.sh` / `release.py` 三者 SHA-256 与上一轮核对值一致（`aa4221f3…` / `0ba65872…` / `d0233c29…`），**未修改**。`deploy.log` 全文：`VERIFY_ARCHIVE_OK files=14542`、`VERIFY_TREE_OK files=14542`（两次）、`HTTP_OK files=14542 SHA-256 matches; metadata_404=14550`、`PUBLISH_OK current=releases/20261010T092030Z previous=releases/20261010T061904Z (atomic mv -T)`、`DEPLOY_SITE_OK`。切换发生在 17:21:38 +0800（上传完成 17:21:26 之后 12 s；`releases/20261010T092030Z` 目录建立于 17:21:33），`deploy.log` 末行写入 17:42:12 +0800，即切换后的全量 HTTP 校验约 **1,234 s**（与上一轮 1,239 s 同一量级）。
- **切换后随手复核**：线上 `static/osm/index.json` 2,254,547 B SHA-256 `00d49587…`、`static/osm/manifest.json` 2,036,614 B SHA-256 `7a3eef05…`，与本地一致；4 张新缩略图（`w92160463.png` 等）200；`static/demo/{banner,entry-route,photo-1,footprint-1}.png` 全部 **404**（占位插画确实不再发布）。Caddy 站点片段 `e8300438…`、主 `Caddyfile` `d31cec45…`、`MainPID=7884`、`ExecMainStartTimestamp` 与切换前相同，本轮未改配置、未 reload；`/`、`/hairplay/`、`/fleeting/` 仍 200。
- **独立复核（`openai-codex/gpt-6-astra` high，只读，自写脚本）**：首轮 `VERDICT: reject`，唯一原因是**文档两处口径错误**——(1) 提交的示例子集被我按 16 文件 / 353,726 B 记（漏了 `manifest.json` 3,922 B），实测 **17 文件 / 357,648 B**；(2) 本章把上一轮**发布包**清单的哈希 `e68bdd4b…` 误当成目录清单 `static/osm/manifest.json` 的旧值，实际旧目录清单是 `66d7ca3b85c20df2c94c538ac175dcf8e8ac0decf2c7c0c9c30c7eff5d8e8c84`。两处已按实测改正（同一提交里还修了本节标题里「尚未发布」的过期表述）。复核者另指出 PLAN 里我把目录条目的显示名字段写成 `name`，实际是 `title` —— 这是**复核计划自己的契约笔误，不是产品缺陷**；4 条经典线路的标题、精选标记与缩略图本身核对通过。其余断言全部 pass：线上 14,542/14,542 文件哈希一致、22 个禁用路径 404；新旧 release 的 `static/osm` 只有 `index.json` 与 `manifest.json` 不同（其余 14,524 逐字节相同）；14,430 条顺序相同、仅 4 条新增字段、94 分片计数自洽；11 张插画不在发布树且 bundle/白名单无引用；隔离重跑生成器后 **94/94 分片逐字节不变**；客户端 25/25、发布测试 8/8、`js_bytes=493846`；自写 Chrome 验证四卡、图标入口、滚底可读的空状态与真实分片详情，`pageerror` 0、已删除插画请求 0；Caddy/PID/邻居站点未变。首轮证据保留在 `artifacts/classics/review-1/`。
- **第二轮独立复核（同一复核者，重新自写脚本全量复算）**：`VERDICT: reject`，三条**文档**反例，产品与线上产物本身全部 pass（HTTP 14,542/14,542、新旧目录只有两个文件不同、隔离重建 94/94 分片不变、Chrome 四卡/滚底/详情、`pageerror` 0）。(1) 本章「两份清单只有 `generated` 一处不同」不成立——`index.sha256` 也变了（清单里就嵌着索引哈希）；已在 `624c203` 改为「展开成叶子字段后恰好 2 项不同：`generated`、`index.sha256`」。(2) `README.md` 的命令注释还写着「23 个测试」，实跑 **25/25**；已改。(3) 本章说四张封面「3 个不同文件哈希」，实测 4 张互不相同（`2d1ee481…`/`9be5b553…`/`c2800029…`/`a9c8d5ee…`）；已改。另：原先写的「展开成 29,169 个字段」是我自己脚本的计数口径（复核者的叶子计数口径为 29,172），数字随口径浮动，已改成只断言差异项、不写总数。三条都是记录口径错误，不是产品缺陷；证据保留在 `artifacts/classics/review-2/`。
- **第三轮独立复核**：`VERDICT: reject`，两条。(1) **一个真实的产品缺陷（非文档）**：目录索引还在下载时点第一张经典线路卡，详情会去取 `shard-000.json` 并报「轨迹分片与当前目录版本不一致（分片条目数不符）」，索引到达后也不会自愈——根因是 `client/src/core/osm-catalog.ts` 的 `loadGeometry` 用 `if(!positionById.has(route.id))await loadIndex()` 判断要不要等索引，而提交的预览（`featured-routes.json`）已经把 14 条精选塞进 `positionById`、并把分片表当成单分片 `[14]`，于是预览里的路线在真实索引到达前就能「解析」成 0 号分片。这个缺陷是潜伏的：改动前公开版首屏不列预览路线，本轮把 4 条经典线路放到首屏后才变得可点。修法：`loadGeometry` 改成**无条件 `await loadIndex()`**（幂等，已就绪时立即返回），不再用「这个 id 在不在表里」猜分片表是否可信。(2) 本章第 147 行「导航 4 个入口全部是图标（无 `uni-image` 图）」表述错误——uni-app 把 `<image>` 渲染成 `uni-image`，四个 SVG 图标各是一个带 `.ico` 的 `uni-image`；已改成准确表述。
- **竞态回归护栏**：新增 `artifacts/classics/race-check.mjs`（Playwright 拦下 `static/osm/index.json` 不放行 → 点第一张卡 → 断言此时**不得**请求任何分片、也不得报错；再放行 → 断言请求的是索引给这条路线分配的 `shard-018.json`、地图渲染、无残留错误）。对**当前线上（未修）**跑：`VERDICT: FAIL`，四条反例（`a shard was requested before the index arrived: …/shard-000.json`、`expected shard-018 … got shard-000.json`、`detail still shows a shard-version error`、`map did not render`）；对**修好的本地构建**跑：`VERDICT: PASS`（挂起期间只显示「轨迹数据按需加载中…」，放行后 `shard-018.json` + 地图 + 统计）。证据 `artifacts/classics/race-{hold,released}.png`、`race-live.out`。

### 2026-10-10：发布 `20261010T103442Z`（修掉「索引未到就点卡」的竞态）

- **发布身份**：`current -> releases/20261010T103442Z`（切换 18:35:21 +0800 / 10:35:21 UTC），远端实测 **14,542 文件 / 70,825,451 B**（= 本地构建树，比 `20261010T092030Z` 少 14 B，就是这次改动的 JS 体积差）。回退点：`20261010T092030Z`、`20261010T061904Z`、`20261010T044533Z`、`20261010T005058Z`。
- **改了什么**：`client/src/core/osm-catalog.ts` 的 `loadGeometry` 去掉 `if(!positionById.has(route.id))await loadIndex()`，改为无条件 `await loadIndex()`；`js_bytes` 493846 → **493832**。目录数据一个字节没动：`static/osm/index.json` 仍是 `00d49587…`、目录清单仍是 `7a3eef05…`。
- **打包**：`bash scripts/package-release.sh client/dist/build/h5 artifacts/classics/release-race-fix` → `PACK_OK files=14542`、`VERIFY_ARCHIVE_OK files=14542`、`PACKAGE_OK`；`release.tgz` 53,387,850 B `ba09f2936f9475d96508b27c46c193c6c6eacc404c7fa6e395573a35b6f7ad57`；发布清单 `manifest.json` 1,453,758 B `60093b98c4b39eda760c6f405cf81a5a2bab9754ee384ff8b7a711cc8a82b592`（14542 条，逐条与本地构建树比对 0 缺失 0 不符）。
- **远端发布**：发布工具三件套 SHA-256 与上轮核对值一致（`aa4221f3…`/`0ba65872…`/`d0233c29…`），**未修改**；上传的 5 个文件远端哈希与本地一致。detached `setsid nohup deploy-site.py … --mode deploy`；`deploy.log`：`VERIFY_ARCHIVE_OK files=14542`、`VERIFY_TREE_OK files=14542`（两次）、`HTTP_OK files=14542 SHA-256 matches; metadata_404=14550`、`PUBLISH_OK current=releases/20261010T103442Z previous=releases/20261010T092030Z (atomic mv -T)`、`DEPLOY_SITE_OK`（末行 18:56:01 +0800，即切换后的全量 HTTP 校验约 1,240 s）。
- **切换后复核**：线上 `static/osm/index.json` / `manifest.json` 哈希与本地一致；`static/demo/{banner,entry-route,photo-1,footprint-1}.png` 仍 404；四张 way 缩略图 200；Caddy 站点片段 `e8300438…`、主 `Caddyfile` `d31cec45…`、`MainPID=7884`、`ActiveEnterTimestamp` 与切换前相同（未改配置、未 reload）。
- **线上竞态回归**：`race-check.mjs` 对**新上线版本**跑 → `VERDICT: PASS`（挂起索引期间不请求任何分片、只显示「轨迹数据按需加载中…」，放行后请求 `shard-018.json`、地图渲染、0 错误）；同一个脚本对上一版线上跑是 `VERDICT: FAIL`。证据 `artifacts/classics/race-live-after.out`、`race-live-after-{hold,released}.png`。

- **服务器上还留着什么（2026-10-10 10:35 UTC 实测）**：`releases/` 与 `.deploy-*` 各保留 5 个——`20261010T005058Z`、`20261010T044533Z`、`20261010T061904Z`、`20261010T092030Z`、`20261010T103442Z`；最早那轮的 `releases/20261009T051547Z` 与 `.deploy-20261009T051547Z` **已经不存在**（第 101、106–108、116 行是当时的历史记录，不要再照着路径去跑）。发布包清单只存在于暂存目录（`.deploy-<ID>/manifest.json`），`releases/<ID>/` 里只有发布树。
- **第六轮独立复核（`artifacts/classics/review-6/review.md`，Astra high）→ `VERDICT: approve`**，复核 commit `9eed4cd`，11 条全 pass：线上 **14,542/14,542** HTTP 哈希一致、26 个禁用路径 404；新 release 的 `static/osm/**` 相对 `20261010T092030Z` **零差异**、相对 `20261010T061904Z` 恰好 2 个文件不同；14,430 条顺序不变、仅 4 条新增字段、94 分片计数自洽；11 张占位插画已不存在且 bundle/白名单无引用；示例子集 17 文件 / 357,648 B；测试 25/25 与 8/8、闸门 `js_bytes=493832`；隔离重建 **94/94 分片逐字节不变**；系统 Chrome **71 项断言全过**（含四张卡分别挂起索引再点击的竞态回归，`pageerror=0`）；Caddy 哈希/PID/时间戳不变、三个邻居站点 200；发布包清单路径与保留目录口径正确。本轮 6 次复核的结论链：round 1/2/3/4/5 均为 `reject`（2 条文档口径 → 1 条文档口径 → **1 个真实产品缺陷**+1 条文档表述 → 复核计划自身沿用旧数值 → 1 条文档路径出处），逐条修正后 round 6 通过。

### 2026-10-11：详情/附近增强版上线（`20261011T025121Z`）及真机验收边界

- **功能**：真实几何的可触摸、可展开海拔剖面；每公里真实距离/爬升/下降/高程分段；GPX / KML 轨迹 / KML 路径三种带 OSM/ODbL 归属的导出；附近列表按距起点（需定位）、里程或爬升稳定排序。缺少时间/速度的数据明确写「未记录」，地形海拔注明采样插值、非实测、不可导航。对照参考的是六只脚 Android 原生 App 的 `03-route-detail`、`04-route-menu`、`05-export`、`09-nearby-routes` 截图，**Vias 当前被测对象仍是 H5，未打包 Android APK**。
- **本地独立验收（Astra high）**：commit `94a9aee` 的 `artifacts/detail/review-a/review.md` → `VERDICT: approve`。原有 25 + 新增 17 = **42/42** 单元测试；发布测试 8/8；`PUBLIC_CHECK_OK files=14542 routes=14430 shards=94 full=true js_bytes=521225`；H5 树 **14,542 文件 / 70,854,600 B**；`static/osm/**` **14,526 文件**与上版发布目录逐文件哈希一致；隔离构建 + 自写 Chrome 浏览器 **127 项断言**全部通过（含四张卡目录索引竞态），`pageerror=0`。
- **打包及发布**：新 `release.tgz` **53,396,130 B**、SHA-256 `5d55888b5ae926e6062700b8a8e4572939f7611be690f98379d9cef575f2b74a`；发布包清单（仅在 `.deploy-20261011T025121Z/manifest.json`，不是 release 树根）**1,453,758 B**、SHA-256 `e9b98739e3861aaceb4ed15b1cd4187734d5c0967180fea873376354bb85a80a`。远端上传 5 文件 SHA 与本机逐项一致，发布工具 SHA 未改。detached 运行 `deploy-site.py`，`current -> releases/20261011T025121Z` 于 **10:52:24 +0800** 原子切换；`deploy.log` 最后 **11:13:02 +0800**：`VERIFY_ARCHIVE_OK files=14542`、`VERIFY_TREE_OK files=14542`（两次）、`HTTP_OK files=14542 SHA-256 matches; metadata_404=14550`、`PUBLISH_OK current=releases/20261011T025121Z previous=releases/20261010T103442Z (atomic mv -T)`、`DEPLOY_SITE_OK`，全量 HTTP 校验约 **1,238 秒**。
- **切换后验证**：本地/远端 **14,542 文件、70,854,600 B** 相同；目录 index `00d49587f129778620910fbe4ef14744158d827fea1dddeb3de6d5d684463532`、目录 manifest `7a3eef05239981a0c4ca7f0295a12788a14c60ac1665a6e76feb263a44756774` 与上版**逐字节一致**。线上详情与附近完整目录浏览器验收均 `PASS`（附近 14,432 = 14,430 OSM + 2 合成例）；邻居站点 `/`、`/hairplay/`、`/fleeting/` 200；Caddy 站点片段 `e8300438…`、主配置 `d31cec45…`、`MainPID=7884`/启动时间不变。现存 `releases/` 与 `.deploy-*` 各 **6 个**（005058Z、044533Z、061904Z、092030Z、103442Z、025121Z），未清理历史回退点。
- **手机尺寸模拟 vs 真机**：Sol medium 三尺寸模拟 **93/93**、另写复核 **34/34**；Astra high 独立两尺寸模拟 **51/51**，其中公开底图瓦片实际解码成功。**SM-S9280 / Samsung Internet 真机**（防息屏 PID 97132，充电/唤醒正常）已验证四卡、详情数值、3 行分段、触摸/展开海拔、三选项入口及公开 GPX 15,500 B 实际下载；但真机 **底图未通过**：只显示轨迹及「底图加载失败，轨迹仍可查看」。Astra high 独立复核 **15/16，`VERDICT: reject`**：等约 173 秒后四张 OSM 瓦片 `naturalWidth=0`；同机一次直连瓦片在连接阶段超时，而站点 200（Mac 经代理能取瓦片，不能据此推断手机应可达）。这是**外部底图可用性阻塞**，不是已解决的发布缺陷；不可用「页面无错误」代替真机底图验收。未测真实 GPS 授权/记录和 Vias 原生 APK；若要对齐原版地图，需要先确认合法可用的地图服务/授权及中国地图服务合规，不擅自将本地研究代理搬上生产。上述手机/模拟证据留在本机 Git 忽略的 `artifacts/mobile*/`，不上传手机画面/位置/配对信息。

### 2026-10-11：OpenFreeMap 临时技术版上线（`20261011T094122Z`，修复版真机待验）

- **用户批准的顺序变更**：用户要求先发布正式网站，手机不在身边；不得在用户返回并明确同意前连接/操作手机。已停止后台防息屏脚本，避免断线重连时自行操作。发布为**待修复版真机复核的临时技术版本**，不是完整 `/skill:check-run` 手机 approve，也不是 Vias 原生 App 验收。旧生产 OSM 底图手机失败记录继续保留。
- **实现及独立桌面验收**：本地功能提交 `630da82` 使用 OpenFreeMap 官方 Liberty 向量样式、MapLibre GL Leaflet，在浏览器按视口直接向第三方请求，不经过本站代理，也不储存全量底图。第一轮 Astra high `artifacts/map-provider/review-b/review.md` `VERDICT: reject`：署名链接被许可按钮遮挡、离线平移空白后误报已绘制、交互中高频 GPU readPixels；本地修复提交 `1f4fdb6` 修正三项并补 Chrome 行为测试。Astra high 对该新 HEAD 的独立 `artifacts/map-provider/review-fix/REVIEW-DESKTOP.md`：`DESKTOP_VERDICT: approve`、`PHONE_VERDICT: unverified`。三链接正常物理点击和 Enter 许可证下载、两卡真实 Mac 绘图、离线新视口约25秒失败与同实例恢复、单 PBF 错误/上下文恢复、四次往返拖动读回9次；45/45 单测、H5/MP 与拒绝反例闸门、race/detail/nearby 全 PASS；14,526 目录文件与上版逐项 SHA-256 相同，Git 跟踪的 `data/`、`artifacts/`、`client/src/static/osm/` 文件为 0。H5 JS **1,582,306 B**（<2 MiB），小程序仅编译验证，未发布。
- **发布包**：本地/远端发布树 **14,544 文件 / 71,986,393 B**，目录 index SHA `00d49587f129778620910fbe4ef14744158d827fea1dddeb3de6d5d684463532`、目录 manifest SHA `7a3eef05239981a0c4ca7f0295a12788a14c60ac1665a6e76feb263a44756774` 均未变。`release.tgz` **53,685,342 B** SHA-256 `3641089397194c4d0f282a58d1d5d9d4edf02cb1a52e3d5eae05db0ecb52fda5`；发布包清单仅在 `.deploy-20261011T094122Z/manifest.json`，**1,453,972 B** SHA-256 `a42b51796d5baa4960f50350625b9239b84da5a02ca9d3b549129e967867c66b`。5 个包/工具文件远端 SHA 与本地逐项一致，runner 另行校验；未上传源码仓库或手机证据。
- **上线与全量验证**：远端原 `current=releases/20261011T025121Z`，旧目录及其 `.deploy-*` 保留作回退点。detached `deploy-site.py --mode deploy` 无 Caddy 参数，当前 `current=releases/20261011T094122Z`；`deploy.log`：`VERIFY_ARCHIVE_OK files=14544`、两次 `VERIFY_TREE_OK files=14544`、`HTTP_OK files=14544 SHA-256 matches; metadata_404=14552`、`PUBLISH_OK current=releases/20261011T094122Z previous=releases/20261011T025121Z (atomic mv -T)`、`DEPLOY_SITE_OK`、`DEPLOY_EXIT=0`。本机公网 Chrome `scripts/test-map-provider.mjs` 的两卡/三方点击/首次失败/离线平移/恢复/性能检查 `pass=true`、`dragReads=9`、`errors=[]`；线上额外 7 个重要文件 200/逐项 SHA 一致，`/vias` 301，未知 shard/research/.git/发布包清单路径 404。主站、HairPlay、Fleeting 三个稳定页面前后 200 且正文哈希完全相同；站点片段 SHA `e8300438…`、主 Caddyfile `d31cec45…`、MainPID 7884/启动时间未变，无配置替换或 reload。
- **明确未验与合规边界**：OpenFreeMap 无 SLA。修复后的**正式 URL 还没有 SM-S9280/Samsung Internet 真机复核**，旧本地预览和旧版独立真机照片不能充当本 release 的通过证据；用户回家后须经明确许可重测两卡实际绘制、版权链接触摸、失败/恢复、视口移动和手机直连网络/性能，并保留旧 release 直到验收。GPS 户外定位、Android 原生包/导航未测试。OpenFreeMap 的免费/商业许可与用户称自用不自动解决中国公开地图适用的审图号、服务审批或路线新增内容核查；需负责方另行核实，不能写成已合法合规。路线海拔仍是地形插值，非实测、不可导航。私有日志和截图仅在本机 gitignored `artifacts/map-provider/`。
