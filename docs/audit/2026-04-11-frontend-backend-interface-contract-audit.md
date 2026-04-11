# 前后端接口契约审计

日期：2026-04-11
范围：`miniprogram/`、`admin-ui/`、`backend/`
目标：确认当前前端实际依赖的接口、请求格式、返回格式，检查是否与后端实现对齐，并给出继续收口的优先级。

## 1. 真相源与边界

本次审计只以根仓库 `zz/` 当前代码为准：

- 小程序请求入口：`miniprogram/utils/request.js`、`miniprogram/utils/cloud.js`、`miniprogram/appAuth.js`
- 管理端请求入口：`admin-ui/src/utils/request.js`、`admin-ui/src/api/modules/*.js`
- 后端真实挂载：`backend/app.js`、`backend/routes/*`、`backend/routes/admin/*`
- 统一响应/校验：`backend/controllers/BaseController.js`、`backend/middleware/errorHandler.js`、`backend/middleware/validation.js`

说明：

- `cloud-mp/` 子目录下的同名代码和文档不作为本轮真相源，只作为历史线索。
- 运行时行为以当前路由挂载树为准，不以旧文档、旧计划或历史截图为准。

## 2. 审计结论

一句话判断：

1. 管理后台的“路径级”对齐整体较好，前端模块定义的接口基本都能在 `backend/routes/admin/index.js` 的挂载树中找到。
2. 小程序并不是直接调用 REST，而是“请求路径 -> `ROUTE_TABLE` -> `wx.cloud.callFunction`”的兼容层；它与 backend REST 并不是一套天然等价的契约。
3. 当前最大风险不是“有没有接口”，而是“成功包装、列表包装、上传协议、别名路径”并不统一。

高风险项：

1. 管理端上传协议不一致：前端发 JSON base64，后端要求 `multipart/form-data` + `req.file`。
2. 小程序登录成功语义与普通请求成功语义分裂：`appAuth.js` 只认 `result.success`，绝大多数页面只认 `res.code === 0`。
3. 小程序存在实际页面在用但 `ROUTE_TABLE` 未映射的接口，当前会直接走“未映射接口”拒绝。
4. 后端存在已写但未挂载的管理路由文件，继续放着会扩大“文档与实现不一致”。

## 3. 统一契约现状

### 3.1 Backend 统一响应

当前 backend 的主响应约定是：

- 成功：`{ code: 0, message, data? }`
- 失败：`{ code, message }`

来源：

- `backend/controllers/BaseController.js`
- `backend/middleware/errorHandler.js`

补充：

- 管理端和大部分公开接口都按 `code === 0` 判成功。
- 错误处理会按 400/401/403/404/500 输出统一 JSON。

### 3.2 Backend 显式请求校验

当前只有少数接口用了统一 schema 校验：

- `POST /login`
  请求字段：`code` 必填，`distributor_id/invite_code/member_no/member_code` 可选。
- `POST /orders`
  请求字段：`items[]`、`address_id` 必填，`remark` 可选。
- `POST /addresses` / `PUT /addresses/:id`
  请求字段：`receiver_name`、`phone`、`province`、`city`、`district`、`detail` 必填。

来源：

- `backend/middleware/validation.js`

结论：

- 真正“被 schema 固定住”的请求体不多，很多接口仍然靠控制器内部约定。

### 3.3 Admin UI 契约

管理端请求层约定非常明确：

- 基础路径：`/admin/api`
- 成功判定：只接受 `code === 0`
- 成功后直接把 `response.data.data` 解包给页面
- `blob` 导出直接透传

来源：

- `admin-ui/src/utils/request.js`

因此页面真实依赖的是：

- 列表：`{ list, pagination: { total } }`
- 配置：整对象或按业务域分组对象
- 详情：单个业务对象，允许带嵌套子资源

### 3.4 Miniprogram 契约

小程序请求层不是 REST 客户端，而是云函数兼容层：

- `miniprogram/utils/request.js` 用 `ROUTE_TABLE` 把 REST 风格路径映射到云函数名和 `action`
- `miniprogram/utils/cloud.js` 执行 `wx.cloud.callFunction`
- 成功条件：`result.success === true` 或 `result.code === 0`
- 请求层不解包，页面自己读 `res.code/res.message/res.data`

另外，登录是单独一套：

- `miniprogram/appAuth.js` 直接 `wx.cloud.callFunction({ name: 'login' })`
- 它读取的是 `result.success`、`result.data || result.userInfo`、`result.is_new_user`、`result.level_up`

