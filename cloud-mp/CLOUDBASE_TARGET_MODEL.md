# CloudBase Target Model

## 目标

- MySQL 只作为迁移源，不再作为运行时字段规范。
- 小程序用户侧使用 Cloud Functions。
- 管理后台使用 CloudRun 管理服务。
- CloudBase 文档库只保留一套正式字段模型。

## 契约入口

当前集合真相源拆为两层：

- 高层目标说明：本文件
- 机器可读契约：`config/cloudbase-collection-contract.json`
- 详细分层说明：`docs/architecture/cloudbase-collection-contract.md`

默认扫描 / 补建 / 差异检查以集合契约 JSON 为准，不再只依赖本文件的简化列表。

## 集合分层

### 正式主集合

- `users`
- `products`
- `product_bundles`
- `skus`
- `categories`
- `cart_items`
- `orders`
- `refunds`
- `reviews`
- `commissions`
- `withdrawals`
- `configs`
- `admin_singletons`
- `admins`
- `admin_roles`
- `admin_audit_logs`
- `banners`
- `contents`
- `materials`
- `material_groups`
- `activity_links`
- `brand_news`
- `page_layouts`
- `group_activities`
- `group_orders`
- `group_members`
- `slash_activities`
- `slash_records`
- `slash_helpers`
- `lottery_configs`
- `lottery_prizes`
- `lottery_records`
- `stations`
- `station_staff`
- `wallet_accounts`
- `wallet_logs`
- `wallet_recharge_orders`
- `wallet_recharge_configs`

### 正式流程集合

- `limited_sale_slots`
- `limited_sale_items`
- `goods_fund_transfer_applications`
- `directed_invites`
- `station_procurement_orders`
- `station_sku_stocks`
- `deposit_orders`
- `deposit_refunds`
- `coupon_claim_tickets`
- `lottery_claims`
- `upgrade_applications`
- `agent_exit_applications`

### 正式日志集合

- `goods_fund_logs`
- `point_logs`
- `promotion_logs`
- `fund_pool_logs`
- `station_stock_logs`

### 兼容读取集合

- `app_configs`

说明：

- 当前代码仍有 fallback 读取。
- 但新的配置真相源仍应优先收口到 `configs` / `admin_singletons`。

### 兼容残留集合

- `branch_agent_stations`
- `branch_agent_claims`

说明：

- 仍有后台页面和旧流程引用。
- 不默认作为新功能主模型扩散。
- 是否保留取决于后续渠道能力收口结果。

## 重复与别名规则

以下组合不要误判为重复：

- `limited_sale_slots` / `limited_sale_items` 与 `activity_links`
- `goods_fund_transfer_applications` 与 `goods_fund_logs`
- `station_procurement_orders` / `station_sku_stocks` / `station_stock_logs`
- `deposit_orders` / `deposit_refunds` / `coupon_claim_tickets` 与普通订单链

以下旧名不再作为默认正式集合创建：

- `pickup_stations` → 统一用 `stations`
- `admin_logs` → 统一用 `admin_audit_logs`
- 所有 `*_bak` → 仅视为备份集合

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
