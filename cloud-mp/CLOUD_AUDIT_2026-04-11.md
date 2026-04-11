# 云开发代码全面审计报告 — 2026-04-11

## 审计范围

`cloud-mp/cloudfunctions/` 下所有云函数：admin-api, cart, commission-deadline-process, config, distribution, login, order, order-auto-confirm, order-timeout-cancel, payment, products, user

---

## 一、已修复问题

### ★★★ 安全/验签漏洞 — payment-callback.js

**文件**：`payment/payment-callback.js`

**问题**：签名验证 `try/catch` 捕获异常后 `warn` 并**继续处理**，攻击者可发送格式正确但签名错误的伪造回调，绕过验签直接触发改单逻辑（支付成功回调 → `processPaidOrder`）。

**修复**：签名验证异常时直接返回 `FAIL`，不再继续处理。同时补充：头信息不完整也拒绝（防止部分头攻击）。

---

### ★★★ 数据一致性 — order-create.js 优惠券先核销

**文件**：`order/order-create.js`

**问题**：先核销优惠券（`status: 'used'`），再调用 `orders.add`。若 `orders.add` 失败，优惠券已消耗但订单不存在，**无事务回滚，用户白丢优惠券**。

**修复**：优惠券改为先计算折扣、暂不核销，等订单 `add` 成功后再核销，并在失败时记录 order_id 便于核查。

---

### ★★ 越权漏洞 — order-create.js 地址归属

**文件**：`order/order-create.js`

**问题**：`address_id` 只读取 `addresses.doc`，**未校验地址 openid 是否属于当前用户**。知晓他人地址 ID 可将其挂到自己的订单。

**修复**：读取地址后校验 `addrRes.data.openid === openid`。

---

### ★★★ 业务逻辑 Bug — payment-refund.js 退款失败返回 success

**文件**：`payment/payment-refund.js`

**问题**：微信退款 API 调用失败时，`catch` 块仍 `return { success: true, ... }`（带 `wx_error`）。调用方（用户/管理员）易误判退款已提交成功。

**修复**：改为 `throw new Error(...)` 让调用方正确感知失败，同时将订单状态恢复原值。

---

### ★★ 数据错误 — login.js 双 invite_code 不一致

**文件**：`login/index.js`

**问题**：新用户创建时调用两次 `createInviteCode()`，生成两个**不同的随机码**分别写入 `my_invite_code` 和 `invite_code`，导致邀请关系异常（系统查 `my_invite_code` 建立关系，但前端可能读 `invite_code`）。

**修复**：只调用一次 `createInviteCode()`，`invite_code` 置空，统一以 `my_invite_code` 为准，`formatUser` 已有 `my_invite_code || invite_code` 的兼容回退。

---

### ★★ 越权漏洞 — cart/index.js update/remove

**文件**：`cart/index.js`

**问题**：`update`/`remove` 操作仅根据 `cartId` 直接操作文档，**未校验该购物车行是否属于当前 openid**，知晓他人购物车 `_id` 即可删改。

**修复**：操作前读取文档校验 `openid` 归属。

---

## 二、未修复的已知问题（需人工介入或较大改动）

### ★★★ 超卖风险 — order-create.js 未校验库存

**文件**：`order/order-create.js`（约第 280-388 行）

**问题**：创建订单时**未读取/校验 SKU 和商品库存**，库存扣减在支付成功回调中执行（`ensureStockDeducted`）。**高并发下多个用户可同时下单同一商品，导致超卖、库存变负数**。

**建议**：在订单创建时乐观锁扣减库存（`_.inc(-qty)` 配合 `stock > 0` 条件），若扣减后库存 < 0 则回滚并拒绝下单。或使用消息队列排队处理。

---

### ★★★ 并发超额提现 — distribution/index.js withdraw

**文件**：`distribution/index.js`（约第 246-284 行）

**问题**：提现流程：先读余额 → 判断是否足够 → update `.inc(-amount)` → 写 withdrawals → 写 wallet_logs。**没有原子操作**，并发两笔同时通过余额检查后均执行扣减，导致超额扣款。

**建议**：用 `where({ openid, wallet_balance: _.gte(amount) }).update({ wallet_balance: _.inc(-amount) })` 做条件更新，检查 `stats.updated === 0` 则拒绝（乐观锁）。

---

### ★★ payment-query.js 未校验订单归属

**文件**：`payment/payment-query.js`（约第 13-45 行）

**问题**：`queryPaymentStatus(orderId)` 未检查调用者 openid 与订单 openid 是否一致，且当订单为 `pending_payment` 时会主动向微信查询并可能触发 `processPaidOrder` 补偿。任意登录用户知道订单 `_id` 即可查询状态并触发补偿。

