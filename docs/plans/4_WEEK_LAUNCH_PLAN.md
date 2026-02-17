# 立即行动计划 - 4周上线路线图

> **目标**: 在 4 周内完成生产上线准备
> **当前状态**: 系统功能完整，需要完善支付、测试和基础设施
> **创建时间**: 2025-02-12

---

## 🎯 核心结论

**你的系统已经完成 95% 的功能开发！**

✅ **已实现的功能**:
- 完整的订单系统
- 三级分销佣金体系
- 代理商云库存管理
- 用户钱包与提现
- 退款与售后
- 管理后台 (Vue 3)
- 微信小程序前端

⚠️ **缺失的关键部分**:
1. **微信支付集成** (模拟支付需要替换)
2. **生产环境配置** (JWT密钥、CORS等)
3. **测试覆盖** (当前几乎没有测试)

**评分**: 7.2/10 (生产就绪度)

---

## 🚨 第一周：支付与配置 (阻塞项)

### Day 1-5: 微信支付集成 ⭐⭐⭐⭐⭐

**为什么必须做**: 当前只有模拟支付，真实用户无法完成购买

**需要修改的文件**:
1. `backend/controllers/orderController.js:238` (订单支付)
2. `backend/controllers/agentController.js:570` (代理商补货支付)

**开发步骤**:

```javascript
// 1. 安装微信支付 SDK
npm install wechatpay-node-v3 --save

// 2. 配置 .env
WECHAT_MCH_ID=你的商户号
WECHAT_PAY_KEY=你的支付密钥
WECHAT_SERIAL_NO=证书序列号

// 3. 创建支付服务
// backend/services/WechatPayService.js
const { Payment } = require('wechatpay-node-v3');

class WechatPayService {
  constructor() {
    this.payment = new Payment({
      appid: process.env.WECHAT_APPID,
      mchid: process.env.WECHAT_MCH_ID,
      serial_no: process.env.WECHAT_SERIAL_NO,
      publicKey: fs.readFileSync('./cert/apiclient_cert.pem'),
      privateKey: fs.readFileSync('./cert/apiclient_key.pem')
    });
  }

  // 统一下单
  async createOrder(orderId, openid, amount, description) {
    const result = await this.payment.transactions_jsapi({
      description,
      out_trade_no: orderId,
      amount: { total: Math.round(amount * 100) }, // 分
      payer: { openid }
    });
    return result;
  }

  // 支付回调验证
  async verifyCallback(headers, body) {
    return this.payment.verifySignature(headers, body);
  }
}

// 4. 修改订单控制器
// backend/controllers/orderController.js
const wechatPayService = new WechatPayService();

exports.createPayment = async (req, res) => {
  try {
    const { order_id } = req.body;
    const order = await Order.findOne({ where: { order_id } });

    // 调用微信支付
    const paymentData = await wechatPayService.createOrder(
      order.order_id,
      req.user.openid,
      order.total_price,
      '订单支付'
    );

    res.json({
      code: 0,
      message: '支付参数获取成功',
      data: paymentData
    });
  } catch (err) {
    logger.error('PAYMENT', '创建支付失败', err);
    res.status(500).json({ code: -1, message: '创建支付失败' });
  }
};

// 5. 添加支付回调路由
// backend/routes/payment.js
router.post('/callback', async (req, res) => {
  try {
    // 验证签名
    const isValid = await wechatPayService.verifyCallback(req.headers, req.body);
    if (!isValid) {
      return res.status(400).json({ code: 'FAIL', message: '签名验证失败' });
    }

    const { out_trade_no, trade_state } = req.body.resource;

    if (trade_state === 'SUCCESS') {
      // 更新订单状态
      await Order.update(
        { status: 'paid', paid_at: new Date() },
        { where: { order_id: out_trade_no } }
      );

      // 触发佣金计算
      await commissionService.calculateOrderCommission(out_trade_no);
    }

    res.json({ code: 'SUCCESS', message: '成功' });
  } catch (err) {
    logger.error('PAYMENT', '支付回调处理失败', err);
    res.status(500).json({ code: 'FAIL', message: '处理失败' });
  }
});
```

