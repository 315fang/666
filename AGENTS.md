# AGENTS.md

本文件用于说明当前仓库的真实协作约定。

## 项目边界

本仓库是一个微信电商分销系统，已从 MySQL 自建后端迁移至微信 CloudBase 云开发。核心目录如下：

- `cloud-mp/`: CloudBase 项目主体（云函数、小程序、管理后台、脚本、配置）
- `admin-ui/`: 管理后台（旧版，待评估是否废弃）
- `miniprogram/`: 微信小程序（旧版，待评估是否废弃）
- `docs/`: 文档与收口资料

## 当前优先目标

当前处于"MySQL 后清理 + CloudBase 收口"阶段，优先级如下：

1. 清理已完成迁移的 MySQL 残余代码和引用
2. 修正 CloudBase 云函数中的逻辑 bug 和安全问题
3. 统一 cloud-mp/ 与旧版 admin-ui/miniprogram 的差异
4. 修复测试体系可信度
5. 控制大文件和上帝模块继续膨胀

## 真相来源

当前应优先参考以下文档：

- [`README.md`](/C:/Users/21963/WeChatProjects/zz/README.md)
- [`docs/audit/2026-04-06-repo-audit.md`](/C:/Users/21963/WeChatProjects/zz/docs/audit/2026-04-06-repo-audit.md)
- [`docs/plans/2026-04-06-repo-closure-program.md`](/C:/Users/21963/WeChatProjects/zz/docs/plans/2026-04-06-repo-closure-program.md)
- `cloud-mp/docs/CLOUD_MP_DEVELOPMENT_GUIDE.md`
- `cloud-mp/docs/CLOUDBASE_RELEASE_RUNBOOK.md`

除非另有说明，历史阶段文档、旧计划、设计稿、修复日志不作为当前实现依据。

## `cloud-mp` 常用工作流

`cloud-mp/` 当前已有一套可复用的本地收口命令；改这里的云函数、小程序路由或发布链路时，优先复用，不要另造一次性脚本。

- 基线校验：在 `cloud-mp/` 下优先运行 `npm run check:baseline`；当前它已串起 `check:foundation`、`check:shared`、`audit:legacy`、`audit:miniprogram-routes`、`audit:cloudfunction-config` 和 `test:cloudfunctions`。只需单独盯 `admin-api` 时再运行 `node --test "cloudfunctions/admin-api/test/*.test.js"`
- 后台改动校验：在 `cloud-mp/admin-ui/` 下运行 `npm run build`
- 共享模块校验：改 `cloud-mp/cloudfunctions/shared/` 或各云函数镜像 `shared/` 时，先跑 `npm run check:shared`；只有明确要同步白名单共享文件时才运行 `npm run sync:shared`
- 发布前收口：日常 PR / 本地收口优先跑 `cloud-mp` 下的 `npm run check:baseline`；正式发布前显式跑 `npm run check:production`，`npm run release:check` 目前只是它的别名。CloudBase 登录、环境绑定、部署顺序以 `cloud-mp/docs/CLOUDBASE_RELEASE_RUNBOOK.md` 为准

## 协作原则

1. 不根据失真的旧文档做决策。
2. 不继续向大而杂的入口文件塞新职责。
3. 收口期间优先做可信度修复，而不是新增功能。
4. 需要保留的历史资料进入 `docs/archive/`，不要继续混在主入口。

