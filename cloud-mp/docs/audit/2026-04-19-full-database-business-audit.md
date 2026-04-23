# 全量数据库与业务代码审计报告

日期：2026-04-19  
范围：`cloud-mp` CloudBase 体系、`../backend` MySQL/Express 旧后端、真实 CloudBase 环境 `cloud1-9gywyqe49638e46f`

## 1. 审计结论

当前项目已经不是单纯的“代码脏”，而是进入了**真相源分裂**阶段：

1. 当前仓库同时存在三套真实数据来源：
   - 本地 `cloudfunctions/admin-api/.runtime/overrides` 文件覆盖数据
   - 本地 `cloudbase-seed/` 与 `cloudbase-import/` 基线数据
   - 线上 CloudBase live 集合
2. `cloud-mp` CloudBase 路径和 `../backend` MySQL 路径仍并行保留了价格、升级、基金池、分红、钱包、退款等核心能力，属于**双轨业务实现**。
3. 真实线上环境中，基金池和分红都已启用，但：
   - `fund_pool_logs = 0`
   - `dividend_executions = 0`
   - 分红规则 `ranks` 为空，当前是“开关开启但不会产出结果”的状态。
4. live 数据已经出现明显的**结构漂移**和**遗留污染**：
   - 61 个 `_bak` 备份集合
   - `admin_logs`、`mysql`、`pickup_verifiers` 等历史/旁路集合仍在 live 中存在
   - `wallet_logs` 当前同时混写 `type` 与 `change_type`
   - `withdrawals`、`users`、`commissions` 等集合已出现新旧字段/时间格式并存
5. 工程可信度基线再次下降：
   - `backend npm test` 当前失败，`GroupCoreService` 导出与测试契约不一致
   - `admin-ui npm run build` 可通过，但仍存在 chunk 组织与动态导入告警

一句话判断：

- CloudBase 运行链路：可运行，但有明显配置漂移、账务闭环缺口和历史集合污染
- 旧后端：不是死代码，仍保留完整的财务/升级/分红实现
- 当前最危险的问题：**数据库真相源混用、财务日志口径不统一、角色体系双轨冲突**

## 2. 取证方式

本轮使用了以下只读取证：

- 本地仓库静态扫描：`rg`、配置/模型/服务/路由抽查
- 本地数据源核查：`filesystem` store、`.runtime/overrides`、`cloudbase-seed`、`cloudbase-import`
- 线上 CloudBase 只读调用：`mcporter cloudbase.*`
- 本地工程基线：
  - `backend npm test`
  - `admin-ui npm run build`

配套证据文件：

- [docs/CLOUDBASE_ENV_RUNTIME_STATUS.json](/C:/Users/21963/WeChatProjects/zz/cloud-mp/docs/CLOUDBASE_ENV_RUNTIME_STATUS.json)
- [docs/FINANCE_SMOKE_AUDIT.json](/C:/Users/21963/WeChatProjects/zz/cloud-mp/docs/FINANCE_SMOKE_AUDIT.json)
- [docs/audit/2026-04-19-cloudbase-collection-matrix.json](/C:/Users/21963/WeChatProjects/zz/cloud-mp/docs/audit/2026-04-19-cloudbase-collection-matrix.json)
- [docs/audit/2026-04-19-cloudbase-live-extra-collections.json](/C:/Users/21963/WeChatProjects/zz/cloud-mp/docs/audit/2026-04-19-cloudbase-live-extra-collections.json)
- [docs/audit/2026-04-19-live-finance-samples.json](/C:/Users/21963/WeChatProjects/zz/cloud-mp/docs/audit/2026-04-19-live-finance-samples.json)

## 3. 真相源与运行拓扑

| 模块 | 当前读源 | 当前写源 | 备注 |
| --- | --- | --- | --- |
| 本地 `cloudfunctions/admin-api` | `filesystem`，优先 `.runtime/overrides`，再退 `cloudbase-seed/mysql jsonl` | `.runtime/overrides` | 本地默认不是 live CloudBase |
| 线上 `admin-api` 云函数 | CloudBase live 集合 | CloudBase live 集合 | 真实管理后台入口 |
| 小程序云函数链路 | CloudBase live 集合 | CloudBase live 集合 | `login/user/order/payment/distribution` 直接落 live |
| `../backend` 旧后端 | MySQL + Sequelize | MySQL + 外部支付/日志 | 仍保留完整业务实现，不是空壳 |
| 文档/seed/import | 静态基线 | 静态基线 | 不能直接等同于 live 运行状态 |

关键事实：

