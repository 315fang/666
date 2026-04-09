# 2026-04-08 CloudBase 运行态审计

## 1. 审计范围

本次审计只检查当前最关键的三个面：

1. 小程序订单页为什么“什么都看不到”
2. `admin-ui` 后台现在到底哪些模块可用
3. `cloudbase` skill 当前在本项目里能实际验证到什么程度

## 2. CloudBase skill 检查结论

### 2.1 已确认符合 skill 的部分

- 项目确实是 CloudBase 小程序形态
- 小程序入口使用 `wx.cloud.init`
- 用户侧核心接口通过云函数承接
- 项目已存在 [config/mcporter.json](C:\Users\21963\WeChatProjects\zz\config\mcporter.json)

关键依据：

- [cloud-mp/miniprogram/app.js](C:\Users\21963\WeChatProjects\zz\cloud-mp\miniprogram\app.js)
- [cloud-mp/miniprogram/utils/request.js](C:\Users\21963\WeChatProjects\zz\cloud-mp\miniprogram\utils\request.js)
- [config/mcporter.json](C:\Users\21963\WeChatProjects\zz\config\mcporter.json)

### 2.2 通过 CloudBase MCP 实际验证到的结果

按 `cloudbase` skill 要求，管理类动作应优先通过 MCP / `mcporter` 检查工具能力。

本轮实际执行：

- `mcporter --version`
- `mcporter list`
- `mcporter list cloudbase --schema`
- `mcporter call cloudbase.auth action=status --output json`
- `mcporter call cloudbase.envQuery action=list --output json`
- `mcporter call cloudbase.readNoSqlDatabaseStructure action=listCollections limit=50 --output json`
- `mcporter call cloudbase.readNoSqlDatabaseContent collectionName=orders limit=5 --output json`
- `mcporter call cloudbase.readNoSqlDatabaseContent collectionName=users limit=5 --output json`
- `mcporter call cloudbase.readNoSqlDatabaseContent collectionName=categories limit=5 --output json`
- `mcporter call cloudbase.queryFunctions action=listFunctions limit=50 offset=0 --output json`
- `mcporter call cloudbase.queryCloudRun action=list pageSize=20 pageNum=1 --output json`

结果：

- `mcporter` 当前已修复，可正常执行
- CloudBase MCP 已正常加载，工具数量为 `36`
- 当前认证状态为 `READY`
- 当前绑定环境为 `cloud1-9gywyqe49638e46f`
- 环境状态为 `NORMAL`
- CloudBase 云数据库当前已有 `46` 个集合
- `orders` 集合有 `59` 条数据
- `users` 集合有 `167` 条数据
- `categories` 集合最初为空，已在本轮补齐到 `9` 条数据
- `products` 集合有 `11` 条数据，但字段仍明显偏旧 MySQL 结构
- CloudBase 环境中已有 `8` 个云函数，且都处于 `Active`
- 当前 CloudRun 服务列表为 `0`
- 后台 API 已切到新增云函数 `admin-api`
- `admin-api` 已通过网关暴露出：
  - `https://cloud1-9gywyqe49638e46f.service.tcloudbase.com/admin/api`
  - `https://cloud1-9gywyqe49638e46f.service.tcloudbase.com/`
- 测试管理员账号 `admin / Jxalk@20260317` 已验证可以通过线上 API 登录
- 静态后台已重新构建并上传到：
  - `https://cloud1-9gywyqe49638e46f-1419893803.tcloudbaseapp.com/`

这说明：

1. **CloudBase skill 已经可以在这台机器上实际使用**
2. **CloudBase 正式环境不是空的**
3. **小程序云函数已经部署**
4. **后台 CloudRun 还没有真正部署到云上，而且当前环境未开通云托管**
5. **后台测试站当前依赖 HTTP 云函数 `admin-api`，不是 CloudRun**
6. **导入后的数据模型并没有完全统一到目标 CloudBase 模型**

结论：

- **CloudBase skill 已按要求阅读并完成实际 MCP 校验**
- **当前阻塞已经不是 `mcporter`，而是云上数据结构和业务代码口径不一致**

### 2.3 后台测试站当前真实形态

后台目前分成两层：

1. 静态前端：
   - `admin-ui`
   - 部署在 `tcloudbaseapp.com` 静态托管域名

