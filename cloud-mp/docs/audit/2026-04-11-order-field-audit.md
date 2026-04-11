# 订单字段审计

日期：2026-04-11
范围：`miniprogram/pages/order/*`、`cloudfunctions/order/*`、`cloudbase-seed/orders.json`、`cloudbase-seed/products.json`、`cloudbase-seed/skus.json`

## 1. 审计目标

本轮只回答一件事：

当前订单链路到底有哪些字段，哪些字段是页面真实在读的，哪些字段在本地 seed 中实际缺失。

## 2. 页面与云端实际读取的关键字段

### 2.1 订单列表 / 订单详情真实依赖

小程序订单页实际会读取这些字段：

- 顶层订单：`id`、`order_no`、`status`、`displayStatus`、`statusText`
- 金额：`price`、`total_amount`、`pay_amount`、`actual_price`
- 时间：`created_at`、`paid_at`、`shipped_at`、`completed_at`、`confirmed_at`
- 商品：`product_id`、`product.name`、`product.images`、`sku.spec_value`、`quantity`
- 地址：`address.*`
- 物流：`tracking_no`、`logistics_company`
- 优惠与积分：`coupon_discount`、`points_discount`、`points_used`
- 履约：`delivery_type`、`fulfillment_type`

### 2.2 订单项快照真实依赖

订单项快照目前主要依赖：

- `product_id`
- `sku_id`
- `qty`
- `unit_price`
- `item_amount`
- `snapshot_name`
- `snapshot_image`
- `snapshot_spec`

## 3. 本地 seed 实际存在的字段

通过 [scripts/audit-order-fields.js](/C:/Users/21963/WeChatProjects/zz/cloud-mp/scripts/audit-order-fields.js:1) 统计，本地 `orders` 集合当前只有这些顶层字段：

- `_id`
- `_legacy_id`
- `address_snapshot`
- `created_at`
- `delivery_type`
- `items`
- `openid`
- `order_no`
- `pay_amount`
- `remark`
- `status`
- `total_amount`
- `updated_at`

`orders.items[]` 当前只有这些字段：

- `item_amount`
- `product_id`
- `qty`
- `sku_id`
- `snapshot_image`
- `snapshot_name`
- `snapshot_spec`
- `unit_price`

`products` 集合关键展示字段齐全：

- `name`
- `images`
- `min_price`
- `status`
- `stock`

`skus` 集合关键兜底字段也齐全：

- `product_id`
- `spec`
- `price`
- `image`
- `stock`

## 4. 已确认缺口

### P1. 历史订单商品快照整体缺失

本地 `orders.json` 中，`items[].snapshot_name`、`snapshot_image`、`snapshot_spec` 缺失率都是 `59 / 59`。

这意味着：

- 字段名存在
- 但值整体为空
- 页面如果只信订单快照，商品展示一定不稳定

这是这次“我的订单商品信息缺失”的直接根因。

### P1. 订单展示所需的多个顶层字段并不在 seed 中落库

以下字段在本地 `orders.json` 中缺失率是 `59 / 59`：

- `product`
- `product_id`
- `sku`
- `quantity`
- `address`
- `tracking_no`
- `logistics_company`
- `actual_price`
- `coupon_discount`
- `points_discount`
- `points_used`
- `paid_at`
- `shipped_at`
- `completed_at`
- `confirmed_at`
- `cancelled_at`
- `expire_at`
- `reviewed`
- `fulfillment_type`

这些字段里有两类：

1. 真正可选的业务字段，例如 `tracking_no`
2. 应该由查询层补齐的展示字段，例如 `product`、`sku`、`address`、`quantity`

### P2. 历史物流信息可能仍混在 `remark`

本地样本里能看到不少类似 `物流: 顺丰速运 SF00000000002` 的内容写在 `remark` 中，而不是结构化字段。

这说明至少在一部分历史数据里：

- 物流公司和单号没有完成结构化入库
- 页面级别不能依赖 `remark` 做展示
- 后续若要补历史物流字段，需要单独迁移，而不是继续在前端猜字符串

## 5. 本轮已做的兜底修复

已经在 [cloudfunctions/order/order-query.js](/C:/Users/21963/WeChatProjects/zz/cloud-mp/cloudfunctions/order/order-query.js:1) 加了查询层兜底：

- 订单快照缺 `name/image/spec` 时，按 `product_id/sku_id` 回查 `products/skus`
- 自动补 `product.name`、`product.images`、`sku.spec_value`
- 自动把 `address_snapshot` 兼容成 `address`

这能先解决“订单页商品信息缺失”的展示问题。

## 6. 结论

当前订单字段问题不是“字段名不存在”，而是“历史订单快照值长期为空，而前端又曾直接依赖这些空值”。

现阶段应分两层处理：

1. 查询层继续兜底，保证订单列表和详情能显示完整商品信息。
2. 后续做一次历史数据迁移，把 `snapshot_name/image/spec`、`tracking_no`、`logistics_company` 等该结构化的字段补齐，避免展示层长期依赖动态拼装。

## 7. 已补的修复脚本

已新增 [repair-cloudbase-order-fields.js](/C:/Users/21963/WeChatProjects/zz/cloud-mp/scripts/repair-cloudbase-order-fields.js:1)。

用法：

- 本地 seed 预览：`npm run repair:order-fields`
- 本地 seed 写回：`npm run repair:order-fields -- --apply`
- 云端订单预览：`npm run repair:order-fields -- --cloud`
- 云端订单写回：`npm run repair:order-fields -- --cloud --apply`

脚本会补这些字段：

- `items[].snapshot_name`
- `items[].snapshot_image`
- `items[].snapshot_spec`
- `items[].name`
- `items[].image`
- `items[].spec`
- `quantity`
- `product_id`
- `product_name`
- `sku.spec_value`
- `address`
- `actual_price`
- `original_amount`
- `coupon_discount`
- `points_discount`
- `points_used`
- `reviewed`
- `tracking_no`
- `logistics_company`
- `shipping_company`
