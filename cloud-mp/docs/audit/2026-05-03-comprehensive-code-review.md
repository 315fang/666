# cloud-mp 综合代码审查报告

更新日期：2026-05-03
继任：`docs/audit/2026-04-06-repo-audit.md`（zz 根 docs，非本目录）
范围：`cloud-mp/`（CloudBase 主体）+ `zz` 根三个旧目录（`backend/`、`admin-ui/`、`miniprogram/`）的边界关系
方法：4 个并行 sub-agent 审计 + 主代理结构核对（详见第 6 节）

---

## 1. 摘要

cloud-mp 的业务面已经基本跑起来：CloudBase 9 个云函数、admin-ui、miniprogram、3 个定时任务都在线，发布运行手册（`CLOUDBASE_RELEASE_RUNBOOK.md`）和发展指南（`CLOUD_MP_DEVELOPMENT_GUIDE.md`）已收口为真相源。

但**工程治理跟不上**：当前一份代码审计的核心结论与 2026-04-06 那份审计高度同构——**结构能跑，治理不可信**。本会话内已经闭合了 4 个 P0 安全/正确性问题、5 类 P1 工程基线问题（CI、release 命令拆分、shared drift、文档可信度、数据源 provider 软废弃），剩余主要是 **P1-1 文档可信度（本报告对应任务 B）+ P2 巨型入口控膨胀** 两个长期工作项。

继续在当前基础上堆功能没问题，但 **`admin-api/src/app.js` 已 458 KB / 9 489 行**、**admin-ui/views 多处 ≥ 40 KB**、**miniprogram 单页 ≥ 70 KB**——再扩张就会进入"上帝模块"区。

---

## 2. 已治理项汇总（本会话内闭合）

下表所有 commit 描述均取自 `git log <hash>` 的 body，证据可重复核对。

| 项 | Commit | 证据/状态 |
| --- | --- | --- |
| **P0-1** `payment-refund.js` 硬编码证书 fileID | `ea1312f0` | 已闭合（部分）：加 `PAYMENT_PRIVATE_KEY_FILE_ID` 环境逃生口；原硬编码作为兜底保留。`payment/wechat-pay-v3.js` 同类逃生口因本地 EOL 状态未一并提交，留作后续单独 commit |
| **P0-2** `admin-refunds.js` POST `/admin/api/refunds/wechat-notify` 重复退款回调路由 | `ea1312f0` | 部分闭合：`@deprecated` JSDoc + `console.warn('[DEPRECATED-NOTIFY-HIT]')` 监控；canonical 链路已确认是 `payment.handleRefundCallback`（依据 RUNBOOK L99-L106）。物理删除在 Stage 3 |
| **P0-3** `finance-firewall.js` 命名误导（不是真正的"防火墙"） | `ea1312f0` | 部分闭合：醒目 JSDoc 警告，写明它只是 finance-log helper、不可作为安全不变量。Rename 推迟到 P1 文档清理避免破坏 docs/package.json 引用 |
| **P0-4** `order-auto-confirm` 佣金冻结失败的边界 case | `ea1312f0` | 已闭合：主循环后追加 recovery scan，扫描 `completed` 但仍带 pending/pending_approval 佣金的订单；带独立 `freeze_reason='order_confirm_recovery'` 便于取证；复用 refund-blocking 守卫 |
| **P1-3** shared/ canonical 与 9 处 mirror 漂移 | `1aba39ca` | 已闭合：`errors.js`/`directed-invite.js`/`asset-url.js` canonical 升级到 mirror 领先版本；`pickup-station-stock.js` mirror 补 `buildStationStockKey`；`scripts/sync-shared.js` 三处加固（默认管理全部 *.js、跳过 `test/`+`node_modules/`、不再自动 mkdir 空 mirror 树）。`check:shared` 覆盖从 44 → 60，**+36%** |
| **P1-5** `release:check` 单一巨型命令 | `46713ac3` | 已闭合：拆为 `check:baseline`（PR 友好）+ `check:production`（发布门禁）；`release:check` 保留为 `check:production` 的 alias |
| **P1-6** 无 CI | `46713ac3` | 已闭合：`.github/workflows/cloud-mp-baseline.yml` 在 PR / main push 时跑 `check:baseline` + `admin-ui build` |
| **P1-7** `admin-ui` `/logs` 权限 alias 与 router meta 漂移 | `46713ac3` | 已闭合：移除 `adminNavigation.js` 中无意义的 `super_admin` override（router meta 用的是 `'logs'`） |
| **P1 仓库卫生** dist 包 / 私密配置 / 临时 JSON 入版本控制 | `46713ac3` | 已闭合：`.gitignore` 加 `admin-ui/dist*.zip`、`*.tmp.json`、`project.private.config.json`、`admin-ui-vite.*.log`；`git rm --cached` 对应文件 |
| **P1 audit-legacy 健壮性** legacy 目标缺失时硬失败 | `46713ac3` | 已闭合：`scripts/audit-legacy-compat.js` 容忍 legacy 目标缺失，cloudmp-only 仓库状态下不再硬失败 |
| **P1 Stage 3.10** admin-api `mysql.js` / `filesystem.js` provider 角色不清 | `ee0d1109` | 软废弃：`mysql.js` 加 `@deprecated` JSDoc + 三段证据链；`store/index.js` 选 mysql 时 `console.warn('[DEPRECATED-MYSQL-PROVIDER-HIT]')` 监控；`filesystem.js` 头注释说明它兼具"独立存储"+"cloudbase 紧急路径兜底"双角色，不可删；`cloudbase.js` 在 fallbackStore 构造处加注释指向 envId 缺失分支（L132-L174）。物理删除推迟到 Stage 4 |

