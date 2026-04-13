# Supabase迁移 JSON 清单

## 1. 结论

本仓库共扫描到：

- `338` 个 `*.json`
- `28` 个 `*.jsonl`

但真正与迁移到 Supabase 直接相关的 JSON 数据文件，主要集中在以下 3 组：

| 优先级 | 位置 | 格式 | 用途 | 结论 |
|---|---|---|---|---|
| P0 | `cloud-mp/mysql/jsonl/` | 实际为 JSON Lines，扩展名是 `.json` | 从 MySQL 导出的原始业务数据 | 作为 Supabase 主导入源 |
| P1 | `cloud-mp/cloudbase-import/` | `*.jsonl` | 已做过字段规范化的迁移包 | 作为补充导入源，尤其用于补 `skus` |
| P2 | `cloud-mp/cloudbase-seed/` | 数组 JSON | CloudBase 种子数据/样例数据 | 不作为主源，只作补录或核对 |

不建议把以下 JSON 当作数据库迁移源：

- `miniprogram/**.json`
- `cloud-mp/miniprogram/**.json`
- `package.json` / `package-lock.json`
- `project.config.json` / `project.private.config.json`

这些文件主要是页面路由、组件声明、构建配置、开发工具配置，不承载业务主数据。

## 2. 目录级分布

| 目录 | JSON 数量 | 说明 |
|---|---:|---|
| `cloud-mp/` | 183 | 迁移相关 JSON 最集中，含数据包、CloudBase 配置、云函数配置 |
| `miniprogram/` | 85 | 小程序页面/组件配置，不是数据库迁移数据 |
| `backend/` | 8 | 后端包管理与部署配置 |
| `config/` | 4 | 工具链配置 |
| `admin-ui/` | 2 | 前端包配置 |
| 根目录 | 2 | 微信开发者工具项目配置 |

## 3. 主导入源：`cloud-mp/mysql/jsonl/`

说明：

- 目录名虽叫 `jsonl`，但文件扩展名为 `.json`
- 文件内容实际是“一行一个 JSON 对象”
- 更适合通过脚本批量写入 Supabase，而不是直接当数组 JSON 导入
- 这组文件最接近 MySQL 现网数据，应作为主迁移源

### 3.1 用户与身份域

| 文件 | 记录数 | 对应数据 | 建议目标表 |
|---|---:|---|---|
| `cloud-mp/mysql/jsonl/users.json` | 167 | 用户主数据，含 `openid`、等级、上级关系、邀请码、余额、成长值、N 路径字段 | `users` |
| `cloud-mp/mysql/jsonl/addresses.json` | 19 | 用户收货地址 | `user_addresses` |
| `cloud-mp/mysql/jsonl/point_accounts.json` | 167 | 用户积分账户汇总 | `point_accounts` |
| `cloud-mp/mysql/jsonl/point_logs.json` | 521 | 积分流水 | `point_logs` |
| `cloud-mp/mysql/jsonl/notifications.json` | 368 | 用户通知 | `notifications` |
| `cloud-mp/mysql/jsonl/user_favorites.json` | 19 | 用户收藏 | `user_favorites` |
| `cloud-mp/mysql/jsonl/portal_accounts.json` | 3 | 门户/口令相关账户数据 | `portal_accounts` 或单独评估是否保留 |

### 3.2 商品、分类、内容与素材域

| 文件 | 记录数 | 对应数据 | 建议目标表 |
|---|---:|---|---|
| `cloud-mp/mysql/jsonl/categories.json` | 9 | 商品分类 | `categories` |
| `cloud-mp/mysql/jsonl/products.json` | 11 | 商品主表数据 | `products` |
| `cloud-mp/mysql/jsonl/materials.json` | 52 | 素材库资源 | `materials` |
| `cloud-mp/mysql/jsonl/material_groups.json` | 1 | 素材分组 | `material_groups` |
| `cloud-mp/mysql/jsonl/banners.json` | 5 | Banner/运营图位 | `banners` |
| `cloud-mp/mysql/jsonl/page_layouts.json` | 3 | 页面编排配置 | `page_layouts` |
| `cloud-mp/mysql/jsonl/content_boards.json` | 1 | 内容板块定义 | `content_boards` |
| `cloud-mp/mysql/jsonl/content_board_products.json` | 3 | 内容板块与商品关系 | `content_board_products` |
| `cloud-mp/mysql/jsonl/splash_screens.json` | 1 | 开屏页配置 | `splash_screens` |

### 3.3 交易、订单与售后域

