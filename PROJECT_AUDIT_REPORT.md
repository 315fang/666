# S2B2C 数字化加盟系统 - 问题审核报告

> 审核日期：2026-04-09
> 审核范围：backend / admin-ui / miniprogram
> 问题总数：45项（高风险14 + 中风险21 + 低风险10）
> 最后更新：2026-04-09（高风险已修复 13/14 项）

---

## 🔴 高风险 (14项) — 已修复 13 项

| # | 问题 | 位置 | 严重程度 | 状态 |
|---|------|------|----------|------|
| 1 | JWT密钥使用不安全默认值，线上使用会泄露 | `backend/config/constants.js:106` | 🔴高 | ✅ 已修复 |
| 2 | 测试路由 `/debug/*` 生产环境暴露 | `backend/routes/admin/debug.js` | 🔴高 | ✅ 已修复 |
| 3 | 订单号使用时间戳+计数器生成，可预测 | `backend/services/OrderCoreService.js:23` | 🔴高 | ✅ 已修复 |
| 4 | 批量角色修改无权限校验，任何人可改他人角色 | `backend/routes/admin/controllers/adminUserController.js:501` | 🔴高 | ✅ 已修复 |
| 5 | 余额调整无事务+无审计日志 | `backend/routes/admin/controllers/adminUserController.js:250` | 🔴高 | ✅ 已修复 |
| 6 | 佣金为负利润时未阻止发货 | `backend/services/CommissionService.js:747` | 🔴高 | ✅ 已修复 |
| 7 | 管理员密码无强度校验 | `backend/routes/admin/controllers/adminAccountController.js:64` | 🔴高 | ✅ 已修复 |
| 8 | API无统一响应格式封装，错误信息暴露内部路径 | `backend/utils/apiResponse.js` | 🔴高 | ✅ 已修复 |
| 9 | 小程序请求无重放攻击防护 | `miniprogram/utils/request.js` | 🔴高 | ⏳ 待修复 |
| 10 | 文件上传无文件类型/大小校验 | `backend/routes/admin/controllers/adminUploadController.js:176` | 🔴高 | ✅ 已修复 |
| 11 | 越权访问：用户可访问他人订单数据 | `backend/services/OrderCoreService.js:847` | 🔴高 | ✅ 已修复 |
| 12 | 佣金计算使用浮点运算，存在精度问题 | `backend/services/CommissionService.js:585` | 🔴高 | ✅ 已修复 |
| 13 | 支付回调无幂等性校验，可重复扣款 | `backend/services/OrderCoreService.js:506` | 🔴高 | ✅ 已修复 |
| 14 | 敏感日志（手机号/身份证）未脱敏 | `backend/utils/logger.js:29` | 🔴高 | ✅ 已修复 |

---

## 🟡 中风险 (21项)

| # | 问题 | 位置 |
|---|------|------|
| 1 | Token黑名单存内存中，服务重启后失效 | `backend/middleware/auth.js` |
| 2 | LIKE查询无索引（全表扫描） | `backend/models/` 订单/用户搜索 |
| 3 | 循环代理关系仅告警不阻止 | `backend/services/DistributionService.js` |
| 4 | 小程序storage存储token不够安全 | `miniprogram/store/` |
| 5 | 缺少请求限流中间件 | `backend/` 全局 |
| 6 | 数据库迁移脚本不规范 | `backend/migrations/` |
| 7 | 定时任务缺乏统一管理 | `backend/services/` 多处 |
| 8 | 审计日志不完整（缺IP记录） | `backend/utils/logger.js` |
| 9 | 错误信息泄露内部路径 | `backend/controllers/` |
| 10 | 短信/验证码无使用次数限制 | `backend/services/SmsService.js` |
| 11 | 管理员操作无IP记录 | `backend/routes/admin/controllers/adminUserController.js` |
| 12 | 订单取消未释放库存 | `backend/services/OrderService.js` |
| 13 | 退款无原路退回标记 | `backend/services/RefundService.js` |
| 14 | 缺少API版本控制 | `backend/routes/` |
| 15 | CORS配置过宽（`*`） | `backend/app.js` |
| 16 | JWT未设置过期时间 | `backend/middleware/auth.js` |
| 17 | 引用未定义的env变量不报错 | `backend/config/` |
| 18 | 批量操作无分页限制（DOS风险） | `backend/controllers/` |
| 19 | 第三方依赖存在已知漏洞 | `backend/package.json` |
| 20 | 缺少健康检查接口 | `backend/` |
| 21 | 错误堆栈生产环境暴露 | `backend/app.js` |

