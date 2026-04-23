'use strict';

const fs = require('fs');
const path = require('path');

function toBoolean(value, fallback = false) {
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value === 'boolean') return value;
    const normalized = String(value).trim().toLowerCase();
    if (['1', 'true', 'yes', 'on', 'y'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off', 'n'].includes(normalized)) return false;
    return fallback;
}

function toText(value, fallback = '') {
    return value == null ? fallback : String(value).trim();
}

function isPlaceholderValue(value) {
    return /^\$\{[^}]+\}$/.test(toText(value));
}

function pickEnvText(env, keys, fallback = '') {
    for (const key of keys) {
        const value = toText(env[key]);
        if (value && !isPlaceholderValue(value)) return value;
    }
    return fallback;
}

function resolveFilePath(filePath) {
    const text = toText(filePath);
    if (!text) return '';
    if (path.isAbsolute(text)) return text;
    return path.resolve(__dirname, text);
}

function readTextFileMaybe(filePath) {
    const resolved = resolveFilePath(filePath);
    if (!resolved) return '';
    try {
        if (!fs.existsSync(resolved)) return '';
        return fs.readFileSync(resolved, 'utf8').trim();
    } catch (error) {
        return '';
    }
}

function loadRuntimeConfigFile() {
    const filePath = path.resolve(__dirname, 'payment.runtime.json');
    try {
        if (!fs.existsSync(filePath)) return {};
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
        return {};
    }
}

function loadWechatFormalConfig(env = process.env) {
    const privateKeyPath = pickEnvText(env, ['PAYMENT_WECHAT_PRIVATE_KEY_PATH', 'WECHAT_PAY_PRIVATE_KEY_PATH'], 'certs/apiclient_key.pem');
    const platformCertPath = pickEnvText(env, ['PAYMENT_WECHAT_PLATFORM_CERT_PATH', 'WECHAT_PAY_PLATFORM_CERT_PATH'], 'certs/wechatpay_platform.pem');
    const publicKeyPath = pickEnvText(env, ['PAYMENT_WECHAT_PUBLIC_KEY_PATH', 'WECHAT_PAY_PUBLIC_KEY_PATH'], 'certs/wechatpay_pubkey.pem');
    const privateKey = pickEnvText(env, ['PAYMENT_WECHAT_PRIVATE_KEY', 'WECHAT_PAY_PRIVATE_KEY']) || readTextFileMaybe(privateKeyPath);
    const platformCert = pickEnvText(env, ['PAYMENT_WECHAT_PLATFORM_CERT', 'WECHAT_PAY_PLATFORM_CERT']) || readTextFileMaybe(platformCertPath);
    const publicKey = pickEnvText(env, ['PAYMENT_WECHAT_PUBLIC_KEY', 'WECHAT_PAY_PUBLIC_KEY']) || readTextFileMaybe(publicKeyPath);

    return {
        appid: pickEnvText(env, ['PAYMENT_WECHAT_APPID', 'WECHAT_PAY_APPID']),
        mchid: pickEnvText(env, ['PAYMENT_WECHAT_MCHID', 'WECHAT_MCH_ID']),
        notifyUrl: pickEnvText(env, ['PAYMENT_WECHAT_NOTIFY_URL', 'WECHAT_PAY_NOTIFY_URL']),
        serialNo: pickEnvText(env, ['PAYMENT_WECHAT_SERIAL_NO', 'WECHAT_PAY_SERIAL_NO']),
        apiV3Key: pickEnvText(env, ['PAYMENT_WECHAT_API_V3_KEY', 'WECHAT_PAY_API_V3_KEY']),
        privateKey,
        privateKeyPath,
        privateKeySource: pickEnvText(env, ['PAYMENT_WECHAT_PRIVATE_KEY', 'WECHAT_PAY_PRIVATE_KEY']) ? 'env' : (privateKey ? 'file' : 'missing'),
        platformCert,
        platformCertPath,
        platformCertSource: pickEnvText(env, ['PAYMENT_WECHAT_PLATFORM_CERT', 'WECHAT_PAY_PLATFORM_CERT']) ? 'env' : (platformCert ? 'file' : 'missing'),
        publicKey,
        publicKeyPath,
        publicKeySource: pickEnvText(env, ['PAYMENT_WECHAT_PUBLIC_KEY', 'WECHAT_PAY_PUBLIC_KEY']) ? 'env' : (publicKey ? 'file' : 'missing'),
        publicKeyId: pickEnvText(env, ['PAYMENT_WECHAT_PUBLIC_KEY_ID', 'WECHAT_PAY_PUBLIC_KEY_ID']),
        certAutoPersist: toBoolean(pickEnvText(env, ['PAYMENT_WECHAT_CERT_AUTO_PERSIST', 'WECHAT_PAY_CERT_AUTO_PERSIST']), false),
        certRefreshIntervalHours: Number(pickEnvText(env, ['PAYMENT_WECHAT_CERT_REFRESH_INTERVAL_HOURS', 'WECHAT_PAY_CERT_REFRESH_INTERVAL_HOURS'], '24')) || 24
    };
}

