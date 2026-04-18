# CloudBase 性能基线

Generated at: 2026-04-18T15:26:52.635Z

## 运行时

- `admin-api`: memory=1024, timeout=60
- `config`: memory=512, timeout=30
- `order`: memory=1024, timeout=60
- `payment`: memory=1024, timeout=60

## 热点文件体量

- `cloudfunctions/admin-api/src/app.js`: 9295 lines / 429941 bytes
- `cloudfunctions/admin-api/src/admin-marketing.js`: 2232 lines / 109514 bytes
- `cloudfunctions/config/index.js`: 1297 lines / 49433 bytes
- `cloudfunctions/order/order-create.js`: 1658 lines / 73624 bytes
- `cloudfunctions/payment/payment-callback.js`: 2325 lines / 100989 bytes
- `miniprogram/utils/request.js`: 93 lines / 2915 bytes
- `miniprogram/utils/requestRoutes.js`: 278 lines / 16886 bytes
- `admin-ui/src/components/ContentBlockEditor.vue`: 474 lines / 18050 bytes
- `admin-ui/src/views/content/index.vue`: 657 lines / 24743 bytes
- `admin-ui/src/views/home-sections/index.vue`: 1527 lines / 54950 bytes

## 路由与目标库

- request route count: 141
- mini program target count: 16
- page whitelist prefix count: 18

## 部署后需补充

- 记录四个核心函数冷启动 1 次耗时
- 记录四个核心函数热启动 20 次 p50 / p95
- 统计 `cache_hit` 命中率
- 统计 `getTempFileURL` 调用次数
