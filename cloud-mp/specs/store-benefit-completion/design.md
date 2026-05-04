# 实体门店权益完整收口设计

## 总体策略

保留现有 `commissions` 现金佣金状态机，用新增类型区分资金口径：

- `region_agent` / `region_b3_virtual`: 区域奖励
- `pickup_service_fee` / `pickup_subsidy`: 自提服务费
- `same_level`: 平级现金奖
- `store_annual_goods_reward`: 年度货品奖励台账
- `refund_dev_fee`: 退款开发费台账

现金类奖励继续走 `frozen -> pending_approval -> settled`。货品奖励和开发费是台账口径，不直接进入用户可提现佣金。

## 1. 区域奖励阶梯

统一所有默认策略：

```js
[
  { threshold: 100000, rate: 0.01, label: '10万' },
  { threshold: 300000, rate: 0.02, label: '30万' },
  { threshold: 1000000, rate: 0.03, label: '100万' }
]
```

支付后按累计订单额选取最高可用阶梯。低于 10 万时费率为 0。

## 2. 自提服务费

核销链路已使用门店收款人优先级：

1. `pickup_claimant_id`
2. `pickup_claimant_openid`
3. `claimant_id`
4. 门店有效 `manager`

补充后台修复接口，按已核销订单扫描缺失的 `pickup_service_fee`，复用相同计算规则。

## 3. 年度货品奖励

新增台账集合建议命名：`store_annual_goods_rewards`。

字段：

- `store_id`
- `store_name`
- `claimant_openid`
- `settlement_year`
- `purchase_amount`
- `reward_rate`
- `reward_goods_amount`
- `status`
- `created_at`
- `updated_at`

进货额优先使用门店采购/进货记录；若当前环境没有完整采购表，则先接入 `station_procurement_orders` 和门店本金/采购台账，保留聚合函数入口。

## 4. 平级奖 20%

修改支付后 `ensurePeerBonusCreated`：

- 不再跳过 `bonusLevel === 6`
- 当 `bonusLevel === 6` 时强制现金版，金额为订单实付金额 `20%`
- 状态 `frozen`
- `refund_deadline` 和 `peer_bonus_release_at` 均为 90 天后
- 不生成兑换券

其他等级继续使用现有配置。

## 5. 三个月释放

复用现有 `refund_deadline` 流转：

- `commission-deadline-process` 将到期且无进行中退款的 `frozen` 佣金改为 `pending_approval`
- `distribution.settleMatured` 保持兼容
- 平级奖、门店服务费和年度现金类奖励都用同一字段

## 6. 退款 1.5% 开发费

在退款完成并取消/冻结相关佣金时，生成 `refund_dev_fee` 记录：

- 以退款金额为基数
- 默认比例 `1.5%`
- 与原退款单、订单、用户、可能的奖励记录关联
- 幂等键使用 `refund_id + type=refund_dev_fee`

这条记录用于对账/开票，不进入用户提现余额。

## 7. 后台展示

实体门店收益汇总增加分类：

- `service_fee_rewards`
- `peer_bonus_rewards`
- `annual_goods_rewards`
- `refund_dev_fees`

旧字段 `rewards` 保留，避免前端已有页面断裂。

## 验证

- 单测覆盖 `Lv6` 平级 20% 生成、90 天冻结字段。
- 单测覆盖区域阶梯低于 10 万为 0，达到 30 万为 2%。
- 单测覆盖历史自提服务费修复幂等。
- 单测覆盖退款开发费幂等。

