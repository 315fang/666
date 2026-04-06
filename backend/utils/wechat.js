/**
 * 微信：小程序 code2session、微信支付 V3（JSAPI 下单、回调验签与解密、平台证书/公钥）。
 * 商户平台配置的 notify 地址应对外可达，且与 WECHAT_PAY_NOTIFY_URL 一致（常见为 https://域名/api/wechat/pay/notify）。
 */
const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const WECHAT_APPID = process.env.WECHAT_APPID;
const WECHAT_SECRET = process.env.WECHAT_SECRET;

const WECHAT_MCH_ID = process.env.WECHAT_MCH_ID;
const WECHAT_PAY_SERIAL_NO = process.env.WECHAT_PAY_SERIAL_NO;
const WECHAT_PAY_API_V3_KEY = process.env.WECHAT_PAY_API_V3_KEY;
const WECHAT_PAY_PRIVATE_KEY_PATH = process.env.WECHAT_PAY_PRIVATE_KEY_PATH;
const WECHAT_PAY_CERT_PATH = process.env.WECHAT_PAY_CERT_PATH;
const WECHAT_PAY_PLATFORM_CERT_PATH = process.env.WECHAT_PAY_PLATFORM_CERT_PATH;
const WECHAT_PAY_NOTIFY_URL = process.env.WECHAT_PAY_NOTIFY_URL;
const WECHAT_PAY_CERT_AUTO_PERSIST = String(process.env.WECHAT_PAY_CERT_AUTO_PERSIST || 'true').toLowerCase() !== 'false';
// 微信支付公钥模式（新商户，替代平台证书）
const WECHAT_PAY_PUBLIC_KEY_PATH = process.env.WECHAT_PAY_PUBLIC_KEY_PATH;
const WECHAT_PAY_PUBLIC_KEY_ID = process.env.WECHAT_PAY_PUBLIC_KEY_ID;

function generateNonceStr(length = 32) {
    return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
}

function resolvePath(p) {
    if (!p) return null;
    return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
}

function readRequiredFile(filePath, label) {
    const resolved = resolvePath(filePath);
    if (!resolved) {
        throw new Error(`${label} 未配置`);
    }
    if (!fs.existsSync(resolved)) {
        throw new Error(`${label} 文件不存在: ${resolved}`);
    }
    return fs.readFileSync(resolved, 'utf8');
}

function getPlatformCertOutputPath() {
    const configured = WECHAT_PAY_PLATFORM_CERT_PATH || 'certs/wechatpay_platform_cert.pem';
    return resolvePath(configured);
}

function persistPlatformCert(pemContent, serialNo) {
    if (!WECHAT_PAY_CERT_AUTO_PERSIST) return;
    const outputPath = getPlatformCertOutputPath();
    const outputDir = path.dirname(outputPath);
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(outputPath, pemContent, 'utf8');
    console.log(`[微信支付] 平台证书已写入 PEM 文件: ${outputPath}${serialNo ? ` (serial: ${serialNo})` : ''}`);
}

function assertPayV3Config() {
    const isPlaceholder = (value) => {
        if (!value) return true;
        const v = String(value).trim().toLowerCase();
        return (
            v.includes('请替换') ||
            v.includes('your_') ||
            v.includes('你的域名') ||
            v.includes('example.com')
        );
    };

    const missing = [];
    [
        ['WECHAT_APPID', WECHAT_APPID],
        ['WECHAT_MCH_ID', WECHAT_MCH_ID],
        ['WECHAT_PAY_SERIAL_NO', WECHAT_PAY_SERIAL_NO],
        ['WECHAT_PAY_API_V3_KEY', WECHAT_PAY_API_V3_KEY],
        ['WECHAT_PAY_PRIVATE_KEY_PATH', WECHAT_PAY_PRIVATE_KEY_PATH],
        ['WECHAT_PAY_NOTIFY_URL', WECHAT_PAY_NOTIFY_URL]
    ].forEach(([key, value]) => {
        if (!value) missing.push(key);
    });

    if (missing.length) {
        throw new Error(`微信支付 V3 配置缺失: ${missing.join(', ')}`);
    }

    const placeholderKeys = [];
    [
        ['WECHAT_PAY_API_V3_KEY', WECHAT_PAY_API_V3_KEY],
        ['WECHAT_PAY_PRIVATE_KEY_PATH', WECHAT_PAY_PRIVATE_KEY_PATH],
        ['WECHAT_PAY_NOTIFY_URL', WECHAT_PAY_NOTIFY_URL]
    ].forEach(([key, value]) => {
        if (isPlaceholder(value)) placeholderKeys.push(key);
    });

    if (placeholderKeys.length) {
        throw new Error(`微信支付 V3 配置仍是占位值: ${placeholderKeys.join(', ')}`);
    }
}

