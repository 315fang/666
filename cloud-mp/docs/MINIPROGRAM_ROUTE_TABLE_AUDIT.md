# Mini Program Route Table Audit

生成时间：2026-04-13T16:48:34.558Z
结果：PASS

| 路由 | Action | ROUTE_TABLE | 云函数 Action | 结果 |
| --- | --- | --- | --- | --- |
| POST /orders | create | PASS | PASS | PASS |
| GET /orders | list | PASS | PASS | PASS |
| GET /orders/:id | detail | PASS | PASS | PASS |
| POST /orders/:id/pay | prepay | PASS | PASS | PASS |
| POST /orders/:id/prepay | prepay | PASS | PASS | PASS |
| GET /orders/:id/pay-status | queryStatus | PASS | PASS | PASS |
| POST /orders/:id/sync-wechat-pay | syncWechatPay | PASS | PASS | PASS |
| POST /orders/:id/retry-group-join | retryGroupJoin | PASS | PASS | PASS |
| GET /refunds | refundList | PASS | PASS | PASS |
| POST /refunds | applyRefund | PASS | PASS | PASS |
| GET /refunds/:id | refundDetail | PASS | PASS | PASS |
| PUT /refunds/:id/cancel | cancelRefund | PASS | PASS | PASS |
| PUT /refunds/:id/return-shipping | returnShipping | PASS | PASS | PASS |
