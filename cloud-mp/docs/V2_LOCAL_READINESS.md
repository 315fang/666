# V2 本地就绪检查

Generated at: 2026-04-18T15:27:08.527Z

## 结果

- PASS: index-manifest -> `node scripts/check-cloudbase-index-manifest.js`
- PASS: perf-baseline -> `node scripts/generate-cloudbase-perf-baseline.js`
- PASS: miniprogram-app-check -> `node --check miniprogram/app.js`
- PASS: miniprogram-prefetch-check -> `node --check miniprogram/appPrefetch.js`
- PASS: miniprogram-request-check -> `node --check miniprogram/utils/request.js`
- PASS: miniprogram-routes-check -> `node --check miniprogram/utils/requestRoutes.js`
- PASS: miniprogram-navigator-check -> `node --check miniprogram/utils/navigator.js`
- PASS: activity-loader-check -> `node --check miniprogram/pages/activity/activityLoader.js`
- PASS: limited-spot-check -> `node --check miniprogram/pages/activity/limited-spot.js`
- PASS: admin-build -> `npm run build`

## 仍需人工完成

- 微信开发者工具 / 真机走查：首页 -> 活动页 -> 限时商品页 -> 商品详情 -> 下单支付
- 微信开发者工具 / 真机走查：我的页 -> 订单列表 / 售后列表 / 会员中心
- CloudBase 控制台实际创建索引，并观察函数 cold start / p50 / p95
