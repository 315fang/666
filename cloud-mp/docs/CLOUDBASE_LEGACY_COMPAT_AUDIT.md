# CloudBase Legacy Compatibility Audit

Generated at: 2026-04-21T14:28:51.151Z

This report tracks remaining legacy field/status/image references that should be removed as the CloudBase migration closes.

## miniprogram

- `quantity` old cart count field: 87
  - cloud-mp/miniprogram/components/order-card/order-card.wxml: 2
  - cloud-mp/miniprogram/components/order-card/order-card.wxss: 1
  - cloud-mp/miniprogram/pages/cart/cart.js: 8
  - cloud-mp/miniprogram/pages/cart/cart.wxml: 1
  - cloud-mp/miniprogram/pages/category/category.js: 2
  - cloud-mp/miniprogram/pages/category/category.wxml: 1
  - cloud-mp/miniprogram/pages/category/categoryCart.js: 7
  - cloud-mp/miniprogram/pages/group/detail.js: 1
  - ... 18 more files
- `buyer_id` old order owner field: 0
- `user_id` old user owner field: 1
  - cloud-mp/miniprogram/pages/stations/my-station.wxml: 1
- `product_skus` old sku collection name: 0
- `image_url` legacy image field: 32
  - cloud-mp/miniprogram/pages/category/categoryProductLoader.js: 4
  - cloud-mp/miniprogram/pages/distribution/invite-poster.js: 2
  - cloud-mp/miniprogram/pages/index/brand-news-list.js: 1
  - cloud-mp/miniprogram/pages/index/index.js: 2
  - cloud-mp/miniprogram/pages/index/index.wxml: 2
  - cloud-mp/miniprogram/pages/index/indexHomeLoader.js: 4
  - cloud-mp/miniprogram/pages/lottery/lottery.js: 2
  - cloud-mp/miniprogram/pages/lottery/lottery.wxml: 2
  - ... 10 more files
- `avatar_url` legacy avatar field: 14
  - cloud-mp/miniprogram/pages/activity/n-invite.wxml: 1
  - cloud-mp/miniprogram/pages/distribution/business-center.wxml: 1
  - cloud-mp/miniprogram/pages/distribution/center.wxml: 1
  - cloud-mp/miniprogram/pages/distribution/team-member.wxml: 1
  - cloud-mp/miniprogram/pages/distribution/team.wxml: 1
  - cloud-mp/miniprogram/pages/distribution/utils/sharePosterCore.js: 1
  - cloud-mp/miniprogram/pages/group/detail.wxml: 1
  - cloud-mp/miniprogram/pages/product/detail.js: 1
  - ... 5 more files
- `nickname` legacy display field: 64
  - cloud-mp/miniprogram/pages/activity/n-invite.js: 1
  - cloud-mp/miniprogram/pages/distribution/business-center.js: 1
  - cloud-mp/miniprogram/pages/distribution/business-center.wxml: 1
  - cloud-mp/miniprogram/pages/distribution/center.wxml: 2
  - cloud-mp/miniprogram/pages/distribution/center.wxss: 1
  - cloud-mp/miniprogram/pages/distribution/directed-invite.js: 1
  - cloud-mp/miniprogram/pages/distribution/directed-invite.wxml: 3
  - cloud-mp/miniprogram/pages/distribution/directed-invites.js: 3
  - ... 23 more files
- `pending_ship` legacy status bucket: 0
- `pending_payment` old storage status: 23
  - cloud-mp/miniprogram/config/constants.js: 1
  - cloud-mp/miniprogram/pages/logistics/tracking.js: 2
  - cloud-mp/miniprogram/pages/order/detail.js: 4
  - cloud-mp/miniprogram/pages/order/detail.wxml: 4
  - cloud-mp/miniprogram/pages/order/list.js: 5
  - cloud-mp/miniprogram/pages/order/list.wxml: 2
  - cloud-mp/miniprogram/pages/order/orderConsumerFields.js: 1
  - cloud-mp/miniprogram/pages/order/orderDetailData.js: 2
  - ... 2 more files

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
- `image_url` legacy image field: 52
  - admin-ui/src/components/ContentBlockEditor.vue: 16
  - admin-ui/src/views/activities/components/LotteryPrizeDialog.vue: 2
  - admin-ui/src/views/activities/components/LotteryPrizePanel.vue: 2
  - admin-ui/src/views/activities/index.vue: 5
  - admin-ui/src/views/content/index.vue: 13
  - admin-ui/src/views/home-sections/index.vue: 5
  - admin-ui/src/views/splash/index.vue: 9
- `avatar_url` legacy avatar field: 3
  - admin-ui/src/utils/userDisplay.js: 2
  - admin-ui/src/views/users/index.vue: 1
- `nickname` legacy display field: 10
  - admin-ui/src/utils/userDisplay.js: 6
  - admin-ui/src/views/agent-system/index.vue: 1
  - admin-ui/src/views/users/index.vue: 3
- `pending_ship` legacy status bucket: 5
  - admin-ui/src/views/dashboard/index.vue: 4
  - admin-ui/src/views/orders/index.vue: 1
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

