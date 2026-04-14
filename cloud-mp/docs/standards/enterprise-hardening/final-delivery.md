# 企业级规范化最终交付说明

日期：2026-04-14  
状态：交付包已建，Wave 2 第二轮并行收口已完成，深收口未完成

## 1. 本轮已交付

### 1.1 规范体系

已建立：

- 总入口
- 需求文档
- 设计文档
- 任务清单
- 四个专题契约文档
- 修复模板和首份基线修复报告
- 本地 / 预发 / 发布前门槛文档
- 发布执行与回滚文档

### 1.2 已有代码基线

当前仓库已有以下可复用基线：

- 订单主链 contract 与合同审计
- 用户分销主链 contract 与合同审计
- 配置内容主链 contract 与合同审计
- 小程序 route table 审计
- 多轮 `node --check`
- `admin-ui` 构建验证
- Wave 2 第一轮 writer / consumer 收口
  - `docs/standards/enterprise-hardening/repairs/2026-04-14-order-main-writer-consumer-tightening.md`
- Wave 2 第二轮并行深收口
  - `docs/standards/enterprise-hardening/repairs/2026-04-14-order-main-parallel-wave2-round2.md`

## 2. 当前还不能宣称“最终完成”的原因

以下事项仍未完成，因此当前状态是“具备企业级收口骨架”，不是“企业级最终完成”：

- 深层兼容字段未完全退出 writer 和查询链
- `cloudfunctions/admin-api/src/app.js` 仍然过重
- `miniprogram/utils/request.js` 仍是高耦合 transport
- 主链集成回归仍偏弱
- 预发联调和真机验证尚未执行
- 发布前检查报告尚未实际生成并确认无 blocker

## 3. 仍然阻断上线的事项

以下事项任一未完成，都应视为上线阻断：

- 本地阻断门槛未全绿
- 预发阻断门槛未全绿
- `docs/release/PRODUCTION_CHECK_REPORT.md` 存在 blocker
- 支付与环境变量未完成确认
- 回滚方案未确认

## 4. 下一阶段交付顺序

### Wave 2

- 深收订单 / 支付 / 退款 writer 与副作用边界
- 继续删除页面本地状态、支付、退款 fallback
- 已完成第一轮：
  - 支付 writer 优先写 `payment_method`、`pay_amount`
  - 后台订单页优先显示 `pay_amount`
  - 小程序订单详情与退款申请优先消费正式金额字段
- 已完成第二轮：
  - 抽出 payment 共享 helper 和 order consumer normalizer
  - 修复 `pay_amount = 0` 的支付链问题
  - 退款成功链改为先 `processing` 后 `completed`
  - 货款自动退款失败不再伪装回 `pending`
  - 后台内部退款完成顺序与云函数链进一步对齐

### Wave 3

- 深收用户身份、关系、余额语义
- 缩减 `_legacy_id` 兼容查询

### Wave 4

- 深收配置 / 内容 / request transport
- 让 request 层只保留 transport 责任

### Wave 5

- 补齐主链集成回归
- 完成预发和真机验证
- 生成最终发布证据

## 5. 审查建议

项目负责人或审查人优先查看：

- `docs/standards/enterprise-hardening/README.md`
- `docs/standards/enterprise-hardening/contracts/*.md`
- `docs/standards/enterprise-hardening/repairs/2026-04-14-enterprise-hardening-baseline.md`
- `docs/standards/enterprise-hardening/acceptance/*.md`
- `docs/release/ENTERPRISE_RELEASE_RUNBOOK.md`
- `docs/release/ROLLBACK_PLAN.md`
