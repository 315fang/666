# CloudBase Migration Progress

更新日期：2026-04-18

## 当前判断

`cloud-mp` 的正式运行主线已经切到 CloudBase，但迁移工作并没有“自然结束”，而是进入了收口阶段。

更准确的说法是：

- 小程序主链路已是 CloudBase
- 管理后台正式主链路已是 `admin-api + CloudBase`
- MySQL 仍保留为迁移输入和历史资产
- 当前剩余工作重点已从“是否迁过去”变成“迁过去之后是否一致、可信、可维护”

## 已完成

### 运行主线

- 小程序通过 `wx.cloud` 与云函数运行
- 管理后台通过 `/admin/api/*` 访问 `admin-api`
- 项目根目录 `package.json`、`project.config.json`、CloudBase 相关脚本和集合基线已经形成

### 数据资产

- 已建立 `cloudbase-seed/`
- 已建立 `cloudbase-import/`
- 已建立目标模型与迁移映射文档

### 工程能力

- `admin-api` 测试已具备基础可执行性
- `check:foundation` 可验证基础结构
- `admin-ui` 可构建
- 小程序路由审计已回到 `requestRoutes.js` 作为路径真相源

## 未完成但仍关键

### A. 运行一致性

- `directPatchDocument()` 与 `collectionPrefix` 约定还未完全收口
- `saveCollection()` 仍存在整集合覆盖写风险
- `admin-api` 冷启动时的数据预热和就绪逻辑还需收紧

### B. 遗留资产处理

- MySQL 运行时兼容路径仍保留在代码中
- 旧阶段文档仍不少，容易误导协作
- 部分脚本和报告仍残留旧阶段完成度口径

### C. 文档收口

- 入口文档、开发指南、发布手册已经开始收口
- 但审计快照、阶段总结、历史交付文件仍需要继续分层管理

## 当前阶段目标

本阶段不再把重点放在“再迁一层功能”，而是放在下面几件事：

1. 恢复文档可信度
2. 恢复审计和检查结果可信度
3. 收紧 CloudBase 数据写路径
4. 清理仍会误导协作的 MySQL/旧阶段口径

## 对 MySQL 的当前结论

- MySQL 仍是仓库中的迁移输入
- MySQL 不是当前推荐的正式运行模式
- 任何运行说明若继续把 MySQL 写成当前正式主数据源，都应视为过时文档
