# Lv6 门店权益收口设计

## 设计概览

本次收口分为四条主线：

1. 门店“店长即收款人”收口
2. `Lv6 => Lv4` 普通权益映射
3. 自提核销完成后统一冻结佣金
4. 当前环境门店分佣开关开启与验证

## 1. 店长与门店收款人

### 当前问题

- 核销权限依赖门店成员表中的 `can_verify=1`
- 门店补贴收款依赖 `stations.claimant_id`
- 两者没有强绑定

### 目标规则

- 每个门店只能有一个“有效店长收款人”
- 当门店成员被设为 `manager` 时：
  - 强制 `can_verify=1`
  - 同步 `stations.claimant_id`
- 当当前店长被降级/移除时：
  - 若存在其他有效店长，则切换到该店长
  - 否则清空 `claimant_id`

### 涉及模块

- `admin-ui/src/views/pickup-stations/index.vue`
- `cloudfunctions/admin-api/src/app.js`

### 兼容策略

- 对已有数据，不做大迁移
- 新写入规则开始生效
- 若历史门店只有一个有效店长但未设置 `claimant_id`，补贴逻辑可优先按 `claimant_id`，必要时再考虑补充数据修复脚本

## 2. Lv6 普通权益映射到 Lv4

### 当前问题

- 普通分佣矩阵只到 `role 5`
- `Lv6` 当前不会自然继承 `Lv4(B2)` 的普通分佣口径
- 复购积分默认值也高于 `Lv4`

### 目标规则

- 引入“普通权益角色”概念：`benefit_role_level`
- 运行时规则：
  - `role_level=6` 时，普通权益计算按 `4`
  - 真实身份展示仍保持 `6`
- 适用范围：
  - 普通直推/间推佣金矩阵
  - 与普通购买角色相关的积分倍率口径
- 不适用范围：
  - 同级奖
  - 门店补贴
  - 身份展示

### 涉及模块

- `cloudfunctions/payment/payment-callback.js`
- `cloudfunctions/distribution/distribution-commission.js`
- 必要时补充后台配置回显逻辑

## 3. 自提核销后冻结佣金

### 当前问题

- 快递订单确认收货后会冻结佣金
- 自提订单核销完成后只会新增 `pickup_subsidy`，未统一进入冻结态

### 目标规则

- 自提核销完成视为已收货
- 在核销完成链路中：
  - 补齐 `confirmed_at`
  - 先确保 `pickup_subsidy` 记录存在
  - 再统一把该订单下 `pending/pending_approval` 佣金冻结
  - 写入统一的 `refund_deadline`

### 实现方式

- 复用 `order-lifecycle` 中现有的冻结逻辑
- 避免在 `order-interactive` 复制一套冻结规则

### 涉及模块

- `cloudfunctions/order/order-lifecycle.js`
- `cloudfunctions/order/order-interactive.js`

## 4. 门店分佣开关

### 当前问题

- `branch-agent-policy.enabled` 默认是 `false`
- 即使补贴子开关是开着的，也可能因为总开关关闭而不生效

### 本轮策略

- 不改“全局默认值”以免影响其他环境
- 在当前环境显式写入：
  - `enabled=true`
  - `pickup_station_subsidy_enabled=true`
- 通过后台接口或运行时存储进行验证

### 涉及模块

- `cloudfunctions/admin-api/src/app.js`
- `admin-ui/src/views/branch-agents/index.vue`

## 风险与权衡

### 风险 1

若直接把 `Lv6` 塞进分佣矩阵，后续文档和配置容易再次漂移。

处理：

- 用统一 helper 做 `6 -> 4` 运行时映射

### 风险 2

历史门店可能存在多个 `manager`。

处理：

- 本轮保存逻辑强制收口为唯一有效店长收款人
- 历史脏数据通过后台操作或后续脚本修复

### 风险 3

核销链路提前冻结佣金后，退款回滚必须仍然可用。

处理：

- 继续复用现有退款回滚和解冻逻辑
- 不新增第二套状态机

## 验证策略

### 场景 1

- 设置 `Lv6` 用户为门店店长
- 门店 `claimant_id` 自动同步到该用户

### 场景 2

- 该用户核销本店订单
- 生成 `pickup_subsidy`
- 状态进入 `frozen`
- 写入 `refund_deadline`

### 场景 3

- `Lv6` 作为普通分销参与者
- 普通佣金口径与 `Lv4` 一致
- 不生成 `same_level`

### 场景 4

- 当前环境 `branch-agent-policy.enabled=true`
- `pickup_station_subsidy_enabled=true`