function buildFormalCheckSummary(wechat) {
    const verifyKeyReady = !!wechat.platformCert || !!wechat.publicKey;
    return {
        PAYMENT_WECHAT_APPID: !!wechat.appid,
        PAYMENT_WECHAT_MCHID: !!wechat.mchid,
        PAYMENT_WECHAT_NOTIFY_URL: !!wechat.notifyUrl,
        PAYMENT_WECHAT_SERIAL_NO: !!wechat.serialNo,
        PAYMENT_WECHAT_API_V3_KEY: !!wechat.apiV3Key,
        PAYMENT_WECHAT_PRIVATE_KEY: !!wechat.privateKey,
        PAYMENT_WECHAT_PLATFORM_CERT: !!wechat.platformCert,
        PAYMENT_WECHAT_PUBLIC_KEY: !!wechat.publicKey,
        PAYMENT_WECHAT_PUBLIC_KEY_ID: !!wechat.publicKeyId,
        PAYMENT_WECHAT_VERIFY_KEY: verifyKeyReady,
        PAYMENT_WECHAT_PRIVATE_KEY_SOURCE: wechat.privateKeySource,
        PAYMENT_WECHAT_PLATFORM_CERT_SOURCE: wechat.platformCertSource,
        PAYMENT_WECHAT_PUBLIC_KEY_SOURCE: wechat.publicKeySource,
        PAYMENT_WECHAT_PRIVATE_KEY_PATH: wechat.privateKeyPath,
        PAYMENT_WECHAT_PLATFORM_CERT_PATH: wechat.platformCertPath,
        PAYMENT_WECHAT_PUBLIC_KEY_PATH: wechat.publicKeyPath
    };
}

function loadPaymentConfig(env = process.env) {
    const mergedEnv = { ...loadRuntimeConfigFile(), ...env };
    const requestedMode = toText(mergedEnv.PAYMENT_MODE, 'disabled').toLowerCase();
    const mode = ['formal', 'disabled'].includes(requestedMode) ? requestedMode : 'disabled';
    const provider = toText(mergedEnv.PAYMENT_PROVIDER, 'wechat').toLowerCase();
    const requireFormalConfig = toBoolean(mergedEnv.PAYMENT_REQUIRE_FORMAL_CONFIG, true);
    const wechat = loadWechatFormalConfig(mergedEnv);

    const formalProviderKeys = provider === 'wechat'
        ? [
            'PAYMENT_WECHAT_APPID',
            'PAYMENT_WECHAT_MCHID',
            'PAYMENT_WECHAT_NOTIFY_URL',
            'PAYMENT_WECHAT_SERIAL_NO',
            'PAYMENT_WECHAT_API_V3_KEY',
            'PAYMENT_WECHAT_PRIVATE_KEY',
            'PAYMENT_WECHAT_VERIFY_KEY'
        ]
        : [];

    const formalCheckSummary = buildFormalCheckSummary(wechat);
    const missingFormalKeys = formalProviderKeys.filter((key) => !formalCheckSummary[key]);
    const formalConfigured = !requireFormalConfig || missingFormalKeys.length === 0;

    return {
        mode,
        provider,
        requireFormalConfig,
        formalConfigured,
        missingFormalKeys,
        wechat,
        formalCheckSummary,
        raw: {
            mode,
            provider,
            requireFormalConfig
        }
    };
}

module.exports = {
    loadPaymentConfig,
    loadWechatFormalConfig,
    buildFormalCheckSummary,
    loadRuntimeConfigFile,
    isPlaceholderValue,
    toBoolean,
    toText
};
