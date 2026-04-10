'use strict';

/**
 * 微信支付 V3 核心模块
 * 
 * 支持公钥模式（新商户）和平台证书模式
 * 云函数内证书从云存储加载（首次自动上传）
 */

const crypto = require('crypto');
const https = require('https');

// ==================== 配置 ====================
const CONFIG = {
    appId: 'wx2483d9ca40c2a2a9',
    mchId: '1107879389',
    serialNo: '2D905DDB10658134EF361AA41BC474ED60288714',
    apiV3Key: 'Hmmszkjyxgs202603170000000000000',
    publicKeyId: 'PUB_KEY_ID_0111078793892026031700382162000400',
    // 回调地址 — 云函数 HTTP 触发路径
    notifyUrl: 'https://cloud1-9gywyqe49638e46f.ap-shanghai.tcb.qcloud.la/payment',
};

// ==================== 证书缓存 ====================
let privateKeyPem = null;
let publicKeyPem = null;

/**
 * 加载私钥（从云存储或本地）
 */
async function loadPrivateKey(cloud) {
    if (privateKeyPem) return privateKeyPem;

    // 方案1: 尝试从云存储读取
    try {
        const result = await cloud.downloadFile({
            fileID: 'cloud://cloud1-9gywyqe49638e46f.636c-cloud1-9gywyqe49638e46f-1419893803/payment-certs/apiclient_key.pem',
        });
        const fs = require('fs');
        const content = fs.readFileSync(result.fileContent || result.tempFilePath, 'utf8');
        if (content.includes('PRIVATE KEY')) {
            privateKeyPem = content;
            return privateKeyPem;
        }
    } catch (e) {
        console.log('[WechatPayV3] 从云存储加载私钥失败，尝试本地文件:', e.message);
    }

    // 方案2: 本地文件（开发环境）
    try {
        const fs = require('fs');
        const path = require('path');
        const keyPath = path.join(__dirname, 'certs', 'apiclient_key.pem');
        if (fs.existsSync(keyPath)) {
            privateKeyPem = fs.readFileSync(keyPath, 'utf8');
            return privateKeyPem;
        }
    } catch (e) {
        console.log('[WechatPayV3] 本地私钥文件不存在:', e.message);
    }

    throw new Error('无法加载微信支付私钥，请确保证书已上传到云存储或本地certs目录');
}

/**
 * 加载微信支付公钥（用于验签）
 */
async function loadPublicKey(cloud) {
    if (publicKeyPem) return publicKeyPem;

    try {
        const result = await cloud.downloadFile({
            fileID: 'cloud://cloud1-9gywyqe49638e46f.636c-cloud1-9gywyqe49638e46f-1419893803/payment-certs/wechatpay_pubkey.pem',
        });
        const fs = require('fs');
        const content = fs.readFileSync(result.fileContent || result.tempFilePath, 'utf8');
        if (content.includes('PUBLIC KEY')) {
            publicKeyPem = content;
            return publicKeyPem;
        }
    } catch (e) {
        console.log('[WechatPayV3] 从云存储加载公钥失败，尝试本地:', e.message);
    }

    try {
        const fs = require('fs');
        const path = require('path');
        const pubKeyPath = path.join(__dirname, 'certs', 'wechatpay_pubkey.pem');
        if (fs.existsSync(pubKeyPath)) {
            publicKeyPem = fs.readFileSync(pubKeyPath, 'utf8');
            return publicKeyPem;
        }
    } catch (e) {
        console.log('[WechatPayV3] 本地公钥文件不存在:', e.message);
    }

    throw new Error('无法加载微信支付公钥');
}

// ==================== 签名与验签 ====================

/**
 * 生成请求签名
 * @param {string} method - HTTP 方法
 * @param {string} url - 请求 URL 路径
 * @param {number} timestamp - 时间戳
 * @param {string} nonceStr - 随机串
 * @param {string} body - 请求体
 * @param {string} privateKey - PEM 格式私钥
 * @returns {string} 签名串
 */
function sign(method, url, timestamp, nonceStr, body, privateKey) {
    const message = `${method}\n${url}\n${timestamp}\n${nonceStr}\n${body}\n`;
    const sign = crypto.createSign('sha256');
    sign.update(message);
    return sign.sign(privateKey, 'base64');
}

/**
 * 验证回调签名（公钥模式）
 * @param {string} timestamp - 回调时间戳
 * @param {string} nonceStr - 回调随机串
 * @param {string} body - 回调请求体
 * @param {string} signature - 回调签名
 * @param {string} publicKey - PEM 格式公钥
 * @returns {boolean}
 */
function verifySignature(timestamp, nonceStr, body, signature, publicKey) {
    const message = `${timestamp}\n${nonceStr}\n${body}\n`;
    const verify = crypto.createVerify('sha256');
    verify.update(message);
    return verify.verify(publicKey, signature, 'base64');
}

// ==================== HTTP 请求 ====================

/**
 * 发送 V3 API 请求
 * @param {string} method - HTTP 方法
 * @param {string} path - API 路径 (如 /v3/pay/transactions/jsapi)
 * @param {object} body - 请求体对象
 * @param {string} privateKey - PEM 私钥
 * @returns {Promise<object>} 响应 JSON
 */
