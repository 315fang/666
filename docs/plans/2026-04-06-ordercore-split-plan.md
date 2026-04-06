# OrderCoreService 拆分方案

> **日期**: 2026-04-06  
> **分析文件**: `backend/services/OrderCoreService.js` (1745 行)  
> **目标**: 将"上帝对象"拆分为协调器 + 多个专职 Service

---

## 一、当前文件全景概览

### 1.1 依赖清单 (第7-28行)

| 类别 | 依赖 | 用途 |
|------|------|------|
| **Models** | `Order, Product, SKU, User, Cart, CommissionLog, Address, Notification, AppConfig, AgentWalletLog, SlashRecord, SlashActivity, GroupActivity, GroupOrder, GroupMember, ServiceStation, sequelize` | 数据库操作 |
| **Models** | `UserCoupon` | 优惠券模型 |
| **Utils** | `notificationUtil.sendNotification` | 发送通知 |
| **Utils** | `Op (sequelize)` | 查询操作符 |
| **Config** | `constants` | 常量定义 |
| **Utils** | `logger (logOrder/logCommission/error)` | 日志记录 |
| **Utils** | `wechat (createUnifiedOrder/buildJsApiParams/decryptNotifyResource/verifyNotifySign/queryJsapiOrderByOutTradeNo)` | 微信支付 V3 |
| **Services** | `PointService` | 积分服务 |
| **Services** | `LimitedSpotService` | 限时抢购服务 |
| **Services** | `CommissionService` | 佣金计算服务 |
| **Services** | `MemberTierService` | 会员等级服务 |
| **Services** | `AgentWalletService` | 货款钱包服务 |
| **Services** | `PricingService` | 定价服务 |
| **Services** | `WechatShoppingOrderService` | 微信购物单服务 |
| **Services** | `PickupService.generatePickupCredentials` | 自提核销凭证 |
| **Services** | `StationProfitService.attributeRegionalProfit` | 地区分润 |
| **Services** | `CouponCalcService (calcCouponDiscount/isCouponApplicable)` | 优惠券计算 |
| **Utils** | `skuId.normalizeSkuIdForFk` | SKU ID 规范化 |
| **Utils** | `orderGuards.shouldRestoreCoupon` | 退券守卫 |
| **Utils** | `secureRandom.secureRandomHex` | 安全随机数 |

**共引用 16 个 Model + 11 个 Service/Util + 1 个 Config**

---

## 二、函数/方法完整清单

### 2.1 文件级辅助函数（非 class 方法）

| # | 函数名 | 行号范围 | 功能描述 | 建议归属子模块 |
|---|--------|----------|----------|----------------|
| F1 | `generateOrderNo()` | 31-44 | 生成唯一订单号 (ORD + 时间戳 + 序列 + 随机) | **OrderCalcService / OrderCreationService** |
| F2 | `buildWxJsapiShoppingDescription(order, productName)` | 47-58 | 构建微信 JSAPI 支付描述文字（<=127字符） | **OrderPaymentService** |
| F3 | `runAfterCommit(transaction, task)` | 60-75 | 事务提交后异步执行回调的通用工具 | **TransactionHelper (通用工具)** |
| F4 | `scheduleShoppingOrderUploadAfterWechatPay(paidOrderId, notifySnap)` | 78-95 | 支付成功后异步上报小程序购物订单 | **OrderPaymentService** |
| F5 | `calcShippingFeeByPolicy(policy, address)` | 97-106 | 根据包邮策略和地址计算运费（偏远地区加收） | **OrderCalcService** |
| F6 | `_markOrderAsPaid(order, t)` | 108-266 | 标记订单已支付（核心！含子订单同步、成长值/积分发放、会员升级、地区分润、分红池计提、B2协助奖、N路径差价） | **OrderPaymentService (核心)** |

#### `_markOrderAsPaid` 内部调用链详细分析（108-266行，共158行）

这是整个文件中最复杂的函数之一，承担了支付后的全部后置逻辑：

```
_markOrderAsPaid(order, t)
├── 更新 order.status = 'paid', paid_at
├── 自提订单: 生成 pickup_code / pickup_qr_token (via PickupService)
├── 同步更新所有子订单为 'paid'
├── 查询买家 User
├── 计算成长值基数 growthBaseAmount
│   └── 读取 AppConfig.product_growth_reward_{product_id} 配置
├── 买家角色升级检查: GUEST → MEMBER
│   └── buyer.save() + upgradedToMember 标记
├── buyer.total_sales 累加
├── logOrder('订单支付')
└── runAfterCommit(t, async => ...)
    ├── sendNotification (身份升级通知)
    ├── PointService.addPoints (消费积分)
    ├── PointService.addGrowthValue (成长值)
    ├── attributeRegionalProfit (地区分润)
    ├── 分红池计提 (AppConfig 独立嵌套事务)
    ├── B2协助奖 handleB2AssistBonus
    └── N路径差价佣金 (CommissionLog 独立嵌套事务)
```

