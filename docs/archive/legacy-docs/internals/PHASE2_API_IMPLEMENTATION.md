# Phase 2: API Routes Implementation - 完成文档

## 实施概述

Phase 2 已完成所有后端 API 路由的实现，为前端管理界面提供完整的数据接口。

## 已创建的文件

### 1. backend/routes/admin/themes.js
主题管理 API 路由，提供主题的增删改查和切换功能。

**端点列表：**
- `GET /admin/api/themes` - 获取所有主题列表
- `GET /admin/api/themes/active` - 获取当前激活主题
- `POST /admin/api/themes/switch` - 切换主题（核心功能）
- `POST /admin/api/themes` - 创建新主题
- `PUT /admin/api/themes/:id` - 更新主题配置
- `DELETE /admin/api/themes/:id` - 删除主题
- `POST /admin/api/themes/auto-switch` - 自动切换主题（定时任务）

### 2. backend/routes/admin/logs.js
活动日志 API 路由，提供日志查询、统计和导出功能。

**端点列表：**
- `GET /admin/api/logs` - 获取活动日志列表（支持分页、筛选）
- `GET /admin/api/logs/statistics` - 获取日志统计信息
- `GET /admin/api/logs/export` - 导出日志（CSV/JSON）
- `DELETE /admin/api/logs/cleanup` - 清理旧日志

### 3. backend/middleware/activityLogger.js
活动日志中间件，自动记录管理员操作。

**功能：**
- `logActivity(action, resource)` - 中间件函数，自动记录 API 调用
- `logSimple(data)` - 简化记录函数，用于小程序端和手动记录
- 自动捕获请求信息（IP、User-Agent、请求参数）
- 自动清理敏感信息（密码、token等）
- 支持多平台记录（web/miniprogram/api）

### 4. backend/app.js (已更新)
注册新路由到主应用。

**更改：**
```javascript
// 添加导入
const adminThemeRoutes = require('./routes/admin/themes');
const adminLogRoutes = require('./routes/admin/logs');

// 注册路由
app.use('/admin/api/themes', adminThemeRoutes);
app.use('/admin/api/logs', adminLogRoutes);
```

### 5. backend/controllers/activityLogController.js (已修复)
修复了 sequelize 导入问题。

---

## API 测试指南

### 前置条件
1. 运行数据库迁移：
```bash
mysql -u root -p your_database < backend/seeds/migration_v8_themes_and_logs.sql
```

2. 启动后端服务：
```bash
cd backend
npm start
```

3. 获取管理员 Token（用于认证）

### 测试主题管理 API

#### 1. 获取所有主题
```bash
curl -X GET http://localhost:3000/admin/api/themes \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

**预期响应：**
```json
{
  "code": 0,
  "data": [
    {
      "id": 1,
      "theme_key": "default",
      "theme_name": "默认主题",
      "primary_color": "#4F46E5",
      "is_active": true,
      ...
    },
    {
      "id": 2,
      "theme_key": "spring_festival",
      "theme_name": "春节主题",
      "primary_color": "#FF4757",
      "is_active": false,
      ...
    }
  ]
}
```

#### 2. 获取当前激活主题
```bash
curl -X GET http://localhost:3000/admin/api/themes/active
```

**预期响应：**
```json
{
  "code": 0,
  "data": {
    "id": 1,
    "theme_key": "default",
    "theme_name": "默认主题",
    "primary_color": "#4F46E5",
    "is_active": true
  }
}
```

#### 3. 切换主题（核心功能）
```bash
curl -X POST http://localhost:3000/admin/api/themes/switch \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{"theme_key": "spring_festival"}'
```

**预期响应：**
```json
{
  "code": 0,
  "message": "主题切换成功",
  "data": {
    "id": 2,
    "theme_key": "spring_festival",
    "theme_name": "春节主题",
    "is_active": true
  }
}
```

**切换主题后的影响：**
- `themes` 表：目标主题的 `is_active` 变为 true，其他变为 false
- `app_configs` 表：`primary_color` 配置更新
- `banners` 表：旧轮播图状态变为 0，新轮播图插入或更新
- `quick_entries` 表：旧快捷入口状态变为 0，新快捷入口插入或更新

#### 4. 创建新主题
```bash
curl -X POST http://localhost:3000/admin/api/themes \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{
    "theme_key": "christmas",
    "theme_name": "圣诞主题",
    "description": "圣诞节特别主题",
    "primary_color": "#DC2626",
    "secondary_color": "#16A34A",
    "auto_start_date": "12-20",
    "auto_end_date": "12-26",
    "icon": "🎄",
    "banner_images": [
      {
        "title": "圣诞快乐",
        "subtitle": "温暖冬日",
        "image_url": "/uploads/banners/christmas-1.jpg",
        "link_type": "page",
        "link_value": "/pages/festival/christmas",
        "sort_order": 100
      }
    ],
    "quick_entries": [
      {
        "name": "圣诞礼物",
        "icon": "/assets/icons/gift.svg",
        "bg_color": "#FEE2E2",
        "link_type": "category",
        "link_value": "5",
        "sort_order": 100
      }
    ]
  }'
