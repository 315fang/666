# zz 项目

微信电商分销系统仓库。**当前主体已迁至 `cloud-mp/`（微信 CloudBase 云开发）**；根目录仍保留 `backend/`、`admin-ui/`、`miniprogram/` 三个旧目录作为迁移历史资产，已基本不再作为运行目标。

> 协作约定与"当前真相源"以根 [`AGENTS.md`](./AGENTS.md) 为准。当本 README 与 `AGENTS.md` 冲突时，以 `AGENTS.md` 为准并把本文同步更新。

## 顶层目录

| 路径 | 角色 | 说明 |
| --- | --- | --- |
| `cloud-mp/` | **当前主体** | CloudBase 云开发：云函数、小程序、管理后台、脚本、配置 |
| `backend/` | 旧版（待评估废弃） | 原 Node.js + Express + Sequelize + MySQL 自建后端 |
| `admin-ui/` | 旧版（待评估废弃） | 早期 Vue 3 管理后台代码（已被 `cloud-mp/admin-ui/` 取代） |
| `miniprogram/` | 旧版（待评估废弃） | 早期微信小程序代码（已被 `cloud-mp/miniprogram/` 取代） |
| `docs/` | 收口资料 | 全仓级审计报告、收口计划、规则。其中 `docs/audit/2026-04-06-repo-audit.md` 是收口起点 |

旧版三个目录里的功能已经在 `cloud-mp/` 重写过一遍，是否物理删除取决于后续阶段决策（见 `AGENTS.md` "当前优先目标"第 3 项）。

## 当前阶段

`AGENTS.md` 指明当前处于 **"MySQL 后清理 + CloudBase 收口"** 阶段，优先级如下：

1. 清理已完成迁移的 MySQL 残余代码和引用
2. 修正 CloudBase 云函数中的逻辑 bug 和安全问题
3. 统一 `cloud-mp/` 与旧版 `admin-ui/` / `miniprogram/` 的差异
4. 修复测试体系可信度
5. 控制大文件和上帝模块继续膨胀

最近一份综合审计：[`cloud-mp/docs/audit/2026-05-03-comprehensive-code-review.md`](./cloud-mp/docs/audit/2026-05-03-comprehensive-code-review.md)

## 开发与发布入口

`cloud-mp/` 下的常用命令（详见 `AGENTS.md` "`cloud-mp` 常用工作流"）：

```powershell
cd cloud-mp

node --test "cloudfunctions/admin-api/test/*.test.js"
npm run check:foundation
npm run audit:miniprogram-routes

cd admin-ui
npm run build
```

更细粒度：

- `npm run check:baseline`：PR 友好基线（foundation + shared + audit:legacy + miniprogram-routes + admin-api 测试）
- `npm run check:production`：发布门槛（baseline + import 校验 + production-gaps 检查）
- `npm run release:check`：保留为 `check:production` 的别名

发布流程见 [`cloud-mp/docs/CLOUDBASE_RELEASE_RUNBOOK.md`](./cloud-mp/docs/CLOUDBASE_RELEASE_RUNBOOK.md)。

## 真相源边界

- 协作约定：[`AGENTS.md`](./AGENTS.md)
- cloud-mp 开发指南：[`cloud-mp/docs/CLOUD_MP_DEVELOPMENT_GUIDE.md`](./cloud-mp/docs/CLOUD_MP_DEVELOPMENT_GUIDE.md)
- 发布运行手册：[`cloud-mp/docs/CLOUDBASE_RELEASE_RUNBOOK.md`](./cloud-mp/docs/CLOUDBASE_RELEASE_RUNBOOK.md)
- 当前综合审计：[`cloud-mp/docs/audit/2026-05-03-comprehensive-code-review.md`](./cloud-mp/docs/audit/2026-05-03-comprehensive-code-review.md)
- 历史审计起点：[`docs/audit/2026-04-06-repo-audit.md`](./docs/audit/2026-04-06-repo-audit.md)

历史阶段文档、旧计划、设计稿、修复日志默认不作为现状依据。已归档的过时内容请进入 `cloud-mp/docs/archive/`。

## 工作原则

1. 不根据失真的旧文档做决策。
2. 不继续向大而杂的入口文件塞新职责（典型受害者：`cloud-mp/cloudfunctions/admin-api/src/app.js`）。
3. 收口期间优先做可信度修复，而不是新增功能。
4. 仓库默认只保留源码、配置、当前文档，不保留工具残留和运行产物（参见 `cloud-mp/.gitignore`）。
