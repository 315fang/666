# 实体门店权益完整收口需求

## 背景

业务图确认后，`Lv6 线下实体门店` 的权益不再只是 `Lv4` 普通权益别名加自提服务费。除准入条件外，系统需要覆盖实体门店的完整收益：

- 区域订单奖励按门店收货地覆盖区域累计金额递增。
- 自提订单核销后产生 2.5% 自提服务费。
- 上一年度进货量产生 5% 货品奖励。
- 平级奖为一次性奖励 20% 现金。
- 平级奖等公司奖励需三个月犹豫期后发放。
- 退款场景按 1.5% 开发费口径处理。

## 范围

- 支付后权益生成：`cloudfunctions/payment/payment-callback.js`
- 自提核销补贴：`cloudfunctions/order/order-interactive.js`
- 退款与佣金回滚：`cloudfunctions/order/order-lifecycle.js`
- 佣金到期流转：`cloudfunctions/commission-deadline-process/index.js`、`cloudfunctions/distribution/index.js`
- 后台策略与收益汇总：`cloudfunctions/admin-api/src/app.js`、`cloudfunctions/admin-api/src/admin-branch-agent-earnings.js`
- 必要的历史修复入口与测试

## 非目标

- 不实现实体门店准入资质自动审核。
- 不自动判定门店面积、商场场地证明或首单 30000 元准入。
- 不直接做微信企业付款；本轮仍以现有佣金审核/发放链路为准。

## 用户故事

### Story 1

作为运营后台管理员，我希望实体门店区域奖励按 10 万、30 万、100 万阶梯递增，这样收益概览与业务规则一致。

### Story 2

作为门店店长，我希望本店自提订单核销后自动获得 2.5% 服务费，这样门店服务收益不会漏记。

### Story 3

作为财务人员，我希望上一年度进货量按 5% 形成货品奖励额度，这样年度权益可以和现金佣金分账处理。

### Story 4

作为实体门店上级，我希望下级成为同级实体门店时获得一次性 20% 现金平级奖，且三个月后再进入审核发放。

### Story 5

作为财务人员，我希望退款时取消或冲回相关实体门店奖励，并按 1.5% 开发费留下独立记录，便于后续开票和对账。

## 验收标准

### AC1 区域奖励阶梯

When 系统计算实体门店区域奖励, the system shall 使用 `100000 -> 1%`、`300000 -> 2%`、`1000000 -> 3%` 的阶梯配置。

### AC2 自提服务费

When 自提订单完成核销, the system shall 为门店收款人创建或复用 `pickup_service_fee` 佣金，金额为订单实付金额的 `2.5%`。

### AC3 历史自提服务费修复

When 管理员对已核销自提订单运行修复, the system shall 为缺失服务费的订单补建 `pickup_service_fee`，并保持重复运行幂等。

### AC4 年度货品奖励

When 系统结算指定年度的实体门店进货奖励, the system shall 按上一年度门店进货额的 `5%` 生成货品奖励台账，不计入现金佣金余额。

### AC5 平级奖 20%

When 用户升级或被认定为 `Lv6` 且其有效上级也是 `Lv6`, the system shall 创建 `same_level` 佣金，金额为本次订单实付金额的 `20%`。

### AC6 三个月犹豫期

When 系统创建实体门店平级奖或其他公司奖励, the system shall 将奖励状态设为 `frozen`，并将 `refund_deadline` / `peer_bonus_release_at` 设置为创建后 90 天。

### AC7 到期发放流转

When 奖励超过三个月且无进行中退款, the system shall 将奖励从 `frozen` 流转为 `pending_approval`，等待后台审核发放。

### AC8 退款开发费

When 关联订单发生退款并取消实体门店奖励, the system shall 记录 `refund_dev_fee` 台账，金额为退款金额的 `1.5%`。

### AC9 后台可见

When 管理员查看实体门店收益, the system shall 分别展示区域奖励、自提服务费、年度货品奖、平级奖和退款开发费。

