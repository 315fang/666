# 管理后台使用说明书

更新日期：2026-04-15  
适用范围：`cloud-mp/admin-ui` 当前实际保留页面  
适用对象：运营、客服、财务、仓储、管理员、后续后台维护人员

## 1. 文档定位

这份文档是当前小程序管理后台的正式使用说明书。

它解决两个问题：

1. 后台使用人员要知道“现在某件事该去哪个页面做”。
2. 后台维护人员要知道“菜单、权限、页面职责现在到底是什么”。

本文件只描述当前真实保留页面，不沿用历史阶段下线入口、旧配置页和旧命名。

当前真相来源：

- 管理后台路由：[admin-ui/src/router/index.js](/C:/Users/21963/WeChatProjects/zz/cloud-mp/admin-ui/src/router/index.js:1)
- 默认角色权限预设：[admin-ui/src/config/adminRolePresets.js](/C:/Users/21963/WeChatProjects/zz/cloud-mp/admin-ui/src/config/adminRolePresets.js:1)
- 工程总入口说明：[README.md](/C:/Users/21963/WeChatProjects/zz/cloud-mp/README.md)

## 2. 后台概览

### 2.1 后台当前包含哪些工作区

当前后台按导航分为 6 个一级工作区：

| 工作区 | 主要页面 |
| --- | --- |
| 经营与策略 | 经营看板、财务看板、运营参数、会员策略 |
| 交易与履约 | 订单管理、自提门店、售后退款、押金订单、提现审核、佣金结算 |
| 商品与营销 | 商品管理、商品分类、拼团活动、活动资源、优惠券管理 |
| 用户与渠道 | 用户管理、经销商管理、分支代理 |
| 页面与内容 | 页面装修、内容资源、素材管理、评论管理、群发消息 |
| 平台与运维 | 管理员与权限、运维监控、操作日志 |

### 2.2 后台当前实际页面数量

当前后台实际保留：

- 1 个登录页
- 26 个业务页
- 合计 27 个页面入口

### 2.3 先记住的三条使用原则

1. 看板页主要用来“看”，业务处理页主要用来“改”。
2. 订单、退款、提现、佣金、用户余额都属于高风险动作，操作前必须二次核对。
3. 找不到入口时，不要凭旧文档猜，先按本文件的菜单索引查。

## 3. 登录、权限与导航

### 3.1 如何登录

入口：

- 路由：`/login`
- 页面文件：[admin-ui/src/views/login/index.vue](/C:/Users/21963/WeChatProjects/zz/cloud-mp/admin-ui/src/views/login/index.vue:1)

当前后台通过账号密码登录。登录后右上角头像菜单可执行：

- 修改密码
- 退出登录

### 3.2 菜单为什么有人看得到、有人看不到

后台是否显示某个页面，取决于页面绑定的 `permission`。

典型示例：

- `orders`：订单管理
- `refunds`：售后退款
- `withdrawals`：提现审核
- `commissions`：佣金结算
- `content`：内容资源、页面装修、评论管理
- `settings_manage`：运营参数
- `admins`：管理员与权限
- `super_admin`：运维监控

如果某个同事登录后看不到页面，优先检查：

1. 管理员账号是否已登录成功。
2. 当前账号的权限是否包含目标页面对应的 `permission`。
3. 是否被分配成了过窄的默认角色。

### 3.3 默认角色大致能做什么

当前默认角色预设如下：

| 角色 | 典型定位 | 典型权限范围 |
| --- | --- | --- |
| `admin` | 全局管理员 | 看板、商品、订单、用户、内容、经销商、佣金、设置、日志、部分高风险能力 |
| `operator` | 运营 | 看板、商品、订单、内容、素材、通知、统计 |
| `finance` | 财务 | 看板、订单、提现、佣金、统计 |
| `customer_service` | 客服 | 看板、订单、退款、用户、通知 |
| `warehouse` | 仓储 | 订单、自提门店 |
| `designer` | 设计/内容 | 内容、素材 |
| `channel_manager` | 渠道经理 | 看板、用户、经销商、B1定向邀约、日志、通知 |

