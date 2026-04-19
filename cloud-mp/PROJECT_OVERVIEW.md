# 项目总体说明

更新日期：2026-04-18

## 1. 项目定位

这是一个基于微信小程序和 CloudBase 的分销电商系统，包含：

- 面向用户的小程序商城
- 面向运营和审核的管理后台
- 面向业务能力的云函数体系
- 面向导入和校验的 CloudBase 数据基线与迁移资产

当前项目不是“新建阶段”，也不是“推倒重来阶段”，而是“以当前 CloudBase 主线为准，继续收口工程可信度”的阶段。

## 2. 当前技术边界

### 前端

- 微信原生小程序
- Vue 3 + Vite + Pinia + Element Plus 管理后台

### 后端

- CloudBase 云函数
- `admin-api` 管理服务网关
- 微信支付相关云函数能力

### 数据

- 正式运行时数据源：CloudBase
- 迁移输入与历史对照：`mysql/`

说明：

- `mysql/` 仍有保留价值，但它的角色是迁移输入、字段映射和历史资产，不是当前生产真相源。
- 代码中若再启用 `ADMIN_DATA_SOURCE=mysql`，应视为遗留兼容路径，而不是推荐运行模式。

## 3. 运行链路

### 小程序链路

`page -> miniprogram/utils/request.js -> miniprogram/utils/requestRoutes.js -> wx.cloud.callFunction -> cloudfunctions/<module>/index.js`

### 管理后台链路

`admin-ui page -> admin-ui/src/api/* -> /admin/api/* -> cloudfunctions/admin-api`

## 4. 目录说明

```text
cloud-mp/
  miniprogram/        小程序用户端
  cloudfunctions/     业务云函数与 admin-api
  admin-ui/           管理后台前端
  cloudbase-seed/     CloudBase 标准化 seed
  cloudbase-import/   CloudBase 导入包
  docs/               当前文档与审计资料
  mysql/              迁移输入与历史对照
```

## 5. 功能面概览

### 小程序

- 首页、分类、搜索、商品详情
- 购物车、下单、支付、订单、售后
- 用户中心、资料、通知、偏好
- 会员、成长值、积分、优惠券
- 分销中心、团队、提现、钱包
- 活动、拼团、砍价、抽奖
- 自提门店、提货核销、物流

### 管理后台

- 经营看板、财务看板、运营参数
- 商品、分类、活动、优惠券
- 订单、自提门店、押金订单、退款、提现、佣金
- 用户、经销商、分支代理
- 内容、页面装修、素材、评论、群发
- 会员策略、管理员与权限、运维监控、操作日志

### 云函数

- `login`
- `user`
- `products`
- `cart`
- `order`
- `payment`
- `distribution`
- `config`
- `admin-api`
- 定时任务：`order-timeout-cancel`、`order-auto-confirm`、`commission-deadline-process`

## 6. 当前工程判断

这个项目不是垃圾项目，也不是只剩漂亮重构的项目。

更准确的判断是：

- 业务能力已经做出来了
- CloudBase 主线已经形成
- 管理后台和小程序都具备真实业务面
- 但工程治理、文档同步、审计可信度和数据写路径一致性仍然偏脆

## 7. 目前最值得关注的问题

- `cloudfunctions/admin-api/src/app.js` 体量仍然过大
- CloudBase 精确写入路径和 `collectionPrefix` 约定不一致
- `saveCollection()` 仍有整集合覆盖写风险
- 冷启动等待逻辑还存在 fail-open 风险
- 一部分 Markdown 文档仍停留在旧阶段叙述

## 8. 推荐阅读顺序

1. `README.md`
2. `docs/CLOUD_MP_DEVELOPMENT_GUIDE.md`
3. `docs/CLOUDBASE_RELEASE_RUNBOOK.md`
4. `升级.md`

如果需要深入某一类问题，再继续看对应 `docs/` 下的专项审计和运行手册。