**测试清单**:
- [ ] 沙箱环境创建订单并支付
- [ ] 支付成功后订单状态更新为 'paid'
- [ ] 佣金正确计算并记录
- [ ] 支付失败时正确处理
- [ ] 支付回调签名验证通过

**参考文档**: https://pay.weixin.qq.com/wiki/doc/apiv3/index.shtml

---

### Day 6: 生产环境配置 ⭐⭐⭐⭐⭐

**为什么必须做**: 默认配置不安全，会导致系统启动失败或安全漏洞

**创建生产配置文件 `.env`**:

```bash
# ========== 服务器配置 ==========
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# ========== 数据库配置 ==========
DB_HOST=localhost
DB_PORT=3306
DB_USER=s2b2c_user
DB_PASSWORD=生成强密码（至少16位）
DB_NAME=s2b2c_production

# ========== JWT 密钥 (CRITICAL) ==========
# 使用以下命令生成强密钥:
# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

JWT_SECRET=你生成的64位十六进制密钥
JWT_EXPIRES_IN=7d

ADMIN_JWT_SECRET=另一个64位十六进制密钥（不要与上面相同）
ADMIN_JWT_EXPIRES_IN=8h

# ========== 微信小程序配置 ==========
WECHAT_APPID=wx1234567890abcdef  # 替换为真实APPID
WECHAT_SECRET=你的小程序Secret

# ========== 微信支付配置 ==========
WECHAT_MCH_ID=你的商户号
WECHAT_PAY_KEY=你的支付密钥
WECHAT_SERIAL_NO=证书序列号

# ========== CORS 配置 (CRITICAL) ==========
CORS_ORIGINS=https://你的域名.com,https://admin.你的域名.com

# ========== 对象存储配置 (多实例部署必需) ==========
STORAGE_PROVIDER=aliyun  # 或 tencent/qiniu/minio
ALIYUN_OSS_ACCESS_KEY=你的AccessKey
ALIYUN_OSS_ACCESS_SECRET=你的AccessSecret
ALIYUN_OSS_BUCKET=你的Bucket名称
ALIYUN_OSS_REGION=oss-cn-hangzhou

# ========== 安全开关 (CRITICAL) ==========
ENABLE_DEBUG_ROUTES=false
ENABLE_TEST_ROUTES=false
ENABLE_X_OPENID_AUTH=false

# ========== 业务参数 ==========
ORDER_AUTO_CANCEL_MINUTES=30
ORDER_AUTO_COMPLETE_DAYS=15
COMMISSION_FREEZE_DAYS=15
COMMISSION_SETTLE_INTERVAL=3600000
REFUND_DEADLINE_DAYS=15

# ========== 限流配置 ==========
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
LOGIN_RATE_LIMIT_MAX=10
WITHDRAWAL_RATE_LIMIT_MAX=5
```

**生成强密钥命令**:
```bash
# 在终端执行
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**配置验证**:
```bash
# 启动服务器，检查是否通过启动检查
npm start

# 应该看到类似输出:
# ✓ 所有启动检查通过
# Server running on port 3000
```

---

### Day 7: 对象存储配置 ⭐⭐⭐⭐

**为什么必须做**: 多实例部署时本地文件存储会导致文件不同步

**推荐方案: 阿里云 OSS**

**步骤**:

1. **创建 OSS Bucket**
   - 登录阿里云控制台
   - 创建 Bucket (如: `s2b2c-production`)
   - 设置权限: 公共读
   - 配置跨域规则

2. **获取访问密钥**
   - 进入 AccessKey 管理
   - 创建新的 AccessKey
   - 记录 AccessKeyId 和 AccessKeySecret

3. **配置 .env**
   ```bash
   STORAGE_PROVIDER=aliyun
   ALIYUN_OSS_ACCESS_KEY=LTAI5t...
   ALIYUN_OSS_ACCESS_SECRET=xxxxx...
   ALIYUN_OSS_BUCKET=s2b2c-production
   ALIYUN_OSS_REGION=oss-cn-hangzhou
   ```

4. **测试上传**
   - 在管理后台上传商品图片
   - 验证图片 URL 为 OSS 地址
   - 在小程序中访问图片

**费用**: ¥0.12/GB/月存储 + ¥0.5/GB流量

---

## 🔴 第二周：测试与监控

### Day 1-4: 编写关键测试 ⭐⭐⭐⭐

**为什么必须做**: 没有测试的代码在生产环境会导致严重 bug

**创建测试文件**:

```bash
# 安装测试依赖
npm install --save-dev jest supertest