注意：

- 默认角色只是预设，不等于最终授权结果。
- 某些高风险能力不是角色默认就开，例如订单改价、强制取消、余额调整等。

### 3.4 顶部快捷入口

当前顶部快捷入口改为按权限动态展示。

默认优先级如下：

- `待发货订单`
- `待退款审核`
- `页面装修`
- `活动资源`
- `运营参数`

系统会按优先级挑选当前账号有权限的前 3 个入口展示。它们适合做日常高频跳转，但不替代完整菜单。

### 3.5 数据刷新说明

当前后台页面按数据一致性分为两类：

| 类型 | 页面 | 行为 |
| --- | --- | --- |
| 强一致页面 | 订单、售后退款、提现审核、佣金结算、用户管理 | 默认读取最新数据；页面会显示“最后同步时间”；写操作成功后会返回最新状态 |
| 弱一致页面 | 素材、Banner、部分配置预览、普通看板 | 允许短时缓存；如发现数据延迟可手动刷新 |

管理员使用建议：

1. 看到“最后同步时间”较早时，可先点页面右上角刷新。
2. 对订单、退款、提现、佣金、余额调整等高风险动作，不要依赖浏览器停留页的旧数据。
3. 若运维页显示存在“脏集合”或“待 flush 集合”，优先让管理员确认当前后台是否刚完成大量写操作。

## 4. 按角色找入口

### 4.1 运营同事常用入口

| 你要做什么 | 去哪里 |
| --- | --- |
| 看今日订单、销售、低库存 | `经营与策略 > 经营看板` |
| 看 GMV、基金池、代理贡献 | `经营与策略 > 财务看板` |
| 改首页弹窗、品牌、精选榜、开屏 | `页面与内容 > 页面装修` |
| 改 Banner、图文、文章、公告 | `页面与内容 > 内容资源` |
| 配活动资源、抽奖、链接、节日配置 | `商品与营销 > 活动资源` |
| 发优惠券、配自动发券 | `商品与营销 > 优惠券管理` |

### 4.2 客服同事常用入口

| 你要做什么 | 去哪里 |
| --- | --- |
| 查订单、看状态、看备注、看物流 | `交易与履约 > 订单管理` |
| 审核退款、查看退款去向 | `交易与履约 > 售后退款` |
| 查用户资料、团队、等级、状态 | `用户与渠道 > 用户管理` |
| 发通知或群发消息 | `页面与内容 > 群发消息` |

### 4.3 财务同事常用入口

| 你要做什么 | 去哪里 |
| --- | --- |
| 看整体财务盘面 | `经营与策略 > 财务看板` |
| 审核提现 | `交易与履约 > 提现审核` |
| 查看并审批佣金流水 | `交易与履约 > 佣金结算` |
| 检查退款执行结果 | `交易与履约 > 售后退款` |

### 4.4 仓储或履约同事常用入口

| 你要做什么 | 去哪里 |
| --- | --- |
| 搜索待发货订单 | `交易与履约 > 订单管理` |
| 执行发货、补录物流单号 | `交易与履约 > 订单管理` |
| 管理自提门店和核销成员 | `交易与履约 > 自提门店` |

### 4.5 管理员常用入口

| 你要做什么 | 去哪里 |
| --- | --- |
| 改运营参数和小程序配置 | `经营与策略 > 运营参数` |
| 管理后台账号和权限 | `平台与运维 > 管理员与权限` |
| 查日志和排查异常 | `平台与运维 > 操作日志` |
| 看运行状态和任务摘要 | `平台与运维 > 运维监控` |

## 5. 菜单与页面说明

### 5.1 经营与策略

#### 5.1.1 经营看板

- 路由：`/dashboard`
- 权限：`dashboard`
- 页面文件：[admin-ui/src/views/dashboard/index.vue](/C:/Users/21963/WeChatProjects/zz/cloud-mp/admin-ui/src/views/dashboard/index.vue:1)

