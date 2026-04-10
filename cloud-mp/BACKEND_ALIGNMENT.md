# 后端开发对齐说明书

**版本**: 1.0.0  
**日期**: 2026-04-09  
**对象**: 后端开发团队 / 传统后端迁移

---

## 📖 概述

本文档用于指导传统后端开发团队理解和接入 CloudBase 微服务架构。该文档详细说明了：
- 云函数的开发规范
- 数据模型设计
- API 接口标准
- 错误处理机制
- 认证授权方式

---

## 1️⃣ 云函数开发规范

### 1.1 函数签名规范

所有云函数都采用统一的签名模式：

```javascript
'use strict';

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const {
    CloudBaseError, cloudFunctionWrapper
} = require('../shared/errors');
const {
    success, badRequest, unauthorized, notFound, serverError
} = require('../shared/response');

// 业务逻辑

exports.main = cloudFunctionWrapper(async (event) => {
    // 1. 获取上下文
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;

    // 2. 权限检查
    if (!openid) {
        throw unauthorized('未登录');
    }

    // 3. 参数验证
    const { action, ...params } = event;
    if (!action) {
        throw badRequest('缺少 action 参数');
    }

    // 4. 业务处理
    try {
        const result = await handleAction(action, openid, params);
        return success(result);
    } catch (err) {
        if (err instanceof CloudBaseError) throw err;
        console.error('Unexpected error:', err);
        throw serverError('操作失败');
    }
});

async function handleAction(action, openid, params) {
    // 实现业务逻辑
}
```

### 1.2 错误处理规范

使用统一的错误处理器：

```javascript
// ❌ 不推荐 - 手工处理
if (!user) {
    return { code: 404, success: false, message: '用户不存在' };
}

// ✅ 推荐 - 使用共享模块
const user = await db.collection('users').where({ openid }).limit(1).get();
if (!user.data.length) {
    throw notFound('用户不存在');  // 自动转换为标准格式
}
```

### 1.3 响应格式规范

所有响应都采用统一格式：

```javascript
// 成功响应
{
    "code": 0,
    "success": true,
    "message": "ok",
    "data": { ... },
    "timestamp": "2026-04-09T10:30:00.000Z"
}

// 错误响应
{
    "code": 400,
    "success": false,
    "message": "缺少必要参数",
    "data": null,
    "timestamp": "2026-04-09T10:30:00.000Z"
}
```

**错误码规范**:
| 代码 | 含义 | 说明 |
|------|------|------|
| 0 | 成功 | 操作成功 |
| 400 | 请求错误 | 参数验证失败 |
| 401 | 未授权 | 用户未登录 |
| 403 | 禁止访问 | 权限不足 |
| 404 | 资源不存在 | 查询结果为空 |
| 409 | 冲突 | 业务冲突 (如重复) |
| 500 | 服务器错误 | 未预期的错误 |

### 1.4 参数验证规范

```javascript
const {
    validateAction, validateAmount, validateInteger, validateString,
    validateArray, validateRequiredFields
} = require('../shared/validators');

// 验证单个参数
validateInteger(params.quantity, 1, 1000);  // 1-1000 之间
validateAmount(params.price, 0.01, 99999);  // 金额
validateString(params.name, 100);           // 字符串长度
validateArray(params.items);                // 是否为数组

// 验证必填字段
validateRequiredFields(params, ['name', 'price', 'category_id']);

// 验证 action
validateAction(action, ['list', 'detail', 'create', 'update', 'delete']);
```

---

## 2️⃣ 数据模型设计

### 2.1 核心数据集合

#### users (用户)
```javascript
{
    "_id": "ObjectId",
    "openid": "String",                    // 微信 OpenID (唯一)
    "nickName": "String",                  // 昵称
    "avatarUrl": "String",                 // 头像
    "phone": "String",                     // 电话
    "email": "String",                     // 邮箱
    
    // 账户信息
    "wallet_balance": "Number",            // 钱包余额 (分)
    "points": "Number",                    // 积分
    "level": "Number",                     // 用户等级
    
    // 分销信息
    "distributor_level": "Number",         // 分销等级 (0=非分销，1=一级，2=二级)
    "referrer_openid": "String",           // 推荐人 OpenID
    "commission_balance": "Number",        // 佣金余额
    
    // 时间戳
    "created_at": "Date",
    "updated_at": "Date"
}
```

