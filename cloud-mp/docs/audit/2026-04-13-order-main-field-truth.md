# 订单主链字段真相表（Phase 1）

日期：2026-04-13

本表只覆盖第一阶段订单主链：

- 下单
- 支付
- 支付回调
- 订单查询
- 退款申请
- 后台订单/退款管理

## 1. 订单字段

| 领域 | 正式字段 | 含义 | 兼容字段 | 说明 |
| --- | --- | --- | --- | --- |
| 用户身份 | `openid` | 订单归属用户业务主身份 | `buyer_id`, `user_id` | 新代码只继续写 `openid` |
| 主键 | `id`(DTO) / `_id`(存储) | 外部统一返回 `id`，内部文档主键为 `_id` | `id`, `_legacy_id` | `_legacy_id` 仅用于历史兼容查询 |
| 金额 | `total_amount` | 订单原始金额 | - | 不再让 `actual_price` 反向成为源字段 |
| 金额 | `pay_amount` | 最终应付/实付金额 | `actual_price` | `actual_price = pay_amount`，仅兼容展示 |
| 支付方式 | `payment_method` | 正式支付方式字段 | `pay_channel`, `pay_type`, `payment_channel` | 读取时兼容，落库和 DTO 统一输出 `payment_method` |
| 状态 | `status` | 原始订单状态 | - | 保留原状态值 |
| 状态 | `status_group` | 归一化状态组 | - | 统一按待付款/待发货/待收货/已完成/已关闭分组 |
| 状态 | `status_text` | 状态展示文案 | - | 页面优先读这个字段 |
| 支付文案 | `payment_method_text` | 支付方式展示文案 | - | 页面优先读这个字段 |
| 退款去向 | `refund_target_text` | 退款流向展示文案 | - | 由 `payment_method` 推导 |

## 2. 退款字段

| 领域 | 正式字段 | 含义 | 兼容字段 | 说明 |
| --- | --- | --- | --- | --- |
| 主键 | `id`(DTO) / `_id`(存储) | 外部统一返回 `id` | `id` | 新代码统一输出 `id` |
| 订单引用 | `order_id` | 订单文档主键或规范引用值 | `order_no` | 同时保留 `order_no` 方便检索 |
| 用户身份 | `openid` | 退款归属用户 | `user_id` | 新代码继续以 `openid` 为主 |
| 金额 | `amount` | 退款金额 | `refund_amount` | 统一只认 `amount` |
| 支付方式 | `payment_method` | 退款对应订单支付方式 | - | 申请退款时即写入 |
| 退款渠道 | `refund_channel` | `wechat/goods_fund/wallet` | `refund_method` | 统一输出 `refund_channel` |
| 退款去向 | `refund_target_text` | 退款退回哪里 | `refund_target`, `refund_to` | 页面优先读该字段 |
| 状态 | `status` | 原始退款状态 | - | 保留原状态值 |
| 状态 | `status_text` | 退款状态展示文案 | - | 页面优先读该字段 |
| 退货物流 | `return_company`, `return_tracking_no` | 顶层正式字段 | `return_shipping.company`, `return_shipping.tracking_no` | 顶层为正式源，嵌套结构仅兼容 |

## 3. Phase 1 规则

1. 不改现有外部接口路径、URL、action 名、参数名。
2. 正式字段必须在 DTO 中稳定输出。
3. 兼容字段只能由正式字段推导，不能反向成为真相源。
4. 页面优先读：
   - `status_text`
   - `payment_method_text`
   - `refund_target_text`
5. 新代码不得继续新增：
   - 新的支付方式别名
   - 新的金额别名
   - 新的用户身份别名
