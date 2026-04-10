# CloudBase Legacy Compatibility Audit

Generated at: 2026-04-10T12:16:44.412Z

This report tracks remaining legacy field/status/image references that should be removed as the CloudBase migration closes.

## miniprogram

- `quantity` old cart count field: 101
  - cloud-mp/miniprogram/components/order-card/order-card.wxml: 2
  - cloud-mp/miniprogram/components/order-card/order-card.wxss: 1
  - cloud-mp/miniprogram/pages/activity/limited-spot.js: 2
  - cloud-mp/miniprogram/pages/cart/cart.js: 8
  - cloud-mp/miniprogram/pages/cart/cart.wxml: 1
  - cloud-mp/miniprogram/pages/category/category.js: 2
  - cloud-mp/miniprogram/pages/category/category.wxml: 1
  - cloud-mp/miniprogram/pages/category/categoryCart.js: 7
  - ... 21 more files
- `buyer_id` old order owner field: 0
- `user_id` old user owner field: 2
  - cloud-mp/miniprogram/pages/group/detail.js: 1
  - cloud-mp/miniprogram/pages/stations/my-station.wxml: 1
- `product_skus` old sku collection name: 0
- `image_url` legacy image field: 13
  - cloud-mp/miniprogram/pages/activity/activity.js: 1
  - cloud-mp/miniprogram/pages/category/category.js: 1
  - cloud-mp/miniprogram/pages/index/index.js: 1
  - cloud-mp/miniprogram/pages/index/index.wxml: 2
  - cloud-mp/miniprogram/pages/index/indexHomeLoader.js: 3
  - cloud-mp/miniprogram/pages/lottery/lottery.wxml: 2
  - cloud-mp/miniprogram/pages/splash/splash.js: 1
  - cloud-mp/miniprogram/utils/activitySectionBuilder.js: 2
- `avatar_url` legacy avatar field: 13
  - cloud-mp/miniprogram/pages/activity/n-invite.wxml: 1
  - cloud-mp/miniprogram/pages/distribution/business-center.wxml: 1
  - cloud-mp/miniprogram/pages/distribution/center.wxml: 1
  - cloud-mp/miniprogram/pages/distribution/team-member.wxml: 1
  - cloud-mp/miniprogram/pages/distribution/team.wxml: 1
  - cloud-mp/miniprogram/pages/distribution/utils/invitePosterCore.js: 2
  - cloud-mp/miniprogram/pages/group/detail.wxml: 1
  - cloud-mp/miniprogram/pages/product/detail.wxml: 1
  - ... 4 more files
- `nickname` legacy display field: 54
  - cloud-mp/miniprogram/pages/activity/n-invite.js: 1
  - cloud-mp/miniprogram/pages/distribution/business-center.js: 1
  - cloud-mp/miniprogram/pages/distribution/business-center.wxml: 1
  - cloud-mp/miniprogram/pages/distribution/center.wxml: 2
  - cloud-mp/miniprogram/pages/distribution/center.wxss: 1
  - cloud-mp/miniprogram/pages/distribution/invite-poster.js: 1
  - cloud-mp/miniprogram/pages/distribution/invite.js: 1
  - cloud-mp/miniprogram/pages/distribution/invite.wxml: 1
  - ... 22 more files
- `pending_ship` legacy status bucket: 0
- `pending_payment` old storage status: 0

## admin-ui

- `quantity` old cart count field: 6
  - admin-ui/src/views/orders/index.vue: 6
- `buyer_id` old order owner field: 0
- `user_id` old user owner field: 26
  - admin-ui/src/views/commissions/index.vue: 4
  - admin-ui/src/views/dealers/index.vue: 2
  - admin-ui/src/views/logs/index.vue: 1
  - admin-ui/src/views/membership/index.vue: 2
  - admin-ui/src/views/pickup-stations/index.vue: 11
  - admin-ui/src/views/refunds/index.vue: 3
  - admin-ui/src/views/withdrawals/index.vue: 3
- `product_skus` old sku collection name: 0
- `image_url` legacy image field: 53
  - admin-ui/src/components/ContentBlockEditor.vue: 16
  - admin-ui/src/views/activities/components/LotteryPrizeDialog.vue: 2
  - admin-ui/src/views/activities/components/LotteryPrizePanel.vue: 2
  - admin-ui/src/views/activities/index.vue: 6
  - admin-ui/src/views/content/index.vue: 14
  - admin-ui/src/views/home-sections/index.vue: 5
  - admin-ui/src/views/splash/index.vue: 8
- `avatar_url` legacy avatar field: 3
  - admin-ui/src/utils/userDisplay.js: 2
  - admin-ui/src/views/users/index.vue: 1
- `nickname` legacy display field: 10
  - admin-ui/src/utils/userDisplay.js: 6
  - admin-ui/src/views/agent-system/index.vue: 1
  - admin-ui/src/views/users/index.vue: 3
- `pending_ship` legacy status bucket: 1
  - admin-ui/src/views/dashboard/index.vue: 1
- `pending_payment` old storage status: 0

## cloudrun-admin-service

- `quantity` old cart count field: 6
  - backend/cloudrun-admin-service/src/app.js: 6
- `buyer_id` old order owner field: 8
  - backend/cloudrun-admin-service/src/app.js: 8
- `user_id` old user owner field: 35
  - backend/cloudrun-admin-service/src/app.js: 35
- `product_skus` old sku collection name: 0
- `image_url` legacy image field: 17
  - backend/cloudrun-admin-service/src/app.js: 17
- `avatar_url` legacy avatar field: 8
  - backend/cloudrun-admin-service/src/app.js: 8
- `nickname` legacy display field: 17
  - backend/cloudrun-admin-service/src/app.js: 17
- `pending_ship` legacy status bucket: 11
  - backend/cloudrun-admin-service/src/app.js: 11
- `pending_payment` old storage status: 1
  - backend/cloudrun-admin-service/src/app.js: 1

## Recommended next cleanup

- Replace frontend display adapters that still read `image_url`, `avatar_url`, or `nickname` with normalized `file_id`, `avatarUrl`, and `nickName`.
- Keep `pending_ship` only as an admin display bucket; do not expand it into new storage or cloud-function logic.
- Remove remaining `buyer_id`, `user_id`, `quantity`, and `product_skus` reads after CloudBase import finishes and runtime data is fully normalized.

