# cloud-mp 迁移矩阵

生成时间：2026-04-25T03:30:18.332Z

本矩阵以 `cloud-mp` 为主工程，只把旧 `backend / admin-ui / miniprogram` 作为对照参考。

## 概览

- 管理端源码并入：已并入
- 管理端路由入口：已存在
- 小程序页面状态统计：{"已通":51,"缺前端":7,"仅cloud-mp":15}
- 云函数 action 状态统计：{}
- 管理接口状态统计：{"已通":204,"缺接口":11}
- 数据模型状态统计：{}

## 小程序页面

| 项目 | 旧工程参考 | cloud-mp 落点 | 状态 |
| --- | --- | --- | --- |
| pages/activity/activity | miniprogram/pages/activity/activity | cloud-mp/miniprogram/pages/activity/activity | 已通 |
| pages/activity/brand-news-detail | miniprogram/pages/activity/brand-news-detail | cloud-mp/miniprogram/pages/activity/brand-news-detail | 已通 |
| pages/activity/limited-spot | miniprogram/pages/activity/limited-spot | cloud-mp/miniprogram/pages/activity/limited-spot | 已通 |
| pages/activity/n-invite | miniprogram/pages/activity/n-invite | cloud-mp/miniprogram/pages/activity/n-invite | 已通 |
| pages/address/edit | miniprogram/pages/address/edit | cloud-mp/miniprogram/pages/address/edit | 已通 |
| pages/address/list | miniprogram/pages/address/list | cloud-mp/miniprogram/pages/address/list | 已通 |
| pages/cart/cart | miniprogram/pages/cart/cart | cloud-mp/miniprogram/pages/cart/cart | 已通 |
| pages/category/category | miniprogram/pages/category/category | cloud-mp/miniprogram/pages/category/category | 已通 |
| pages/coupon/list | miniprogram/pages/coupon/list | cloud-mp/miniprogram/pages/coupon/list | 已通 |
| pages/distribution/business-center | miniprogram/pages/distribution/business-center | cloud-mp/miniprogram/pages/distribution/business-center | 已通 |
| pages/distribution/center | miniprogram/pages/distribution/center | cloud-mp/miniprogram/pages/distribution/center | 已通 |
| pages/distribution/commission-logs | miniprogram/pages/distribution/commission-logs | cloud-mp/miniprogram/pages/distribution/commission-logs | 已通 |
| pages/distribution/invite-poster | miniprogram/pages/distribution/invite-poster | cloud-mp/miniprogram/pages/distribution/invite-poster | 已通 |
| pages/distribution/stock-logs | miniprogram/pages/distribution/stock-logs | cloud-mp/miniprogram/pages/distribution/stock-logs | 已通 |
| pages/distribution/team | miniprogram/pages/distribution/team | cloud-mp/miniprogram/pages/distribution/team | 已通 |
| pages/distribution/team-member | miniprogram/pages/distribution/team-member | cloud-mp/miniprogram/pages/distribution/team-member | 已通 |
| pages/distribution/withdraw-history | miniprogram/pages/distribution/withdraw-history | cloud-mp/miniprogram/pages/distribution/withdraw-history | 已通 |
| pages/group/detail | miniprogram/pages/group/detail | cloud-mp/miniprogram/pages/group/detail | 已通 |
| pages/group/list | miniprogram/pages/group/list | cloud-mp/miniprogram/pages/group/list | 已通 |
| pages/index/index | miniprogram/pages/index/index | cloud-mp/miniprogram/pages/index/index | 已通 |
| pages/logistics/tracking | miniprogram/pages/logistics/tracking | cloud-mp/miniprogram/pages/logistics/tracking | 已通 |
| pages/lottery/lottery | miniprogram/pages/lottery/lottery | cloud-mp/miniprogram/pages/lottery/lottery | 已通 |
| pages/order/confirm | miniprogram/pages/order/confirm | cloud-mp/miniprogram/pages/order/confirm | 已通 |
| pages/order/detail | miniprogram/pages/order/detail | cloud-mp/miniprogram/pages/order/detail | 已通 |
| pages/order/list | miniprogram/pages/order/list | cloud-mp/miniprogram/pages/order/list | 已通 |
| pages/order/pickup-credential | miniprogram/pages/order/pickup-credential | cloud-mp/miniprogram/pages/order/pickup-credential | 已通 |
| pages/order/refund-apply | miniprogram/pages/order/refund-apply | cloud-mp/miniprogram/pages/order/refund-apply | 已通 |
| pages/order/refund-detail | miniprogram/pages/order/refund-detail | cloud-mp/miniprogram/pages/order/refund-detail | 已通 |
| pages/order/refund-list | miniprogram/pages/order/refund-list | cloud-mp/miniprogram/pages/order/refund-list | 已通 |
| pages/order/review | miniprogram/pages/order/review | cloud-mp/miniprogram/pages/order/review | 已通 |
| pages/pickup/orders | miniprogram/pages/pickup/orders | cloud-mp/miniprogram/pages/pickup/orders | 已通 |
| pages/pickup/verify | miniprogram/pages/pickup/verify | cloud-mp/miniprogram/pages/pickup/verify | 已通 |
| pages/points/index | miniprogram/pages/points/index | cloud-mp/miniprogram/pages/points/index | 已通 |
| pages/privacy/privacy | miniprogram/pages/privacy/privacy | cloud-mp/miniprogram/pages/privacy/privacy | 已通 |
| pages/product/detail | miniprogram/pages/product/detail | cloud-mp/miniprogram/pages/product/detail | 已通 |
| pages/product/reviews | miniprogram/pages/product/reviews |  | 缺前端 |
| pages/search/search | miniprogram/pages/search/search | cloud-mp/miniprogram/pages/search/search | 已通 |
| pages/slash/detail | miniprogram/pages/slash/detail | cloud-mp/miniprogram/pages/slash/detail | 已通 |
| pages/slash/list | miniprogram/pages/slash/list | cloud-mp/miniprogram/pages/slash/list | 已通 |
| pages/splash/splash | miniprogram/pages/splash/splash | cloud-mp/miniprogram/pages/splash/splash | 已通 |
| pages/stations/map | miniprogram/pages/stations/map | cloud-mp/miniprogram/pages/stations/map | 已通 |
| pages/stations/my-station | miniprogram/pages/stations/my-station | cloud-mp/miniprogram/pages/stations/my-station | 已通 |
| pages/user/customer-service | miniprogram/pages/user/customer-service | cloud-mp/miniprogram/pages/user/customer-service | 已通 |
| pages/user/edit-profile | miniprogram/pages/user/edit-profile | cloud-mp/miniprogram/pages/user/edit-profile | 已通 |
| pages/user/favorites | miniprogram/pages/user/favorites |  | 缺前端 |
| pages/user/favorites-footprints | miniprogram/pages/user/favorites-footprints | cloud-mp/miniprogram/pages/user/favorites-footprints | 已通 |
| pages/user/footprints | miniprogram/pages/user/footprints |  | 缺前端 |
| pages/user/growth-privileges | miniprogram/pages/user/growth-privileges |  | 缺前端 |
| pages/user/member-levels | miniprogram/pages/user/member-levels |  | 缺前端 |
| pages/user/membership-center | miniprogram/pages/user/membership-center | cloud-mp/miniprogram/pages/user/membership-center | 已通 |
| pages/user/notifications | miniprogram/pages/user/notifications | cloud-mp/miniprogram/pages/user/notifications | 已通 |
| pages/user/portal-password | miniprogram/pages/user/portal-password | cloud-mp/miniprogram/pages/user/portal-password | 已通 |
| pages/user/preferences | miniprogram/pages/user/preferences |  | 缺前端 |
| pages/user/ticket-list | miniprogram/pages/user/ticket-list |  | 缺前端 |
| pages/user/user | miniprogram/pages/user/user | cloud-mp/miniprogram/pages/user/user | 已通 |
| pages/wallet/agent-wallet | miniprogram/pages/wallet/agent-wallet | cloud-mp/miniprogram/pages/wallet/agent-wallet | 已通 |
| pages/wallet/index | miniprogram/pages/wallet/index | cloud-mp/miniprogram/pages/wallet/index | 已通 |
| pages/wallet/recharge-order | miniprogram/pages/wallet/recharge-order | cloud-mp/miniprogram/pages/wallet/recharge-order | 已通 |
| pages/activity/flex-bundles |  | cloud-mp/miniprogram/pages/activity/flex-bundles | 仅cloud-mp |
| pages/coupon/center |  | cloud-mp/miniprogram/pages/coupon/center | 仅cloud-mp |
| pages/coupon/claim |  | cloud-mp/miniprogram/pages/coupon/claim | 仅cloud-mp |
| pages/coupon/exchange |  | cloud-mp/miniprogram/pages/coupon/exchange | 仅cloud-mp |
| pages/distribution/directed-invite |  | cloud-mp/miniprogram/pages/distribution/directed-invite | 仅cloud-mp |
| pages/distribution/directed-invites |  | cloud-mp/miniprogram/pages/distribution/directed-invites | 仅cloud-mp |
| pages/distribution/fund-pool |  | cloud-mp/miniprogram/pages/distribution/fund-pool | 仅cloud-mp |
| pages/distribution/goods-fund-transfer-history |  | cloud-mp/miniprogram/pages/distribution/goods-fund-transfer-history | 仅cloud-mp |
| pages/distribution/promotion-progress |  | cloud-mp/miniprogram/pages/distribution/promotion-progress | 仅cloud-mp |
| pages/index/brand-news-list |  | cloud-mp/miniprogram/pages/index/brand-news-list | 仅cloud-mp |
| pages/index/brand-zone-detail |  | cloud-mp/miniprogram/pages/index/brand-zone-detail | 仅cloud-mp |
| pages/lottery/claim |  | cloud-mp/miniprogram/pages/lottery/claim | 仅cloud-mp |
| pages/order/pickup-station-list |  | cloud-mp/miniprogram/pages/order/pickup-station-list | 仅cloud-mp |
| pages/product-bundle/detail |  | cloud-mp/miniprogram/pages/product-bundle/detail | 仅cloud-mp |
| pages/user/deposit-orders |  | cloud-mp/miniprogram/pages/user/deposit-orders | 仅cloud-mp |