function getPrivateKey() {
    return readRequiredFile(WECHAT_PAY_PRIVATE_KEY_PATH, 'WECHAT_PAY_PRIVATE_KEY_PATH');
}

function getPlatformCert() {
    return readRequiredFile(getPlatformCertOutputPath(), 'WECHAT_PAY_PLATFORM_CERT_PATH');
}

function buildAuthorization(method, requestPath, body = '') {
    assertPayV3Config();
    const nonceStr = generateNonceStr();
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const message = `${method}\n${requestPath}\n${timestamp}\n${nonceStr}\n${body}\n`;
    const signature = crypto.createSign('RSA-SHA256').update(message).sign(getPrivateKey(), 'base64');

    return {
        header: `WECHATPAY2-SHA256-RSA2048 mchid=\"${WECHAT_MCH_ID}\",nonce_str=\"${nonceStr}\",signature=\"${signature}\",timestamp=\"${timestamp}\",serial_no=\"${WECHAT_PAY_SERIAL_NO}\"`,
        nonceStr,
        timestamp
    };
}

async function requestV3(method, requestPath, payload) {
    assertPayV3Config();
    const body = payload ? JSON.stringify(payload) : '';
    const { header } = buildAuthorization(method, requestPath, body);
    const url = `https://api.mch.weixin.qq.com${requestPath}`;

    const response = await axios({
        url,
        method,
        data: payload,
        timeout: 15000,
        headers: {
            Authorization: header,
            Accept: 'application/json',
            'Content-Type': 'application/json'
        }
    });

    return response.data;
}

async function createUnifiedOrder({ orderNo, amount, openid, body = '商品购买' }) {
    const payload = {
        appid: WECHAT_APPID,
        mchid: WECHAT_MCH_ID,
        description: body,
        out_trade_no: orderNo,
        notify_url: WECHAT_PAY_NOTIFY_URL,
        amount: { total: Math.round(amount * 100), currency: 'CNY' },
        payer: { openid }
    };

    const result = await requestV3('POST', '/v3/pay/transactions/jsapi', payload);
    if (!result.prepay_id) {
        throw new Error('微信支付 V3 预下单失败：未返回 prepay_id');
    }
    return result.prepay_id;
}

/**
 * 按商户订单号查询 JSAPI 订单（与 out_trade_no 一致，用于补单：notify 漏回调时主动对齐状态）
 * @see https://pay.weixin.qq.com/doc/v3/merchant/4012791860
 */
async function queryJsapiOrderByOutTradeNo(outTradeNo) {
    if (!outTradeNo || String(outTradeNo).trim() === '') {
        throw new Error('out_trade_no 不能为空');
    }
    const encoded = encodeURIComponent(String(outTradeNo).trim());
    const requestPath = `/v3/pay/transactions/out-trade-no/${encoded}?mchid=${encodeURIComponent(WECHAT_MCH_ID)}`;
    return requestV3('GET', requestPath, null);
}

function buildJsApiParams(prepayId) {
    assertPayV3Config();
    const timeStamp = String(Math.floor(Date.now() / 1000));
    const nonceStr = generateNonceStr();
    const pkg = `prepay_id=${prepayId}`;
    const message = `${WECHAT_APPID}\n${timeStamp}\n${nonceStr}\n${pkg}\n`;
    const paySign = crypto.createSign('RSA-SHA256').update(message).sign(getPrivateKey(), 'base64');

    return {
        appId: WECHAT_APPID,
        timeStamp,
        nonceStr,
        package: pkg,
        signType: 'RSA',
        paySign
    };
}

