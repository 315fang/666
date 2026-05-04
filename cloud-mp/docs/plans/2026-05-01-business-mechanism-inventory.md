# 业务机制归属清单

日期：2026-05-01

来源：

- [业务机制收口方案](/C:/Users/21963/WeChatProjects/zz/cloud-mp/docs/plans/2026-05-01-business-mechanism-closure.md)
- [当前业务架构与完整性审查](/C:/Users/21963/WeChatProjects/zz/cloud-mp/docs/architecture/current-business-architecture.md)
- [CloudBase 集合契约](/C:/Users/21963/WeChatProjects/zz/cloud-mp/docs/architecture/cloudbase-collection-contract.md)
- `miniprogram/app.json`
- `admin-ui/src/views`
- `cloudfunctions`
- `config/cloudbase-collection-contract.json`

## 1. 标记说明

| 标记 | 含义 |
| --- | --- |
| 保留 | 当前机制合理，继续作为正式能力 |
| 合入口 | 保留底层数据或能力，但前后台入口应合并展示 |
| 只兼容 | 只用于历史读取或迁移，不再扩散新功能 |
| 待归档 | 需评估是否下线或归档 |
| 不可合并 | 名字相近但业务层级不同，不能压成一张表或一个账本 |

## 2. 小程序页面归属

### 2.1 用户与渠道中心

| 页面 | 归属 | 标记 | 说明 |
| --- | --- | --- | --- |
| `pages/user/user` | 用户与渠道中心 | 合入口 | 我的页作为总入口，只展示身份、权益、资金摘要 |
| `pages/user/edit-profile` | 用户与渠道中心 | 保留 | 用户资料 |
| `pages/user/portal-password` | 用户与渠道中心 | 保留 | 代理 / 门店身份相关访问 |
| `pages/activity/n-invite` | 用户与渠道中心 | 合入口 | 邀请传播入口，归入渠道关系 |
| `pages/distribution/center` | 用户与渠道中心 / 资金中心 | 合入口 | 当前混合团队、佣金、货款，应拆成摘要入口 |
| `pages/distribution/directed-invites` | 用户与渠道中心 | 保留 | 定向邀请 / 改线流程 |
| `pages/distribution/directed-invite` | 用户与渠道中心 | 保留 | 定向邀请详情 |
| `pages/distribution/team` | 用户与渠道中心 | 保留 | 团队列表 |
| `pages/distribution/team-member` | 用户与渠道中心 | 保留 | 团队成员详情 |
| `pages/distribution/invite-poster` | 用户与渠道中心 | 保留 | 邀请海报 |
| `pages/distribution/business-center` | 用户与渠道中心 | 合入口 | 经营中心应回到渠道中心或分销中心 |
| `pages/stations/map` | 用户与渠道中心 / 交易中心 | 合入口 | 门店既是渠道节点也是履约节点 |
| `pages/stations/my-station` | 用户与渠道中心 | 保留 | 门店身份工作台 |
| `pages/pickup/verify` | 用户与渠道中心 / 交易中心 | 保留 | 门店核销履约 |
| `pages/pickup/orders` | 用户与渠道中心 / 交易中心 | 保留 | 门店订单履约 |

### 2.2 交易中心

| 页面 | 归属 | 标记 | 说明 |
| --- | --- | --- | --- |
| `pages/index/index` | 交易中心 / 运营配置中心 | 保留 | 商城首页 |
| `pages/category/category` | 交易中心 | 保留 | 商品目录 |
| `pages/cart/cart` | 交易中心 | 保留 | 购物车 |
| `pages/product/detail` | 交易中心 | 保留 | 商品详情 |
| `pages/product/poster` | 交易中心 / 用户与渠道中心 | 合入口 | 商品分享叠加邀请和券 |
| `pages/product-bundle/detail` | 交易中心 | 保留 | 组合包成交玩法 |
| `pages/search/search` | 交易中心 | 保留 | 搜索 |
| `pages/order/list` | 交易中心 | 保留 | 订单列表 |
| `pages/order/detail` | 交易中心 | 保留 | 订单详情 |
| `pages/order/confirm` | 交易中心 | 保留 | 订单确认 |
| `pages/order/pickup-station-list` | 交易中心 | 保留 | 履约选择 |
| `pages/order/review` | 交易中心 / 权益中心 | 保留 | 评价可触发积分 |
| `pages/order/refund-apply` | 交易中心 / 资金中心 | 保留 | 售后退款 |
| `pages/order/refund-list` | 交易中心 / 资金中心 | 保留 | 售后退款列表 |
| `pages/order/refund-detail` | 交易中心 / 资金中心 | 保留 | 售后退款详情 |
| `pages/order/pickup-credential` | 交易中心 | 保留 | 核销凭证 |
| `pages/logistics/tracking` | 交易中心 | 保留 | 物流查询 |
| `pages/address/list` | 交易中心 | 保留 | 交易地址 |
| `pages/address/edit` | 交易中心 | 保留 | 交易地址编辑 |

