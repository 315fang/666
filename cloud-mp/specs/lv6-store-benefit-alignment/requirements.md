# Lv6 门店权益收口需求

## 背景

当前 `Lv6 线下实体门店` 与业务口径不一致：

- `Lv6` 不是稳定等同 `Lv4(B2)` 的普通权益角色。
- 门店核销补贴的收款人取自 `stations.claimant_id`，不是“店长身份”本身。
- 自提核销完成后，订单虽已完成，但门店补贴佣金仍停留在 `pending_approval`，没有进入冻结期。
- 运行时还依赖 `branch-agent-policy.enabled` 与 `pickup_station_subsidy_enabled` 两层开关。

## 目标

将当前规则收口为：

1. `Lv6 = Lv4(B2)` 的普通权益别名。
2. `Lv6` 不参与同级奖。
3. 门店店长是该门店的默认补贴收款人。
4. 自提核销完成即视为已收货，相关佣金进入冻结期。
5. 当前环境门店分佣开关处于开启状态。

## 范围

- `cloudfunctions/order/*`
- `cloudfunctions/payment/payment-callback.js`
- `cloudfunctions/distribution/distribution-commission.js`
- `cloudfunctions/admin-api/src/app.js`
- `admin-ui/src/views/branch-agents/index.vue`
- `admin-ui/src/views/pickup-stations/index.vue`
- 必要的收口文档

## 非目标

- 不重做“年度进货 5% 货品奖励”。
- 不新增新的门店申请资质审核系统。
- 不让 `Lv6` 参与同级奖。

## 用户故事

### Story 1

作为运营后台管理员，我希望把某个门店成员设为店长后，系统自动把该店长视为门店补贴收款人，这样核销补贴不会再打给错误的人。

### Story 2

作为门店店长或核销员，我希望在所属门店完成自提核销后，系统立即把门店补贴和订单相关佣金推进到冻结期，这样资金状态与“顾客已收货”的业务事实一致。

### Story 3

作为业务方，我希望 `Lv6` 在普通分佣和积分口径上与 `Lv4(B2)` 一致，但仍保留 `Lv6` 的身份展示和额外门店补贴收益。

## 验收标准

### AC1

When 管理员将某门店成员保存为 `manager`, the system shall 保障该门店只存在一个有效店长收款人，并将对应门店的 `claimant_id` 同步到该店长。

### AC2

When 管理员移除或降级当前店长, the system shall 清理或重定向该门店的 `claimant_id`，避免补贴继续打给失效店长。

### AC3

When 已授权的门店成员完成所属门店自提核销, the system shall 为该门店收款人创建或复用一条 `pickup_subsidy` 佣金记录。

### AC4

When 自提核销完成, the system shall 将该订单下所有 `pending` 或 `pending_approval` 佣金推进为 `frozen`，并写入 `refund_deadline`。

### AC5

When 系统按普通分佣矩阵计算 `Lv6` 用户的收益或买家角色口径, the system shall 使用 `Lv4(B2)` 的权益映射而不改写其真实 `role_level=6` 展示。

### AC6

When 系统评估同级奖, the system shall 不为 `Lv6` 创建 `same_level` 奖励。

### AC7

When 当前环境未显式开启门店分佣, the system shall 在本轮交付中把 `branch-agent-policy.enabled=true` 且 `pickup_station_subsidy_enabled=true` 作为必做操作。

