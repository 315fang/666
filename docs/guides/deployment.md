# 部署说明

## 当前原则

部署前至少确认以下事项：

1. 后端测试通过
2. 管理端构建通过
3. 环境变量已核对
4. 数据库变更已确认执行方式

## 后端

```powershell
cd backend
npm install --production
node server.js
```

如使用进程管理器，按现有部署方式重启对应服务。

## 管理端

```powershell
cd admin-ui
npm install
npm run build
```

将 `dist/` 部署到静态资源服务或现有管理端托管环境。

## 小程序

1. 在微信开发者工具中完成构建与预览
2. 校对后端环境地址
3. 提交上传并填写版本说明

## 数据库与脚本

- `backend/migrations/`：结构迁移
- `backend/scripts/`：辅助修复与数据处理脚本

部署前必须明确：

1. 是否有新增 migration
2. 是否需要执行修复脚本
3. 是否可回滚

## 当前风险

- 本仓库仍在收口阶段，部署前应先阅读：
  - `docs/audit/2026-04-06-repo-audit.md`
  - `docs/plans/2026-04-06-repo-closure-tasklist.md`