### 2.3 权益中心

| 页面 | 归属 | 标记 | 说明 |
| --- | --- | --- | --- |
| `pages/user/membership-center` | 权益中心 / 用户与渠道中心 | 合入口 | 成长权益，不再单独解释第二套会员身份 |
| `pages/points/index` | 权益中心 | 保留 | 积分资产和积分消费场景 |
| `pages/coupon/center` | 权益中心 | 保留 | 领券中心 |
| `pages/coupon/list` | 权益中心 | 保留 | 我的券 |
| `pages/coupon/claim` | 权益中心 / 用户与渠道中心 | 保留 | 领券可叠加邀请参数 |
| `pages/coupon/exchange` | 权益中心 / 交易中心 | 保留 | 兑换券消费场景 |
| `pages/lottery/lottery` | 权益中心 | 合入口 | 积分消费场景，不独立成业务中心 |
| `pages/lottery/claim` | 权益中心 | 保留 | 抽奖领奖流程 |

### 2.4 资金中心

| 页面 | 归属 | 标记 | 说明 |
| --- | --- | --- | --- |
| `pages/wallet/index` | 资金中心 | 合入口 | 钱包总入口 |
| `pages/wallet/agent-wallet` | 资金中心 | 保留 | 货款账户 |
| `pages/wallet/recharge-order` | 资金中心 | 保留 | 货款充值 |
| `pages/distribution/commission-logs` | 资金中心 | 保留 | 佣金流水 |
| `pages/distribution/goods-fund-transfer-history` | 资金中心 | 保留 | 货款转账 / 转移记录 |
| `pages/distribution/withdraw-history` | 资金中心 | 保留 | 提现记录 |
| `pages/distribution/fund-pool` | 资金中心 | 合入口 | 基金池归入资金中心 |
| `pages/distribution/promotion-progress` | 用户与渠道中心 / 资金中心 | 合入口 | 晋升进度与存钱罐预算都在此出现 |
| `pages/distribution/stock-logs` | 用户与渠道中心 / 交易中心 | 合入口 | 门店 / 代理库存流水 |
| `pages/user/deposit-orders` | 权益中心 / 资金中心 | 合入口 | 押金领券链路，不能并入普通订单 |

### 2.5 运营配置中心

| 页面 | 归属 | 标记 | 说明 |
| --- | --- | --- | --- |
| `pages/splash/splash` | 运营配置中心 | 保留 | 启动页配置 |
| `pages/index/brand-zone-detail` | 运营配置中心 | 保留 | 品牌内容 |
| `pages/index/brand-news-list` | 运营配置中心 | 保留 | 品牌资讯 |
| `pages/activity/brand-news-detail` | 运营配置中心 | 保留 | 品牌资讯详情 |
| `pages/user/notifications` | 运营配置中心 / 用户与渠道中心 | 保留 | 用户消息 |
| `pages/user/customer-service` | 运营配置中心 | 保留 | 客服配置 |
| `pages/privacy/privacy` | 运营配置中心 | 保留 | 合规内容 |

### 2.6 活动成交页面

| 页面 | 归属 | 标记 | 说明 |
| --- | --- | --- | --- |
| `pages/activity/activity` | 交易中心 | 合入口 | 活动成交总入口 |
| `pages/activity/flex-bundles` | 交易中心 | 合入口 | 组合玩法列表 |
| `pages/activity/limited-spot` | 交易中心 | 合入口 | 限时专享 |
| `pages/slash/list` | 交易中心 | 合入口 | 砍价玩法 |
| `pages/slash/detail` | 交易中心 | 保留 | 砍价详情 |
| `pages/group/list` | 交易中心 | 合入口 | 拼团玩法 |
| `pages/group/detail` | 交易中心 | 保留 | 拼团详情 |

