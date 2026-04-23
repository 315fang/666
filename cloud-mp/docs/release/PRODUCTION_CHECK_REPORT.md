# Production Gap Check

Generated at: 2026-04-21T14:28:51.269Z

Payment mode: formal
Payment formal configured: YES
Payment missing formal keys: none

Daily backup evidence: FAILED
Backup verify evidence: FAILED
Preprod evidence: FOUND
Rollback drill evidence: FOUND

P0 blockers: 6
Warnings: 1

## Blockers
1. 当日备份未成功：failure
2. 最新备份超过 36 小时，不能视为日备份有效
3. 备份校验未通过：skipped
4. 预发证据未通过的主链包：backend_pack, miniprogram_pack, finance_pack
5. 真机验证未通过或未记录
6. 回滚演练未通过：PENDING

## Warnings
1. MySQL 当前按废弃遗留资产处理，不纳入日常生产运行门禁。

