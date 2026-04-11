# cloud-mp 迁移矩阵

生成时间：2026-04-11T05:29:54.781Z

本矩阵以 `cloud-mp` 为主工程，只把旧 `backend / admin-ui / miniprogram` 作为对照参考。

## 概览

- 管理端源码并入：已并入
- 管理端路由入口：已存在
- 小程序页面状态统计：{"已通":58}
- 云函数 action 状态统计：{"已通":123}
- 管理接口状态统计：{"已通":214}
- 数据模型状态统计：{"已建模":31,"缺验收":3}

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
| pages/product/reviews | miniprogram/pages/product/reviews | cloud-mp/miniprogram/pages/product/reviews | 已通 |
| pages/search/search | miniprogram/pages/search/search | cloud-mp/miniprogram/pages/search/search | 已通 |
| pages/slash/detail | miniprogram/pages/slash/detail | cloud-mp/miniprogram/pages/slash/detail | 已通 |
| pages/slash/list | miniprogram/pages/slash/list | cloud-mp/miniprogram/pages/slash/list | 已通 |
| pages/splash/splash | miniprogram/pages/splash/splash | cloud-mp/miniprogram/pages/splash/splash | 已通 |
| pages/stations/map | miniprogram/pages/stations/map | cloud-mp/miniprogram/pages/stations/map | 已通 |
| pages/stations/my-station | miniprogram/pages/stations/my-station | cloud-mp/miniprogram/pages/stations/my-station | 已通 |
| pages/user/customer-service | miniprogram/pages/user/customer-service | cloud-mp/miniprogram/pages/user/customer-service | 已通 |
| pages/user/edit-profile | miniprogram/pages/user/edit-profile | cloud-mp/miniprogram/pages/user/edit-profile | 已通 |
| pages/user/favorites | miniprogram/pages/user/favorites | cloud-mp/miniprogram/pages/user/favorites | 已通 |
| pages/user/favorites-footprints | miniprogram/pages/user/favorites-footprints | cloud-mp/miniprogram/pages/user/favorites-footprints | 已通 |
| pages/user/footprints | miniprogram/pages/user/footprints | cloud-mp/miniprogram/pages/user/footprints | 已通 |
| pages/user/growth-privileges | miniprogram/pages/user/growth-privileges | cloud-mp/miniprogram/pages/user/growth-privileges | 已通 |
| pages/user/member-levels | miniprogram/pages/user/member-levels | cloud-mp/miniprogram/pages/user/member-levels | 已通 |
| pages/user/membership-center | miniprogram/pages/user/membership-center | cloud-mp/miniprogram/pages/user/membership-center | 已通 |
| pages/user/notifications | miniprogram/pages/user/notifications | cloud-mp/miniprogram/pages/user/notifications | 已通 |
| pages/user/portal-password | miniprogram/pages/user/portal-password | cloud-mp/miniprogram/pages/user/portal-password | 已通 |
| pages/user/preferences | miniprogram/pages/user/preferences | cloud-mp/miniprogram/pages/user/preferences | 已通 |
| pages/user/ticket-list | miniprogram/pages/user/ticket-list | cloud-mp/miniprogram/pages/user/ticket-list | 已通 |
| pages/user/user | miniprogram/pages/user/user | cloud-mp/miniprogram/pages/user/user | 已通 |
| pages/wallet/agent-wallet | miniprogram/pages/wallet/agent-wallet | cloud-mp/miniprogram/pages/wallet/agent-wallet | 已通 |
| pages/wallet/index | miniprogram/pages/wallet/index | cloud-mp/miniprogram/pages/wallet/index | 已通 |
| pages/wallet/recharge-order | miniprogram/pages/wallet/recharge-order | cloud-mp/miniprogram/pages/wallet/recharge-order | 已通 |

## 云函数 Action

