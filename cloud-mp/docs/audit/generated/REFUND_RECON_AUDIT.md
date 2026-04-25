# Refund Reconciliation Audit

生成时间：2026-04-25T03:33:40.201Z
数据源：cloud
退款总数：34
纳入审计：34
微信退款：15
内部退款：19
微信官方查询：可用
微信实际查询笔数：15

## 动作汇总

| 动作 | 数量 |
| --- | ---: |
| noop | 12 |
| ignored_test_goods_fund | 9 |
| ignored_test_unknown | 7 |
| ignored_test_wallet | 3 |
| wechat_refund_not_found | 2 |
| sync_to_completed | 1 |

## 待处理记录（前 3 条）

| 退款单 | 订单号 | 用户 | 通道 | 本地状态 | 微信状态 | 动作 | 说明 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SYSRF177510454425740961 | ORD202603301933240002560611 | 曦曦是大太阳 | wechat | approved | - | wechat_refund_not_found | 微信官方未查询到该退款单，需确认是否实际发起过微信退款 |
| REF1775920441303555 | ORD177592032072092 | 微信用户 | wechat | processing | SUCCESS | sync_to_completed | 微信已成功退款，但本地仍为 processing |
| REF1776239721529419 | ORD1775918261897368 | 颖火虫 | wechat | approved | - | wechat_refund_not_found | 微信官方未查询到该退款单，需确认是否实际发起过微信退款 |

其余 31 条记录见 JSON：`docs\audit\generated\REFUND_RECON_AUDIT.json`