#### products (商品)
```javascript
{
    "_id": "ObjectId",
    "id": "Number",                        // 旧系统 ID (用于兼容)
    "name": "String",                      // 商品名称
    "description": "String",               // 描述
    "category_id": "ObjectId|Number",      // 分类
    
    // 价格
    "retail_price": "Number",              // 零售价 (分)
    "market_price": "Number",              // 原价 (分)
    "agent_price": "Number",               // 代理价 (分)
    "wholesale_price": "Number",           // 批发价 (分)
    
    // 库存
    "stock": "Number",                     // 总库存
    "sales_count": "Number",               // 销售数量
    
    // 图片
    "images": ["String"],                  // 商品图片列表
    "detail_images": ["String"],           // 详情图片列表
    
    // 状态
    "status": "Boolean|Number|String",     // true/1/'1'/'active' = 在售
    
    // 分类和排序
    "manual_weight": "Number",             // 手动权重
    
    "created_at": "Date",
    "updated_at": "Date"
}
```

#### skus (商品规格)
```javascript
{
    "_id": "ObjectId",
    "id": "Number",                        // 旧系统 ID
    "product_id": "ObjectId|Number",       // 关联商品
    "spec": "String",                      // 规格 (如: "红色/M码")
    
    // 价格
    "price": "Number",                     // 规格价格 (分)
    "original_price": "Number",            // 原价 (分)
    
    // 库存
    "stock": "Number",                     // 规格库存
    
    // 排序
    "sort_order": "Number",                // 排序权重
    
    "created_at": "Date",
    "updated_at": "Date"
}
```

#### orders (订单)
```javascript
{
    "_id": "ObjectId",
    "order_no": "String",                  // 订单号 (唯一)
    "openid": "String",                    // 买家 openid
    "buyer_id": "String",                  // 买家 ID (保持一致性)
    
    // 商品信息
    "items": [
        {
            "product_id": "ObjectId|Number",
            "sku_id": "ObjectId|Number",
            "quantity": "Number",
            "snapshot_price": "Number",    // 下单时价格快照 (分)
            "snapshot_name": "String",
            "snapshot_spec": "String"
        }
    ],
    
    // 价格
    "subtotal": "Number",                  // 商品小计 (分)
    "discount": "Number",                  // 优惠金额 (分)
    "shipping_fee": "Number",              // 运费 (分)
    "total": "Number",                     // 总价 (分)
    
    // 地址
    "address_id": "ObjectId",
    "shipping_address": {
        "province": "String",
        "city": "String",
        "district": "String",
        "detail": "String",
        "recipient": "String",
        "phone": "String"
    },
    
    // 状态
    "status": "String",                    // pending/pending_payment/paid/pending_ship/shipped/completed/cancelled/refunded
    "reviewed": "Boolean",                 // 是否已评价
    
    // 支付和发货
    "payment_method": "String",            // 支付方式 (wechat_pay)
    "tracking_no": "String",               // 物流单号
    
    // 分销
    "referrer_openid": "String",           // 推荐人
    "commission": "Number",                // 佣金 (分)
    
    "created_at": "Date",
    "updated_at": "Date"
}
```

#### cart_items (购物车)
```javascript
{
    "_id": "ObjectId",
    "openid": "String",                    // 用户 openid
    "user_id": "String",                   // 用户 ID
    "product_id": "ObjectId|Number",
    "sku_id": "ObjectId|Number",
    
    "qty": "Number",                       // 数量
    "quantity": "Number",                  // 数量 (备用)
    "selected": "Boolean",                 // 是否选中
    
    // 快照 (用于结算时显示)
    "snapshot_price": "Number",
    "snapshot_name": "String",
    "snapshot_spec": "String",
    "snapshot_image": "String",
    
    "created_at": "Date",
    "updated_at": "Date"
}
```

