# P3 重构指南

## 目标
将大型云函数（800+ 行）拆分为更小、更可维护的模块。

## 重构流程

### 1. User 模块 (1140 行)
- **子模块**: user-profile.js, user-growth.js, user-addresses.js, user-coupons.js
- **actions**: 
  - 'profile' → user-profile.js
  - 'balance', 'growth' → user-growth.js
  - 'addresses', 'add-address', 'update-address', 'delete-address' → user-addresses.js
  - 'coupons' → user-coupons.js

### 2. Order 模块 (1373 行)
- **子模块**: order-create.js, order-query.js, order-status.js
- **actions**:
  - 'create' → order-create.js
  - 'list', 'detail' → order-query.js
  - 'status' → order-status.js

### 3. Payment 模块 (649 行)
- **子模块**: payment-prepay.js, payment-callback.js, payment-query.js, payment-refund.js
- **actions**:
  - 'prepay' → payment-prepay.js
  - 'callback' → payment-callback.js
  - 'query' → payment-query.js
  - 'refund' → payment-refund.js

### 4. Distribution 模块 (1239 行)
- **子模块**: distribution-query.js, distribution-commission.js
- **actions**:
  - 'dashboard' → distribution-query.js
  - 'commission', 'stats' → distribution-commission.js

### 5. Config 模块 (571 行)
- **子模块**: config-loader.js, config-cache.js
- **actions**:
  - 'init', 'get' → config-loader.js
  - 'list' → config-cache.js

## 重构模式

### index.js 模板
```javascript
const cloudFunctionWrapper = require('../shared/errors').cloudFunctionWrapper;
const submodules = {
    'action1': require('./submodule1'),
    'action2': require('./submodule2'),
};

exports.main = cloudFunctionWrapper(async (event) => {
    const { action } = event;
    const handler = submodules[action];
    
    if (!handler) {
        throw badRequest(`Unknown action: ${action}`);
    }
    
    return handler(event);
});
```

### 子模块模板
```javascript
const { success, error, badRequest, notFound } = require('../shared/response');

async function handleAction(event) {
    // 业务逻辑
    return success(data);
}

module.exports = handleAction;
```

## 验收标准

- [ ] 每个云函数的 index.js < 100 行
- [ ] 所有子模块 > 50 行，< 400 行
- [ ] 100% 使用共享模块 (validators, errors, response)
- [ ] 100% 参数验证
- [ ] 100% 错误处理
- [ ] 所有测试通过

## 优先级
1. **高** (第1周): user, order
2. **中** (第2周): payment, distribution
3. **低** (第3周): config

---

生成时间: 2026-04-09T09:27:02.127Z