```

#### 5. 更新主题
```bash
curl -X PUT http://localhost:3000/admin/api/themes/2 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{
    "description": "春节喜庆主题，更新版",
    "primary_color": "#EF4444"
  }'
```

#### 6. 删除主题
```bash
curl -X DELETE http://localhost:3000/admin/api/themes/7 \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

**注意：** 不能删除当前激活的主题

### 测试活动日志 API

#### 1. 获取活动日志列表
```bash
# 基础查询
curl -X GET "http://localhost:3000/admin/api/logs?page=1&limit=20" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"

# 带筛选条件
curl -X GET "http://localhost:3000/admin/api/logs?page=1&limit=20&user_type=admin&action=switch&resource=theme" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"

# 日期范围查询
curl -X GET "http://localhost:3000/admin/api/logs?start_date=2026-02-01&end_date=2026-02-11" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"

# 关键词搜索
curl -X GET "http://localhost:3000/admin/api/logs?keyword=春节" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

**预期响应：**
```json
{
  "code": 0,
  "data": {
    "list": [
      {
        "id": 1,
        "user_id": 1,
        "user_type": "admin",
        "username": "管理员",
        "action": "switch",
        "resource": "theme",
        "resource_id": "2",
        "description": "切换主题",
        "platform": "web",
        "status": "success",
        "ip_address": "127.0.0.1",
        "createdAt": "2026-02-11T10:30:00.000Z"
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 20
  }
}
```

#### 2. 获取日志统计
```bash
# 最近7天统计
curl -X GET "http://localhost:3000/admin/api/logs/statistics?days=7" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"

# 最近30天统计
curl -X GET "http://localhost:3000/admin/api/logs/statistics?days=30" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

**预期响应：**
```json
{
  "code": 0,
  "data": {
    "dailyStats": [
      { "date": "2026-02-05", "count": 45 },
      { "date": "2026-02-06", "count": 52 },
      { "date": "2026-02-07", "count": 38 }
    ],
    "actionStats": [
      { "action": "view", "count": 150 },
      { "action": "update", "count": 35 },
      { "action": "create", "count": 20 }
    ],
    "resourceStats": [
      { "resource": "product", "count": 80 },
      { "resource": "order", "count": 60 },
      { "resource": "theme", "count": 25 }
    ],
    "platformStats": [
      { "platform": "web", "count": 100 },
      { "platform": "miniprogram", "count": 80 },
      { "platform": "api", "count": 25 }
    ]
  }
}
```

#### 3. 导出日志（JSON格式）
```bash
curl -X GET "http://localhost:3000/admin/api/logs/export?format=json&start_date=2026-02-01&end_date=2026-02-11" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -o logs.json
```

#### 4. 导出日志（CSV格式）
```bash
curl -X GET "http://localhost:3000/admin/api/logs/export?format=csv&start_date=2026-02-01&end_date=2026-02-11" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -o logs.csv
```

#### 5. 清理旧日志
```bash
# 清理90天前的日志（默认）
curl -X DELETE "http://localhost:3000/admin/api/logs/cleanup" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{"days": 90}'

# 清理180天前的日志
curl -X DELETE "http://localhost:3000/admin/api/logs/cleanup" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{"days": 180}'
```

---

## 使用活动日志中间件

### 方式1：在路由中使用中间件
```javascript
const { logActivity } = require('../../middleware/activityLogger');

// 自动记录商品创建操作
router.post('/products',
  authenticateAdmin,
  logActivity('create', 'product'),
  productController.createProduct
);

// 自动记录商品更新操作
router.put('/products/:id',
  authenticateAdmin,
  logActivity('update', 'product'),
  productController.updateProduct
);

// 自动记录商品删除操作
router.delete('/products/:id',
  authenticateAdmin,
  logActivity('delete', 'product'),
  productController.deleteProduct
);
```

### 方式2：在控制器中手动记录
```javascript
const { logSimple } = require('../middleware/activityLogger');

// 小程序端下单操作
const createOrder = async (req, res) => {
  try {
    const order = await Order.create(orderData);

    // 记录日志
    await logSimple({
      user_id: req.user.id,
      user_type: 'user',
      username: req.user.nickname,
      action: 'purchase',
      resource: 'order',
      resource_id: String(order.id),
      description: `创建订单，金额 ¥${order.total_amount}`,
      details: {
        order_id: order.id,
        amount: order.total_amount,
        products: order.items.length
      },
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      platform: 'miniprogram',
      status: 'success'
    });

    res.json({ code: 0, data: order });
  } catch (error) {
    // 记录失败日志
    await logSimple({
      user_id: req.user.id,
      user_type: 'user',
      username: req.user.nickname,
      action: 'purchase',
      resource: 'order',
      description: '创建订单失败',
      platform: 'miniprogram',
      status: 'failed',
      error_message: error.message
    });

    res.status(500).json({ code: -1, message: '创建订单失败' });
  }
};
```

---

## 验证清单

### ✅ Phase 2 完成项
- [x] 创建 `backend/routes/admin/themes.js` - 主题管理路由
- [x] 创建 `backend/routes/admin/logs.js` - 活动日志路由
- [x] 创建 `backend/middleware/activityLogger.js` - 日志中间件
- [x] 更新 `backend/app.js` - 注册新路由
- [x] 修复 `backend/controllers/activityLogController.js` - sequelize 导入
- [x] 创建 API 测试文档

### 🔍 测试验证
使用上述 curl 命令测试所有端点：
- [ ] 主题列表获取
- [ ] 当前主题获取
- [ ] 主题切换功能（验证数据库变更）
- [ ] 主题创建
- [ ] 主题更新
- [ ] 主题删除
- [ ] 日志列表获取
- [ ] 日志筛选
- [ ] 日志统计
- [ ] 日志导出（JSON/CSV）
- [ ] 日志清理

---

## 下一步：Phase 3

完成 API 测试后，进入 **Phase 3: Admin UI - Dashboard** 开发：
1. 创建 Dashboard.vue 组件
2. 实现数据统计卡片
3. 添加销售/用户趋势图表
4. 添加最近活动流
5. 添加快捷操作按钮

参考 `ADMIN_ENHANCEMENTS_GUIDE.md` 的 Phase 3 章节。

---

## 常见问题

### Q1: 认证失败怎么办？
**A:** 确保使用正确的管理员 Token。可以通过登录接口获取：
```bash
curl -X POST http://localhost:3000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"your_password"}'
```

### Q2: 主题切换后前端没更新？
**A:** 检查以下步骤：
1. 查看数据库 `themes` 表的 `is_active` 字段
2. 查看 `banners` 和 `quick_entries` 表的 `status` 字段
3. 清除前端缓存，重新请求配置接口

### Q3: 日志没有记录？
**A:** 检查：
1. 中间件是否正确添加到路由
2. 数据库 `activity_logs` 表是否存在
3. 控制台是否有错误信息

### Q4: 如何设置定时任务自动切换主题？
**A:** 使用 node-cron 或系统 cron job：
```javascript
// 在 backend/server.js 或 app.js 中
const cron = require('node-cron');
const { autoSwitchTheme } = require('./controllers/themeController');

// 每天凌晨1点检查并自动切换主题
cron.schedule('0 1 * * *', async () => {
  console.log('执行自动主题切换检查...');
  await autoSwitchTheme();
});
```

---

**Phase 2 完成时间：** 2026-02-11
**下一个里程碑：** Phase 3 - Admin Dashboard UI
**预计完成时间：** 待评估
