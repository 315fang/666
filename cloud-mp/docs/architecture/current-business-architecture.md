# 当前业务架构与完整性审查

日期：2026-04-19  
适用读者：老板、商务负责人、产品、研发

## 0. 真相源与使用原则

本文只以当前 `cloud-mp` 工作区的真实代码和现行审计/契约文档为依据，优先使用以下真相源：

- [项目总体说明](../../PROJECT_OVERVIEW.md)
- [订单 / 支付 / 退款契约](../standards/enterprise-hardening/contracts/order.md)
- [用户 / 分销 / 钱包契约](../standards/enterprise-hardening/contracts/user-distribution.md)
- [Business Smoke Audit](../audit/generated/BUSINESS_SMOKE_AUDIT.md)
- [Mini Program Route Table Audit](../audit/generated/MINIPROGRAM_ROUTE_TABLE_AUDIT.md)
- `cloudfunctions/order/index.js`
- `cloudfunctions/payment/payment-callback.js`
- `cloudfunctions/distribution/index.js`

补充说明：

- [BUSINESS_LOGIC.md](../archive/root-history/BUSINESS_LOGIC.md) 只能作为“历史理想稿对照”，不能单独证明当前已实现能力。
- 上层旧仓说明、MySQL 历史模型、迁移材料不作为当前生产真相源。
- 本文的判断口径是“现状 + 缺口”，不是重新设计一份超出现有实现的理想目标态方案。

## 1. 项目定位与结论

### 1.1 给老板先看

当前系统可以定义为：

**品牌商城交易系统 + 代理分销系统 + 双钱包结算系统 + 会员积分成长系统 + 后台运营系统**

它已经不是一个“只会卖货的小程序”，而是一套包含以下闭环的复合业务系统：

1. 用商品和活动完成成交。
2. 用邀请码、团队关系和代理晋升做裂变。
3. 用佣金、提现、货款钱包支撑分销结算。
4. 用积分、成长值、优惠券、会员页做复购运营。
5. 用管理后台承接商品、订单、退款、提现、佣金、用户、内容和运维操作。

当前总体结论：

- 主交易链已经成型，不需要推倒重来。
- 小程序、云函数、管理后台之间已经形成真实业务面。
- 当前主要问题不是“没业务”，而是“高级规则还不够精确，单一真相还没完全收口”。

### 1.2 给开发先看

当前运行主线已经明确收口到 CloudBase：

- 小程序链路：`page -> request -> wx.cloud.callFunction -> cloudfunctions/<module>`
- 管理后台链路：`admin-ui page -> /admin/api/* -> cloudfunctions/admin-api`
- 正式运行时数据源：CloudBase
- `mysql/` 仅保留迁移输入和历史对照价值，不是当前生产真相

当前业务面已覆盖：

- 小程序：商城、购物车、下单、支付、订单、售后、分销、钱包、积分、优惠券、拼团、砍价、自提、物流
- 管理后台：经营看板、财务看板、商品、活动、订单、退款、提现、佣金、用户、经销商、内容、权限、运维
- 云函数：`login`、`user`、`products`、`cart`、`order`、`payment`、`distribution`、`config`、`admin-api`

## 2. 角色与账户体系

### 2.1 角色分层

当前系统中至少存在四类不同对象，不能混为一谈：

| 对象 | 主身份 | 主要职责 | 边界 |
| --- | --- | --- | --- |
| 小程序用户 | `openid` | 浏览、下单、支付、售后、积分、会员 | 不是后台管理员 |
| 代理层级用户 | `role_level` + `openid` | 邀请团队、赚佣金、提现、转货款、代理补货 | 仍属于 `users` 体系 |
| 经销商 / 分支代理 | 渠道资料 + 企业字段 | 承接更重的渠道经营和企业化信息 | 与普通会员页不是一个概念 |
| 后台管理员 | `admins` / `admin_roles` | 后台登录、审核、运营、配置、运维 | 不复用小程序 `users` 身份 |

### 2.2 代理层级

当前代码中的 `role_level` 已形成可运营的层级体系：

| `role_level` | 当前角色语义 |
| --- | --- |
| `0` | VIP用户 / 普通注册用户 |
| `1` | 初级会员 |
| `2` | 高级会员 |
| `3` | 推广合伙人 |
| `4` | 运营合伙人 |
| `5` | 区域合伙人 |
| `6` | 线下实体门店 |

说明：

- `role_level` 是当前分销和权益计算的主角色字段。
- 历史字段如 `distributor_level`、`level`、`agent_level` 仍存在兼容读取，但不应再作为新的真相源。

### 2.3 账户与关系边界

