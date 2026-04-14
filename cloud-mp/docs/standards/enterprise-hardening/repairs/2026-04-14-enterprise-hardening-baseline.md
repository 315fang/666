# 企业级规范化收口基线修复报告

日期：2026-04-14

## 1. 问题描述

项目在进入收口前，存在三类核心问题：

1. 订单、用户、配置三条主链字段语义不统一
2. 小程序和后台大量依赖本地 fallback 或聚合层猜字段
3. 缺少统一的修复文档、验收门槛和发布前交付包

## 2. 影响范围

影响范围覆盖：

- `cloudfunctions/order/*`
- `cloudfunctions/user/*`
- `cloudfunctions/login/*`
- `cloudfunctions/distribution/*`
- `cloudfunctions/config/*`
- `cloudfunctions/admin-api/src/*`
- `admin-ui/src/views/orders/*`
- `admin-ui/src/views/refunds/*`
- `admin-ui/src/views/users/*`
- `admin-ui/src/views/home-sections/*`
- `miniprogram/pages/order/*`
- `miniprogram/pages/distribution/*`
- `miniprogram/pages/wallet/*`
- `miniprogram/pages/index/*`
- `miniprogram/utils/request.js`

## 3. 根因

根因不是单点 bug，而是系统性契约失控：

- 主身份字段长期混用 `openid / _id / id / _legacy_id`
- 交易字段长期混用 `total_amount / pay_amount / actual_price`
- 支付字段长期混用 `payment_method / pay_channel / pay_type / payment_channel`
- 小程序请求层把 REST 和 action-RPC 两层契约叠在一起
- 页面和后台 consumer 通过本地 map 和 fallback 兜底显示正确

## 4. 修复方案

### 4.1 contract 层

已落地：

- 订单 contract
  - `cloudfunctions/order/order-contract.js`
  - `cloudfunctions/admin-api/src/order-contract.js`
- 用户 / 分销 contract
  - `cloudfunctions/user/user-contract.js`
  - `cloudfunctions/login/user-contract.js`
  - `cloudfunctions/distribution/user-contract.js`
  - `cloudfunctions/admin-api/src/user-contract.js`
- 配置 / 内容 contract
  - `cloudfunctions/config/config-contract.js`
  - `cloudfunctions/admin-api/src/config-contract.js`

### 4.2 writer / assembler / query 收口

已落地：

- 订单与退款 query 输出稳定 canonical 字段
- 退款申请和退货物流回写补齐正式字段
- 用户 profile、分销中心、钱包余额走 canonical user
- 配置和首页内容输出 canonical payload
- 后台 order / refund / user / config 聚合优先复用 contract 层

### 4.3 consumer 收口

已落地：

- 后台订单页、退款页优先消费后端正式字段
- 后台用户和首页内容页优先消费 canonical DTO
- 小程序订单详情、退款页、分销中心、钱包页、首页 loader 优先消费正式字段

### 4.4 审计与护栏

已落地：

- 订单合同审计
- 用户分销合同审计
- 配置内容合同审计
- 小程序 route table 审计
- 订单字段审计
- 后台 response shape 审计

## 5. 兼容策略

- 外部 URL、云函数 `action`、后台 `/admin/api/*` 路径未改
- 旧字段仍存在于兼容层，但不再作为新代码真相源
- `legacy_payload`、旧余额字段、旧支付字段仍保留平滑读取
- 深层兼容字段移除顺序固定为“先读兼容、后停写、再移除”

## 6. 改动模块

本轮已经完成的关键模块集中在：

- 订单主链 contract / query / lifecycle / admin assembler
- 用户分销 contract / profile / distribution query / admin assembler
- 配置内容 contract / config function / admin config assembler
- 小程序订单、钱包、分销、首页消费层

## 7. 验证命令与结果

已验证通过的门槛包括：

- `npm run audit:order-contract`
- `npm run audit:miniprogram-routes`
- `npm run audit:user-distribution-contract`
- `npm run audit:config-content-contract`
- `npm run audit:order-fields`
- `npm run audit:response-shape`
- `cd admin-ui && npm run build`

相关云函数和小程序关键 JS 已执行多轮 `node --check`，通过。

## 8. 回归风险

当前仍需关注：

- 深层 `_legacy_id` 兼容查询
- 支付回调跨域副作用
- `miniprogram/utils/request.js` 规模继续增长
- `cloudfunctions/admin-api/src/app.js` 体量过大

## 9. 后续待清债务

- 深收订单 / 支付 / 退款 writer 和副作用边界
- 深收用户 / 分销 / 钱包身份与余额语义
- 深收配置 / 内容 / request transport
- 补齐主链集成回归、预发联调、真机验证