2. 管理 API：
   - 不是 CloudRun
   - 当前为 Event 云函数 `admin-api` + 网关路径 `/admin/api`
   - 前端已重构为直接请求函数网关域名

当前这样做的原因很直接：

- 目标 CloudBase 环境尚未开通云托管，`manageCloudRun deploy` 实测返回“云托管资源未开通”
- 为了先让后台真正可登录、可联调，先用 HTTP 网关挂函数版管理 API

### 2.4 当前后台图片存储结论

后台图片上传**还不是正式 CloudBase 云存储方案**。

现状：

- 管理 API 仍使用本地 fallback 上传逻辑
- 在云函数运行态中，上传文件会写到临时目录 `/tmp/...`
- 这意味着当前后台上传得到的文件**不是长期持久化资产**

因此当前图片相关的真实状态是：

1. 历史商品图 / Banner 图主要还是旧外链
2. `materials` 集合里已有一批导入素材记录
3. 新后台上传功能目前只适合联调，不适合当正式素材库

后续必须继续做：

- 把后台上传从临时目录切到正式 CloudBase 云存储
- 让 `file_id` 变成真实可回查、可持久化的 CloudBase 文件标识

## 3. 小程序订单页结论

### 3.1 不是单一问题，而是三层错位

订单页当前问题不是“一个 if 写错了”，而是三层同时错位：

1. 页面模板按旧结构渲染
2. 云函数返回的是新结构
3. 订单统计页读的是错误分页字段

### 3.2 已确认的主要根因

#### 根因 A：订单页面按 `order.product` 渲染，但云函数原本主要返回 `items[]`

当前订单相关页面广泛依赖：

- `order.product`
- `order.sku`
- `order.address.receiver_name`
- `order.address.phone`
- `order.address.detail`

依据：

- [cloud-mp/miniprogram/pages/order/list.wxml](C:\Users\21963\WeChatProjects\zz\cloud-mp\miniprogram\pages\order\list.wxml)
- [cloud-mp/miniprogram/pages/order/detail.wxml](C:\Users\21963\WeChatProjects\zz\cloud-mp\miniprogram\pages\order\detail.wxml)
- [cloud-mp/miniprogram/pages/order/refund-apply.wxml](C:\Users\21963\WeChatProjects\zz\cloud-mp\miniprogram\pages\order\refund-apply.wxml)
- [cloud-mp/miniprogram/pages/order/refund-list.wxml](C:\Users\21963\WeChatProjects\zz\cloud-mp\miniprogram\pages\order\refund-list.wxml)

但订单云函数原本主返回结构偏向：

- `items[]`
- `address.contact_name`
- `address.contact_phone`
- `address.detail_address`

依据：

- [cloud-mp/cloudfunctions/order/index.js](C:\Users\21963\WeChatProjects\zz\cloud-mp\cloudfunctions\order\index.js)

#### 根因 B：订单统计页把 `data.total` 当 `data.pagination.total` 读

用户中心订单角标读取逻辑当前是：

- `results[x].data?.pagination?.total`

依据：

- [cloud-mp/miniprogram/pages/user/userDashboard.js](C:\Users\21963\WeChatProjects\zz\cloud-mp\miniprogram\pages\user\userDashboard.js)

而订单云函数列表原本返回的是：

- `data.total`

不是：

- `data.pagination.total`

这会导致：

- 我的页订单角标长期显示 0

#### 根因 C：`pending_review` 状态在页面中被使用，但云函数原本不支持

页面与统计逻辑里存在：

- `status=pending_review`

依据：

- [cloud-mp/miniprogram/pages/order/list.wxml](C:\Users\21963\WeChatProjects\zz\cloud-mp\miniprogram\pages\order\list.wxml)
- [cloud-mp/miniprogram/pages/user/userDashboard.js](C:\Users\21963\WeChatProjects\zz\cloud-mp\miniprogram\pages\user\userDashboard.js)

但订单云函数原本没有这个筛选语义。

### 3.3 本轮已补的修复

本轮已经直接补到订单云函数：

- 返回兼容的 `product`
- 返回兼容的 `sku`
- 返回兼容的 `address.receiver_name / phone / detail`
- 订单列表补 `pagination.total`
- 支持 `pending_review`
- 退款列表与退款详情补关联 `order`

修改文件：

- [cloud-mp/cloudfunctions/order/index.js](C:\Users\21963\WeChatProjects\zz\cloud-mp\cloudfunctions\order\index.js)

