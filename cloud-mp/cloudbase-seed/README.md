# CloudBase Seed

这个目录用于存放从 `mysql/jsonl` 规范化生成的 CloudBase 目标集合数据。

生成命令：

```powershell
node .\scripts\normalize-cloudbase-data.js
```

用途：

- 作为导入 CloudBase 文档数据库前的标准化中间层
- 用于比对旧 MySQL 字段和新 CloudBase 字段是否已经对齐
- 用于后续逐步替换“兼容读取”逻辑

注意：

- 这里的金额已经按长期目标转换为“分”
- `*_legacy_id` 仅用于迁移追踪，不应作为运行时主键
