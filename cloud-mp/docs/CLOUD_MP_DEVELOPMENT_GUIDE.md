# Cloud MP 开发文档

更新日期：2026-04-12

## 1. 文档目的

本文档用于说明 `cloud-mp` 当前代码中的真实功能、主要模块边界和开发入口。

本文件以代码为准，核心依据来自以下入口：

- `miniprogram/app.json`
- `miniprogram/utils/request.js`
- `admin-ui/src/router/index.js`
- `cloudfunctions/admin-api/src/app.js`
- `CLOUDBASE_TARGET_MODEL.md`

如果历史总结、迁移纪要、阶段报告与本文档冲突，以当前代码和本文档后续更新为准。

## 2. 工程结构

- `miniprogram/`
  微信小程序用户端。页面入口、页面交互、用户态体验都在这里。
- `admin-ui/`
  管理后台前端。只负责界面与管理操作发起，不直接写数据库。
- `cloudfunctions/`
  云函数与管理服务后端。小程序侧通过云函数访问业务能力，后台通过 `admin-api` 访问管理能力。
- `cloudbase-seed/`
  CloudBase 正式集合 seed 基线。
- `cloudbase-import/`
  导入 CloudBase 的中间产物。
- `docs/`
  当前工程文档与审计收口资料。

## 3. 运行链路

### 3.1 小程序

小程序页面不直接操作数据库，统一经由 `miniprogram/utils/request.js` 做 REST 风格请求映射，再转成云函数调用。

典型链路：

`page.js -> utils/request.js -> wx.cloud.callFunction -> cloudfunctions/<module>/index.js`

### 3.2 管理后台

管理端前端只访问 `/admin/api/*`，所有管理写操作都走 `cloudfunctions/admin-api/src/app.js`。

典型链路：

`admin-ui view -> admin-ui/src/api/* -> /admin/api/* -> admin-api`

### 3.3 数据模型

当前目标模型约束：

- 用户归属字段以 `openid` 为正式主键语义
- 商品主表为 `products`，规格表为 `skus`
- 订单、退款、佣金、提现、活动、素材、自提站点等都以 CloudBase 文档库为正式运行时数据源

## 4. 当前真实功能地图

### 4.1 小程序用户端功能

#### A. 商城浏览

- 首页：`pages/index/index`
  - 首页页面编排
  - 首页配置、轮播、活动入口、内容位
- 分类页：`pages/category/category`
  - 商品分类浏览
  - 分类商品列表
  - 价格预览提示
- 搜索页：`pages/search/search`
  - 商品搜索
- 商品详情：`pages/product/detail`
  - 商品详情
  - 收藏状态
  - 拼团/砍价活动联动
  - 佣金预览
- 商品评价：`pages/product/reviews`

对应主要云函数：

- `products`
- `config`
- `user`
- `distribution`

#### B. 购物车与下单支付

- 购物车：`pages/cart/cart`
  - 购物车列表
  - 加减数量
  - 勾选结算
  - 推荐商品
- 订单确认：`pages/order/confirm`
  - 地址选择
  - 优惠券可用性
  - 自提可用性
  - 价格计算
- 订单列表/详情：`pages/order/list`、`pages/order/detail`
- 订单取消、确认收货、评价
- 微信支付：通过 `payment` 云函数
- 支付状态同步

对应主要云函数：

- `cart`
- `order`
- `payment`
- `user`

#### C. 售后与履约

- 退款申请：`pages/order/refund-apply`
- 退款列表/详情：`pages/order/refund-list`、`pages/order/refund-detail`
- 物流跟踪：`pages/logistics/tracking`
- 订单评价：`pages/order/review`

对应主要云函数：

- `order`
- `payment`

#### D. 用户中心

- 个人中心：`pages/user/user`
- 编辑资料：`pages/user/edit-profile`
- 收藏/足迹：`pages/user/favorites-footprints`
- 通知中心：`pages/user/notifications`
- 偏好设置：`pages/user/preferences`
- 门户密码申请：`pages/user/portal-password`
- 客服工单列表：`pages/user/ticket-list`
- 客服与隐私页：`pages/user/customer-service`、`pages/privacy/privacy`