# 创建测试目录
mkdir -p backend/__tests__/integration
```

**核心测试 1: 订单流程**

```javascript
// backend/__tests__/integration/order-flow.test.js
const request = require('supertest');
const app = require('../../app');
const { User, Product, Order } = require('../../models');

describe('订单完整流程', () => {
  let userToken, product, user;

  beforeAll(async () => {
    // 创建测试用户
    user = await User.create({
      openid: 'test_openid',
      nickname: '测试用户',
      role_level: 1
    });

    // 生成 token
    userToken = jwt.sign({ id: user.id }, process.env.JWT_SECRET);

    // 创建测试商品
    product = await Product.create({
      name: '测试商品',
      retail_price: 100.00,
      stock: 999
    });
  });

  test('完整流程: 加购 → 下单 → 支付 → 完成', async () => {
    // 1. 加入购物车
    const cartRes = await request(app)
      .post('/api/cart')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ product_id: product.id, quantity: 2 });
    expect(cartRes.status).toBe(200);

    // 2. 创建订单
    const orderRes = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        items: [{ product_id: product.id, quantity: 2 }],
        address_id: 1
      });
    expect(orderRes.status).toBe(200);
    const orderId = orderRes.body.data.order_id;

    // 3. 模拟支付成功 (测试环境)
    await Order.update(
      { status: 'paid', paid_at: new Date() },
      { where: { order_id: orderId } }
    );

    // 4. 验证订单状态
    const order = await Order.findOne({ where: { order_id: orderId } });
    expect(order.status).toBe('paid');

    // 5. 验证库存扣减
    const updatedProduct = await Product.findByPk(product.id);
    expect(updatedProduct.stock).toBe(997);
  });

  afterAll(async () => {
    // 清理测试数据
    await User.destroy({ where: { openid: 'test_openid' } });
    await Product.destroy({ where: { id: product.id } });
  });
});
```

**核心测试 2: 佣金计算**

```javascript
// backend/__tests__/integration/commission.test.js
const { CommissionService } = require('../../services/CommissionService');

describe('佣金计算', () => {
  test('三级分销佣金计算正确', async () => {
    // 创建三级用户关系
    const level0 = await User.create({ openid: 'level0' });
    const level1 = await User.create({ openid: 'level1', parent_id: level0.id });
    const level2 = await User.create({ openid: 'level2', parent_id: level1.id });

    // 创建订单 (level2 购买)
    const order = await Order.create({
      buyer_id: level2.id,
      total_price: 100.00,
      status: 'paid'
    });

    // 计算佣金
    await commissionService.calculateOrderCommission(order.order_id);

    // 验证佣金记录
    const commissions = await CommissionLog.findAll({
      where: { order_id: order.order_id }
    });

    expect(commissions.length).toBe(2); // level0 和 level1
    // 验证金额...
  });
});
```

**运行测试**:
```bash
npm test
```

---

### Day 5: Sentry 错误追踪 ⭐⭐⭐⭐

**为什么必须做**: 生产环境的错误需要实时追踪和告警

**步骤**:

1. **注册 Sentry**
   - 访问 https://sentry.io
   - 创建免费账号 (每月 5,000 events)
   - 创建新项目 (Node.js)
   - 获取 DSN

2. **安装 SDK**
   ```bash
   npm install @sentry/node --save
   ```

3. **集成到代码**
   ```javascript
   // backend/app.js (最前面)
   const Sentry = require('@sentry/node');

   Sentry.init({
     dsn: process.env.SENTRY_DSN,
     environment: process.env.NODE_ENV,
     tracesSampleRate: 0.1
   });

   // 请求处理器
   app.use(Sentry.Handlers.requestHandler());

   // 路由...

   // 错误处理器 (在其他错误处理之前)
   app.use(Sentry.Handlers.errorHandler());
   ```

4. **配置 .env**
   ```bash
   SENTRY_DSN=https://xxxxx@sentry.io/xxxxx
   ```

5. **测试**
   ```javascript
   // 触发一个测试错误
   app.get('/debug-sentry', (req, res) => {
     throw new Error('Sentry 测试错误');
   });
   ```

**费用**: 免费版 5,000 events/月，Team版 ¥1,200/年

---

### Day 6-7: 日志轮转与数据库备份 ⭐⭐⭐

**日志轮转配置**:

```bash
# /etc/logrotate.d/s2b2c
/path/to/666/backend/logs/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 0644 www-data www-data
    sharedscripts
    postrotate
        pm2 reloadLogs
    endscript
}
```

**数据库备份脚本**:

```bash
#!/bin/bash
# /opt/scripts/backup-mysql.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR=/backup/mysql
DB_NAME=s2b2c_production
DB_USER=root
DB_PASS=你的密码