结论：

1. 小程序内部已经出现两套成功语义。
2. 小程序页面对返回体的依赖是分散的，并没有像管理端那样统一解包。

## 4. 小程序接口盘点

统计结果：

- `ROUTE_TABLE` 已声明 137 条路径映射
- 页面/组件/工具当前实际使用 76 个唯一接口

### 4.1 小程序实际调用接口

#### 认证与用户域

- `POST /login`
- `GET /user/profile`
- `PUT /user/profile`
- `GET /user/member-tier-meta`
- `GET /user/preferences`
- `POST /user/preferences/submit`
- `POST /user/portal/apply-initial-password`
- `GET /customer-service/tickets`
- `GET /notifications`
- `GET /user/favorites`
- `GET /user/favorites/status`
- `POST /user/favorites`
- `POST /user/favorites/clear-all`
- `POST /user/favorites/sync`

页面主要依赖字段：

- 用户资料：`nickname/avatar_url/role_level/role_name/member_no/growth_value`
- 通知/工单列表：`data.list`、`data.pagination.total`
- 偏好设置：对象型 `data`

#### 地址与自提域

- `GET /addresses`
- `POST /addresses`
- `GET /stations`
- `GET /stations/my-scope`
- `GET /stations/region-from-point`
- `GET /pickup/pending-orders`
- `POST /pickup/verify-code`
- `POST /pickup/verify-qr`

页面主要依赖字段：

- 地址列表常兼容 `res.data` 或裸数组
- 自提范围/站点信息依赖站点列表和位置映射对象

#### 商品 / 购物车 / 收藏域

- `GET /products`
- `GET /commissions/preview`
- `GET /coupons/mine`
- `GET /coupons/available?amount=0`
- `GET /cart`
- `POST /cart`

页面主要依赖字段：

- 商品列表：`data.list` 或 `data`
- 购物车：商品快照、数量、价格
- 收藏：状态接口和清空同步接口

#### 订单 / 退款 / 支付域

- `GET /orders`
- `POST /orders`
- `GET /refunds`
- `POST /refunds`
- 上传：`uploadFile('/user/upload', ...)`

页面主要依赖字段：

- 订单/退款列表：`data.list` + `data.pagination.total`
- 订单详情页会继续消费订单对象中的 `status/items/expire_at/address/product/commissions`
- 上传统一依赖 `{ code: 0, success: true, data: { url, fileID } }`

#### 分销 / 钱包 / 代理域

- `GET /distribution/overview`
- `GET /distribution/stats`
- `GET /stats/distribution`
- `GET /distribution/team`
- `GET /agent/workbench`
- `GET /agent/orders`
- `POST /agent/restock`
- `GET /agent/wallet`
- `GET /agent/wallet/logs`
- `GET /agent/wallet/recharge-config`
- `POST /agent/wallet/prepay`
- `GET /wallet/info`
- `GET /wallet/commissions`
- `POST /wallet/withdraw`
- `GET /wallet/withdrawals`

页面主要依赖字段：

- 分销概览：`stats/team/userInfo`
- 钱包：`balance/frozen_balance/total_recharge/total_deduct`
- 钱包流水：`data.list` + `data.pagination.total`
- 代理工作台：`pendingShip/month_profit/debt_amount/goods_fund_balance`

#### 内容 / 活动 / 积分域

- `GET /mini-program-config`
- `GET /themes/active`
- `GET /page-content/home`
- `GET /homepage-config`
- `GET /page-content`
- `GET /page-content/brand-news`
- `GET /activity/limited-spot/detail`
- `GET /n/invite-card`
- `POST /upgrade/apply`
- `GET /questionnaire/active`
- `GET /questionnaire/share-eligibility`
- `POST /questionnaire/submit`
- `GET /group/activities`
- `GET /group/my`
- `GET /slash/activities`
- `GET /slash/my/list`
- `POST /slash/start`
- `GET /lottery/prizes`
- `GET /lottery/records`
- `POST /lottery/draw`
- `GET /points/account`
- `GET /points/sign-in/status`
- `POST /points/sign-in`
- `GET /points/tasks`
- `GET /points/logs`
- `GET /rules`

页面主要依赖字段：

- 首页内容：`data.resources` / `data.layout` / `legacy_payload`
- 装修/活动页：对象型 `data`
- 积分页：账户对象 + 日志分页列表

### 4.2 小程序返回体模式

当前确认有 4 类：

