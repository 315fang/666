# CloudBase Import Package

更新日期：2026-04-18

本目录存放可导入 CloudBase 的 JSONL 包。

## 生成链路

```powershell
cd C:\Users\21963\WeChatProjects\zz\cloud-mp
node .\scripts\normalize-cloudbase-data.js
node .\scripts\build-cloudbase-import-jsonl.js
```

生成关系：

`mysql/jsonl -> cloudbase-seed -> cloudbase-import`

## 角色

- 作为 CloudBase 环境初始化导入包
- 作为导入前验证和导入后核对的静态产物
- 不是正式运行时数据库

## 当前注意事项

- 导入包仍属于迁移期资产
- 图片和素材字段仍可能存在待切换的 `file_id`/旧 URL 兼容问题
- 管理员密码相关字段只用于历史兼容和导入，不应被当作最终身份体系设计

## 建议

- 导入前先执行 `npm run import:validate`
- 导入后结合 `docs/CLOUDBASE_RELEASE_RUNBOOK.md` 做环境检查