当前体系至少维护三组重要关系：

1. 用户身份关系
   `openid` 是小程序用户主身份。
2. 邀请与团队关系
   `invite_code` / `my_invite_code` 用于拉新传播，`referrer_openid` / `parent_openid` 用于团队关系归属。
3. 资金账户关系
   `commission_balance` 表示佣金账，`goods_fund_balance` 表示货款账，这两本账不能混用。

开发和运营必须记住的边界：

- 后台管理员与小程序用户彻底分离。
- 分销关系依附于用户主身份，不是单独的第三套账号体系。
- 佣金余额不是货款余额，历史 `balance` 只应按兼容字段理解。

## 3. 核心业务对象

### 3.1 对老板先说明白

当前系统不是只围绕“订单”运转，而是围绕以下核心业务对象联动：

| 对象 | 业务语义 |
| --- | --- |
| `Canonical User` | 用户主资料、角色、邀请关系、双钱包余额和状态 |
| `OrderDTO` | 订单主快照，承接金额、状态、履约方式、买家与地址 |
| `RefundDTO` | 售后退款记录，承接退款渠道、去向、状态和退货物流 |
| `commissions` | 佣金流水，承接分销收益、冻结、可结算、取消 |
| `withdrawals` | 佣金提现申请，承接审核、手续费、到账金额 |
| `wallet_accounts` / `goods_fund_logs` | 代理货款账户与货款流水 |
| `point_logs` | 积分与成长值相关流水 |
| `configs` | 运行时配置、活动配置、展示配置和参数开关 |

### 3.2 对开发的正式口径

#### `Canonical User`

正式契约来自 [用户 / 分销 / 钱包契约](../standards/enterprise-hardening/contracts/user-distribution.md)。

它至少承担以下语义：

- 身份：`id`、`openid`
- 展示：`nickname` / `nickName`、`avatarUrl`
- 角色：`role_level`、`role_name`
- 邀请关系：`invite_code`、`my_invite_code`、`referrer_openid`、`parent_openid`
- 资金：`commission_balance`、`goods_fund_balance`
- 状态：`status_text`

#### `OrderDTO`

正式契约来自 [订单 / 支付 / 退款契约](../standards/enterprise-hardening/contracts/order.md)。

它当前承担以下语义：

- 订单主身份：`id`、`openid`、`order_no`
- 状态：`status`、`status_group`、`status_text`、`status_desc`
- 金额：`total_amount`、`pay_amount`
- 支付：`payment_method`、`payment_method_text`
- 履约：`delivery_type`、`pickup_station`
- 快照：`items`、`buyer`、`address`

#### `RefundDTO`

同样以 [订单 / 支付 / 退款契约](../standards/enterprise-hardening/contracts/order.md) 为准。

它当前承担以下语义：

- 退款身份：`id`、`order_id`、`order_no`、`openid`
- 金额与通道：`amount`、`payment_method`、`refund_channel`
- 到账去向：`refund_target_text`
- 状态：`status`、`status_text`、`status_desc`
- 退货物流：`return_company`、`return_tracking_no`

#### `commissions`

业务语义：

- 来源于订单支付后的分销收益分配
- 承接直推、间推、平级奖等收益
- 当前状态流转以“冻结 / 待审核 / 可提现 / 已结算 / 已取消”为主
- 退款完成后未结或待结佣金应被取消，已结佣金需要反向扣回

#### `withdrawals`

业务语义：

- 提现对象是佣金账，不是货款账
- 记录 `amount`、`fee`、`actual_amount`、`status`
- 需要后台财务或审核岗位介入

#### `wallet_accounts` / `goods_fund_logs`

业务语义：

- `wallet_accounts` 代表代理货款账户
- `goods_fund_logs` 代表货款收支流水
- 当前支持充值、消费、内部退款、佣金转货款等动作

#### `point_logs`

业务语义：

- 承接签到、下单奖励、邀请奖励、退款扣回等积分与成长值变化
- 与会员页、积分页、签到任务、订单后处理联动

#### `configs`

业务语义：

- 承接首页展示、活动资源、品牌区、物流参数、积分成长规则、代理规则等运行时配置
- 当前也是首页品牌区缺键问题的直接落点

## 4. 六条主业务链

### 4.1 拉新绑定链

**老板视角**

这条链解决“新客从哪里来、为什么会被绑定到某个团队、邀请人怎么获得后续收益”的问题。

**当前闭环**

`邀请链接/海报 -> 进入小程序 -> 携带 invite_code -> 登录/初始化用户 -> 写入邀请关系 -> 后续进入团队与佣金链`

**开发口径**

