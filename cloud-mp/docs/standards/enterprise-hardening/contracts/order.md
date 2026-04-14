# 订单 / 支付 / 退款契约

日期：2026-04-14

## 1. 范围

覆盖以下链路：

- 下单
- 支付发起
- 支付回调
- 订单查询
- 退款申请
- 退款取消 / 完成
- 发货与物流回填
- 后台订单 / 退款管理

当前代码真相主要来自：

- `cloudfunctions/order/order-contract.js`
- `cloudfunctions/admin-api/src/order-contract.js`
- `cloudfunctions/order/order-query.js`
- `cloudfunctions/order/order-lifecycle.js`
- `docs/audit/2026-04-13-order-main-field-truth.md`
- `docs/ORDER_MAIN_CONTRACT_AUDIT.md`

## 2. 正式字段

### 2.1 OrderDTO

- `id`
- `openid`
- `order_no`
- `status`
- `status_group`
- `status_text`
- `status_desc`
- `total_amount`
- `pay_amount`
- `payment_method`
- `payment_method_text`
- `delivery_type`
- `created_at`
- `paid_at`
- `shipped_at`
- `completed_at`
- `items`
- `buyer`
- `address`
- `pickup_station`

### 2.2 RefundDTO

- `id`
- `order_id`
- `order_no`
- `openid`
- `amount`
- `payment_method`
- `refund_channel`
- `refund_target_text`
- `status`
- `status_text`
- `status_desc`
- `reason`
- `return_company`
- `return_tracking_no`
- `created_at`
- `processing_at`
- `completed_at`

## 3. 只读兼容字段

以下字段允许在读取历史数据时兼容，但不能再作为 writer 主字段：

- `actual_price`
- `pay_channel`
- `pay_type`
- `payment_channel`
- `refund_amount`
- `refund_method`
- `refund_target`
- `refund_to`
- `return_shipping.company`
- `return_shipping.tracking_no`
- `buyer_id`
- `user_id`

## 4. 写入规则

- 订单金额正式源为 `total_amount` 和 `pay_amount`
- `actual_price` 只能由 `pay_amount` 推导
- 支付方式正式源为 `payment_method`
- 退款渠道正式源为 `refund_channel`
- 退款去向正式源为 `refund_target_text`
- 退货物流正式源为顶层 `return_company`、`return_tracking_no`

## 5. 页面消费规则

页面和后台 consumer 优先消费：

- `status_text`
- `status_desc`
- `payment_method_text`
- `refund_target_text`

不得在页面本地重新发明状态组、支付文案、退款去向文案。

## 6. 当前未清债务

- 深层订单查询仍存在历史 ID 和金额兼容读取
- 支付回调的跨域副作用尚未完全从大入口抽离
- 后台与小程序还有局部页面存在旧字段 fallback

## 7. 验证

必须通过：

- `npm run audit:order-contract`
- `npm run audit:order-fields`
- 相关文件 `node --check`
- `cd admin-ui && npm run build`

涉及主链改动时，还应补充：

- 下单 smoke
- 微信支付 smoke
- 货款支付 smoke
- 退款申请 / 取消 / 完成 smoke
- 发货与物流回填 smoke
