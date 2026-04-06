const fs = require('fs');
const path = require('path');
const { getCertStatus, refreshPlatformCert } = require('./wechat');

function resolvePath(filePath) {
    if (!filePath) return null;
    return path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
}

function maskValue(value, { keepStart = 4, keepEnd = 4 } = {}) {
    if (!value) return '';
    const str = String(value);
    if (str.length <= keepStart + keepEnd) return str;
    return `${str.slice(0, keepStart)}***${str.slice(-keepEnd)}`;
}

function isPlaceholderValue(value) {
    if (!value) return true;
    const normalized = String(value).trim().toLowerCase();
    return (
        normalized.includes('请替换') ||
        normalized.includes('your_') ||
        normalized.includes('你的域名') ||
        normalized.includes('example.com')
    );
}

function isHttpsUrl(value) {
    try {
        const parsed = new URL(value);
        return parsed.protocol === 'https:';
    } catch (_) {
        return false;
    }
}

function isPublicHost(value) {
    try {
        const parsed = new URL(value);
        const host = parsed.hostname.toLowerCase();
        if (['127.0.0.1', 'localhost', '::1'].includes(host)) return false;
        if (/^10\./.test(host)) return false;
        if (/^192\.168\./.test(host)) return false;
        if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return false;
        return true;
    } catch (_) {
        return false;
    }
}

function buildCheck({ key, label, status, message, value = null, level = 'critical' }) {
    return { key, label, status, message, value, level };
}

