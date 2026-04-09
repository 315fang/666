# 后台页面与 API 映射表

## 1. 目的

这份文档解决一个实际问题：

**后台某个页面到底依赖哪组 API，应该优先看哪里。**

当前后台已经不是单后端结构，而是：

- [admin-ui](C:\Users\21963\WeChatProjects\zz\admin-ui)
- [backend](C:\Users\21963\WeChatProjects\zz\backend)
- [backend/cloudrun-admin-service](C:\Users\21963\WeChatProjects\zz\backend\cloudrun-admin-service)

如果没有这份映射表，接手者很容易在页面、旧后端、CloudRun 新底座之间来回乱找。

## 2. 当前管理端 API 模块入口

统一导出入口在：

- [admin-ui/src/api/index.js](C:\Users\21963\WeChatProjects\zz\admin-ui\src\api\index.js)

当前业务域模块包括：

- `auth`
- `statistics`
- `catalog`
- `ordersFulfillment`
- `marketing`
- `users`
- `finance`
- `partners`
- `content`
- `mediaUpload`
- `system`
- `agentSystem`
- `boards`

## 3. 页面分组与主 API 对照

### 3.1 交易履约域

页面目录：

- `orders`
- `logistics`
- `refunds`

主 API 模块：

- `ordersFulfillment`
- `finance`
- `system`

关键接口：

- `GET /orders`
- `GET /orders/:id`
- `PUT /orders/:id/ship`
- `PUT /orders/:id/shipping-info`
- `PUT /orders/:id/amount`
- `PUT /orders/:id/remark`
- `PUT /orders/:id/force-complete`
- `PUT /orders/:id/force-cancel`
- `POST /orders/batch-ship`
- `GET /logistics/order/:id`

优先阅读：

- [docs/internals/订单交易主链路梳理.md](C:\Users\21963\WeChatProjects\zz\docs\internals\订单交易主链路梳理.md)
- [docs/internals/订单支付售后状态枚举表.md](C:\Users\21963\WeChatProjects\zz\docs\internals\订单支付售后状态枚举表.md)
- [docs/internals/支付闭环说明.md](C:\Users\21963\WeChatProjects\zz\docs\internals\支付闭环说明.md)

### 3.2 商品目录域

页面目录：

- `products`
- `categories`

主 API 模块：

- `catalog`
- `mediaUpload`

关注点：

- 商品、分类、SKU、上下架、主图与详情图
- 当前长期目标是 `products + skus + materials` 标准模型

优先阅读：

- [docs/architecture/数据库与核心模型总览.md](C:\Users\21963\WeChatProjects\zz\docs\architecture\数据库与核心模型总览.md)
- [docs/guides/图片素材字段规范.md](C:\Users\21963\WeChatProjects\zz\docs\guides\图片素材字段规范.md)

### 3.3 内容与装修域

页面目录：

- `content`
- `materials`
- `home-sections`
- `splash`
- `mass-message`
- `reviews`
- `content-map`

主 API 模块：

- `content`
- `mediaUpload`
- `boards`

当前已确认的内容类接口包括：

- `GET/POST/PUT/DELETE /banners`
- `GET/POST/PUT/DELETE /materials`
- `GET/POST/PUT/DELETE /material-groups`
- `POST /material-groups/move`
- `GET/POST/PUT/DELETE /contents`
- `GET/PUT /reviews`
- `GET /home-sections`
- `GET /home-sections/schemas`
- `POST/PUT/DELETE /home-sections`
- `PUT /home-sections/:id/toggle`
- `POST /home-sections/sort`

优先阅读：

- [docs/guides/图片素材字段规范.md](C:\Users\21963\WeChatProjects\zz\docs\guides\图片素材字段规范.md)
- [docs/internals/字段兼容清理清单.md](C:\Users\21963\WeChatProjects\zz\docs\internals\字段兼容清理清单.md)

### 3.4 用户、会员、履约协同域

页面目录：

- `users`
- `membership`
- `dealers`
- `pickup-stations`

主 API 模块：

- `users`
- `partners`
- `system`

当前特点：

- 这部分页面残留 `user_id`、`nickname`、`avatar_url` 兼容较多
- 不能只看页面字段，要同时看数据口径清单

优先阅读：

- [docs/internals/权限与角色模型总览.md](C:\Users\21963\WeChatProjects\zz\docs\internals\权限与角色模型总览.md)
- [docs/internals/字段兼容清理清单.md](C:\Users\21963\WeChatProjects\zz\docs\internals\字段兼容清理清单.md)

### 3.5 分销、佣金、提现、代理域

页面目录：

- `commissions`
- `withdrawals`
- `agent-system`
- `branch-agents`
- `n-system`
- `core-center`

主 API 模块：

- `finance`
- `partners`
- `agentSystem`

当前判断：

- 这部分是后台最复杂、最容易继续石山化的区域
- 优先做规则收口，不优先做表面 UI 重构

优先阅读：

- [docs/internals/分销与佣金逻辑梳理.md](C:\Users\21963\WeChatProjects\zz\docs\internals\分销与佣金逻辑梳理.md)
- [docs/internals/分销资金流水说明.md](C:\Users\21963\WeChatProjects\zz\docs\internals\分销资金流水说明.md)

### 3.6 活动与营销域

页面目录：

- `activities`
- `group-buy`
- `coupons`
- `featured-board`

主 API 模块：

- `marketing`
- `boards`
- `content`

当前策略：

- 这部分不作为本轮 CloudBase 收口优先级
- 仅做必要兼容和边界记录

### 3.7 系统治理域

页面目录：

- `dashboard`
- `settings`
- `system-config`
- `admins`
- `logs`
- `ops-monitor`

主 API 模块：

- `auth`
- `statistics`
- `system`

关键关注点：

- 登录态
- 管理员资料
- 角色权限
- 功能开关
- 操作日志
- 环境健康检查

优先阅读：

- [docs/internals/权限与角色模型总览.md](C:\Users\21963\WeChatProjects\zz\docs\internals\权限与角色模型总览.md)
- [docs/rules/document-governance-rules.md](C:\Users\21963\WeChatProjects\zz\docs\rules\document-governance-rules.md)

## 4. 当前最值得优先清理的页面簇

根据兼容字段审计，后台前端当前最值得优先收口的是：

1. `orders`
2. `content`
3. `home-sections`
4. `splash`
5. `commissions`
6. `pickup-stations`

原因：

- 旧字段引用密度高
- 直接影响交易、素材、用户、分销这些高风险域

## 5. 使用规则

1. 改后台页面前，先在这份文档里定位所属业务域。
2. 确认该页面主依赖的是 CloudRun 新底座，还是仍需兼容旧主系统接口。
3. 变更页面依赖接口后，必须同步更新本文件。
4. 不允许继续把页面和接口的真实依赖关系留在聊天记录里。
