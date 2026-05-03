# 发布前检查表

> ⚠️ 2026-05-03 更新：本文件第 4 节"预发门槛"中的 `npm run release:check` 仍可执行（保留为 alias），但当前项目已把 release gate 拆分。日常 PR 推荐 `npm run check:baseline`，发布前才跑 `npm run check:production`（即 `release:check` 别名指向）。详见 `AGENTS.md` 与 `cloud-mp/docs/audit/2026-05-03-comprehensive-code-review.md` §2 P1-5。

日期：2026-04-14

## 1. 代码与文档

- [ ] 本轮改动有对应 repair 文档
- [ ] `final-delivery.md` 已更新
- [ ] 对应专题 contract 已更新
- [ ] 审计结果与文档说明一致

## 2. 本地门槛

- [ ] `npm run audit:order-contract`
- [ ] `npm run audit:user-distribution-contract`
- [ ] `npm run audit:config-content-contract`
- [ ] `npm run audit:miniprogram-routes`
- [ ] `npm run audit:order-fields`
- [ ] `npm run audit:response-shape`
- [ ] `cd admin-ui && npm run build`
- [ ] 相关 `node --check`
- [ ] 本轮 smoke 结果已记录

## 3. 环境与配置

- [ ] CloudBase 目标环境明确
- [ ] 支付正式配置完整
- [ ] `ADMIN_JWT_SECRET` 已确认
- [ ] 后台与小程序使用正确环境
- [ ] 依赖集合、定时器、云函数存在且状态正常
- [ ] 当日备份成功
- [ ] `backup-verify-latest.json` 通过

## 4. 预发门槛

- [ ] `npm run release:check`
- [ ] `docs/release/PRODUCTION_CHECK_REPORT.md` 无 blocker
- [ ] 后台主链验证完成
- [ ] 小程序主链验证完成
- [ ] 真机验证完成
- [ ] `docs/release/evidence/runtime/preprod-evidence-latest.json` 已补齐

## 5. 发布资料

- [ ] 发布执行手册已确认
- [ ] 回滚方案已确认
- [ ] 后台值守手册已确认
- [ ] 责任人和观察窗口已明确
- [ ] 已知残余风险已记录
- [ ] 回滚演练记录已完成

## 6. 阻断定义

以下任一情况存在时，不允许发布：

- 合同审计失败
- 构建失败
- 主链 smoke 未执行
- 生产检查报告有 blocker
- 真机验证未完成
- 回滚方案缺失
- 当日备份缺失
- 回滚演练记录缺失
