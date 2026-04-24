# 企业级规范化收口总入口

日期：2026-04-14  
状态：执行中

## 1. 目标

本目录是 `cloud-mp` 规范化收口的唯一人工维护入口，用来回答四个问题：

1. 这个项目最终要被收口成什么样。
2. 哪些字段、接口、链路是正式契约。
3. 每一轮代码修复应该怎么写、怎么验。
4. 在什么条件下才能被视为“可交付、可上线准备完成”。

本轮目标不是新增功能，而是把当前项目收口成一套可审查、可验证、可交付的企业级工程基线。

## 2. 范围

覆盖以下目录和链路：

- `cloudfunctions/`
- `admin-ui/`
- `miniprogram/`
- `docs/`

当前优先收口三条主链和一个传输层：

- 订单 / 支付 / 退款
- 用户 / 分销 / 钱包
- 配置 / 内容
- 小程序请求传输层

## 3. 真相源

本目录的规范必须和以下证据保持一致：

- `docs/audit/2026-04-13-three-part-field-flow-audit.md`
- `docs/audit/2026-04-13-order-main-field-truth.md`
- `docs/audit/2026-04-14-user-distribution-field-truth.md`
- `docs/audit/2026-04-14-config-content-field-truth.md`
- `docs/ORDER_MAIN_CONTRACT_AUDIT.md`
- `docs/USER_DISTRIBUTION_CONTRACT_AUDIT.md`
- `docs/audit/generated/CONFIG_CONTENT_CONTRACT_AUDIT.md`
- `docs/audit/generated/MINIPROGRAM_ROUTE_TABLE_AUDIT.md`
- `docs/CLOUDBASE_LEGACY_COMPAT_AUDIT.md`

如果规范文档与最新已验证代码冲突，必须在同一轮同步修正，不允许长期偏离。

## 4. 文档地图

- [requirements.md](./requirements.md)
  目标、约束、非目标、EARS 验收条件
- [design.md](./design.md)
  模块边界、契约层、兼容层、修复与验证策略
- [tasks.md](./tasks.md)
  五个波次的执行任务和依赖顺序
- [contracts/order.md](./contracts/order.md)
  订单 / 支付 / 退款正式契约
- [contracts/user-distribution.md](./contracts/user-distribution.md)
  用户 / 分销 / 钱包正式契约
- [contracts/config-content.md](./contracts/config-content.md)
  配置 / 内容正式契约
- [contracts/request-transport.md](./contracts/request-transport.md)
  小程序 `ROUTE_TABLE` 传输契约和收口规则
- [repairs/TEMPLATE.md](./repairs/TEMPLATE.md)
  代码修复文档模板
- [repairs/2026-04-14-enterprise-hardening-baseline.md](./repairs/2026-04-14-enterprise-hardening-baseline.md)
  当前已完成收口的首份修复基线
- [acceptance/local-gates.md](./acceptance/local-gates.md)
  本地阻断门槛
- [acceptance/preprod-gates.md](./acceptance/preprod-gates.md)
  预发阻断门槛
- [acceptance/release-checklist.md](./acceptance/release-checklist.md)
  发布前检查表
- [final-delivery.md](./final-delivery.md)
  最终交付说明、剩余债务、阻断项

## 5. 目录规则

本目录中的文档按以下职责分层：

- 规范文档写“应该怎样”
- 修复文档写“这次改了什么、为什么、如何验证”
- 审计脚本产物写“当前证据”
- `docs/release/` 写发布前执行手册和回滚方案

历史阶段说明、临时讨论记录、聊天式结论，不再作为实现依据。

## 6. 当前状态

截至 2026-04-14，现状分成两部分：

### 已有基线

- 订单主链 canonical contract 已落地基础骨架
- 用户 / 分销 / 钱包 canonical contract 已落地基础骨架
- 配置 / 内容 canonical contract 已落地基础骨架
- 小程序 `ROUTE_TABLE` 已有单独审计脚本
- 多项合同审计和 `admin-ui` 构建已能通过

### 仍未完成

- 深层兼容字段未完全退出 writer 和查询链
- `miniprogram/utils/request.js` 仍是隐形接口契约中心
- `cloudfunctions/admin-api/src/app.js` 仍然过重
- 主链集成回归仍偏弱
- 预发和真机验收未执行

## 7. 使用方式

实现或审查任何“企业级规范化”相关工作时，按以下顺序执行：

1. 先读本文件。
2. 再读 `requirements.md`、`design.md`、`tasks.md`。
3. 改动前确认对应专题 `contracts/*.md`。
4. 改动后补一份 `repairs/YYYY-MM-DD-<topic>.md`。
5. 用 `acceptance/*.md` 执行门槛检查。
6. 在 `final-delivery.md` 更新当前完成度和阻断项。
