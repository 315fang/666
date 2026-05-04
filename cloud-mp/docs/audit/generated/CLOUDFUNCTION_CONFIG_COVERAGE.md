# cloud-mp 云函数部署配置覆盖审计

生成时间：2026-05-04T04:16:12.964Z
云函数总数：13
关键缺口：4（无 mem/timeout 真相源）
配置冲突：0
cloudbaserc 孤儿条目：0

## 配置覆盖矩阵

| 云函数 | cloudbaserc mem/timeout | config.json mem/timeout | package.json mem/timeout | 问题 |
|---|---|---|---|---|
| `admin-api` | — | 1024 / 60 | 1024 / 60 | ✓ |
| `cart` | — | — | — | ❌ 无 mem 源 ; ❌ 无 timeout 源 |
| `commission-deadline-process` | 256 / 30 | — | 256 / 30 | ✓ |
| `config` | — | — | 512 / 30 | ✓ |
| `distribution` | — | - / - | 256 / 20 | ✓ |
| `login` | — | — | — | ❌ 无 mem 源 ; ❌ 无 timeout 源 |
| `order` | — | — | 1024 / 60 | ✓ |
| `order-auto-confirm` | 256 / 30 | — | 256 / 30 | ✓ |
| `order-timeout-cancel` | 256 / 30 | — | 256 / 30 | ✓ |
| `payment` | — | — | 1024 / 60 | ✓ |
| `products` | — | - / - | — | ❌ 无 mem 源 ; ❌ 无 timeout 源 |
| `user` | — | — | — | ❌ 无 mem 源 ; ❌ 无 timeout 源 |
| `visitor-account-cleanup` | 256 / 30 | — | 256 / 30 | ✓ |

## 治理建议

1. 对「关键缺口」云函数，从 CloudBase 控制台获取**当前线上 memorySize / timeout 实际值**，
   写入对应 `cloudfunctions/<name>/package.json` 的 `cloudfunction-config` 字段。
   切忌凭印象写默认值——若仓库值低于线上值，下次部署会**降级**性能。
2. 对「配置冲突」云函数，确认哪一处是真相源（一般以 cloudbaserc 为最高优先级，
   因为 CLI 部署 `--all` 时会覆盖各 mirror）。把不一致来源对齐。
3. 对「孤儿条目」要么补回云函数目录，要么从 cloudbaserc 删除。

详见：`cloud-mp/docs/audit/2026-05-03-comprehensive-code-review.md` §P1-4。