### 3.4 通过 CloudBase MCP 确认到的真实数据问题

通过 CloudBase MCP 抽样查看 `orders`、`users`、`refunds`、`addresses` 后，已经确认：

- `orders` 里的历史订单大量只有 `buyer_id`
- `refunds` 里的历史退款大量只有 `user_id`
- `addresses` 里的历史地址大量只有 `user_id`
- `users` 表里当前用户身份主键仍是 `id + openid` 双轨
- `orders` 样本中未看到新模型要求的 `openid + items[]` 全量完成

这说明订单页空白的主因不是“前端没渲染”，而是：

1. 查询逻辑按当前 `OPENID`
2. 云上历史订单仍按旧 `buyer_id`
3. 两边没有完全对上

### 3.5 本轮继续补的兼容修复

本轮除了前一轮的展示兼容，还继续补了“当前用户 -> 历史订单归属”的兼容：

- 订单云函数现在会先按当前 `openid` 查 `users`
- 如果找到用户档案，会同时按 `buyer_id = user.id`、`buyer_id = String(user.id)`、`user_id = user.id` 继续查旧订单/旧退款

修改文件：

- [cloud-mp/cloudfunctions/order/index.js](C:\Users\21963\WeChatProjects\zz\cloud-mp\cloudfunctions\order\index.js)

这一步已经把“云上旧订单存在，但当前页面查不到”这个问题往前推了一大步。

### 3.6 仍然可能导致“看不到订单”的剩余风险

即使兼容层补上，仍有两个现实风险：

1. 当前真机登录拿到的 `OPENID` 如果在 `users` 集合里找不到对应档案，还是查不到旧订单
2. 如果后续又有新导入数据只写 `buyer_id/user_id` 不写 `openid`，问题还会反复出现

### 3.7 本轮已完成的云上数据修复

本轮通过 CloudBase MCP 和修复脚本，已经完成这批数据回填：

- `orders`: 59 条回填 `openid`
- `refunds`: 9 条回填 `openid`
- `addresses`: 19 条回填 `openid`

验证方式：

- dry-run 首次结果为 `87` 条待修复
- 实际回填后再次 dry-run，剩余待修复数量为 `0`

相关脚本：

- [cloud-mp/scripts/repair-cloudbase-openid-fields.js](C:\Users\21963\WeChatProjects\zz\cloud-mp\scripts\repair-cloudbase-openid-fields.js)

## 4. 后台管理页完成度判断

### 4.1 已有可用接口支撑的模块

这些模块当前已经有较完整的 CloudRun 接口支撑，属于**可运行主线**：

- 登录 / 当前管理员资料 / 修改密码
- 商品管理
- 商品分类
- 素材管理
- 素材分组
- 上传接口
- Banner
- 内容管理
- 首页内容位
- 订单管理
- 订单发货 / 改价 / 备注 / 强制完成 / 强制取消
- 物流查看
- 经营看板
- 设置 / 小程序配置 / 功能开关 / 告警配置
- 运行时数据源与健康检查

关键依据：

- [backend/cloudrun-admin-service/src/app.js](C:\Users\21963\WeChatProjects\zz\backend\cloudrun-admin-service\src\app.js)
- [admin-ui/src/api/modules/ordersFulfillment.js](C:\Users\21963\WeChatProjects\zz\admin-ui\src\api\modules\ordersFulfillment.js)
- [admin-ui/src/api/modules/content.js](C:\Users\21963\WeChatProjects\zz\admin-ui\src\api\modules\content.js)

补充说明：

- 这里的“可运行”是指**本地 CloudRun 管理服务骨架已具备这些接口**
- 通过 CloudBase MCP 查询，当前云上 `CloudRun services = 0`
- 所以后台管理面现在不是“云上正式可用”，而是“本地骨架已具备一阶段能力，尚未正式部署”

### 4.2 可打开但属于半成品 / 壳接口的模块

这些页面或模块不一定报编译错，但当前仍是**半成品**：

- `home-sections`
  - 读写接口存在，但很多返回是轻量占位结构
- `statistics/*`
  - 多个统计接口返回空列表或轻量聚合
- `system-configs`
  - 目前更偏运维占位接口
- `popup-ad-config`
  - 可用，但仍偏配置面，不是完整运营体系

### 4.3 高风险或尚未被 CloudRun 新底座完整接住的模块

这些页面在 `admin-ui` 里存在，但当前不应视为“已经做好”：