async function getPaymentHealth(options = {}) {
    const { refreshCertificate = false } = options;
    const env = process.env;
    const checks = [];
    const warnings = [];

    const privateKeyPath = resolvePath(env.WECHAT_PAY_PRIVATE_KEY_PATH);
    const merchantCertPath = resolvePath(env.WECHAT_PAY_CERT_PATH);
    const platformCertPath = resolvePath(env.WECHAT_PAY_PLATFORM_CERT_PATH || 'certs/wechatpay_platform_cert.pem');

    const requiredFields = [
        ['appid', '小程序 AppID', env.WECHAT_APPID],
        ['mchId', '商户号', env.WECHAT_MCH_ID],
        ['serialNo', '商户证书序列号', env.WECHAT_PAY_SERIAL_NO],
        ['apiV3Key', 'API V3 密钥', env.WECHAT_PAY_API_V3_KEY],
        ['notifyUrl', '支付回调地址', env.WECHAT_PAY_NOTIFY_URL],
        ['privateKeyPath', '商户私钥路径', env.WECHAT_PAY_PRIVATE_KEY_PATH]
    ];

    requiredFields.forEach(([key, label, value]) => {
        const missing = !value;
        const placeholder = !missing && isPlaceholderValue(value);
        checks.push(buildCheck({
            key,
            label,
            status: missing || placeholder ? 'error' : 'ok',
            message: missing ? '未配置' : placeholder ? '仍是占位值' : '已配置',
            value: key === 'apiV3Key' ? maskValue(value, { keepStart: 2, keepEnd: 2 }) : value,
            level: 'critical'
        }));
    });

    checks.push(buildCheck({
        key: 'apiV3KeyLength',
        label: 'API V3 密钥长度',
        status: env.WECHAT_PAY_API_V3_KEY && String(env.WECHAT_PAY_API_V3_KEY).length === 32 ? 'ok' : 'error',
        message: env.WECHAT_PAY_API_V3_KEY
            ? `当前长度 ${String(env.WECHAT_PAY_API_V3_KEY).length}，应为 32`
            : '未配置，无法校验长度',
        value: env.WECHAT_PAY_API_V3_KEY ? `${String(env.WECHAT_PAY_API_V3_KEY).length}` : null,
        level: 'critical'
    }));

    checks.push(buildCheck({
        key: 'privateKeyFile',
        label: '商户私钥文件',
        status: privateKeyPath && fs.existsSync(privateKeyPath) ? 'ok' : 'error',
        message: privateKeyPath && fs.existsSync(privateKeyPath) ? '文件存在' : '文件不存在',
        value: privateKeyPath,
        level: 'critical'
    }));

    checks.push(buildCheck({
        key: 'merchantCertFile',
        label: '商户证书文件',
        status: merchantCertPath && fs.existsSync(merchantCertPath) ? 'ok' : 'warning',
        message: merchantCertPath && fs.existsSync(merchantCertPath) ? '文件存在' : '未找到证书文件',
        value: merchantCertPath,
        level: 'warning'
    }));

    const notifyUrl = env.WECHAT_PAY_NOTIFY_URL;
    checks.push(buildCheck({
        key: 'notifyUrlHttps',
        label: '回调地址 HTTPS',
        status: isHttpsUrl(notifyUrl) ? 'ok' : 'error',
        message: isHttpsUrl(notifyUrl) ? '使用 HTTPS' : '必须使用公网 HTTPS 地址',
        value: notifyUrl,
        level: 'critical'
    }));

    checks.push(buildCheck({
        key: 'notifyUrlPublic',
        label: '回调地址公网可达',
        status: isPublicHost(notifyUrl) ? 'ok' : 'warning',
        message: isPublicHost(notifyUrl) ? '看起来是公网地址' : '疑似本地或内网地址，微信无法直接回调',
        value: notifyUrl,
        level: 'warning'
    }));

    checks.push(buildCheck({
        key: 'notifyUrlPath',
        label: '回调地址路径',
        status: notifyUrl && notifyUrl.includes('/api/wechat/pay/notify') ? 'ok' : 'warning',
        message: notifyUrl && notifyUrl.includes('/api/wechat/pay/notify')
            ? '路径与当前后端实现一致'
            : '建议使用 /api/wechat/pay/notify',
        value: notifyUrl,
        level: 'warning'
    }));

    let refreshResult = null;
    const canRefreshCert = checks.every((item) => {
        if (!['appid', 'mchId', 'serialNo', 'apiV3Key', 'apiV3KeyLength', 'notifyUrl', 'privateKeyPath', 'privateKeyFile'].includes(item.key)) {
            return true;
        }
        return item.status === 'ok';
    });

    if (refreshCertificate && canRefreshCert) {
        try {
            await refreshPlatformCert();
            refreshResult = { status: 'ok', message: '平台证书刷新成功' };
        } catch (error) {
            refreshResult = { status: 'error', message: error.message || '平台证书刷新失败' };
            warnings.push(refreshResult.message);
        }
    } else if (refreshCertificate) {
        refreshResult = { status: 'warning', message: '关键支付配置未通过，已跳过平台证书刷新' };
    }

    const certStatus = getCertStatus();
    const platformCertExists = platformCertPath && fs.existsSync(platformCertPath);
    checks.push(buildCheck({
        key: 'platformCertFile',
        label: '平台证书文件',
        status: platformCertExists ? 'ok' : 'warning',
        message: platformCertExists ? '本地平台证书文件存在' : '本地平台证书文件不存在',
        value: platformCertPath,
        level: 'warning'
    }));
    checks.push(buildCheck({
        key: 'platformCertCache',
        label: '平台证书缓存状态',
        status: certStatus.is_valid ? 'ok' : 'warning',
        message: certStatus.is_valid ? '内存缓存有效' : '当前没有有效平台证书缓存',
        value: certStatus.cached_until,
        level: 'warning'
    }));

    const errorCount = checks.filter((item) => item.status === 'error').length;
    const warningCount = checks.filter((item) => item.status === 'warning').length;
    const status = errorCount > 0 ? 'error' : warningCount > 0 ? 'warning' : 'ok';

    return {
        status,
        summary: status === 'ok'
            ? '微信支付配置正常'
            : status === 'warning'
                ? '微信支付可用性存在风险，请检查告警项'
                : '微信支付当前不可用，请先修复错误项',
        checked_at: new Date().toISOString(),
        refresh_result: refreshResult,
        cert_status: {
            ...certStatus,
            file_path: platformCertPath,
            file_exists: platformCertExists
        },
        checks,
        errors: checks.filter((item) => item.status === 'error').map((item) => `${item.label}: ${item.message}`),
        warnings: [
            ...checks.filter((item) => item.status === 'warning').map((item) => `${item.label}: ${item.message}`),
            ...warnings
        ]
    };
}

module.exports = {
    getPaymentHealth
};
