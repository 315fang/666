# 资金防火墙标准

> ⚠️ **2026-05-03 重要澄清（P0-3 闭环）**
>
> 本文档定义的"资金防火墙"是**业务/工程标准（一组规范）**，
> 不是某一段代码模块。代码侧 `cloud-mp/cloudfunctions/admin-api/src/finance-firewall.js`
> 名字带 firewall，但**实际只是 finance-log helper**——只做日志写入与调账原因校验，
> **不做**余额一致性断言、权限/角色检查、幂等去重、原子写回。
>
> 因此本文档列出的"强制规则 / 流程级要求 / 验收"是**调用方代码必须自行实现**的契约，
> 不能因为某段代码 import 了 `finance-firewall` 模块就当成已经满足。
>
> 物理 rename `finance-firewall.js → finance-log.js` 已评估，但因生产文档体系
> （本文件、`docs/audit/generated/STRATEGIC_FINANCE_FIREWALL_AUDIT.{md,json}`、
> `npm run audit:finance-firewall`）已沿用 firewall 命名，rename 会带来更多
> 名字割裂；当前选择"代码层调用点内联标注 + 本文件头部澄清"作为最 surgical 的闭环。
> 详见 `cloud-mp/docs/audit/2026-05-03-comprehensive-code-review.md` §P0-3 + §7.5。

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
