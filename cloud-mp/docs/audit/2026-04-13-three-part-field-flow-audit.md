# 三块结构与字段链路审计

日期：2026-04-13  
范围：`miniprogram/`、`admin-ui/`、`cloudfunctions/`  
目标：把当前项目拆成三块理解，并优先识别“字段传递链路是否完整、是否依赖兼容补丁才勉强跑通”

## 1. 结论先说

这个项目当前最重要的问题，不是“页面太多”，而是：

1. 主身份字段没有完全收口到单一真相源。
2. 交易字段存在大量别名和重复语义。
3. 小程序侧真正依赖的是一个隐藏在 `utils/request.js` 里的“第二套接口契约”。
4. 后台侧虽然比小程序稳定，但大量展示字段也是靠后端聚合层在兜底兼容。

一句话判断：

- 小程序端：业务面广，但接口契约最脆。
- 管理后台端：入口更清晰，但依赖 `admin-api` 做大量字段归一化。
- 前后端协同层：真正的风险集中在 `openid / _id / id / _legacy_id` 与 `pay_amount / total_amount / actual_price` 这一类兼容字段上。

## 2. 三块怎么拆

### 2.1 小程序端

职责边界：

- 负责用户侧页面、交互、订单提交流程、支付发起、售后申请、分销中心展示。
- 不直接写数据库。
- 统一经由 `miniprogram/utils/request.js` 把 REST 风格 URL 转成 `wx.cloud.callFunction({ name, data: { action } })`。

关键入口：

- 页面入口：`miniprogram/pages/**`
- 请求总入口：`miniprogram/utils/request.js`
- 云函数调用封装：`miniprogram/utils/cloud.js`
- 典型下单入口：`miniprogram/pages/order/orderConfirmSubmission.js`

真实链路：

`page.js -> utils/request.js ROUTE_TABLE -> utils/cloud.js callFn -> cloudfunctions/<module>/index.js -> 子模块 -> CloudBase`

特点：

- 页面层看到的是 REST URL。
- 实际运行时是 action-RPC。
- URL、`action`、`idKey` 三者都靠 `ROUTE_TABLE` 人工维护。

### 2.2 管理后台端

职责边界：

- 只负责界面、搜索、筛选、操作发起、结果展示。
- 不直接写数据库。
- 统一通过 `admin-ui/src/api/modules/*` 访问 `/admin/api/*`。

关键入口：

- 路由入口：`admin-ui/src/router/index.js`
- 请求入口：`admin-ui/src/utils/request.js`
- API 模块：`admin-ui/src/api/modules/*`
- 高价值页面：`admin-ui/src/views/orders/index.vue`、`refunds/index.vue`、`users/index.vue`

真实链路：

`view -> api/modules/* -> axios -> /admin/api/* -> cloudfunctions/admin-api/src/app.js -> CloudBase`

特点：

- 管理端链路比小程序干净。
- 后台的“字段统一”主要依赖 `admin-api` 的 `buildOrderRecord`、`buildRefundRecord`、`findUserByAnyId` 之类聚合函数。

### 2.3 前后端协同层

这里不是单独一个目录，而是一组跨端共享的真实契约：

- 用户主身份：`openid`
- 文档主键：`_id`
- 历史兼容键：`id`、`_legacy_id`
- 订单金额：`total_amount`、`pay_amount`、`actual_price`
- 支付方式：`payment_method`、`pay_channel`、`pay_type`、`payment_channel`
- 关系链字段：`referrer_openid`、`parent_id`、`parent_openid`

真正的协同点在这些集合：

- `users`
- `products` / `skus`
- `orders`
- `refunds`
- `commissions`
- `withdrawals`
- `configs` / `admin_singletons`

## 3. 关键链路怎么走

### 3.1 登录与用户初始化链

入口：

- 小程序：`miniprogram/appAuth.js`
- 云函数：`cloudfunctions/login/index.js`

主字段：

