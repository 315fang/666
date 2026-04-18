# CloudBase 索引清单

Generated at: 2026-04-18T15:26:52.503Z

## 校验结果

- PASS: manifest exists (C:\Users\21963\WeChatProjects\zz\cloud-mp\config\cloudbase-index-manifest.json)
- PASS: collections is array
- PASS: collection orders declared
- PASS: collection orders has indexes
- PASS: collection refunds declared
- PASS: collection refunds has indexes
- PASS: collection commissions declared
- PASS: collection commissions has indexes
- PASS: collection products declared
- PASS: collection products has indexes
- PASS: collection banners declared
- PASS: collection banners has indexes
- PASS: collection activity_links declared
- PASS: collection activity_links has indexes
- PASS: collection limited_sale_slots declared
- PASS: collection limited_sale_slots has indexes
- PASS: collection limited_sale_items declared
- PASS: collection limited_sale_items has indexes
- PASS: orders index has name
- PASS: orders.order_no has fields
- PASS: orders.order_no has purpose
- PASS: orders index has name
- PASS: orders.openid_created_at has fields
- PASS: orders.openid_created_at has purpose
- PASS: orders index has name
- PASS: orders.status_created_at has fields
- PASS: orders.status_created_at has purpose
- PASS: orders index has name
- PASS: orders.pay_time_desc has fields
- PASS: orders.pay_time_desc has purpose
- PASS: orders index has name
- PASS: orders.limited_sale_refs has fields
- PASS: orders.limited_sale_refs has purpose
- PASS: refunds index has name
- PASS: refunds.refund_no has fields
- PASS: refunds.refund_no has purpose
- PASS: refunds index has name
- PASS: refunds.status_created_at has fields
- PASS: refunds.status_created_at has purpose
- PASS: refunds index has name
- PASS: refunds.order_id has fields
- PASS: refunds.order_id has purpose
- PASS: commissions index has name
- PASS: commissions.status_created_at has fields
- PASS: commissions.status_created_at has purpose
- PASS: commissions index has name
- PASS: commissions.openid_status has fields
- PASS: commissions.openid_status has purpose
- PASS: commissions index has name
- PASS: commissions.order_id_status has fields
- PASS: commissions.order_id_status has purpose
- PASS: products index has name
- PASS: products.status_sales_count has fields
- PASS: products.status_sales_count has purpose
- PASS: products index has name
- PASS: products.status_heat_score has fields
- PASS: products.status_heat_score has purpose
- PASS: products index has name
- PASS: products.category_status has fields
- PASS: products.category_status has purpose
- PASS: banners index has name
- PASS: banners.position_status_sort_order has fields
- PASS: banners.position_status_sort_order has purpose
- PASS: activity_links index has name
- PASS: activity_links.is_active_sort_order has fields
- PASS: activity_links.is_active_sort_order has purpose
- PASS: limited_sale_slots index has name
- PASS: limited_sale_slots.status_time_window has fields
- PASS: limited_sale_slots.status_time_window has purpose
- PASS: limited_sale_items index has name
- PASS: limited_sale_items.slot_status_sort_order has fields
- PASS: limited_sale_items.slot_status_sort_order has purpose

## 集合索引

## orders

- `order_no`: order_no(asc)，用途：订单详情与支付回查
- `openid_created_at`: _openid(asc), created_at(desc)，用途：用户订单列表
- `status_created_at`: status(asc), created_at(desc)，用途：后台订单筛选
- `pay_time_desc`: paid_at(desc)，用途：支付后核对与时间排序
- `limited_sale_refs`: limited_sale_slot_id(asc), limited_sale_item_id(asc)，用途：限时商品订单追踪

## refunds

- `refund_no`: refund_no(asc)，用途：退款单定位
- `status_created_at`: status(asc), created_at(desc)，用途：售后列表
- `order_id`: order_id(asc)，用途：订单售后回查

## commissions

- `status_created_at`: status(asc), created_at(desc)，用途：佣金后台列表
- `openid_status`: _openid(asc), status(asc)，用途：分销员佣金中心
- `order_id_status`: order_id(asc), status(asc)，用途：订单佣金追踪

## products

- `status_sales_count`: status(asc), sales_count(desc)，用途：商品列表销量排序
- `status_heat_score`: status(asc), heat_score(desc)，用途：首页热销与推荐
- `category_status`: category_id(asc), status(asc)，用途：分类页商品筛选

## banners

- `position_status_sort_order`: position(asc), status(asc), sort_order(asc)，用途：Banner 位读取

## activity_links

- `is_active_sort_order`: is_active(asc), sort_order(asc)，用途：活动入口配置读取

## limited_sale_slots

- `status_time_window`: status(asc), start_time(asc), end_time(asc), sort_order(asc)，用途：有效档期与即将开始档期查询

## limited_sale_items

- `slot_status_sort_order`: slot_id(asc), status(asc), sort_order(asc)，用途：档期商品列表
