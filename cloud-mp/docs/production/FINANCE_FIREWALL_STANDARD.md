# 资金防火墙标准

## 目标
- 所有战略资金字段变更必须满足：业务理由、业务流水、审计日志、失败回滚。
- 本标准覆盖：`balance`、`commission_balance`、`agent_wallet_balance`、`points`、`growth_value`、`debt_amount`。

## 强制规则
- 禁止无理由调整战略资金字段。
- 禁止余额不足时静默扣减归零。
- 禁止在无权威凭证前把确认型流程推进到终态。
- 禁止“写流水失败但业务返回成功”。
- 任何战略资金写入失败必须恢复已修改的余额、状态和关联记录。

## 流程级要求
- 退款：
  - 内部退款必须写 `wallet_logs` 或 `goods_fund_logs`。
  - 微信退款只能在确认成功后进入 `completed`。
- 提现：
  - 申请扣减余额后，若提现记录或流水写失败，必须回滚。
  - 拒绝提现必须回退余额并写回退流水。
- 货款支付：
  - 扣减货款后，订单状态或流水写失败必须回滚。
- 欠款：
  - 欠款只能通过显式处理入口减少。
  - 欠款必须带原因。
- 手工调账：
  - 管理员调整余额、货款、积分、成长值、佣金都必须填写原因。

## 审计要求
- 审计日志统一落 `admin_audit_logs`。
- 资金流水统一落现有集合：
  - `wallet_logs`
  - `goods_fund_logs`
  - `point_logs`

## 门禁
- `npm run audit:finance-firewall`
- `npm run audit:refunds`
- `npm run audit:finance-smoke`
- `npm run release:finance`
