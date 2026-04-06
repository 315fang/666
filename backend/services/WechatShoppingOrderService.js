/**
 * 微信「购物订单」：支付成功后上传购物详情（uploadShoppingInfo），便于账单/订单中心展示与追溯。
 * 文档：https://developers.weixin.qq.com/miniprogram/dev/OpenApiDoc/shopping-order/normal-shopping-detail/uploadShoppingInfo.html
 *
 * 失败仅打日志，不影响支付回调已成功应答。
 */
const axios = require('axios');
require('dotenv').config();

const WECHAT_APPID = process.env.WECHAT_APPID;
const WECHAT_MCH_ID = process.env.WECHAT_MCH_ID;
const { warn: logWarn, info: logInfo } = require('../utils/logger');

function isUploadEnabled() {
    return String(process.env.WECHAT_SHOPPING_ORDER_UPLOAD || 'true').toLowerCase() !== 'false';
}

function buildUploadTimeRFC3339() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const Y = d.getFullYear();
    const M = pad(d.getMonth() + 1);
    const D = pad(d.getDate());
    const h = pad(d.getHours());
    const m = pad(d.getMinutes());
    const s = pad(d.getSeconds());
    const ms = String(d.getMilliseconds()).padStart(3, '0');
    return `${Y}-${M}-${D}T${h}:${m}:${s}.${ms}+08:00`;
}

