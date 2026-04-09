# 云数据库导入指南

## 导入步骤
1. 微信开发者工具 → 云开发 → 数据库
2. 新建集合（集合名 = 文件名去掉 .jsonl）
3. 点击集合 → 导入 → 选择 .jsonl 文件 → 格式 JSON Lines → 冲突处理：插入 → 确认

## 优先导入顺序（基础数据先导入）
1. categories.jsonl       — 商品分类
2. products.jsonl         — 商品
3. skus.jsonl             — 规格
4. users.jsonl            — 用户
5. addresses.jsonl        — 地址
6. orders.jsonl           — 订单
7. configs.jsonl          — 系统配置
8. app_configs.jsonl      — 小程序配置
9. splash_screens.jsonl   — 开屏页
10. banners.jsonl         — Banner
11. coupons.jsonl         — 优惠券
12. user_coupons.jsonl    — 用户优惠券
13. commissions.jsonl     — 佣金记录
14. withdrawals.jsonl     — 提现记录
15. 其余表按需导入

## 集合权限设置（导入后手动设置）
| 集合 | 推荐权限 |
|------|---------|
| products, categories, banners | 所有人可读 |
| users, orders, addresses | 仅创建者可读写（通过云函数） |
| commissions, withdrawals | 仅管理员 |
| configs, app_configs, splash_screens | 所有人可读 |

## 生成记录数
- point_logs: 521 条
- notifications: 368 条
- user_mass_messages: 205 条
- admin_logs: 194 条
- user_coupons: 170 条
- point_accounts: 167 条
- users: 167 条
- lottery_records: 166 条
- orders: 59 条
- materials: 52 条
- app_configs: 50 条
- slash_records: 26 条
- cart_items: 25 条
- addresses: 19 条
- user_favorites: 19 条
- wallet_logs: 14 条
- group_members: 14 条
- group_orders: 14 条
- lottery_prizes: 13 条
- products: 11 条
- categories: 9 条
- refunds: 9 条
- activity_logs: 6 条
- wallet_accounts: 5 条
- banners: 5 条
- coupons: 5 条
- configs: 5 条
- commissions: 3 条
- content_board_products: 3 条
- mass_messages: 3 条
- page_layouts: 3 条
- portal_accounts: 3 条
- reviews: 3 条
- stations: 3 条
- slash_helpers: 3 条
- withdrawals: 3 条
- admins: 2 条
- group_activities: 2 条
- activity_spot_stock: 1 条
- wallet_recharge_orders: 1 条
- content_boards: 1 条
- material_groups: 1 条
- pickup_verifiers: 1 条
- slash_activities: 1 条
- splash_screens: 1 条