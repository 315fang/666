# CloudBase 迁移操作入口

## 目标

把 `cloud-mp/scripts` 和 `cloud-mp/docs` 中仍然有效的迁移资产，纳入主干仓库的日常入口。

当前原则：

- 脚本实现仍保留在 `cloud-mp/scripts`
- 主干通过统一包装脚本进入，不再要求协作者自己在子目录里找命令
- 运行态、导入态、支付态、兼容审计结果，以主干 `docs/` 与 `cloud-mp/docs/` 的最新报告为准

## 主干执行入口

主干新增统一入口：

- [cloudbase-tool.mjs](/C:/Users/21963/WeChatProjects/zz/scripts/cloudbase-tool.mjs)

使用方式：

```powershell
cd C:\Users\21963\WeChatProjects\zz
node scripts/cloudbase-tool.mjs runtimeStatus
node scripts/cloudbase-tool.mjs paymentReady
node scripts/cloudbase-tool.mjs productionCheck
```

## 当前支持的命令

- `foundation`
  - 执行 `cloud-mp/scripts/check-cloudbase-foundation.js`
- `importReady`
  - 执行 `cloud-mp/scripts/check-cloudbase-import-ready.js`
- `importValidate`
  - 执行 `cloud-mp/scripts/validate-cloudbase-import.js`
- `runtimeStatus`
  - 执行 `cloud-mp/scripts/check-cloudbase-runtime-status.js`
- `importSelected`
  - 执行 `cloud-mp/scripts/import-cloudbase-collections.js`
- `importReport`
  - 执行 `cloud-mp/scripts/write-cloudbase-import-result.js`
- `paymentReady`
  - 执行 `cloud-mp/scripts/check-payment-readiness.js`
- `legacyAudit`
  - 执行 `cloud-mp/scripts/audit-legacy-compat.js`
- `openidRepair`
  - 执行 `cloud-mp/scripts/repair-cloudbase-openid-fields.js`
- `productionCheck`
  - 执行 `cloud-mp/scripts/check-production-gaps.js`
- `normalizeData`
  - 执行 `cloud-mp/scripts/normalize-cloudbase-data.js`
- `buildImport`
  - 执行 `cloud-mp/scripts/build-cloudbase-import-jsonl.js`

## 当前推荐顺序

### 做环境校验时

1. `node scripts/cloudbase-tool.mjs foundation`
2. `node scripts/cloudbase-tool.mjs importValidate`
3. `node scripts/cloudbase-tool.mjs runtimeStatus`
4. `node scripts/cloudbase-tool.mjs productionCheck`

### 做数据导入时

1. `node scripts/cloudbase-tool.mjs normalizeData`
2. `node scripts/cloudbase-tool.mjs buildImport`
3. `node scripts/cloudbase-tool.mjs importValidate`
4. `node scripts/cloudbase-tool.mjs importSelected <collection...>`
5. `node scripts/cloudbase-tool.mjs importReport`

## 当前主干入口文档

以下 `cloud-mp/docs` 产物已被视为主干协作时需要查看的有效迁移资料：

- [CLOUDBASE_ENV_RUNTIME_STATUS.md](/C:/Users/21963/WeChatProjects/zz/cloud-mp/docs/CLOUDBASE_ENV_RUNTIME_STATUS.md)
- [CLOUDBASE_ENV_IMPORT_RESULT.md](/C:/Users/21963/WeChatProjects/zz/cloud-mp/docs/CLOUDBASE_ENV_IMPORT_RESULT.md)
- [CLOUDBASE_LEGACY_COMPAT_AUDIT.md](/C:/Users/21963/WeChatProjects/zz/cloud-mp/docs/CLOUDBASE_LEGACY_COMPAT_AUDIT.md)
- [CLOUDBASE_FOUNDATION_SETUP.md](/C:/Users/21963/WeChatProjects/zz/cloud-mp/docs/CLOUDBASE_FOUNDATION_SETUP.md)
- [CLOUDBASE_ENV_IMPORT_CHECKLIST.md](/C:/Users/21963/WeChatProjects/zz/cloud-mp/docs/CLOUDBASE_ENV_IMPORT_CHECKLIST.md)

## 边界

- `cloud-mp` 仍然是迁移资产主目录，但不再是唯一入口
- 主干 `docs/` 与 `scripts/` 已建立 CloudBase 迁移的协作入口
- 需要归档的历史迁移材料，继续进入 `docs/archive/`