证据补强：`check:baseline` 在每个 commit 都跑过——admin-api **76/76** tests、foundation **31/31**、shared 同步通过、miniprogram-routes **12/12**、legacy 1 skipped。

---

## 3. 待办 P0/P1/P2

排序：业务安全 > 工程可信度 > 长期可维护性。

### P0（仍开口的安全/正确性）

无新增 P0。本会话已识别的 4 项均已最少做到"软闭合 + 监控"，物理移除在 Stage 3/4。

> 注意：`payment/wechat-pay-v3.js` 的 `PRIVATE_KEY_FILE_ID`/`PUBLIC_KEY_FILE_ID` 逃生口在工作树里已经写好，但因本地 CRLF/LF 漂移没有进 `ea1312f0`。**主代理需要单独提交一次**（见 `ea1312f0` commit body 末尾"Note"）。在它落地前，支付证书 escape hatch 严格说只有 admin-api 一侧。

### P1（剩余工程可信度）

- **P1-1 文档可信度**（本报告任务 B 处理，本次治理结果见下方"P1-1 本次治理结果"小节）。
- **P1-2 admin-ui 巨页未拆**：`home-sections/index.vue` (59 KB)、`product-bundles/index.vue` (52 KB)、`orders/index.vue` (47 KB)、`finance/components/FinanceRulesPanel.vue` (44 KB)、`activities/components/ActivityLinksPanel.vue` (43 KB)。Stage 4 才动，但要先停止继续往里塞职责。
- **P1-4 测试覆盖偏窄**：admin-api 76 个 test 都在 `cloudfunctions/admin-api/test/`。其它云函数（order/payment/distribution）几乎没有自带测试；`check:baseline` 只跑 admin-api。建议下一阶段先为 `payment.handleRefundCallback`（被 `[DEPRECATED-NOTIFY-HIT]` 标记替换的 canonical 路径）补 1-2 个 happy-path test。
- **P1 finance-firewall 真正改名**：当前是 JSDoc 警告。文件名/包脚本/审计文件名都还叫 `finance-firewall`（`docs/STRATEGIC_FINANCE_FIREWALL_AUDIT.md`、`scripts/audit-strategic-finance-firewall.js`、`audit:finance-firewall` npm script）。Rename 工作量：3 个文件 + 1 个 npm script + 文档若干。建议合并到 P1-1 文档清理之后做。

### P2（长期可维护性，预警类）

- **P2-A `admin-api/src/app.js` 已经是上帝模块**：458 772 字节 / 9 489 行，单文件聚合了所有后台 action 路由。这是当前 cloud-mp 最大的"边界恶化指示器"。任何新加一个后台域接口默认还会塞进来。建议：
  - 短期：在文件头加"禁止继续 inline 新 action handler"注释，新增必须落到 `src/<domain>/`；
  - 中期：以 `directPatchDocument` / `saveCollection` 收口（RUNBOOK 第 4 节列了同样风险点）作为切入口，分领域抽离。