- 用户管理
- 售后退款页
- 提现审核
- 佣金结算
- 经销商 / 分支代理 / N 路径代理
- 管理员与权限页
- 运维监控
- 优惠券
- 拼团活动
- 营销资源
- 会员与成长值
- 代理体系

原因不是前端页面不存在，而是：

1. CloudRun 新底座没有为这些模块提供完整的管理 API
2. 很多权限名、路由和真实接口并未完全对齐
3. 这些模块仍深度依赖旧 MySQL 主系统语义

### 4.4 一个明确的后台权限风险

当前前端路由里存在这些权限声明：

- `admins`
- `super_admin`
- `withdrawals`
- `refunds`
- `commissions`

依据：

- [admin-ui/src/router/index.js](C:\Users\21963\WeChatProjects\zz\admin-ui\src\router\index.js)

但 CloudRun 当前主权限预设主要覆盖的是：

- `products`
- `orders`
- `materials`
- `content`
- `settings_manage`

结论：

- 后台菜单和 CloudRun 新权限模型还没有完全同一套真相

### 4.5 当前 CloudRun 后台的真实部署阻塞

通过代码检查，当前后台还不具备直接云上部署完成态，主要卡在两个点：

1. 当前云上 `CloudRun services = 0`
2. [backend/cloudrun-admin-service/src/store/providers/cloudbase.js](C:\Users\21963\WeChatProjects\zz\backend\cloudrun-admin-service\src\store\providers\cloudbase.js)
   已接入真实 CloudBase Node SDK，但本地/部署环境仍需要提供密钥

另外，当前服务目录没有 `Dockerfile`，而且 `mysql` 数据源实现会直接依赖主仓库中的 Sequelize 模型：

- [backend/cloudrun-admin-service/src/store/providers/mysql.js](C:\Users\21963\WeChatProjects\zz\backend\cloudrun-admin-service\src\store\providers\mysql.js)

这意味着后台现在是：

- **本地联调骨架可用**
- **CloudBase provider 已经从 stub 前进到可联调状态**
- **云上 CloudRun 还未真正成型**

## 4A. 团队 / 分销 / 会员中心补充审计

### 4A.1 当前核心问题

团队、分销、会员中心、货款账户这条线的当前问题，不是单纯“缺数据”，而是三类断层叠加：

1. 页面仍按旧的嵌套 dashboard 结构读取数据
2. 云函数此前主要返回扁平字段
3. 路由兼容层里缺了多条页面真实在调用的接口

### 4A.2 本轮确认过的页面与接口

重点页面：

- [cloud-mp/miniprogram/pages/user/user.js](C:\Users\21963\WeChatProjects\zz\cloud-mp\miniprogram\pages\user\user.js)
- [cloud-mp/miniprogram/pages/user/userDashboard.js](C:\Users\21963\WeChatProjects\zz\cloud-mp\miniprogram\pages\user\userDashboard.js)
- [cloud-mp/miniprogram/pages/distribution/team.js](C:\Users\21963\WeChatProjects\zz\cloud-mp\miniprogram\pages\distribution\team.js)
- [cloud-mp/miniprogram/pages/distribution/team-member.js](C:\Users\21963\WeChatProjects\zz\cloud-mp\miniprogram\pages\distribution\team-member.js)
- [cloud-mp/miniprogram/pages/distribution/center.js](C:\Users\21963\WeChatProjects\zz\cloud-mp\miniprogram\pages\distribution\center.js)
- [cloud-mp/miniprogram/pages/distribution/business-center.js](C:\Users\21963\WeChatProjects\zz\cloud-mp\miniprogram\pages\distribution\business-center.js)
- [cloud-mp/miniprogram/pages/wallet/index.js](C:\Users\21963\WeChatProjects\zz\cloud-mp\miniprogram\pages\wallet\index.js)
- [cloud-mp/miniprogram/pages/wallet/agent-wallet.js](C:\Users\21963\WeChatProjects\zz\cloud-mp\miniprogram\pages\wallet\agent-wallet.js)
- [cloud-mp/miniprogram/pages/points/index.js](C:\Users\21963\WeChatProjects\zz\cloud-mp\miniprogram\pages\points\index.js)

此前缺失或未接住的关键接口包括：

