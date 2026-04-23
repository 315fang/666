# CloudBase 集合契约

日期：2026-04-19  
适用范围：`cloud-mp` CloudBase 运行时集合

## 1. 目的

这份契约解决三个问题：

1. 哪些集合是当前正式运行时必须存在的。
2. 哪些集合是流程表、日志表、兼容读取表，而不是“重名主表”。
3. 哪些旧名或残留集合不应再默认自动创建。

详细机器可读版本见：

- [cloudbase-collection-contract.json](/C:/Users/21963/WeChatProjects/zz/cloud-mp/config/cloudbase-collection-contract.json)

## 2. 分层

### 2.1 正式主表

作用：

- 承接用户、商品、订单、配置、内容、钱包、营销主数据。
- 属于默认扫描和默认补建范围。

典型集合：

- `users`
- `products`
- `product_bundles`
- `skus`
- `orders`
- `refunds`
- `configs`
- `admin_singletons`
- `stations`
- `wallet_accounts`

### 2.2 正式流程表

作用：

- 承接申请单、档期、流程状态、库存状态等中间过程。
- 不是主表的别名，也不应直接压扁回主表。

典型集合：

- `limited_sale_slots`
- `limited_sale_items`
- `goods_fund_transfer_applications`
- `directed_invites`
- `station_procurement_orders`
- `station_sku_stocks`
- `deposit_orders`
- `deposit_refunds`
- `coupon_claim_tickets`
- `lottery_claims`
- `upgrade_applications`

### 2.3 正式日志表

作用：

- 记录业务事件、资金流水、审计流水和库存流水。
- 与主表、流程表并存，不应被误判为重复集合。

典型集合：

- `admin_audit_logs`
- `wallet_logs`
- `goods_fund_logs`
- `point_logs`
- `promotion_logs`
- `fund_pool_logs`
- `station_stock_logs`

### 2.4 兼容读取表

作用：

- 当前代码仍有 fallback 读取，但不应继续作为新的主真相源扩散。

典型集合：

- `app_configs`

处理原则：

- 保留读取兼容。
- 新配置优先写 `configs` / `admin_singletons`。

### 2.5 兼容残留表

作用：

- 历史页面或旧能力仍在引用，但不属于当前默认自动补建范围。

典型集合：

- `branch_agent_stations`
- `branch_agent_claims`

处理原则：

- 先报告。
- 再评估是否保留页面与流程。
- 不默认继续扩散到新功能。

## 3. 非重复判定

以下组合虽然名字相近或语义相邻，但不是重复集合：

| 组合 | 判定 |
| --- | --- |
| `limited_sale_slots` + `limited_sale_items` vs `activity_links` | 前者是限时档期与商品售卖状态，后者只是活动入口配置 |
| `goods_fund_transfer_applications` vs `goods_fund_logs` | 前者是申请审核单，后者是实际货款流水 |
| `station_procurement_orders` vs `station_sku_stocks` vs `station_stock_logs` | 分别对应备货单、库存状态、库存流水 |
| `deposit_orders` / `deposit_refunds` / `coupon_claim_tickets` vs `orders` / `refunds` / `user_coupons` | 押金领券链路，不是普通交易链 |
| `promotion_logs` vs `users` | 晋升事件日志，不是用户主资料 |
| `fund_pool_logs` vs `goods_fund_logs` | 基金池入池流水，不是货款收支流水 |

## 4. 旧名治理

以下旧名应视为别名或历史残留，不再作为默认目标集合创建：

| 正式名 | 旧名/别名 | 处理原则 |
| --- | --- | --- |
| `stations` | `pickup_stations` | 统一用 `stations` |
| `admin_audit_logs` | `admin_logs` | 统一用 `admin_audit_logs` |

此外，以下 live-only 集合不纳入当前默认契约：

- `mysql`
- `pickup_verifiers`
- `point_accounts`
- `portal_accounts`
- `user_mass_messages`
- 所有 `*_bak`

## 5. 运行规则

默认集合扫描与补建应按契约分级执行：

1. 默认补建：正式主表、正式流程表、正式日志表、兼容读取表
2. 默认只报告：兼容残留表
3. 默认不处理：旧名别名、live-only 手工集合、`*_bak`

## 6. 当前收口动作

本轮已完成：

1. 增加集合契约 JSON。
2. 扫描代码 / seed / target model / live CloudBase 集合并输出差异。
3. 补建当前运行所缺的 15 个集合壳子。

待继续：

1. 将 [CLOUDBASE_TARGET_MODEL.md](/C:/Users/21963/WeChatProjects/zz/cloud-mp/CLOUDBASE_TARGET_MODEL.md) 与本契约对齐。
2. 按索引清单补齐 `limited_sale_slots`、`limited_sale_items` 等关键索引。
3. 对 `branch_agent_*`、`pickup_stations`、`admin_logs` 做历史残留收口。