- **P2-B miniprogram 单页超大**：`pages/address/regions.js` 80 773 字节、`pages/product/detail.js` 73 005 字节、`pages/user/userDashboard.js` 38 642 字节、`pages/order/confirm.js` 36 885 字节、`pages/index/index.js` 34 061 字节。`miniprogram/app.js` 反而只有 4 075 字节（已经是修过的状态，2026-04-06 审计的"app.js 重"问题已闭合）。下一步关注的是 page 级膨胀，不是 app 级。
- **P2-C admin-api 写路径风险**（继承自 `CLOUDBASE_RELEASE_RUNBOOK.md` §4）：
  1. `directPatchDocument()` 与 `collectionPrefix` 约定未完全收口；
  2. `saveCollection()` 仍存在整集合写回风险；
  3. 冷启动 readiness 仍可能 fail-open 到半加载状态；
  4. 运行时仍能不小心切到 `ADMIN_DATA_SOURCE=mysql`（已通过 `[DEPRECATED-MYSQL-PROVIDER-HIT]` 监控，但物理路径未删）。

---

## 4. 资产盘点（保留好的）

继承自 2026-04-06 审计第 5 节，本次确认仍然是"应当保留"的资产：

1. **CloudBase 9 个云函数边界基本清晰**：login / user / products / cart / order / payment / config / distribution / admin-api 各管一摊，加上 3 个定时任务（`order-timeout-cancel`、`order-auto-confirm`、`commission-deadline-process`）。
2. **shared/ canonical + per-function mirror 模式经过 P1-3 修复后是健康的**：60 个 mirrored 文件全部对齐，`check:shared` 默认全覆盖，`scripts/sync-shared.js` 不再蒙混过关。
3. **admin-ui 已模块化**：`api/modules/*` + `views/<domain>/index.vue` 的双层结构已经成型，单文件超大问题集中在 views 巨页而不是 api 层。
4. **miniprogram 请求层经过收口**：`utils/requestRoutes.js` 是路径到 action 的单一真相源，`utils/request.js` 不再散落 URL 表（继承 `CLOUD_MP_DEVELOPMENT_GUIDE.md` §10 约定）。
5. **CI + release gate**：`.github/workflows/cloud-mp-baseline.yml` + `check:baseline` + `check:production` + `release:check` alias 已经成体系，足够应付日常 PR。
6. **运行手册可信**：`CLOUDBASE_RELEASE_RUNBOOK.md` 是当前 release 流程的唯一入口；`CLOUD_MP_DEVELOPMENT_GUIDE.md` 是 dev 入口；AGENTS.md 是 agent 协作约定。这三份不要再被旧文档冲淡。

---

## 5. 路线图（剩余阶段）

| 阶段 | 主题 | 目标 | 预估工作量 |
| --- | --- | --- | --- |
| **Stage 3**（进行中） | P1-1 文档可信度 + finance-firewall rename + P0-2 物理删除 deprecated 退款 notify route | 让"读文档不会被骗"，并把已软废弃的代码路径在生产无监控命中后真正删除 | 0.5-1 天 |
| **Stage 4** | mysql.js + filesystem.js 物理 delete + ADMIN_DATA_SOURCE='mysql' 移除 + admin-api app.js 拆分启动 | 等 production 日志确认 1 个 release cycle 内 `[DEPRECATED-MYSQL-PROVIDER-HIT]` 零命中后执行；同期开始按域抽 admin-api 路由 | 1-2 天（不含 admin-api 拆分） |
| **Stage 5** | admin-ui 巨页拆分 + miniprogram 巨页拆分 | 每页降到 ~20 KB 以内 | 2-5 天，按页推进 |
| **Stage 6** | 测试覆盖扩张 | order/payment/distribution 关键链路加 happy-path test，提升 `check:baseline` 含金量 | 持续 |

---

## 6. 附录：本次审计方法

- **4 个并行 sub-agent**（主代理派发）：
  1. shared 模块漂移审计（产出 P1-3 闭合方案）
  2. admin-api store provider 角色审计（产出 P1 Stage 3.10 软废弃方案）
  3. 退款 notify 路由 canonical 链路确认（产出 P0-2 处置方向）
  4. release:check / CI / 仓库卫生整体盘点（产出 Stage 1 多个细项）
- **主代理结构核对**：在 sub-agent 提交完成后，主代理再用 git diff、文件大小统计、`check:baseline` 重跑等手段交叉验证，避免单个 sub-agent 报告失真。
- **每个 commit 的 git log body** 都明确写了"对应审计报告里的哪一项 + 证据链 + verification 结果"，可逐条审计回放（`git log <hash>` 即可）。

---

## 7. P1-1 本次治理结果（2026-05-03）

本次文档治理只动 `.md` 文件，不动任何代码或配置。处置原则：

- 完全过时的 → 物理移到 `cloud-mp/docs/archive/legacy-stage-reports/`，原位置只留一行归档说明 + 指向当前真相源；
- 命令名/语义已局部漂移但不致误导的 → 在文件头插入 `> ⚠️ 2026-05-03 更新：...`；
- 与 `AGENTS.md` 直接矛盾的 → 以 `AGENTS.md` 为准修正。

