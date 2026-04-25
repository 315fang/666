'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { loadPaymentConfig } = require('../cloudfunctions/payment/config');

const projectRoot = path.resolve(__dirname, '..');
const paymentFunctionDir = path.resolve(projectRoot, 'cloudfunctions/payment');
const config = loadPaymentConfig(process.env);

function toPaymentPath(filePath, fallback) {
    const selected = filePath || fallback;
    if (!selected) return '';
    return path.isAbsolute(selected) ? selected : path.resolve(paymentFunctionDir, selected);
}

function fileExists(filePath) {
    return !!filePath && fs.existsSync(filePath) && fs.statSync(filePath).isFile();
}

function readText(filePath) {
    if (!fileExists(filePath)) return '';
    return fs.readFileSync(filePath, 'utf8');
}

function normalizeSerialNo(value) {
    return String(value || '').replace(/[^0-9a-f]/gi, '').toUpperCase();
}

function parsePrivateKey(privateKeyPem) {
    try {
        if (!privateKeyPem) return { ok: false };
        return { ok: true, key: crypto.createPrivateKey(privateKeyPem) };
    } catch (error) {
        return { ok: false, error: error.message };
    }
}

function parsePublicKey(publicKeyPem) {
    try {
        if (!publicKeyPem) return { ok: false };
        return { ok: true, key: crypto.createPublicKey(publicKeyPem) };
    } catch (error) {
        return { ok: false, error: error.message };
    }
}

function parseCertificate(certPem) {
    try {
        if (!certPem) return { ok: false };
        const cert = new crypto.X509Certificate(certPem);
        return {
            ok: true,
            cert,
            serialPresent: !!cert.serialNumber
        };
    } catch (error) {
        return { ok: false, error: error.message };
    }
}

function verifyPrivateKeyAgainstPublicKey(privateKeyPem, publicKey) {
    try {
        if (!privateKeyPem || !publicKey) return false;
        const payload = Buffer.from('payment-readiness-key-check');
        const signature = crypto.createSign('RSA-SHA256').update(payload).end().sign(privateKeyPem);
        return crypto.createVerify('RSA-SHA256').update(payload).end().verify(publicKey, signature);
    } catch (_) {
        return false;
    }
}

function filesHaveSameContent(leftPath, rightPath) {
    if (!fileExists(leftPath) || !fileExists(rightPath)) return null;
    const left = crypto.createHash('sha256').update(fs.readFileSync(leftPath)).digest('hex');
    const right = crypto.createHash('sha256').update(fs.readFileSync(rightPath)).digest('hex');
    return left === right;
}

function buildPemDiagnostics() {
    const privateKeyPath = toPaymentPath(config.wechat.privateKeyPath, 'certs/apiclient_key.pem');
    const merchantCertPath = toPaymentPath(process.env.PAYMENT_WECHAT_MERCHANT_CERT_PATH, 'certs/apiclient_cert.pem');
    const platformCertPath = toPaymentPath(config.wechat.platformCertPath, 'certs/wechatpay_platform.pem');
    const publicKeyPath = toPaymentPath(config.wechat.publicKeyPath, 'certs/wechatpay_pubkey.pem');

    const privateKeyPem = config.wechat.privateKey || readText(privateKeyPath);
    const merchantCertPem = readText(merchantCertPath);
    const platformCertPem = config.wechat.platformCert || readText(platformCertPath);
    const publicKeyPem = config.wechat.publicKey || readText(publicKeyPath);

    const privateKey = parsePrivateKey(privateKeyPem);
    const merchantCert = parseCertificate(merchantCertPem);
    const platformCert = parseCertificate(platformCertPem);
    const wechatPublicKey = parsePublicKey(publicKeyPem);
    const configuredSerial = normalizeSerialNo(config.wechat.serialNo);
    const derivedMerchantSerial = merchantCert.ok ? normalizeSerialNo(merchantCert.cert.serialNumber) : '';

    const merchantKeyPairMatches = privateKey.ok && merchantCert.ok
        ? verifyPrivateKeyAgainstPublicKey(privateKeyPem, merchantCert.cert.publicKey)
        : false;
    const configuredSerialMatchesMerchantCertificate = configuredSerial && derivedMerchantSerial
        ? configuredSerial === derivedMerchantSerial
        : null;
    const serialMismatch = configuredSerialMatchesMerchantCertificate === false;
    const wechatVerifyKeyReady = !!platformCertPem || !!publicKeyPem;

    return {
        ready: privateKey.ok && merchantKeyPairMatches && wechatVerifyKeyReady && !serialMismatch,
        privateKey: {
            source: config.wechat.privateKeySource,
            path: privateKeyPath,
            exists: !!privateKeyPem,
            parses: privateKey.ok
        },
        merchantCertificate: {
            path: merchantCertPath,
            exists: !!merchantCertPem,
            parses: merchantCert.ok,
            serialPresent: !!derivedMerchantSerial
        },
        merchantKeyPair: {
            matches: merchantKeyPairMatches,
            configuredSerialPresent: !!configuredSerial,
            configuredSerialMatchesMerchantCertificate,
            serialMismatch,
            serialCanBeDerivedFromMerchantCertificate: !configuredSerial && !!derivedMerchantSerial
        },
        wechatVerifyKey: {
            platformCertificate: {
                source: config.wechat.platformCertSource,
                path: platformCertPath,
                exists: !!platformCertPem,
                parses: platformCert.ok
            },
            publicKey: {
                source: config.wechat.publicKeySource,
                path: publicKeyPath,
                exists: !!publicKeyPem,
                parses: wechatPublicKey.ok,
                publicKeyIdPresent: !!config.wechat.publicKeyId,
                matchesMerchantPrivateKey: privateKey.ok && wechatPublicKey.ok
                    ? verifyPrivateKeyAgainstPublicKey(privateKeyPem, wechatPublicKey.key)
                    : false
            },
            ready: wechatVerifyKeyReady
        },
        duplicateLocalCopies: {
            privateKeyMatchesRootCertsCopy: filesHaveSameContent(
                privateKeyPath,
                path.resolve(projectRoot, 'certs/apiclient_key.pem')
            ),
            merchantCertMatchesRootCertsCopy: filesHaveSameContent(
                merchantCertPath,
                path.resolve(projectRoot, 'certs/apiclient_cert.pem')
            ),
            wechatPublicKeyMatchesRootCertsCopy: filesHaveSameContent(
                publicKeyPath,
                path.resolve(projectRoot, 'certs/wechatpay_pubkey.pem')
            )
        }
    };
}