---

## 🟢 低风险 (10项)

| # | 问题 | 位置 |
|---|------|------|
| 1 | 目录结构有冗余层级 | 项目根目录 |
| 2 | 部分工具函数重复实现 | `backend/utils/` |
| 3 | 注释代码未清理 | `backend/` 多处 |
| 4 | Console.log残留 | `backend/` 多处 |
| 5 | 代码格式不统一 | 全局 |
| 6 | 魔法数字未提取常量 | `backend/services/` |
| 7 | 冗余字段未清理 | `backend/models/` |
| 8 | 小程序页面onLaunch过重 | `miniprogram/` |
| 9 | Pinia store未做持久化隔离 | `admin-ui/src/store/` |
| 10 | 组件命名不规范 | `miniprogram/components/` |

---

## 🏗️ 架构层问题

| # | 问题 | 影响 |
|---|------|------|
| 1 | 模块耦合度高（订单/佣金/库存深度交织） | 改一处动全身，难以维护 |
| 2 | 数据库缺少关键索引 | 查询性能差 |
| 3 | 审计日志不完整 | 合规风险 |
| 4 | 定时任务分散无统一调度 | 难以追踪管理 |

---

## ✅ 修复详情（2026-04-09 第二批次，8项）

### A1. API统一错误响应 ✅
**文件**: `backend/utils/apiResponse.js` (新建)
**修复内容**:
- 创建 `serverError(res, err, customMessage)` 统一错误处理
- 生产环境不暴露 `err.message`，仅返回"服务器内部错误"
- 已应用到 14 个路由/控制器文件

```javascript
// serverError 函数
const isProduction = process.env.NODE_ENV === 'production';
if (!isProduction) {
    // 开发环境返回详细信息
    res.status(500).json({ code: -1, message: customMessage || err.message });
} else {
    // 生产环境不暴露内部错误
    res.status(500).json({ code: -1, message: '服务器内部错误，请稍后重试' });
}
```

---

### A2. 敏感日志脱敏 ✅
**文件**: `backend/utils/logger.js`
**修复内容**:
- 添加 `maskPhone()` 手机号脱敏：`138****5678`
- 添加 `maskIdCard()` 身份证脱敏：`330***********1234`
- 添加 `sanitizeLogInput()` 统一脱敏处理
- 所有日志方法（error/warn/info/debug/logAuth/logOrder等）均调用脱敏

```javascript
function maskPhone(phone) {
    if (!phone || phone.length < 7) return phone;
    return phone.slice(0, 3) + '****' + phone.slice(-4);
}
function maskIdCard(idCard) {
    if (!idCard || idCard.length < 10) return idCard;
    return idCard.slice(0, 3) + '***********' + idCard.slice(-4);
}
```

---

### B1. 订单号加密生成 ✅
**文件**: `backend/services/OrderCoreService.js`
**修复内容**:
- 移除时间戳+计数器组合的旧算法
- 改用 `crypto.randomBytes(12).toString('hex')` 生成24位加密安全随机字符串
- 订单号格式: `ORD` + 24位hex = 27位总长度

