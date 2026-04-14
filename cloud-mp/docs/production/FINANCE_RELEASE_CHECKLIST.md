# 资金域发布检查清单

## 发布前
- 运行 `npm run release:finance`
- 确认 [STRATEGIC_FINANCE_FIREWALL_AUDIT.md](/C:/Users/21963/WeChatProjects/zz/cloud-mp/docs/STRATEGIC_FINANCE_FIREWALL_AUDIT.md) 为零缺口
- 确认 [REFUND_RECON_AUDIT.md](/C:/Users/21963/WeChatProjects/zz/cloud-mp/docs/REFUND_RECON_AUDIT.md) 无未解释高风险项
- 确认 `admin-ui` 构建通过
- 确认关键云函数语法检查通过

## 发布后
- 人工抽查：
  - 一笔退款详情页
  - 一笔提现详情页
  - 财务看板欠款区块
- 再跑一次资金审计脚本，确认无新增缺口

## 阻断条件
- 资金审计不为 0
- 关键函数语法检查失败
- 管理端构建失败
- 出现新的无原因调账路径
