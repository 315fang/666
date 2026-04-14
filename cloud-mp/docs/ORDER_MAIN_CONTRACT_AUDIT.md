# Order Main Contract Audit

生成时间：2026-04-14T04:04:39.833Z
结果：PASS

| 模块 | 检查项 | 结果 | 说明 |
| --- | --- | --- | --- |
| order | pending payment status group | PASS | normalizeOrderStatusGroup("pending_payment") => "pending_pay" |
| order | paid status group | PASS | normalizeOrderStatusGroup("paid") => "pending_ship" |
| order | client pending status | PASS | normalizeOrderStatusForClient("pending_payment") => "pending" |
| order | wechat payment alias | PASS | normalizePaymentMethodCode("wxpay") => "wechat" |
| order | goods fund payment alias | PASS | normalizePaymentMethodCode("goodsfund") => "goods_fund" |
| order | wallet refund target | PASS | getRefundTargetText("wallet") => "退回账户余额" |
| order | refund pending text | PASS | getRefundStatusText("pending") => "审核中" |
| admin-api | pending payment status group | PASS | normalizeOrderStatusGroup("pending_payment") => "pending_pay" |
| admin-api | paid status group | PASS | normalizeOrderStatusGroup("paid") => "pending_ship" |
| admin-api | wechat payment alias | PASS | normalizePaymentMethodCode("wxpay") => "wechat" |
| admin-api | goods fund payment alias | PASS | normalizePaymentMethodCode("goodsfund") => "goods_fund" |
| admin-api | wallet refund target | PASS | getRefundTargetText("wallet") => "退回账户余额" |
| admin-api | refund pending text | PASS | getRefundStatusText("pending") => "待审核" |
| source | cloudfunctions/order/order-query.js contains status_group | PASS | cloudfunctions/order/order-query.js |
| source | cloudfunctions/order/order-query.js contains status_text | PASS | cloudfunctions/order/order-query.js |
| source | cloudfunctions/order/order-query.js contains payment_method_text | PASS | cloudfunctions/order/order-query.js |
| source | cloudfunctions/order/order-query.js contains refund_target_text | PASS | cloudfunctions/order/order-query.js |
| source | cloudfunctions/order/order-lifecycle.js contains payment_method | PASS | cloudfunctions/order/order-lifecycle.js |
| source | cloudfunctions/order/order-lifecycle.js contains refund_channel | PASS | cloudfunctions/order/order-lifecycle.js |
| source | cloudfunctions/order/order-lifecycle.js contains refund_target_text | PASS | cloudfunctions/order/order-lifecycle.js |
| source | cloudfunctions/order/order-lifecycle.js contains return_company | PASS | cloudfunctions/order/order-lifecycle.js |
| source | cloudfunctions/order/order-lifecycle.js contains return_tracking_no | PASS | cloudfunctions/order/order-lifecycle.js |
| source | cloudfunctions/admin-api/src/app.js contains status_group | PASS | cloudfunctions/admin-api/src/app.js |
| source | cloudfunctions/admin-api/src/app.js contains status_text | PASS | cloudfunctions/admin-api/src/app.js |
| source | cloudfunctions/admin-api/src/app.js contains payment_method_text | PASS | cloudfunctions/admin-api/src/app.js |
| source | cloudfunctions/admin-api/src/app.js contains refund_target_text | PASS | cloudfunctions/admin-api/src/app.js |