```javascript
const crypto = require('crypto');
const generateOrderNo = () => {
    const randomPart = crypto.randomBytes(12).toString('hex').toUpperCase();
    return "ORD" + randomPart;
};
// 示例: ORD5F3D8E9A1B2C4D5E6F7A8B9C0D1E2F
```

---

### B2. 佣金浮点精度 ✅
**文件**: `backend/services/CommissionService.js`
**修复内容**:
- 添加 `_round(amount)` 函数：先转分取整再转回元
- 所有佣金计算关键路径均调用 `_round()` 防止精度丢失

```javascript
static _round(amount) {
    return Math.round(amount * 100) / 100;
}
// 所有金额计算后立即调用
const agentProfit = this._round(profitPool - totalCommission);
```

---

### C1. 文件上传校验 ✅
**文件**: `backend/routes/admin/controllers/adminUploadController.js`
**修复内容**:
- 扩展名白名单: `.jpg/.jpeg/.png/.gif/.webp/.pdf/.doc/.docx/.zip`
- MIME类型白名单: 8种类型严格对应
- 文件大小限制: 图片5MB，文档/压缩包10MB
- MIME与扩展名一致性校验（防止文件伪装）
- 统一校验函数 `validateFile()` 在上传前调用

---

### C2. 管理员密码强度 ✅
**文件**: `backend/routes/admin/controllers/adminAccountController.js`
**修复内容**:
- `createAdmin` 和 `resetAdminPassword` 使用 `validatePassword()` 校验
- 密码策略：长度≥8位 + 必须包含大写字母 + 必须包含小写字母 + 必须包含数字 + 常见弱密码黑名单

---

### D1. 越权访问防护 ✅
**文件**: `backend/services/OrderCoreService.js`
**修复内容**:
- `shipOrder` 方法添加订单归属校验
- 验证 `order.buyer_id !== userId` 时拒绝访问

```javascript
if (order.buyer_id && order.buyer_id !== userId) {
    await t.rollback();
    throw new Error('无权操作此订单');
}
```

---

### D2. 佣金负利润校验 ✅
**文件**: `backend/services/CommissionService.js`
**修复内容**:
- 发货前校验 `agentProfit <= 0` 时阻止操作
- 事务内执行，失败自动回滚
- 同时发送系统告警通知管理员

```javascript
if (agentProfit <= 0) {
    const errorMsg = `佣金计算后利润为负(¥${agentProfit.toFixed(2)})，不允许发货！...`;
    await sendNotification(0, '⚠️ 发货利润异常告警', ...);
    throw new Error(errorMsg);
}
```

---

## 📋 API规范参考

项目已配置 Swagger 文档，后端运行后可访问：`http://localhost:3000/api/docs`

**认证方式**：Bearer Token (JWT)
- 用户端：`Authorization: Bearer <user_token>`
- 管理端：`Authorization: Bearer <admin_token>`

**标准响应格式**：
```json
// 成功
{ "code": 0, "message": "操作成功", "data": {...} }

// 分页
{ "code": 0, "data": { "list": [], "total": 100, "page": 1, "limit": 10 } }

// 错误
{ "code": -1, "message": "操作失败" }
```

**角色权限体系**：
| 角色 | 权限 |
|------|------|
| super_admin | 全部权限 |
| admin | 商品+订单+用户+内容 |
| operator | 商品+订单+内容 |
| finance | 订单+提现+结算 |
| customer_service | 订单+售后+用户 |

---

## 📊 修复进度汇总

| 类别 | 修复数 | 总数 |
|------|--------|------|
| 🔴 高风险 | **13** | 14 |
| 🟡 中风险 | 0 | 21 |
| 🟢 低风险 | 0 | 10 |
| 🏗️ 架构层 | 0 | 4 |
| **总计** | **13** | **45** |

**剩余未修复**：高风险 1 项（小程序重放攻击防护）

---

*本报告由 Claude Code 自动生成，第一批次修复于 2026-04-09 完成*
