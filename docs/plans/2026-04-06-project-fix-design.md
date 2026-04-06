# 项目全面重构与修复方案

> **日期:** 2026-04-06  
> **状态:** 设计阶段（待确认）  
> **前置审计:** `project-audit-report-2026-04-06.md`

---

## 一、项目现状快照

| 指标 | 数值 |
|------|------|
| 后端文件数 | 331 (291 JS) |
| Service 层文件 | 30 个 |
| Controller 层文件 | ~36 个（含 admin 子目录） |
| 测试文件 | **5 个**（覆盖率极低） |
| OrderCoreService 行数 | **1743 行 / 79KB**（上帝对象） |
| console.log 总数（controllers） | **117 处** |
| Math.random() 散布文件 | **17 个** |
| 空 catch 块 | 3+ 处（controllers 层） |
| 直接 DB 操作的 Controller | **8+ 个** |

### 已识别的 P0 问题

| # | 问题 | 文件 | 风险 |
|---|------|------|------|
| S1 | 门户明文密码通过 API 返回 | `userController.js:497` | 密码泄露 |
| S2 | openid 大面积泄露到前端 | `authController.js:18,192,197`, `userController.js` | 用户隐私 |
| S3 | 微信支付回调异常不返回 FAIL | `upgradeController.js:246-248` | 无限重试 |
| S4 | Service 反向依赖 Controller | `OrderCoreService.js:22-24` | 循环耦合 |
| S5 | Math.random() 用于安全场景 | 17 个文件 | 可预测性 |

---

## 二、修复策略：四阶段渐进式

### 核心原则

1. **每阶段独立可交付** — 任何一个 Phase 完成后都可以上线
2. **从外向内** — 安全 > 架构 > 清洁 > 测试，越靠后的改动越大
3. **不引入新功能** — 纯修复和重构，零业务逻辑变更
4. **保持向后兼容** — API 接口签名不变，内部实现优化

```
Phase 1: 🔴 安全止血          → 预计 3-4 小时
    ↓
Phase 2: 🏗️  架构纠偏         → 预计 6-8 小时
    ↓
Phase 3: 🧹 代码清洁           → 预计 4-5 小时
    ↓
Phase 4: ✅ 测试基建           → 预计 5-6 小时
```

---

## 三、各阶段详细设计

### Phase 1: 🔴 安全止血 (Security First)

**目标:** 修复所有 P0/P1 安全漏洞，确保系统不会泄露敏感数据或被滥用。

#### Task 1.1: 移除明文密码返回
- **文件:** `backend/controllers/userController.js:492-499`
- **改动:** 删除 `initial_password: plain`，改为仅返回 `password_issued: true`
- **影响:** 前端 portal 页面需要调整展示逻辑（不再显示密码）

#### Task 1.2: openid 脱敏处理
- **文件:** `backend/controllers/authController.js:17-20,189-200`
- **改动:**
  - JWT payload 中移除 `openid`，改用内部 user.id 映射
  - 登录响应中删除顶层 `openid` 和 `userInfo.openid` 字段
  - 前端如需 openid 调用微信 API，应使用 `wx.getStorageSync()` 自行获取
- **新增工具函数:** `backend/utils/openidHelper.js` — 统一管理 openid 访问

#### Task 1.3: 微信支付回调修复
- **文件:** `backend/controllers/upgradeController.js:246-248`
- **改动:** 在 catch 块末尾添加 `return res.status(500).send('FAIL');`
- **同时检查:** `orderController.js` 中所有支付回调是否同样缺失

#### Task 1.4: 循环依赖解耦
- **文件:** `backend/services/OrderCoreService.js:22-24`
- **改动:**
  - 将 `generatePickupCredentials` 从 `pickupController` 提取到 `backend/services/PickupService.js`
  - 将 `attributeRegionalProfit` 从 `stationController` 提取到 `backend/services/StationProfitService.js`
  - 将 `calcCouponDiscount` + `isCouponApplicable` 从 `couponController` 提取到 `backend/services/CouponCalcService.js`
  - 更新 `OrderCoreService` 的 import 改为指向新 Service

#### Task 1.5: 统一安全随机数
- **新建文件:** `backend/utils/secureRandom.js`
- **提供函数:**
  ```js
  // 加密安全随机数（用于订单号、邀请码等）
  function secureRandomHex(length) 
  // 数字验证码（4-6位）
  function secureNumericCode(digits)
  ```
- **批量替换:** 17 个文件中的 `Math.random()` 调用按场景替换
- **保留原样:** 纯 UI 相关的非安全随机（抽奖动画等），但加注释标注

#### Phase 1 验收标准
- [ ] API 响应中不含任何明文密码或 openid
- [ ] 所有微信支付回调异常路径均返回 FAIL/SUCCESS
- [ ] Service 层零 Controller 依赖（反向依赖清除）
- [ ] 所有安全相关随机数使用 crypto.randomBytes

