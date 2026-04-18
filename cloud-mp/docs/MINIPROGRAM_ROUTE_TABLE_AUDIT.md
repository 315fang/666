# Mini Program Route Table Audit

生成时间：2026-04-18T15:32:13.541Z
结果：FAIL

| 路由 | Action | ROUTE_TABLE | 云函数 Action | 结果 |
| --- | --- | --- | --- | --- |
| POST /orders | create | FAIL | PASS | FAIL |
| GET /orders | list | FAIL | PASS | FAIL |
| GET /orders/:id | detail | FAIL | PASS | FAIL |
| POST /orders/:id/prepay | prepay | FAIL | PASS | FAIL |
| GET /orders/:id/pay-status | queryStatus | FAIL | PASS | FAIL |
| POST /orders/:id/sync-wechat-pay | syncWechatPay | FAIL | PASS | FAIL |
| POST /orders/:id/retry-group-join | retryGroupJoin | FAIL | PASS | FAIL |
| GET /refunds | refundList | FAIL | PASS | FAIL |
| POST /refunds | applyRefund | FAIL | PASS | FAIL |
| GET /refunds/:id | refundDetail | FAIL | PASS | FAIL |
| PUT /refunds/:id/cancel | cancelRefund | FAIL | PASS | FAIL |
| PUT /refunds/:id/return-shipping | returnShipping | FAIL | PASS | FAIL |