**建议**：在 `payment/index.js` 的 `query`/`queryStatus`/`syncWechatPay` 分支中，读取订单后校验 `order.openid === openid`。

---

### ★★ 抽奖记录越权读取 — config/index.js

**文件**：`config/index.js`（约第 383-391 行）

**问题**：`lotteryRecords` action：若请求 `params.openid` 有值，不覆盖为 `wxContext.OPENID`，可枚举任意用户的抽奖记录。

**建议**：强制使用 `wxContext.OPENID`，忽略 `params.openid`。

---

### ★ 取消退款状态恢复逻辑 — order-lifecycle.js

**文件**：`order/order-lifecycle.js`（约第 374-388 行）

**问题**：用户取消 `pending` 退款时，订单从 `refunding` 恢复状态，逻辑：`order.shipped_at ? 'shipped' : (order.paid_at ? 'paid' : 'pending_payment')`。若订单实际为 `completed` 状态但有 `paid_at`，会错误降为 `paid`。

**建议**：恢复前读取订单实际状态，或在进入 `refunding` 时记录 `prev_status`。

---

### ★ 超时取消无条件更新 — order-timeout-cancel/index.js

**文件**：`order-timeout-cancel/index.js`（约第 52-76 行）

**问题**：定时取消时无条件更新 `status: 'cancelled'`，若订单已支付（回调晚于定时器执行），可能取消已支付订单。

**建议**：使用 `where({ _id, status: 'pending_payment' }).update()` 配合 `stats.updated === 0` 判断。

---

### ★ 定时任务单次处理上限 100 条

**文件**：`commission-deadline-process/index.js`（约第 13-18 行）、`order-auto-confirm/index.js`（约第 25-31 行）

**问题**：单次 `limit(100)`，高并发场景下积压超过 100 条时需定时器多次触发。

**建议**：循环处理直到 `batch.length === 0`，或接受当前限制并缩短定时器间隔。

---

### ★ 商品列表拉全表 SKU — products/index.js

**文件**：`products/index.js`（约第 161-167 行）

**问题**：`list` action 中 `getAllRecords(db, 'skus')` 拉取全部 SKU 后在内存中过滤，SKU 数量多时有**超时和读额度浪费**风险。

**建议**：按 `product_id in [...]` 条件查询对应 SKU。

---

### ★ admin-api 部分接口缺少细粒度权限

**文件**：`admin-api/src/app.js`

**问题**：`/admin/api/logs`、`/admin/api/reviews`、`/admin/api/statistics/`*、`/admin/api/debug/*`、`/admin/api/payment-health` 等路由仅校验 JWT 登录，无 `requirePermission` 细粒度控制。

**建议**：按业务敏感度补充权限标签，尤其是 `debug`、`statistics` 等。

---

### ★ /health 接口泄露内部路径

**文件**：`admin-api/src/app.js`（约第 2340-2363 行）

**问题**：`/health` 接口无认证，返回 `data_root`、`runtime_root`、`源描述` 等，方便攻击者枚举路径。

**建议**：要求 `auth` 中间件保护，或只返回 `{status: "ok"}`。

---

## 三、做得好的地方


| 设计点                                        | 位置                           |
| ------------------------------------------ | ---------------------------- |
| 支付回调幂等保护（状态条件更新 + 金额比对）                    | `payment-callback.js`        |
| 佣金创建重复检查（order_id + openid + level + type） | `distribution-commission.js` |
| 分销内部接口 Token 保护                            | `distribution/index.js`      |
| 订单归属强校验                                    | `order-query.js`             |
| 退款回调正确处理（本次新增）                             | `payment-callback.js`        |
| 角色折扣率（本次新增）                                | `order-create.js`            |
| 动销奖励间接佣金（本次新增）                             | `payment-callback.js`        |


---

## 四、本次修复文件清单


| 文件                            | 修改内容                                            |
| ----------------------------- | ----------------------------------------------- |
| `payment/payment-callback.js` | 签名验证失败/异常时拒绝处理，不再继续                             |
| `order/order-create.js`       | 优惠券延迟核销（订单创建后）；地址归属校验                           |
| `payment/payment-refund.js`   | 微信退款失败时抛出错误而非返回 success:true                    |
| `login/index.js`              | 新用户只生成一个邀请码（my_invite_code），invite_code 置空避免不一致 |
| `cart/index.js`               | update/remove 操作前校验购物车项归属                       |


---

*写于 2026-04-11，基于实际代码读取*