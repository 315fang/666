# 后端 API（Node + Express + Sequelize + MySQL）

全栈说明、接口总表、发版检查见仓库 **[docs/手册.md](../docs/手册.md)**；业务术语与佣金见 **[docs/业务规则.md](../docs/业务规则.md)**。

---

## 快速开始

```bash
cd backend
npm install
cp .env.example .env
# 编辑 .env：DB_*、JWT_SECRET、ADMIN_JWT_SECRET、WECHAT_*、支付 V3 等
npm run dev
# 默认 http://localhost:3001
```

- 健康检查：`GET http://localhost:3001/health`  
- API 文档（默认非生产开启）：`GET /api/docs`  
- 创建管理员：`node scripts/create-admin.js`（或按你们种子脚本）

数据库：创建库 `utf8mb4` 后启动；未跑过的 SQL 在 **`migrations/`**，发版清单见 `docs/手册.md` §5。

---

## 环境变量（必看）

完整示例：**`.env.example`**。生产环境注意：

| 类别 | 要求 |
|------|------|
| `JWT_SECRET` / `ADMIN_JWT_SECRET` | 各 ≥32 字符随机串，且互不相同；禁用仓库默认占位值 |
| `NODE_ENV=production` | 配合 `app.js` 启动校验（CORS 不可 `*`、调试路由关闭等） |
| 数据库 | 强密码 |
| `CORS_ORIGINS` | 实际管理端与门户域名，逗号分隔 |
| 微信 / 支付 V3 | `WECHAT_APPID`、`WECHAT_SECRET`、`WECHAT_MCH_ID`、`WECHAT_PAY_SERIAL_NO`、`WECHAT_PAY_API_V3_KEY`（32 位）、私钥路径、`WECHAT_PAY_NOTIFY_URL` |
| 小程序购物订单 | 公众平台签协议并开通能力后：`npm run wechat:order-path` 同步订单详情 path；支付成功后会异步调用「上传购物详情」（`WechatShoppingOrderService`），可用 `WECHAT_SHOPPING_ORDER_UPLOAD=false` 关闭；无 https 商品图时可配 `WECHAT_SHOPPING_PLACEHOLDER_IMAGE` |
| 多实例（可选） | `TASK_LOCK_BACKEND=mysql`；`ADMIN_TOKEN_BLACKLIST_STORE=redis|mysql`（MySQL 方案先 `npm run migrate:phase9`） |

**安全说明（摘要）**：生产禁止 `ENABLE_DEBUG_ROUTES`、`ENABLE_TEST_ROUTES`；请求体验证见 `middleware/validation`；支付回调 `POST /api/wechat/pay/notify` 不参与全局限流，依赖签名校验与业务金额校验；任务锁与黑名单见上文。更细的英文说明若需可自行在 Git 历史中检索已删除的 `SECURITY.md` 版本。

---

## 服务层（`services/`）

订单与支付、佣金、价格、积分、定时任务等主要逻辑在 **`services/`** 下，例如：

- `OrderCoreService.js` — 下单、支付预下单、微信回调、取消、履约相关  
- `WechatShoppingOrderService.js` — 支付成功后上传微信购物详情（账单/订单中心）  
- `CommissionService.js` — 佣金创建与级差等  
- `PricingService.js` — 展示价、佣金试算工具方法  
- `OrderJobService.js` — 自动确认收货、超时取消、佣金结算、完成单统计等  

改业务优先打开对应 Service 与 `controllers/` 薄层。

---

## 部署（摘要）

**进程**：`npm install --production && npm start`，或用 PM2：`pm2 start server.js --name s2b2c-api`。  
**反向代理**：Nginx/Caddy 将 HTTPS 转到本机 `PORT`（默认 3001）；需支持 Webhook 的 `POST` 体与原样路径 **`/api/wechat/pay/notify`**。  
**静态管理端**：同一 Node 进程托管 `../admin-ui/dist` 到 `/admin`（见 `app.js`）。  
**1Panel / 面板部署**：将代码与 `admin-ui/dist` 置于服务器，终端内 `npm install`、`node server.js` 或 PM2；配置网站反代到 Node 端口；环境变量与证书路径与线上一致。细节随面板版本略有差异，按主机商文档操作即可。

**对象存储**：多机部署时上传走 OSS/COS（`STORAGE_PROVIDER` 等），勿依赖单机 `uploads/`。

---

## 常用自测命令

```bash
# 历史用户补全邀请码（登录也会自动生成，此脚本用于一次性刷库）
npm run invite:backfill

curl -s http://localhost:3001/health
curl -s -X POST http://localhost:3001/admin/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"你的密码"}'
```

---

## License

MIT
