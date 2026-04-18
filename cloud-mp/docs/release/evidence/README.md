# 运行时发布证据目录

本目录分为两部分：

- `templates/`
  手工或半自动执行预发验证、回滚演练时要使用的固定模板，纳入版本控制。
- `runtime/`
  运行时生成的最新证据和状态文件，不纳入版本控制。

当前约定的运行时文件：

- `runtime/backup-latest.json`
- `runtime/backup-latest.md`
- `runtime/backup-verify-latest.json`
- `runtime/backup-verify-latest.md`
- `runtime/preprod-evidence-latest.json`
- `runtime/rollback-drill-latest.json`

发布门禁只认 `runtime/` 下的最新证据，不认口头说明。