- 入：`openid`、`invite_code`
- 落：`users.openid`、`referrer_openid`、`my_invite_code`、`role_level`
- 出：`nickName` / `nickname`、`avatarUrl` / `avatar_url`、`wallet_balance`、`commission_balance`

结论：

- 这条链相对完整。
- 但返回层已经开始同时吐驼峰和下划线两套字段，说明兼容债务已经进入用户主模型。

### 3.2 商品详情与规格链

入口：

- 小程序：`GET /products/:id`、`GET /products/:id/reviews`
- 转发：`miniprogram/utils/request.js`
- 云函数：`cloudfunctions/products/*`

主字段：

- 商品：`product_id`、`name`、`images`、`min_price`
- SKU：`sku_id`、`spec`、`price`、`stock`

结论：

- 商品主链字段相对稳定。
- 订单历史链路并不总能把 SKU 精准带回来，后续订单展示经常需要再回查 `products/skus` 兜底。

### 3.3 购物车 -> 下单 -> 支付 -> 支付后处理

入口：

- 提交页：`miniprogram/pages/order/orderConfirmSubmission.js`
- 请求适配：`miniprogram/utils/request.js`
- 下单处理：`cloudfunctions/order/index.js` -> `order-create.js`
- 支付处理：`cloudfunctions/payment/payment-prepay.js`
- 支付后处理：`cloudfunctions/payment/payment-callback.js`

主字段：

- 下单提交：`items[].product_id`、`items[].sku_id`、`quantity`、`address_id`、`user_coupon_id`、`points_to_use`、`use_goods_fund`
- 订单落库：`order_no`、`items`、`pay_amount`、`total_amount`、`status`
- 支付回写：`paid_at`、`payment_method`、`pay_channel`
- 后处理扩散：`commissions`、`growth_value`、`points`、升级、拼团状态

结论：

- 这是全仓最关键的业务链。
- 也是字段最密集、兼容逻辑最多的一条链。
- `processPaidOrder` 已经承担了过多跨域副作用，是订单、支付、分销、成长值的共同耦合点。

### 3.4 售后退款链

入口：

- 小程序退款申请：`cloudfunctions/order/order-lifecycle.js`
- 后台退款审核：`cloudfunctions/admin-api/src/app.js`
- 后台展示：`admin-ui/src/views/refunds/index.vue`

主字段：

- 退款单：`refunds.order_id`、`order_no`、`openid`、`amount`、`status`
- 订单回写：`status=refunding/refunded`、`prev_status`
- 支付路径：`payment_method`、`refund_channel`、`refund_target_text`

结论：

- 小程序侧 `applyRefund` 和后台侧 `refund.complete` 都在做退款语义处理。
- 现在能跑，是因为后台又额外做了一层 `buildRefundRecord` 统一支付方式和退款去向。
- 这条链的“展示正确”高度依赖聚合层，而不是底层字段天然统一。

### 3.5 分销 / 团队 / 提现链

入口：

- 小程序：`distribution` 云函数
- 后台：`admin-api` 的 `users / commissions / withdrawals / finance`

主字段：

- 用户关系：`openid`、`referrer_openid`、`parent_id`、`parent_openid`
- 佣金账户：`commission_balance` / `balance`
- 货款账户：`agent_wallet_balance` / `wallet_balance`

结论：

- 分销链最大的问题不是界面，而是关系字段和余额字段都在兼容模式里。
- `distribution/index.js` 与 `admin-api/src/app.js` 都在各自实现一套“按任意 ID 找人”和“按多字段找上级”的逻辑。

### 3.6 后台订单管理链

入口：

- 页面：`admin-ui/src/views/orders/index.vue`
- API：`admin-ui/src/api/modules/ordersFulfillment.js`
- 后端：`cloudfunctions/admin-api/src/app.js`

主字段：

- 列表筛选：`status_group`、`status`、`payment_method`、`delivery_type`
- 展示聚合：`buyer`、`product`、`sku`、`commissions`
- 物流履约：`logistics_company`、`tracking_no`、`fulfillment_type`

结论：