function request(method, path, body, privateKey) {
    return new Promise((resolve, reject) => {
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const nonceStr = crypto.randomBytes(16).toString('hex');
        const bodyStr = body ? JSON.stringify(body) : '';

        const signature = sign(method, path, timestamp, nonceStr, bodyStr, privateKey);
        const authorization = `WECHATPAY2-SHA256-RSA2048 mchid="${CONFIG.mchId}",nonce_str="${nonceStr}",timestamp="${timestamp}",serial_no="${CONFIG.serialNo}",signature="${signature}"`;

        const options = {
            hostname: 'api.mch.weixin.qq.com',
            port: 443,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': authorization,
                'Wechatpay-Serial': CONFIG.publicKeyId || CONFIG.serialNo,
            },
        };

        if (bodyStr) {
            options.headers['Content-Length'] = Buffer.byteLength(bodyStr, 'utf8');
        }

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (res.statusCode >= 400) {
                        const err = new Error(json.message || `WeChatPay API error: ${res.statusCode}`);
                        err.code = json.code || 'WECHAT_PAY_API_ERROR';
                        err.statusCode = res.statusCode;
                        err.response = json;
                        reject(err);
                    } else {
                        resolve(json);
                    }
                } catch (e) {
                    reject(new Error(`Invalid JSON response: ${data.substring(0, 200)}`));
                }
            });
        });

        req.on('error', (e) => reject(e));
        req.on('timeout', () => { req.destroy(); reject(new Error('WeChatPay API request timeout')); });
        req.setTimeout(10000);

        if (bodyStr) req.write(bodyStr);
        req.end();
    });
}

// ==================== 解密回调 ====================

/**
 * 解密回调通知中的加密数据
 * @param {string} ciphertext - Base64 密文
 * @param {string} nonce - 随机串
 * @param {string} associatedData - 附加数据
 * @returns {object} 解密后的 JSON 对象
 */
function decryptResource(ciphertext, nonce, associatedData) {
    const key = Buffer.from(CONFIG.apiV3Key, 'utf8');
    const iv = Buffer.from(nonce, 'utf8');
    const buf = Buffer.from(ciphertext, 'base64');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(buf.slice(buf.length - 16));
    decipher.setAAD(Buffer.from(associatedData, 'utf8'));

    const decrypted = Buffer.concat([
        decipher.update(buf.slice(0, buf.length - 16)),
        decipher.final(),
    ]);

    return JSON.parse(decrypted.toString('utf8'));
}

// ==================== 业务 API ====================

/**
 * JSAPI 统一下单
 * @param {string} openid - 用户 openid
 * @param {string} orderNo - 商户订单号
 * @param {number} amount - 金额（分）
 * @param {string} description - 商品描述
 * @param {string} privateKey - PEM 私钥
 * @returns {Promise<{prepay_id: string}>}
 */
async function jsapiOrder(openid, orderNo, amount, description, privateKey) {
    const body = {
        appid: CONFIG.appId,
        mchid: CONFIG.mchId,
        description: description.substring(0, 127), // 微信限制127字符
        out_trade_no: orderNo,
        notify_url: CONFIG.notifyUrl,
        amount: {
            total: Math.round(amount),  // 金额（分）
            currency: 'CNY',
        },
        payer: {
            openid: openid,
        },
    };

    return request('POST', '/v3/pay/transactions/jsapi', body, privateKey);
}

/**
 * 生成小程序支付参数（供前端 wx.requestPayment 调用）
 * @param {string} prepayId - 预支付 ID
 * @param {string} privateKey - PEM 私钥
 * @returns {object} 支付参数
 */
function buildMiniPayParams(prepayId, privateKey) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonceStr = crypto.randomBytes(16).toString('hex');
    const message = `${CONFIG.appId}\n${timestamp}\n${nonceStr}\nprepay_id=${prepayId}\n`;

    const signer = crypto.createSign('sha256');
    signer.update(message);
    const paySign = signer.sign(privateKey, 'base64');

    return {
        appId: CONFIG.appId,
        timeStamp: timestamp,
        nonceStr: nonceStr,
        package: `prepay_id=${prepayId}`,
        signType: 'RSA',
        paySign: paySign,
    };
}

/**
 * 查询订单（微信侧）
 * @param {string} orderNo - 商户订单号
 * @param {string} privateKey - PEM 私钥
 * @returns {Promise<object>}
 */
async function queryOrderByOutTradeNo(orderNo, privateKey) {
    return request('GET', `/v3/pay/transactions/out-trade-no/${orderNo}?mchid=${CONFIG.mchId}`, null, privateKey);
}

/**
 * 申请退款
 * @param {string} orderNo - 商户订单号
 * @param {string} refundNo - 退款单号
 * @param {number} total - 原订单金额（分）
 * @param {number} refund - 退款金额（分）
 * @param {string} reason - 退款原因
 * @param {string} privateKey - PEM 私钥
 * @returns {Promise<object>}
 */
async function createRefund(orderNo, refundNo, total, refund, reason, privateKey) {
    const body = {
        out_trade_no: orderNo,
        out_refund_no: refundNo,
        reason: reason || '用户申请退款',
        amount: {
            refund: Math.round(refund),
            total: Math.round(total),
            currency: 'CNY',
        },
        notify_url: CONFIG.notifyUrl,
    };

    return request('POST', '/v3/refund/domestic/refunds', body, privateKey);
}

// ==================== 导出 ====================

module.exports = {
    CONFIG,
    loadPrivateKey,
    loadPublicKey,
    sign,
    verifySignature,
    decryptResource,
    request,
    jsapiOrder,
    buildMiniPayParams,
    queryOrderByOutTradeNo,
    createRefund,
};
