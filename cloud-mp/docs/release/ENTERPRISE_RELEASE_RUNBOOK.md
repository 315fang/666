# 企业级发布执行手册

> ⚠️ 2026-05-03 更新：第 2 节中的 `npm run release:check` 仍可执行（保留为 `check:production` 的 alias），但发布前推荐显式跑 `npm run check:production`，日常 PR 跑 `npm run check:baseline`。详见 `AGENTS.md` 与 `cloud-mp/docs/audit/2026-05-03-comprehensive-code-review.md` §2 P1-5。

日期：2026-04-14

## 1. 使用规则

本手册用于预发验证通过后、正式发布前的执行顺序。  
本轮不执行发布，只固定执行口径。

## 2. 发布前准备

1. 确认 `docs/standards/enterprise-hardening/acceptance/release-checklist.md` 已全部打勾。
2. 执行 `npm run release:check`。
3. 确认 `docs/release/PRODUCTION_CHECK_REPORT.md` 无 blocker。
4. 确认当日 CloudBase 日备份成功，且 `backup-latest.json` / `backup-verify-latest.json` 为成功状态。
5. 确认支付环境变量、JWT、CloudBase 环境无误。
6. 确认预发证据和回滚演练记录已存在：
   - `docs/release/evidence/runtime/preprod-evidence-latest.json`
   - `docs/release/evidence/runtime/rollback-drill-latest.json`
7. 确认回滚方案和责任人。

## 3. 建议执行顺序

1. 发布云函数和依赖配置
2. 验证后台基础接口与管理登录
3. 更新后台前端资源
4. 更新小程序依赖的云端配置
5. 执行后台主链 smoke
6. 执行小程序主链 smoke
7. 执行真机验证
8. 进入观察窗口

## 4. 观察窗口

观察窗口内重点关注：

- 订单状态流转
- 支付回调
- 退款完成
- 发货与物流查询
- 首页内容和配置读取
- 分销与钱包展示

观察窗口责任：

- 发布执行人：执行发布并记录结果
- 值班负责人：观察窗口内跟踪异常
- 资金域负责人：处理资金链路异常判断
- 回滚决策人：决定是否触发回滚

## 5. 发布记录

每次发布必须记录：

- 发布时间
- 环境
- 发布内容
- 执行人
- 验证结果
- 异常与处置