function listPemFilesUnderFunction() {
    const certsDir = path.resolve(paymentFunctionDir, 'certs');
    if (!fs.existsSync(certsDir)) return [];
    return fs.readdirSync(certsDir)
        .filter((name) => name.toLowerCase().endsWith('.pem'))
        .map((name) => `certs/${name}`)
        .sort();
}

function readIgnorePatterns(ignorePath) {
    if (!fileExists(ignorePath)) return [];
    return fs.readFileSync(ignorePath, 'utf8')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'));
}

function patternCoversPath(pattern, relativePath) {
    const normalizedPattern = pattern.replace(/\\/g, '/').replace(/^\//, '');
    const normalizedPath = relativePath.replace(/\\/g, '/');
    if (normalizedPattern === '*.pem') return normalizedPath.toLowerCase().endsWith('.pem');
    if (normalizedPattern === normalizedPath) return true;
    if (normalizedPattern.endsWith('/')) return normalizedPath.startsWith(normalizedPattern);
    if (normalizedPattern.endsWith('/*.pem')) {
        const dir = normalizedPattern.slice(0, -'*.pem'.length);
        return normalizedPath.startsWith(dir) && normalizedPath.toLowerCase().endsWith('.pem');
    }
    return false;
}

function buildPackagingDiagnostics() {
    const cloudignorePath = path.resolve(paymentFunctionDir, '.cloudignore');
    const pemFiles = listPemFilesUnderFunction();
    const patterns = readIgnorePatterns(cloudignorePath);
    const uncovered = pemFiles.filter((relativePath) => {
        return !patterns.some((pattern) => patternCoversPath(pattern, relativePath));
    });
    const runtimeOverridePath = path.resolve(paymentFunctionDir, 'payment.runtime.json');
    const runtimeOverrideIgnored = patterns.some((pattern) => patternCoversPath(pattern, 'payment.runtime.json'));

    return {
        cloudignorePath,
        cloudignorePresent: fileExists(cloudignorePath),
        pemFilesInsideFunction: pemFiles,
        uncoveredPemFilesInsideFunction: uncovered,
        pemFilesCoveredByCloudignore: pemFiles.length > 0 && uncovered.length === 0,
        runtimeOverrideInsideFunction: fileExists(runtimeOverridePath),
        runtimeOverrideIgnored,
        ready: uncovered.length === 0
    };
}

function buildRefundQueryDiagnostics() {
    const missing = [];
    if (!config.wechat.mchid) missing.push('PAYMENT_WECHAT_MCHID');
    if (!config.wechat.serialNo) missing.push('PAYMENT_WECHAT_SERIAL_NO');
    if (!config.wechat.apiV3Key) missing.push('PAYMENT_WECHAT_API_V3_KEY');
    if (!config.wechat.privateKey) missing.push('PAYMENT_WECHAT_PRIVATE_KEY');

    return {
        ready: missing.length === 0,
        missing,
        note: missing.length
            ? '微信退款查询需要商户号、商户证书序列号、API v3 key 和商户私钥。'
            : '微信退款查询配置已具备本地发起条件。'
    };
}

const pemDiagnostics = buildPemDiagnostics();
const packagingDiagnostics = buildPackagingDiagnostics();
const refundQueryDiagnostics = buildRefundQueryDiagnostics();

const output = {
    mode: config.mode,
    provider: config.provider,
    formalConfigured: config.formalConfigured,
    missingFormalKeys: config.missingFormalKeys,
    formalCheckSummary: config.formalCheckSummary,
    expectedFiles: {
        privateKey: toPaymentPath(config.wechat.privateKeyPath, 'certs/apiclient_key.pem'),
        merchantCertificate: toPaymentPath(process.env.PAYMENT_WECHAT_MERCHANT_CERT_PATH, 'certs/apiclient_cert.pem'),
        platformCert: toPaymentPath(config.wechat.platformCertPath, 'certs/wechatpay_platform.pem'),
        publicKey: toPaymentPath(config.wechat.publicKeyPath, 'certs/wechatpay_pubkey.pem')
    },
    checks: {
        localPem: pemDiagnostics,
        formalWechatConfig: {
            ready: config.formalConfigured && !pemDiagnostics.merchantKeyPair.serialMismatch,
            missing: config.missingFormalKeys,
            canDeriveSerialNoFromMerchantCertificate: pemDiagnostics.merchantKeyPair.serialCanBeDerivedFromMerchantCertificate,
            configuredSerialMatchesLocalMerchantCertificate: pemDiagnostics.merchantKeyPair.configuredSerialMatchesMerchantCertificate
        },
        refundQuery: refundQueryDiagnostics,
        deploymentPackaging: packagingDiagnostics
    }
};

console.log(JSON.stringify(output, null, 2));

if (
    (config.mode === 'formal' && (!config.formalConfigured || pemDiagnostics.merchantKeyPair.serialMismatch))
    || !packagingDiagnostics.ready
) {
    process.exitCode = 1;
}