#### coupons (优惠券)
```javascript
{
    "_id": "ObjectId",
    "name": "String",                      // 优惠券名称
    "type": "String",                      // 类型 (discount/free_shipping)
    "value": "Number",                     // 面值 (分)
    "min_purchase": "Number",              // 最低购买额 (分)
    "valid_days": "Number",                // 有效期天数
    "is_active": "Boolean",                // 是否激活
    
    "created_at": "Date",
    "updated_at": "Date"
}
```

#### user_coupons (用户优惠券)
```javascript
{
    "_id": "ObjectId",
    "openid": "String",
    "coupon_id": "ObjectId",
    "status": "String",                    // unclaimed/claimed/used/expired
    "claimed_at": "Date",
    "used_at": "Date",
    "used_order_id": "ObjectId"
}
```

---

## 3️⃣ API 接口标准

### 3.1 命名规范

```
后端命名方式           传统 REST          云函数方式
─────────────────────────────────────────────────────
查询列表            GET /users         POST /user?action=list
查询详情            GET /users/:id     POST /user?action=detail&id=xxx
创建                POST /users        POST /user?action=create
更新                PUT /users/:id     POST /user?action=update&id=xxx
删除                DELETE /users/:id  POST /user?action=delete&id=xxx
```

### 3.2 云函数调用方式

```javascript
// 小程序调用云函数
wx.cloud.callFunction({
    name: 'user',          // 函数名
    data: {
        action: 'profile', // 操作
        // 其他参数
    }
}).then(res => {
    console.log(res.result);
});
```

### 3.3 核心 API 列表

| 模块 | Action | 说明 | 参数 | 返回 |
|------|--------|------|------|------|
| **user** |  |  |  |  |
|  | profile | 获取用户信息 | - | user 对象 |
|  | balance | 获取账户余额 | - | { points, balance } |
|  | listAddresses | 地址列表 | - | [address] |
|  | addAddress | 添加地址 | province, city, detail | { id } |
| **products** |  |  |  |  |
|  | list | 商品列表 | page, size, category_id | [product] |
|  | detail | 商品详情 | product_id | product |
|  | categories | 分类列表 | - | [category] |
| **order** |  |  |  |  |
|  | create | 创建订单 | items, address_id | { order_id } |
|  | list | 订单列表 | status, page | [order] |
|  | detail | 订单详情 | order_id | order |
| **payment** |  |  |  |  |
|  | prepay | 预支付 | order_id | { prepayId, ... } |
|  | callback | 支付回调 | (内部) | - |
| **distribution** |  |  |  |  |
|  | dashboard | 仪表板 | - | dashboard 对象 |
|  | commission | 佣金列表 | page | [commission] |

---

## 4️⃣ 认证与授权

### 4.1 用户认证

```javascript
// 步骤1: 微信登录
const wxLogin = wx.login();  // 获取 code

// 步骤2: 云函数调用 login 函数
wx.cloud.callFunction({
    name: 'login',
    data: { code }
}).then(res => {
    // 返回 sessionKey 和用户信息
});

// 步骤3: 云函数中验证
const wxContext = cloud.getWXContext();
const openid = wxContext.OPENID;  // 自动验证，无需手工处理
```

### 4.2 权限控制

```javascript
// 1. 登录检查
if (!openid) {
    throw unauthorized('未登录');
}

// 2. 用户类型检查 (分销商)
const user = await db.collection('users').where({ openid }).limit(1).get();
if (!user.data[0] || user.data[0].distributor_level === 0) {
    throw forbidden('您没有分销权限');
}

// 3. 资源所有者检查
const order = await db.collection('orders').doc(orderId).get();
if (order.data.openid !== openid) {
    throw forbidden('您无权访问此订单');
}
```

---

## 5️⃣ 代码示例

### 5.1 简单查询示例

```javascript
const {
    CloudBaseError, cloudFunctionWrapper
} = require('../shared/errors');
const { success, notFound, unauthorized } = require('../shared/response');

exports.main = cloudFunctionWrapper(async (event) => {
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;

    if (!openid) {
        throw unauthorized('未登录');
    }

    const { userId } = event;

    const user = await db.collection('users')
        .where({ openid: userId })
        .limit(1)
        .get();

    if (!user.data.length) {
        throw notFound('用户不存在');
    }

    return success({
        id: user.data[0]._id,
        name: user.data[0].nickName,
        avatar: user.data[0].avatarUrl
    });
});
```