- `GET /distribution/team/:id`
- `GET /stats/distribution`
- `POST /wallet/withdraw`
- `GET /wallet/withdrawals`
- `GET /agent/workbench`
- `GET /agent/orders`
- `POST /agent/restock`
- `GET /user/member-tier-meta`
- `POST /points/sign-in`
- `POST /agent/wallet/prepay`
- `GET /agent/wallet/recharge-orders/:id`

### 4A.3 本轮已完成的修复

本轮已经直接补到源文件并部署到 CloudBase：

- [cloud-mp/miniprogram/utils/request.js](C:\Users\21963\WeChatProjects\zz\cloud-mp\miniprogram\utils\request.js)
- [cloud-mp/cloudfunctions/distribution/index.js](C:\Users\21963\WeChatProjects\zz\cloud-mp\cloudfunctions\distribution\index.js)
- [cloud-mp/cloudfunctions/user/index.js](C:\Users\21963\WeChatProjects\zz\cloud-mp\cloudfunctions\user\index.js)

完成内容：

- `distribution.center` 改为返回页面期望的嵌套 dashboard 结构，同时保留扁平兼容字段
- `distribution.stats` 现在返回团队人数、本月新增、邀请码、累计团队业绩
- `distribution.team` 现在支持一级/二级团队
- `distribution.teamDetail` 已补上
- `distribution.agentWallet / agentWalletLogs / agentWorkbench / agentOrders` 已补最小运行闭环
- `user.walletInfo / walletCommissions / pointsAccount / pointsTasks / pointsSignInStatus / pointsSignIn / memberTierMeta` 已补成页面可消费结构

### 4A.4 已确认存在的真实数据

通过 CloudBase 抽样，已经确认：

- `users` 里存在 `parent_id / parent_openid / referrer_openid / referee_count / role_level / total_sales`
- `wallet_accounts` 和 `wallet_logs` 存在历史数据
- 团队层级关系和货款账户历史并不是空的

因此，当前团队页、会员中心、货款页显示空或 0，主因是**接口契约未收口**，不是数据库完全没有数据。

### 4A.5 仍未完成的团队 / 分销事项

1. `agentRestock` 仍未迁移完成，目前明确返回未完成提示
2. `agentWalletPrepay` 仍未接正式支付
3. 团队业绩、代理工作台当前是兼容聚合结果，不等于最终规则已经全部定版
4. 积分任务和积分流水已从纯空壳推进到可读结构，但仍不是最终运营规则

## 4B. 后台接口补充审计

对照 [admin-ui/src/api/index.js](C:\Users\21963\WeChatProjects\zz\admin-ui\src\api\index.js) 及其业务模块，与 [backend/cloudrun-admin-service/src/app.js](C:\Users\21963\WeChatProjects\zz\backend\cloudrun-admin-service\src\app.js) 的 `/admin/api/*` 路由后，当前可以明确：

- 已完整接住的主要模块：
  - `/admin/api/products`
  - `/admin/api/categories`
  - `/admin/api/materials`
  - `/admin/api/contents`
  - `/admin/api/orders`
  - `/admin/api/settings`
  - `/admin/api/logs`
  - `/admin/api/statistics`
  - `/admin/api/users`
  - `/admin/api/withdrawals`
  - `/admin/api/refunds`
  - `/admin/api/commissions`
- 其中 `users / withdrawals / refunds / commissions` 已补上首期运行接口，支持：
  - 用户列表、详情、团队、团队汇总、角色/余额/状态/上级/拿货等级等更新
  - 提现列表、通过、驳回、打款完成
  - 退款列表、详情、通过、驳回、完成
  - 佣金列表、统计、单条审批/驳回、批量审批/驳回
- 新底座**仍未接住** 这些后台业务域：
  - `/admin/api/dealers`
  - `/admin/api/branch-agents`
  - `/admin/api/n-system`
  - `/admin/api/admins`
  - `/admin/api/ops-monitor`
  - `/admin/api/dealers`
  - `/admin/api/branch-agents`
  - `/admin/api/n-system`
  - `/admin/api/admins`
  - `/admin/api/ops-monitor`

结论：

- 后台前端页面很多
- 但 CloudRun 新底座目前只完成了其中一部分
- 页面存在不等于该模块已经迁移完成

## 5. 本轮验证结果