- 本地 `admin-api` 默认数据源是 `filesystem`，不是 CloudBase，见 [cloudfunctions/admin-api/src/config.js](/C:/Users/21963/WeChatProjects/zz/cloud-mp/cloudfunctions/admin-api/src/config.js:10)
- `filesystem` provider 会优先读取 `.runtime/overrides`，见 [cloudfunctions/admin-api/src/store/providers/filesystem.js](/C:/Users/21963/WeChatProjects/zz/cloud-mp/cloudfunctions/admin-api/src/store/providers/filesystem.js:51)
- 当前本地 `configs` override 只有 1 条，而 live `configs` 有 22 条；本地调试极易出现“配置假空”

## 4. 集合/表总体状态

### 4.1 CloudBase 合同集合结论

完整计数见 [2026-04-19-cloudbase-collection-matrix.json](/C:/Users/21963/WeChatProjects/zz/cloud-mp/docs/audit/2026-04-19-cloudbase-collection-matrix.json)。

当前可分为四类：

1. **活跃且非空**
   - `users`, `orders`, `refunds`, `commissions`, `wallet_logs`, `goods_fund_logs`, `products`, `skus`, `categories`
   - `admins`, `admin_roles`, `admin_singletons`, `configs`, `app_configs`
   - `group_*`, `slash_*`, `lottery_*`, `stations`, `station_staff`, `wallet_accounts`, `wallet_recharge_configs`
2. **空但当前可解释**
   - `agent_exit_applications`, `deposit_orders`, `deposit_refunds`, `coupon_claim_tickets`, `goods_fund_transfer_applications`, `station_procurement_orders`, `station_sku_stocks`, `station_stock_logs`, `upgrade_applications`
   - 这些更多像“未触发流程”或“功能未真实上线”
3. **空且可疑**
   - `fund_pool_logs`
   - `dividend_executions`
   - `promotion_logs`
   - `activity_links`, `activities`, `activity_bubbles`, `brand_news`, `contents`
   - 其中前两者已经在 live 配置里启用，应优先审视是否为“开了但无触发/无落库”
4. **历史/兼容/污染**
   - 61 个 `_bak` 备份集合
   - `admin_logs`, `mysql`, `pickup_verifiers`, `branch_agent_claims`, `branch_agent_stations`

### 4.2 旧后端 MySQL 结论

旧后端仍有完整的 MySQL 业务模型和服务，不应被误判为“历史归档代码”：

- 用户/订单/商品/SKU/退款/提现/佣金/钱包：完整存在
- 基金池、分红、N 路径：完整存在
- 价格服务、佣金服务、升级服务：完整存在

证据：

- MySQL 用户角色 0–7，含 `N_MEMBER=6`、`N_LEADER=7`，见 [../backend/config/constants.js](/C:/Users/21963/WeChatProjects/zz/backend/config/constants.js:19)
- MySQL `User` 模型明确允许 `role_level=7`，见 [../backend/models/User.js](/C:/Users/21963/WeChatProjects/zz/backend/models/User.js:36)
- MySQL 分红服务仍完整存在，见 [../backend/services/DividendService.js](/C:/Users/21963/WeChatProjects/zz/backend/services/DividendService.js:13)
- MySQL 货款钱包与退款服务仍完整存在，见 [../backend/services/AgentWalletService.js](/C:/Users/21963/WeChatProjects/zz/backend/services/AgentWalletService.js:4)

结论：

- `cloud-mp` 和 `../backend` 当前不是“前后替换完成”，而是**迁移未收口的双实现**。

## 5. 最高优先级问题

### P0. 角色体系双轨冲突

现象：

- CloudBase admin-ui、小程序、CloudBase 云函数大多只支持 `role_level 0–6`
- 旧后端 MySQL 仍支持 `role_level 6/7` 的 N 路径
- live `users` 中已经存在 `role_level = 7` 用户

证据：

- CloudBase admin-api 写接口限制 `role_level <= 6`，见 [cloudfunctions/admin-api/src/app.js](/C:/Users/21963/WeChatProjects/zz/cloud-mp/cloudfunctions/admin-api/src/app.js:6078)
- 小程序/管理后台角色映射只定义到 6，见 [miniprogram/config/constants.js](/C:/Users/21963/WeChatProjects/zz/cloud-mp/miniprogram/config/constants.js:14) 和 [admin-ui/src/views/users/index.vue](/C:/Users/21963/WeChatProjects/zz/cloud-mp/admin-ui/src/views/users/index.vue:683)
- 旧后端角色定义到 7，见 [../backend/config/constants.js](/C:/Users/21963/WeChatProjects/zz/backend/config/constants.js:19)

影响：

- live 中的 `role_level=7` 用户在 CloudBase 路径里无法被正确展示、编辑和解释
- 升级、权限、价格、团队统计都可能出现错口径

### P0. 本地与线上真相源严重分裂

现象：