1. 详情对象：`{ code, message, data: object }`
2. 列表对象：`{ code, message, data: { list, pagination } }`
3. 裸数组兼容：页面会写成 `res.data || res`
4. 登录专用：`{ success, data|userInfo, is_new_user, level_up }`

结论：

- 页面层已经写出了大量兼容判断，说明云函数返回体并不稳定。

### 4.3 小程序当前已确认问题

#### A. 页面真实在用，但 `ROUTE_TABLE` 未映射

已确认 2 个：

1. `GET /user/favorites/status`
2. `GET /stations/region-from-point`

当前行为：

- 会直接触发 `未映射接口` 拒绝

#### B. `ROUTE_TABLE` 中存在明显别名/漂移

示例：

- `GET /user/info`、`PUT /user/info`
- `GET /user/stats`
- `DELETE /cart/clear`
- `POST /cart/check`
- `POST /orders/:id/confirm-received`
- `GET /orders/:id/pay-status`
- `PUT /addresses/:id/default`
- `GET /distribution/center`
- `GET /distribution/commission-logs`
- `POST /distribution/withdraw`
- `GET /agent`
- `GET /commissions`
- `GET /points`
- `GET /points/summary`
- `GET /coupons`
- `GET /activities`
- `GET /groups`
- `GET /groups/:id`
- `POST /groups/:id/join`
- `GET /slash`
- `GET /lottery`
- `GET /upgrade/eligibility`
- `POST /upgrade`

这些路径里有三类情况：

1. 有些是历史别名，当前页面未用。
2. 有些能在 backend 找到近似能力，但不是同一路径或同一 HTTP 方法。
3. 有些在 backend REST 根本不存在同名口径。

#### C. 成功语义分裂

- 小程序请求层接受 `success === true` 或 `code === 0`
- 大多数页面只认 `res.code === 0`
- `appAuth.js` 只认 `result.success`

这意味着：

- 后端/云函数若只返回 `success: true` 而不返回 `code: 0`，页面可能“请求成功但 UI 不刷新”。

## 5. 管理后台接口盘点

统计结果：

- `admin-ui/src/api/modules` 当前有 13 个模块
- 共定义约 215 个 request 调用
- 路径归一化后，基本都能在当前 `backend/routes/admin` 挂载树中找到对应

### 5.1 管理端模块与页面消费

#### 认证

- 模块：`auth.js`
- 页面：`views/login/index.vue`、`src/store/user.js`、`layout/index.vue`
- 接口：`/login`、`/profile`、`/password`、`/logout`

#### 商品与目录

- 模块：`catalog.js`
- 页面：`views/products/index.vue`、`views/categories/index.vue`
- 复用：`views/content/index.vue`、`views/coupons/index.vue`、`views/group-buy/index.vue`、`views/activities/index.vue`、`views/featured-board/index.vue`
- 接口族：`/products*`、`/categories*`

#### 内容与装修

- 模块：`content.js`、`boards.js`
- 页面：`views/content/index.vue`、`views/materials/index.vue`、`views/reviews/index.vue`、`views/home-sections/index.vue`、`views/featured-board/index.vue`、`views/logs/index.vue`、`views/mass-message/index.vue`
- 接口族：`/banners*`、`/contents*`、`/materials*`、`/material-groups*`、`/reviews*`、`/home-sections*`、`/boards*`、`/logs*`、`/mass-messages*`

#### 营销活动

- 模块：`marketing.js`
- 页面：`views/group-buy/index.vue`、`views/coupons/index.vue`、`views/activities/index.vue`、`views/splash/index.vue`
- 接口族：`/group-buys*`、`/coupons*`、`/coupon-auto-rules`、`/slash-activities*`、`/lottery-prizes*`、`/activity-options`、`/festival-config`、`/global-ui-config`、`/activity-links`、`/splash`

#### 订单履约与财务

- 模块：`ordersFulfillment.js`、`finance.js`
- 页面：`views/orders/index.vue`、`views/logistics/index.vue`、`views/withdrawals/index.vue`、`views/refunds/index.vue`、`views/commissions/index.vue`
- 接口族：`/orders*`、`/logistics/order/:id`、`/withdrawals*`、`/refunds*`、`/commissions*`

#### 组织与账号

- 模块：`partners.js`、`agentSystem.js`
- 页面：`views/dealers/index.vue`、`views/admins/index.vue`、`views/branch-agents/index.vue`、`views/pickup-stations/index.vue`、`views/agent-system/index.vue`、`views/n-system/index.vue`
- 接口族：`/dealers*`、`/admins*`、`/branch-agent-policy`、`/branch-agents/*`、`/pickup-stations*`、`/n-system/*`、`/agent-system/*`、`/upgrade-applications*`

