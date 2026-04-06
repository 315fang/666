/**
 * 将订单详情 path 同步到微信平台（「小程序购物订单」→ 前往小程序）。
 *
 * 前置：公众平台签署订单中心相关协议；本机 .env 配置 WECHAT_APPID / WECHAT_SECRET。
 *
 * 用法（在 backend 目录）：
 *   node scripts/sync-wechat-order-detail-path.js           # 使用默认或 WECHAT_MP_ORDER_DETAIL_PATH
 *   node scripts/sync-wechat-order-detail-path.js --query   # 仅查询当前 path
 *   node scripts/sync-wechat-order-detail-path.js "pages/order/detail?id=\${商品订单号}&channel=1"
 *
 * 注意：占位符必须字面量为 ${商品订单号}（与微信文档一致），shell 传参时需转义 $。
 */
require('dotenv').config();
const path = require('path');
const {
    updateMpOrderDetailPath,
    getMpOrderDetailPath,
    getDefaultMpOrderDetailPath,
    WX_MP_ORDER_NO_PLACEHOLDER
} = require(path.join(__dirname, '../utils/wechat'));

async function main() {
    const argv = process.argv.slice(2);
    if (argv.includes('--query') || argv.includes('-q')) {
        const res = await getMpOrderDetailPath();
        console.log(JSON.stringify(res, null, 2));
        return;
    }
    const pathArg = argv.find((a) => !a.startsWith('-'));
    const usePath = pathArg || process.env.WECHAT_MP_ORDER_DETAIL_PATH || getDefaultMpOrderDetailPath();
    console.log('同步 path:', usePath);
    if (!usePath.includes(WX_MP_ORDER_NO_PLACEHOLDER)) {
        console.error(`错误：path 必须包含占位符 ${WX_MP_ORDER_NO_PLACEHOLDER}`);
        process.exit(1);
    }
    const res = await updateMpOrderDetailPath(usePath);
    console.log('成功:', JSON.stringify(res, null, 2));
}

main().catch((e) => {
    console.error(e.message || e);
    process.exit(1);
});