## 3. 管理后台页面归属

| 视图目录 | 归属 | 标记 | 说明 |
| --- | --- | --- | --- |
| `users` | 用户与渠道中心 | 保留 | 用户主资料 |
| `dealers` | 用户与渠道中心 | 合入口 | 经销商作为渠道视角 |
| `branch-agents` | 用户与渠道中心 | 待归档 | 需判断是否仍有真实流程 |
| `directed-invites` | 用户与渠道中心 | 保留 | 定向邀请 / 改线 |
| `pickup-stations` | 用户与渠道中心 / 交易中心 | 合入口 | 门店资料与履约节点 |
| `pickup-inventory` | 用户与渠道中心 / 交易中心 | 保留 | 门店库存 |
| `pickup-procurements` | 用户与渠道中心 / 交易中心 | 保留 | 门店备货 |
| `warehouse-overview` | 交易中心 | 保留 | 库存 / 仓储视图 |
| `products` | 交易中心 | 保留 | 商品 |
| `categories` | 交易中心 | 保留 | 分类 |
| `product-bundles` | 交易中心 | 合入口 | 活动成交玩法 |
| `orders` | 交易中心 | 保留 | 订单 |
| `refunds` | 交易中心 / 资金中心 | 保留 | 售后与退款 |
| `reviews` | 交易中心 / 权益中心 | 保留 | 评价和积分 |
| `group-buy` | 交易中心 | 合入口 | 拼团玩法 |
| `limited-sales` | 交易中心 | 合入口 | 限时玩法 |
| `activities` | 交易中心 / 运营配置中心 | 合入口 | 活动页与活动入口 |
| `coupons` | 权益中心 | 保留 | 券资产 |
| `membership` | 权益中心 / 用户与渠道中心 | 合入口 | 建议重组为身份与权益规则 |
| `commissions` | 资金中心 | 保留 | 佣金结算 |
| `withdrawals` | 资金中心 | 保留 | 提现审核 |
| `finance` | 资金中心 | 保留 | 财务看板 |
| `goods-fund-transfers` | 资金中心 | 保留 | 货款转移 |
| `deposit-orders` | 权益中心 / 资金中心 | 合入口 | 押金领券链路 |
| `agent-system` | 运营配置中心 / 用户与渠道中心 | 待归档 | 已有文档判断整页下线或并入会员与分支代理配置 |
| `settings` | 运营配置中心 | 保留 | 运营参数 |
| `n-system` | 运营配置中心 | 待归档 | 需确认是否仍对应有效 N 路径 |
| `content` | 运营配置中心 | 保留 | 内容管理 |
| `home-sections` | 运营配置中心 | 保留 | 首页内容位 |
| `materials` | 运营配置中心 | 保留 | 素材 |
| `mass-message` | 运营配置中心 | 保留 | 群发消息 |
| `dashboard` | 运营配置中心 / 资金中心 | 保留 | 经营看板 |
| `ops-monitor` | 运营配置中心 | 保留 | 运维监控 |
| `logs` | 运营配置中心 | 保留 | 审计日志 |
| `admins` | 运营配置中心 | 保留 | 管理员和权限 |
| `login` | 运营配置中心 | 保留 | 后台登录 |

## 4. 云函数归属

| 云函数 | 归属 | 标记 | 说明 |
| --- | --- | --- | --- |
| `login` | 用户与渠道中心 | 保留 | 登录、初始化、邀请绑定 |
| `user` | 用户与渠道中心 / 权益中心 | 合入口 | 用户资料、成长、积分、券、地址等 |
| `distribution` | 用户与渠道中心 / 资金中心 | 合入口 | 团队、佣金、提现、货款、基金池都在此 |
| `products` | 交易中心 | 保留 | 商品 |
| `cart` | 交易中心 | 保留 | 购物车 |
| `order` | 交易中心 | 保留 | 下单、订单、活动成交、履约 |
| `payment` | 交易中心 / 资金中心 / 权益中心 | 保留 | 支付回调、退款、积分成长、佣金副作用 |
| `config` | 运营配置中心 | 保留 | 小程序配置和内容 |
| `admin-api` | 全部中心 | 合入口 | 管理后台聚合层，应按中心继续拆 |
| `commission-deadline-process` | 资金中心 | 保留 | 佣金冻结到期处理 |
| `order-auto-confirm` | 交易中心 / 资金中心 | 保留 | 自动确认后影响佣金状态 |
| `order-timeout-cancel` | 交易中心 | 保留 | 超时取消 |
| `visitor-account-cleanup` | 用户与渠道中心 | 保留 | 游客账号清理 |
| `shared` | 基础设施 | 保留 | 公共模块 |

