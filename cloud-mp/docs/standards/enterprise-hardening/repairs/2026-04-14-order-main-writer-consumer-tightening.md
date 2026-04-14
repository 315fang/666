# 订单主链 Writer / Consumer 收口（第一轮）

日期：2026-04-14

## 1. 问题描述

订单主链虽然已经有 canonical contract 骨架，但在 writer 和消费层仍存在两类残留问题：

1. 支付和改价链路仍把 `actual_price`、`pay_channel` 之类旧字段当主写入或主判定依据。
2. 后台订单页和小程序订单页仍有几处把 `actual_price` 或本地支付判断当作主展示逻辑。

这会导致正式字段已经存在，但“真正驱动系统行为”的仍是旧字段和本地 fallback。

## 2. 影响范围

影响范围覆盖：

- `cloudfunctions/order/order-create.js`
- `cloudfunctions/order/order-lifecycle.js`
- `cloudfunctions/payment/payment-prepay.js`
- `cloudfunctions/payment/payment-callback.js`
- `cloudfunctions/admin-api/src/app.js`
- `admin-ui/src/views/orders/index.vue`
- `miniprogram/pages/order/detail.wxml`
- `miniprogram/pages/order/refund-apply.js`
- `miniprogram/pages/order/refund-apply.wxml`

## 3. 根因

根因集中在三点：

1. 历史 writer 逻辑先写旧字段，再由 reader 侧兜底兼容。
2. 改价和支付成功回写时，没有把 `pay_amount` 作为唯一正式金额源固定下来。
3. 页面消费层虽然已经能拿到 `payment_method_text`、`refund_target_text` 等正式字段，但仍保留旧金额和旧支付字段的主逻辑分支。

## 4. 修复方案

### 4.1 writer 收口

本轮把支付相关 writer 调整为“先写正式字段，再补兼容别名”：

- `payment-prepay.js`
  - 新增内部 `buildPaymentWritePatch`
  - 货款支付、零元支付、支付回退统一先写 `payment_method`、`pay_amount`
  - `actual_price` 只作为由 `pay_amount` 推导出的兼容别名回写
- `payment-callback.js`
  - 支付成功回调现在回写 `payment_method: 'wechat'`
  - 同步补齐 `pay_amount` 与 `actual_price`
  - 订单金额计算优先以 `pay_amount` 为正式源
- `order-create.js`
  - 待付款订单创建时补齐 `payment_method`、`pay_channel` 初始字段
- `admin-api/src/app.js`
  - 改价接口改成优先接收 `pay_amount`
  - 持久化时同时写入 `pay_amount` 和兼容别名 `actual_price`

### 4.2 consumer 收口

- 后台订单页：
  - 订单列表、详情、改价弹窗优先显示 `pay_amount`
  - 支付方式明细优先只读 `payment_method`
  - 改价按钮兼容 `pending` 和 `pending_payment`
- 小程序订单详情页：
  - 实付金额优先显示 `pay_amount`
  - 支付方式标签优先按 `payment_method` 和 `payment_method_text` 展示
  - 不再依赖 `pay_channel === 'free'` 作为主分支判断
- 小程序退款申请页：
  - 退款上限优先取 `pay_amount`
  - 提交参数优先只传 `amount`

### 4.3 reader 兼容保持

本轮没有直接删除所有旧字段读取。  
仍保留以下兼容读取，以保证历史数据可读：

- `actual_price`
- `pay_channel`
- `pay_type`
- `payment_channel`
- `refund_amount`

但它们不再是本轮新写入或新展示逻辑的主来源。

## 5. 兼容策略

- 外部 URL、云函数 `action`、后台 `/admin/api/*` 路径未改
- 订单和支付 writer 仍保留 `actual_price`、`pay_channel` 作为平滑兼容字段
- 小程序退款申请仍接受后端对 `refund_amount` 的兼容读取
- 本轮没有删除历史 reader fallback，只是调整正式优先级

## 6. 改动模块

本轮改动集中在：

- 支付 writer
- 订单 refund lifecycle
- 后台订单展示和改价
- 小程序订单详情和退款申请

## 7. 验证命令与结果

已实际执行并通过：

```powershell
node --check cloudfunctions/payment/payment-prepay.js
node --check cloudfunctions/payment/payment-callback.js
node --check cloudfunctions/order/order-lifecycle.js
node --check cloudfunctions/order/order-create.js
node --check cloudfunctions/admin-api/src/app.js
node --check miniprogram/pages/order/refund-apply.js
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
- 仍存在原本就有的 Vite 动态导入 warning，无新增构建错误

## 8. 回归风险

当前仍需继续关注：

- `payment-callback` 仍承担过多跨域副作用
- 深层历史订单仍可能只具备 `actual_price`
- `admin-api` 统计链仍保留部分旧字段兼容读取
- 小程序订单详情页仍保留状态文案本地 fallback

## 9. 后续待清债务

- 继续拆支付回调副作用边界
- 继续删除页面本地支付和状态 fallback
- 继续把后台统计和订单聚合中的金额读取统一到 `pay_amount`
- 补订单主链 smoke 记录，进入 `Wave 2` 第二轮