- `admin-ui` 构建通过
- [cloud-mp/cloudfunctions/order/index.js](C:\Users\21963\WeChatProjects\zz\cloud-mp\cloudfunctions\order\index.js) 语法检查通过
- `cloudbase` skill 已阅读
- `miniprogram-development` 和 CloudBase 小程序集成参考已阅读
- `mcporter` 当前可执行，版本为 `0.7.3`
- CloudBase MCP 当前可正常连接到 `cloud1-9gywyqe49638e46f`
- 通过 MCP 已验证：`orders`、`users`、`products`、`refunds`、`addresses` 集合均有真实数据
- 通过 MCP 已验证并已修复：`categories` 集合当前为 `9` 条，已和本地导入包对齐
- 通过 MCP 已验证：云上已部署 `8` 个小程序云函数
- 通过 MCP 已验证：云上当前没有 CloudRun 服务
- 本轮已将本地最新 `login`、`user`、`products`、`cart`、`order`、`payment`、`config`、`distribution` 云函数代码同步到云环境
- 本轮已完成 `orders/refunds/addresses` 的 `openid` 回填，CloudBase 历史归属数据已收口一轮
- 本轮已补齐团队 / 分销 / 钱包 / 积分主协议，并重新部署 `distribution`、`user`
- 重新部署后，云上 `distribution` 更新时间为 `2026-04-08 16:24:31`
- 重新部署后，云上 `user` 更新时间为 `2026-04-08 16:20:42`
- 本轮已补齐 CloudRun 管理后台 `users / withdrawals / refunds / commissions` 四组高频接口
- 本轮本地烟测已通过：
  - `/admin/api/users?limit=2`
  - `/admin/api/withdrawals?limit=2`
  - `/admin/api/refunds?limit=2`
  - `/admin/api/commissions?limit=2`
- 本轮本地烟测已通过详情/汇总接口：
  - `/admin/api/users/:id`
  - `/admin/api/users/:id/team-summary`
  - `/admin/api/refunds/:id`
- 本轮已将后台上传链路改为 CloudBase 云存储优先，本地 `/uploads` 仅作为 fallback
- 本轮已通过线上管理 API 验证：
  - `POST /admin/api/login`
  - `GET /admin/api/profile`
  - `GET /admin/api/storage/config`
  - `POST /admin/api/storage/test`
- 本轮已通过线上管理 API 完成一次真实上传烟测：
  - `POST /admin/api/upload`
  - 返回 `provider=cloudbase`
  - 返回有效 `file_id`
  - 返回有效临时访问 `url`
- 本轮已重新构建并上传 `admin-ui` 静态站，当前访问入口仍为：
  - `https://cloud1-9gywyqe49638e46f-1419893803.tcloudbaseapp.com/`
- 本轮线上复核发现：
  - `GET /admin/api/users?limit=1` 在函数网关下会返回 `FUNCTION_TIME_LIMIT_EXCEEDED`
  - `GET /admin/api/dealers?limit=1` 仍返回 `404 未实现的接口`

## 6. 当前项目还没做完的关键事项

1. 真正的 CloudBase 正式环境导入还没执行
2. 正式支付还没接通，只是结构已收口
3. 后台大量高级模块仍未从旧主系统完全迁到 CloudRun 新底座，重点还剩经销商、分支代理、N 路径、管理员、权限、运维监控
4. CloudBase 云上数据仍明显混有旧模型字段，尤其是 `buyer_id`、`user_id`、`quantity`、`avatar_url`、`nickname`
5. 后台 CloudRun 还未真正部署到云环境，后台目前不能算云上完成态
6. `ADMIN_DATA_SOURCE=cloudbase` 已接入 provider，但仍依赖环境密钥，且单例配置尚未完全云端化
7. 团队 / 分销链路虽然已补上主页面协议，但 `agentRestock`、货款充值正式支付、代理高级规则仍未完成
8. 订单数据虽然已完成一轮 `openid` 回填，但后续导入链路仍需避免旧字段回流
9. 后台上传虽然已经打通 CloudBase 云存储，但正式发布前仍需决定是否保留本地 fallback
10. 后台 `users` 接口在线上函数模式下仍存在超时问题，需要收敛查询成本或改部署形态

## 7. 当前最值得继续做的顺序

1. 真机验证团队页、会员中心、分佣中心、货款页现在是否恢复显示
2. 接正式支付和支付回调，不再依赖模拟支付
3. 逐项处理 MySQL schema drift
4. 最后再收 `dealers / branch-agents / n-system / admins / ops-monitor`

