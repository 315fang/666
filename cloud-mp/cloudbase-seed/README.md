# CloudBase Seed

更新日期：2026-04-18

本目录存放 CloudBase 标准化 seed 基线。

## 角色

- 作为 CloudBase 集合的标准化中间层
- 作为迁移核对和字段审计的静态输入
- 作为导入包 `cloudbase-import/` 的上游数据源

## 数据来源

当前 seed 主要由历史迁移输入规范化生成：

- `mysql/jsonl/*`

这不代表项目当前正式运行时仍依赖 MySQL，只表示迁移资产仍保留在仓库内用于对照和校验。

## 生成命令

```powershell
cd C:\Users\21963\WeChatProjects\zz\cloud-mp
node .\scripts\normalize-cloudbase-data.js
```

## 使用原则

- `cloudbase-seed/` 不是线上实时数据库
- 这里的数据用于审计、导入、回放和字段对照
- `*_legacy_id` 仅用于迁移追踪，不应继续扩散成运行时主键