- 小程序存在邀请与海报入口，业务中心和分销页可承接邀新传播。
- 用户主关系字段是 `invite_code`、`my_invite_code`、`referrer_openid`、`parent_openid`。
- 登录与用户初始化属于 [用户 / 分销 / 钱包契约](../standards/enterprise-hardening/contracts/user-distribution.md) 的正式范围。
- 当前还存在多入口关系兼容查询，这是已知未清债务。

### 4.2 商城交易链

**老板视角**

这条链解决“用户如何从浏览商品走到成交，以及系统支持哪些成交模式”的问题。

**当前闭环**

`首页/分类/搜索/详情 -> 购物车 -> 确认订单 -> 普通单/拼团单/砍价单/限时专享单/兑换券单 -> 快递或自提 -> 订单列表与详情 -> 评价`

**开发口径**

- 小程序页面已经覆盖商城首页、分类、商品详情、购物车、订单确认、订单列表、订单详情和评价。
- `cloudfunctions/order/index.js` 已暴露 `create`、`detail`、`list`、`confirm`、`review`、`joinGroup`、`slashStart`、`slashHelp`、`pickup*` 等动作。
- 订单创建阶段已处理 `coupon_id`、`user_coupon_id`、`points_to_use`、`delivery_type`、`pickup_station_id`、`group_activity_id`、`slash_no`、`use_goods_fund` 等条件。
- 路由层审计已确认 `POST /orders`、`GET /orders`、`GET /orders/:id`、`POST /orders/:id/prepay` 等小程序路由与云函数动作对齐。

### 4.3 支付退款链

**老板视角**

这条链解决“钱怎么进来、钱怎么退回去、售后如何不把账做乱”的问题。

**当前闭环**

`订单创建 -> 发起支付 -> 微信支付或内部余额支付 -> 支付回调 -> 状态更新 -> 发货/核销 -> 退款申请 -> 退款执行 -> 退款回调 -> 库存/积分/佣金反向收口`

**开发口径**

- 支付正式方式至少包括 `wechat`、`goods_fund`、`wallet`。
- `cloudfunctions/payment/payment-callback.js` 已处理：
  - 微信支付成功回调
  - 充值回调
  - 退款回调
  - 订单支付后库存、积分、成长值、佣金、拼团/砍价副作用
- [订单 / 支付 / 退款契约](../standards/enterprise-hardening/contracts/order.md) 已规定 `payment_method`、`refund_channel`、`refund_target_text` 等字段语义。
- 小程序退款路由审计已确认 `refundList`、`applyRefund`、`refundDetail`、`cancelRefund`、`returnShipping` 对齐。

### 4.4 分销佣金链

**老板视角**

这条链解决“团队关系如何变成收益，收益如何进入可提现的佣金账户”的问题。

**当前闭环**

`邀请绑定 -> 下级成交 -> 生成佣金 -> 冻结/待审核 -> 可结算 -> 提现或转货款 -> 后台审核与对账`

**开发口径**

- `cloudfunctions/distribution/index.js` 已提供分销中心、佣金日志、团队列表、团队详情、提现、佣金转货款、基金池概览、代理工作台等动作。
- 佣金正式数据表是 `commissions`，提现正式数据表是 `withdrawals`。
- 支付回调会在订单支付后创建佣金，退款回调会取消未结佣金并反向扣回已结佣金。
- 后台已存在“佣金结算”“提现审核”“用户管理”“财务看板”等工作面承接这条链。

### 4.5 货款钱包链

**老板视角**

这条链解决“代理补货的钱放哪里、怎么充值、怎么抵扣订单、退款时怎么回到账户”的问题。

**当前闭环**

`代理开通货款账户 -> 充值 -> 货款流水入账 -> 下单时使用货款支付 -> 退款时退回货款或余额 -> 后台查看账户与流水`

**开发口径**

- 正式对象包括 `wallet_accounts`、`wallet_recharge_orders`、`goods_fund_logs`。
- `cloudfunctions/distribution/index.js` 已提供 `agentWallet`、`agentWalletLogs`、`agentWalletPrepay`、`agentGoodsFund` 等动作。
- 订单创建阶段已经支持 `use_goods_fund`。
- 退款链已经支持把退款退回 `goods_fund` 或 `wallet`。
- 小程序存在 `pages/wallet/agent-wallet`、`pages/wallet/recharge-order` 等入口。

### 4.6 会员积分成长链

**老板视角**

这条链解决“用户成交之后为什么会持续回来、除了分销还有什么复购刺激”的问题。

**当前闭环**

`登录/会员中心 -> 积分页 -> 签到/任务/邀请奖励 -> 下单获得积分与成长值 -> 订单可使用积分抵扣 -> 会员页展示成长进度与档位`