- 本地 `admin-api` 默认读 `.runtime/overrides`
- live 环境读 CloudBase 集合
- 本地 `configs` override 仅 1 条，live `configs` 为 22 条

影响：

- 本地“看起来没开、没数据、为空”的结论经常是假的
- 审计、联调、复现线上问题时极易误判

### P1. 分红在 CloudBase 路径中已启用，但当前是“开启后无产出”

现象：

- live `configs` 中：
  - `agent_system_dividend-rules.enabled = true`
  - `source_pct = 1`
  - `b_team_award.enabled = true`
  - `b1_personal_award.enabled = true`
  - 但两个 `ranks` 都是空数组
- live `dividend_executions = 0`
- live `commissions` 中无 `year_end_dividend`

代码原因：

- CloudBase `buildDividendPreviewRows()` 只有在 `ranks` 非空时才会推送候选人，见 [cloudfunctions/admin-api/src/admin-marketing.js](/C:/Users/21963/WeChatProjects/zz/cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js:400)
- CloudBase 执行分红时直接吃管理员输入金额，不校验 `source_pct` 和池余额，见 [cloudfunctions/admin-api/src/admin-marketing.js](/C:/Users/21963/WeChatProjects/zz/cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js:2185)
- 旧后端 MySQL 则有真实 `dividend_pool_balance` 计提与扣减，见 [../backend/services/OrderPaymentService.js](/C:/Users/21963/WeChatProjects/zz/backend/services/OrderPaymentService.js:104) 和 [../backend/services/DividendService.js](/C:/Users/21963/WeChatProjects/zz/backend/services/DividendService.js:208)

结论：

- CloudBase 分红当前不是完整“分红池”系统，而是一个人工输入金额的发放器
- 在当前 live 配置下，它还是**启用了但实际不会发出任何结果**

### P1. 基金池已启用，但没有任何 live 入池流水

现象：

- live `agent_system_fund-pool.enabled = true`
- live `fund_pool_logs = 0`
- live `upgrade_applications = 0`
- live 也没有任何升级相关 `wallet_logs/goods_fund_logs/orders`

代码原因：

- 基金池仅在升级触发时写流水：
  - 支付升级： [cloudfunctions/payment/payment-callback.js](/C:/Users/21963/WeChatProjects/zz/cloud-mp/cloudfunctions/payment/payment-callback.js:1507)
  - 后台手动升级： [cloudfunctions/admin-api/src/app.js](/C:/Users/21963/WeChatProjects/zz/cloud-mp/cloudfunctions/admin-api/src/app.js:6097)
- 但 `recordFundPoolEntry()` 和 `recordAdminFundPoolEntry()` 都没有显式拦截 `enabled=false` 的情况，见 [cloudfunctions/payment/payment-callback.js](/C:/Users/21963/WeChatProjects/zz/cloud-mp/cloudfunctions/payment/payment-callback.js:1397) 和 [cloudfunctions/admin-api/src/app.js](/C:/Users/21963/WeChatProjects/zz/cloud-mp/cloudfunctions/admin-api/src/app.js:4392)

结论：

- 当前 live 零流水的最直接解释是：**启用以后根本还没发生过升级触发事件**
- 同时存在一个实现问题：开关未真正接入写入逻辑

### P1. `wallet_logs` 当前仍在混写 `type` 与 `change_type`

现象：

- live `wallet_logs` 共 37 条，其中 9 条没有 `change_type`
- 这些记录实际写了 `type=refund/refund_reopen_reversal/withdraw/...`

代码原因：

- 业务写入路径不统一：
  - 有些地方写 `change_type`，见 [cloudfunctions/admin-api/src/app.js](/C:/Users/21963/WeChatProjects/zz/cloud-mp/cloudfunctions/admin-api/src/app.js:7476)
  - 有些地方写 `type`，见 [cloudfunctions/admin-api/src/app.js](/C:/Users/21963/WeChatProjects/zz/cloud-mp/cloudfunctions/admin-api/src/app.js:7654)
- `appendWalletLogEntry()` 只是盲写，不做字段归一化，见 [cloudfunctions/admin-api/src/finance-firewall.js](/C:/Users/21963/WeChatProjects/zz/cloud-mp/cloudfunctions/admin-api/src/finance-firewall.js:32)

影响：

- 财务统计、日志过滤、对账脚本会出现漏算和误判

### P1. 财务退款链路存在缺日志问题

现象：

- 本轮运行 [scripts/audit-strategic-finance-firewall.js](/C:/Users/21963/WeChatProjects/zz/cloud-mp/scripts/audit-strategic-finance-firewall.js:1) 后，发现 8 笔内部货款退款缺少对应日志
- 旧版已提交报告写的是 0，说明历史审计结论已经过期

结论：

- 当前财务闭环不能再依赖已有报告，必须以实时审计结果为准

