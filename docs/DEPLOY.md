# Vias 公开静态部署

公开版仅包含数学合成轨迹、原创插画和开源字体。示例不是官方线路、不是实际道路，**不可用于导航**。账户、支付、组队与离线地图等未接入服务。收藏、备注和 GPX 导入保存在浏览器；导出在本机生成。GPS 需要 HTTPS 和主动授权，不应向站点上传私人轨迹。

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

`build:public` 强制 `VIAS_RESEARCH=0`、资源基址 `/vias/`，不会继承私有研究模式。根路径本地开发仍用 `dev:h5`、`build:h5`；私有研究只在本机使用 `VIAS_RESEARCH=1`，绝不发布其输出。公开地图直接加载 `https://tile.openstreetmap.org/` 并署名；外部服务失败时显示错误、保留矢量轨迹，不提供开放瓦片代理。

`check-public-build.mjs` 校验 `scripts/public-assets.json` 的 SHA-256，动态编译文件必须与 Rollup 生成的独立 `.vias-h5-inventory.json` 文件集和哈希完全匹配，并只允许限定类型；该清单位于构建目录的父目录，不进入公开包。复制构建到其他路径打包时必须同步父目录清单，或用 `VIAS_BUILD_INVENTORY` 指定可信清单；字体即使在 `assets/` 也必须匹配批准字体哈希。未知文件、source map、元数据、软链接、私有标识或路径都会阻断打包。仅清理与已知本机研究源文件逐字节匹配的已知研究副本；未知研究文件也拒绝。失败产物保留用于调查，不能上传。

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

2026-10-09 发布至 **https://liangz77.cn/vias/**，版本 `20261009T051547Z`；Phase A 独立 Gate 已批准，Phase B 已获协调者授权。应用包未改变，最终线上独立验收仍待进行。

- `current`：`releases/20261009T051547Z`（首次发布，无旧 current）。
- 包 SHA-256：`304ab53bf3edbf40f30e489b7490720403a590f4aa64fb0cc1c90585a45a2e90`。
- manifest SHA-256：`413a55d0527d31b29142980f033062f184a6c68eadffe6d44134a8d690cbc0fb`，27 个公开文件。
- 站点配置原 SHA-256：`28aa0e079ac7912e0f711bdccde45b052bc8f006b38e8921673cbdbfb13a1dd2`；新 SHA-256：`f4016d02cbdec2cfab647401913228a7c2a44e16b8f3dc824018085de2686daf`。
- 原配置备份：`/etc/caddy/sites-enabled/liangz77.cn.caddy.bak-before-vias-20261009T051547Z`。配置只增加 Vias 路由，实际 validate 和平滑 reload 成功。
- 发布树精确匹配 manifest；目录 755、文件 644。公网逐文件 200/hash 一致，`/vias` 301，未知文件、研究路径和元数据路径 404。
- 全新 Chrome context 验证首页→线路→详情、示例标识、收藏、自造 GPX 导入导出及持久化、字体图片、无越界同源请求或运行时异常。强制 OSM 503 时保留轨迹与失败提示；另一次无拦截观测 6 张 OSM 瓦片 200，不承诺外部网络持续可用。
- 主站、private、Fleeting、HairPlay 共 12 项 HTTP/稳定资源基线完全一致；另行 Chrome 检查四个入口 200、无运行时异常。没有重启应用或操作手机。

服务器保留受限目录 `/srv/sites/liangz77.cn/vias/.deploy-20261009T051547Z`（700），内含本次核对过的工具、包和 manifest，不在 file_server 根内。后续复核可在该目录运行 `python3 release.py verify-tree ../current manifest.json` 和 `python3 release.py verify-http https://liangz77.cn/vias/ manifest.json`。

首次发布撤销须由运维授权：同时持有发布根 `.site-transaction.lock` 与 `.publish.lock`，确认 current 仍为上述版本、实际配置仍为上述新哈希、旧备份哈希仍为上述原哈希；用保留的 `config-transaction.py` 执行下列 CAS 恢复（备份输出路径必须全新），成功后再次核对 current 并只移除该软链，恢复未发布状态。任何哈希/链接变化则停止，不覆盖其他发布者。不要删除 release 或备份，以便恢复本版本。

```sh
python3 config-transaction.py \
  /etc/caddy/sites-enabled/liangz77.cn.caddy \
  /etc/caddy/sites-enabled/liangz77.cn.caddy.bak-before-vias-20261009T051547Z \
  f4016d02cbdec2cfab647401913228a7c2a44e16b8f3dc824018085de2686daf \
  <全新撤销备份路径> --restore
```

自动失败恢复已在 Linux 隔离测试中实际验证；本次生产发布成功，未为了演示而撤销线上版本。截图、HTTP/hash、生产树和浏览器报告留在私有执行证据中，不提交公开仓库。