## 云函数 Action

| 项目 | 旧工程参考 | cloud-mp 落点 | 状态 |
| --- | --- | --- | --- |

## 管理接口

| 项目 | 旧工程参考 | cloud-mp 落点 | 状态 |
| --- | --- | --- | --- |
| DELETE /admins/:id | admin-ui/src/api/modules/partners.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| DELETE /banners/:id | admin-ui/src/api/modules/content.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| DELETE /boards/:id/products/:id | admin-ui/src/api/modules/boards.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| DELETE /categories/:id | admin-ui/src/api/modules/catalog.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| DELETE /contents/:id | admin-ui/src/api/modules/content.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| DELETE /coupons/:id | admin-ui/src/api/modules/marketing.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| DELETE /db-indexes/:id/:id | admin-ui/src/api/modules/system.js |  | 缺接口 |
| DELETE /group-buys/:id | admin-ui/src/api/modules/marketing.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| DELETE /home-sections/:id | admin-ui/src/api/modules/content.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| DELETE /lottery-prizes/:id | admin-ui/src/api/modules/marketing.js | cloud-mp/cloudfunctions/admin-api/src/admin-lottery.js | 已通 |
| DELETE /mass-messages/:id | admin-ui/src/api/modules/content.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| DELETE /material-groups/:id | admin-ui/src/api/modules/content.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| DELETE /materials/:id | admin-ui/src/api/modules/content.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| DELETE /pickup-stations/:id/staff/:id | admin-ui/src/api/modules/agentSystem.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| DELETE /products/:id | admin-ui/src/api/modules/catalog.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| DELETE /slash-activities/:id | admin-ui/src/api/modules/marketing.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| GET /activity-links | admin-ui/src/api/modules/marketing.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| GET /activity-options | admin-ui/src/api/modules/marketing.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| GET /admins | admin-ui/src/api/modules/partners.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /agent-system/assist-bonus | admin-ui/src/api/modules/agentSystem.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| GET /agent-system/commission-config | admin-ui/src/api/modules/agentSystem.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| GET /agent-system/dividend-rules | admin-ui/src/api/modules/agentSystem.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| GET /agent-system/dividend/preview | admin-ui/src/api/modules/agentSystem.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| GET /agent-system/exit-applications | admin-ui/src/api/modules/agentSystem.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| GET /agent-system/exit-rules | admin-ui/src/api/modules/agentSystem.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| GET /agent-system/fund-pool | admin-ui/src/api/modules/agentSystem.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| GET /agent-system/peer-bonus | admin-ui/src/api/modules/agentSystem.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| GET /agent-system/recharge-config | admin-ui/src/api/modules/agentSystem.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| GET /agent-system/upgrade-rules | admin-ui/src/api/modules/agentSystem.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| GET /alert-config | admin-ui/src/api/modules/system.js | cloud-mp/cloudfunctions/admin-api/src/admin-system.js | 已通 |
| GET /banners | admin-ui/src/api/modules/content.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /boards | admin-ui/src/api/modules/boards.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| GET /boards/:id/products | admin-ui/src/api/modules/boards.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| GET /branch-agent-policy | admin-ui/src/api/modules/partners.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /branch-agents/claims | admin-ui/src/api/modules/partners.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /branch-agents/stations | admin-ui/src/api/modules/partners.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /categories | admin-ui/src/api/modules/catalog.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /commissions | admin-ui/src/api/modules/finance.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /contents | admin-ui/src/api/modules/content.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /coupon-auto-rules | admin-ui/src/api/modules/marketing.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| GET /coupons | admin-ui/src/api/modules/marketing.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| GET /coupons/:id | admin-ui/src/api/modules/marketing.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| GET /dashboard/notifications | admin-ui/src/api/modules/statistics.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| GET /db-indexes/:id | admin-ui/src/api/modules/system.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| GET /db-indexes/:id/columns | admin-ui/src/api/modules/system.js |  | 缺接口 |
| GET /db-indexes/tables | admin-ui/src/api/modules/system.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| GET /dealers | admin-ui/src/api/modules/partners.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /debug/anomalies | admin-ui/src/api/modules/system.js | cloud-mp/cloudfunctions/admin-api/src/admin-system.js | 已通 |
| GET /debug/cron-status | admin-ui/src/api/modules/system.js | cloud-mp/cloudfunctions/admin-api/src/admin-system.js | 已通 |
| GET /debug/db-ping | admin-ui/src/api/modules/system.js | cloud-mp/cloudfunctions/admin-api/src/admin-system.js | 已通 |
| GET /debug/logs | admin-ui/src/api/modules/system.js | cloud-mp/cloudfunctions/admin-api/src/admin-system.js | 已通 |
| GET /debug/process | admin-ui/src/api/modules/system.js | cloud-mp/cloudfunctions/admin-api/src/admin-system.js | 已通 |
| GET /feature-toggles | admin-ui/src/api/modules/system.js | cloud-mp/cloudfunctions/admin-api/src/admin-system.js | 已通 |
| GET /festival-config | admin-ui/src/api/modules/marketing.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| GET /global-ui-config | admin-ui/src/api/modules/marketing.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| GET /group-buys | admin-ui/src/api/modules/marketing.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| GET /group-buys/:id | admin-ui/src/api/modules/marketing.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| GET /home-sections | admin-ui/src/api/modules/content.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /home-sections/schemas | admin-ui/src/api/modules/content.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /logistics/order/:id | admin-ui/src/api/modules/ordersFulfillment.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /logs | admin-ui/src/api/modules/content.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /logs/export | admin-ui/src/api/modules/content.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /lottery-prizes | admin-ui/src/api/modules/marketing.js | cloud-mp/cloudfunctions/admin-api/src/admin-lottery.js | 已通 |
| GET /mass-messages | admin-ui/src/api/modules/content.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /material-groups | admin-ui/src/api/modules/content.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /materials | admin-ui/src/api/modules/content.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /member-tier-config | admin-ui/src/api/modules/system.js | cloud-mp/cloudfunctions/admin-api/src/admin-system.js | 已通 |
| GET /mini-program-config | admin-ui/src/api/modules/system.js | cloud-mp/cloudfunctions/admin-api/src/admin-system.js | 已通 |
| GET /n-system/leaders | admin-ui/src/api/modules/agentSystem.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| GET /n-system/leaders/:id/members | admin-ui/src/api/modules/agentSystem.js |  | 缺接口 |
| GET /n-system/members | admin-ui/src/api/modules/agentSystem.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| GET /operations/dashboard | admin-ui/src/api/modules/system.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /orders | admin-ui/src/api/modules/ordersFulfillment.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /orders/:id | admin-ui/src/api/modules/ordersFulfillment.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /orders/export | admin-ui/src/api/modules/ordersFulfillment.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /payment-health | admin-ui/src/api/modules/system.js | cloud-mp/cloudfunctions/admin-api/src/admin-system.js | 已通 |
| GET /pickup-stations | admin-ui/src/api/modules/partners.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| GET /pickup-stations/:id | admin-ui/src/api/modules/partners.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| GET /pickup-stations/:id/staff | admin-ui/src/api/modules/agentSystem.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| GET /popup-ad-config | admin-ui/src/api/modules/system.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /products | admin-ui/src/api/modules/catalog.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /products/:id | admin-ui/src/api/modules/catalog.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /profile | admin-ui/src/api/modules/auth.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /refunds | admin-ui/src/api/modules/finance.js | cloud-mp/cloudfunctions/admin-api/src/admin-refunds.js | 已通 |
| GET /refunds/:id | admin-ui/src/api/modules/finance.js | cloud-mp/cloudfunctions/admin-api/src/admin-refunds.js | 已通 |
| GET /reviews | admin-ui/src/api/modules/content.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /settings | admin-ui/src/api/modules/system.js | cloud-mp/cloudfunctions/admin-api/src/admin-system.js | 已通 |
| GET /slash-activities | admin-ui/src/api/modules/marketing.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| GET /slash-activities/:id | admin-ui/src/api/modules/marketing.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| GET /splash | admin-ui/src/api/modules/marketing.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| GET /statistics/agent-ranking | admin-ui/src/api/modules/statistics.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| GET /statistics/distribution-report | admin-ui/src/api/modules/statistics.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| GET /statistics/low-stock | admin-ui/src/api/modules/statistics.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| GET /statistics/overview | admin-ui/src/api/modules/statistics.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /statistics/product-ranking | admin-ui/src/api/modules/statistics.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| GET /statistics/sales-trend | admin-ui/src/api/modules/statistics.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| GET /statistics/user-trend | admin-ui/src/api/modules/statistics.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| GET /storage/config | admin-ui/src/api/modules/mediaUpload.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /system-configs | admin-ui/src/api/modules/system.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| GET /system-configs/:id/history | admin-ui/src/api/modules/system.js |  | 缺接口 |
| GET /system/status | admin-ui/src/api/modules/system.js | cloud-mp/cloudfunctions/admin-api/src/admin-system.js | 已通 |
| GET /upgrade-applications | admin-ui/src/api/modules/agentSystem.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /users | admin-ui/src/api/modules/users.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /users/:id | admin-ui/src/api/modules/users.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /users/:id/team | admin-ui/src/api/modules/users.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /users/:id/team-summary | admin-ui/src/api/modules/users.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /withdrawals | admin-ui/src/api/modules/finance.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| POST /admins | admin-ui/src/api/modules/partners.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| POST /agent-system/dividend/execute | admin-ui/src/api/modules/agentSystem.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| POST /agent-system/exit-applications/:id | admin-ui/src/api/modules/agentSystem.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| POST /alert-config/test | admin-ui/src/api/modules/system.js | cloud-mp/cloudfunctions/admin-api/src/admin-system.js | 已通 |
| POST /banners | admin-ui/src/api/modules/content.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| POST /boards/:id/products | admin-ui/src/api/modules/boards.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| POST /boards/:id/products/sort | admin-ui/src/api/modules/boards.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| POST /branch-agents/stations | admin-ui/src/api/modules/partners.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| POST /categories | admin-ui/src/api/modules/catalog.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| POST /commissions/batch-approve | admin-ui/src/api/modules/finance.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| POST /commissions/batch-reject | admin-ui/src/api/modules/finance.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| POST /contents | admin-ui/src/api/modules/content.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| POST /coupons | admin-ui/src/api/modules/marketing.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| POST /coupons/:id/issue | admin-ui/src/api/modules/marketing.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| POST /db-indexes | admin-ui/src/api/modules/system.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| POST /feature-toggles | admin-ui/src/api/modules/system.js | cloud-mp/cloudfunctions/admin-api/src/admin-system.js | 已通 |
| POST /group-buys | admin-ui/src/api/modules/marketing.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| POST /home-sections | admin-ui/src/api/modules/content.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| POST /home-sections/sort | admin-ui/src/api/modules/content.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| POST /login | admin-ui/src/api/modules/auth.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| POST /logout | admin-ui/src/api/modules/auth.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| POST /lottery-prizes | admin-ui/src/api/modules/marketing.js | cloud-mp/cloudfunctions/admin-api/src/admin-lottery.js | 已通 |
| POST /mass-messages | admin-ui/src/api/modules/content.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| POST /mass-messages/:id/send | admin-ui/src/api/modules/content.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| POST /material-groups | admin-ui/src/api/modules/content.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| POST /material-groups/move | admin-ui/src/api/modules/content.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| POST /materials | admin-ui/src/api/modules/content.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| POST /orders/batch-ship | admin-ui/src/api/modules/ordersFulfillment.js |  | 缺接口 |
| POST /pickup-stations | admin-ui/src/api/modules/partners.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| POST /pickup-stations/:id/staff | admin-ui/src/api/modules/agentSystem.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| POST /products | admin-ui/src/api/modules/catalog.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| POST /slash-activities | admin-ui/src/api/modules/marketing.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| POST /storage/test | admin-ui/src/api/modules/mediaUpload.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| POST /system-configs/:id/rollback | admin-ui/src/api/modules/system.js |  | 缺接口 |
| POST /system-configs/batch | admin-ui/src/api/modules/system.js |  | 缺接口 |
| POST /system-configs/refresh-cache | admin-ui/src/api/modules/system.js |  | 缺接口 |
| POST /upload | admin-ui/src/api/modules/mediaUpload.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| POST /upload/multiple | admin-ui/src/api/modules/mediaUpload.js |  | 缺接口 |
| POST /users/batch-role | admin-ui/src/api/modules/users.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| PUT /activity-links | admin-ui/src/api/modules/marketing.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| PUT /admins/:id | admin-ui/src/api/modules/partners.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| PUT /admins/:id/password | admin-ui/src/api/modules/partners.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| PUT /agent-system/assist-bonus | admin-ui/src/api/modules/agentSystem.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| PUT /agent-system/commission-config | admin-ui/src/api/modules/agentSystem.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| PUT /agent-system/dividend-rules | admin-ui/src/api/modules/agentSystem.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| PUT /agent-system/exit-applications/:id/review | admin-ui/src/api/modules/agentSystem.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| PUT /agent-system/exit-rules | admin-ui/src/api/modules/agentSystem.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| PUT /agent-system/fund-pool | admin-ui/src/api/modules/agentSystem.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| PUT /agent-system/peer-bonus | admin-ui/src/api/modules/agentSystem.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| PUT /agent-system/recharge-config | admin-ui/src/api/modules/agentSystem.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| PUT /agent-system/upgrade-rules | admin-ui/src/api/modules/agentSystem.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| PUT /alert-config | admin-ui/src/api/modules/system.js | cloud-mp/cloudfunctions/admin-api/src/admin-system.js | 已通 |
| PUT /banners/:id | admin-ui/src/api/modules/content.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| PUT /boards/:id/products/:id | admin-ui/src/api/modules/boards.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| PUT /branch-agent-policy | admin-ui/src/api/modules/partners.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| PUT /branch-agents/claims/:id/review | admin-ui/src/api/modules/partners.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| PUT /branch-agents/stations/:id | admin-ui/src/api/modules/partners.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| PUT /categories/:id | admin-ui/src/api/modules/catalog.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| PUT /commissions/:id/approve | admin-ui/src/api/modules/finance.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| PUT /commissions/:id/reject | admin-ui/src/api/modules/finance.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| PUT /contents/:id | admin-ui/src/api/modules/content.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| PUT /coupon-auto-rules | admin-ui/src/api/modules/marketing.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| PUT /coupons/:id | admin-ui/src/api/modules/marketing.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| PUT /dealers/:id/approve | admin-ui/src/api/modules/partners.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| PUT /dealers/:id/level | admin-ui/src/api/modules/partners.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| PUT /dealers/:id/reject | admin-ui/src/api/modules/partners.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| PUT /festival-config | admin-ui/src/api/modules/marketing.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| PUT /global-ui-config | admin-ui/src/api/modules/marketing.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| PUT /group-buys/:id | admin-ui/src/api/modules/marketing.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| PUT /home-sections/:id | admin-ui/src/api/modules/content.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| PUT /home-sections/:id/toggle | admin-ui/src/api/modules/content.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| PUT /lottery-prizes/:id | admin-ui/src/api/modules/marketing.js | cloud-mp/cloudfunctions/admin-api/src/admin-lottery.js | 已通 |
| PUT /material-groups/:id | admin-ui/src/api/modules/content.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| PUT /materials/:id | admin-ui/src/api/modules/content.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| PUT /member-tier-config | admin-ui/src/api/modules/system.js | cloud-mp/cloudfunctions/admin-api/src/admin-system.js | 已通 |
| PUT /mini-program-config | admin-ui/src/api/modules/system.js | cloud-mp/cloudfunctions/admin-api/src/admin-system.js | 已通 |
| PUT /orders/:id/amount | admin-ui/src/api/modules/ordersFulfillment.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| PUT /orders/:id/force-cancel | admin-ui/src/api/modules/ordersFulfillment.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| PUT /orders/:id/force-complete | admin-ui/src/api/modules/ordersFulfillment.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| PUT /orders/:id/remark | admin-ui/src/api/modules/ordersFulfillment.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| PUT /orders/:id/ship | admin-ui/src/api/modules/ordersFulfillment.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| PUT /orders/:id/shipping-info | admin-ui/src/api/modules/ordersFulfillment.js |  | 缺接口 |
| PUT /password | admin-ui/src/api/modules/auth.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| PUT /pickup-stations/:id | admin-ui/src/api/modules/partners.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| PUT /popup-ad-config | admin-ui/src/api/modules/system.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| PUT /products/:id | admin-ui/src/api/modules/catalog.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| PUT /products/:id/status | admin-ui/src/api/modules/catalog.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| PUT /refunds/:id/approve | admin-ui/src/api/modules/finance.js | cloud-mp/cloudfunctions/admin-api/src/admin-refunds.js | 已通 |
| PUT /refunds/:id/complete | admin-ui/src/api/modules/finance.js | cloud-mp/cloudfunctions/admin-api/src/admin-refunds.js | 已通 |
| PUT /refunds/:id/reject | admin-ui/src/api/modules/finance.js | cloud-mp/cloudfunctions/admin-api/src/admin-refunds.js | 已通 |
| PUT /reviews/:id | admin-ui/src/api/modules/content.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| PUT /settings | admin-ui/src/api/modules/system.js | cloud-mp/cloudfunctions/admin-api/src/admin-system.js | 已通 |
| PUT /slash-activities/:id | admin-ui/src/api/modules/marketing.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| PUT /splash | admin-ui/src/api/modules/marketing.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| PUT /storage/config | admin-ui/src/api/modules/mediaUpload.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| PUT /upgrade-applications/:id/review | admin-ui/src/api/modules/agentSystem.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| PUT /users/:id/balance | admin-ui/src/api/modules/users.js |  | 缺接口 |
| PUT /users/:id/commerce | admin-ui/src/api/modules/users.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| PUT /users/:id/invite-code | admin-ui/src/api/modules/users.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| PUT /users/:id/member-no | admin-ui/src/api/modules/users.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| PUT /users/:id/parent | admin-ui/src/api/modules/users.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| PUT /users/:id/purchase-level | admin-ui/src/api/modules/users.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| PUT /users/:id/remark | admin-ui/src/api/modules/users.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| PUT /users/:id/role | admin-ui/src/api/modules/users.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| PUT /users/:id/status | admin-ui/src/api/modules/users.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| PUT /withdrawals/:id/approve | admin-ui/src/api/modules/finance.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| PUT /withdrawals/:id/complete | admin-ui/src/api/modules/finance.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| PUT /withdrawals/:id/reject | admin-ui/src/api/modules/finance.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |

## CloudBase 数据集合

| 项目 | 旧工程参考 | cloud-mp 落点 | 状态 |
| --- | --- | --- | --- |

## 说明

- `已通`：旧工程参考项在 `cloud-mp` 中已有明确落点。
- `缺前端`：旧页面或管理端源码尚未并入 `cloud-mp`。
- `缺接口`：旧 API 调用在 `cloud-mp` 管理服务中尚未找到实现。
- `缺数据`：正式集合缺少 seed 或 import 文件。
- `缺验收`：已建模但旧工程引用证据弱，仍需场景级 smoke test。
- `已验收`：已建模且已通过 live smoke 校验。
- `仅cloud-mp`：只在新工程中出现的页面或能力。