### P1. live 配置键名混用，已出现重复 key 族

现象：

- live `configs` 同时存在：
  - `agent_system_peer_bonus`
  - `agent_system_peer-bonus`

代码原因：

- CloudBase 路径兼容读取横杠和下划线两种 key，见 [cloudfunctions/admin-api/src/app.js](/C:/Users/21963/WeChatProjects/zz/cloud-mp/cloudfunctions/admin-api/src/app.js:9145)
- 旧后端 MySQL 路径主要使用下划线 key，见 [../backend/routes/admin/controllers/adminAgentSystemController.js](/C:/Users/21963/WeChatProjects/zz/backend/routes/admin/controllers/adminAgentSystemController.js:9)

影响：

- 配置迁移、覆盖、读取顺序会继续产生歧义

### P1. live 数据结构已出现新旧 schema 混写

表现：

- `withdrawals` 同时存在 `method/withdrawal_no` 与 `type/withdraw_no`
- `users`、`commissions`、`withdrawals` 的时间字段同时存在 ISO 字符串和 `{"$date": ...}` 两种形态

影响：

- 前端展示层、脚本审计、导入导出、强一致读取都要做兼容判断
- 数据契约不再是单一真相源

## 6. 次级问题

### P2. 旧后端与 CloudBase 同域重复实现过多

重复域包括：

- 分红
- 基金池
- 货款钱包
- 升级路径
- 价格计算
- 佣金计算

结论：

- 当前不是“兼容层”，而是**两套会继续分叉的业务内核**

### P2. 审计工具自身存在误报

`check-cloudbase-runtime-status.js` 用 `listCollections limit=100`，而 live 共有 138 个集合，导致它把 `users/skus/withdrawals` 错判为缺失，见 [scripts/check-cloudbase-runtime-status.js](/C:/Users/21963/WeChatProjects/zz/cloud-mp/scripts/check-cloudbase-runtime-status.js:232)。

### P2. 价格逻辑仍然多处维护

- 小程序前端：`miniprogram/utils/dataFormatter.js`
- CloudBase 商品接口：`backend/controllers/productController.js` 已迁移逻辑样式在旧后端保留
- 旧后端：`../backend/services/PricingService.js`

虽然当前小程序价格入口已做过收口，但整个仓库仍未实现真正单核。

### P3. 工程基线

- `backend npm test` 当前失败：
  - `GroupCoreService.handleOrderPaid` 缺失
  - `GroupCoreService.ensureGroupOrderReadyForFulfillment` 缺失
- `admin-ui npm run build` 当前成功，但仍有动态导入与 chunk 组织告警

## 7. 集合分类结论

完整矩阵见 [2026-04-19-cloudbase-collection-matrix.json](/C:/Users/21963/WeChatProjects/zz/cloud-mp/docs/audit/2026-04-19-cloudbase-collection-matrix.json)。

本轮明确结论如下：

- **活跃主集合**：`users`, `orders`, `refunds`, `commissions`, `wallet_logs`, `goods_fund_logs`, `products`, `skus`, `categories`, `admins`, `admin_roles`, `configs`, `admin_singletons`
- **活跃流程集合**：`group_orders`, `group_members`, `directed_invites`, `limited_sale_*`, `station_staff`, `wallet_accounts`, `wallet_recharge_orders`
- **空但当前可解释**：`agent_exit_applications`, `deposit_orders`, `deposit_refunds`, `goods_fund_transfer_applications`, `upgrade_applications`, `station_*库存/备货*`
- **空且需要重点复核**：`fund_pool_logs`, `dividend_executions`, `promotion_logs`
- **历史遗留/污染**：61 个 `_bak` 集合，及 `admin_logs`, `mysql`, `pickup_verifiers`, `branch_agent_claims`, `branch_agent_stations`

## 8. 建议优先级

### 立即处理

1. 统一角色体系，决定是否继续支持 N 路径 6/7
2. 修 CloudBase 分红，使其从“开关开启但无产出”变成真正可执行功能
3. 统一 `wallet_logs` 字段契约，禁止继续混写 `type/change_type`
4. 核查并补齐 8 笔内部货款退款缺日志问题
5. 收口本地/线上数据源说明，避免 `.runtime/overrides` 继续误导排障

### 第二优先

1. 清理配置 key 横杠/下划线双写
2. 处理 live `_bak` 集合与历史 alias
3. 明确基金池开关是否真正生效，并决定是否补历史入池流水
4. 修复 `backend` 测试回归

## 9. 最终判断

当前仓库最严重的问题不是“某个页面没数据”，而是：

- 真相源分裂
- 财务账务契约不统一
- 角色体系双轨
- 旧后端与 CloudBase 同域并存

这已经足够构成一次需要分阶段收口的系统性问题，而不是单点 bug。
