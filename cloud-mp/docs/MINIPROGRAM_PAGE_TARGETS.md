# 小程序页面地图与跳转目标库

本文件记录当前后台允许配置的推荐跳转目标，以及小程序端实际执行的白名单范围。

## 目标库原则

- 后台默认优先从目标库选择，不再手填页面路径。
- 固定功能页使用 `link_type + link_value` 组合配置。
- 动态业务对象仍保留手动值：
  - `product`
  - `category`
  - `group_buy`
  - `slash`
  - `lottery`
  - `url`
- 小程序 `navigator.js` 仍是唯一跳转执行器。

## 当前推荐目标

### 主导航

- 商城首页：`page` -> `/pages/index/index`
- 全部商品：`page` -> `/pages/category/category`
- 活动中心：`page` -> `/pages/activity/activity`
- 个人中心：`page` -> `/pages/user/user`

### 营销入口

- 当前有效限时商品：`flash_sale` -> `''`
- 惊喜礼遇：`coupon_center` -> `__coupon_center__`

### 商城功能

- 搜索页：`page` -> `/pages/search/search`
- 我的优惠券：`page` -> `/pages/coupon/list`
- 积分中心：`page` -> `/pages/points/index`

### 会员服务

- 会员中心：`page` -> `/pages/user/membership-center`
- 我的钱包：`page` -> `/pages/wallet/index`
- 专属客服：`page` -> `/pages/user/customer-service`
- 足迹收藏：`page` -> `/pages/user/favorites-footprints`

### 订单服务

- 我的订单：`page` -> `/pages/order/list`
- 售后列表：`page` -> `/pages/order/refund-list`

### 分销服务

- 分销中心：`page` -> `/pages/distribution/center`

## 页面白名单

`page` 类型当前只允许跳到以下前缀：

- `/pages/index/`
- `/pages/category/`
- `/pages/activity/`
- `/pages/user/`
- `/pages/product/detail`
- `/pages/order/`
- `/pages/address/`
- `/pages/distribution/`
- `/pages/wallet/`
- `/pages/points/`
- `/pages/lottery/`
- `/pages/coupon/`
- `/pages/slash/`
- `/pages/group/`
- `/pages/logistics/`
- `/pages/search/`
- `/pages/stations/`
- `/pages/pickup/`

## 维护位置

- 后台目标库定义：`admin-ui/src/config/miniProgramTargets.js`
- 小程序执行白名单与目标定义：`miniprogram/utils/miniProgramTargets.json`
- 小程序跳转执行器：`miniprogram/utils/navigator.js`
