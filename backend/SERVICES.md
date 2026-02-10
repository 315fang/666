# Backend Services Documentation

本文档描述了后端新增的服务层组件，用于提高代码质量和可维护性。

## 📚 目录

- [PricingService - 价格计算服务](#pricingservice)
- [CacheService - Redis缓存服务](#cacheservice)
- [OrderNumberService - 订单号生成服务](#ordernumberservice)

---

## PricingService

统一管理所有价格计算逻辑，包括商品价格、佣金计算等。

### 位置
`backend/services/PricingService.js`

### 主要功能

#### 1. 计算显示价格

根据用户角色计算商品显示价格。

```javascript
const PricingService = require('./services/PricingService');

// 计算商品价格
const displayPrice = PricingService.calculateDisplayPrice(
    product,      // 商品对象
    sku,          // SKU对象（可选）
    roleLevel     // 用户角色等级 (0-普通, 1-会员, 2-团长, 3-代理商)
);
```

#### 2. 计算佣金分配

计算订单项的佣金分配给购买者、上级和上上级。

```javascript
const { commissions, totalCommission } = PricingService.calculateCommissions(
    orderItem,      // 订单项对象 {price, quantity}
    buyer,          // 购买者对象 {id, role_level}
    parent,         // 上级对象（可选）
    grandparent     // 上上级对象（可选）
);

// commissions 数组示例:
// [
//   { user_id: 1, amount: 10.00, type: 'self', level: 0, description: '自购返利' },
//   { user_id: 2, amount: 16.00, type: 'direct', level: 1, description: '直推佣金' },
//   { user_id: 3, amount: 10.00, type: 'indirect', level: 2, description: '间接佣金' }
// ]
```

#### 3. 计算订单总佣金

```javascript
const totalCommission = PricingService.calculateOrderTotalCommission(
    orderItems,     // 订单项列表
    buyer,
    parent,
    grandparent
);
```

#### 4. 退款佣金追回

```javascript
const clawback = PricingService.calculateRefundClawback(
    orderItem,
    commissionRecords  // 原始佣金记录
);
// 返回需要追回的佣金列表（金额为负数）
```

### 价格层级

| 角色等级 | 角色名称 | 价格字段 | 佣金比例（直推） | 佣金比例（间接） |
|---------|---------|---------|----------------|----------------|
| 0 | 普通用户 | `retail_price` | 0% | - |
| 1 | 会员 | `price_member` | 5% | - |
| 2 | 团长 | `price_leader` | 8% | 3% |
| 3 | 代理商 | `price_agent` | 12% | 5% |

### 使用示例（Controller中）

```javascript
const PricingService = require('../services/PricingService');

async function getProductById(req, res, next) {
    const product = await Product.findByPk(id);
    const roleLevel = req.user ? req.user.role_level : 0;

    // 添加动态价格
    product.displayPrice = PricingService.calculateDisplayPrice(
        product,
        null,
        roleLevel
    );

    res.json({ code: 0, data: product });
}
```

---

## CacheService

Redis缓存服务，提供统一的缓存操作接口。

### 位置
`backend/services/CacheService.js`

### 初始化

```javascript
const CacheService = require('./services/CacheService');

// 在应用启动时连接Redis
await CacheService.connect({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD,
    db: process.env.REDIS_DB || 0
});
```

### 主要功能

#### 1. 基础缓存操作

```javascript
// 设置缓存（带过期时间）
await CacheService.setCache('mykey', { data: 'value' }, 300); // 300秒

// 获取缓存
const value = await CacheService.getCache('mykey');

// 删除缓存
await CacheService.deleteCache('mykey');

// 检查是否存在
const exists = await CacheService.hasCache('mykey');

// 批量删除（支持通配符）
await CacheService.deleteByPattern('user:*');
```

#### 2. 用户缓存

```javascript
// 缓存用户信息（默认1小时）
await CacheService.cacheUser(userId, userData);

// 获取用户缓存
const user = await CacheService.getUser(userId);

// 清除用户缓存
await CacheService.clearUser(userId);
```

#### 3. 商品缓存

```javascript
// 缓存商品信息（默认30分钟）
await CacheService.cacheProduct(productId, productData);

// 获取商品缓存
const product = await CacheService.getProduct(productId);

// 清除单个商品缓存
await CacheService.clearProduct(productId);

// 清除所有商品缓存
await CacheService.clearAllProducts();
```

### 缓存键前缀

- `user:` - 用户相关
- `product:` - 商品相关
- `category:` - 分类相关
- `order:` - 订单相关
- `cart:` - 购物车相关
- `session:` - 会话相关
- `commission:` - 佣金相关

### TTL 常量

```javascript
CacheService.TTL.SHORT   // 60秒
CacheService.TTL.MEDIUM  // 300秒 (5分钟)
CacheService.TTL.LONG    // 1800秒 (30分钟)
CacheService.TTL.HOUR    // 3600秒 (1小时)
CacheService.TTL.DAY     // 86400秒 (24小时)
```

### 使用示例

```javascript
async function getProductById(req, res, next) {
    const { id } = req.params;

    // 尝试从缓存获取
    const cached = await CacheService.getProduct(id);
    if (cached) {
        return res.json({ code: 0, data: cached, source: 'cache' });
    }

    // 从数据库查询
    const product = await Product.findByPk(id);

    // 存入缓存
    await CacheService.cacheProduct(id, product, CacheService.TTL.LONG);

    res.json({ code: 0, data: product, source: 'database' });
}
```

---

## OrderNumberService

改进的订单号生成服务，支持分布式系统。

### 位置
`backend/services/OrderNumberService.js`

### 订单号格式

```
ORD + YYYYMMDD + HHMMSS + 机器ID(2位) + 序列号(4位) + 随机数(2位)
示例: ORD20260210143025A100012F
长度: 25位
```

### 主要功能

#### 1. 生成订单号

```javascript
const OrderNumberService = require('./services/OrderNumberService');

const orderNumber = OrderNumberService.generateOrderNumber();
// 返回: "ORD20260210143025A100012F"
```

#### 2. 生成简化订单号（无前缀）

```javascript
const shortNumber = OrderNumberService.generateShortOrderNumber();
// 返回: "20260210143025A1001" (19位)
```

#### 3. 批量生成

```javascript
const orderNumbers = OrderNumberService.generateBatch(100);
// 返回100个唯一订单号数组
```

#### 4. 解析订单号

```javascript
const parsed = OrderNumberService.parseOrderNumber('ORD20260210143025A100012F');
// 返回:
// {
//   timestamp: Date对象,
//   machineId: 'A1',
//   sequence: 1,
//   dateString: '2026-02-10 14:30:25'
// }
```

#### 5. 验证订单号

```javascript
const isValid = OrderNumberService.isValidOrderNumber(orderNumber);
// 返回: true/false
```

#### 6. 生成其他单号

```javascript
// 退款单号
const refundNumber = OrderNumberService.generateRefundNumber();
// 返回: "RFD20260210143025A100012F"

// 提现单号
const withdrawalNumber = OrderNumberService.generateWithdrawalNumber();
// 返回: "WDR20260210143025A100012F"
```

### 特性

1. **唯一性保证**: 使用时间戳 + 机器ID + 序列号 + 随机数
2. **高性能**: 1秒内可生成10000个唯一订单号
3. **可追溯**: 订单号包含时间信息，可解析
4. **分布式支持**: 通过机器ID区分不同服务器
5. **防冲突**: 同一毫秒内序列号递增，溢出时等待

### 使用示例

```javascript
const OrderNumberService = require('../services/OrderNumberService');

async function createOrder(req, res, next) {
    try {
        // 生成订单号
        const orderNumber = OrderNumberService.generateOrderNumber();

        const order = await Order.create({
            order_number: orderNumber,
            user_id: req.user.id,
            // ... 其他字段
        });

        res.json({ code: 0, data: order });
    } catch (error) {
        next(error);
    }
}
```

---

## 单元测试

所有服务都包含完整的单元测试。

### 运行测试

```bash
cd backend
npm test

# 带覆盖率
npm run test:coverage

# 监听模式
npm run test:watch
```

### 测试文件

- `__tests__/services/PricingService.test.js` - 14个测试用例
- `__tests__/services/OrderNumberService.test.js` - 11个测试用例

---

## 环境变量

### Redis 配置

```env
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_password
REDIS_DB=0
```

### 订单号服务配置

```env
MACHINE_ID=A1  # 机器ID（可选，自动生成）
```

---

## 最佳实践

### 1. 价格计算

✅ **推荐**
```javascript
const price = PricingService.calculateDisplayPrice(product, sku, roleLevel);
```

❌ **不推荐**
```javascript
let price = product.retail_price;
if (roleLevel === 1) price = product.price_member || price;
if (roleLevel === 2) price = product.price_leader || price;
// ... 重复的if-else逻辑
```

### 2. 缓存使用

✅ **推荐**
```javascript
// 先查缓存
const cached = await CacheService.getProduct(id);
if (cached) return cached;

// 查数据库
const data = await Product.findByPk(id);

// 写入缓存
await CacheService.cacheProduct(id, data, CacheService.TTL.LONG);
```

❌ **不推荐**
```javascript
// 直接查数据库，不使用缓存
const data = await Product.findByPk(id);
```

### 3. 订单号生成

✅ **推荐**
```javascript
const orderNumber = OrderNumberService.generateOrderNumber();
```

❌ **不推荐**
```javascript
const orderNumber = `ORD${Date.now()}${Math.random()}`;
// 可能产生重复，格式不规范
```

---

## 性能优化建议

1. **启用Redis缓存**
   - 商品详情缓存30分钟
   - 用户信息缓存1小时
   - 分类列表缓存1天

2. **批量操作**
   - 使用 `generateBatch()` 批量生成订单号
   - 使用 `deleteByPattern()` 批量清除缓存

3. **价格计算优化**
   - 列表页面使用 `calculateDisplayPrice()`，避免重复代码
   - 缓存包含计算好的价格

---

## 迁移指南

### 从旧代码迁移到新服务

#### 1. 价格计算迁移

**旧代码:**
```javascript
let displayPrice = product.retail_price;
if (roleLevel === 1) {
    displayPrice = product.price_member || product.retail_price;
} else if (roleLevel === 2) {
    displayPrice = product.price_leader || product.price_member || product.retail_price;
}
```

**新代码:**
```javascript
const displayPrice = PricingService.calculateDisplayPrice(product, null, roleLevel);
```

#### 2. 订单号生成迁移

**旧代码:**
```javascript
const orderNumber = `ORD${Date.now()}${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
```

**新代码:**
```javascript
const orderNumber = OrderNumberService.generateOrderNumber();
```

---

## 故障排查

### Redis 连接失败

**症状**: 日志显示 "Redis 连接被拒绝"

**解决方案**:
1. 检查Redis是否启动: `redis-cli ping`
2. 检查环境变量配置
3. 检查防火墙设置

### 订单号重复

**症状**: 数据库唯一键冲突

**解决方案**:
1. 检查是否多个服务器使用相同的 `MACHINE_ID`
2. 确认系统时间是否同步（NTP）
3. 查看日志中的序列号溢出警告

---

## 更新日志

### v1.0.0 (2026-02-10)
- ✨ 新增 PricingService - 统一价格计算
- ✨ 新增 CacheService - Redis缓存支持
- ✨ 新增 OrderNumberService - 改进订单号生成
- ✅ 完整单元测试覆盖
- 📝 完整API文档

---

## 贡献

如需修改服务逻辑，请：
1. 先编写单元测试
2. 更新相关文档
3. 确保所有测试通过
4. 提交Pull Request

---

## 支持

如有问题，请提交 Issue 或联系开发团队。
