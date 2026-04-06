# 架构总览

## 当前系统组成

- `backend/`: Node.js + Express + Sequelize + MySQL
- `admin-ui/`: Vue 3 + Vite + Pinia + Element Plus
- `miniprogram/`: 微信原生小程序

## 当前主链路

1. 小程序负责用户下单、支付、订单查询、售后与用户中心。
2. 后端负责鉴权、订单、库存、支付回调、佣金、配置与后台接口。
3. 管理端负责商品、订单、用户、内容、财务、系统配置与运维视图。

## 当前收口状态

- 文档入口已重建。
- 后端测试已统一到 Jest。
- 管理端权限已完成首轮收口。
- 后台管理路由已从单文件大杂烩拆成领域聚合。

## 当前主要风险

- `backend/server.js` 仍然职责过重。
- `backend/controllers/orderController.js` 仍有可继续下沉的逻辑。
- 管理端与小程序仍存在多个超大文件。
- 管理端构建虽可通过，但 `element-plus` chunk 仍过大。

## 推荐阅读顺序

1. `docs/audit/2026-04-06-repo-audit.md`
2. `docs/plans/2026-04-06-repo-closure-program.md`
3. `docs/plans/2026-04-06-repo-closure-tasklist.md`
4. `docs/architecture/backend.md`
5. `docs/guides/permissions.md`
6. `docs/guides/testing.md`
