# 小程序旧 UI 融合映射

本次融合以 `C:\Users\21963\WeChatProjects\zz` 为主线，`C:\Users\21963\WeChatProjects\zz0\zz` 仅作为 2026-04-04 前端页面参考源。

## 已回迁的公共壳层

- `miniprogram/custom-tab-bar/`: 回迁旧版自定义底栏，继续复用 `miniProgramConfig` 的动态文案和显隐逻辑。
- `miniprogram/app.json`: 补回旧版 UI 需要的页面注册与 `tabBar.custom`。
- `miniprogram/utils/miniProgramConfig.js`: 增加旧底栏所需的活动页显隐和 tabBar 刷新能力。
- `miniprogram/utils/tabBarHelper.js`: 兼容自定义底栏的隐藏/恢复，不再只操作原生 tabBar。

## 已回迁的页面与补充页

- 用户中心主页面：保留 `zz` 的模块化逻辑，恢复 `zz0` 的 `user.wxml` / `user.wxss`。
- 补回旧版页面文件：
  - `pages/user/edit-profile`
  - `pages/user/membership-center`
  - `pages/user/member-levels`
  - `pages/user/ticket-list`
  - `pages/product/reviews`
  - `pages/wallet/recharge-order`
  - `pages/activity/n-invite`

## 关键适配说明

- “我的会员”页继续走 `userDashboard.js / userNavigation.js / userProfileActions.js / userPageInteractions.js`，没有回退成旧版大文件。
- 旧 UI 依赖的数据字段已在新逻辑里补齐：
  - `commissionBalance`
  - `couponBanner`
  - `showQuadExpressCard`
- 旧版交互入口已在当前页逻辑中补齐：
  - 编辑资料
  - 会员等级入口
  - UID 复制
  - 佣金钱包
  - 优惠券横幅点击
- 接口对齐补丁已补充：
  - 商品评价接口支持分页、精选筛选、带图筛选，并返回 `pagination`
  - 商品详情页评价总数兼容 `data.total` 与 `data.pagination.total`
  - 代理商货款流水筛选会把 `filter` 传给后端，后端同步按收支类型过滤
  - `pages/activity/n-invite` 已补齐 `/n/invite-card` 兼容接口，返回旧页面所需的邀约人信息与统计字段
  - `pages/wallet/recharge-order` 已补齐 `/agent/wallet/recharge-orders/:id` 明细接口，并允许 `/agent/wallet/prepay` 通过 `recharge_order_id` 继续支付
  - `pages/user/ticket-list` 当前用兼容空接口 `/customer-service/tickets` 占位，页面可正常打开，但尚未接入真实客服工单系统

## 这次刻意未恢复的内容

- `pages/preview/*` 暂未恢复，继续按当前主线处理。
- `pages/feed/*` 保留 `zz` 主线现状，不按旧版覆盖。