**开发口径**

- `cloudfunctions/user/index.js` 已提供 `pointsAccount`、`pointsSignInStatus`、`pointsSignIn`、`pointsTasks`、`pointsLogs`、`memberTierMeta`、`upgradeEligibility`、`upgradeApply`。
- `cloudfunctions/payment/payment-callback.js` 已在支付后发放积分与成长值，并在退款时扣回。
- 小程序存在积分页、会员中心、用户页成长进度展示。
- 当前成长值和积分链已经可以运行，但部分会员权益仍偏展示驱动，不是完全闭环的企业级会员制度。

## 5. 前台 / 后台 / 云函数映射

| 业务链 | 小程序入口 | 云函数 / 集合 | 后台工作面 |
| --- | --- | --- | --- |
| 拉新绑定链 | `pages/activity/n-invite`、`pages/distribution/invite-poster`、用户页邀请入口 | `login`、`user`、`users`、`point_logs` | `用户管理`、`经销商管理`、`分支代理` |
| 商城交易链 | 首页、分类、详情、购物车、`pages/order/*` | `products`、`cart`、`order`、`orders`、`cart_items` | `商品管理`、`商品分类`、`订单管理`、`自提门店`、`活动资源` |
| 支付退款链 | 订单确认、订单详情、退款申请/详情/退货物流 | `payment`、`order`、`refunds`、`wallet_logs`、`goods_fund_logs` | `订单管理`、`售后退款`、`财务看板`、`运维监控` |
| 分销佣金链 | `pages/distribution/center`、`team`、`commission-logs`、`withdraw-history` | `distribution`、`commissions`、`withdrawals` | `佣金结算`、`提现审核`、`用户管理`、`财务看板` |
| 货款钱包链 | `pages/wallet/agent-wallet`、`recharge-order` | `distribution`、`payment`、`wallet_accounts`、`wallet_recharge_orders`、`goods_fund_logs` | `财务看板`、`用户管理`、`订单管理` |
| 会员积分成长链 | `pages/points/index`、`pages/user/membership-center`、用户页成长区 | `user`、`payment`、`point_logs`、`configs` | `会员策略`、`用户管理`、`运营参数` |

后台补充说明：

- 当前管理后台路由已经覆盖经营、交易、商品、用户、内容、平台运维六个工作区。
- 已保留的核心页面包括：经营看板、财务看板、运营参数、商品管理、订单管理、自提门店、售后退款、提现审核、佣金结算、用户管理、经销商管理、页面装修、管理员与权限、运维监控、操作日志。

## 6. 完整性矩阵

| 业务域 | 评级 | 判定理由 |
| --- | --- | --- |
| 用户登录与邀请绑定 | 部分完整 | 主字段、邀新入口和绑定关系已存在，但关系兼容查询仍未完全收口。 |
| 商品目录与活动成交 | 部分完整 | 商品、分类、拼团、砍价、限时专享、优惠券均可运行，但部分营销规则仍依赖配置收口。 |
| 下单与支付主链 | 已完整 | 路由审计通过，下单、预支付、支付状态查询和支付后处理均已形成闭环。 |
| 履约与售后退款 | 部分完整 | 退款申请、取消、退货物流、回调处理都已存在，但退款核对还未完全可信。 |
| 分销佣金链 | 部分完整 | 佣金生成、冻结、提现、转货款、后台审核都已存在，但高阶分销规则仍未精确实现。 |
| 代理晋升规则 | 近似实现 | C1、C2 升级条件仍以总消费近似，缺少爆单商品和实物消耗额的精确口径。 |
| 货款钱包链 | 部分完整 | 充值、流水、货款支付、内部退款链都存在，但与更高阶企业结算规则尚未完全闭环。 |
| 会员积分成长链 | 部分完整 | 签到、任务、成长值、积分抵扣、会员页展示均已存在，但权益制度仍偏展示驱动。 |
| 后台运营与审核链 | 已完整 | 经营、商品、交易、用户、内容、权限、运维页面都已存在，并有对应权限入口。 |
| 首页品牌内容配置 | 部分完整 | 首页内容整体可运行，但 `config.homeContent` smoke 明确存在品牌区缺键。 |
| 企业化经营与合规能力 | 缺失 | 未见实名认证、账号注销、年终分红、对公打款与发票完整业务链。 |

## 7. 关键缺口与风险

### 7.1 代理晋升规则仍为近似实现

当前已知问题：

- `C0 -> C1` 仍按 `total_spent >= 299` 近似，不区分“爆单产品”。
- `C1 -> C2` 缺少“实物产品消耗额”的独立统计。

