const axios = require('axios');
const crypto = require('crypto'); // Node.js 内置，无需安装
const https = require('https');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const WECHAT_APPID = process.env.WECHAT_APPID;
const WECHAT_SECRET = process.env.WECHAT_SECRET;

// ======================== 微信支付 V2 JSAPI ========================
const WECHAT_MCH_ID    = process.env.WECHAT_MCH_ID;
const WECHAT_API_KEY   = process.env.WECHAT_API_KEY;
const WECHAT_NOTIFY_URL = process.env.WECHAT_NOTIFY_URL;
const WECHAT_CERT_PATH = process.env.WECHAT_CERT_PATH;
const WECHAT_KEY_PATH = process.env.WECHAT_KEY_PATH;

/**
 * 生成随机字符串（nonce_str）
 */
function generateNonceStr(length = 32) {
    return crypto.randomBytes(Math.ceil(length / 2))
        .toString('hex')
        .slice(0, length);
}

/**
 * 对参数对象进行微信支付 V2 MD5 签名
 * @param {Object} params - 待签名参数（不含 sign 字段）
 * @param {string} apiKey - 商户 API 密钥
 * @returns {string} 大写 MD5 签名
 */
function generateSign(params, apiKey) {
    // 1. 按 key 字典序排序，过滤空值和 sign 字段
    const sortedKeys = Object.keys(params)
        .filter(k => k !== 'sign' && params[k] !== undefined && params[k] !== null && params[k] !== '')
        .sort();

    // 2. 拼接 key=value&key=value
    const str = sortedKeys.map(k => `${k}=${params[k]}`).join('&');

    // 3. 拼接 API 密钥
    const strWithKey = `${str}&key=${apiKey}`;

    // 4. MD5 大写
    return crypto.createHash('md5').update(strWithKey, 'utf8').digest('hex').toUpperCase();
}

/**
 * 将对象序列化为微信支付 XML
 */
function buildXml(params) {
    const inner = Object.keys(params)
        .map(k => `<${k}><![CDATA[${params[k]}]]></${k}>`)
        .join('');
    return `<xml>${inner}</xml>`;
}

/**
 * 简易 XML 解析（仅用于微信支付通知，不依赖第三方库）
 * 只解析 <xml> 下一层的标量子节点
 */
function parseXml(xmlStr) {
    const result = {};
    // 匹配 <key>value</key> 或 <key><![CDATA[value]]></key>
    const re = /<(\w+)>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/\1>/g;
    let match;
    while ((match = re.exec(xmlStr)) !== null) {
        result[match[1]] = match[2];
    }
    return result;
}

function resolveCertPath(p) {
    if (!p) return null;
    return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
}

function getCertKey() {
    const certPath = resolveCertPath(WECHAT_CERT_PATH);
    const keyPath = resolveCertPath(WECHAT_KEY_PATH);
    if (!certPath || !keyPath) {
        throw new Error('微信支付证书配置缺失（WECHAT_CERT_PATH / WECHAT_KEY_PATH）');
    }
    if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
        throw new Error('微信支付证书文件不存在');
    }
    return {
        cert: fs.readFileSync(certPath),
        key: fs.readFileSync(keyPath)
    };
}

async function postXmlWithCert(url, params) {
    if (!WECHAT_MCH_ID || !WECHAT_API_KEY || !WECHAT_APPID) {
        throw new Error('微信支付配置缺失（WECHAT_APPID / WECHAT_MCH_ID / WECHAT_API_KEY）');
    }
    params.sign = generateSign(params, WECHAT_API_KEY);
    const xml = buildXml(params);
    const { cert, key } = getCertKey();
    const agent = new https.Agent({ cert, key });
    const response = await axios.post(url, xml, {
        httpsAgent: agent,
        headers: { 'Content-Type': 'text/xml' },
        timeout: 10000
    });
    const result = parseXml(response.data);
    if (result.return_code !== 'SUCCESS') {
        throw new Error(`微信支付通信失败: ${result.return_msg}`);
    }
    return result;
}

async function refundOrder({ orderNo, refundNo, totalFee, refundFee }) {
    if (!orderNo || !refundNo) throw new Error('退款参数缺失');
    const params = {
        appid: WECHAT_APPID,
        mch_id: WECHAT_MCH_ID,
        nonce_str: generateNonceStr(),
        out_trade_no: orderNo,
        out_refund_no: refundNo,
        total_fee: parseInt(totalFee, 10),
        refund_fee: parseInt(refundFee, 10),
        notify_url: WECHAT_NOTIFY_URL,
        op_user_id: WECHAT_MCH_ID
    };
    const result = await postXmlWithCert('https://api.mch.weixin.qq.com/secapi/pay/refund', params);
    if (result.result_code !== 'SUCCESS') {
        throw new Error(`微信退款失败: [${result.err_code}] ${result.err_code_des}`);
    }
    return result;
}

async function transferToWallet({ partnerTradeNo, openid, amount, desc, spbillCreateIp }) {
    if (!partnerTradeNo || !openid) throw new Error('打款参数缺失');
    const params = {
        mch_appid: WECHAT_APPID,
        mchid: WECHAT_MCH_ID,
        nonce_str: generateNonceStr(),
        partner_trade_no: partnerTradeNo,
        openid,
        check_name: 'NO_CHECK',
        amount: parseInt(amount, 10),
        desc: desc || '佣金提现',
        spbill_create_ip: spbillCreateIp || '127.0.0.1'
    };
    const result = await postXmlWithCert('https://api.mch.weixin.qq.com/mmpaymkttransfers/promotion/transfers', params);
    if (result.result_code !== 'SUCCESS') {
        throw new Error(`微信打款失败: [${result.err_code}] ${result.err_code_des}`);
    }
    return result;
}

