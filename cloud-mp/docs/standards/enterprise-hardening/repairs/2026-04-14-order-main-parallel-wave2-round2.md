# 订单主链 Wave 2 并行深收口（第二轮）

日期：2026-04-14

## 1. 问题描述

在第一轮 `writer / consumer tightening` 之后，订单主链仍有三个高风险点：

1. 支付链存在 `pay_amount = 0` 订单被误判成需要正常支付的风险。
2. 订单 / 退款 reader 和页面消费层仍有多处各自猜 `payment_method`、`status_text`、`refund_target_text`。
3. 退款成功链虽然已经开始 canonical 化，但仍需要先把“processing -> completed”的顺序固定下来，避免过早进入终态。

## 2. 影响范围

影响范围覆盖：

- `cloudfunctions/order/order-contract.js`
- `cloudfunctions/order/order-query.js`
- `cloudfunctions/order/order-lifecycle.js`
- `cloudfunctions/payment/shared/order-payment.js`
- `cloudfunctions/payment/payment-prepay.js`
- `cloudfunctions/payment/payment-callback.js`
- `admin-ui/src/views/orders/index.vue`
- `miniprogram/pages/order/*`

## 3. 根因

根因仍然是兼容层过深：

- 订单正式字段虽已存在，但金额、支付方式、退款渠道的解析逻辑散落在多处
- 前端消费层长期自行回退 `actual_price`、`pay_channel`、本地 `statusText`
- 退款链虽然有正式字段，但补偿步骤和终态落库顺序还不够稳定

## 4. 修复方案

### 4.1 后端 contract / helper 收口

本轮新增并复用统一解析器：

- `cloudfunctions/order/order-contract.js`
  - 新增 `resolveOrderPaymentMethod`
  - 新增 `resolveOrderPayAmount`
  - 新增 `resolveOrderTotalAmount`
  - 新增 `resolveRefundAmount`
  - 新增 `resolveRefundChannel`
- `cloudfunctions/payment/shared/order-payment.js`
  - 新增 payment 侧共享 helper
  - 统一 `buildPaymentWritePatch`
  - 统一 0 元支付 / 货款支付 / 组团单状态推导

这样 payment 和 order 两侧不再各写一套“实付金额 / 支付方式 / post-pay 状态”规则。

### 4.2 支付链收口

- `payment-prepay.js`
  - 统一按 `pay_amount -> actual_price -> total_amount` 解析应付金额
  - 修复 `pay_amount = 0` 时被误送去正常支付的问题
  - 货款支付和 0 元支付都走 shared patch 写入
  - 组团单支付后统一进入 `pending_group`
- `payment-callback.js`
  - 支付成功统一回写 canonical `payment_method`、`pay_amount`
  - 退款成功链先写 `processing`，补偿步骤后再落 `completed`
  - 优惠券恢复或终态落库失败时不再静默吞掉，改为让回调显式失败并可重试
  - 库存、优惠券、买家资产回退增加幂等标记字段，避免重复回调时重复执行

### 4.3 退款链收口

- `order-lifecycle.js`
  - 退款金额上限按 canonical `pay_amount` 校验
  - 货款自动退款增加标记型步骤：
    - `refund_buyer_assets_reversed_at`
    - `refund_coupon_restored_at`
    - `refund_stock_restored_at`
  - 自动退款失败时不再把退款单伪装回 `pending`
  - 失败后保持 `processing/refunding` 并记录错误，便于后续重试和人工处理
- `admin-api/src/app.js`
  - 后台内部退款完成分支改为先做补偿，再落 refund/order 终态
  - 不再先写 `completed/refunded` 再补库存和资产
- `order-query.js`
  - 订单与退款 DTO 优先走 canonical resolvers
  - `actual_price` 输出明确改为由 canonical `pay_amount` 推导

### 4.4 前端消费层收口

- 管理后台订单页
  - 先把接口结果归一成 `display_*` 再渲染
  - 金额优先显示 `display_pay_amount`
  - 状态、支付方式、退款去向优先显示 `display_*`
- 小程序订单相关页
  - 新增 `orderConsumerFields.js`
  - 订单列表、详情、退款申请、退款列表、退款详情统一先做 consumer normalize
  - 页面优先读取：
    - `display_status_text`
    - `display_status_desc`
    - `display_payment_method_text`
    - `display_refund_target_text`
    - `display_pay_amount`

## 5. 兼容策略

- 外部接口路径、云函数 `action`、后台 `/admin/api/*` 路径未改
- `actual_price`、`pay_channel` 仍保留兼容，但已退回到由 canonical 字段推导
- 部分历史数据仍允许从 `actual_price` 回读 `pay_amount`
- 退款成功链尚未抽成单一 reconciler，只是先把状态顺序和失败暴露方式收紧

## 6. 改动模块

本轮改动集中在四块：

- 订单 contract / query
- payment 共享 helper 与 prepay / callback
- 订单退款 lifecycle
- 后台订单页与小程序订单消费层

## 7. 验证命令与结果

已实际执行并通过：

```powershell
node --check cloudfunctions/order/order-contract.js
node --check cloudfunctions/order/order-query.js
node --check cloudfunctions/order/order-lifecycle.js
node --check cloudfunctions/payment/shared/order-payment.js
node --check cloudfunctions/payment/payment-prepay.js
node --check cloudfunctions/payment/payment-callback.js
node --check cloudfunctions/admin-api/src/app.js
node --check miniprogram/pages/order/orderConsumerFields.js
node --check miniprogram/pages/order/list.js
node --check miniprogram/pages/order/detail.js
node --check miniprogram/pages/order/orderDetailData.js
node --check miniprogram/pages/order/refund-apply.js
node --check miniprogram/pages/order/refund-list.js
node --check miniprogram/pages/order/refund-detail.js
npm run audit:order-contract
npm run audit:order-fields
cd admin-ui && npm run build
git diff --check
```

结果：

- 语法检查通过
- 订单合同审计通过
- 订单字段审计通过
- 管理端构建通过
- 仍只有原本就存在的 Vite 动态导入 warning，无新增构建错误

## 8. 回归风险

当前风险仍主要集中在：

- `payment-callback`、`order-lifecycle`、`admin-api` 仍是多套退款补偿实现，还没抽成单一 reconciler
- `payment-refund.js`、`order-interactive.js` 等相邻旧路径仍有旧字段兼容残留
- 小程序这轮只做了静态验证，未做真机联调

## 9. 后续待清债务

- 抽出单一的 refund reconciler
- 继续缩减 `actual_price / pay_channel` 在旧路径中的读取
- 补订单主链和退款主链 smoke 记录
- 准备进入 `Wave 5` 之前的本地强验收