# 创建备份
mysqldump -u${DB_USER} -p${DB_PASS} ${DB_NAME} | gzip > ${BACKUP_DIR}/${DB_NAME}_${DATE}.sql.gz

# 删除30天前的备份
find ${BACKUP_DIR} -name "*.sql.gz" -mtime +30 -delete

echo "备份完成: ${BACKUP_DIR}/${DB_NAME}_${DATE}.sql.gz"
```

**Crontab 配置**:
```bash
# 每天凌晨 2 点备份
crontab -e
0 2 * * * /opt/scripts/backup-mysql.sh >> /var/log/mysql-backup.log 2>&1
```

---

## 🟡 第三周：基础设施优化

### Redis 集成 (2天) ⭐⭐⭐

**为什么要做**: 多实例部署需要分布式锁

```bash
# 安装
npm install ioredis --save

# Docker 部署 Redis
docker run -d --name redis -p 6379:6379 redis:7-alpine
```

```javascript
// backend/utils/redis.js
const Redis = require('ioredis');

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD
});

module.exports = redis;
```

---

### CDN 配置 (1天) ⭐⭐⭐

**配置阿里云 CDN**:
1. 创建 CDN 加速域名
2. 配置回源地址 (OSS Bucket)
3. 配置缓存规则
4. 更新小程序静态资源 URL

**费用**: ¥50-200/月

---

### 微信模板消息 (2天) ⭐⭐⭐

**实现订单状态通知**:

```javascript
// backend/services/WechatNotificationService.js
const axios = require('axios');

class WechatNotificationService {
  async getAccessToken() {
    const res = await axios.get('https://api.weixin.qq.com/cgi-bin/token', {
      params: {
        grant_type: 'client_credential',
        appid: process.env.WECHAT_APPID,
        secret: process.env.WECHAT_SECRET
      }
    });
    return res.data.access_token;
  }

  async sendOrderShippedNotification(userId, order) {
    const user = await User.findByPk(userId);
    const accessToken = await this.getAccessToken();

    await axios.post(
      `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${accessToken}`,
      {
        touser: user.openid,
        template_id: 'ORDER_SHIPPED_TEMPLATE_ID',
        page: `/pages/order/detail?id=${order.order_id}`,
        data: {
          order_no: { value: order.order_no },
          product_name: { value: '您的订单' },
          tracking_no: { value: order.logistics_no }
        }
      }
    );
  }
}
```

---

## 🚀 第四周：部署与软启动

### Day 1-2: 服务器部署 ⭐⭐⭐⭐⭐

**服务器要求**:
- 2核4G，100GB SSD
- Ubuntu 20.04 或 CentOS 7+

**部署步骤**:

```bash
# 1. 安装 Node.js
curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. 安装 PM2
sudo npm install -g pm2

# 3. 安装 MySQL
sudo apt-get install mysql-server

# 4. 克隆代码
git clone https://github.com/你的仓库/666.git
cd 666/backend