function stripHtml(s) {
    return String(s || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function pickHttpsImageUrl(product) {
    const placeholder = (process.env.WECHAT_SHOPPING_PLACEHOLDER_IMAGE || '').trim();
    const imgs = product && product.images;
    const list = Array.isArray(imgs) ? imgs : [];
    const cdn = (
        process.env.ALIYUN_OSS_CUSTOM_DOMAIN
        || process.env.TENCENT_COS_CUSTOM_DOMAIN
        || ''
    ).replace(/\/+$/, '');

    for (const raw of list) {
        if (!raw) continue;
        const u = String(raw).trim();
        if (u.startsWith('https://')) return u.slice(0, 1024);
        if (u.startsWith('http://')) return `https://${u.slice(7)}`.slice(0, 1024);
        if (u.startsWith('//')) return `https:${u}`.slice(0, 1024);
        if (u.startsWith('/') && cdn) return `${cdn}${u}`.slice(0, 1024);
    }
    return placeholder ? placeholder.slice(0, 1024) : null;
}

function buildItemDescription(product, fallbackName) {
    const raw = product && product.description;
    let t = stripHtml(typeof raw === 'string' ? raw : '');
    if (!t) t = fallbackName;
    return t.slice(0, 512);
}

/**
 * @param {object} params
 * @param {import('sequelize').Model} params.order Order 实例
 * @param {import('sequelize').Model|null} params.product Product 实例
 * @param {object} params.notifyData 微信支付 V3 解密后的 resource 内容
 */
async function uploadAfterWechatPay({ order, product, notifyData }) {
    if (!isUploadEnabled()) {
        return { skipped: true, reason: 'WECHAT_SHOPPING_ORDER_UPLOAD=false' };
    }
    if (!WECHAT_APPID || !WECHAT_MCH_ID) {
        logWarn('SHOPPING_ORDER', '跳过上传：未配置 WECHAT_APPID / WECHAT_MCH_ID');
        return { skipped: true, reason: 'missing appid/mchid' };
    }

    const openid = notifyData?.payer?.openid;
    if (!openid) {
        logWarn('SHOPPING_ORDER', '跳过上传：回调无 payer.openid');
        return { skipped: true, reason: 'no openid' };
    }

    const mchid = notifyData.mchid || WECHAT_MCH_ID;
    const outTradeNo = notifyData.out_trade_no || order.order_no;
    const transactionId = notifyData.transaction_id;

    const qty = Math.max(1, parseInt(order.quantity, 10) || 1);
    const lineTotalYuan = parseFloat(
        order.actual_price != null ? order.actual_price : order.total_amount
    );
    if (!Number.isFinite(lineTotalYuan) || lineTotalYuan < 0) {
        logWarn('SHOPPING_ORDER', '跳过上传：订单金额异常', { orderId: order.id });
        return { skipped: true, reason: 'bad amount' };
    }
    const unitPriceFen = Math.max(1, Math.round((lineTotalYuan * 100) / qty));

    const productName = ((product && product.name) || '商品').toString().slice(0, 256);
    const imageUrl = pickHttpsImageUrl(product);
    if (!imageUrl) {
        logWarn(
            'SHOPPING_ORDER',
            '跳过上传：无 https 商品图，可在 .env 设置 WECHAT_SHOPPING_PLACEHOLDER_IMAGE'
        );
        return { skipped: true, reason: 'no image' };
    }

    const orderNoEncoded = encodeURIComponent(order.order_no);
    const orderPath = `pages/order/detail?id=${orderNoEncoded}&channel=1`;
    const itemPath = `pages/product/detail?id=${order.product_id}`;

    const itemList = [
        {
            merchant_item_id: String(order.product_id).slice(0, 64),
            name: productName,
            description: buildItemDescription(product, productName),
            unit_price: unitPriceFen,
            quantity: qty,
            image_url: [imageUrl],
            item_detail_jump_link: {
                type: 'MINI_PROGRAM',
                appid: WECHAT_APPID,
                path: itemPath
            }
        }
    ];

    const orderList = [
        {
            merchant_order_no: String(order.order_no).slice(0, 64),
            order_detail_jump_link: {
                type: 'MINI_PROGRAM',
                appid: WECHAT_APPID,
                path: orderPath
            },
            item_list: itemList
        }
    ];

    const baseBody = {
        order_list: orderList,
        payer: { openid },
        logistics_type: 1,
        upload_time: buildUploadTimeRFC3339()
    };

    const { getAccessToken } = require('../utils/wechat');
    const token = await getAccessToken();
    const url = `https://api.weixin.qq.com/user-order/orders?access_token=${token}`;

    const tryPost = async (orderKey) => {
        const body = { ...baseBody, order_key: orderKey };
        const res = await axios.post(url, body, { timeout: 20000, validateStatus: () => true });
        const data = res.data;
        if (typeof data === 'string') {
            throw new Error(`uploadShoppingInfo 非 JSON 响应: ${data.slice(0, 200)}`);
        }
        return data;
    };

    // 优先：商户 out_trade_no + mchid（与 JSAPI 一致）；枚举名以开放文档为准
    let data = await tryPost({
        order_number_type: 'MERCHANT_OUT_TRADE_NO',
        mchid,
        out_trade_no: outTradeNo
    });

    // 兼容：数字枚举或微信订单号
    if (data.errcode && data.errcode !== 0) {
        const altNum = await tryPost({
            order_number_type: 1,
            mchid,
            out_trade_no: outTradeNo
        });
        if (!altNum.errcode || altNum.errcode === 0) {
            data = altNum;
        }
    }

    if ((data.errcode && data.errcode !== 0) && transactionId) {
        const altWx = await tryPost({
            order_number_type: 'WXPAY_TRADE_NUMBER',
            mchid,
            transaction_id: transactionId
        });
        if (!altWx.errcode || altWx.errcode === 0) {
            data = altWx;
        } else {
            const altWxNum = await tryPost({
                order_number_type: 2,
                mchid,
                transaction_id: transactionId
            });
            if (!altWxNum.errcode || altWxNum.errcode === 0) {
                data = altWxNum;
            }
        }
    }

    if (data.errcode && data.errcode !== 0) {
        throw new Error(`uploadShoppingInfo errcode=${data.errcode} errmsg=${data.errmsg || ''}`);
    }

    logInfo(`SHOPPING_ORDER`, `已上传购物详情 order_no=${order.order_no}`);
    return data;
}

module.exports = {
    uploadAfterWechatPay,
    isUploadEnabled
};
