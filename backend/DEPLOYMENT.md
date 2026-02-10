# S2B2C 后台系统部署配置指南

## 📦 项目概述

本项目是一个 S2B2C（Supply to Business to Consumer）分销电商后台系统，基于 Node.js + Express + MySQL 构建。

---

## 🛠️ 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Node.js | >= 16.x | 运行时 |
| Express | 4.x | Web 框架 |
| MySQL | 5.7+ / 8.0+ | 数据库 |
| Sequelize | 6.x | ORM |
| JWT | - | 鉴权 |
| Multer | - | 文件上传 |
| ali-oss | - | 阿里云存储 |
| cos-nodejs-sdk-v5 | - | 腾讯云存储 |

---

## 🚀 快速开始

### 1. 安装依赖

```bash
cd backend
npm install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env` 并填写配置：

```bash
cp .env.example .env
```

### 3. 初始化数据库

```bash
# 确保 MySQL 服务已启动
# 创建数据库
mysql -u root -p -e "CREATE DATABASE s2b2c_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# 启动服务（首次启动会自动建表）
npm run dev
```

### 4. 创建超级管理员

首次启动后，在 MySQL 中执行：

```sql
USE s2b2c_db;

INSERT INTO admins (username, password_hash, salt, name, role, status, created_at, updated_at)
VALUES (
    'admin',
    -- 默认密码: admin123
    '你的密码hash',
    '你的salt',
    '超级管理员',
    'super_admin',
    1,
    NOW(),
    NOW()
);
```

或者使用调试接口（仅开发环境）：
```bash
POST /admin/api/test/create-admin
{
    "username": "admin",
    "password": "admin123"
}
```

---

## ⚙️ 环境变量配置

### 基础配置

```bash
# ========== 服务配置 ==========
NODE_ENV=production
PORT=3000

# ========== 数据库配置 ==========
DB_HOST=localhost
DB_PORT=3306
DB_NAME=s2b2c_db
DB_USER=root
DB_PASSWORD=your_password

# ========== JWT 配置（必须修改！） ==========
JWT_SECRET=your_super_secret_key_at_least_32_chars_long
JWT_EXPIRES_IN=7d
ADMIN_JWT_SECRET=your_admin_secret_key_at_least_32_chars
ADMIN_JWT_EXPIRES_IN=24h

# ========== CORS 配置 ==========
# 生产环境限制来源域名，多个用逗号分隔
CORS_ORIGINS=https://your-miniprogram-domain.com,https://admin.your-domain.com
```

### 微信小程序配置

```bash
# ========== 微信小程序 ==========
WECHAT_APPID=wx1234567890abcdef
WECHAT_SECRET=your_wechat_secret

# ========== 微信支付 ==========
WECHAT_MCH_ID=1234567890
WECHAT_API_KEY=your_api_key
WECHAT_CERT_PATH=/path/to/apiclient_cert.p12
WECHAT_NOTIFY_URL=https://your-domain.com/api/payment/notify
```

### 对象存储配置

```bash
# ========== 存储服务商选择 ==========
# 可选值: local | aliyun | tencent | qiniu | minio
STORAGE_PROVIDER=aliyun

# ========== 阿里云 OSS ==========
ALIYUN_ACCESS_KEY_ID=your_access_key_id
ALIYUN_ACCESS_KEY_SECRET=your_access_key_secret
ALIYUN_OSS_BUCKET=your-bucket-name
ALIYUN_OSS_REGION=oss-cn-hangzhou
# 可选：自定义域名（CDN加速）
ALIYUN_OSS_CUSTOM_DOMAIN=https://cdn.your-domain.com

# ========== 腾讯云 COS ==========
TENCENT_SECRET_ID=your_secret_id
TENCENT_SECRET_KEY=your_secret_key
TENCENT_COS_BUCKET=your-bucket-1234567890
TENCENT_COS_REGION=ap-guangzhou
# 可选：自定义域名（CDN加速）
TENCENT_COS_CUSTOM_DOMAIN=https://cdn.your-domain.com

# ========== 七牛云 ==========
QINIU_ACCESS_KEY=your_access_key
QINIU_SECRET_KEY=your_secret_key
QINIU_BUCKET=your-bucket
QINIU_DOMAIN=https://cdn.your-domain.com

# ========== MinIO（自建对象存储） ==========
MINIO_ENDPOINT=minio.your-domain.com
MINIO_PORT=9000
MINIO_USE_SSL=true
MINIO_ACCESS_KEY=your_access_key
MINIO_SECRET_KEY=your_secret_key
MINIO_BUCKET=uploads
```

### 业务配置