| 项目 | 旧工程参考 | cloud-mp 落点 | 状态 |
| --- | --- | --- | --- |
| cart.add | POST /cart | cloud-mp/cloudfunctions/cart/index.js | 已通 |
| cart.check | POST /cart/check | cloud-mp/cloudfunctions/cart/index.js | 已通 |
| cart.clear | DELETE /cart/clear | cloud-mp/cloudfunctions/cart/index.js | 已通 |
| cart.list | GET /cart | cloud-mp/cloudfunctions/cart/index.js | 已通 |
| cart.remove | DELETE /cart/:id | cloud-mp/cloudfunctions/cart/index.js | 已通 |
| cart.update | PUT /cart/:id | cloud-mp/cloudfunctions/cart/index.js | 已通 |
| config.activeTheme | GET /themes/active | cloud-mp/cloudfunctions/config/index.js | 已通 |
| config.activities | GET /activities | cloud-mp/cloudfunctions/config/index.js | 已通 |
| config.activityBubbles | GET /activity/bubbles | cloud-mp/cloudfunctions/config/index.js | 已通 |
| config.activityLinks | GET /activity/links | cloud-mp/cloudfunctions/config/index.js | 已通 |
| config.banners | GET /banners | cloud-mp/cloudfunctions/config/index.js | 已通 |
| config.boardsMap | GET /boards/map | cloud-mp/cloudfunctions/config/index.js | 已通 |
| config.brandNews | GET /page-content/brand-news | cloud-mp/cloudfunctions/config/index.js | 已通 |
| config.festivalConfig | GET /activity/festival-config | cloud-mp/cloudfunctions/config/index.js | 已通 |
| config.getSystemConfig | GET /configs | cloud-mp/cloudfunctions/config/index.js | 已通 |
| config.groupActivities | GET /group/activities | cloud-mp/cloudfunctions/config/index.js | 已通 |
| config.groupDetail | GET /groups/:id | cloud-mp/cloudfunctions/config/index.js | 已通 |
| config.groups | GET /groups | cloud-mp/cloudfunctions/config/index.js | 已通 |
| config.homeContent | GET /page-content/home | GET /page-content | GET /homepage-config | cloud-mp/cloudfunctions/config/index.js | 已通 |
| config.limitedSpotDetail | GET /activity/limited-spot/detail | cloud-mp/cloudfunctions/config/index.js | 已通 |
| config.lottery | GET /lottery | cloud-mp/cloudfunctions/config/index.js | 已通 |
| config.lotteryPrizes | GET /lottery/prizes | cloud-mp/cloudfunctions/config/index.js | 已通 |
| config.lotteryRecords | GET /lottery/records | cloud-mp/cloudfunctions/config/index.js | 已通 |
| config.miniProgramConfig | GET /mini-program-config | cloud-mp/cloudfunctions/config/index.js | 已通 |
| config.nInviteCard | GET /n/invite-card | cloud-mp/cloudfunctions/config/index.js | 已通 |
| config.questionnaireActive | GET /questionnaire/active | cloud-mp/cloudfunctions/config/index.js | 已通 |
| config.rules | GET /rules | cloud-mp/cloudfunctions/config/index.js | 已通 |
| config.slashActivities | GET /slash/activities | cloud-mp/cloudfunctions/config/index.js | 已通 |
| config.slashList | GET /slash | cloud-mp/cloudfunctions/config/index.js | 已通 |
| config.splash | GET /splash/active | cloud-mp/cloudfunctions/config/index.js | 已通 |
| distribution.agentOrders | GET /agent/orders | cloud-mp/cloudfunctions/distribution/index.js | 已通 |
| distribution.agentRestock | POST /agent/restock | cloud-mp/cloudfunctions/distribution/index.js | 已通 |
| distribution.agentWallet | GET /agent/wallet | cloud-mp/cloudfunctions/distribution/index.js | 已通 |
| distribution.agentWalletLogs | GET /agent/wallet/logs | cloud-mp/cloudfunctions/distribution/index.js | 已通 |
| distribution.agentWalletPrepay | POST /agent/wallet/prepay | cloud-mp/cloudfunctions/distribution/index.js | 已通 |
| distribution.agentWalletRechargeConfig | GET /agent/wallet/recharge-config | cloud-mp/cloudfunctions/distribution/index.js | 已通 |
| distribution.agentWalletRechargeOrderDetail | GET /agent/wallet/recharge-orders/:id | cloud-mp/cloudfunctions/distribution/index.js | 已通 |
| distribution.agentWorkbench | GET /agent/workbench | cloud-mp/cloudfunctions/distribution/index.js | 已通 |
| distribution.center | GET /distribution/overview | GET /distribution/center | GET /stats/distribution | GET /agent | GET /wallet | cloud-mp/cloudfunctions/distribution/index.js | 已通 |
| distribution.commissionPreview | GET /commissions/preview | cloud-mp/cloudfunctions/distribution/index.js | 已通 |
| distribution.commLogs | GET /distribution/commission-logs | GET /commissions | cloud-mp/cloudfunctions/distribution/index.js | 已通 |
| distribution.settleMatured | POST /commissions/settle-matured | cloud-mp/cloudfunctions/distribution/index.js | 已通 |
| distribution.stats | GET /distribution/stats | cloud-mp/cloudfunctions/distribution/index.js | 已通 |
| distribution.team | GET /distribution/team | cloud-mp/cloudfunctions/distribution/index.js | 已通 |
| distribution.teamDetail | GET /distribution/team/:id | cloud-mp/cloudfunctions/distribution/index.js | 已通 |
| distribution.withdraw | POST /distribution/withdraw | POST /wallet/withdraw | cloud-mp/cloudfunctions/distribution/index.js | 已通 |
| distribution.withdrawList | GET /wallet/withdrawals | cloud-mp/cloudfunctions/distribution/index.js | 已通 |
| distribution.wxacodeInvite | GET /distribution/wxacode-invite | cloud-mp/cloudfunctions/distribution/index.js | 已通 |
| order.applyRefund | POST /refunds | cloud-mp/cloudfunctions/order/index.js | 已通 |
| order.cancel | POST /orders/:id/cancel | cloud-mp/cloudfunctions/order/index.js | 已通 |
| order.cancelRefund | PUT /refunds/:id/cancel | cloud-mp/cloudfunctions/order/index.js | 已通 |
| order.confirm | POST /orders/:id/confirm | POST /orders/:id/confirm-received | cloud-mp/cloudfunctions/order/index.js | 已通 |
| order.create | POST /orders | cloud-mp/cloudfunctions/order/index.js | 已通 |
| order.detail | GET /orders/:id | cloud-mp/cloudfunctions/order/index.js | 已通 |
| order.groupOrderDetail | GET /group/orders/:id | cloud-mp/cloudfunctions/order/index.js | 已通 |
| order.joinGroup | POST /groups/:id/join | POST /group/orders | cloud-mp/cloudfunctions/order/index.js | 已通 |
| order.list | GET /orders | cloud-mp/cloudfunctions/order/index.js | 已通 |
| order.lotteryDraw | POST /lottery/draw | cloud-mp/cloudfunctions/order/index.js | 已通 |
| order.myGroups | GET /group/my | cloud-mp/cloudfunctions/order/index.js | 已通 |
| order.mySlashList | GET /slash/my/list | cloud-mp/cloudfunctions/order/index.js | 已通 |
| order.pickupMyOrder | GET /pickup/my/:id | cloud-mp/cloudfunctions/order/index.js | 已通 |
| order.pickupPendingOrders | GET /pickup/pending-orders | cloud-mp/cloudfunctions/order/index.js | 已通 |
| order.pickupVerifyCode | POST /pickup/verify-code | cloud-mp/cloudfunctions/order/index.js | 已通 |
| order.pickupVerifyQr | POST /pickup/verify-qr | cloud-mp/cloudfunctions/order/index.js | 已通 |
| order.refundDetail | GET /refunds/:id | cloud-mp/cloudfunctions/order/index.js | 已通 |
| order.refundList | GET /refunds | cloud-mp/cloudfunctions/order/index.js | 已通 |
| order.returnShipping | PUT /refunds/:id/return-shipping | cloud-mp/cloudfunctions/order/index.js | 已通 |
| order.review | POST /orders/:id/review | cloud-mp/cloudfunctions/order/index.js | 已通 |
| order.slashDetail | GET /slash/:id | cloud-mp/cloudfunctions/order/index.js | 已通 |
| order.slashHelp | POST /slash/:id/help | cloud-mp/cloudfunctions/order/index.js | 已通 |
| order.slashStart | POST /slash/start | cloud-mp/cloudfunctions/order/index.js | 已通 |
| order.trackLogistics | GET /logistics/order/:id | GET /logistics/:id | cloud-mp/cloudfunctions/order/index.js | 已通 |
| payment.prepay | POST /orders/:id/pay | POST /orders/:id/prepay | cloud-mp/cloudfunctions/payment/index.js | 已通 |
| payment.queryStatus | GET /orders/:id/pay-status | cloud-mp/cloudfunctions/payment/index.js | 已通 |
| payment.syncWechatPay | POST /orders/:id/sync-wechat-pay | cloud-mp/cloudfunctions/payment/index.js | 已通 |
| products.categories | GET /categories | cloud-mp/cloudfunctions/products/index.js | 已通 |
| products.detail | GET /products/:id | cloud-mp/cloudfunctions/products/index.js | 已通 |
| products.list | GET /products | cloud-mp/cloudfunctions/products/index.js | 已通 |
| products.reviews | GET /products/:id/reviews | cloud-mp/cloudfunctions/products/index.js | 已通 |
| products.search | GET /search | GET /products/search | cloud-mp/cloudfunctions/products/index.js | 已通 |
| user.addAddress | POST /addresses | cloud-mp/cloudfunctions/user/index.js | 已通 |
| user.addFavorite | POST /user/favorites | cloud-mp/cloudfunctions/user/index.js | 已通 |
| user.applyInitialPassword | POST /user/portal/apply-initial-password | cloud-mp/cloudfunctions/user/index.js | 已通 |
| user.availableCoupons | GET /coupons/available | cloud-mp/cloudfunctions/user/index.js | 已通 |
| user.claimCoupon | POST /coupons/claim | cloud-mp/cloudfunctions/user/index.js | 已通 |
| user.claimWelcomeCoupons | POST /user/claim-welcome-coupons | cloud-mp/cloudfunctions/user/index.js | 已通 |
| user.clearAllFavorites | POST /user/favorites/clear-all | cloud-mp/cloudfunctions/user/index.js | 已通 |
| user.deleteAddress | DELETE /addresses/:id | cloud-mp/cloudfunctions/user/index.js | 已通 |
| user.favoriteStatus | GET /user/favorites/status | cloud-mp/cloudfunctions/user/index.js | 已通 |
| user.getAddressDetail | GET /addresses/:id | cloud-mp/cloudfunctions/user/index.js | 已通 |
| user.getFavorites | GET /user/favorites | cloud-mp/cloudfunctions/user/index.js | 已通 |
| user.getPickupScope | GET /stations/my-scope | cloud-mp/cloudfunctions/user/index.js | 已通 |
| user.getPreferences | GET /user/preferences | cloud-mp/cloudfunctions/user/index.js | 已通 |
| user.getProfile | GET /user/profile | GET /user/info | cloud-mp/cloudfunctions/user/index.js | 已通 |
| user.getStats | GET /user/stats | GET /points | GET /points/summary | cloud-mp/cloudfunctions/user/index.js | 已通 |
| user.listAddresses | GET /addresses | cloud-mp/cloudfunctions/user/index.js | 已通 |
| user.listCoupons | GET /coupons/mine | GET /coupons | cloud-mp/cloudfunctions/user/index.js | 已通 |
| user.listNotifications | GET /notifications | cloud-mp/cloudfunctions/user/index.js | 已通 |
| user.listStations | GET /stations | cloud-mp/cloudfunctions/user/index.js | 已通 |
| user.listTickets | GET /customer-service/tickets | cloud-mp/cloudfunctions/user/index.js | 已通 |
| user.markRead | PUT /notifications/:id/read | cloud-mp/cloudfunctions/user/index.js | 已通 |
| user.memberTierMeta | GET /user/member-tier-meta | cloud-mp/cloudfunctions/user/index.js | 已通 |
| user.pickupOptions | GET /stations/pickup-options | cloud-mp/cloudfunctions/user/index.js | 已通 |
| user.pointsAccount | GET /points/account | cloud-mp/cloudfunctions/user/index.js | 已通 |
| user.pointsLogs | GET /points/logs | cloud-mp/cloudfunctions/user/index.js | 已通 |
| user.pointsSignIn | POST /points/sign-in | cloud-mp/cloudfunctions/user/index.js | 已通 |
| user.pointsSignInStatus | GET /points/sign-in/status | cloud-mp/cloudfunctions/user/index.js | 已通 |
| user.pointsTasks | GET /points/tasks | cloud-mp/cloudfunctions/user/index.js | 已通 |
| user.regionFromPoint | GET /stations/region-from-point | cloud-mp/cloudfunctions/user/index.js | 已通 |
| user.removeFavorite | DELETE /user/favorites | cloud-mp/cloudfunctions/user/index.js | 已通 |
| user.removeFavoriteById | DELETE /user/favorites/:id | cloud-mp/cloudfunctions/user/index.js | 已通 |
| user.setDefaultAddress | PUT /addresses/:id/default | POST /addresses/:id/default | cloud-mp/cloudfunctions/user/index.js | 已通 |
| user.shareEligibility | GET /questionnaire/share-eligibility | cloud-mp/cloudfunctions/user/index.js | 已通 |
| user.submitPreferences | POST /user/preferences/submit | cloud-mp/cloudfunctions/user/index.js | 已通 |
| user.submitQuestionnaire | POST /questionnaire/submit | cloud-mp/cloudfunctions/user/index.js | 已通 |
| user.syncFavorites | POST /user/favorites/sync | cloud-mp/cloudfunctions/user/index.js | 已通 |
| user.updateAddress | PUT /addresses/:id | cloud-mp/cloudfunctions/user/index.js | 已通 |
| user.updateProfile | PUT /user/profile | PUT /user/info | cloud-mp/cloudfunctions/user/index.js | 已通 |
| user.upgrade | POST /upgrade | cloud-mp/cloudfunctions/user/index.js | 已通 |
| user.upgradeApply | POST /upgrade/apply | cloud-mp/cloudfunctions/user/index.js | 已通 |
| user.upgradeEligibility | GET /upgrade/eligibility | cloud-mp/cloudfunctions/user/index.js | 已通 |
| user.walletCommissions | GET /wallet/commissions | cloud-mp/cloudfunctions/user/index.js | 已通 |
| user.walletInfo | GET /wallet/info | cloud-mp/cloudfunctions/user/index.js | 已通 |