## 5. 集合归属

### 5.1 用户与渠道中心

| 集合 | 标记 | 说明 |
| --- | --- | --- |
| `users` | 保留 | 用户主资料、身份等级、邀请关系 |
| `addresses` | 保留 | 用户交易地址 |
| `directed_invites` | 保留 | 定向邀请 / 改线流程 |
| `promotion_logs` | 保留 | 晋升事件日志 |
| `promotion_lineage_logs` | 保留 | 关系改挂审计 |
| `stations` | 保留 | 门店 / 自提点主资料 |
| `station_staff` | 保留 | 门店人员 |
| `agent_exit_applications` | 保留 | 代理退出流程 |
| `branch_agent_claims` | 待归档 | 兼容残留 |
| `branch_agent_stations` | 待归档 | 兼容残留 |

### 5.2 交易中心

| 集合 | 标记 | 说明 |
| --- | --- | --- |
| `products` | 保留 | 商品 |
| `skus` | 保留 | SKU |
| `categories` | 保留 | 分类 |
| `product_bundles` | 保留 | 组合包 |
| `cart_items` | 保留 | 购物车 |
| `orders` | 保留 | 订单主表 |
| `refunds` | 保留 | 售后退款 |
| `reviews` | 保留 | 评价 |
| `group_activities` | 保留 | 拼团活动 |
| `group_members` | 保留 | 拼团成员 |
| `group_orders` | 保留 | 拼团订单关系 |
| `slash_activities` | 保留 | 砍价活动 |
| `slash_records` | 保留 | 砍价记录 |
| `slash_helpers` | 保留 | 砍价助力 |
| `limited_sale_slots` | 保留 | 限时档期 |
| `limited_sale_items` | 保留 | 限时商品 |
| `station_procurement_orders` | 不可合并 | 门店备货流程表 |
| `station_sku_stocks` | 不可合并 | 门店库存状态 |
| `station_stock_logs` | 不可合并 | 门店库存流水 |

### 5.3 权益中心

| 集合 | 标记 | 说明 |
| --- | --- | --- |
| `point_logs` | 保留 | 积分与成长值流水 |
| `coupons` | 保留 | 券模板 |
| `user_coupons` | 保留 | 用户券 |
| `coupon_auto_rules` | 保留 | 自动发券规则 |
| `coupon_claim_tickets` | 保留 | 领券票据流程 |
| `lottery_configs` | 保留 | 抽奖配置 |
| `lottery_prizes` | 保留 | 奖品 |
| `lottery_records` | 保留 | 抽奖记录 |
| `lottery_claims` | 保留 | 领奖流程 |
| `deposit_orders` | 不可合并 | 押金领券订单，不能并入普通订单 |
| `deposit_refunds` | 不可合并 | 押金退款，不能并入普通退款 |

### 5.4 资金中心

| 集合 | 标记 | 说明 |
| --- | --- | --- |
| `commissions` | 保留 | 佣金流水 |
| `withdrawals` | 保留 | 提现申请 |
| `wallet_accounts` | 保留 | 货款账户 |
| `wallet_recharge_configs` | 保留 | 充值配置 |
| `wallet_recharge_orders` | 保留 | 充值订单 |
| `wallet_logs` | 保留 | 佣金 / 余额类流水，需统一字段 |
| `goods_fund_logs` | 保留 | 货款流水 |
| `goods_fund_transfer_applications` | 不可合并 | 货款转移申请单 |
| `fund_pool_logs` | 不可合并 | 基金池流水 |
| `upgrade_piggy_bank_logs` | 不可合并 | 升级激励预算桶 |
| `dividend_executions` | 保留 | 分红执行流程 |

### 5.5 运营配置中心

