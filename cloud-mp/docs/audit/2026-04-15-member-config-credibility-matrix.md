# 会员与分支代理配置可信度矩阵

日期：2026-04-15

## 真生效

| 配置键 | 字段 | 运行时消费点 | 说明 |
| --- | --- | --- | --- |
| `member_level_config` | `name` / `description` / `discount_rate` | `cloudfunctions/user/index.js` / `cloudfunctions/payment/payment-callback.js` / 下单定价 | 等级名称、说明、折扣真正影响用户升级后的展示和折扣率。 |
| `member_upgrade_rule_config` | `c1_min_purchase` / `c2_referee_count` / `c2_min_sales` / `b1_referee_count` / `b1_recharge` / `b2_referee_count` / `b2_recharge` / `b3_referee_b2_count` / `b3_referee_b1_count` / `b3_recharge` / `effective_order_days` | `cloudfunctions/user/index.js` / `cloudfunctions/payment/payment-callback.js` | 升级门槛统一按有效订单和充值规则判断。 |
| `growth_rule_config` | `purchase` | `cloudfunctions/payment/payment-callback.js` | 控制支付后成长值发放。 |
| `growth_tier_config` | `min` / `discount` / `name` / `desc` | `cloudfunctions/user/index.js` / `miniprogram/pages/user/membership-center.js` | 控制成长值页展示和成长档位文案。 |
| `point_rule_config` | `deduction` | `cloudfunctions/order/order-create.js` / `miniprogram/pages/order/orderConfirmPricing.js` / `miniprogram/utils/couponPricing.js` | 控制积分抵扣单价和最高抵扣比例。 |
| `point_rule_config` | `purchase_multiplier_by_role` | `cloudfunctions/payment/payment-callback.js` / `cloudfunctions/user/user-wallet.js` | 控制复购积分发放与积分任务页展示。 |
| `point_rule_config` | `checkin` / `checkin_streak` | `cloudfunctions/user/user-wallet.js` | 控制签到积分与任务页展示。 |
| `point_rule_config` | `review` | `cloudfunctions/order/order-lifecycle.js` / `cloudfunctions/user/user-wallet.js` | 控制文字评价积分，晒单默认沿用该值。 |
| `point_rule_config` | `invite_success` | `cloudfunctions/login/index.js` / `cloudfunctions/user/user-wallet.js` | 控制邀请新用户注册后的积分奖励与任务页展示。 |
| `branch-agent-policy` | `pickup_station_subsidy_enabled` / `pickup_station_reward_rate` / `pickup_station_subsidy_amount` | `cloudfunctions/order/order-interactive.js` / `cloudfunctions/admin-api/src/app.js` | 自提点奖励统一按 2.5% 或备用固定额计算。 |
| `branch-agent-policy` | `region_reward_tiers` | `cloudfunctions/admin-api/src/app.js` | 区域奖励按累计订单金额阶梯计算。 |

## 兼容保留但不再编辑

| 配置键 | 字段 | 当前状态 |
| --- | --- | --- |
| `agent_system_upgrade_rules` | 全部 | 作为历史兼容回退；新链路优先读取 `member_upgrade_rule_config`。 |
| `commerce_policy_config` | 全部 | 运行时保留历史读取，但会员管理页不再编辑。 |
| `purchase_level_config` | 全部 | 数据层兼容保留，会员管理页不再编辑。 |
| `point_level_config` | 全部 | 积分中心等级特权仍保留。 |
| `branch_agent_stations` | `commission_rate` / `pickup_commission_tier` | 旧字段仍存量存在，但新页面和新计算不再依赖。 |

## 已移除或不再暴露

| 原页面项 | 处理结果 | 原因 |
| --- | --- | --- |
| 会员等级页 `price_tier` | 不再展示 | 未进入当前真实定价主链。 |
| 会员等级页 `commission_type` | 不再展示 | 容易误导为层级配置，当前不作为真实规则入口。 |
| 商业策略页 `global_discount` / `member_level_extra_discount` / `platform_top_agent` 等 | 下线编辑入口 | 当前未进入真实订单主链。 |
| 积分页 `share` / `group_start` / `group_success` | 不再展示 | PDF 未给数值，且当前未接入真实业务触发。 |
| 代理体系页 | 整页下线 | 已并入会员与分支代理配置，不再保留独立入口。 |