## 8. 2026-04-08 20:45 增量修复

### 8.1 后台用户列表超时已修复

- [backend/cloudrun-admin-service/src/app.js](C:\Users\21963\WeChatProjects\zz\backend\cloudrun-admin-service\src\app.js)
  已将 `/admin/api/users` 从“全量重型统计”改为“轻量聚合列表”
- 列表接口现在只在一轮遍历内聚合订单和直属下级统计
- 详情、团队、团队汇总仍保留重型路径

本轮验证：

- 本地烟测：`GET /admin/api/users?limit=2` 返回 `200`
- 线上函数网关：`GET /admin/api/users?limit=2` 返回 `code=0`

### 8.2 经销商最小接口已补齐

- [backend/cloudrun-admin-service/src/app.js](C:\Users\21963\WeChatProjects\zz\backend\cloudrun-admin-service\src\app.js)
  已新增：
  - `GET /admin/api/dealers`
  - `PUT /admin/api/dealers/:id/approve`
  - `PUT /admin/api/dealers/:id/reject`
  - `PUT /admin/api/dealers/:id/level`
- 当前实现基于现有分销用户字段合成最小经销商模型
- 这能支撑后台页面联调，但还不是最终独立经销商数据模型

本轮验证：

- 本地烟测：`GET /admin/api/dealers?limit=2` 返回 `200`
- 线上函数网关：`GET /admin/api/dealers?limit=2` 返回 `code=0`

### 8.3 云端同步状态

- `admin-api` 已重新发布
- CloudBase 返回的函数更新时间为 `2026-04-08 20:42:12`
- 已同步副本文件：
  - [cloud-mp/cloudfunctions/admin-api/src/app.js](C:\Users\21963\WeChatProjects\zz\cloud-mp\cloudfunctions\admin-api\src\app.js)

### 8.4 当前剩余重点

这轮修完之后，当前最主要的剩余阻塞收敛为：

1. 正式支付
2. 真实物流
3. `branch-agents / n-system / admins / ops-monitor`
4. 旧字段全面清理

## 9. 2026-04-08 21:10 后台高级域本地补齐

本轮已在本地源文件中补齐以下后台域的最小可用接口：

- `admins`
- `branch-agents`
- `n-system`
- `ops-monitor`

关键文件：

- [backend/cloudrun-admin-service/src/app.js](C:\Users\21963\WeChatProjects\zz\backend\cloudrun-admin-service\src\app.js)
- [cloud-mp/cloudfunctions/admin-api/src/app.js](C:\Users\21963\WeChatProjects\zz\cloud-mp\cloudfunctions\admin-api\src\app.js)

本地烟测已通过的接口包括：

- `GET /admin/api/admins?limit=2`
- `GET /admin/api/branch-agent-policy`
- `GET /admin/api/branch-agents/stations`
- `GET /admin/api/branch-agents/claims`
- `GET /admin/api/n-system/leaders?limit=2`
- `GET /admin/api/n-system/members?limit=2`
- `GET /admin/api/upgrade-applications?limit=2`
- `GET /admin/api/system/status`
- `GET /admin/api/debug/anomalies`
- `GET /admin/api/debug/cron-status`
- `GET /admin/api/debug/logs?lines=5`

需要明确的是：

- 本地实现已完成
- `cloud-mp/cloudfunctions/admin-api/src/app.js` 已同步
- 但本轮**线上发布未完成**

原因：

- `mcporter call cloudbase.manageFunctions action=updateFunctionCode ...` 多次卡在 `COS 上传超时（60秒）`
- 改用 `tcb fn deploy` 后，又被 CloudBase CLI 的强交互式确认阻塞，当前桌面线程无法稳定完成该交互

因此当前状态应理解为：

- 本地代码已准备好
- 函数副本源码已准备好
- 待解决 CloudBase 发布链路后再上线验证

## 10. 2026-04-08 21:15 后台静态站重新发布

对 [admin-ui/dist](C:\Users\21963\WeChatProjects\zz\admin-ui\dist) 重新构建后，已通过 `cloudbase.uploadFiles` 上传到 CloudBase 静态托管根目录 `/`。

关键验证结果：