| 集合 | 标记 | 说明 |
| --- | --- | --- |
| `configs` | 保留 | 运行配置 |
| `admin_singletons` | 保留 | 后台单例配置 |
| `app_configs` | 只兼容 | 旧配置读取兼容 |
| `admins` | 保留 | 管理员 |
| `admin_roles` | 保留 | 后台角色 |
| `admin_audit_logs` | 保留 | 操作审计 |
| `banners` | 保留 | Banner |
| `brand_news` | 保留 | 品牌资讯 |
| `contents` | 保留 | 内容 |
| `content_boards` | 保留 | 内容位 |
| `content_board_products` | 保留 | 内容位商品 |
| `page_layouts` | 保留 | 页面布局 |
| `splash_screens` | 保留 | 启动页 |
| `activity_links` | 保留 | 活动入口配置，不是限时活动主表 |
| `activity_bubbles` | 保留 | 活动气泡 |
| `activities` | 合入口 | 泛活动入口 / 运营配置 |
| `materials` | 保留 | 素材 |
| `material_groups` | 保留 | 素材分组 |
| `mass_messages` | 保留 | 群发消息 |
| `notifications` | 保留 | 通知 |

## 6. 配置 key 归属

| 配置 key / 根对象 | 归属 | 标记 | 说明 |
| --- | --- | --- | --- |
| `member_level_config` | 用户与渠道中心 / 权益中心 | 保留 | `role_level` 展示与说明 |
| `member_upgrade_rule_config` | 用户与渠道中心 | 保留 | 晋升规则主配置 |
| `growth_rule_config` | 权益中心 | 保留 | 成长值发放规则 |
| `growth_tier_config` | 权益中心 | 保留 | 成长权益展示档位 |
| `point_rule_config` | 权益中心 | 保留 | 积分获得 / 抵扣规则 |
| `point_level_config` | 权益中心 | 合入口 | 积分中心展示档位，需避免与身份等级混淆 |
| `agent_system_upgrade_rules` | 用户与渠道中心 | 只兼容 | 历史升级规则兼容 |
| `agent_system_peer_bonus` / `agent_system_peer-bonus` | 资金中心 | 合入口 | 需确定 canonical key，避免重复 key 族 |
| `agent_system_fund-pool` | 资金中心 | 保留 | 基金池配置 |
| `agent_system_dividend-rules` | 资金中心 | 保留 | 分红规则，需避免开启但无产出 |
| `branch-agent-policy` | 用户与渠道中心 / 资金中心 | 保留 | 分支代理和自提补贴策略 |
| `miniProgramConfig.brand_config` | 运营配置中心 | 保留 | 品牌配置 |
| `miniProgramConfig.feature_flags` | 运营配置中心 | 保留 | 功能开关 |
| `miniProgramConfig.activity_page_config` | 交易中心 / 运营配置中心 | 保留 | 活动页配置 |
| `miniProgramConfig.lottery_config` | 权益中心 / 运营配置中心 | 保留 | 抽奖入口与配置 |
| `miniProgramConfig.membership_config` | 权益中心 / 用户与渠道中心 | 保留 | 会员 / 成长权益展示配置 |
| `miniProgramConfig.logistics_config` | 交易中心 / 运营配置中心 | 保留 | 物流配置 |
| `miniProgramConfig.withdrawal_config` | 资金中心 / 运营配置中心 | 保留 | 提现规则 |
| `miniProgramConfig.light_prompt_modals` | 运营配置中心 | 保留 | 轻弹窗 |
| `miniProgramConfig.product_detail_pledges` | 交易中心 / 运营配置中心 | 保留 | 商品详情承诺 |
| `miniProgramConfig.feature_toggles` | 运营配置中心 | 保留 | 功能开关 |

## 7. 第一批建议动作

1. 将后台 `membership` 页面口径调整为“身份与权益规则”，不新增独立会员体系。
2. 将后台导航分组改成五个业务中心，保留原路由和权限 key。
3. 小程序 tab 默认文案已收为 `我的`，避免和代理身份重复；线上存量配置如仍为 `我的会员`，通过运营参数改回。
4. 将 `distribution/center` 拆成用户与渠道摘要 + 资金摘要，详情仍跳转原页面。
5. 针对 `agent_system_peer_bonus` / `agent_system_peer-bonus` 做配置 key 决策。
6. 针对 `wallet_logs.type/change_type` 做写入归一化方案。
7. 针对 `branch_agent_*` 和 `n-system` 做保留 / 归档决策。