---

### Phase 2: 🏗️ 架构纠偏 (Architecture Fix)

**目标:** 建立正确的分层架构，Controller 只做 HTTP 层职责，Service 承载全部业务逻辑。

#### Task 2.1: 建立 Controller 规范基类
- **新建文件:** `backend/base/BaseController.js`
- **功能:** 提供 `success(data)`、`error(message, code)`、`validate(req, rules)` 三个标准方法
- **目的:** 统一所有 Controller 的响应格式

#### Task 2.2: 迁移 Controller 中的数据库操作到 Service
按优先级排序：

| 优先级 | Controller | 要提取的逻辑 |
|--------|-----------|-------------|
| P0 | `walletController.js` | 3处直接 DB 操作 → `AgentWalletService` |
| P0 | `refundController.js` | 3处直接 DB 操作 → 新建 `RefundProcessService` |
| P1 | `agentController.js` | 3处直接 DB 操作 → `AgentService`（增强已有） |
| P1 | `pickupController.js` | 2处直接 DB 操作 → `PickupService`（Task 1.4 新建） |
| P1 | `upgradeController.js` | 2处直接 DB 操作 → `UpgradeService`（增强已有） |
| P2 | `stationController.js` | 1处 → `StationProfitService` |
| P2 | `slashController.js` | 2处 → 增强 `GroupCoreService` |
| P2 | `lotteryController.js` | 1处 → 新建 `LotteryService` |

#### Task 2.3: 拆分 OrderCoreService 上帝对象
**这是本阶段最大任务。** 当前 `OrderCoreService.js` 1743 行承担了：
- 下单流程
- 支付处理
- 发货逻辑
- 收货确认
- 取消逻辑
- 退款协同
- 优惠券计算
- 积分计算
- 团购协同

**拆分方案:**
```
OrderCoreService.js (协调器 ~300行)
├── OrderCreationService.js      (~250行) — 下单主流程
├── OrderPaymentService.js       (~200行) — 支付/回调
├── OrderFulfillmentService.js   (~180行) — 发货/收货
├── OrderCancellationService.js  (~150行) — 取消/超时取消
├── OrderCouponIntegration.js    (~120行) — 订单-优惠券交互
└── OrderPointIntegration.js     (~80行)  — 订单-积分交互
```

**迁移策略:** 先建新文件，将方法逐个搬移，保持原方法签名不变，最后 `OrderCoreService` 变为薄代理层委托调用。

#### Task 2.4: 统一错误处理风格
当前存在两种风格混用：
```js
// 风格A: 正确用法（走全局 errorHandler）
next(err);

// 风格B: 绕过 errorHandler
res.json({ code: -1, message: 'xxx' });
catch(e) { res.json({ code: -1 }); }
```

**统一为:** 全部使用 `next(err)` + 全局 `errorHandler` 分类处理。
- 对需要特定错误码的场景，使用自定义 Error 类：
  ```js
  class BusinessError extends Error {
    constructor(message, statusCode = 400, errorCode = 'BUSINESS_ERROR') {
      super(message);
      this.statusCode = statusCode;
      this.errorCode = errorCode;
    }
  }
  ```
- **新建文件:** `backend/errors/BusinessError.js`

#### Phase 2 验收标准
- [ ] 所有 Controller 函数体 < 50 行（纯 req/res 转换）
- [ ] 所有数据库操作集中在 Service 层
- [ ] `OrderCoreService.js` < 400 行（纯协调器）
- [ ] 零 `res.json({...})` 出现在 catch 块中

---

### Phase 3: 🧹 代码清洁 (Code Cleanup)

**目标:** 清除噪音代码，提升可读性和可维护性。

#### Task 3.1: 清除 console.log 残留
- **范围:** `backend/controllers/` 目录下 23 个文件共 117 处
- **规则:**
  - 错误日志 → 替换为 `logError(...)` （已有的 winston logger）
  - 信息日志 → 替换为 `logXxx(...)` 对应 category logger
  - 调试日志 → 直接删除（除非有 `DEBUG` 开关保护）
  - 已有 logger 引用的文件优先复用

#### Task 3.2: 清理空 catch 块和吞错模式
- **范围:** 全项目搜索
- **发现位置:** `activityController`, `noticeController`, `pickupController`, `upgradeController:241` 等
- **规则:**
  - 故意忽略的错误（如通知发送失败）：必须加注释说明原因
  ```js
  // 通知非关键路径，失败不影响主流程
  sendNotification(...).catch(() => {});
  ```
  - 不应吞错的：改为 `logError` 或向上抛出

#### Task 3.3: 清除死代码和注释掉的代码块
- **方式:** 全项目搜索 `// console.`、`/*` 多行注释块、废弃函数
- **注意:** 需要人工确认每个实例是否真的无用（git blame 辅助判断）