主要用途：

- 看今日订单、今日销售额、累计用户、待发货数
- 看近期订单
- 看低库存商品
- 看系统状态摘要

使用建议：

- 它是“总览页”，不是业务处理页。
- 看到异常后，应跳到对应业务页继续处理。

#### 5.1.2 财务看板

- 路由：`/finance`
- 权限：`statistics`
- 页面文件：[admin-ui/src/views/finance/index.vue](/C:/Users/21963/WeChatProjects/zz/cloud-mp/admin-ui/src/views/finance/index.vue:1)

主要用途：

- 看 GMV、佣金、提现、基金池、分红
- 看代理贡献、团队贡献、欠款信息
- 处理代理欠款相关操作

风险提示：

- 欠款处理会影响资金口径，必须填写明确理由。

#### 5.1.3 运营参数

- 路由：`/settings`
- 权限：`settings_manage`
- 页面文件：[admin-ui/src/views/settings/index.vue](/C:/Users/21963/WeChatProjects/zz/cloud-mp/admin-ui/src/views/settings/index.vue:1)

主要用途：

- 维护后台基础配置
- 维护小程序配置
- 维护运营参数与告警参数

风险提示：

- 这里的配置会影响多个页面和云端行为。
- 不清楚字段含义时，不要直接改动支付、物流、代理、展示开关。

#### 5.1.4 会员策略

- 路由：`/membership`
- 权限：`statistics`
- 页面文件：[admin-ui/src/views/membership/index.vue](/C:/Users/21963/WeChatProjects/zz/cloud-mp/admin-ui/src/views/membership/index.vue:1)

主要用途：

- 配会员等级
- 配成长值规则
- 配积分等级
- 配折扣相关规则

### 5.2 交易与履约

#### 5.2.1 订单管理

- 路由：`/orders`
- 权限：`orders`
- 页面文件：[admin-ui/src/views/orders/index.vue](/C:/Users/21963/WeChatProjects/zz/cloud-mp/admin-ui/src/views/orders/index.vue:1)

主要用途：

- 按订单号、用户、商品、状态检索订单
- 查看订单详情、支付方式、收货信息、物流信息
- 发货
- 查询物流轨迹
- 改价
- 写备注
- 修复履约链
- 强制完成
- 强制取消

适用角色：

- 客服
- 仓储
- 财务
- 管理员

注意事项：

- 订单页是订单主工作台，发货、履约、物流、强制操作都优先在这里做。
- 改价、强制取消、强制完成都属于高风险能力，不应交给普通岗位账号。

#### 5.2.2 自提门店

- 路由：`/pickup-stations`
- 权限：`pickup_stations`
- 页面文件：[admin-ui/src/views/pickup-stations/index.vue](/C:/Users/21963/WeChatProjects/zz/cloud-mp/admin-ui/src/views/pickup-stations/index.vue:1)

主要用途：

- 新增、编辑、禁用自提门店
- 绑定门店成员
- 管理自提核销相关基础信息

#### 5.2.3 售后退款

- 路由：`/refunds`
- 权限：`refunds`
- 页面文件：[admin-ui/src/views/refunds/index.vue](/C:/Users/21963/WeChatProjects/zz/cloud-mp/admin-ui/src/views/refunds/index.vue:1)

主要用途：

- 查看退款申请
- 审核通过
- 审核拒绝
- 执行退款
- 查看支付方式、退款去向、退款明细

当前页面状态含义：

| 状态 | 含义 |
| --- | --- |
| `pending` | 待审核 |
| `approved` | 已审核通过，待执行退款 |
| `processing` | 已提交退款，等待微信或内部补偿链收口 |
| `completed` | 退款已完成 |
| `failed` | 退款失败，可重试 |
| `rejected` | 审核已拒绝 |

重要说明：

