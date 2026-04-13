# 后端集成测试验收报告

> 验收日期：2026-04-12
> 测试方式：HTTP 级 API 集成测试（supertest + 真实 MySQL）
> 测试数据库：Docker MySQL 8.0 本地容器（端口 3307，库名 s2b2c_db_test）
> 测试结果：**4 套件 / 20 用例 / 全部通过**

---

## 一、验收范围总览

| 模块 | 用例数 | 状态 | 测试文件 |
|------|--------|------|----------|
| 订单全生命周期 | 6 | 全部通过 | `order-lifecycle.integration.test.js` |
| 佣金链路 | 7 | 全部通过 | `commission-chain.integration.test.js` |
| 退款链路 | 4 | 全部通过 | `refund-chain.integration.test.js` |
| 升级链路 | 4 | 全部通过 | `upgrade-chain.integration.test.js` |

---

## 二、各模块验收明细

### 2.1 订单全生命周期

测试覆盖订单从创建到终态的完整流转，以及异常分支。

| # | 用例 | 验证点 | API |
|---|------|--------|-----|
| 1 | 创建订单 | status=pending，total_amount > 0 | `POST /api/orders` |
| 2 | 手动支付 | status=paid，paid_at 非空 | `POST /api/orders/:id/pay` |
| 3 | 后台发货（平台） | status=shipped，tracking_no 写入，shipped_at 非空 | `PUT /admin/api/orders/:id/ship` |
| 4 | 确认收货 | status=completed，completed_at 非空 | `POST /api/orders/:id/confirm` |
| 5 | 重复确认拦截 | 已完成订单再次确认返回非 200 | `POST /api/orders/:id/confirm` |
| 6 | 取消+库存恢复 | status=cancelled，商品库存恢复至下单前 | `POST /api/orders/:id/cancel` |

已验证的关联模块：
- **参数校验** — `items[]` 数组格式校验、address_id 校验（middleware/validation.js）
- **库存管理** — 下单扣库存、取消恢复库存
- **JWT 用户认证** — Bearer token 验证通过（middleware/auth.js）
- **管理员认证** — Admin JWT + findByPk 验证通过（middleware/adminAuth.js）

### 2.2 佣金链路

构造三级代理关系链（C1 → C2 → B1），测试代理发货佣金的完整生命周期。

| # | 用例 | 验证点 | 关键服务 |
|---|------|--------|----------|
| 1 | C1 买家创建订单 | 订单创建成功，agent_id 关联正确 | OrderCreationService |
| 2 | 手动支付 | status=paid | OrderPaymentService |
| 3 | 代理发货产生佣金 | commission_logs 有 gap/agent_fulfillment 记录，状态为 frozen | CommissionService.calculateGapAndFulfillmentCommissions |
| 4 | 确认收货 | status=completed | OrderFulfillmentService |
| 5 | 售后期到期→状态流转 | 佣金 frozen → pending_approval | OrderJobService.processRefundDeadlineExpired |
| 6 | 平台发货无级差佣金 | fulfillment_type=Company，无 gap 类型 commission_logs | AdminOrderService |
| 7 | 普通买家平台发货 | 无代理关系的订单不产生级差佣金 | CommissionService |

已验证的关联模块：
- **代理钱包** — AgentWalletAccount 余额校验、发货扣款（AgentWalletService）
- **佣金状态机** — frozen → pending_approval 完整流转
- **履约类型判定** — Agent_Pending → Agent / Company 自动判定

### 2.3 退款链路

测试已发货订单的退款申请流程及库存回滚。

| # | 用例 | 验证点 | API |
|---|------|--------|-----|
| 1 | 创建+支付+发货 | 前置条件：订单达到 shipped 状态 | 组合调用 |
| 2 | 已发货申请退款 | Refund 记录创建，status=pending | `POST /api/refunds` |
| 3 | 不能重复申请 | 同一订单第二次申请返回 code=-1 | `POST /api/refunds` |
| 4 | 取消未付款+库存恢复 | cancelled 后库存恢复至下单前 | `POST /api/orders/:id/cancel` |

已验证的关联模块：
- **退款控制器** — 参数校验、订单状态校验、重复申请拦截（refundController.js）
- **库存回滚** — 取消订单后 product.stock 精确恢复（OrderCancellationService）

### 2.4 升级链路

测试用户角色的自动升级与手动申请升级。

| # | 用例 | 验证点 | 关键服务 |
|---|------|--------|----------|
| 1 | 满额自动升级 C1 | 399元下单支付后 role_level: 0→1 | OrderPaymentService._markOrderAsPaid |
| 2 | 低价不升级 | 99元下单支付后 role_level 仍为 0 | 同上（阈值校验） |
| 3 | 提交升级申请 | API 可达，不返回 500 | `POST /api/upgrade/apply` |
| 4 | 查询我的申请 | 返回 200 | `GET /api/upgrade/my` |

