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

除非另有说明，历史阶段文档、旧计划、设计稿、修复日志不作为当前实现依据。

## 协作原则

1. 不根据失真的旧文档做决策。
2. 不继续向大而杂的入口文件塞新职责。
3. 收口期间优先做可信度修复，而不是新增功能。
4. 需要保留的历史资料进入 `docs/archive/`，不要继续混在主入口。
