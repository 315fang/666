'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const https = require('https');
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// 证书 cloud fileID（2026-05-03 审计 P0-1 改造）：
// fileID 同时含 envId 与 bucket name，无法仅替换环境 ID 段。
// 给整个 fileID 一个环境变量逃生口；不设变量则走原硬编码（线上零影响）。
const CERT_FILE_IDS = {
    privateKey: process.env.PAYMENT_PRIVATE_KEY_FILE_ID
        || 'cloud://cloud1-9gywyqe49638e46f.636c-cloud1-9gywyqe49638e46f-1419893803/payment-certs/apiclient_key.pem'
};

let cachedPrivateKey = null;

function readRuntimeConfig() {
    const filePath = path.resolve(__dirname, '../payment.runtime.json');
    try {
        if (!fs.existsSync(filePath)) return {};
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
        return {};
    }
}

function pickConfigValue(config, keys, fallback = '') {
    for (const key of keys) {
        const value = String(config[key] || '').trim();
        if (value) return value;
    }
    return fallback;
}

function resolveConfig() {
    const merged = { ...readRuntimeConfig(), ...process.env };
    return {
        mode: pickConfigValue(merged, ['PAYMENT_MODE'], 'simulation').toLowerCase() || 'simulation',
        appId: pickConfigValue(merged, ['PAYMENT_WECHAT_APPID', 'WECHAT_PAY_APPID']),
        mchId: pickConfigValue(merged, ['PAYMENT_WECHAT_MCHID', 'WECHAT_MCH_ID']),
        serialNo: pickConfigValue(merged, ['PAYMENT_WECHAT_SERIAL_NO', 'WECHAT_PAY_SERIAL_NO']),
        apiV3Key: pickConfigValue(merged, ['PAYMENT_WECHAT_API_V3_KEY', 'WECHAT_PAY_API_V3_KEY']),
        publicKeyId: pickConfigValue(merged, ['PAYMENT_WECHAT_PUBLIC_KEY_ID', 'WECHAT_PAY_PUBLIC_KEY_ID']),
        notifyUrl: pickConfigValue(merged, ['PAYMENT_WECHAT_NOTIFY_URL', 'WECHAT_PAY_NOTIFY_URL'])
    };
}

async function loadPrivateKey() {
    if (cachedPrivateKey) return cachedPrivateKey;

    const runtimeConfig = { ...readRuntimeConfig(), ...process.env };
    const inlineKey = pickConfigValue(runtimeConfig, ['PAYMENT_WECHAT_PRIVATE_KEY', 'WECHAT_PAY_PRIVATE_KEY']);
    if (inlineKey) {
        cachedPrivateKey = inlineKey;
        return cachedPrivateKey;
    }

    const filePath = pickConfigValue(runtimeConfig, ['PAYMENT_WECHAT_PRIVATE_KEY_PATH', 'WECHAT_PAY_PRIVATE_KEY_PATH']);
    if (filePath) {
        const resolved = path.isAbsolute(filePath)
            ? filePath
            : path.resolve(__dirname, '..', filePath);
        if (fs.existsSync(resolved)) {
            cachedPrivateKey = fs.readFileSync(resolved, 'utf8');
            return cachedPrivateKey;
        }
    }

    const result = await cloud.downloadFile({ fileID: CERT_FILE_IDS.privateKey });
    const fileContent = result.fileContent || result.tempFilePath;
    cachedPrivateKey = Buffer.isBuffer(fileContent)
        ? fileContent.toString('utf8')
        : fs.readFileSync(fileContent, 'utf8');
    return cachedPrivateKey;
}

function sign(method, requestPath, timestamp, nonceStr, body, privateKey) {
    const message = `${method}\n${requestPath}\n${timestamp}\n${nonceStr}\n${body}\n`;
    const signer = crypto.createSign('sha256');
    signer.update(message);
    return signer.sign(privateKey, 'base64');
}

function requestWechat(method, requestPath, body, config, privateKey) {
    return new Promise((resolve, reject) => {
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const nonceStr = crypto.randomBytes(16).toString('hex');
        const bodyStr = body ? JSON.stringify(body) : '';
        const signature = sign(method, requestPath, timestamp, nonceStr, bodyStr, privateKey);
        const authorization = `WECHATPAY2-SHA256-RSA2048 mchid="${config.mchId}",nonce_str="${nonceStr}",timestamp="${timestamp}",serial_no="${config.serialNo}",signature="${signature}"`;

        const req = https.request({
            hostname: 'api.mch.weixin.qq.com',
            port: 443,
            path: requestPath,
            method,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'User-Agent': 'cloud-mp-admin-api/1.0',
                'Authorization': authorization,
                'Wechatpay-Serial': config.publicKeyId || config.serialNo
            }
        }, (res) => {
            let raw = '';
            res.on('data', (chunk) => { raw += chunk; });
            res.on('end', () => {
                try {
                    const json = JSON.parse(raw);
                    if (res.statusCode >= 400) {
                        const err = new Error(json.message || `WeChatPay API error: ${res.statusCode}`);
                        err.code = json.code || 'WECHAT_PAY_API_ERROR';
                        err.statusCode = res.statusCode;
                        err.response = json;
                        reject(err);
                        return;
                    }
                    resolve(json);
                } catch (_) {
                    reject(new Error(`Invalid JSON response: ${raw.substring(0, 200)}`));
                }
            });
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('WeChatPay refund request timeout'));
        });
        req.setTimeout(10000);
        if (bodyStr) req.write(bodyStr);
        req.end();
    });
}

async function createWechatRefund({ orderNo, refundNo, totalFee, refundFee, reason }) {
    const config = resolveConfig();
    if (config.mode !== 'formal') {
        throw new Error(`当前支付模式不是 formal，不能发起真实退款（mode=${config.mode || 'unknown'}）`);
    }
    if (!config.mchId || !config.serialNo || !config.apiV3Key) {
        throw new Error('微信支付正式退款配置不完整');
    }
    const privateKey = await loadPrivateKey();
    const body = {
        out_trade_no: orderNo,
        out_refund_no: refundNo,
        reason: reason || '管理员退款',
        amount: {
            refund: Math.round(refundFee),
            total: Math.round(totalFee),
            currency: 'CNY'
        },
        notify_url: config.notifyUrl
    };
    return requestWechat('POST', '/v3/refund/domestic/refunds', body, config, privateKey);
}

module.exports = {
    createWechatRefund
};
