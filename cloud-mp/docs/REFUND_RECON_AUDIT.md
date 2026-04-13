# Refund Reconciliation Audit

生成时间：2026-04-13T15:28:01.322Z
数据源：cloud
退款总数：22
纳入审计：22
微信退款：0
内部退款：22
微信官方查询：不可用
微信实际查询笔数：0

微信查询说明：显式跳过微信官方查询

## 动作汇总

| 动作 | 数量 |
| --- | ---: |
| manual_review | 17 |
| internal_goods_fund_review | 4 |
| internal_wallet_review | 1 |

## 待处理记录（前 22 条）

| 退款单 | 订单号 | 通道 | 本地状态 | 微信状态 | 动作 | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| RF17744957706888931 | 22 | unknown | completed | - | manual_review | 缺少支付方式或关联订单信息，暂时无法判断真实退款通道 |
| RF17746126179227045 | 28 | unknown | completed | - | manual_review | 缺少支付方式或关联订单信息，暂时无法判断真实退款通道 |
| RF17746910231531457 | 31 | unknown | completed | - | manual_review | 缺少支付方式或关联订单信息，暂时无法判断真实退款通道 |
| RF17749452627957978 | 45 | unknown | completed | - | manual_review | 缺少支付方式或关联订单信息，暂时无法判断真实退款通道 |
| SYSRF177510363794967505 | 81 | unknown | completed | - | manual_review | 缺少支付方式或关联订单信息，暂时无法判断真实退款通道 |
| SYSRF177510454371145477 | 85 | unknown | approved | - | manual_review | 缺少支付方式或关联订单信息，暂时无法判断真实退款通道 |
| SYSRF177510454402699416 | 83 | unknown | approved | - | manual_review | 缺少支付方式或关联订单信息，暂时无法判断真实退款通道 |
| SYSRF177510454425740961 | 82 | unknown | approved | - | manual_review | 缺少支付方式或关联订单信息，暂时无法判断真实退款通道 |
| SYSRF177512683468041091 | 87 | unknown | completed | - | manual_review | 缺少支付方式或关联订单信息，暂时无法判断真实退款通道 |
| REF1775834106369313 | ORD1775827693104817 | unknown | processing | - | manual_review | 缺少支付方式或关联订单信息，暂时无法判断真实退款通道 |
| REF1775834831927926 | ORD1775831311839983 | unknown | completed | - | manual_review | 缺少支付方式或关联订单信息，暂时无法判断真实退款通道 |
| REF1775897667548975 | ORD1775885391962603 | unknown | completed | - | manual_review | 缺少支付方式或关联订单信息，暂时无法判断真实退款通道 |
| REF1775897852197731 | ORD202603301847220003575239 | wallet | completed | - | internal_wallet_review | 账户余额退款缺少官方回执，需结合用户余额与管理员操作核对 |
| REF1775902871371753 | ORD1775902819647489 | unknown | completed | - | manual_review | 缺少支付方式或关联订单信息，暂时无法判断真实退款通道 |
| REF1775920441303555 | ORD177592032072092 | unknown | processing | - | manual_review | 缺少支付方式或关联订单信息，暂时无法判断真实退款通道 |
| REF1775964402343962 | ORD1775898706736878 | unknown | processing | - | manual_review | 缺少支付方式或关联订单信息，暂时无法判断真实退款通道 |
| REF1775964422799345 | ORD1775898689616395 | unknown | processing | - | manual_review | 缺少支付方式或关联订单信息，暂时无法判断真实退款通道 |
| REF1775972728104772 | ORD1775897614253462 | unknown | processing | - | manual_review | 缺少支付方式或关联订单信息，暂时无法判断真实退款通道 |
| REF1775993281617789 | ORD1775992929604326 | goods_fund | completed | - | internal_goods_fund_review | 货款余额退款，默认视为内部完成 |
| REF1776058290289539 | ORD1776006098733948 | goods_fund | completed | - | internal_goods_fund_review | 货款余额退款，默认视为内部完成 |
| REF1776083909694275 | ORD1776077635910944 | goods_fund | completed | - | internal_goods_fund_review | 货款余额退款，默认视为内部完成 |
| REF1776089368463924 | ORD1776088274225191 | goods_fund | completed | - | internal_goods_fund_review | 货款余额退款，默认视为内部完成 |