1. “退款中”不一定代表钱没退，只代表系统还没收口到终态。
2. 当前代码已支持在 `processing` 状态下手动执行“同步状态”。
3. 如果线上环境暂时还看不到“同步状态”按钮，说明后台还没部署到当前版本。

#### 5.2.4 提现审核

- 路由：`/withdrawals`
- 权限：`withdrawals`
- 页面文件：[admin-ui/src/views/withdrawals/index.vue](/C:/Users/21963/WeChatProjects/zz/cloud-mp/admin-ui/src/views/withdrawals/index.vue:1)

主要用途：

- 查看提现申请
- 审核通过
- 审核拒绝
- 标记打款完成

风险提示：

- 拒绝提现会回退余额，必须确认理由。
- 标记完成前要确认真实打款已经完成。

#### 5.2.5 佣金结算

- 路由：`/commissions`
- 权限：`commissions`
- 页面文件：[admin-ui/src/views/commissions/index.vue](/C:/Users/21963/WeChatProjects/zz/cloud-mp/admin-ui/src/views/commissions/index.vue:1)

主要用途：

- 查看佣金流水
- 查看来源订单、来源用户、佣金层级
- 审批
- 驳回
- 批量审批
- 批量驳回

说明：

- 这里处理的是佣金流水，不是提现申请。
- 退款完成后，相关未结佣金应转为 `cancelled`。

### 5.3 商品与营销

#### 5.3.1 商品管理

- 路由：`/products`
- 权限：`products`
- 页面文件：[admin-ui/src/views/products/index.vue](/C:/Users/21963/WeChatProjects/zz/cloud-mp/admin-ui/src/views/products/index.vue:1)

主要用途：

- 新增、编辑商品
- 调整价格、库存、上下架
- 配商品图、规格和佣金参数
- 配代理成本价与分销相关字段

风险提示：

- 成本价、佣金价、角色价会影响履约利润和分销口径，不能随意改。

#### 5.3.2 商品分类

- 路由：`/categories`
- 权限：`products`
- 页面文件：[admin-ui/src/views/categories/index.vue](/C:/Users/21963/WeChatProjects/zz/cloud-mp/admin-ui/src/views/categories/index.vue:1)

主要用途：

- 新增、编辑、排序、删除分类

#### 5.3.3 拼团活动

- 路由：`/group-buys`
- 权限：`products`
- 页面文件：[admin-ui/src/views/group-buy/index.vue](/C:/Users/21963/WeChatProjects/zz/cloud-mp/admin-ui/src/views/group-buy/index.vue:1)

主要用途：

- 新增、编辑拼团活动
- 绑定拼团商品和活动规则

#### 5.3.4 活动资源

- 路由：`/activities`
- 权限：`products`
- 页面文件：[admin-ui/src/views/activities/index.vue](/C:/Users/21963/WeChatProjects/zz/cloud-mp/admin-ui/src/views/activities/index.vue:1)

主要用途：

- 管理砍价活动
- 管理抽奖奖品
- 管理节日活动配置
- 管理活动链接配置

注意事项：

- 它是“活动资源工作台”，不是首页装修页。
- 首页弹窗、品牌、精选榜、开屏统一去 `页面装修`。

#### 5.3.5 优惠券管理

- 路由：`/coupons`
- 权限：`products`
- 页面文件：[admin-ui/src/views/coupons/index.vue](/C:/Users/21963/WeChatProjects/zz/cloud-mp/admin-ui/src/views/coupons/index.vue:1)

主要用途：

- 新建、编辑、删除优惠券
- 发券
- 配自动发券规则
- 查看发券预览和相关码图

### 5.4 用户与渠道

#### 5.4.1 用户管理

- 路由：`/users`
- 权限：`users`
- 页面文件：[admin-ui/src/views/users/index.vue](/C:/Users/21963/WeChatProjects/zz/cloud-mp/admin-ui/src/views/users/index.vue:1)

主要用途：

- 搜索用户
- 查看用户详情和团队关系
- 改角色、状态、上级关系、备注
- 调整货款、佣金、积分、成长值

