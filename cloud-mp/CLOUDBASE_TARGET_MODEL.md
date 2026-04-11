# CloudBase Target Model

## 目标

- MySQL 只作为迁移源，不再作为运行时字段规范。
- 小程序用户侧使用 Cloud Functions。
- 管理后台使用 CloudRun 管理服务。
- CloudBase 文档库只保留一套正式字段模型。

## 正式集合

- `users`
- `products`
- `skus`
- `categories`
- `cart_items`
- `orders`
- `refunds`
- `reviews`
- `commissions`
- `withdrawals`
- `configs`
- `banners`
- `contents`
- `materials`
- `material_groups`
- `admins`
- `admin_roles`
- `admin_audit_logs`
- `admin_singletons` — 管理端运行配置/单例快照
- `group_activities` — 拼团活动配置
- `group_orders` — 拼团订单（同 orders 中 order_type='group'）
- `group_members` — 拼团参与成员
- `slash_activities` — 砍价活动配置
- `slash_records` — 砍价记录
- `slash_helpers` — 砍价助力记录（内嵌于 slash_records.helpers）
- `activity_links` — 活动链接/版块配置
- `lottery_configs` — 抽奖配置
- `lottery_prizes` — 抽奖奖品
- `lottery_records` — 抽奖记录
- `stations` — 自提站点
- `wallet_accounts` — 代理货款账户
- `wallet_logs` — 货款流水
- `wallet_recharge_orders` — 充值订单
- `wallet_recharge_configs` — 充值配置

## 统一规则

### 用户

- 用户归属字段统一为 `openid`
- 后台管理员独立于小程序用户体系
- 后台登录不复用 `users`

### 商品

- 商品主表统一为 `products`
- 规格表统一为 `skus`
- 不再并存 `product_skus`
- 商品图片字段统一为 `images` / `detail_images`

### 购物车

- 数量字段统一为 `qty`
- 主键语义为 `openid + sku_id`

### 订单

- 订单归属统一为 `openid`
- 金额统一用“分”为长期目标
- 订单明细必须固化快照

### 图片与素材

- 图片长期存储统一为 CloudBase 云存储
- 数据库存储 `file_id` 和素材元数据
- 临时 URL 不是正式字段

### 管理端运行配置

- 管理端单例配置统一存储在 `admin_singletons`
- 生产环境不依赖本地文件 override 作为正式配置源
- `settings`、`mini-program-config`、`feature-toggles`、`popup-ad-config` 等都属于运行时配置

## 运行层约束

### 小程序

- 只调 `login`
- `user`
- `products`
- `cart`
- `order`
- `payment`
- `config`

### 管理后台

- 所有管理写操作必须经过 CloudRun 服务层
- 前端不直接写数据库
- 后台权限与小程序身份彻底分离
