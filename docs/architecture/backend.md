# 后端架构

## 技术栈

- Node.js
- Express
- Sequelize
- MySQL

## 分层约定

- `routes/`: 只做路由注册和中间件挂载
- `controllers/`: 处理 request / response
- `services/`: 承载业务逻辑
- `models/`: Sequelize 模型
- `middleware/`: 鉴权、权限、错误处理、校验
- `utils/`: 工具与基础能力

## 当前关键入口

- 应用装配：`backend/app.js`
- 服务启动：`backend/server.js`
- 启动编排服务：`backend/services/StartupService.js`
- 后台权限：`backend/middleware/adminAuth.js`
- 权限目录：`backend/config/adminPermissionCatalog.js`

## 后台管理路由现状

`backend/routes/admin/index.js` 已收口为聚合入口，当前按领域拆为：

- `backend/routes/admin/content.js`
- `backend/routes/admin/system.js`
- `backend/routes/admin/finance.js`
- `backend/routes/admin/organization.js`

仍保留的专项入口：

- `backend/routes/admin/debug.js`
- `backend/routes/admin/env-check.js`
- `backend/routes/admin/mass-message.js`
- `backend/routes/admin/themes.js`

保留策略结论：

- `debug.js` 继续保留独立入口，因为它是高权限运维调试域，天然需要与常规业务路由隔离
- `env-check.js` 继续保留独立入口，因为它同时依赖 `adminAuth` 和 `super_admin` 角色校验，属于只读环境核查能力
- `mass-message.js` 继续保留独立入口，因为它已经形成完整子域，包含列表、详情、目标筛选、发送与统计，不适合回塞进聚合入口
- `index.js` 继续只承担“聚合注册 + 权限挂载”，不再回退成大杂烩路由文件

## 订单域现状

订单主链路已经开始从大服务拆分，但尚未彻底完成。

当前关键文件：

- `backend/services/OrderCoreService.js`
- `backend/services/OrderCreationService.js`
- `backend/services/OrderPaymentService.js`
- `backend/services/OrderFulfillmentService.js`
- `backend/controllers/orderController.js`

当前判断：

- 方向是对的
- 拆分未收尾
- 仍需继续清理控制层残留和服务边界

## 测试现状

- 当前测试框架：Jest
- 当前基线：`backend npm test`
- 当前状态：`9 suites passed / 88 tests passed`

已补上的关键测试：

- `OrderNumberService`
- `PricingService`
- `TransactionHelper`
- `orderController`
- `adminAuth.checkPermission`
- `admin` 路由关键权限路径（商品、订单金额调整、日志、调试入口、环境检查、群发消息）

## 下一步重点

1. 拆 `backend/server.js`
2. 继续收口 `backend/controllers/orderController.js`
3. 扩充订单主链路与权限测试
4. 清理服务层残留耦合和历史兼容噪音