风险提示：

- 这是后台最敏感的页面之一。
- 用户角色、上级关系、余额类调整都必须有明确业务理由。

#### 5.4.2 经销商管理

- 路由：`/dealers`
- 权限：`dealers`
- 页面文件：[admin-ui/src/views/dealers/index.vue](/C:/Users/21963/WeChatProjects/zz/cloud-mp/admin-ui/src/views/dealers/index.vue:1)

主要用途：

- 看经销商资料
- 审核经销商
- 调整经销商等级

#### 5.4.3 分支代理

- 路由：`/branch-agents`
- 权限：`dealers`
- 页面文件：[admin-ui/src/views/branch-agents/index.vue](/C:/Users/21963/WeChatProjects/zz/cloud-mp/admin-ui/src/views/branch-agents/index.vue:1)

主要用途：

- 管理分支代理策略
- 审核分支代理相关数据

### 5.5 页面与内容

#### 5.5.1 内容资源

- 路由：`/content`
- 权限：`content`
- 页面文件：[admin-ui/src/views/content/index.vue](/C:/Users/21963/WeChatProjects/zz/cloud-mp/admin-ui/src/views/content/index.vue:1)

主要用途：

- 管理 Banner
- 管理图文内容
- 管理部分首页或分类页展示素材

#### 5.5.2 页面装修

- 路由：`/home-sections`
- 权限：`content`
- 页面文件：[admin-ui/src/views/home-sections/index.vue](/C:/Users/21963/WeChatProjects/zz/cloud-mp/admin-ui/src/views/home-sections/index.vue:1)

这是首页体验总入口，负责：

- 首页弹窗广告
- 首页底部品牌专区
- 商品分组编排
- 开屏动画

如果你要改的是首页视觉层，优先先到这里，不要去活动资源里找。
其中“品牌背书”标签页现在真正负责首页最底部品牌专区：专区标题、封面、Welcome 文案、3 个入口卡、企业认证和企业介绍都在这里。

#### 5.5.3 素材管理

- 路由：`/materials`
- 权限：`materials`
- 页面文件：[admin-ui/src/views/materials/index.vue](/C:/Users/21963/WeChatProjects/zz/cloud-mp/admin-ui/src/views/materials/index.vue:1)

主要用途：

- 上传素材
- 分组管理素材
- 移动、整理素材

#### 5.5.4 评论管理

- 路由：`/reviews`
- 权限：`content`
- 页面文件：[admin-ui/src/views/reviews/index.vue](/C:/Users/21963/WeChatProjects/zz/cloud-mp/admin-ui/src/views/reviews/index.vue:1)

主要用途：

- 查看评论
- 编辑评论

#### 5.5.5 群发消息

- 路由：`/mass-message`
- 权限：`notification`
- 页面文件：[admin-ui/src/views/mass-message/index.vue](/C:/Users/21963/WeChatProjects/zz/cloud-mp/admin-ui/src/views/mass-message/index.vue:1)

主要用途：

- 创建群发
- 预览群发
- 发送消息

风险提示：

- 群发属于高风险通知操作，不能拿生产用户做测试。

### 5.6 平台与运维

#### 5.6.1 管理员与权限

- 路由：`/admins`
- 权限：`admins`
- 页面文件：[admin-ui/src/views/admins/index.vue](/C:/Users/21963/WeChatProjects/zz/cloud-mp/admin-ui/src/views/admins/index.vue:1)

主要用途：

- 新增、编辑管理员
- 分配权限
- 重置密码
- 删除账号

风险提示：

- 超级管理员权限不要随意调整。
- 新成员应从最小权限开始授权。

#### 5.6.2 运维监控

- 路由：`/ops-monitor`
- 权限：`super_admin`
- 页面文件：[admin-ui/src/views/ops-monitor/index.vue](/C:/Users/21963/WeChatProjects/zz/cloud-mp/admin-ui/src/views/ops-monitor/index.vue:1)

主要用途：