function decryptNotifyResource(resource) {
    assertPayV3Config();
    const key = Buffer.from(WECHAT_PAY_API_V3_KEY, 'utf8');
    const nonce = Buffer.from(resource.nonce, 'utf8');
    const associatedData = Buffer.from(resource.associated_data || '', 'utf8');
    const ciphertext = Buffer.from(resource.ciphertext, 'base64');
    const authTag = ciphertext.subarray(ciphertext.length - 16);
    const data = ciphertext.subarray(0, ciphertext.length - 16);

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAAD(associatedData);
    decipher.setAuthTag(authTag);
    const decoded = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
    return JSON.parse(decoded);
}

async function verifyNotifySign(headers, body) {
    assertPayV3Config();
    const serial = headers['wechatpay-serial'];
    const signature = headers['wechatpay-signature'];
    const timestamp = headers['wechatpay-timestamp'];
    const nonce = headers['wechatpay-nonce'];
    if (!serial || !signature || !timestamp || !nonce) return false;

    const message = `${timestamp}\n${nonce}\n${body}\n`;
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(message);

    // 公钥模式：用本地公钥文件直接验签
    if (WECHAT_PAY_PUBLIC_KEY_ID && WECHAT_PAY_PUBLIC_KEY_PATH) {
        if (serial !== WECHAT_PAY_PUBLIC_KEY_ID) {
            console.error(`[微信支付] 回调公钥ID不匹配，期望 ${WECHAT_PAY_PUBLIC_KEY_ID}，收到 ${serial}，拒绝验签`);
            return false;
        }
        const pubKeyPem = readRequiredFile(WECHAT_PAY_PUBLIC_KEY_PATH, 'WECHAT_PAY_PUBLIC_KEY_PATH');
        return verifier.verify(pubKeyPem, signature, 'base64');
    }

    // 平台证书模式（旧商户）：自动拉取证书验签
    if (_platformCertSerial && _platformCertSerial !== serial) {
        console.warn(`[微信支付] 回调证书序列号不匹配 (${serial} vs ${_platformCertSerial})，正在刷新...`);
        _platformCertCache = null;
        _platformCertExpireAt = 0;
    }
    const certPem = await getPlatformCertAuto();
    return verifier.verify(certPem, signature, 'base64');
}

async function refundOrder({ orderNo, refundNo, refundFee, totalFee, reason = '售后退款' }) {
    const payload = {
        out_trade_no: orderNo,
        out_refund_no: refundNo,
        reason,
        notify_url: WECHAT_PAY_NOTIFY_URL,
        amount: {
            refund: parseInt(refundFee, 10),
            total: parseInt(totalFee, 10),
            currency: 'CNY'
        }
    };
    return requestV3('POST', '/v3/refund/domestic/refunds', payload);
}

async function transferToWallet({ partnerTradeNo, openid, amount, desc = '佣金提现' }) {
    const payload = {
        appid: WECHAT_APPID,
        out_batch_no: partnerTradeNo,
        batch_name: desc.slice(0, 32),
        batch_remark: desc.slice(0, 32),
        total_amount: parseInt(amount, 10),
        total_num: 1,
        transfer_detail_list: [
            {
                out_detail_no: `${partnerTradeNo}-1`,
                transfer_amount: parseInt(amount, 10),
                transfer_remark: desc.slice(0, 32),
                openid,
                user_name: ''
            }
        ]
    };
    return requestV3('POST', '/v3/transfer/batches', payload);
}

