# CloudBase Legacy Compatibility Audit

Generated at: 2026-05-04T04:16:11.474Z

This report tracks remaining legacy field/status/image references that should be removed as the CloudBase migration closes.

## miniprogram

- `quantity` old cart count field: 121
  - cloud-mp/miniprogram/pages/cart/cart.js: 17
  - cloud-mp/miniprogram/pages/cart/cart.wxml: 1
  - cloud-mp/miniprogram/pages/category/category.js: 2
  - cloud-mp/miniprogram/pages/category/category.wxml: 1
  - cloud-mp/miniprogram/pages/category/categoryCart.js: 10
  - cloud-mp/miniprogram/pages/group/detail.js: 1
  - cloud-mp/miniprogram/pages/group/list.js: 1
  - cloud-mp/miniprogram/pages/order/confirm.js: 3
  - ... 19 more files
- `buyer_id` old order owner field: 0
- `user_id` old user owner field: 0
- `product_skus` old sku collection name: 0
- `image_url` legacy image field: 52
  - cloud-mp/miniprogram/pages/activity/brand-news-detail.js: 1
  - cloud-mp/miniprogram/pages/category/category.js: 2
  - cloud-mp/miniprogram/pages/category/category.wxml: 1
  - cloud-mp/miniprogram/pages/category/categoryProductLoader.js: 6
  - cloud-mp/miniprogram/pages/distribution/invite-poster.js: 2
  - cloud-mp/miniprogram/pages/index/brand-news-list.js: 1
  - cloud-mp/miniprogram/pages/index/index.js: 2
  - cloud-mp/miniprogram/pages/index/indexHomeLoader.js: 5
  - ... 20 more files
- `avatar_url` legacy avatar field: 17
  - cloud-mp/miniprogram/pages/activity/n-invite.wxml: 1
  - cloud-mp/miniprogram/pages/distribution/business-center.wxml: 1
  - cloud-mp/miniprogram/pages/distribution/team-member.wxml: 1
  - cloud-mp/miniprogram/pages/distribution/team.js: 2
  - cloud-mp/miniprogram/pages/distribution/team.wxml: 1
  - cloud-mp/miniprogram/pages/distribution/utils/sharePosterCore.js: 1
  - cloud-mp/miniprogram/pages/group/detail.wxml: 1
  - cloud-mp/miniprogram/pages/product/detail.js: 1
  - ... 6 more files
- `nickname` legacy display field: 69
  - cloud-mp/miniprogram/pages/activity/n-invite.js: 1
  - cloud-mp/miniprogram/pages/distribution/business-center.js: 1
  - cloud-mp/miniprogram/pages/distribution/business-center.wxml: 1
  - cloud-mp/miniprogram/pages/distribution/directed-invite.js: 1
  - cloud-mp/miniprogram/pages/distribution/directed-invite.wxml: 3
  - cloud-mp/miniprogram/pages/distribution/directed-invites.js: 3
  - cloud-mp/miniprogram/pages/distribution/directed-invites.wxml: 2
  - cloud-mp/miniprogram/pages/distribution/goods-fund-transfer-history.js: 2
  - ... 21 more files
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

- `quantity` old cart count field: 0
- `buyer_id` old order owner field: 0
- `user_id` old user owner field: 0
- `product_skus` old sku collection name: 0
- `image_url` legacy image field: 0
- `avatar_url` legacy avatar field: 0
- `nickname` legacy display field: 0
- `pending_ship` legacy status bucket: 0
- `pending_payment` old storage status: 0

## Recommended next cleanup

- Replace frontend display adapters that still read `image_url`, `avatar_url`, or `nickname` with normalized `file_id`, `avatarUrl`, and `nickName`.
- Keep `pending_ship` only as an admin display bucket; do not expand it into new storage or cloud-function logic.
- Remove remaining `buyer_id`, `user_id`, `quantity`, and `product_skus` reads after CloudBase import finishes and runtime data is fully normalized.

