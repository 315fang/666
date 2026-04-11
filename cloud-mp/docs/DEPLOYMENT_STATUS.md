# 项目部署状态

> 更新时间：2026-04-11 09:17

## CloudBase 环境

| 项目 | 值 |
|------|-----|
| 环境ID | `cloud1-9gywyqe49638e46f` |
| 区域 | ap-shanghai |
| 小程序 AppID | `wx2483d9ca40c2a2a9` |
| 静态托管域名 | `cloud1-9gywyqe49638e46f-1419893803.tcloudbaseapp.com` |
| 管理后台入口 | `https://cloud1-9gywyqe49638e46f-1419893803.tcloudbaseapp.com/admin/` |
| 管理后台 API | `https://cloud1-9gywyqe49638e46f.service.tcloudbase.com/admin/api` |


## 云函数部署状态（12 个）

| 函数名 | 运行时 | 超时 | 状态 |
|--------|--------|------|------|
| login | Nodejs16.13 | 10s | ✅ 已部署 |
| user | Nodejs16.13 | 10s | ✅ 已部署 |
| products | Nodejs16.13 | 10s | ✅ 已部署 |
| cart | Nodejs16.13 | 10s | ✅ 已部署 |
| order | Nodejs16.13 | 15s | ✅ 已部署 |
| payment | Nodejs16.13 | 20s | ✅ 已部署（含微信支付V3环境变量） |
| distribution | Nodejs16.13 | 10s | ✅ 已部署 |
| config | Nodejs16.13 | 10s | ✅ 已部署 |
| admin-api | Nodejs16.13 | 15s | ✅ 已部署 |
| order-timeout-cancel | Nodejs16.13 | 30s | ✅ 已部署（定时触发：每5分钟） |
| commission-deadline-process | Nodejs16.13 | 30s | ✅ 已部署（定时触发：每小时15分，手动调用通过） |
| order-auto-confirm | Nodejs16.13 | 30s | ✅ 已部署（定时触发：每小时30分，手动调用通过） |

## 微信支付配置

| 项目 | 值 |
|------|-----|
| 商户号 | 1107879389 |
| 证书序列号 | 2D905DDB10658134EF361AA41BC474ED60288714 |
| 公钥ID | PUB_KEY_ID_0111078793892026031700382162000400 |
| 回调地址 | `https://cloud1-9gywyqe49638e46f.ap-shanghai.tcb.qcloud.la/payment` |
| 证书位置 | `cloudfunctions/payment/certs/` (本地) |

### 待办：回调地址配置

微信支付回调需要 payment 云函数开启 HTTP 触发器。需在微信开发者工具 → 云开发控制台 → 云函数 → payment → 触发器 中手动添加 HTTP 触发器，路径设为 `/payment`。

## 数据库安全规则

| 集合 | 权限 |
|------|------|
| users | ADMINWRITE（仅云函数可写） |
| orders | ADMINWRITE |
| cart_items | ADMINWRITE |
| refunds | ADMINWRITE |
| commissions | ADMINWRITE |
| user_coupons | ADMINWRITE |
| products | READONLY（所有人可读） |
| categories | READONLY |
| banners | READONLY |
| coupons | READONLY |

## Action 覆盖率

| 云函数 | 已实现 Action | 覆盖率 |
|--------|--------------|--------|
| login | login | 100% |
| products | list/detail/search/categories/home | 100% |
| cart | list/add/update/remove/clear/count | 100% |
| order | create/list/detail/cancel/confirm/review/applyRefund/refundList/refundDetail/cancelRefund/returnShipping/trackLogistics/status/pickup/group/slash/lottery | 90% |
| payment | prepay/callback/query/refund | 100% |
| user | getProfile/updateProfile/getStats/listAddresses/addAddress/updateAddress/deleteAddress/setDefaultAddress/listCoupons/claimCoupon/claimWelcomeCoupons/getFavorites/addFavorite/removeFavorite/removeFavoriteById/syncFavorites/clearAllFavorites/listNotifications/markRead/walletInfo/walletCommissions/pointsAccount/pointsSignInStatus/pointsSignIn/pointsTasks/pointsLogs/availableCoupons/memberTierMeta/upgradeEligibility/upgrade + 更多 | 80% |
| distribution | center/dashboard/commLogs/commission/commissionPreview/stats/settleMatured/withdraw/withdrawList/team/teamDetail/agentWorkbench/agentOrders/agentRestock/agentWallet/agentWalletLogs/agentWalletRechargeConfig/agentWalletPrepay/agentWalletRechargeOrderDetail/wxacodeInvite | 92% |
| config | init/list/get/getSystemConfig/miniProgramConfig/homeContent/banners/splash/activeTheme/activities/groups/groupDetail/groupActivities/slashList/slashDetail/slashActivities/lottery/lotteryPrizes/lotteryRecords/boardsMap/activityBubbles/activityLinks/festivalConfig/limitedSpotDetail/brandNews/nInviteCard/questionnaireActive/rules | 85% |

## 剩余工作

1. **微信支付回调 HTTP 触发器**：需在控制台确认 `/payment` 仍可访问
2. **证书上传到云存储**：生产环境建议将私钥上传到云存储而非随代码部署
3. **数据库索引**：users、orders、cart_items、commissions、refunds、user_coupons、content_board_products、station_staff 的关键普通索引已通过 CLI 创建；控制台可复核
4. **管理后台 admin-api**：优惠券、拼团、砍价、抽奖、自提站点、榜单、代理配置接口已补；仍需做云端页面级 smoke test