这意味着：

- 代理升级口径与理想业务规则还不完全一致。
- 当前系统可以运营，但不能宣称“代理晋升制度已完全精确实现”。

### 7.2 B3 动销奖励未精确分层

当前已知问题：

- B3 对 B1 下单和 B2 下单应有不同动销比例。
- 当前实现为统一近似值，缺少“按中间层角色决定费率”的精确维度。

这意味着：

- 佣金链可运行。
- 但高阶渠道收益分配仍不够精细，后续容易引发财务口径争议。

### 7.3 退款对账仍存在 `unknown` 通道与微信正式查询缺口

当前已知问题：

- [Refund Reconciliation Audit](../REFUND_RECON_AUDIT.md) 明确记录了 `unknown` 通道退款。
- 微信正式查询当前不可用，缺少 `PAYMENT_WECHAT_MCHID`、`PAYMENT_WECHAT_SERIAL_NO`、`PAYMENT_WECHAT_API_V3_KEY`。
- 历史内部余额退款还需要结合用户余额和管理员操作人工核对。

这意味着：

- 退款流程本身存在。
- 但退款核对真相还没做到完全自动可信。

### 7.4 用户 / 订单 / 退款字段仍有兼容债务

当前已知问题：

- 用户侧仍兼容 `_id`、`_legacy_id`、`balance`、`wallet_balance` 等历史字段。
- 订单 / 退款侧仍兼容 `actual_price`、`pay_channel`、`payment_channel`、`refund_amount` 等历史字段。

这意味着：

- 当前页面和接口能兼容历史数据。
- 但“单一真相字段”还没彻底收口，后续仍有误读风险。

### 7.5 首页品牌区配置键完整性

当前状态：

- [Business Smoke Audit](../audit/generated/BUSINESS_SMOKE_AUDIT.md) 当前显示 `config.homeContent` 通过。
- `brand_zone_enabled`、`brand_zone_title`、`brand_zone_welcome_title`、`brand_endorsements`、`brand_certifications` 已纳入 smoke 校验。

这意味着：

- 商城主交易链不受阻。
- 首页品牌背书配置已有基础 smoke 兜底；后续风险主要在真实内容运营质量，而不是配置键缺失。

### 7.6 实名、账号注销、年终分红、部分企业 / 发票闭环未见完整实现

当前已知问题：

- 未在当前真相源中看到完整实名认证业务链。
- 未在当前真相源中看到完整账号注销业务链。
- 年终业绩分红在历史审计中被明确标记为“尚未实现”。
- 后台虽然已经出现企业字段、营业执照号、税号、发票抬头等资料位，但尚未看到贯穿代理结算、对公打款、发票流转的完整闭环。

这意味着：

- 当前系统已能做分销电商经营。
- 但还不能把自己定义成“企业级渠道财务系统”。

## 8. 收口优先级建议

### 第一优先级：先收口真相字段与退款核对

目标：

- 让用户、订单、退款的主字段彻底单一化。
- 让退款通道、退款结果、内部退款流水具备可审计真相。

建议动作：

- 继续压缩 `id / _id / _legacy_id`、`balance / commission_balance`、`actual_price / pay_amount / total_amount` 的兼容面。
- 补齐微信正式退款查询配置。
- 清理 `unknown` 退款通道记录和人工审单缺口。

### 第二优先级：再收口代理升级与结算精度

目标：

- 让高阶分销规则从“能跑”提升到“可审计、可解释、可长期执行”。

建议动作：

- 为商品引入爆单 / 折扣装 / 实物消耗额等精确标签。
- 将 C1、C2 升级规则从总消费近似改为真实口径。
- 将 B3 动销按中间层角色精确拆分。

### 第三优先级：最后补企业化经营能力

目标：

- 把当前分销商城升级为更完整的企业渠道经营系统。

建议动作：

- 视业务需要补实名认证、账号注销、年终分红。
- 把企业信息、对公打款、税票资料与实际结算链打通。
- 明确这些能力是否属于当前阶段必做，而不是继续停留在历史理想稿。

## 9. 最终判断

当前 `cloud-mp` 的真实状态不是“业务不完整”，而是：

- 基础业务闭环已经完整。
- 分销和资金链已经成型。
- 后台运营链已经成型。
- 真正的短板集中在高阶规则精度、退款核对可信度和企业化经营闭环。

因此，当前最合适的策略不是继续发散业务，而是继续做“全面审计与收口”：

1. 先把真相字段和退款核对收口。
2. 再把代理升级和结算精度收口。
3. 最后再决定是否补企业级能力。