### 2.2 Class OrderCoreService 静态方法

| # | 函数名 | 行号范围 | 功能描述 | 外部依赖 | 建议归属 | 公开/内部 |
|---|--------|----------|----------|----------|----------|-----------|
| M1 | `createOrder(req)` | 269-905 | **创建订单主流程**（参数解析→商品校验→价格计算→库存扣减→拆单→优惠券抵扣→积分抵扣→活动标记） | Product/SKU/User/Cart/Address/ServiceStation/PricingService/MemberTierService/LimitedSpotService/CouponCalcService/PointService/SlashRecord+Activity/GroupOrder+Member+Activity/AppConfig | **OrderCreationService** | **公开 (Controller)** |
| M2 | `prepayOrder(req)` | 912-1012 | 预下单（零元免付 / 货款余额支付 / 微信JSAPI预下单三路分发） | Order/User/Product/createUnifiedOrder/buildJsApiParams/_markOrderAsPaid/AgentWalletAccount+Log/AgentWalletService | **OrderPaymentService** | **公开 (Controller)** |
| M3 | `wechatPayNotify(req)` | 1020-1221 | 微信V3支付结果回调（WR充值单/UP升级单/普通订单 三路分发） | verifyNotifySign/decryptNotifyResource/AgentWalletService/UpgradeApplication/_markOrderAsPaid/scheduleShoppingOrderUpload/AppConfig/sendNotification | **OrderPaymentService** | **公开 (Controller)** |
| M4 | `syncPendingOrderWechatPay(req)` | 1227-1306 | 待付款订单主动查单补单（补偿notify未达场景） | Order/queryJsapiOrderByOutTradeNo/_markOrderAsPaid/scheduleShoppingOrderUpload | **OrderPaymentService** | **公开 (Controller)** |
| M5 | `payOrder(req)` | 1308-1353 | 支付订单（历史兼容入口，直接标记已支付） | Order/_markOrderAsPaid | **OrderPaymentService** | **公开 (Controller)** |
| M6 | `_completeShippedOrder(order, transaction, extraRemark)` | 1356-1378 | 完成已发货订单（设置completed状态+售后期截止时间+更新佣金冻结期） | Order/CommissionLog/constants | **OrderFulfillmentService** | **内部 (Admin Controller也直调)** |
| M7 | `confirmOrder(req)` | 1380-1410 | 用户确认收货 | Order/_completeShippedOrder | **OrderFulfillmentService** | **公开 (Controller)** |
| M8 | `forceCompleteOrderByAdmin(id, adminName, reason)` | 1412-1443 | 后台管理员强制完成订单 | Order/_completeShippedOrder | **OrderFulfillmentService** | **公开 (AdminController)** |
| M9 | `agentConfirmOrder(req)` | 1447-1479 | 代理商确认订单 | Order/User | **OrderFulfillmentService** | **公开 (Controller)** |
| M10 | `requestShipping(req)` | 1482-1522 | 代理商申请发货 | Order/User | **OrderFulfillmentService** | **公开 (Controller)** |
| M11 | `cancelOrder(req)` | 1526-1643 | 取消订单（恢复库存+退券+退积分+限时活动回滚） | Order/Product/SKU/UserCoupon/PointService/LimitedSpotService/shouldRestoreCoupon | **OrderCancellationService** | **公开 (Controller)** |
| M12 | `shipOrder(req)` | 1646-1741 | 发货操作（平台发货/代理商发货二路分发，含佣金计算触发） | Order/User/Product/CommissionService/scheduleUploadShippingInfoAfterShip | **OrderFulfillmentService** | **公开 (Controller)** |

---

## 三、外部引用关系分析（必须保持 export 兼容）

### 3.1 Controller 层调用 — orderController.js（10个入口点）