已验证的关联模块：
- **自动升级阈值** — 首单满 299 自动从 Guest(0) 升为 Member(1)
- **升级申请 API** — 路由注册、认证中间件、控制器可用

---

## 三、涉及的 API 端点汇总

### 用户端 API（Bearer JWT）

| 方法 | 路径 | 用途 | 状态 |
|------|------|------|------|
| POST | `/api/orders` | 创建订单 | 已验收 |
| POST | `/api/orders/:id/pay` | 手动支付（测试路由） | 已验收 |
| POST | `/api/orders/:id/confirm` | 确认收货 | 已验收 |
| POST | `/api/orders/:id/cancel` | 取消订单 | 已验收 |
| POST | `/api/refunds` | 申请退款 | 已验收 |
| POST | `/api/upgrade/apply` | 提交升级申请 | 已验收 |
| GET | `/api/upgrade/my` | 查询我的升级申请 | 已验收 |

### 管理端 API（Admin JWT）

| 方法 | 路径 | 用途 | 状态 |
|------|------|------|------|
| PUT | `/admin/api/orders/:id/ship` | 后台发货 | 已验收 |

---

## 四、涉及的核心服务汇总

| 服务 | 验证范围 | 状态 |
|------|----------|------|
| OrderCreationService | 订单创建、库存扣减、地址快照、参数校验 | 已验收 |
| OrderPaymentService | 手动支付、状态流转、自动升级触发 | 已验收 |
| OrderFulfillmentService | 确认收货、completed 状态 | 已验收 |
| OrderCancellationService | 取消订单、库存恢复 | 已验收 |
| AdminOrderService | 后台发货、代理/平台履约判定 | 已验收 |
| CommissionService | 级差佣金计算、agent_fulfillment 佣金、冻结状态 | 已验收 |
| OrderJobService | 售后期到期处理、佣金状态流转 | 已验收 |
| AgentWalletService | 代理钱包余额校验、发货扣款 | 已验收 |
| MemberTierService | 支付后自动升级（阈值判定） | 已验收 |
| refundController | 退款申请、重复申请拦截 | 已验收 |
| upgradeController | 升级申请提交、申请查询 | 已验收 |

---

## 五、测试过程中发现的问题

以下问题在测试过程中被观测到，不影响测试通过，但属于需要关注的潜在风险。

### 5.1 通知服务 FK 约束错误（低优先级）

`notificationUtil.js` 在向管理员发送退款通知时，使用 `user_id=0` 作为接收者，触发外键约束失败。该错误被 try-catch 兜底不影响主流程，但说明管理员通知的 user_id 取值逻辑有误。

- 位置：`controllers/refundController.js:148`
- 现象：`ER_NO_REFERENCED_ROW_2 — notifications.user_id FK → users.id`

### 5.2 代理发货事务锁竞态（中优先级）

`payOrder` 事务提交后立即调用代理发货，会触发 MySQL lock wait timeout。说明支付后置任务（积分、升级、区域利润等）可能存在未及时释放的长事务。

- 现象：`ER_LOCK_WAIT_TIMEOUT`（MySQL 默认 50s）
- 影响：生产环境中支付和发货间有时间差，不太容易触发；但在高并发场景下有风险

### 5.3 Admin 模型字段命名

`Admin` 模型使用 `password_hash` + `salt` 字段（PBKDF2），而非 bcrypt 的单字段 `password`。测试初期因字段不匹配导致 admin 创建失败，已在测试辅助函数中修正。

---

## 六、未覆盖模块

以下模块未在本轮集成测试中覆盖，需后续补充或通过其他方式验证。

| 模块 | 原因 |
|------|------|
| 微信支付（prepay + notify） | 依赖微信沙箱环境 |
| 管理员审批佣金 | 需补充管理端操作测试 |
| 管理员审批退款 | 需补充管理端操作测试 |
| 管理员审批升级 | 需补充管理端操作测试 |
| 提现/钱包 | 未编写测试 |
| 分红池 | 未编写测试 |
| 拼团/砍价/抽奖 | 营销模块，优先级较低 |
| N 路径价格体系 | 业务复杂度高，需独立测试 |
| 优惠券 | 未编写测试 |
| 积分体系 | 支付后有积分发放，但未独立验证 |

---

## 七、测试基础设施

| 组件 | 位置 |
|------|------|
| 环境变量 | `backend/.env.test` |
| Jest 配置 | `backend/jest.integration.config.js` |
| 运行命令 | `npm run test:integration` |
| 数据库初始化 | `backend/__tests__/integration/dbInit.js` |
| 测试辅助函数 | `backend/__tests__/integration/testHelpers.js` |
| Docker 容器 | `docker start s2b2c-test-mysql` |

运行前确保 Docker MySQL 容器已启动：

```bash
docker start s2b2c-test-mysql
cd backend && npm run test:integration
```
