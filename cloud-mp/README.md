# cloud-mp

`cloud-mp` 是当前仍在维护的微信电商分销系统主工程，运行主线已经切到 CloudBase。

## 当前真相源

优先参考以下文档：

- `README.md`
- `docs/CLOUD_MP_DEVELOPMENT_GUIDE.md`
- `docs/CLOUDBASE_RELEASE_RUNBOOK.md`
- `升级.md`

如果历史阶段总结、迁移纪要、旧优化报告与上述文档冲突，以当前代码和这 4 份文档为准。

## 项目边界

- `miniprogram/`: 微信小程序用户端
- `cloudfunctions/`: 小程序云函数与管理服务 `admin-api`
- `admin-ui/`: 管理后台前端
- `cloudbase-seed/`: CloudBase 标准化 seed 基线
- `cloudbase-import/`: CloudBase 导入包
- `docs/`: 当前文档、运行手册、审计资料

## 运行边界

- 小程序通过 `miniprogram/utils/request.js` 发起调用
- REST 风格接口到云函数 action 的映射真相源在 `miniprogram/utils/requestRoutes.js`
- 管理端只通过 `/admin/api/*` 访问 `cloudfunctions/admin-api`
- 生产运行时的正式数据源是 CloudBase
- `mysql/` 只保留迁移输入和历史对照，不再作为当前生产运行时主数据源

## 当前状态

截至 2026-04-18，本地已确认：

- `node --test cloudfunctions/admin-api/test/*.test.js` 通过
- `npm run check:foundation` 通过
- `admin-ui npm run build` 通过
- 小程序路由审计脚本已切回读取 `requestRoutes.js`

但项目仍处于收口期，当前重点不是继续扩功能，而是恢复文档、运行、审计和数据写入路径的一致性。

## 主要风险

- `admin-api` 仍存在超大入口文件，需要继续收口
- CloudBase 精确写入路径与 `collectionPrefix` 约定还需要统一
- `saveCollection()` 仍有整集合写回风险
- 冷启动 readiness 逻辑仍需要收紧，避免半初始化实例放行
- 仓库内仍保留大量历史文档和阶段产物，需要继续归类

## 常用命令

项目根目录：

```powershell
cd C:\Users\21963\WeChatProjects\zz\cloud-mp
npm run check:foundation
npm run audit:miniprogram-routes
npm run release:check
```

管理端：

```powershell
cd C:\Users\21963\WeChatProjects\zz\cloud-mp\admin-ui
npm install
npm run dev
npm run build
```

管理端 API 测试：

```powershell
cd C:\Users\21963\WeChatProjects\zz\cloud-mp
node --test "cloudfunctions/admin-api/test/*.test.js"
```

## 文档维护约定

- 入口说明写在 `README.md`
- 功能地图与开发入口写在 `docs/CLOUD_MP_DEVELOPMENT_GUIDE.md`
- 发布与上线操作写在 `docs/CLOUDBASE_RELEASE_RUNBOOK.md`
- 本轮文档升级记录写在 `升级.md`

其他阶段性总结、审计快照、运行证据默认视为“辅助资料”而不是主真相源。