| 文件 | 记录数 | 对应数据 | 建议目标表 |
|---|---:|---|---|
| `cloud-mp/mysql/jsonl/cart_items.json` | 25 | 购物车 | `cart_items` |
| `cloud-mp/mysql/jsonl/orders.json` | 59 | 订单主数据，含买家、金额、状态、地址快照、自提字段、代理字段 | `orders` |
| `cloud-mp/mysql/jsonl/refunds.json` | 9 | 订单售后退款 | `refunds` |
| `cloud-mp/mysql/jsonl/reviews.json` | 3 | 商品评价 | `reviews` |
| `cloud-mp/mysql/jsonl/coupons.json` | 5 | 优惠券定义 | `coupons` |
| `cloud-mp/mysql/jsonl/user_coupons.json` | 170 | 用户领券/用券记录 | `user_coupons` |

### 3.4 分销、钱包、提现与收益域

| 文件 | 记录数 | 对应数据 | 建议目标表 |
|---|---:|---|---|
| `cloud-mp/mysql/jsonl/commissions.json` | 3 | 佣金流水/收益记录 | `commission_logs` 或 `commission_records` |
| `cloud-mp/mysql/jsonl/withdrawals.json` | 3 | 提现申请 | `withdrawals` |
| `cloud-mp/mysql/jsonl/wallet_accounts.json` | 5 | 钱包账户 | `wallet_accounts` |
| `cloud-mp/mysql/jsonl/wallet_logs.json` | 14 | 钱包流水 | `wallet_logs` |
| `cloud-mp/mysql/jsonl/wallet_recharge_orders.json` | 1 | 钱包充值订单 | `wallet_recharge_orders` |

### 3.5 活动与营销域

| 文件 | 记录数 | 对应数据 | 建议目标表 |
|---|---:|---|---|
| `cloud-mp/mysql/jsonl/group_activities.json` | 2 | 拼团活动 | `group_activities` |
| `cloud-mp/mysql/jsonl/group_orders.json` | 14 | 拼团订单 | `group_orders` |
| `cloud-mp/mysql/jsonl/group_members.json` | 14 | 拼团成员关系 | `group_members` |
| `cloud-mp/mysql/jsonl/slash_activities.json` | 1 | 砍价活动 | `slash_activities` |
| `cloud-mp/mysql/jsonl/slash_records.json` | 26 | 砍价记录 | `slash_records` |
| `cloud-mp/mysql/jsonl/slash_helpers.json` | 3 | 砍价助力记录 | `slash_helpers` |
| `cloud-mp/mysql/jsonl/lottery_prizes.json` | 13 | 抽奖奖品 | `lottery_prizes` |
| `cloud-mp/mysql/jsonl/lottery_records.json` | 166 | 抽奖参与/中奖记录 | `lottery_records` |
| `cloud-mp/mysql/jsonl/activity_spot_stock.json` | 1 | 限时/活动库存 | `activity_spot_stock` |
| `cloud-mp/mysql/jsonl/activity_logs.json` | 6 | 活动日志 | `activity_logs` |

### 3.6 线下站点、后台与系统治理域

| 文件 | 记录数 | 对应数据 | 建议目标表 |
|---|---:|---|---|
| `cloud-mp/mysql/jsonl/stations.json` | 3 | 自提站点/服务站点 | `service_stations` |
| `cloud-mp/mysql/jsonl/pickup_verifiers.json` | 1 | 自提核销人员 | `pickup_verifiers` 或 `station_staff` |
| `cloud-mp/mysql/jsonl/admins.json` | 2 | 后台管理员账户 | `admins` |
| `cloud-mp/mysql/jsonl/admin_logs.json` | 194 | 后台操作日志 | `admin_logs` |
| `cloud-mp/mysql/jsonl/mass_messages.json` | 3 | 群发任务 | `mass_messages` |
| `cloud-mp/mysql/jsonl/user_mass_messages.json` | 205 | 群发触达记录 | `user_mass_messages` |
| `cloud-mp/mysql/jsonl/configs.json` | 5 | 系统配置 | `system_configs` |
| `cloud-mp/mysql/jsonl/app_configs.json` | 50 | 小程序/应用侧配置 | `app_configs` |

### 3.7 使用这组文件时的注意事项

1. `orders.json` 中仍是 MySQL 旧字段语义，例如 `buyer_id`、`status`、`agent_id`，迁移到 Supabase 时建议做字段拆分与重命名。
2. `users.json` 中保留了 `parent_id`、`parent_openid`、`invite_code`、`n_leader_id` 等关系字段，迁移时要统一成显式外键。
3. `cloud-mp/mysql/jsonl/` 中没有 `skus.json`，但项目确实存在 SKU 模型，不能忽略。