```javascript
// orderController.js 中对 OrderCoreService 的全部调用点:
OrderCoreService.createOrder(req)          // L26   -> POST /api/orders
OrderCoreService.prepayOrder(req)          // L45   -> POST /api/orders/:id/prepay
OrderCoreService.syncPendingOrderWechatPay(req) // L64 -> GET/POST /api/orders/:id/sync-wechat-pay
OrderCoreService.wechatPayNotify(req)      // L75   -> POST /api/wechat/pay/notify
OrderCoreService.payOrder(req)             // L97   -> POST /api/orders/:id/pay
OrderCoreService.confirmOrder(req)         // L121  -> POST /api/orders/:id/confirm
OrderCoreService.agentConfirmOrder(req)    // L142  -> POST /api/orders/:id/agent-confirm
OrderCoreService.requestShipping(req)      // L163  -> POST /api/orders/:id/request-shipping
OrderCoreService.cancelOrder(req)          // L213  -> POST /api/orders/:id/cancel
OrderCoreService.shipOrder(req)            // L241  -> POST /api/orders/:id/ship
```

### 3.2 Admin Controller 层调用 — adminOrderController.js（2个入口点）

```javascript
// adminOrderController.js 中的调用点:
OrderCoreService._completeShippedOrder(order, t)     // L317  <- 状态流转到 completed 时
OrderCoreService.forceCompleteOrderByAdmin(id, adminName, reason) // L561 <- 强制完成接口
```

---

## 四、建议拆分方案

### 4.1 新建 Service 文件架构

```
backend/services/
├── OrderCoreService.js              ★ 重构后: 协调器 (~100行)
├── OrderCreationService.js          ★ 新建: 订单创建 (~400行)
├── OrderPaymentService.js           ★ 新建: 支付相关 (~350行)
├── OrderFulfillmentService.js       ★ 新建: 履约/发货/确认收货 (~300行)
├── OrderCancellationService.js      ★ 新建: 取消/退款相关 (~150行)
├── OrderCalcService.js              ★ 新建: 价格/运费/订单号工具 (~50行)
└── TransactionHelper.js             ★ 新建: 通用事务工具 (~20行)
```

### 4.2 各子模块详细划分

#### (A) TransactionHelper.js — 通用事务工具

| 函数名 | 来源行号 | 说明 |
|--------|----------|------|
| `runAfterCommit(transaction, task)` | L60-75 | 事务提交后异步执行回调（支持 sequelize 的 afterCommit 钩子和降级模式） |

#### (B) OrderCalcService.js — 价格与运费计算（纯函数，无副作用）

| 函数名 | 来源行号 | 说明 | 可见性 |
|--------|----------|------|--------|
| `generateOrderNo()` | L31-44 | 生成唯一订单号 (ORD前缀+时间+序列+6位随机hex) | public |
| `calcShippingFeeByPolicy(policy, address)` | L97-106 | 运费策略计算（偏远地区加收费逻辑） | public |

#### (C) OrderCreationService.js — 订单创建（从M1的637行巨型方法拆出）

createOrder 是最大的单体方法（269-905行），建议拆分为以下内聚子方法：

| 函数名 | 对应原代码段 | 功能说明 | 可见性 |
|--------|-------------|----------|--------|
| `_parseCreateRequest(req)` | L276-299 | 解析请求体，标准化 items 数组格式 | private |
| `_validateLimitedSpotConflict(...)` | L301-318 | 校验限时活动与优惠券/积分/砍价/拼团互斥 | private |
| `_resolveDeliveryContext(userId, delivery_type, address_id, ...)` | L327-409 | 解析配送方式、校验门店有效性、构建地址快照 | private |
| `_resolveItemPrice(product, sku_id, quantity, ...)` | L439-548 | 单品价格四路解析：普品折扣/砍价覆盖/拼团覆盖/活动专享 | private |
| `_calculateLockedAgentCost(product, sku_id, roleLevel, ...)` | L559-590 | 锁定代理商成本单价（含N路径大N拿货价逻辑） | private |
| `_determineSplitQuantities(quantity, agentId, t)` | L592-605 | 拆单数量分配（代理商云仓 vs 平台） | private |
| `_createItemOrders(commonFields, itemData, t)` | L637-684 | 创建Order记录（含父-子拆单结构处理三种分支） | private |
| `_applyShippingFee(allOrders, delivery_type, commercePolicy, addressSnapshot, t)` | L696-706 | 运费附加到首根订单 | private |
| `_applyCouponDiscount(...)` | L709-785 | 整单优惠券校验 + 按比例分摊抵扣 + 标记已使用 | private |
| `_applyPointsDeduction(allOrders, userId, points_to_use, t)` | L788-831 | 积分抵扣（50%上限规则 + 多根订单按比例分摊） | private |
| `_markActivityRecords(slash_no, group_no, lsCtx, allOrders, userId, t)` | L834-879 | 标记砍价已购/拼团成员已购/限时占名额扣积分 | private |
| `createOrder(req)` | L269-905 | **主入口**: 开启事务 → 编排上述全部步骤 → commit | **public** |