# 5. 安装依赖
npm install --production

# 6. 配置 .env
cp .env.example .env
nano .env  # 填写生产配置

# 7. 运行数据库迁移
mysql -u root -p < migrations/001_init.sql
mysql -u root -p < migrations/002_add_stock.sql
# ... 运行所有迁移文件

# 8. 创建管理员账号
node scripts/create-admin.js

# 9. 构建管理后台
cd admin-ui
npm install
npm run build
cd ..

# 10. 启动服务
pm2 start ecosystem.config.js --env production

# 11. 配置 Nginx
sudo apt-get install nginx
sudo nano /etc/nginx/sites-available/s2b2c

# 配置内容见下方

# 12. 启用站点
sudo ln -s /etc/nginx/sites-available/s2b2c /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

**Nginx 配置**:

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    # HTTPS 重定向
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # 静态文件
    location /uploads {
        alias /path/to/666/backend/uploads;
        expires 30d;
    }

    # API 代理
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
```

**SSL 证书 (Let's Encrypt)**:

```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d api.yourdomain.com
```

---

### Day 3-4: 小范围测试 ⭐⭐⭐⭐⭐

**测试用户**: 100-200 人

**测试清单**:
- [ ] 用户注册和登录
- [ ] 商品浏览和搜索
- [ ] 加入购物车
- [ ] 创建订单
- [ ] **微信支付** (关键测试)
- [ ] 订单发货
- [ ] 确认收货
- [ ] 申请退款
- [ ] 代理商补货
- [ ] 佣金计算
- [ ] 提现申请

**监控重点**:
- [ ] 错误率 < 1%
- [ ] API 响应时间 < 500ms
- [ ] 支付成功率 > 95%
- [ ] 佣金计算准确性 100%

---

### Day 5-7: 问题修复与优化 ⭐⭐⭐⭐

**常见问题处理**:

1. **支付回调未收到**
   - 检查微信支付回调 URL 配置
   - 验证服务器网络和防火墙

2. **图片加载慢**
   - 验证 CDN 配置
   - 优化图片大小

3. **佣金计算错误**
   - 检查配置表数据
   - 验证计算逻辑

4. **数据库连接超时**
   - 增加连接池大小
   - 优化慢查询

---

## ✅ 4周后的目标状态

### 系统状态
- ✅ 微信支付正常工作
- ✅ 所有配置正确
- ✅ 关键路径测试覆盖
- ✅ 错误追踪和监控运行
- ✅ 数据备份正常
- ✅ 100-200 测试用户正常使用

### 可上线标准
- 错误率 < 1%
- API 响应时间 < 500ms
- 支付成功率 > 95%
- 无严重 bug
- 用户反馈良好

---

## 📞 需要帮助？

### 技术难点支持

**微信支付集成**:
- 官方文档: https://pay.weixin.qq.com/wiki/doc/apiv3/index.shtml
- 社区: https://developers.weixin.qq.com/community

**阿里云 OSS**:
- 官方文档: https://help.aliyun.com/product/31815.html

**Sentry**:
- 官方文档: https://docs.sentry.io/platforms/node/

---

## 📊 费用总结

| 项目 | 费用 | 说明 |
|------|------|------|
| 服务器 | ¥300/月 | 2核4G |
| 数据库 | ¥0 | 自建MySQL |
| OSS | ¥20/月 | 100GB |
| CDN | ¥50/月 | 流量费 |
| Sentry | ¥100/月 | Team版 |
| **月度总计** | **¥470/月** | |
| **年度总计** | **¥5,640/年** | |

---

## 🎯 成功标准

### 技术指标
- 系统可用性 > 99.9%
- API 响应时间 < 500ms
- 错误率 < 0.1%
- 支付成功率 > 98%

### 业务指标
- 用户注册转化率 > 60%
- 订单支付转化率 > 80%
- 代理商月活跃率 > 40%
- 用户投诉率 < 1%

---

**开始时间**: ___________
**负责人**: ___________
**预计上线**: 4周后

**加油！你的系统已经很完善了，再坚持 4 周就能上线！** 🚀