```bash
# ========== 订单配置 ==========
ORDER_AUTO_CANCEL_MINUTES=30
ORDER_AUTO_CONFIRM_DAYS=15
AGENT_ORDER_TIMEOUT_HOURS=24

# ========== 佣金配置 ==========
COMMISSION_FREEZE_DAYS=15
COMMISSION_SETTLEMENT_INTERVAL_HOURS=24

# ========== 提现配置 ==========
WITHDRAWAL_MIN_AMOUNT=10
WITHDRAWAL_MAX_SINGLE_AMOUNT=50000
WITHDRAWAL_MAX_DAILY_COUNT=3
WITHDRAWAL_FEE_RATE=0

# ========== 售后配置 ==========
REFUND_MAX_DAYS=15

# ========== 安全配置 ==========
API_RATE_LIMIT=100
LOGIN_RATE_LIMIT=5
BODY_SIZE_LIMIT=10mb

# ========== 调试开关（生产环境务必关闭！） ==========
ENABLE_DEBUG_ROUTES=false
ENABLE_TEST_ROUTES=false
```

---

## 🗄️ 数据库结构

### 核心表

| 表名 | 说明 |
|------|------|
| `users` | 用户（会员/分享达人/代理商） |
| `products` | 商品 |
| `skus` | 商品规格 |
| `orders` | 订单 |
| `addresses` | 收货地址 |
| `commission_logs` | 佣金记录 |
| `withdrawals` | 提现记录 |
| `refunds` | 售后记录 |
| `admins` | 管理员 |
| `dealers` | 经销商申请 |
| `notifications` | 消息通知 |

---

## 🔐 安全注意事项

### 生产环境必做

1. **修改默认密钥**
   - `JWT_SECRET` 必须修改为复杂的随机字符串
   - `ADMIN_JWT_SECRET` 必须修改
   - 数据库密码必须使用强密码

2. **关闭调试接口**
   ```bash
   ENABLE_DEBUG_ROUTES=false
   ENABLE_TEST_ROUTES=false
   ```

3. **HTTPS 强制**
   - 使用 Nginx 反向代理并配置 SSL 证书
   - 强制 HTTPS 跳转

4. **CORS 限制**
   - `CORS_ORIGINS` 配置为具体的域名，不要用 `*`

5. **数据库安全**
   - 禁止 root 远程登录
   - 创建专用数据库用户
   - 定期备份

---

## 🌐 Nginx 配置示例

```nginx
server {
    listen 80;
    server_name api.your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.your-domain.com;

    ssl_certificate /path/to/fullchain.pem;
    ssl_certificate_key /path/to/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # 后端 API
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # 文件上传大小限制
    client_max_body_size 20M;
}
```

---

## 🐳 Docker 部署（可选）

### Dockerfile

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
```

### docker-compose.yml

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    env_file:
      - .env
    depends_on:
      - db
    restart: unless-stopped

  db:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: ${DB_PASSWORD}
      MYSQL_DATABASE: ${DB_NAME}
    volumes:
      - mysql_data:/var/lib/mysql
    restart: unless-stopped

volumes:
  mysql_data:
```

---

## 📊 PM2 进程管理

### 安装 PM2

```bash
npm install -g pm2
```

### ecosystem.config.js

```javascript
module.exports = {
  apps: [{
    name: 's2b2c-backend',
    script: 'server.js',
    instances: 'max',
    exec_mode: 'cluster',
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    max_memory_restart: '500M',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: './logs/error.log',
    out_file: './logs/output.log',
    merge_logs: true
  }]
};
```

### 启动服务

```bash
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup  # 开机自启
```

---

## 🔧 常用命令

```bash
# 开发环境启动
npm run dev

# 生产环境启动
npm start

# 查看日志
pm2 logs s2b2c-backend

# 重启服务
pm2 restart s2b2c-backend

# 查看状态
pm2 status
```

---

## 📱 小程序接口域名配置

在微信公众平台 → 开发管理 → 服务器域名 中配置：

| 类型 | 域名 |
|------|------|
| request合法域名 | https://api.your-domain.com |
| uploadFile合法域名 | https://api.your-domain.com |
| downloadFile合法域名 | https://cdn.your-domain.com（你的 OSS 域名） |

---

## ❓ 常见问题

### Q: 启动时报 JWT_SECRET 错误
A: 生产环境必须修改默认的 JWT_SECRET，不能使用 `your_jwt_secret_key`

### Q: 数据库连接失败
A: 检查 MySQL 服务是否启动，用户名密码是否正确

### Q: 图片上传失败
A: 检查对象存储配置是否正确，可在后台 → 系统设置 → 存储配置 中测试

### Q: 跨域错误
A: 检查 CORS_ORIGINS 是否配置了小程序域名

---

## 📞 技术支持

如有问题，请检查：
1. 日志文件 `./logs/` 目录
2. PM2 日志 `pm2 logs`
3. 数据库连接状态

---

*最后更新：2026-02-09*
