# patch-root 文件清单（相对仓库根目录）

## 新增（仓库中可能原本不存在）

- `backend/utils/clientIp.js` — 客户端 IP 规范化
- `backend/utils/skuId.js` — SKU 外键安全归一（禁止 0）

## 修改

- `backend/routes/admin/controllers/adminAuthController.js` — 登录 IP 写库
- `backend/controllers/portalAuthController.js` — 门户登录 IP
- `backend/services/AlertService.js` — 注释
- `backend/routes/admin/index.js` — 移除 config 路由挂载
- `backend/config/swagger.js` — 移除对已删 config 扫描
- `backend/config/adminPermissionCatalog.js` — 移除 system/db-indexes 权限项
- `backend/models/Cart.js` — sku_id 可空
- `backend/controllers/cartController.js` — 购物袋 SKU 与 supports_pickup
- `backend/services/OrderCoreService.js` — items sku_id 归一
- `backend/services/LimitedSpotService.js` — 活动专享 sku 归一

### 迁移（复制自仓库，非新建逻辑）

- `backend/migrations/20260321_activity_spot_stock.sql`
- `backend/migrations/apply_activity_spot_stock.js` — **一键建表**（`node migrations/apply_activity_spot_stock.js`）

### admin-ui

- `admin-ui/src/utils/format.js` — formatClientIp
- `admin-ui/src/views/admins/index.vue` — 最后登录 IP 展示
- `admin-ui/src/router/index.js` — 去掉 system-config 路由
- `admin-ui/src/api/modules/system.js` — 去掉 system-configs/db-indexes API
- `admin-ui/src/views/settings/index.vue` — 文案
- `admin-ui/src/views/core-center/index.vue` — 规则中心入口
- `admin-ui/src/views/login/index.vue` — 登录页卖点文案

### miniprogram

- `miniprogram/pages/order/confirm.wxml` — 配送置顶与提示
- `miniprogram/pages/order/confirm.wxss` — 配送置顶样式
- `miniprogram/pages/product/detail.wxml` — 配送说明卡片
- `miniprogram/pages/product/detail.js` — 点击自提提示
- `miniprogram/pages/product/detail.wxss` — 配送卡片样式