async function code2Session(code) {
    const response = await axios.get('https://api.weixin.qq.com/sns/jscode2session', {
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
    return { openid: data.openid, session_key: data.session_key };
}

let accessTokenCache = null;
let accessTokenExpiresAt = 0;

// ===== 平台证书内存缓存（支持自动轮换）=====
let _platformCertCache = null;       // PEM 证书字符串
let _platformCertSerial = null;      // 证书序列号
let _platformCertExpireAt = 0;       // 过期时间 ms

/**
 * 获取平台证书（内存缓存，12小时自动刷新）
 * 优先从 GET /v3/certificates 接口获取，失败则回退到本地文件
 */
async function getPlatformCertAuto() {
    // 缓存未过期时直接返回
    if (_platformCertCache && Date.now() < _platformCertExpireAt) {
        return _platformCertCache;
    }

    try {
        // 调用微信 V3 获取平台证书接口
        const result = await requestV3('GET', '/v3/certificates', null);
        const certs = result.data;

        if (!Array.isArray(certs) || certs.length === 0) {
            throw new Error('证书列表为空');
        }

        // 选择有效期最远的证书
        const now = new Date();
        const validCerts = certs.filter(c => new Date(c.effective_time) <= now && new Date(c.expire_time) > now);
        const sorted = (validCerts.length > 0 ? validCerts : certs).sort((a, b) => {
            return new Date(a.expire_time).getTime() - new Date(b.expire_time).getTime();
        });
        const cert = sorted[sorted.length - 1];

        // AES-256-GCM 解密证书内容
        const key = Buffer.from(WECHAT_PAY_API_V3_KEY, 'utf8');
        const enc = cert.encrypt_certificate;
        const nonce = Buffer.from(enc.nonce, 'utf8');
        const aad = Buffer.from(enc.associated_data || '', 'utf8');
        const cipher = Buffer.from(enc.ciphertext, 'base64');
        const authTag = cipher.subarray(cipher.length - 16);
        const data = cipher.subarray(0, cipher.length - 16);
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
        decipher.setAAD(aad);
        decipher.setAuthTag(authTag);
        const pemContent = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');

        // 写入缓存，12小时过期
        _platformCertCache = pemContent;
        _platformCertSerial = cert.serial_no;
        _platformCertExpireAt = Date.now() + 12 * 60 * 60 * 1000;
        persistPlatformCert(pemContent, cert.serial_no);

        console.log(`[微信支付] 平台证书已自动刷新，序列号：${cert.serial_no}，到期：${cert.expire_time}`);
        return pemContent;
    } catch (err) {
        console.warn(`[微信支付] 平台证书自动获取失败，回退到本地文件：${err.message}`);
        // 回退到本地文件
        const localCert = getPlatformCert();
        // 回退缓存 1 小时（避免频繁重试）
        _platformCertCache = localCert;
        _platformCertExpireAt = Date.now() + 60 * 60 * 1000;
        return localCert;
    }
}

/**
 * 主动刷新平台证书（可由外部调用，如运维监控接口）
 */
async function refreshPlatformCert() {
    _platformCertCache = null;
    _platformCertExpireAt = 0;
    return getPlatformCertAuto();
}

async function getAccessToken() {
    if (accessTokenCache && Date.now() < accessTokenExpiresAt) return accessTokenCache;
    if (!WECHAT_APPID || !WECHAT_SECRET) {
        throw new Error('WECHAT_APPID / WECHAT_SECRET 未配置');
    }
    const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${WECHAT_APPID}&secret=${WECHAT_SECRET}`;
    const response = await axios.get(url);
    if (response.data.errcode) {
        throw new Error(`获取 access_token 失败: ${response.data.errmsg}`);
    }
    accessTokenCache = response.data.access_token;
    accessTokenExpiresAt = Date.now() + (response.data.expires_in - 300) * 1000;
    return accessTokenCache;
}

/** 微信「小程序购物订单」跳转占位符，path 中必须原样包含此串 */
const WX_MP_ORDER_NO_PLACEHOLDER = '${商品订单号}';

function getDefaultMpOrderDetailPath() {
    const fromEnv = process.env.WECHAT_MP_ORDER_DETAIL_PATH;
    if (fromEnv && String(fromEnv).trim()) return String(fromEnv).trim();
    return `pages/order/detail?id=${WX_MP_ORDER_NO_PLACEHOLDER}&channel=1`;
}

/**
 * 配置「我 - 订单与卡包 - 小程序购物订单」前往小程序的订单详情 path。
 * 需先在公众平台签署订单中心相关协议，否则会返回 10060034 等错误。
 * @param {string} [path] 不传则使用环境变量 WECHAT_MP_ORDER_DETAIL_PATH 或内置默认
 */
async function updateMpOrderDetailPath(path) {
    const p = path || getDefaultMpOrderDetailPath();
    if (!p.includes(WX_MP_ORDER_NO_PLACEHOLDER)) {
        throw new Error(`path 须包含占位符 ${WX_MP_ORDER_NO_PLACEHOLDER}（微信将替换为商户订单号，与 out_trade_no 一致）`);
    }
    const token = await getAccessToken();
    const url = `https://api.weixin.qq.com/wxa/sec/order/update_order_detail_path?access_token=${token}`;
    const response = await axios.post(url, { path: p });
    if (response.data.errcode !== 0) {
        const { errcode, errmsg } = response.data;
        throw new Error(`update_order_detail_path 失败 errcode=${errcode} errmsg=${errmsg}`);
    }
    return response.data;
}

/** 查询当前已配置的订单详情 path（未配置时 path 可能为空字符串） */
async function getMpOrderDetailPath() {
    const token = await getAccessToken();
    const url = `https://api.weixin.qq.com/wxa/sec/order/get_order_detail_path?access_token=${token}`;
    const response = await axios.post(url, {});
    if (response.data.errcode !== 0) {
        const { errcode, errmsg } = response.data;
        throw new Error(`get_order_detail_path 失败 errcode=${errcode} errmsg=${errmsg}`);
    }
    return response.data;
}

async function getPhoneNumber(code) {
    const token = await getAccessToken();
    const url = `https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${token}`;
    const response = await axios.post(url, { code });
    if (response.data.errcode !== 0) {
        throw new Error(`获取手机号失败: ${response.data.errmsg}`);
    }
    return response.data.phone_info;
}

/**
 * 无限量小程序码（scene 最长 32，仅支持数字、大小写字母及部分符号）
 * 与小程序端 pages/index/index 解析 scene 约定一致，例如 scene=i%3D123456
 */
async function getWxaCodeUnlimited({
    scene,
    page = 'pages/index/index',
    width = 430,
    envVersion
} = {}) {
    if (!scene || String(scene).length > 32) {
        throw new Error('scene 不能为空且长度不能超过 32');
    }
    const token = await getAccessToken();
    const url = `https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${token}`;
    const env_version = envVersion || process.env.WECHAT_WXA_ENV_VERSION || 'release';
    const response = await axios.post(
        url,
        {
            scene: String(scene),
            page: String(page).replace(/^\//, ''),
            width,
            auto_color: false,
            line_color: { r: 0, g: 0, b: 0 },
            is_hyaline: false,
            env_version
        },
        { responseType: 'arraybuffer', validateStatus: () => true }
    );
    const buf = Buffer.from(response.data);
    if (buf.length > 0 && buf[0] === 0x7b) {
        try {
            const err = JSON.parse(buf.toString('utf8'));
            throw new Error(err.errmsg || 'getwxacodeunlimit 失败');
        } catch (e) {
            if (e.message && !e.message.includes('JSON')) throw e;
            throw new Error('getwxacodeunlimit 返回异常');
        }
    }
    return buf;
}

module.exports = {
    code2Session,
    getAccessToken,
    getPhoneNumber,
    getWxaCodeUnlimited,
    WX_MP_ORDER_NO_PLACEHOLDER,
    getDefaultMpOrderDetailPath,
    updateMpOrderDetailPath,
    getMpOrderDetailPath,
    createUnifiedOrder,
    queryJsapiOrderByOutTradeNo,
    buildJsApiParams,
    verifyNotifySign,
    decryptNotifyResource,
    refundOrder,
    transferToWallet,
    assertPayV3Config,
    refreshPlatformCert,
    getPlatformCertAuto,
    getCertStatus: () => ({
        serial: _platformCertSerial || null,
        cached_until: _platformCertExpireAt ? new Date(_platformCertExpireAt).toISOString() : null,
        is_valid: !!_platformCertSerial && Date.now() < (_platformCertExpireAt || 0)
    })
};
