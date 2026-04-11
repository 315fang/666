# Phase 1 Smoke Checklist

生成时间：2026-04-11

## 1. 小程序交易闭环

最短路径：

`pages/splash/splash -> pages/index/index -> pages/product/detail -> pages/order/confirm -> pages/order/detail -> pages/order/refund-apply -> pages/order/refund-detail`

覆盖购物车时增加：

`pages/product/detail -> pages/cart/cart -> pages/order/confirm`

### 页面与云函数

| 步骤 | 页面/动作 | 云函数 | action |
| --- | --- | --- | --- |
| 1 | 启动登录 | `login` | 默认登录分支 |
| 2 | 商品详情 | `products` | `detail` / `reviews` |
| 3 | 购物车加入 | `cart` | `add` |
| 4 | 购物车页 | `cart` | `list` / `update` / `remove` / `check` |
| 5 | 确认页加载 | `user` / `cart` | `listAddresses` / `pointsAccount` / `availableCoupons` / `list` |
| 6 | 提交订单 | `order` | `create` |
| 7 | 订单详情 | `order` | `detail` |
| 8 | 发起支付 | `payment` | `prepay` / `syncWechatPay` |
| 9 | 退款申请 | `order` | `detail` / `applyRefund` |
| 10 | 退款详情 | `order` | `refundDetail` / `cancelRefund` / `returnShipping` |

### 必验结果

- 登录后能稳定拿到 `openid`
- 商品详情可打开且价格/规格正常
- 直接购买可进入确认页
- 购物车加购、改数量、删除正常
- 下单成功后能进入订单详情
- 支付接口能拿到预支付参数
- 支付后 `syncWechatPay` 能回写订单状态
- 退款申请成功，退款详情可读

## 2. 管理端入口

### 静态托管

- 入口地址：`https://cloud1-9gywyqe49638e46f-1419893803.tcloudbaseapp.com/admin/`
- 当前已确认：
  - `admin/index.html` 已上传
  - `admin/assets/images/default-avatar.svg` 已上传
- 待人工确认：
  - 页面首屏是否能正常加载 JS/CSS
  - 登录页是否能打开
  - 若首屏仍 404，优先补齐 `index.html` 当前引用的 5 个资源：
    - `assets/index-Cnc3SZm0.js`
    - `assets/vue-vendor-C5t8wCBm.js`
    - `assets/http-vendor-C0Zqfgkc.js`
    - `assets/element-plus-icons-UEi9pTXG.js`
    - `assets/index-XFU74PjQ.css`

### API 网关

- 管理端 API：`https://cloud1-9gywyqe49638e46f.service.tcloudbase.com/admin/api`
- 已确认 `admin-api` 存在 `/admin/api` 与 `/` 两条访问路径
- 已确认 `admin-api` 云函数代码已更新到 CloudBase 数据源版本

## 3. 支付回调

- 已确认 `payment` 网关现有：
  - `/payment`
  - `/payment-notify`
- 待验证：
  - 微信支付平台当前回调实际指向哪个路径
  - `payment.callback` 是否与当前网关路径一致
  - 支付成功后订单状态是否自动更新

## 4. CloudBase 集合验收

已通过 live smoke：

- `admin_singletons`
- `lottery_configs`
- `wallet_recharge_configs`

验证依据见：

- [CLOUDBASE_LIVE_SMOKE.md](/C:/Users/21963/WeChatProjects/zz/cloud-mp/docs/CLOUDBASE_LIVE_SMOKE.md)

## 5. 发布前最小检查

- `npm run check:foundation`
- `npm run audit:migration`
- `npm run runtime:smoke`
- `cd cloud-mp/admin-ui && npm run build`
- `config` / `distribution` / `admin-api` 云函数已同步