- 本地产物入口为 `assets/index-CwhwXJeF.js`
- 静态站首页 [https://cloud1-9gywyqe49638e46f-1419893803.tcloudbaseapp.com/](https://cloud1-9gywyqe49638e46f-1419893803.tcloudbaseapp.com/) 返回 `200`
- 线上 `index.html` 已引用 `assets/index-CwhwXJeF.js`
- 旧的 `index-sWA5piQ8.js` 不再是首页主入口
- 网关登录接口 [https://cloud1-9gywyqe49638e46f.service.tcloudbase.com/admin/api/login](https://cloud1-9gywyqe49638e46f.service.tcloudbase.com/admin/api/login) 返回 `200`，确认静态站新的 API 基址切换条件具备

本轮结论：

- “登录请求打到静态站 `/admin/api/login` 导致 404” 这一问题的代码修复和静态资源发布都已经完成
- 如果浏览器仍加载旧资源，需要强制刷新缓存后再验证页面登录

## 11. 2026-04-08 21:33 支付配置底座上线

本轮已完成：

- `payment` 云函数配置加载器升级为“环境变量 + 证书文件”双通道
- `admin-api` 与本地后台新增真实支付配置检查，不再只返回占位文案
- 新增支付 readiness 脚本与配置模板文档

关键文件：

- [cloud-mp/cloudfunctions/payment/config.js](C:\Users\21963\WeChatProjects\zz\cloud-mp\cloudfunctions\payment\config.js)
- [cloud-mp/cloudfunctions/payment/index.js](C:\Users\21963\WeChatProjects\zz\cloud-mp\cloudfunctions\payment\index.js)
- [cloud-mp/cloudfunctions/payment/payment.env.example.json](C:\Users\21963\WeChatProjects\zz\cloud-mp\cloudfunctions\payment\payment.env.example.json)
- [cloud-mp/cloudfunctions/payment/certs/README.md](C:\Users\21963\WeChatProjects\zz\cloud-mp\cloudfunctions\payment\certs\README.md)
- [docs/guides/微信支付接入与文件放置说明.md](C:\Users\21963\WeChatProjects\zz\docs\guides\微信支付接入与文件放置说明.md)

云端同步结果：

- `payment` 云函数代码已更新，更新时间：`2026-04-08 21:33:02`
- `admin-api` 云函数代码已更新，更新时间：`2026-04-08 21:33:02`

当前仍未完成的关键事实：

- 线上 `payment` 云函数环境变量仍为空
- 因此正式支付依然未接通
- readiness 检查结果明确缺少：
  - `PAYMENT_WECHAT_APPID`
  - `PAYMENT_WECHAT_MCHID`
  - `PAYMENT_WECHAT_NOTIFY_URL`
  - `PAYMENT_WECHAT_SERIAL_NO`
  - `PAYMENT_WECHAT_API_V3_KEY`
  - `PAYMENT_WECHAT_PRIVATE_KEY`
  - `PAYMENT_WECHAT_PLATFORM_CERT`

## 12. 2026-04-08 22:57 正式支付运行时配置接入

为绕过 CloudBase 环境变量写入链路不稳定，本轮新增了运行时配置文件：

- [cloud-mp/cloudfunctions/payment/payment.runtime.json](C:\Users\21963\WeChatProjects\zz\cloud-mp\cloudfunctions\payment\payment.runtime.json)
- [cloud-mp/cloudfunctions/admin-api/payment.runtime.json](C:\Users\21963\WeChatProjects\zz\cloud-mp\cloudfunctions\admin-api\payment.runtime.json)

同时已完成：

- `payment` 正式支付主干代码补齐：
  - JSAPI 预支付参数生成
  - 微信支付订单查询
  - `payment-notify` HTTP 回调入口
  - 回调签名头校验与资源解密主干
- `payment` 网关入口已创建：
  - [https://cloud1-9gywyqe49638e46f.service.tcloudbase.com/payment-notify](https://cloud1-9gywyqe49638e46f.service.tcloudbase.com/payment-notify)

本轮关键验证：

- 向 `payment-notify` 发送空 POST 后，返回：
  - `500 PAYMENT_NOTIFY_ERROR`
  - `缺少微信支付回调签名头`

这说明：

- 支付配置已经被函数读取到
- `payment-notify` 路由已经生效
- 当前已不再卡在“正式支付参数缺失”

当前剩余支付风险：

- 未做真实小程序支付端到端验证
- 未做真实微信回调验签与解密实测
- 订单金额单位是否全部为“分”仍需真单验证
- `admin-api/payment-health` 已补真实检查逻辑，但本轮未完成登录态联机验证
