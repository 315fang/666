# Implementation Plan

- [x] 1. 统一实体门店策略默认值
  - 更新支付、后台策略和收益汇总的区域阶梯默认值。
  - 保持自提服务费默认 2.5%。
  - _Requirement: AC1, AC2_

- [x] 2. 补齐自提服务费历史修复
  - 新增后台修复接口或脚本。
  - 复用核销收款人和金额规则。
  - 增加幂等测试。
  - _Requirement: AC3_

- [x] 3. 实现 Lv6 平级奖 20%
  - 修改支付后平级奖逻辑，不再跳过 Lv6。
  - Lv6 强制现金 20%，三个月冻结，不生成兑换券。
  - 增加支付回调单测。
  - _Requirement: AC5, AC6_

- [x] 4. 收口三个月到期流转
  - 确认 `commission-deadline-process` 与 `distribution.settleMatured` 对相关类型生效。
  - 补充测试防止进行中退款时释放。
  - _Requirement: AC7_

- [x] 5. 实现退款开发费台账
  - 退款完成时按 1.5% 生成 `refund_dev_fee`。
  - 保证按退款单幂等。
  - 增加退款链路测试。
  - _Requirement: AC8_

- [x] 6. 实现年度货品奖励台账
  - 新增年度结算聚合函数或后台入口。
  - 写入 `store_annual_goods_rewards`。
  - 增加基础测试。
  - _Requirement: AC4_

- [x] 7. 后台收益展示分类
  - 门店收益汇总增加平级奖、年度货品奖、退款开发费分类。
  - 保留旧字段兼容。
  - 后台收益页增加历史服务费修复与年度货品奖结算入口。
  - _Requirement: AC9_