## 管理接口

| 项目 | 旧工程参考 | cloud-mp 落点 | 状态 |
| --- | --- | --- | --- |
| DELETE /admins/:id | admin-ui/src/api/modules/partners.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| DELETE /banners/:id | admin-ui/src/api/modules/content.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| DELETE /boards/:id/products/:id | admin-ui/src/api/modules/boards.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| DELETE /categories/:id | admin-ui/src/api/modules/catalog.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| DELETE /contents/:id | admin-ui/src/api/modules/content.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| DELETE /coupons/:id | admin-ui/src/api/modules/marketing.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| DELETE /db-indexes/:id/:id | admin-ui/src/api/modules/system.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| DELETE /group-buys/:id | admin-ui/src/api/modules/marketing.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| DELETE /home-sections/:id | admin-ui/src/api/modules/content.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| DELETE /lottery-prizes/:id | admin-ui/src/api/modules/marketing.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
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
| GET /alert-config | admin-ui/src/api/modules/system.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
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
| GET /dashboard/notifications | admin-ui/src/api/modules/statistics.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /db-indexes/:id | admin-ui/src/api/modules/system.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /db-indexes/:id/columns | admin-ui/src/api/modules/system.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /db-indexes/tables | admin-ui/src/api/modules/system.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /dealers | admin-ui/src/api/modules/partners.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /debug/anomalies | admin-ui/src/api/modules/system.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /debug/cron-status | admin-ui/src/api/modules/system.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /debug/db-ping | admin-ui/src/api/modules/system.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /debug/logs | admin-ui/src/api/modules/system.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /debug/process | admin-ui/src/api/modules/system.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /feature-toggles | admin-ui/src/api/modules/system.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /festival-config | admin-ui/src/api/modules/marketing.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| GET /global-ui-config | admin-ui/src/api/modules/marketing.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| GET /group-buys | admin-ui/src/api/modules/marketing.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| GET /group-buys/:id | admin-ui/src/api/modules/marketing.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| GET /home-sections | admin-ui/src/api/modules/content.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /home-sections/schemas | admin-ui/src/api/modules/content.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /logistics/order/:id | admin-ui/src/api/modules/ordersFulfillment.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /logs | admin-ui/src/api/modules/content.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /logs/export | admin-ui/src/api/modules/content.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /lottery-prizes | admin-ui/src/api/modules/marketing.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| GET /mass-messages | admin-ui/src/api/modules/content.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /material-groups | admin-ui/src/api/modules/content.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /materials | admin-ui/src/api/modules/content.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /member-tier-config | admin-ui/src/api/modules/system.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /mini-program-config | admin-ui/src/api/modules/system.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /n-system/leaders | admin-ui/src/api/modules/agentSystem.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /n-system/leaders/:id/members | admin-ui/src/api/modules/agentSystem.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /n-system/members | admin-ui/src/api/modules/agentSystem.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /operations/dashboard | admin-ui/src/api/modules/system.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /orders | admin-ui/src/api/modules/ordersFulfillment.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /orders/:id | admin-ui/src/api/modules/ordersFulfillment.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /orders/export | admin-ui/src/api/modules/ordersFulfillment.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /payment-health | admin-ui/src/api/modules/system.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /pickup-stations | admin-ui/src/api/modules/partners.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| GET /pickup-stations/:id | admin-ui/src/api/modules/partners.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| GET /pickup-stations/:id/staff | admin-ui/src/api/modules/agentSystem.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| GET /popup-ad-config | admin-ui/src/api/modules/system.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /products | admin-ui/src/api/modules/catalog.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /products/:id | admin-ui/src/api/modules/catalog.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /profile | admin-ui/src/api/modules/auth.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /refunds | admin-ui/src/api/modules/finance.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /refunds/:id | admin-ui/src/api/modules/finance.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /reviews | admin-ui/src/api/modules/content.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /settings | admin-ui/src/api/modules/system.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /slash-activities | admin-ui/src/api/modules/marketing.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| GET /slash-activities/:id | admin-ui/src/api/modules/marketing.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| GET /splash | admin-ui/src/api/modules/marketing.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| GET /statistics/agent-ranking | admin-ui/src/api/modules/statistics.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /statistics/distribution-report | admin-ui/src/api/modules/statistics.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /statistics/low-stock | admin-ui/src/api/modules/statistics.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /statistics/overview | admin-ui/src/api/modules/statistics.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /statistics/product-ranking | admin-ui/src/api/modules/statistics.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /statistics/sales-trend | admin-ui/src/api/modules/statistics.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /statistics/user-trend | admin-ui/src/api/modules/statistics.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /storage/config | admin-ui/src/api/modules/mediaUpload.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /system-configs | admin-ui/src/api/modules/system.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /system-configs/:id/history | admin-ui/src/api/modules/system.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /system/status | admin-ui/src/api/modules/system.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /upgrade-applications | admin-ui/src/api/modules/agentSystem.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /users | admin-ui/src/api/modules/users.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /users/:id | admin-ui/src/api/modules/users.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /users/:id/team | admin-ui/src/api/modules/users.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /users/:id/team-summary | admin-ui/src/api/modules/users.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| GET /withdrawals | admin-ui/src/api/modules/finance.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| POST /admins | admin-ui/src/api/modules/partners.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| POST /agent-system/dividend/execute | admin-ui/src/api/modules/agentSystem.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| POST /agent-system/exit-applications/:id | admin-ui/src/api/modules/agentSystem.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| POST /alert-config/test | admin-ui/src/api/modules/system.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
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
| POST /db-indexes | admin-ui/src/api/modules/system.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| POST /feature-toggles | admin-ui/src/api/modules/system.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| POST /group-buys | admin-ui/src/api/modules/marketing.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| POST /home-sections | admin-ui/src/api/modules/content.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| POST /home-sections/sort | admin-ui/src/api/modules/content.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| POST /login | admin-ui/src/api/modules/auth.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| POST /logout | admin-ui/src/api/modules/auth.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| POST /lottery-prizes | admin-ui/src/api/modules/marketing.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| POST /mass-messages | admin-ui/src/api/modules/content.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| POST /mass-messages/:id/send | admin-ui/src/api/modules/content.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| POST /material-groups | admin-ui/src/api/modules/content.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| POST /material-groups/move | admin-ui/src/api/modules/content.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| POST /materials | admin-ui/src/api/modules/content.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| POST /orders/batch-ship | admin-ui/src/api/modules/ordersFulfillment.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| POST /pickup-stations | admin-ui/src/api/modules/partners.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| POST /pickup-stations/:id/staff | admin-ui/src/api/modules/agentSystem.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| POST /products | admin-ui/src/api/modules/catalog.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| POST /slash-activities | admin-ui/src/api/modules/marketing.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| POST /storage/test | admin-ui/src/api/modules/mediaUpload.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| POST /system-configs/:id/rollback | admin-ui/src/api/modules/system.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| POST /system-configs/batch | admin-ui/src/api/modules/system.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| POST /system-configs/refresh-cache | admin-ui/src/api/modules/system.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| POST /upload | admin-ui/src/api/modules/mediaUpload.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
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
| PUT /alert-config | admin-ui/src/api/modules/system.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
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
| PUT /lottery-prizes/:id | admin-ui/src/api/modules/marketing.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| PUT /material-groups/:id | admin-ui/src/api/modules/content.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| PUT /materials/:id | admin-ui/src/api/modules/content.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| PUT /member-tier-config | admin-ui/src/api/modules/system.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| PUT /mini-program-config | admin-ui/src/api/modules/system.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| PUT /orders/:id/amount | admin-ui/src/api/modules/ordersFulfillment.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| PUT /orders/:id/force-cancel | admin-ui/src/api/modules/ordersFulfillment.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| PUT /orders/:id/force-complete | admin-ui/src/api/modules/ordersFulfillment.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| PUT /orders/:id/remark | admin-ui/src/api/modules/ordersFulfillment.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| PUT /orders/:id/ship | admin-ui/src/api/modules/ordersFulfillment.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| PUT /orders/:id/shipping-info | admin-ui/src/api/modules/ordersFulfillment.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| PUT /password | admin-ui/src/api/modules/auth.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| PUT /pickup-stations/:id | admin-ui/src/api/modules/partners.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| PUT /popup-ad-config | admin-ui/src/api/modules/system.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| PUT /products/:id | admin-ui/src/api/modules/catalog.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| PUT /products/:id/status | admin-ui/src/api/modules/catalog.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| PUT /refunds/:id/approve | admin-ui/src/api/modules/finance.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| PUT /refunds/:id/complete | admin-ui/src/api/modules/finance.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| PUT /refunds/:id/reject | admin-ui/src/api/modules/finance.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| PUT /reviews/:id | admin-ui/src/api/modules/content.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| PUT /settings | admin-ui/src/api/modules/system.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| PUT /slash-activities/:id | admin-ui/src/api/modules/marketing.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| PUT /splash | admin-ui/src/api/modules/marketing.js | cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js | 已通 |
| PUT /storage/config | admin-ui/src/api/modules/mediaUpload.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| PUT /upgrade-applications/:id/review | admin-ui/src/api/modules/agentSystem.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
| PUT /users/:id/balance | admin-ui/src/api/modules/users.js | cloud-mp/cloudfunctions/admin-api/src/app.js | 已通 |
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
| activity_links | 旧工程引用 11 次 | seed:Y / import:Y | 已建模 |
| admin_audit_logs | 旧工程引用 8 次 | seed:Y / import:Y | 已建模 |
| admin_roles | 旧工程引用 2 次 | seed:Y / import:Y | 已建模 |
| admin_singletons | 旧工程未直接命中 | seed:Y / import:Y | 缺验收 |
| admins | 旧工程引用 64 次 | seed:Y / import:Y | 已建模 |
| banners | 旧工程引用 135 次 | seed:Y / import:Y | 已建模 |
| cart_items | 旧工程引用 7 次 | seed:Y / import:Y | 已建模 |
| categories | 旧工程引用 140 次 | seed:Y / import:Y | 已建模 |
| commissions | 旧工程引用 185 次 | seed:Y / import:Y | 已建模 |
| configs | 旧工程引用 99 次 | seed:Y / import:Y | 已建模 |
| contents | 旧工程引用 39 次 | seed:Y / import:Y | 已建模 |
| group_activities | 旧工程引用 7 次 | seed:Y / import:Y | 已建模 |
| group_members | 旧工程引用 6 次 | seed:Y / import:Y | 已建模 |
| group_orders | 旧工程引用 6 次 | seed:Y / import:Y | 已建模 |
| lottery_configs | 旧工程未直接命中 | seed:Y / import:Y | 缺验收 |
| lottery_prizes | 旧工程引用 10 次 | seed:Y / import:Y | 已建模 |
| lottery_records | 旧工程引用 9 次 | seed:Y / import:Y | 已建模 |
| material_groups | 旧工程引用 12 次 | seed:Y / import:Y | 已建模 |
| materials | 旧工程引用 112 次 | seed:Y / import:Y | 已建模 |
| orders | 旧工程引用 449 次 | seed:Y / import:Y | 已建模 |
| products | 旧工程引用 402 次 | seed:Y / import:Y | 已建模 |
| refunds | 旧工程引用 126 次 | seed:Y / import:Y | 已建模 |
| reviews | 旧工程引用 50 次 | seed:Y / import:Y | 已建模 |
| skus | 旧工程引用 94 次 | seed:Y / import:Y | 已建模 |
| slash_activities | 旧工程引用 9 次 | seed:Y / import:Y | 已建模 |
| slash_helpers | 旧工程引用 9 次 | seed:Y / import:Y | 已建模 |
| slash_records | 旧工程引用 9 次 | seed:Y / import:Y | 已建模 |
| stations | 旧工程引用 112 次 | seed:Y / import:Y | 已建模 |
| users | 旧工程引用 331 次 | seed:Y / import:Y | 已建模 |
| wallet_accounts | 旧工程引用 1 次 | seed:Y / import:Y | 已建模 |
| wallet_logs | 旧工程引用 1 次 | seed:Y / import:Y | 已建模 |
| wallet_recharge_configs | 旧工程未直接命中 | seed:Y / import:Y | 缺验收 |
| wallet_recharge_orders | 旧工程引用 1 次 | seed:Y / import:Y | 已建模 |
| withdrawals | 旧工程引用 83 次 | seed:Y / import:Y | 已建模 |

## 说明

- `已通`：旧工程参考项在 `cloud-mp` 中已有明确落点。
- `缺前端`：旧页面或管理端源码尚未并入 `cloud-mp`。
- `缺接口`：旧 API 调用在 `cloud-mp` 管理服务中尚未找到实现。
- `缺数据`：正式集合缺少 seed 或 import 文件。
- `缺验收`：已建模但旧工程引用证据弱，仍需场景级 smoke test。
- `仅cloud-mp`：只在新工程中出现的页面或能力。

