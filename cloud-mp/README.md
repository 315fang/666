# cloud-mp

`cloud-mp` 是当前迁移后的主工程目录。

## 目录角色

- `miniprogram/`: 微信小程序用户端
- `cloudfunctions/`: 云函数与 CloudRun `admin-api`
- `admin-ui/`: 管理后台前端源码
- `cloudbase-seed/`: CloudBase 正式集合 seed 基线
- `cloudbase-import/`: CloudBase 导入文件
- `docs/CLOUD_MP_MIGRATION_MATRIX.md`: 旧工程对照迁移矩阵

## 运行边界

- 小程序只通过 `miniprogram/utils/request.js` 调云函数
- 管理端只通过 `/admin/api/*` 访问管理服务
- 生产环境 `admin-api` 必须以 CloudBase 作为主数据源
- 素材与用户信息以微信云开发为正式存储，不回落旧后端

## 常用命令

```powershell
cd cloud-mp
npm run audit:migration
npm run seed:ensure-target
npm run check:foundation
npm run release:check
```

管理端：

```powershell
cd cloud-mp/admin-ui
npm run dev
npm run build
```

## 当前收口结果

- 小程序页面迁移矩阵已全量对齐
- 云函数 action 与小程序请求映射已全量对齐
- 管理端源码已并入 `cloud-mp/admin-ui`
- 管理接口矩阵已与 `admin-api` 对齐
- CloudBase 目标模型缺失集合基线已补齐
