# Cloud MP 开发指南

更新日期：2026-04-18

## 1. 目的

本文件用于说明 `cloud-mp` 当前代码里的真实结构、主要功能边界和开发入口。

如果阶段性总结、迁移快照、旧完成度报告与本文件冲突，以当前代码和本文件为准。

## 2. 当前真相源

本工程当前应优先参考：

- `README.md`
- `docs/CLOUD_MP_DEVELOPMENT_GUIDE.md`
- `docs/CLOUDBASE_RELEASE_RUNBOOK.md`
- `升级.md`

## 3. 工程结构

- `miniprogram/`
  微信小程序用户端
- `admin-ui/`
  管理后台前端
- `cloudfunctions/`
  业务云函数与管理服务
- `cloudbase-seed/`
  CloudBase 标准化 seed 基线
- `cloudbase-import/`
  CloudBase 导入包
- `docs/`
  当前文档、审计和运行资料
- `mysql/`
  迁移输入与历史对照

## 4. 运行链路

### 4.1 小程序

小程序不直接写数据库，统一通过请求封装调用云函数。

当前主链路：

`page -> miniprogram/utils/request.js -> miniprogram/utils/requestRoutes.js -> wx.cloud.callFunction -> cloudfunctions/<module>/index.js`

说明：

- `request.js` 负责请求适配与统一调用
- `requestRoutes.js` 是 REST 风格路径到云函数 action 的单一真相源

### 4.2 管理后台

管理后台所有正式读写都经过 `/admin/api/*`。

当前主链路：

`admin-ui page -> admin-ui/src/api/* -> /admin/api/* -> cloudfunctions/admin-api`

### 4.3 数据源

当前正式运行时主数据源是 CloudBase。

补充说明：

- `mysql/` 仍然保留，但仅作为迁移输入、字段映射和历史资产
- 当前代码中仍可见 MySQL 兼容路径，但不应把它视为推荐运行模式

## 5. 小程序功能地图

页面入口以 `miniprogram/app.json` 为准。

### 5.1 主包页面

- 启动与首页：`pages/splash/splash`、`pages/index/index`
- 商品与活动：`pages/category/category`、`pages/activity/*`、`pages/product/detail`、`pages/search/search`
- 交易入口：`pages/cart/cart`
- 用户中心：`pages/user/*`
- 其他：`pages/privacy/privacy`

### 5.2 分包页面

- 订单：`pages/order/*`
- 门店：`pages/stations/*`
- 核销：`pages/pickup/*`
- 地址：`pages/address/*`
- 物流：`pages/logistics/*`
- 分销：`pages/distribution/*`
- 钱包：`pages/wallet/*`
- 积分：`pages/points/*`
- 抽奖：`pages/lottery/*`
- 优惠券：`pages/coupon/*`
- 砍价：`pages/slash/*`
- 拼团：`pages/group/*`

## 6. 管理后台功能地图

后台路由以 `admin-ui/src/router/index.js` 为准。

### 6.1 经营与策略

- 经营看板
- 财务看板
- 运营参数
- 会员策略

### 6.2 商品与营销

- 商品管理
- 商品分类
- 拼团活动
- 限时商品
- 活动资源
- 优惠券管理

### 6.3 交易与履约

- 订单管理
- 自提门店
- 售后退款
- 押金订单
- 提现审核
- 佣金结算

### 6.4 用户与渠道

- 用户管理
- 经销商管理
- 分支代理

### 6.5 页面与内容

- 内容资源
- 页面装修
- 素材管理
- 评论管理
- 群发消息

### 6.6 平台与运维

- 管理员与权限
- 运维监控
- 操作日志

## 7. 云函数职责

### `login`

- 小程序登录
- 新用户初始化
- 邀请关系接入

### `user`

- 用户资料、地址、通知、优惠券、偏好、钱包、积分、升级

### `products`

- 商品列表、详情、搜索、分类、评论

### `cart`

- 购物车增删改查

### `order`

- 下单、订单详情、取消、确认、评价
- 退款申请、退款详情、回寄、取消退款
- 拼团、砍价、自提核销、物流

### `payment`

- 预支付
- 支付状态查询
- 支付回调
- 退款状态同步与支付后处理

### `config`

- 首页编排
- 小程序配置
- 活动、规则、内容、问卷、品牌资讯

### `distribution`

- 分销中心
- 团队
- 佣金日志
- 提现
- 钱包与货款相关能力

### `admin-api`

- 管理后台统一网关
- 用户、商品、订单、审核、内容、策略、权限、日志、运维接口

### 定时任务

- `order-timeout-cancel`
- `order-auto-confirm`
- `commission-deadline-process`

## 8. 开发推荐入口

### 改小程序功能

1. 看页面：`miniprogram/pages/**`
2. 看请求映射：`miniprogram/utils/requestRoutes.js`
3. 看请求封装：`miniprogram/utils/request.js`
4. 看对应云函数：`cloudfunctions/<module>/index.js`

### 改后台功能

1. 看路由：`admin-ui/src/router/index.js`
2. 看 API：`admin-ui/src/api/**`
3. 看页面：`admin-ui/src/views/**`
4. 看后台实现：`cloudfunctions/admin-api/src/app.js`

### 改发布或环境问题

1. 看 `docs/CLOUDBASE_RELEASE_RUNBOOK.md`
2. 看 `docs/release/README.md`
3. 看 `docs/production/*.md`

## 9. 当前高风险点

截至 2026-04-18，需要特别注意：

- `admin-api` 仍然是超大入口文件
- `directPatchDocument()` 还没有和 `collectionPrefix` 约定完全收口
- `saveCollection()` 仍然存在整集合写回风险
- 冷启动数据预热仍需要避免 fail-open
- 文档层仍有不少旧阶段叙述，需要逐步收口

## 10. 开发约定

1. 小程序接口路由真相源是 `requestRoutes.js`，不要再把路径表散落回 `request.js`。
2. 管理端正式写操作继续统一走 `admin-api`。
3. 不再把 MySQL 当成当前生产主数据源来描述或设计。
4. 文档更新时，优先同步 `README.md`、本文件、`docs/CLOUDBASE_RELEASE_RUNBOOK.md`、`升级.md`。