/**
 * 调用微信统一下单接口（V2 JSAPI）
 * @param {Object} opts
 * @param {string} opts.orderNo    - 商户订单号
 * @param {number} opts.amount     - 订单金额（元，保留2位小数）
 * @param {string} opts.openid     - 用户 openid
 * @param {string} opts.clientIp   - 用户 IP（格式 x.x.x.x）
 * @param {string} [opts.body]     - 商品描述
 * @returns {Promise<string>}      - prepay_id
 */
async function createUnifiedOrder({ orderNo, amount, openid, clientIp, body = '商品购买' }) {
    if (!WECHAT_MCH_ID || !WECHAT_API_KEY || !WECHAT_NOTIFY_URL) {
        throw new Error('微信支付配置缺失（WECHAT_MCH_ID / WECHAT_API_KEY / WECHAT_NOTIFY_URL）');
    }

    const params = {
        appid:            WECHAT_APPID,
        mch_id:           WECHAT_MCH_ID,
        nonce_str:        generateNonceStr(),
        body,
        out_trade_no:     orderNo,
        total_fee:        Math.round(amount * 100), // 分
        spbill_create_ip: clientIp || '127.0.0.1',
        notify_url:       WECHAT_NOTIFY_URL,
        trade_type:       'JSAPI',
        openid,
    };

    params.sign = generateSign(params, WECHAT_API_KEY);

    const xml = buildXml(params);

    const response = await axios.post(
        'https://api.mch.weixin.qq.com/pay/unifiedorder',
        xml,
        { headers: { 'Content-Type': 'text/xml' }, timeout: 10000 }
    );

    const result = parseXml(response.data);

    if (result.return_code !== 'SUCCESS') {
        throw new Error(`统一下单通信失败: ${result.return_msg}`);
    }
    if (result.result_code !== 'SUCCESS') {
        throw new Error(`统一下单业务失败: [${result.err_code}] ${result.err_code_des}`);
    }

    return result.prepay_id;
}

/**
 * 生成前端 wx.requestPayment() 所需参数
 * @param {string} prepayId
 * @returns {Object}
 */
function buildJsApiParams(prepayId) {
    const params = {
        appId:     WECHAT_APPID,
        timeStamp: String(Math.floor(Date.now() / 1000)),
        nonceStr:  generateNonceStr(),
        package:   `prepay_id=${prepayId}`,
        signType:  'MD5',
    };
    params.paySign = generateSign(params, WECHAT_API_KEY);
    return params;
}

/**
 * 验证微信支付回调签名
 * @param {Object} notifyData - 解析后的通知参数对象
 * @param {string} apiKey
 * @returns {boolean}
 */
function verifyNotifySign(notifyData, apiKey) {
    const receivedSign = notifyData.sign;
    if (!receivedSign) return false;
    const expected = generateSign(notifyData, apiKey);
    return expected === receivedSign;
}

/**
 * 使用code换取openid和session_key
 * @param {string} code - 微信登录code
 * @returns {Promise<{openid: string, session_key: string}>}
 */
async function code2Session(code) {
    try {
        const url = 'https://api.weixin.qq.com/sns/jscode2session';
        const response = await axios.get(url, {
            params: {
                appid: WECHAT_APPID,
                secret: WECHAT_SECRET,
                js_code: code,
                grant_type: 'authorization_code'
            }
        });

        const data = response.data;

        if (data.errcode) {
            throw new Error(`微信接口错误: ${data.errmsg}`);
        }

        return {
            openid: data.openid,
            session_key: data.session_key
        };
    } catch (error) {
        console.error('code2Session错误:', error);
        throw error;
    }
}

/**
 * 获取微信接口调用凭证 access_token
 */
let accessTokenCache = null;
let accessTokenExpiresAt = 0;

async function getAccessToken() {
    if (accessTokenCache && Date.now() < accessTokenExpiresAt) {
        return accessTokenCache;
    }

    try {
        const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${WECHAT_APPID}&secret=${WECHAT_SECRET}`;
        const response = await axios.get(url);
        if (response.data.errcode) {
            throw new Error(`获取 access_token 失败: ${response.data.errmsg}`);
        }
        accessTokenCache = response.data.access_token;
        // 提前5分钟过期
        accessTokenExpiresAt = Date.now() + (response.data.expires_in - 300) * 1000;
        return accessTokenCache;
    } catch (e) {
        console.error('getAccessToken错误:', e);
        throw e;
    }
}

/**
 * 获取用户手机号
 * @param {string} code - 获取手机号的动态令牌
 */
async function getPhoneNumber(code) {
    try {
        const token = await getAccessToken();
        const url = `https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${token}`;
        const response = await axios.post(url, { code });

        if (response.data.errcode !== 0) {
            throw new Error(`获取手机号失败: ${response.data.errmsg}`);
        }

        return response.data.phone_info; // { phoneNumber, purePhoneNumber, countryCode, watermark }
    } catch (e) {
        console.error('getPhoneNumber错误:', e);
        throw e;
    }
}

module.exports = {
    code2Session,
    getAccessToken,
    getPhoneNumber,
    // 微信支付 V2 JSAPI
    generateNonceStr,
    generateSign,
    buildXml,
    parseXml,
    createUnifiedOrder,
    buildJsApiParams,
    verifyNotifySign,
    refundOrder,
    transferToWallet,
};
