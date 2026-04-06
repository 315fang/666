# CLAUDE.md

本文件用于说明当前仓库的真实协作约定。

## 项目边界

本仓库是一个微信电商分销系统，核心目录如下：

- `backend/`: 后端服务
- `admin-ui/`: 管理后台
- `miniprogram/`: 微信小程序
- `docs/`: 文档与收口资料

## 当前优先目标

当前处于“全面审计与收口”阶段，优先级如下：

1. 修正文档与实现不一致的问题
2. 清理仓库污染与历史资料
3. 修复测试体系可信度
4. 统一权限模型
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
