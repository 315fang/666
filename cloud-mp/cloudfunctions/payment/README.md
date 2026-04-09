# payment 云函数说明

当前目录是小程序支付云函数。

## 当前状态

- 仅保留 `formal / disabled` 两种模式
- `formal` 模式下已接入微信支付签名、JSAPI 下单、回调验签与解密、按 `out_trade_no` 主动同步支付状态
- 订单支付落库已包含幂等处理，重复回调不会重复改写已支付订单
- 原有 `simulation` 支付分支已移除，不再允许模拟成功或模拟回调

## 正式支付配置放在哪里

### 1. 云函数环境变量

正式支付的主配置放在 CloudBase `payment` 云函数环境变量中：

- `PAYMENT_MODE`
- `PAYMENT_PROVIDER`
- `PAYMENT_REQUIRE_FORMAL_CONFIG`
- `PAYMENT_WECHAT_APPID`
- `PAYMENT_WECHAT_MCHID`
- `PAYMENT_WECHAT_NOTIFY_URL`
- `PAYMENT_WECHAT_SERIAL_NO`
- `PAYMENT_WECHAT_API_V3_KEY`
- `PAYMENT_WECHAT_PRIVATE_KEY_PATH`
- `PAYMENT_WECHAT_PLATFORM_CERT_PATH`
- `PAYMENT_WECHAT_PUBLIC_KEY_PATH`
- `PAYMENT_WECHAT_PUBLIC_KEY_ID`

示例文件见：

- [payment.env.example.json](C:\Users\21963\WeChatProjects\zz\cloud-mp\cloudfunctions\payment\payment.env.example.json)

### 2. 证书文件

如果不把私钥和平台证书或公钥直接写进环境变量，默认文件位置是：

- 商户私钥：`certs/apiclient_key.pem`
- 微信支付平台证书：`certs/wechatpay_platform.pem`
- 微信支付公钥：`certs/wechatpay_pubkey.pem`

也就是：

- [C:\Users\21963\WeChatProjects\zz\cloud-mp\cloudfunctions\payment\certs\apiclient_key.pem](C:\Users\21963\WeChatProjects\zz\cloud-mp\cloudfunctions\payment\certs\apiclient_key.pem)
- [C:\Users\21963\WeChatProjects\zz\cloud-mp\cloudfunctions\payment\certs\wechatpay_platform.pem](C:\Users\21963\WeChatProjects\zz\cloud-mp\cloudfunctions\payment\certs\wechatpay_platform.pem)
- [C:\Users\21963\WeChatProjects\zz\cloud-mp\cloudfunctions\payment\certs\wechatpay_pubkey.pem](C:\Users\21963\WeChatProjects\zz\cloud-mp\cloudfunctions\payment\certs\wechatpay_pubkey.pem)

这些证书文件不要提交到仓库，`.gitignore` 已经忽略 `*.pem`。

## 本地检查

在项目根目录执行：

```powershell
cd C:\Users\21963\WeChatProjects\zz\cloud-mp
npm run payment:ready
```

如果当前 shell 已经注入正式支付环境变量，或者证书文件已放到默认位置，这个脚本会输出当前 readiness 状态。

## 真实生产约束

- 生产发布时应保证 `PAYMENT_MODE=formal`
- `formal` 模式必须满足 `payment:ready` 检查
- `disabled` 模式只用于明确停用支付能力，不再承担任何模拟支付职责