#### (D) OrderPaymentService.js — 支付全流程

| 函数名 | 来源行号 | 功能说明 | 可见性 |
|--------|----------|----------|--------|
| `buildWxJsapiShoppingDescription(order, productName)` | L47-58 | 构建微信支付描述 | public |
| `scheduleShoppingOrderUploadAfterWechatPay(paidOrderId, notifySnap)` | L78-95 | 异步上报小程序购物订单 | internal |
| `_markOrderAsPaid(order, t)` | **L108-266 (158行)** | **核心**: 标记已支付 + 全部后置处理 | public/internal |
| `prepayOrder(req)` | L912-1012 | 预下单三路分发（零元/余额/微信JSAPI） | **public** |
| `wechatPayNotify(req)` | L1020-1221 | 微信V3回调三路分发（WR充值/UP升级/普通订单） | **public** |
| `syncPendingOrderWechatPay(req)` | L1227-1306 | 主动查单补单 | **public** |
| `payOrder(req)` | L1308-1353 | 直接标记支付（历史兼容） | **public** |

#### (E) OrderFulfillmentService.js — 履约/发货/确认收货

| 函数名 | 来源行号 | 功能说明 | 特别说明 |
|--------|----------|----------|----------|
| `_completeShippedOrder(order, transaction, extraRemark)` | L1356-1378 | 完成已发货订单 | **Admin Controller 直调！签名必须保持** |
| `confirmOrder(req)` | L1380-1410 | 用户确认收货 | |
| `forceCompleteOrderByAdmin(id, adminName, reason)` | L1412-1443 | 管理员强制完成订单 | |
| `agentConfirmOrder(req)` | L1447-1479 | 代理商确认订单 | |
| `requestShipping(req)` | L1482-1522 | 代理商申请发货 | |
| `shipOrder(req)` | L1646-1741 | 发货操作：平台发/代理发二路分发 | 调用 CommissionService |

#### (F) OrderCancellationService.js — 订单取消

| 函数名 | 对应原行号 | 功能说明 | 可见性 |
|--------|------------|----------|--------|
| `cancelOrder(req)` | L1526-1643 | **主入口**: 取消编排 | **public** |

### 4.3 OrderCoreService.js 重构后形态（协调器 ~100行）

```javascript
/**
 * OrderCoreService - 订单核心协调器
 *
 * 职责：
 *  1. 统一对外暴露 API（保持 Controller 调用签名100%兼容）
 *  2. 将请求委派给专职 Sub-Service
 *  3. 不包含任何业务逻辑实现
 */
const OrderCreationService = require('./OrderCreationService');
const OrderPaymentService = require('./OrderPaymentService');
const OrderFulfillmentService = require('./OrderFulfillmentService');
const OrderCancellationService = require('./OrderCancellationService');

class OrderCoreService {
    // ====== 创建 ======
    static async createOrder(req) { return OrderCreationService.createOrder(req); }

    // ====== 支付 ======
    static async prepayOrder(req) { return OrderPaymentService.prepayOrder(req); }
    static async wechatPayNotify(req) { return OrderPaymentService.wechatPayNotify(req); }
    static async syncPendingOrderWechatPay(req) { return OrderPaymentService.syncPendingOrderWechatPay(req); }
    static async payOrder(req) { return OrderPaymentService.payOrder(req); }

    // ====== 履约 ======
    static confirmOrder(req) { return OrderFulfillmentService.confirmOrder(req); }
    static forceCompleteOrderByAdmin(id, adminName, reason) {
        return OrderFulfillmentService.forceCompleteOrderByAdmin(id, adminName, reason);
    }
    static _completeShippedOrder(order, tx, remark) {
        return OrderFulfillmentService._completeShippedOrder(order, tx, remark);
    }
    static agentConfirmOrder(req) { return OrderFulfillmentService.agentConfirmOrder(req); }
    static requestShipping(req) { return OrderFulfillmentService.requestShipping(req); }
    static shipOrder(req) { return OrderFulfillmentService.shipOrder(req); }

    // ====== 取消 ======
    static cancelOrder(req) { return OrderCancellationService.cancelOrder(req); }
}

module.exports = OrderCoreService;
```

**关键保证**:
- 所有12个公开方法签名**完全不变**
- `orderController.js` 和 `adminOrderController.js` **无需修改任何一行代码**
- `_completeShippedOrder` 作为透传代理，保持 `(order, transaction, extraRemark)` 三参数签名

---

