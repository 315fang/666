# Refund Reconciliation Audit

生成时间：2026-04-14T02:32:30.340Z
数据源：cloud
退款总数：22
纳入审计：22
微信退款：4
内部退款：18
微信官方查询：不可用
微信实际查询笔数：0

微信查询说明：微信正式查询配置不完整: PAYMENT_WECHAT_MCHID, PAYMENT_WECHAT_SERIAL_NO, PAYMENT_WECHAT_API_V3_KEY

## 动作汇总

| 动作 | 数量 |
| --- | ---: |
| manual_review | 11 |
| wechat_query_skipped | 4 |
| internal_goods_fund_review | 4 |
| internal_wallet_review | 3 |

## 待处理记录（前 22 条）

| 退款单 | 订单号 | 通道 | 本地状态 | 微信状态 | 动作 | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| RF17744957706888931 | ORD202603261128180002626000 | wechat | completed | - | wechat_query_skipped | 微信正式查询配置不完整: PAYMENT_WECHAT_MCHID, PAYMENT_WECHAT_SERIAL_NO, PAYMENT_WECHAT_API_V3_KEY |
| RF17746126179227045 | ORD202603271931300004539690 | wechat | completed | - | wechat_query_skipped | 微信正式查询配置不完整: PAYMENT_WECHAT_MCHID, PAYMENT_WECHAT_SERIAL_NO, PAYMENT_WECHAT_API_V3_KEY |
| RF17746910231531457 | ORD202603271959530007884660 | wechat | completed | - | wechat_query_skipped | 微信正式查询配置不完整: PAYMENT_WECHAT_MCHID, PAYMENT_WECHAT_SERIAL_NO, PAYMENT_WECHAT_API_V3_KEY |
| RF17749452627957978 | ORD202603292134150001958146 | wechat | completed | - | wechat_query_skipped | 微信正式查询配置不完整: PAYMENT_WECHAT_MCHID, PAYMENT_WECHAT_SERIAL_NO, PAYMENT_WECHAT_API_V3_KEY |
| SYSRF177510363794967505 | ORD202603301859370001586766 | wallet | approved | - | internal_wallet_review | 账户余额退款，本地当前为 approved |
| SYSRF177510454371145477 | ORD202603311333000001670388 | unknown | approved | - | manual_review | 缺少支付方式或关联订单信息，暂时无法判断真实退款通道 |
| SYSRF177510454402699416 | ORD202603301940320003300048 | unknown | approved | - | manual_review | 缺少支付方式或关联订单信息，暂时无法判断真实退款通道 |
| SYSRF177510454425740961 | ORD202603301933240002560611 | unknown | approved | - | manual_review | 缺少支付方式或关联订单信息，暂时无法判断真实退款通道 |
| SYSRF177512683468041091 | ORD202604021245010002973888 | wallet | approved | - | internal_wallet_review | 账户余额退款，本地当前为 approved |
| REF1775834106369313 | ORD1775827693104817 | unknown | processing | - | manual_review | 缺少支付方式或关联订单信息，暂时无法判断真实退款通道 |
| REF1775834831927926 | ORD1775831311839983 | unknown | completed | - | manual_review | 缺少支付方式或关联订单信息，暂时无法判断真实退款通道 |
| REF1775897667548975 | ORD1775885391962603 | unknown | completed | - | manual_review | 缺少支付方式或关联订单信息，暂时无法判断真实退款通道 |
| REF1775897852197731 | ORD202603301847220003575239 | wallet | approved | - | internal_wallet_review | 账户余额退款，本地当前为 approved |
| REF1775902871371753 | ORD1775902819647489 | unknown | completed | - | manual_review | 缺少支付方式或关联订单信息，暂时无法判断真实退款通道 |
| REF1775920441303555 | ORD177592032072092 | unknown | processing | - | manual_review | 缺少支付方式或关联订单信息，暂时无法判断真实退款通道 |
| REF1775964402343962 | ORD1775898706736878 | unknown | processing | - | manual_review | 缺少支付方式或关联订单信息，暂时无法判断真实退款通道 |
| REF1775964422799345 | ORD1775898689616395 | unknown | processing | - | manual_review | 缺少支付方式或关联订单信息，暂时无法判断真实退款通道 |
| REF1775972728104772 | ORD1775897614253462 | unknown | processing | - | manual_review | 缺少支付方式或关联订单信息，暂时无法判断真实退款通道 |
| REF1775993281617789 | ORD1775992929604326 | goods_fund | approved | - | internal_goods_fund_review | 货款余额退款，本地当前为 approved |
| REF1776058290289539 | ORD1776006098733948 | goods_fund | approved | - | internal_goods_fund_review | 货款余额退款，本地当前为 approved |
| REF1776083909694275 | ORD1776077635910944 | goods_fund | approved | - | internal_goods_fund_review | 货款余额退款，本地当前为 approved |
| REF1776089368463924 | ORD1776088274225191 | goods_fund | approved | - | internal_goods_fund_review | 货款余额退款，本地当前为 approved |