### 5.2 创建资源示例

```javascript
const {
    CloudBaseError, cloudFunctionWrapper
} = require('../shared/errors');
const { success, badRequest, unauthorized, serverError } = require('../shared/response');
const { validateRequiredFields } = require('../shared/validators');

exports.main = cloudFunctionWrapper(async (event) => {
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;

    if (!openid) {
        throw unauthorized('未登录');
    }

    const { name, phone, province, city, detail } = event;

    // 验证必填字段
    validateRequiredFields({ name, phone, province, city, detail }, 
        ['name', 'phone', 'province', 'city', 'detail']);

    // 创建地址
    const result = await db.collection('addresses').add({
        data: {
            openid,
            name,
            phone,
            province,
            city,
            detail,
            is_default: false,
            created_at: db.serverDate(),
            updated_at: db.serverDate()
        }
    });

    return success({
        id: result._id,
        message: '地址添加成功'
    });
});
```

### 5.3 事务处理示例

```javascript
// CloudBase 不支持传统事务，但支持原子操作和补偿机制

exports.main = cloudFunctionWrapper(async (event) => {
    const { openid, orderId } = event;

    try {
        // 1. 更新订单状态
        await db.collection('orders').doc(orderId).update({
            data: { status: 'paid', updated_at: db.serverDate() }
        });

        // 2. 更新用户积分
        await db.collection('users').where({ openid }).update({
            data: {
                points: db.command.inc(100),
                updated_at: db.serverDate()
            }
        });

        // 3. 发送消息 (可选，失败不回滚)
        await notifyUser(openid, '订单已支付');

        return success({ message: '支付成功' });

    } catch (err) {
        // 补偿：恢复订单状态
        await db.collection('orders').doc(orderId).update({
            data: { status: 'pending_payment' }
        });
        throw serverError('支付失败，请重试');
    }
});
```

---

## 6️⃣ 与后端系统对接

### 6.1 数据同步策略

```
后端系统 ←→ CloudBase
   │              │
   ├─ 定时同步    ├─ Webhook 通知
   ├─ 事件驱动    ├─ 导入导出
   └─ 手工触发    └─ 双向同步
```

### 6.2 接入步骤

1. **数据迁移**
   ```bash
   # 导出后端数据
   mysql-dump > export.sql
   
   # 转换格式
   node scripts/convert.js
   
   # 导入到 CloudBase
   npm run seed:prepare && npm run import:selected
   ```

2. **API 适配层**
   ```javascript
   // 后端可以调用云函数
   const response = await fetch('https://cloudbase-api/user', {
       method: 'POST',
       body: JSON.stringify({ action: 'profile', openid: 'xxx' })
   });
   ```

3. **Webhook 同步**
   ```javascript
   // 云函数可以回调后端
   await fetch('https://backend.api/sync', {
       method: 'POST',
       body: JSON.stringify({
           event: 'order.created',
           data: newOrder
       })
   });
   ```

### 6.3 常见问题

**Q: 如何处理实时库存？**
- A: 使用原子操作更新库存，失败重试

**Q: 如何进行分布式事务？**
- A: 记录日志，实现补偿机制 (saga 模式)

**Q: 如何监控性能？**
- A: CloudBase 控制台内置监控，可配置告警

---

## 7️⃣ 开发清单

### 开发前
- [ ] 理解项目架构
- [ ] 熟悉数据模型
- [ ] 准备开发环境
- [ ] 阅读代码规范

### 开发中
- [ ] 编写业务逻辑
- [ ] 添加参数验证
- [ ] 完善错误处理
- [ ] 编写日志记录

### 开发后
- [ ] 本地测试通过
- [ ] 代码审查
- [ ] 部署到测试环境
- [ ] 集成测试
- [ ] 部署生产环境

---

## 📚 相关文档

- `PROJECT_OVERVIEW.md` - 项目总体说明
- `BUSINESS_LOGIC.md` - 业务逻辑文档
- `docs/P3_REFACTORING_GUIDE.md` - 重构指南
- `docs/P3_VERIFICATION_REPORT.json` - 验证报告

---

**最后更新**: 2026年4月9日  
**维护者**: 开发团队
