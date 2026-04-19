# 文档清单

更新日期：2026-04-18

本文件按“是否属于当前项目真相源”整理 `cloud-mp` 内的 Markdown 文档。

## 1. 当前主入口

- `README.md`
- `docs/CLOUD_MP_DEVELOPMENT_GUIDE.md`
- `docs/CLOUDBASE_RELEASE_RUNBOOK.md`
- `升级.md`

## 2. 当前有效项目说明

- `PROJECT_OVERVIEW.md`
- `admin-ui/README.md`
- `admin-ui/快速启动.md`
- `cloudfunctions/payment/README.md`
- `cloudbase-seed/README.md`
- `cloudbase-import/README.md`
- `docs/CLOUDBASE_MIGRATION_PROGRESS.md`
- `docs/CLOUDBASE_MIGRATION_BACKLOG.md`
- `docs/release/README.md`

## 3. 迁移与模型说明

- `CLOUDBASE_TARGET_MODEL.md`
- `MYSQL_TO_CLOUDBASE_MAPPING.md`
- `CLOUD_DB_SCHEMA.md`

说明：

- 这些文档用于解释目标字段模型和迁移关系。
- 它们不是当前页面/接口行为的唯一真相源，真实行为仍以代码为准。

## 4. 审计与运行结果

- `docs/AUDIT_ALL_SUMMARY.md`
- `docs/MINIPROGRAM_ROUTE_TABLE_AUDIT.md`
- `docs/ADMIN_*`
- `docs/*_AUDIT.md`
- `docs/reports/*`
- `docs/release/evidence/*`

说明：

- 这些文件通常是某个时间点的快照、审计结果或运行证据。
- 使用时要注意生成日期，不要把旧快照当成当前事实。

## 5. 阶段性历史资料

- `P2_FIXES_README.md`
- `FINAL_DELIVERY_SUMMARY.md`
- `CODE_REVIEW.md`
- `plan.md`
- `NOTES.md`
- 各类阶段总结、修复报告、历史验收资料

这些文件默认视为历史资料或背景材料，不再作为当前实现依据。

## 6. 非项目业务文档

以下目录下的 Markdown 不属于 `cloud-mp` 业务系统文档：

- `skills/design-md/**`
- `apple/README.md`

它们可以保留，但不应参与项目真相判断。

## 7. 使用原则

1. 需要了解项目当前运行边界，先看主入口文档。
2. 需要排障或审计，再去看快照和专项报告。
3. 需要追迁移历史，再看迁移和历史资料。
4. 不要再用旧阶段完成度报告替代当前项目判断。