#### 用户与系统

- 模块：`users.js`、`statistics.js`、`system.js`
- 页面：`views/users/index.vue`、`views/dashboard/index.vue`、`views/settings/index.vue`、`views/system-config/index.vue`、`views/membership/index.vue`、`views/ops-monitor/index.vue`
- 接口族：`/users*`、`/statistics/*`、`/dashboard/notifications`、`/settings`、`/system/status`、`/payment-health`、`/feature-toggles`、`/mini-program-config`、`/member-tier-config`、`/operations/dashboard`、`/popup-ad-config`、`/alert-config*`、`/system-configs*`、`/db-indexes*`

### 5.2 管理端页面返回体模式

当前已确认的页面依赖模式：

1. 列表页：
   `res.list` + `res.pagination.total`

2. 配置页：
   直接拿整对象，常见字段组：
   `ORDER/WITHDRAWAL/COMMISSION/USER`
   `brand_config/feature_flags/logistics_config/...`
   `alert_*`

3. 仪表盘/监控页：
   聚合对象，例如：
   `kpi/pending/low_stock/hot_products/recent_orders`
   `tasks/issues/stats/lines/note`

4. 兼容性读取：
   页面里已经出现 `res.data ?? res`、`res?.list || res?.data?.list`

结论：

- 管理端虽然路径基本对齐，但响应体历史并不完全稳定。

### 5.3 管理端当前已确认问题

#### A. 上传协议不一致

前端：

- `admin-ui/src/api/modules/mediaUpload.js`
- 把文件转成 JSON：
  `{ name, mime_type, content_base64 }`

后端：

- `backend/routes/admin/index.js`
- `backend/routes/admin/controllers/adminUploadController.js`
- 要求 `upload.single('file')` / `req.file`

这是当前最高优先级的不一致项。

#### B. 后端已存在但前端未收口

已挂载但前端模块未收口的典型接口：

- `/products/batch-commission`
- `/orders/:id/status`
- `/orders/:id/transfer-agent`
- `/users/:id/history`
- `/users/:id/stock`
- `/logs/stats`
- `/upload/multiple`
- `/storage/signature`
- `/mass-messages/:id/cancel`
- `/mass-messages/tags`
- `/mass-messages/users/search`
- `/mass-messages/preview-count`
- `/mass-messages/statistics`
- `/admins/roles`
- `/rules`
- `/commissions/pending`
- `/commissions/:id`
- 整组 `/themes/*`
- 整组 `/env-*`

#### C. 路由文件已存在但未挂载

以下文件存在，但没有接入当前 `backend/routes/admin/index.js`：

- `backend/routes/admin/ai_agent.js`
- `backend/routes/admin/ai-config.js`
- `backend/routes/admin/ai-ops.js`
- `backend/routes/admin/logs.js`
- `backend/routes/admin/questionnaire.js`

#### D. 前端已定义但页面未消费

典型例子：

- `statistics.js` 除 `getDashboardOverview` 外多数未用
- `system.js` 的 `getFeatureToggles/updateFeatureToggles/getDebugProcess/getDebugDbPing` 未真正消费
- `ordersFulfillment.js` 的 `updateShippingInfo/batchShipOrders` 未消费
- `agentSystem.js` 的 `getExitApplications/reviewExitApplication` 未消费
- `content.js` 的 `toggleSectionVisible` 未消费

## 6. 当前优先级建议

按收口价值排序：

1. 统一上传协议
   管理端要么改成 `FormData + file`，要么后端补 JSON base64 上传入口；现在两边不是同一种协议。

2. 收口小程序成功包装
   强制所有云函数结果统一为 `{ code: 0, message, data }`，不要再混 `success` 和 `code`。

3. 修小程序 `ROUTE_TABLE` 缺口
   先补上当前页面真实在用但未映射的接口：
   `GET /user/favorites/status`
   `GET /stations/region-from-point`

4. 清理 backend 未挂载管理路由
   未挂载就归档；要保留就接入并落文档，不要继续处于“写了但没生效”的状态。

5. 建立接口单一真相源
   以本文件为临时基线，下一步应把：
   小程序接口表
   管理端模块表
   backend admin/public 路由表
   收成一份长期维护文档，而不是继续散落在历史资料中。