对应主要云函数：

- `user`
- `config`

#### E. 会员、成长值、积分、优惠券

- 会员中心：`pages/user/membership-center`
- 成长权益：`pages/user/growth-privileges`
- 会员等级展示：`pages/user/member-levels`
- 积分中心：`pages/points/index`
  - 积分账户
  - 签到
  - 积分任务
  - 积分流水
- 优惠券列表：`pages/coupon/list`
  - 可用/已用/过期券

对应主要云函数：

- `user`
- `config`

#### F. 分销、佣金、提现、货款

- 分销中心：`pages/distribution/center`
- 团队：`pages/distribution/team`、`pages/distribution/team-member`
- 邀请海报：`pages/distribution/invite-poster`
- 商务中心：`pages/distribution/business-center`
- 佣金流水：`pages/distribution/commission-logs`
- 提现历史：`pages/distribution/withdraw-history`
- 钱包页：`pages/wallet/index`
  - 佣金总额
  - 冻结中/待入账/待结算
  - 提现入口
- 代理货款账户：`pages/wallet/agent-wallet`
- 充值订单：`pages/wallet/recharge-order`

对应主要云函数：

- `distribution`
- `user`

特别说明：

- 货款账户与佣金账户是两本账
- `agent_wallet_balance / wallet_balance` 用于货款
- `commission_balance / balance` 用于佣金

#### G. 活动营销

- 活动聚合页：`pages/activity/activity`
- N 邀请页：`pages/activity/n-invite`
- 品牌资讯详情：`pages/activity/brand-news-detail`
- 限定内容位：`pages/activity/limited-spot`
- 拼团：`pages/group/list`、`pages/group/detail`
- 砍价：`pages/slash/list`、`pages/slash/detail`
- 抽奖：`pages/lottery/lottery`

对应主要云函数：

- `config`
- `order`

#### H. 自提站点与核销

- 自提站点地图：`pages/stations/map`
- 我的站点：`pages/stations/my-station`
- 核销页：`pages/pickup/verify`
- 待核销订单：`pages/pickup/orders`
- 提货凭证：`pages/order/pickup-credential`

对应主要云函数：

- `user`
- `order`

### 4.2 管理后台功能

管理后台以 `admin-ui/src/router/index.js` 中的路由为准，当前主要能力如下。

#### A. 经营概览

- `dashboard`
  - 经营看板
  - 近期订单、库存预警、热度榜、待办
- `finance`
  - 财务看板
  - 资金概览、代理业绩、资金池贡献等统计
- `settings`
  - 运营参数
  - 基础信息、小程序配置、提醒配置、运营配置

#### B. 商品与营销

- `products`
  - 商品 CRUD
  - 上下架
  - SKU 管理
- `categories`
  - 分类管理
- `group-buys`
  - 拼团活动管理
- `activities`
  - 营销资源
  - 砍价、抽奖、活动链接、节日配置等
- `coupons`
  - 优惠券管理

#### C. 订单与资金

- `orders`
  - 订单管理
  - 发货
  - 改金额
  - 强制完成/取消
  - 备注
- `logistics`
  - 物流查询
- `pickup-stations`
  - 自提门店与门店成员
- `withdrawals`
  - 提现审核、驳回、完成
- `refunds`
  - 退款审核、驳回、完成
- `commissions`
  - 佣金审核、批量审核、批量驳回

#### D. 用户与渠道

- `users`
  - 用户列表与详情
  - 团队关系
  - 角色调整
  - 佣金、货款、积分、成长值调整
  - 邀请码、会员码、上级关系维护
- `dealers`
  - 经销商管理
- `branch-agents`
  - 分支代理与站点认领
- `n-system`
  - N 路径代理关系

#### E. 内容与设计

- `content`
  - 轮播与图文内容
- `featured-board`
  - 商品推荐榜
- `home-sections`
  - 首页内容位配置
- `materials`
  - 素材与素材分组
  - 上传与存储配置
- `reviews`
  - 评论管理与回复
- `mass-message`
  - 群发消息
- `splash`
  - 开屏配置

