# S2B2C 数字加盟系统 - 后端API

基于 Node.js + Express + MySQL + Sequelize 的微信小程序后端服务。

## 功能特性

### 用户端 API
- ✅ 用户认证（微信登录）
- ✅ 商品管理（含SKU规格、类目）
- ✅ 购物车系统
- ✅ 订单系统（创建、支付、物流）
- ✅ 售后退款
- ✅ 地址管理
- ✅ 分销中心（团队、推广订单）
- ✅ 钱包与提现
- ✅ 素材中心
- ✅ 内容管理（轮播图、图文页）
- ✅ 合伙人功能
- ✅ 经销商功能

### 管理后台 API
- ✅ 管理员认证（JWT + RBAC权限）
- ✅ 商品/类目管理
- ✅ 订单管理与发货
- ✅ 用户管理
- ✅ 内容管理
- ✅ 提现审核
- ✅ 售后处理

## 技术栈

- **框架**: Express 4.x
- **ORM**: Sequelize 6.x
- **数据库**: MySQL 8.0
- **语言**: Node.js 14+
- **认证**: JWT (jsonwebtoken)

---

## 快速开始

### 1. 环境准备

确保已安装：
- Node.js >= 14.0
- MySQL >= 8.0

### 2. 安装依赖

```bash
cd backend
npm install
```

### 3. 配置环境变量

复制示例配置文件：

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```env
# 服务器配置
PORT=3000
NODE_ENV=development

# 数据库配置
DB_HOST=localhost
DB_PORT=3306
DB_NAME=s2b2c_db
DB_USER=root
DB_PASSWORD=your_mysql_password

# 微信小程序配置
WECHAT_APPID=你的小程序AppID
WECHAT_SECRET=你的小程序AppSecret

# JWT配置（用户端）
JWT_SECRET=your-user-jwt-secret-key
JWT_EXPIRES_IN=7d

# 管理后台JWT配置
ADMIN_JWT_SECRET=your-admin-jwt-secret-key
ADMIN_JWT_EXPIRES_IN=8h

# 提现配置
MIN_WITHDRAWAL_AMOUNT=10
WITHDRAWAL_FEE_RATE=0.006
```

### 4. 创建数据库

```sql
CREATE DATABASE s2b2c_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 5. 启动服务器

**开发模式**（自动重启）：
```bash
npm run dev
```

**生产模式**：
```bash
npm start
```

服务器将在 `http://localhost:3000` 启动

### 6. 初始化管理员账号

首次使用需创建管理员：

```bash
node scripts/create-admin.js
```

或手动插入（密码需自行加密）：
```sql
INSERT INTO admins (username, password_hash, salt, name, role, status, createdAt, updatedAt) 
VALUES ('admin', '加密后的密码', '盐值', '超级管理员', 'super_admin', 1, NOW(), NOW());
```

### 7. 测试API

```bash
# 健康检查
curl http://localhost:3000/health

# 管理员登录
curl -X POST http://localhost:3000/admin/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"your_password"}'
```

---

## API 端点汇总

### 用户端 `/api`

| 模块 | 端点 | 说明 |
|------|------|------|
| 认证 | `POST /login` | 微信登录 |
| 商品 | `GET /products` | 商品列表（支持分页/搜索） |
| 商品 | `GET /products/:id` | 商品详情（含SKU） |
| 类目 | `GET /categories` | 类目列表 |
| 类目 | `GET /categories/tree` | 类目树形结构 |
| 购物车 | `GET /cart` | 购物车列表 |
| 购物车 | `POST /cart` | 添加商品 |
| 购物车 | `PUT /cart/:id` | 更新数量 |
| 购物车 | `DELETE /cart/:id` | 移除商品 |
| 订单 | `GET /orders` | 订单列表 |
| 订单 | `POST /orders` | 创建订单 |
| 订单 | `POST /orders/:id/pay` | 支付订单 |
| 售后 | `GET /refunds` | 售后列表 |
| 售后 | `POST /refunds` | 申请售后 |
| 钱包 | `GET /wallet` | 钱包概览 |
| 钱包 | `GET /wallet/commissions` | 佣金明细 |
| 钱包 | `POST /wallet/withdraw` | 申请提现 |
| 分销 | `GET /team` | 团队成员 |
| 分销 | `GET /promotion/orders` | 推广订单 |
| 素材 | `GET /materials` | 素材列表 |
| 内容 | `GET /content/banners` | 轮播图 |
| 内容 | `GET /content/page/:slug` | 图文页 |
| 经销商 | `POST /dealer/apply` | 申请经销商 |
| 经销商 | `GET /dealer/stats` | 经销商统计 |

### 管理后台 `/admin`

| 模块 | 端点 | 说明 |
|------|------|------|
| 认证 | `POST /login` | 管理员登录 |
| 商品 | `GET /products` | 商品列表 |
| 商品 | `POST /products` | 创建商品 |
| 商品 | `PUT /products/:id` | 更新商品 |
| 类目 | `GET /categories` | 类目管理 |
| 订单 | `GET /orders` | 订单列表 |
| 订单 | `PUT /orders/:id/ship` | 发货 |
| 用户 | `GET /users` | 用户列表 |
| 用户 | `PUT /users/:id/role` | 修改角色 |
| 内容 | `GET /banners` | 轮播图管理 |
| 内容 | `POST /banners` | 创建轮播图 |
| 提现 | `GET /withdrawals` | 提现列表 |
| 提现 | `PUT /withdrawals/:id/approve` | 审核通过 |
| 提现 | `PUT /withdrawals/:id/reject` | 拒绝 |
| 售后 | `GET /refunds` | 售后列表 |
| 售后 | `PUT /refunds/:id/approve` | 审核通过 |

---

## 数据库模型

| 模型 | 表名 | 说明 |
|------|------|------|
| User | users | 用户 |
| Product | products | 商品 |
| Category | categories | 类目 |
| SKU | product_skus | 商品规格 |
| Order | orders | 订单 |
| Cart | cart_items | 购物车 |
| Address | addresses | 收货地址 |
| CommissionLog | commission_logs | 佣金记录 |
| Withdrawal | withdrawals | 提现记录 |
| Refund | refunds | 售后记录 |
| Banner | banners | 轮播图 |
| Content | contents | 图文内容 |
| Material | materials | 素材库 |
| Admin | admins | 管理员 |
| Dealer | dealers | 经销商 |

---

## 部署

### PM2部署

```bash
npm install -g pm2
pm2 start server.js --name s2b2c-api
pm2 save
pm2 startup
```

### Nginx反向代理

```nginx
server {
    listen 443 ssl;
    server_name api.yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

---

## 常见问题

**Q: 数据库连接失败？**  
A: 检查 `.env` 配置和MySQL服务状态

**Q: 管理员登录失败？**  
A: 确认已创建管理员账号，且密码正确

**Q: 微信登录失败？**  
A: 确认WECHAT_APPID和WECHAT_SECRET配置正确

## License

MIT
