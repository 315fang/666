/**
 * 微信购物订单：发货后上传物流信息（配合 WechatShoppingOrderService 支付后「上传购物详情」）。
 * 依次尝试 user-order/orders/shippings 与 wxa/sec/order/upload_shipping_info；失败仅打日志。
 * @see https://developers.weixin.qq.com/doc/oplatform/openApi/OpenApiDoc/miniprogram-management/shopping-orders/uploadShippingInfo.html
 */
const axios = require('axios');
require('dotenv').config();

const { Order, User } = require('../models');
const { getAccessToken, queryJsapiOrderByOutTradeNo } = require('../utils/wechat');
const { warn: logWarn, info: logInfo, error: logError } = require('../utils/logger');

const WECHAT_MCH_ID = process.env.WECHAT_MCH_ID;

function isUploadEnabled() {
    return String(process.env.WECHAT_SHIPPING_INFO_UPLOAD || 'true').toLowerCase() !== 'false';
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

function normalizeExpressCompany(raw, isPickup) {
    if (isPickup) {
        return (process.env.WECHAT_SHIPPING_PICKUP_EXPRESS_CODE || 'OTHER').trim().slice(0, 128);
    }
    const original = String(raw || '').trim();
    const s = original.toUpperCase();
    if (!s) {
        return (process.env.WECHAT_SHIPPING_DEFAULT_EXPRESS_CODE || 'OTHER').trim().slice(0, 128);
    }
    const zhMap = {
        顺丰: 'SF',
        圆通: 'YTO',
        中通: 'ZTO',
        申通: 'STO',
        韵达: 'YD',
        邮政: 'EMS',
        京东: 'JD'
    };
    if (zhMap[original]) return zhMap[original];
    if (/^[A-Z0-9_-]{2,20}$/.test(s)) return s.slice(0, 128);
    return (process.env.WECHAT_SHIPPING_DEFAULT_EXPRESS_CODE || 'OTHER').trim().slice(0, 128);
}

function buildShippingList(order) {
    const isPickup = order.delivery_type === 'pickup';
    const tracking = String(
        order.tracking_no || order.pickup_code || (isPickup ? 'PICKUP' : '')
    ).trim();
    const tracking_no = (tracking || (isPickup ? 'PICKUP' : 'UNKNOWN')).slice(0, 128);
    const express_company = normalizeExpressCompany(order.logistics_company, isPickup);
    return [{ tracking_no, express_company }];
}

function scheduleUploadShippingInfoAfterShip(orderId) {
    const id = parseInt(orderId, 10);
    if (!Number.isFinite(id) || id <= 0) return;
    setImmediate(() => {
        uploadShippingInfoForOrder(id).catch((err) => {
            logError('SHIPPING_INFO', '异步上传异常', { error: err.message });
        });
    });
}

async function uploadShippingInfoForOrder(orderId) {
    if (!isUploadEnabled()) {
        return { skipped: true, reason: 'WECHAT_SHIPPING_INFO_UPLOAD=false' };
    }
    if (!WECHAT_MCH_ID || !process.env.WECHAT_APPID) {
        logWarn('SHIPPING_INFO', '跳过：未配置 WECHAT_MCH_ID / WECHAT_APPID');
        return { skipped: true, reason: 'missing wechat app/mch' };
    }

    const order = await Order.findByPk(orderId, {
        attributes: [
            'id',
            'order_no',
            'buyer_id',
            'payment_method',
            'delivery_type',
            'tracking_no',
            'logistics_company',
            'pickup_code',
            'status'
        ]
    });
    if (!order) {
        logWarn('SHIPPING_INFO', '订单不存在', { orderId });
        return { skipped: true, reason: 'order not found' };
    }
    if (order.payment_method !== 'wechat') {
        return { skipped: true, reason: 'not wechat payment' };
    }
    if (order.status !== 'shipped') {
        return { skipped: true, reason: `status=${order.status}` };
    }

    const buyer = await User.findByPk(order.buyer_id, { attributes: ['openid'] });
    const openid = buyer && buyer.openid;
    if (!openid) {
        logWarn('SHIPPING_INFO', '跳过：买家无 openid', { buyerId: order.buyer_id });
        return { skipped: true, reason: 'no buyer openid' };
    }

    let transactionId = null;
    try {
        const wx = await queryJsapiOrderByOutTradeNo(order.order_no);
        if (wx && wx.trade_state === 'SUCCESS' && wx.transaction_id) {
            transactionId = wx.transaction_id;
        }
    } catch (e) {
        logWarn('SHIPPING_INFO', '查单获取 transaction_id 失败（将仅用商户单号）', { error: e.message });
    }

    const mchid = WECHAT_MCH_ID;
    const outTradeNo = order.order_no;
    const shipping_list = buildShippingList(order);
    const upload_time = buildUploadTimeRFC3339();
    const logistics_type = order.delivery_type === 'pickup' ? 4 : 1;

    const orderKeyCandidates = [
        { order_number_type: 'MERCHANT_OUT_TRADE_NO', mchid, out_trade_no: outTradeNo },
        { order_number_type: 1, mchid, out_trade_no: outTradeNo }
    ];
    if (transactionId) {
        orderKeyCandidates.push({
            order_number_type: 'WXPAY_TRADE_NUMBER',
            mchid,
            transaction_id: transactionId,
            out_trade_no: outTradeNo
        });
        orderKeyCandidates.push({
            order_number_type: 2,
            mchid,
            transaction_id: transactionId
        });
    }

    const token = await getAccessToken();
    const urlUser = `https://api.weixin.qq.com/user-order/orders/shippings?access_token=${token}`;
    const urlSec = `https://api.weixin.qq.com/wxa/sec/order/upload_shipping_info?access_token=${token}`;

    let lastErr = '';

    for (const order_key of orderKeyCandidates) {
        const base = {
            order_key,
            delivery_mode: 1,
            shipping_list,
            upload_time,
            payer: { openid }
        };

        for (const [label, url, body] of [
            ['user-order/shippings', urlUser, base],
            ['wxa/sec/upload_shipping_info', urlSec, { ...base, logistics_type }]
        ]) {
            try {
                const res = await axios.post(url, body, {
                    timeout: 20000,
                    validateStatus: () => true
                });
                const data = res.data;
                if (typeof data === 'string') {
                    lastErr = `${label}: non-JSON`;
                    continue;
                }
                if (!data.errcode || data.errcode === 0) {
                    logInfo('SHIPPING_INFO', `已上传 order_no=${order.order_no} via ${label}`);
                    return data;
                }
                lastErr = `${label}: errcode=${data.errcode} ${data.errmsg || ''}`;
            } catch (e) {
                lastErr = `${label}: ${e.message}`;
            }
        }
    }

    logError('SHIPPING_INFO', `上传失败 order_no=${order.order_no}`, { error: lastErr });
    return { err: lastErr };
}

module.exports = {
    uploadShippingInfoForOrder,
    scheduleUploadShippingInfoAfterShip
};