#### F. 业务策略

- `membership`
  - 会员等级、商业策略、成长值、购买等级等配置

#### G. 平台与运维

- `admins`
  - 管理员账号与权限
- `ops-monitor`
  - 运维监控
- `logs`
  - 操作日志
- `system-config`
  - 系统配置、配置历史、索引工具、缓存刷新、调试接口

### 4.3 后端云函数职责

#### `login`

- 小程序登录
- 新用户创建
- 邀请码绑定
- 新人券发放

#### `user`

- 资料
- 地址
- 收藏
- 通知
- 优惠券
- 钱包与积分
- 升级申请
- 站点权限

#### `products`

- 商品列表
- 商品详情
- 分类
- 搜索
- 评论

#### `cart`

- 购物车增删改查

#### `order`

- 创建订单
- 订单列表/详情
- 取消、确认、评价
- 退款申请/详情/取消/回寄
- 拼团、砍价、自提核销、物流

#### `payment`

- 预支付
- 支付状态查询
- 支付回调
- 退款

#### `config`

- 首页页面编排
- 小程序配置
- 轮播/版块/活动配置
- 规则、问卷、节日配置、品牌资讯等内容接口

#### `distribution`

- 分销中心
- 团队
- 佣金日志
- 提现
- 代理货款账户
- 邀请码海报
- 升级相关能力

#### `admin-api`

- 管理后台统一 API 入口
- 覆盖商品、订单、用户、审核、内容、策略、权限、日志、运维等管理能力

#### 定时任务

- `order-timeout-cancel`
  超时未支付订单取消
- `order-auto-confirm`
  自动确认收货
- `commission-deadline-process`
  佣金到期处理

## 5. 当前关键集合

按开发最常见的业务域，可重点关注这些集合：

- 用户域：`users`
- 商品域：`products`、`skus`、`categories`
- 交易域：`cart_items`、`orders`、`refunds`、`reviews`
- 分销域：`commissions`、`withdrawals`
- 内容域：`configs`、`banners`、`contents`、`materials`、`material_groups`
- 活动域：`group_activities`、`group_orders`、`slash_activities`、`slash_records`、`lottery_configs`、`lottery_prizes`、`lottery_records`
- 站点域：`stations`
- 钱包域：`wallet_accounts`、`wallet_logs`、`wallet_recharge_orders`、`wallet_recharge_configs`

## 6. 开发时的推荐入口

### 6.1 新增或修改小程序功能

建议按这个顺序追：

1. 先看页面：`miniprogram/pages/**`
2. 再看请求映射：`miniprogram/utils/request.js`
3. 再看对应云函数：`cloudfunctions/<module>/index.js`
4. 最后看相关集合和共享模块

### 6.2 新增或修改管理后台功能

建议按这个顺序追：

1. 先看路由：`admin-ui/src/router/index.js`
2. 再看页面：`admin-ui/src/views/**`
3. 再看管理接口：`cloudfunctions/admin-api/src/app.js`
4. 最后看相关集合和返回结构

### 6.3 新增配置类能力

如果是首页编排、活动开关、小程序配置、提醒配置等：

1. 优先检查 `config` 云函数是否已有读接口
2. 检查 `admin-api` 是否已有管理写接口
3. 统一落到 `configs` 或 `admin_singletons`

## 7. 当前开发注意事项

- 用户主身份以 `openid` 为准
- `user_id / id / _legacy_id` 仍存在兼容逻辑，不应继续扩散成新的主绑定键
- 佣金账户与代理货款账户必须分开理解
- 管理后台写操作应继续通过 `admin-api`，不要让前端直接写数据库
- 写文档或新增功能前，应先核对本文件、请求映射、路由表和真实云函数入口

## 8. 建议的文档维护方式

后续如果新增功能，请优先同步更新以下任一入口：

- 小程序新增页面：更新本文件“4.1 小程序用户端功能”
- 管理后台新增路由：更新本文件“4.2 管理后台功能”
- 新增云函数 action：更新本文件“4.3 后端云函数职责”

这样可以避免再次回到“功能存在，但没人知道入口在哪”的状态。
