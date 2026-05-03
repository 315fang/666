# 预发阻断门槛

> ⚠️ 2026-05-03 更新：本文件中的 `npm run release:check` 仍可执行（保留为 `check:production` 的 alias）。日常基线推荐改用 `npm run check:baseline`。详见 `AGENTS.md` 与 `cloud-mp/docs/audit/2026-05-03-comprehensive-code-review.md` §2 P1-5。

日期：2026-04-14

## 1. 使用规则

本文件用于“准备上线前”的预发验收。  
本轮不执行上传或部署，但必须把门槛和记录方式定义清楚。

## 2. 环境前置

预发验证开始前，必须先确认：

- CloudBase 目标环境明确
- 支付环境变量完整
- `ADMIN_JWT_SECRET` 已固定
- 正式支付证书、V3 Key、商户参数齐全
- 小程序、后台、云函数使用同一套预发配置
- 当日备份成功且已完成 backup verify

建议执行：

```powershell
npm run release:check
```

要求：

- `docs/release/PRODUCTION_CHECK_REPORT.md` 无 blocker

## 3. 后台预发门槛

必须验证：

- 订单列表与详情
- 发货与物流录入
- 退款审核与完成
- 用户列表与详情
- 首页内容位
- 小程序配置
- 弹窗广告

要求：

- 展示字段与 contract 文档一致
- 关键写操作成功回写
- 后续读链看到的数据与写入一致

## 4. 小程序预发门槛

必须验证：

- 登录
- 首页配置与首页内容读取
- 购物车下单
- 直购下单
- 微信支付
- 货款支付
- 退款申请
- 退款取消或完成
- 物流查询
- 分销中心
- 钱包页

要求：

- 真机验证至少覆盖一次
- 页面展示字段与 contract 文档一致
- 状态、金额、支付方式、退款去向在小程序和后台保持一致

## 5. 记录要求

预发门槛执行后必须补：

- 预发验证时间
- 环境标识
- 执行人
- 成功项
- 失败项
- 阻断项
- 回退决定
- 真机验证结果

记录位置建议：

- `docs/release/evidence/runtime/preprod-evidence-latest.json`
- 或同步生成同名 markdown 说明

## 6. 通过定义

只有当以下条件同时满足时，预发阻断门槛才算通过：

- 生产检查报告无 blocker
- 当日备份和 backup verify 通过
- 后台主链全通
- 小程序主链全通
- 真机已验证
- 问题和回退判断已记录