- 后台订单页是当前最像“统一真相源”的地方。
- 但它之所以稳定，是因为 `buildOrderRecord` 在一个函数里完成了大量字段修补。

## 4. 当前最重要的问题

### P1. 身份字段不是单一真相源

表现：

- 用户相关链路同时在用 `openid`、`_id`、`id`、`_legacy_id`
- 关系链同时在用 `referrer_openid`、`parent_id`、`parent_openid`
- 订单/退款/佣金在不同链路里又会用 `order_id`、`order_no`

证据：

- `cloudfunctions/distribution/index.js`
- `cloudfunctions/order/order-query.js`
- `cloudfunctions/admin-api/src/app.js`

风险：

- 任何新功能只接其中一个字段，就会造成隐性断链。
- 当前系统能跑通，主要靠大量 `findUserByAnyId`、`findCollectionDocByAnyId`、`rowMatchesLookup` 之类兼容查询。

### P1. 交易字段别名过多

表现：

- 金额字段：`total_amount`、`pay_amount`、`actual_price`
- 支付字段：`payment_method`、`pay_channel`、`pay_type`、`payment_channel`
- 状态字段：`pending_payment` 与前端 `pending` 并存

证据：

- `cloudfunctions/order/order-query.js`
- `cloudfunctions/admin-api/src/app.js`
- `cloudfunctions/payment/payment-prepay.js`

风险：

- 统计口径、展示口径、退款口径容易各算各的。
- 后续任何新增统计或报表，都必须先做一轮字段归一化，成本非常高。

### P1. 小程序请求层是隐藏的第二套 API 契约

表现：

- 页面代码写的是 REST URL。
- 真实调用依赖 `miniprogram/utils/request.js` 的 `ROUTE_TABLE`。
- 每条链路要同时维护 `URL -> 云函数 -> action -> idKey`。

风险：

- 页面改了 URL 但没改 `ROUTE_TABLE`，直接断。
- 云函数 action 改名但 `ROUTE_TABLE` 没同步，也会断。
- 这层没有类型约束，也不是自动生成的。

### P2. 历史订单字段完整度依赖兜底逻辑

现状取证：

- `npm run audit:order-fields` 显示：
  - `orders.items` 基础字段完整
  - `order_items.sku_id` 在 seed 中缺失 64/64
  - 历史订单展示需要回查 `products/skus` 兜底

风险：

- 精确 SKU 维度的售后、发货、统计、活动复盘都容易失真。

### P2. 归一化逻辑分散在三层

表现：

- 小程序订单查询层自己做 `pending_payment -> pending`
- 后台 `admin-api` 自己做支付方式、退款去向、用户归属、商品兜底
- 前台页面又重复一层 `detailPaymentMethod`

风险：

- 修一处不等于全链修完。
- 任何字段规则变更都可能出现“小程序对了，后台没对；后台对了，统计没对”。

## 5. 哪块最稳，哪块最危险

最稳的部分：

- 管理后台到 `admin-api` 的访问链
- 后台响应 shape 整体比较统一
- `npm run audit:response-shape` 当前结果为 0 问题

最危险的部分：

- 小程序 `utils/request.js` 这层人工路由表
- 订单、退款、分销这三条交易主链
- 用户关系与身份字段的兼容层

## 6. 建议的后续收口顺序

1. 先定义并冻结“单一身份键规则”
2. 再定义并冻结“交易金额字段规则”
3. 再把支付方式字段统一为单一正式字段
4. 把小程序 `ROUTE_TABLE` 的关键链路做自动对照检查
5. 对订单/退款/佣金/提现建立字段契约文档，而不是继续靠页面各自兜底

## 7. 本轮判断

当前项目可以清晰地拆成三块，但真正该优先处理的不是目录，而是契约。

如果只问“现在最重要的问题是什么”，答案是：

`字段仍然能跑通，是因为兼容逻辑很多，不是因为契约已经统一。`

这意味着下一步最该做的，不是继续加页面，而是把：

- 用户身份字段
- 订单交易字段
- 支付与退款字段
- 分销关系字段

这四类字段先收口成单一真相源。
