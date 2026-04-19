# CloudBase Migration Backlog

更新日期：2026-04-18

本清单只保留当前还值得继续做的收口项，不再保留已经失效的阶段性口号。

## P0 运行安全

- 收口 `directPatchDocument()` 与 `collectionPrefix`
- 收紧 `admin-api` 冷启动 readiness，避免半初始化实例继续放行
- 降低或移除高风险整集合写回路径
- 确认正式环境不会再切回 `ADMIN_DATA_SOURCE=mysql`

## P1 文档与审计可信度

- 继续清理过时的入口文档和阶段总结
- 保持 `requestRoutes.js` 作为小程序路由真相源
- 修正所有仍把 MySQL 写成正式运行环境的说明
- 把历史阶段报告和当前真相源继续分层

## P2 结构收口

- 继续拆分 `cloudfunctions/admin-api/src/app.js`
- 控制后台和小程序超大文件继续膨胀
- 逐步减少由页面层直接拼接的兼容字段逻辑

## P3 遗留资产治理

- 继续梳理 `mysql/` 中哪些是必须保留的迁移资产
- 清理无继续维护价值的临时文档、一次性交付总结和重复导航页
- 把历史快照和运行证据继续归位到更明确的目录层级