## 五、函数间调用关系图

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Controller Layer                               │
│  orderController.js(10个路由)  │  adminOrderController.js(2处调用)   │
└───────┬─────────────────────────────────┬────────────────────────────┘
        │                                 │
        ▼                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   OrderCoreService (Coordinator ~100行)               │
│                    纯委托层，零业务逻辑                                │
└───────┬──────────┬───────────────────────────┬──────────────────────┘
        │          │                           │
   ┌────▼────┐ ┌───▼────────┐  ┌──────────────▼────────┐
   │ Creation │ │ Payment   │  │ Fulfillment           │
   │ Service  │ │ Service   │  │ Service               │
   │ ~400行   │ │ ~350行    │  │ ~300行                │
   └────┬────┘ └─┬────────┬──┘  └──────────┬─────────────┘
        │          │        │               │
        │   ┌─────▼────────▼──┐             │
        │   │_markOrderAsPaid│◄────────────┘
        │   │ (核心 158行)    │
        │   └┬──────────┬───┘
        │    │           │
        │  [同步]      [afterCommit]
        │  ·status更新  ·积分/成长值/通知/分润/分红池/B2奖/N差价
        │
   ┌────▼──────────────────────────────┐
   │ CancellationService (~150行)     │
   └───────────────────────────────────┘
```

---

## 六、事务边界汇总表

| 操作 | 事务管理方 | 备注 |
|------|------------|------|
| **创建订单** | OrderCreationService.createOrder | **单一大事务** |
| **预下单-零元/余额/微信** | OrderPaymentService.prepayOrder | 各自独立事务 |
| **微信回调-WR充值/UP升级/普通订单** | OrderPaymentService.wechatPayNotify | 各自独立事务 |
| **查单补单** | OrderPaymentService.syncPendingWechatPay | 单一事务 |
| **直接支付** | OrderPaymentService.payOrder | 单一事务 |
| **确认收货/强制完成/代理确认/申请发货/发货** | OrderFulfillmentService.* | 各自独立事务 |
| **取消订单** | OrderCancellationService.cancelOrder | **单一大事务** |
| **_markOrderAsPaid-分红池/N差价** | _markOrderAsPaid.afterCommit | **嵌套独立事务** |

---

## 七、实施路线图

### Phase 1: 无风险提取纯工具
1. 创建 `TransactionHelper.js`，迁移 `runAfterCommit`
2. 创建 `OrderCalcService.js`，迁移 `generateOrderNo` + `calcShippingFeeByPolicy`
3. 原 OrderCoreService 改为从新模块引用

### Phase 2: 创建子 Service 骨架
4. 创建 `OrderCreationService.js` — createOrder 整体搬移并拆分子方法
5. 创建 `OrderPaymentService.js` — 支付相关 4 个方法和辅助函数整体搬移
6. 创建 `OrderFulfillmentService.js` — 履约相关 6 个方法搬移
7. 创建 `OrderCancellationService.js` — cancelOrder 及子步骤搬移

### Phase 3: OrderCoreService 变身为协调器
8. 替换为纯委托模式
9. **全量回归测试**

### Phase 4: 清理优化
10. 清除冗余 import、补充 JSDoc 注释
11. 评估是否将 `_markOrderAsPaid` 的 afterCommit 回调链改为事件驱动

---

## 八、风险评估

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| **事务边界破坏** | **高** | 严格保持原有事务开/commit/rollback 位置不变 |
| **_markOrderAsPaid 搬迁引入 bug** | **高** | Phase 2 先**整体搬迁**到 OrderPaymentService，暂不内部分解 |
| **_completeShippedOrder 签名变更影响 Admin** | **中** | 保持 `(order, transaction, extraRemark)` 三参数签名完全一致 |
| **循环依赖** | **低** | 子 Service 之间无互相依赖 |
| **Controller 兼容性** | **极低** | 协调器模式保证全部 12 个方法签名不变 |

---

## 九、统计摘要对比

| 维度 | 当前（单体） | 拆分后目标 |
|------|-------------|------------|
| **总行数** | **1745 行** | 协调器 ~100行 + 5个子Service 合计 ~1300行 |
| **class方法数** | **12个** | 协调器 12个代理 + 子Service 约20个内聚方法 |
| **最大依赖数** | **27个** | 每个文件降至 5~10 个 |
| **最大方法行数** | **637行 (createOrder)** | 拆分为 ~10 个 30~80行的子方法 |
| **新建文件数** | 0 | **6个** (5个Service + 1个工具) |

---

*文档结束 — 2026-04-06 by OrderCoreService 结构分析*
