# CloudBase 日备份与恢复手册

日期：2026-04-17

## 1. 目标

本手册用于规范正式运行数据的日备份、备份核查和恢复验证。

当前正式运行真相源：

- CloudBase 文档库集合
- `admin_singletons`
- `configs`
- `app_configs`

MySQL 仅视为历史遗留资产，不纳入日常备份门禁。

## 2. 每日备份

每日 `02:30`（`Asia/Shanghai`）执行：

```powershell
npm run backup:daily
```

要求：

- 备份成功上传到 CloudBase 存储
- 生成：
  - `backup-manifest.json`
  - `_summary.json`
  - 每集合导出的 `jsonl`
- 本地运行时证据更新：
  - `docs/release/evidence/runtime/backup-latest.json`
  - `docs/release/evidence/runtime/backup-latest.md`

## 3. 运行前提

执行备份前必须确认：

- `npx mcporter call cloudbase.auth action=status --output json` 显示 `READY`
- 当前环境已绑定正式 CloudBase 环境
- CloudBase 存储可写

可选：

- `OPS_BACKUP_PREFIX`
  默认值：`ops-backups`

## 4. 备份核查

执行：

```powershell
npm run backup:verify
```

要求：

- 远端 `backup-manifest.json` 与 `_summary.json` 存在
- 抽样集合至少包含：
  - `admins`
  - `orders`
- 抽样下载内容可被解析为合法 JSONL

运行结果写入：

- `docs/release/evidence/runtime/backup-verify-latest.json`
- `docs/release/evidence/runtime/backup-verify-latest.md`

## 5. 恢复验证

恢复验证不要求直接写回线上环境，但至少要完成一次“文件级恢复模拟”：

1. 使用某次备份的 manifest 定位对象路径
2. 下载抽样集合备份文件
3. 验证：
   - 文件存在
   - 条数与 summary 对齐
   - JSONL 可解析
4. 将结果补入预发或演练记录

## 6. 通过定义

只有当以下条件同时满足时，才视为备份链路有效：

- 当日备份成功
- 最新 backup manifest 存在
- 最新 backup verify 通过
- 至少一次恢复验证记录存在

## 7. 阻断定义

以下任一情况存在时，视为发布阻断：

- 当日备份缺失
- backup manifest 缺失
- backup verify 失败
- 恢复验证记录缺失
