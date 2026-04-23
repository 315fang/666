'use strict';

const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
const path = require('path');

const CONFIG = {
    mchId: process.env.PAYMENT_WECHAT_MCHID || process.env.WECHAT_MCH_ID || '',
    serialNo: process.env.PAYMENT_WECHAT_SERIAL_NO || process.env.WECHAT_PAY_SERIAL_NO || '',
    publicKeyId: process.env.PAYMENT_WECHAT_PUBLIC_KEY_ID || process.env.WECHAT_PAY_PUBLIC_KEY_ID || '',
    notifyUrl: process.env.PAYMENT_WECHAT_NOTIFY_URL || process.env.WECHAT_PAY_NOTIFY_URL || '',
};

let privateKeyPem = null;

function readDownloadedFile(result = {}) {
    if (Buffer.isBuffer(result.fileContent)) return result.fileContent.toString('utf8');
    if (typeof result.fileContent === 'string' && result.fileContent.includes('PRIVATE KEY')) return result.fileContent;
    if (result.tempFilePath) return fs.readFileSync(result.tempFilePath, 'utf8');
    return '';
}

async function loadPrivateKey(cloud) {
    if (privateKeyPem) return privateKeyPem;

    const inlineKey = String(process.env.PAYMENT_WECHAT_PRIVATE_KEY || process.env.WECHAT_PAY_PRIVATE_KEY || '').trim();
    if (inlineKey) {
        privateKeyPem = inlineKey;
        return privateKeyPem;
    }

    try {
        const result = await cloud.downloadFile({
            fileID: process.env.PAYMENT_WECHAT_PRIVATE_KEY_FILE_ID
                || 'cloud://cloud1-9gywyqe49638e46f.636c-cloud1-9gywyqe49638e46f-1419893803/payment-certs/apiclient_key.pem',
        });
        const content = readDownloadedFile(result);
        if (content.includes('PRIVATE KEY')) {
            privateKeyPem = content;
            return privateKeyPem;
        }
    } catch (error) {
        console.log('[GroupTimeoutRefund] 从云存储加载私钥失败，尝试本地文件:', error.message);
    }

    try {
        const configuredPath = String(process.env.PAYMENT_WECHAT_PRIVATE_KEY_PATH || process.env.WECHAT_PAY_PRIVATE_KEY_PATH || '').trim();
        const keyPath = configuredPath
            ? (path.isAbsolute(configuredPath) ? configuredPath : path.join(__dirname, configuredPath))
            : path.join(__dirname, 'certs', 'apiclient_key.pem');
        if (fs.existsSync(keyPath)) {
            privateKeyPem = fs.readFileSync(keyPath, 'utf8');
            return privateKeyPem;
        }
    } catch (error) {
        console.log('[GroupTimeoutRefund] 本地私钥文件不存在:', error.message);
    }

    throw new Error('无法加载微信支付私钥');
}

function sign(method, url, timestamp, nonceStr, body, privateKey) {
    const message = `${method}\n${url}\n${timestamp}\n${nonceStr}\n${body}\n`;
    const signer = crypto.createSign('sha256');
    signer.update(message);
    return signer.sign(privateKey, 'base64');
}

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
            path,
            method,
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                'User-Agent': 'cloud-mp-group-timeout-refund/1.0',
                Authorization: authorization,
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
                        const error = new Error(json.message || `WeChatPay API error: ${res.statusCode}`);
                        error.code = json.code || 'WECHAT_PAY_API_ERROR';
                        error.statusCode = res.statusCode;
                        error.response = json;
                        reject(error);
                        return;
                    }
                    resolve(json);
                } catch (_) {
                    reject(new Error(`Invalid JSON response: ${data.substring(0, 200)}`));
                }
            });
        });

        req.on('error', (error) => reject(error));
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('WeChatPay API request timeout'));
        });
        req.setTimeout(10000);

        if (bodyStr) req.write(bodyStr);
        req.end();
    });
}

async function createRefund(orderNo, refundNo, total, refund, reason, privateKey) {
    const body = {
        out_trade_no: orderNo,
        out_refund_no: refundNo,
        reason: reason || '系统退款',
        amount: {
            refund: Math.round(refund),
            total: Math.round(total),
            currency: 'CNY',
        },
        notify_url: CONFIG.notifyUrl,
    };

    return request('POST', '/v3/refund/domestic/refunds', body, privateKey);
}

module.exports = {
    createRefund,
    loadPrivateKey,
};
