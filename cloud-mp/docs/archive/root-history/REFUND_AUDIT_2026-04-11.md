# 退款系统审计报告 — 2026-04-11

## 背景

用户反馈：商户退款单号 `REF1775897667548975` / 微信退款单号 `50300306962026041124923956041`
— 管理后台显示"已退款"，但用户实际没有收到退款。

---

## 根本原因（已修复）

### Bug 1 ★★★ 退款状态立即标记为 completed（最严重）

**文件**：`cloudfunctions/admin-api/src/app.js`（第 4053 行）

**问题**：微信支付退款是**异步流程**。调用微信退款 API 后，微信返回 `status: PROCESSING`，
表示"申请已接受，正在处理"，真正到账需要等待几秒到几天不等。

但原代码在 API 返回 PROCESSING 后，**立即**将退款状态改为 `completed`，订单改为 `refunded`，
并提前取消了佣金。这导致：
- 管理后台显示"已退款" ✓
- 用户实际没有收到钱 ✗
- 微信后续的真实回调（SUCCESS/ABNORMAL）完全被忽略

**修复**：
- 余额支付（wallet）→ 立即 completed（内部操作，正确）
- 微信支付 → 保持 `processing`，等待微信回调后再更新

---

### Bug 2 ★★★ 退款回调完全没有处理逻辑

**文件**：`cloudfunctions/payment/payment-callback.js`

**问题**：微信在退款完成（或异常）后会 POST 一个 REFUND.SUCCESS / REFUND.ABNORMAL 回调。
原代码中 `handleCallback` 对退款事件的处理只有：
```javascript
if (tradeState === 'REFUND') {
    // 退款通知在 refund 模块处理
    return { code: 'SUCCESS', message: 'Refund notification received' };
}
```
**一行实际业务逻辑都没有**，只是把回调丢弃。

另外 `tradeState === 'REFUND'` 这个判断本身就是错误的：
- 支付回调：解密数据中有 `trade_state = 'SUCCESS'`
- 退款回调：解密数据中有 `refund_status = 'SUCCESS'`，没有 `trade_state` 字段

还有一个问题：`eventType` 变量提取了但从未用于路由判断，完全被忽略。

**修复**：
- 添加 `handleRefundCallback()` 函数，处理 REFUND.SUCCESS / REFUND.ABNORMAL / REFUND.CLOSED
- 在 `handleCallback` 中先判断 `eventType.startsWith('REFUND.')` 并路由到正确处理器
- REFUND.SUCCESS → 更新退款记录为 completed，取消佣金，更新订单为 refunded
- REFUND.ABNORMAL / REFUND.CLOSED → 更新退款记录为 failed，恢复订单状态

---

### Bug 3 ★★ notify_url 不一致

**问题**：
- `payment/wechat-pay-v3.js` 中硬编码：`https://cloud1-*.ap-shanghai.tcb.qcloud.la/payment`
- `admin-api/payment.runtime.json` 中配置：`https://cloud1-*.service.tcloudbase.com/payment-notify`

`payment-notify` 根本不存在（cloudfunctions 目录中没有这个函数），
管理员发起的退款的回调通知会返回 404，永远无法处理。

**修复**：统一将两处 notify_url 改为 `https://cloud1-9gywyqe49638e46f.ap-shanghai.tcb.qcloud.la/payment`

---

## 当前那笔退款的状态分析

微信退款单号 `50300306962026041124923956041` 存在，说明微信已接受了退款申请。
建议去**微信支付商户平台**（pay.weixin.qq.com）查询：

1. 登录商户平台 → 交易中心 → 退款查询
2. 搜索商户退款单号：`REF1775897667548975`
3. 查看实际退款状态：
   - PROCESSING → 还在处理中
   - SUCCESS → 已退款（用户可能没收到通知，让用户查零钱或银行卡）
   - ABNORMAL → 退款失败（需要重新发起）

---

## 新增功能

### `wechat-pay-v3.js`
新增 `queryRefundByOutRefundNo(outRefundNo, privateKey)` 函数，
可以主动向微信查询退款状态（`GET /v3/refund/domestic/refunds/{outRefundNo}`）。
可用于后续做退款状态自动同步。

---

## 其他发现（不影响退款但值得注意）

### 1. admin-api 数据存储采用"全量替换"模式

`cloudbase.js` 中的 `replaceCollection` 做的是：
1. 从 CloudBase 读取所有文档
2. 将内存缓存中的数据写回（set）
3. 删除 CloudBase 中有但内存中没有的文档

**风险**：admin-api 启动后，如果 payment 云函数（直接操作 CloudBase）新增了订单、退款记录，
admin-api 下次保存同一个集合时，**会把新增记录删掉**。这在高并发场景下是数据丢失的隐患。

暂时不改（改动太大），但需要注意。建议后续将 admin-api 改为逐条 patch 而非全量替换。

### 2. payment/index.js 中回调路由依赖 `action` 字段

```javascript
if (event.action === 'callback') {
    return handlePaymentAction(event, '');
}
```

微信支付服务器 POST 的 HTTP 回调不会带 `action` 字段，
这意味着 HTTP 触发器接收到的回调实际上会因为 `!openid` 而返回 unauthorized。

这是个很大的隐患。建议在 index.js 里检测 `httpMethod === 'POST'` 且没有 `action` 时，
直接当作回调处理。

### 3. `payment-query.js` 弥补了支付回调问题

支付回调即使有问题，`payment-query.js` 会在用户查询订单时主动向微信查状态并补偿更新。
这就是为什么支付看起来正常但退款不行的原因——退款没有类似的补偿机制。

### 4. `commission.js` 工具函数修改

`admin-ui/src/utils/commission.js` 有改动，暂未审查具体变化。建议检查佣金计算是否正确。

---

## 本次修复文件清单

| 文件 | 变更内容 |
|---|---|
| `cloudfunctions/admin-api/src/app.js` | 微信退款不立即 completed；新增退款回调通知处理路由 |
| `cloudfunctions/payment/payment-callback.js` | 新增 handleRefundCallback；event_type 正确路由 |
| `cloudfunctions/payment/wechat-pay-v3.js` | 新增 queryRefundByOutRefundNo |
| `cloudfunctions/admin-api/payment.runtime.json` | 修正 PAYMENT_WECHAT_NOTIFY_URL |
| `cloudfunctions/payment/payment.runtime.json` | 修正 PAYMENT_WECHAT_NOTIFY_URL |
| `admin-ui/src/views/refunds/index.vue` | 新增 failed 状态展示；processing 提示更清晰 |

---

*写于 2026-04-11，作者：AI 审计*