#### Task 3.4: Magic Number → 常量引用
- **目标文件:** `config/constants.js`（已建立框架，需补充）
- **待提取常量示例:**
  ```
  ORDER_NO.SEQ_MODULO = 10000        # OrderCoreService.js:37
  ORDER_NO.RANDOM_LENGTH = 6         # OrderCoreService.js:39
  AVATAR_MAX_BYTES = 2 * 1024 * 1024  # 如果有硬编码
  NICKNAME_MAX_LENGTH = 20            # 如果有硬编码
  ```

#### Task 3.5: 补充 JSDoc 和关键路径注释
- **重点:** 每个 Service 的公共方法必须有 @param @returns @throws
- **顺序:** 先 Core Services（OrderCore, Commission, Wallet），再外围

#### Phase 3 验收标准
- [ ] controllers 目录下零裸 `console.log`
- [ ] 每个空 catch 都有注释解释原因
- [ ] 零无注释的 Magic Number
- [ ] 所有公共 API 有 JSDoc

---

### Phase 4: ✅ 测试基建 (Test Foundation)

**目标:** 建立测试框架，覆盖核心业务路径，防止回归。

#### Task 4.1: 搭建测试基础设施
- **安装依赖:** `jest`（或保持现有测试运行器一致）
- **新建文件:** `backend/jest.config.js`
- **新建文件:** `backend/__tests__/setup.js` — 测试环境初始化（内存 SQLite / mock Sequelize）
- **新建文件:** `backend/__tests__/helpers/factory.js` — 测试数据工厂（User/Order/Product 构造器）

#### Task 4.2: 核心 Service 单元测试（按优先级）
已有测试文件作为参考模板：
- `__tests__/services/PricingService.test.js` (7.77KB)
- `__tests__/services/OrderNumberService.test.js` (3.75KB)
- `__tests__/utils/orderGuards.test.js` (1.35KB)

**新增性测试清单:**

| 优先级 | 目标文件 | 覆盖场景 |
|--------|---------|---------|
| P0 | `PricingService.js` | 折扣计算边界值、等级价格查询 |
| P0 | `OrderNumberService.js` | 订单号唯一性、时间格式 |
| P0 | `orderGuards.js` | 优惠券归还条件判断 |
| P1 | `CommissionService.js` | 佣金计算（直推/间推/N路径差价） |
| P1 | `AgentWalletService.js` | 冻结/解冻/提现余额校验 |
| P1 | `OrderCreationService.js` | 下单参数校验、库存扣减 |
| P2 | `RefundProcessService.js` | 退款金额计算、佣金回退 |
| P2 | `CouponCalcService.js` | 优惠券适用性判断 |

#### Task 4.3: 关键 Controller 集成测试
- **目标:** 验证 HTTP 层正确调用 Service 并格式化响应
- **使用 supertest**
- **覆盖:** 登录/注册、下单、支付回调、升级申请

#### Task 4.4: CI 测试脚本配置
- **修改:** `package.json` scripts 添加 `"test": "jest --coverage"`
- **目标覆盖率:** 核心路径 > 60%（Phase 4 完成时）

#### Phase 4 验收标准
- [ ] `npm test` 可一键执行并全部通过
- [ ] PricingService 覆盖率 > 80%
- [ ] CommissionService 覆盖率 > 70%
- [ ] Order creation 主路径集成测试通过
- [ ] CI 脚本可运行

---

## 四、风险评估与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|:----:|:----:|----------|
| OrderCoreService 拆分引入回归 bug | 高 | 高 | 每搬一个方法立即跑现有测试 + 手动验证下单全流程 |
| openid 移除导致前端功能异常 | 中 | 中 | 先 grep 前端所有 openid 使用点，逐一确认替代方案 |
| Controller 重构改变响应格式 | 低 | 高 | 保持完全相同的 JSON 结构，只改变内部实现路径 |
| 清理 console.log 导致排查问题困难 | 低 | 中 | 全部迁移到 winston logger，输出到同一路径的 log 文件 |

---

## 五、预估工时汇总

| Phase | 内容 | 预估工时 |
|-------|------|---------|
| Phase 1 | 安全止血 | 3-4h |
| Phase 2 | 架构纠偏 | 6-8h |
| Phase 3 | 代码清洁 | 4-5h |
| Phase 4 | 测试基建 | 5-6h |
| **合计** | | **18-23h** |

> 注：Phase 内部 Task 大部分可并行执行（尤其是 Phase 3 的清理工作），实际 wall-time 可能更短。

---

## 六、下一步

确认此方案后，将生成**可逐条执行的 Implementation Plan**（包含精确文件路径、代码 diff、验证命令），存入 `docs/plans/2026-04-06-project-fix-plan.md`。

**请确认：**
1. 四个阶段的顺序和范围是否合理？
2. 是否有某些 Task 你希望跳过或调整优先级？
3. 工时预估是否在你的预期范围内？