- 看数据库与实例状态
- 看定时任务状态
- 看内存、运行时长、异常摘要
- 看后台缓存健康状态（缓存集合数、脏集合、待 flush、最近刷新时间）
- 查订单链路（订单 / 退款 / 佣金 / 钱包流水 / 审计日志）
- 查用户资金链路（用户 / 订单 / 佣金 / 提现 / 钱包流水）
- 查配置来源（singleton / configs / app_configs）

#### 5.6.3 操作日志

- 路由：`/logs`
- 权限：`logs`
- 页面文件：[admin-ui/src/views/logs/index.vue](/C:/Users/21963/WeChatProjects/zz/cloud-mp/admin-ui/src/views/logs/index.vue:1)

主要用途：

- 查询后台操作日志
- 导出日志
- 查看变更细节

## 6. 标准操作流程

### 6.1 商品上新

1. 进入 `商品与营销 > 商品管理`。
2. 新建商品并填写基础信息、价格、库存、规格、主图。
3. 如果商品参与分销或代理履约，确认佣金和成本字段。
4. 保存后检查是否需要补分类。
5. 若首页需要展示，再去 `页面装修` 或 `内容资源` 配置曝光位。

### 6.2 调整首页内容

如果你要改的是：

- Banner：去 `内容资源`
- 首页弹窗：去 `页面装修`
- 品牌专区：去 `页面装修 > 品牌背书`
- 首页商品分组：去 `页面装修 > 商品分组编排`
- 开屏动画：去 `页面装修`

操作建议：

1. 先准备素材。
2. 再进对应页面改配置。
3. 修改后到小程序端做一次实际查看。

### 6.3 订单发货

1. 进入 `交易与履约 > 订单管理`。
2. 搜索订单。
3. 核对收货信息、商品、付款状态。
4. 点击发货。
5. 填写物流公司和物流单号。
6. 发货后如需确认轨迹，回到订单详情查看物流。

### 6.4 退款审核与执行

1. 进入 `交易与履约 > 售后退款`。
2. 先看订单号、用户、退款金额、退款去向。
3. 确认符合规则后执行“通过”或“拒绝”。
4. 对已通过记录，执行“确认退款”。
5. 如果状态进入 `processing`，说明退款链还未完全收口。
6. 若用户确认钱已到账但后台仍是 `processing`，优先尝试“同步状态”。
7. 同步后仍不正常，再交由管理员排查回调链。

### 6.5 提现审核

1. 进入 `交易与履约 > 提现审核`。
2. 先核对用户、金额、账户信息。
3. 确认通过则审核通过。
4. 实际打款后再标记完成。
5. 若拒绝，必须填清晰原因。

### 6.6 佣金审批

1. 进入 `交易与履约 > 佣金结算`。
2. 查看收益人、来源订单、佣金额、层级。
3. 仅对符合规则记录执行审批。
4. 批量审批前先用筛选条件缩小范围。

### 6.7 用户调整

1. 进入 `用户与渠道 > 用户管理`。
2. 搜索目标用户。
3. 打开详情或操作面板。
4. 先确认调整类型是角色、状态、上级，还是货款、佣金、积分、成长值。
5. 填写明确原因再执行。

## 7. 高风险操作清单

以下页面和操作必须由有经验的人员执行：

- `订单管理`：改价、强制取消、强制完成、履约修复
- `售后退款`：确认退款、重试退款、状态同步
- `提现审核`：拒绝、完成打款
- `佣金结算`：批量审批、批量驳回
- `用户管理`：余额调整、角色调整、上级关系调整
- `管理员与权限`：权限配置、重置密码、删除管理员
- `群发消息`：正式发送
- `运营参数`：支付、物流、代理、展示类全局参数调整

执行原则：

1. 先核对对象。
2. 先确认影响范围。
3. 先写清原因。
4. 再执行不可逆动作。

## 8. 常见问题

### 8.1 为什么我登录后看不到某个菜单

常见原因：

