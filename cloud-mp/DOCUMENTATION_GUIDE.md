# 文档导航

更新日期：2026-04-18

本文件用于快速定位 `cloud-mp` 当前应读什么文档，以及哪些文档只是阶段产物。

## 1. 先读哪几份

无论你的角色是什么，先读这 4 份：

1. `README.md`
2. `docs/CLOUD_MP_DEVELOPMENT_GUIDE.md`
3. `docs/CLOUDBASE_RELEASE_RUNBOOK.md`
4. `升级.md`

这 4 份负责解释：

- 项目现在是什么
- 代码主链路在哪里
- 当前怎么开发、构建、发布
- 这轮文档升级改了什么

## 2. 按角色推荐

### 产品 / 管理者

- `PROJECT_OVERVIEW.md`
- `README.md`
- `升级.md`

### 小程序开发

- `docs/CLOUD_MP_DEVELOPMENT_GUIDE.md`
- `miniprogram/app.json`
- `miniprogram/utils/requestRoutes.js`

### 管理后台开发

- `admin-ui/README.md`
- `docs/CLOUD_MP_DEVELOPMENT_GUIDE.md`
- `cloudfunctions/admin-api/src/app.js`

### 运维 / 发布

- `docs/CLOUDBASE_RELEASE_RUNBOOK.md`
- `docs/release/README.md`
- `docs/production/*.md`

### 审计 / 收口

- `docs/AUDIT_ALL_SUMMARY.md`
- `docs/audit/*.md`
- `升级.md`

## 3. 文档分层

### A. 当前主真相源

- `README.md`
- `docs/CLOUD_MP_DEVELOPMENT_GUIDE.md`
- `docs/CLOUDBASE_RELEASE_RUNBOOK.md`
- `升级.md`

### B. 当前有效的配套说明

- `PROJECT_OVERVIEW.md`
- `admin-ui/README.md`
- `admin-ui/快速启动.md`
- `cloudbase-seed/README.md`
- `cloudbase-import/README.md`
- `docs/CLOUDBASE_MIGRATION_PROGRESS.md`
- `docs/CLOUDBASE_MIGRATION_BACKLOG.md`

### C. 审计、运行快照、阶段性结果

- `docs/AUDIT_ALL_SUMMARY.md`
- `docs/MINIPROGRAM_ROUTE_TABLE_AUDIT.md`
- `docs/ADMIN_*`
- `docs/*_AUDIT.md`
- `docs/reports/*`
- `docs/release/evidence/*`

这些文件有价值，但默认不应替代主真相源。

### D. 历史或参考性质较强的资料

- 旧阶段修复总结
- 一次性导入说明
- 历史交付总结
- `docs/archive/root-history/*`
- `docs/archive/root-artifacts/*`
- `skills/design-md/**` 下的参考 README

其中 `skills/design-md/**` 不是本项目业务文档，只是仓库里的参考素材。

## 4. 常见问题去哪里看

### “小程序某个接口到底调哪个云函数？”

看：

- `miniprogram/utils/requestRoutes.js`
- `docs/MINIPROGRAM_ROUTE_TABLE_AUDIT.md`

### “管理后台写操作经过哪里？”

看：

- `admin-ui/src/api/**`
- `cloudfunctions/admin-api/src/app.js`
- `admin-ui/README.md`

### “项目现在还用不用 MySQL？”

看：

- `README.md`
- `docs/CLOUDBASE_MIGRATION_PROGRESS.md`
- `MYSQL_TO_CLOUDBASE_MAPPING.md`

结论是：MySQL 仍保留为迁移输入和历史对照，但不是当前正式运行时主数据源。

### “上线前看什么？”

看：

- `docs/CLOUDBASE_RELEASE_RUNBOOK.md`
- `docs/release/README.md`
- `docs/production/*.md`

## 5. 维护约定

- 新功能入口变了，先改 `docs/CLOUD_MP_DEVELOPMENT_GUIDE.md`
- 发布流程变了，先改 `docs/CLOUDBASE_RELEASE_RUNBOOK.md`
- 项目边界或文档结构变了，先改 `README.md`
- 做了一轮系统性文档升级，补写 `升级.md`