## 4. 补充导入源：`cloud-mp/cloudbase-import/`

说明：

- 这是已经做过一次“迁移期字段整理”的 JSONL 包
- 更适合拿来做字段映射参考，或弥补主导入源缺口
- 不能完全替代 `cloud-mp/mysql/jsonl/`，但能显著减少字段转换工作

### 4.1 最重要的补充文件

| 文件 | 记录数 | 用途 | 说明 |
|---|---:|---|---|
| `cloud-mp/cloudbase-import/skus.jsonl` | 11 | 补充 SKU 数据 | 主导入源里没有 `skus.json`，这里应作为 SKU 导入主来源 |
| `cloud-mp/cloudbase-import/users.jsonl` | 167 | 参考字段转换结果 | 已转成 CloudBase 风格字段，如 `nickName`、`avatarUrl` |
| `cloud-mp/cloudbase-import/orders.jsonl` | 59 | 参考订单结构转换 | 可用于观察 `openid`、`items[]` 等目标结构 |
| `cloud-mp/cloudbase-import/products.jsonl` | 11 | 参考商品字段转换 | 可用于映射图片、价格、状态字段 |
| `cloud-mp/cloudbase-import/refunds.jsonl` | 9 | 参考退款结构转换 | 可辅助设计 Supabase 退款表 |
| `cloud-mp/cloudbase-import/commissions.jsonl` | 3 | 参考佣金结构转换 | 可辅助设计收益记录表 |

### 4.2 这组文件整体包含的集合

该目录当前包含以下集合对应的导入包：

- `admins`
- `admin_roles`
- `agent_exit_applications`
- `banners`
- `cart_items`
- `categories`
- `commissions`
- `content_board_products`
- `content_boards`
- `coupon_auto_rules`
- `dividend_executions`
- `material_groups`
- `materials`
- `orders`
- `products`
- `refunds`
- `reviews`
- `skus`
- `splash_screens`
- `station_staff`
- `users`
- `withdrawals`

## 5. 备选数据源：`cloud-mp/cloudbase-seed/`

说明：

- 这组文件是数组 JSON，不是逐行 JSON
- 更像“CloudBase 初始化种子包”或“样例数据”
- 适合做核对和补录，不适合直接当主迁移源

### 5.1 有实际数据的文件

| 文件 | 记录数 | 对应数据 | 备注 |
|---|---:|---|---|
| `cloud-mp/cloudbase-seed/users.json` | 167 | 用户种子数据 | 可用于核对 CloudBase 目标字段 |
| `cloud-mp/cloudbase-seed/categories.json` | 9 | 分类种子数据 | 可核对分类映射 |
| `cloud-mp/cloudbase-seed/products.json` | 11 | 商品种子数据 | 可核对图片与价格字段 |
| `cloud-mp/cloudbase-seed/skus.json` | 11 | SKU 种子数据 | 可作为缺失 SKU 的备用源 |
| `cloud-mp/cloudbase-seed/orders.json` | 59 | 订单种子数据 | 目标结构更偏 CloudBase |
| `cloud-mp/cloudbase-seed/cart_items.json` | 25 | 购物车 | 备用源 |
| `cloud-mp/cloudbase-seed/refunds.json` | 9 | 售后退款 | 备用源 |
| `cloud-mp/cloudbase-seed/reviews.json` | 3 | 商品评价 | 备用源 |
| `cloud-mp/cloudbase-seed/commissions.json` | 3 | 佣金记录 | 备用源 |
| `cloud-mp/cloudbase-seed/withdrawals.json` | 3 | 提现记录 | 备用源 |
| `cloud-mp/cloudbase-seed/banners.json` | 5 | Banner | 备用源 |
| `cloud-mp/cloudbase-seed/materials.json` | 52 | 素材 | 备用源 |
| `cloud-mp/cloudbase-seed/material_groups.json` | 1 | 素材分组 | 备用源 |
| `cloud-mp/cloudbase-seed/group_activities.json` | 2 | 拼团活动 | 备用源 |
| `cloud-mp/cloudbase-seed/slash_activities.json` | 1 | 砍价活动 | 备用源 |
| `cloud-mp/cloudbase-seed/admins.json` | 2 | 管理员 | 备用源 |
| `cloud-mp/cloudbase-seed/admin_roles.json` | 2 | 管理员角色 | 备用源 |