### 7.1 已归档（7 份，均移至 `docs/archive/legacy-stage-reports/`）

| 原路径 | 最后有效日期 | 归档理由 |
| --- | --- | --- |
| `docs/P1_FIXES_SUMMARY.md` | 2026-04-09 | 描述的是 2026-04-09 一次性 P1 修复，与本会话 P1 集合无关；末尾的"立即行动"清单已和当前流程脱节 |
| `docs/P2_COMPLETE_SUMMARY.md` | 2026-04-09 | 列举的"待拆分云函数行数"是 2026-04-09 快照，且描述的子模块拆分计划从未完整执行 |
| `docs/P2_FIXES_REPORT.md` | 2026-04-09 | 自动化批改中间产物，把"括号不匹配"列成结论；与当前代码无关 |
| `docs/P2_INTEGRATION_REPORT.md` | 2026-04-09 | 同上系列 |
| `docs/COMPREHENSIVE_P2_VERIFICATION.md` | 2026-04-09 | 73/100 评分基于 2026-04-09 行数快照，已被后续真实改动覆盖 |
| `docs/P3_REFACTORING_GUIDE.md` | 2026-04-09 | 五个云函数的拆分草稿，从未执行；当前真正应拆的是 `admin-api/src/app.js` |
| `docs/SAFE_INTEGRATION_REPORT.md` | 2026-04-09 | 报告自身列"检查 0、修改 0"，是空跑产物 |

7 份原位置都留下了一行 `> 已归档至 archive/legacy-stage-reports/<原文件名>，最后有效日期 2026-04-09。` + 指向本审计报告对应章节的导引。

### 7.2 已加 `> ⚠️ 2026-05-03 更新` 头注（3 份）

这三份提到的 `npm run release:check` 仍可执行（保留为 `check:production` 的 alias），不算误导，只在头部加注当前推荐用法：

- `docs/standards/enterprise-hardening/acceptance/release-checklist.md`
- `docs/standards/enterprise-hardening/acceptance/preprod-gates.md`
- `docs/release/ENTERPRISE_RELEASE_RUNBOOK.md`

### 7.3 重写（1 份）

- 根 `README.md`：原版本把项目描述成 `backend/` + `admin-ui/` + `miniprogram/` 三段式 + MySQL 自建后端，与 `AGENTS.md` 当前真相源直接矛盾。重写为：以 `cloud-mp/` 为主体、旧三目录标注为待评估废弃、链回 `AGENTS.md` / `CLOUD_MP_DEVELOPMENT_GUIDE.md` / `CLOUDBASE_RELEASE_RUNBOOK.md` / 本审计报告。`AGENTS.md` 本身按要求未动。

### 7.4 本次审计中确认仍正确、保留的关键文档

- `cloud-mp/docs/CLOUD_MP_DEVELOPMENT_GUIDE.md`（2026-04-23 更新，结构、链路、约定均与代码一致）
- `cloud-mp/docs/CLOUDBASE_RELEASE_RUNBOOK.md`（release 流程权威入口）
- `cloud-mp/docs/CLOUDBASE_MIGRATION_BACKLOG.md`（2026-04-18，列的 P0/P1/P2 仍准确）
- `cloud-mp/docs/archive/README.md`（归档目录索引，已说明分层）
- 根 `AGENTS.md`（按要求未改动）

### 7.5 未处理但建议下一轮处理

- `docs/STRATEGIC_FINANCE_FIREWALL_AUDIT.md` / `scripts/audit-strategic-finance-firewall.js` / `audit:finance-firewall` npm script：与 P0-3 的"finance-firewall 命名误导"一起做物理 rename（涉及 .js / package.json 修改，超出本次 .md-only 范围）。
- `cloud-mp/docs/CLOUDBASE_LEGACY_COMPAT_AUDIT.md`（5.7 KB）：未通读，下一轮核对其结论是否被 `audit:legacy` 健壮性修复（commit `46713ac3`）覆盖。
- `cloud-mp/docs/V2_LOCAL_READINESS.md` / `PHASE1_SMOKE_CHECKLIST.md`：未核对，下一轮判断是否归档。

---

> 📌 此报告为 IDE 内存版本恢复后的重建产物，原始 0 字节文件于 2026-05-03 由本任务恢复。所有 commit 行为描述均取自该 commit 的 git log，未凭印象。如本报告与 commit body 任何描述冲突，以 commit body 为准。

