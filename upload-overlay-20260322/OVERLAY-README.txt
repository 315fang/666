覆盖说明（本次会话相关改动）
================================
1. 将本文件夹内 admin-ui、backend、miniprogram 与仓库根目录合并（同名路径覆盖）。
2. 解压 zip 时：把 zip 内顶层三个目录对齐到项目根目录，不要多嵌套一层。
3. 部署后建议：
   - 后端：重启 Node 进程。
   - 管理端：若生产用 dist，请在本地执行 npm run build 后上传新的 dist（本包仅含源码 layout 与 config）。
   - 小程序：用微信开发者工具上传/发布。

包含文件：
- miniprogram/pages/order/confirm.wxml / confirm.wxss（配送方式始终展示）
- miniprogram/pages/order/detail.js（支付后查单同步）
- backend/utils/wechat.js（V3 查单）
- backend/services/OrderCoreService.js（sync-wechat-pay、回调复用）
- backend/controllers/orderController.js
- backend/routes/orders.js（sync 路由、GET 回调探测）
- admin-ui/src/layout/index.vue（侧栏分组顺序）
- admin-ui/src/config/adminMenuPermissionGroups.js
