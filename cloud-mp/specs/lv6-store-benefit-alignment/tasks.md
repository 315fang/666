# Implementation Plan

- [x] 1. 收口门店店长与收款人关系
  - 在门店成员保存逻辑中强制单店唯一有效店长
  - 店长保存时自动同步门店 `claimant_id`
  - 店长降级或移除时同步重算 `claimant_id`
  - _Requirement: AC1, AC2_

- [x] 2. 实现 `Lv6 => Lv4` 普通权益映射
  - 提取统一的普通权益角色 helper
  - 在普通分佣矩阵计算中把 `Lv6` 按 `Lv4` 处理
  - 在复购积分倍率口径中把 `Lv6` 按 `Lv4` 处理
  - 保持 `role_level=6` 的真实身份展示
  - _Requirement: AC5_

- [x] 3. 保持 `Lv6` 不参与同级奖
  - 审查当前同级奖链路，确认映射不会误伤
  - 补充显式保护，避免未来 `Lv6` 因权益映射被带入 `same_level`
  - _Requirement: AC6_

- [x] 4. 自提核销后统一冻结佣金
  - 复用现有冻结佣金 helper
  - 在自提核销完成链路中补齐 `confirmed_at`
  - 核销成功后先确保 `pickup_subsidy` 存在，再统一冻结佣金并写 `refund_deadline`
  - _Requirement: AC3, AC4_

- [x] 5. 开启当前环境门店分佣开关并补验证
  - 将 `branch-agent-policy.enabled` 设为 `true`
  - 保持 `pickup_station_subsidy_enabled=true`
  - 验证后台策略接口与页面回显正确
  - _Requirement: AC7_

- [x] 6. 更新收口文档与验证说明
  - 记录 `Lv6` 权益口径、门店收款人规则、核销冻结规则
  - 给出最小 smoke 用例
  - _Requirement: AC1, AC3, AC5, AC7_