- 权限不够
- 角色预设过窄
- 当前页面要求更高权限，例如 `super_admin`

排查顺序：

1. 先确认账号是否登录正常。
2. 再确认页面对应的 `permission`。
3. 再去 `管理员与权限` 检查授权。

### 8.2 为什么退款已经到了，后台还是退款中

这通常不是页面缓存，而是退款成功后的状态回写没有收口。

先做：

1. 到 `售后退款` 查看该单的微信退款状态。
2. 若页面有“同步状态”按钮，点击同步。
3. 若没有该按钮，说明当前环境还没部署到支持状态同步的版本。

### 8.3 为什么订单不能发货

常见原因：

- 订单状态不允许发货
- 订单还没付款
- 当前账号没有订单操作权限

### 8.4 为什么物流查不到

常见原因：

- 还没录入物流单号
- 物流公司错误
- 第三方轨迹暂时未返回

### 8.5 为什么看板有数据但我不能操作

看板页和处理页权限可能不同。

例如：

- 能看财务看板，不代表能做提现审核
- 能看订单列表，不代表能强制取消订单

## 9. 已收口或不要再找的旧入口

以下旧入口不要再继续作为当前后台依据：

- 独立 `物流查询` 页
- 独立 `商品推荐榜` 页
- 独立 `开屏动画` 页
- 模糊的旧 `系统配置` 页

这些能力要么已经并入真实页面，要么已经下线，不应继续写进培训材料。

## 10. 维护要求

后续如果新增、下线、并页、改权限，必须同时更新本文件。

更新时遵守：

1. 菜单、路由、权限，以 `admin-ui/src/router/index.js` 为准。
2. 默认角色说明，以 `admin-ui/src/config/adminRolePresets.js` 为准。
3. 不根据历史阶段文档补充“想当然”的功能。
4. 页面没有真实能力，就不要写进说明书。

## 11. 当前页面索引总表

| 分组 | 页面 | 路由 | 权限 |
| --- | --- | --- | --- |
| 登录 | 登录 | `/login` | - |
| 经营与策略 | 经营看板 | `/dashboard` | `dashboard` |
| 经营与策略 | 财务看板 | `/finance` | `statistics` |
| 经营与策略 | 运营参数 | `/settings` | `settings_manage` |
| 经营与策略 | 会员策略 | `/membership` | `statistics` |
| 交易与履约 | 订单管理 | `/orders` | `orders` |
| 交易与履约 | 自提门店 | `/pickup-stations` | `pickup_stations` |
| 交易与履约 | 售后退款 | `/refunds` | `refunds` |
| 交易与履约 | 押金订单 | `/deposit-orders` | `refunds` |
| 交易与履约 | 提现审核 | `/withdrawals` | `withdrawals` |
| 交易与履约 | 佣金结算 | `/commissions` | `commissions` |
| 商品与营销 | 商品管理 | `/products` | `products` |
| 商品与营销 | 商品分类 | `/categories` | `products` |
| 商品与营销 | 拼团活动 | `/group-buys` | `products` |
| 商品与营销 | 活动资源 | `/activities` | `products` |
| 商品与营销 | 优惠券管理 | `/coupons` | `products` |
| 用户与渠道 | 用户管理 | `/users` | `users` |
| 用户与渠道 | 经销商管理 | `/dealers` | `dealers` |
| 用户与渠道 | 分支代理 | `/branch-agents` | `dealers` |
| 页面与内容 | 内容资源 | `/content` | `content` |
| 页面与内容 | 页面装修 | `/home-sections` | `content` |
| 页面与内容 | 素材管理 | `/materials` | `materials` |
| 页面与内容 | 评论管理 | `/reviews` | `content` |
| 页面与内容 | 群发消息 | `/mass-message` | `notification` |
| 平台与运维 | 管理员与权限 | `/admins` | `admins` |
| 平台与运维 | 运维监控 | `/ops-monitor` | `super_admin` |
| 平台与运维 | 操作日志 | `/logs` | `logs` |