### 5.2 当前为空的文件

以下文件在种子包中存在，但当前记录数为 `0`，不应作为迁移数据依据：

- `agent_exit_applications.json`
- `content_boards.json`
- `content_board_products.json`
- `coupon_auto_rules.json`
- `dividend_executions.json`
- `splash_screens.json`
- `station_staff.json`

## 6. 需要手动迁移或改造的配置 JSON

这些文件不是业务主数据，但迁移到 Supabase 时必须关注。

| 文件 | 内容 | 迁移建议 |
|---|---|---|
| `cloud-mp/cloudbaserc.json` | CloudBase 环境 ID、云函数目录、定时任务配置 | 改造成 Supabase 项目环境配置与定时任务方案 |
| `cloud-mp/cloudfunctions/payment/payment.env.example.json` | 微信支付配置模板 | 转成 Supabase Edge Functions / 后端环境变量模板 |
| `cloud-mp/cloudfunctions/payment/payment.runtime.json` | 真实支付运行配置，含敏感商户/密钥信息 | 不入库，改成 Supabase Secret；建议立即按密钥管理规范处理 |
| `cloud-mp/cloudfunctions/distribution/config.json` | 云函数权限配置 | 改造成 Supabase 服务端权限/能力配置 |
| `backend/deploy/pm2.config.json` | Node 后端进程部署配置 | 若保留 Node 服务，可继续使用；若改为 Supabase Functions，则重写部署方式 |
| `cloud-mp/project.config.json` | CloudBase 小程序工程配置 | 仅保留前端工程用途，不参与数据库迁移 |
| `miniprogram/project.config.json` | 小程序工程配置 | 同上 |
| `project.config.json` | 根目录微信工程配置 | 同上 |
| `project.private.config.json` | 本地私有开发配置 | 不入库，不纳入迁移脚本 |

## 7. 明确可以忽略的 JSON

以下 JSON 数量很多，但不属于数据库迁移源：

### 7.1 小程序页面与组件配置

- `miniprogram/pages/**/*.json`
- `miniprogram/components/**/*.json`
- `miniprogram/app.json`
- `miniprogram/sitemap.json`
- `cloud-mp/miniprogram/pages/**/*.json`
- `cloud-mp/miniprogram/components/**/*.json`
- `cloud-mp/miniprogram/app.json`
- `cloud-mp/miniprogram/sitemap.json`

它们承载的是：

- 页面路由声明
- 页面标题与下拉刷新配置
- 组件引用
- tabBar、sitemap、工程行为

不承载用户、订单、商品、佣金等业务数据。

### 7.2 包管理与工具链配置

- `backend/package.json`
- `backend/package-lock.json`
- `admin-ui/package.json`
- `admin-ui/package-lock.json`
- `cloud-mp/package.json`
- `cloud-mp/skills-lock.json`
- `config/mcporter.json`
- `config/cloudbase-tools-schema.json`

这些文件用于：

- 依赖安装
- 构建
- 工具链运行
- CloudBase 本地开发辅助

不应作为 Supabase 数据迁移输入。

## 8. 迁移建议顺序

推荐按以下顺序迁移到 Supabase：

1. 从 `cloud-mp/mysql/jsonl/` 导入基础业务数据：`users`、`categories`、`products`、`addresses`
2. 用 `cloud-mp/cloudbase-import/skus.jsonl` 补齐 `skus`
3. 再导入交易链：`orders`、`refunds`、`reviews`、`cart_items`
4. 再导入收益链：`commissions`、`withdrawals`、`wallet_accounts`、`wallet_logs`
5. 再导入运营配置：`banners`、`materials`、`content_boards`、`app_configs`、`configs`
6. 最后导入活动和后台治理数据：`group_*`、`slash_*`、`lottery_*`、`admins`、`admin_logs`

## 9. 当前已发现的迁移风险

1. `cloud-mp/mysql/jsonl/` 缺少 `skus.json`，不能只依赖这一路径。
2. `orders.json` 仍是旧订单模型，状态和代理字段语义较重，入 Supabase 前建议做状态拆分与关系字段重命名。
3. `users.json`、`orders.json` 中仍保留 MySQL 时代的旧字段命名，不建议原样照搬到新库。
4. `cloud-mp/cloudfunctions/payment/payment.runtime.json` 含敏感支付配置，不能纳入数据库迁移包。
5. `cloud-mp/cloudbase-seed/` 有多份空文件，不能误判为“业务暂时没有这类对象”，只能说明当前种子包未填充。
