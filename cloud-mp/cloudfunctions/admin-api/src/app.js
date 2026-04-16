const express = require('express');
const cors = require('cors');
const multer = require('multer');
const Busboy = require('busboy');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const https = require('https');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { createWechatRefund } = require('./payment-refund');
const {
    verifySignature: verifyWechatPaySignature,
    decryptResource: decryptWechatPayResource
} = require('../../payment/wechat-pay-v3');
const orderContract = require('./order-contract');
const userContract = require('./user-contract');
const { createFinanceFirewall } = require('./finance-firewall');
const configContract = require('./config-contract');

const { dataRoot, normalizedDataRoot, runtimeRoot, uploadsRoot, jwtSecret, assetBaseUrl, preferNormalizedData } = require('./config');
const { createDataStore } = require('./store');
const { registerMarketingRoutes } = require('./admin-marketing');

// Express 4 async handler patch: auto-catch rejected promises (Express 5 does this natively)
const Layer = require('express/lib/router/layer');
Layer.prototype.handle_request = function handle_request(req, res, next) {
    const fn = this.handle;
    if (fn.length > 3) return next();
    try {
        const ret = fn(req, res, next);
        if (ret && typeof ret.catch === 'function') {
            ret.catch(next);
        }
    } catch (err) {
        next(err);
    }
};

const app = express();
const dataStore = createDataStore();
let cachedManagedCloud = undefined;
const ADMIN_REPORT_TIME_ZONE = 'Asia/Shanghai';
const ADMIN_DATE_KEY_FORMATTER = new Intl.DateTimeFormat('en-US', {
    timeZone: ADMIN_REPORT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
});

/**
 * 精确直写：直接更新 CloudBase 单条文档，不走全量替换
 * 同时同步内存缓存，兼容 filesystem 模式
 * @param {string} collectionName - 集合名
 * @param {string} docId - 文档 _id
 * @param {object} updateData - 要更新的字段（patch，不覆盖整条文档）
 * @returns {Promise<boolean>} 是否成功
 */
async function directPatchDocument(collectionName, docId, updateData) {
    const db = dataStore._internals?.db;
    if (db) {
        // CloudBase 模式：直接精确更新单条文档
        try {
            const { _id, ...safeUpdateData } = (updateData && typeof updateData === 'object') ? updateData : {};
            await db.collection(collectionName).doc(String(docId)).update({
                data: {
                    ...safeUpdateData,
                    updated_at: new Date().toISOString()
                }
            });
            // 同步内存缓存
            const cache = dataStore._internals?.cache;
            if (cache && cache.has(collectionName)) {
                const rows = cache.get(collectionName) || [];
                const idx = rows.findIndex(r => String(r._id) === String(docId) || String(r.id) === String(docId));
                if (idx !== -1) {
                    rows[idx] = { ...rows[idx], ...safeUpdateData };
                    cache.set(collectionName, rows);
                }
            }
            return true;
        } catch (err) {
            console.error(`[directPatchDocument] ${collectionName}/${docId} 写入失败:`, err.message);
            return false;
        }
    } else {
        // Filesystem 模式：走原有 patchCollectionRow + flush
        return true; // 让上层继续走原逻辑
    }
}

const ADMIN_ROLE_PRESETS = {
    admin: ['dashboard', 'products', 'orders', 'logistics', 'pickup_stations', 'users', 'distribution', 'content', 'materials', 'dealers', 'refunds', 'withdrawals', 'commissions', 'statistics', 'logs', 'settings_manage', 'notification', 'order_amount_adjust', 'order_force_cancel', 'order_force_complete', 'user_balance_adjust', 'user_role_manage', 'user_parent_manage', 'user_status_manage'],
    operator: ['dashboard', 'products', 'orders', 'logistics', 'pickup_stations', 'content', 'materials', 'notification', 'statistics'],
    finance: ['dashboard', 'orders', 'logistics', 'pickup_stations', 'withdrawals', 'commissions', 'statistics'],
    customer_service: ['dashboard', 'orders', 'logistics', 'pickup_stations', 'refunds', 'users', 'notification'],
    warehouse: ['orders', 'logistics', 'pickup_stations'],
    designer: ['content', 'materials']
};
const SUPER_ADMIN_ROLE = 'super_admin';
const PROTECTED_ADMIN_PERMISSIONS = new Set([SUPER_ADMIN_ROLE]);

function ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
}

function readJsonFile(filePath, fallback) {
    try {
        if (!fs.existsSync(filePath)) return fallback;
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (_) {
        return fallback;
    }
}

function writeJsonFile(filePath, value) {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function readJsonlCollection(name) {
    const filePath = path.join(dataRoot, `${name}.json`);
    if (!fs.existsSync(filePath)) return [];
    const text = fs.readFileSync(filePath, 'utf8');
    return text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line));
}

function readJsonArrayCollection(root, name) {
    const filePath = path.join(root, `${name}.json`);
    if (!fs.existsSync(filePath)) return null;
    const parsed = readJsonFile(filePath, null);
    return Array.isArray(parsed) ? parsed : null;
}

function getCollection(name) {
    return dataStore.getCollection(name);
}

function saveCollection(name, rows) {
    return dataStore.saveCollection(name, rows);
}

function getSingleton(name, fallback) {
    return dataStore.getSingleton(name, fallback);
}

function saveSingleton(name, value) {
    return dataStore.saveSingleton(name, value);
}

async function ensureFreshCollections(names = []) {
    if (typeof dataStore.reloadCollections === 'function') {
        await Promise.resolve(dataStore.reloadCollections(names)).catch(() => null);
        return;
    }
    if (typeof dataStore.reloadCollection !== 'function') return;
    await Promise.all(names.map((name) => Promise.resolve(dataStore.reloadCollection(name)).catch(() => null)));
}

function nextId(rows) {
    return rows.reduce((max, row) => {
        const numericId = Number(primaryId(row));
        return Number.isFinite(numericId) ? Math.max(max, numericId) : max;
    }, 0) + 1;
}

function nowIso() {
    return new Date().toISOString();
}

const {
    appendWalletLogEntry,
    appendGoodsFundLogEntry,
    appendPointLogEntry,
    requireManualAdjustmentReason
} = createFinanceFirewall({
    dataStore,
    getCollection,
    saveCollection,
    nextId,
    nowIso,
    pickString
});

function toBoolean(value) {
    if (value === true || value === 1 || value === '1') return true;
    const normalized = pickString(value).trim().toLowerCase();
    if (!normalized) return false;
    return ['true', 'yes', 'y', 'on', 'enabled', 'active', 'on_sale', 'approved', 'online', 'show', 'visible', 'display'].includes(normalized);
}

function normalizeDateValue(value, fallback = '') {
    if (value == null || value === '') return fallback;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
    if (typeof value === 'string') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return new Date(value).toISOString();
    if (typeof value === 'object') {
        const rawDate = value.$date ?? value.value ?? null;
        if (rawDate == null || rawDate === '') return fallback;
        const numeric = Number(rawDate);
        if (Number.isFinite(numeric)) return new Date(numeric).toISOString();
        if (typeof rawDate === 'string') return rawDate;
    }
    return fallback;
}

function getDateKey(value, fallback = '') {
    if (value == null || value === '') return fallback;
    const normalized = normalizeDateValue(value, '');
    const date = new Date(normalized || value);
    if (Number.isNaN(date.getTime())) {
        return typeof normalized === 'string' ? normalized.slice(0, 10) : fallback;
    }
    const parts = ADMIN_DATE_KEY_FORMATTER.formatToParts(date);
    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    const day = parts.find((part) => part.type === 'day')?.value;
    return year && month && day ? `${year}-${month}-${day}` : fallback;
}

function normalizePaymentMethodCode(rawValue) {
    const raw = pickString(rawValue).trim().toLowerCase();
    if (['wechat', 'wx', 'wxpay', 'jsapi', 'miniapp', 'wechatpay', 'wechat_pay', 'weixin'].includes(raw)) return 'wechat';
    if (['goods_fund', 'goods-fund', 'goodsfund'].includes(raw)) return 'goods_fund';
    if (['wallet', 'wallet_balance', 'account_balance', 'balance', 'credit', 'debt'].includes(raw)) return 'wallet';
    return raw;
}

function getPaymentMethodLabel(paymentMethod) {
    return ({
        wechat: '微信支付',
        goods_fund: '货款支付',
        wallet: '余额支付'
    }[normalizePaymentMethodCode(paymentMethod)] || pickString(paymentMethod) || '-');
}

function getRefundRouteMeta(paymentMethod) {
    const normalized = normalizePaymentMethodCode(paymentMethod);
    if (normalized === 'goods_fund') {
        return {
            refund_channel: 'goods_fund',
            refund_target_text: '退回货款余额'
        };
    }
    if (normalized === 'wallet') {
        return {
            refund_channel: 'wallet',
            refund_target_text: '退回账户余额'
        };
    }
    return {
        refund_channel: 'wechat',
        refund_target_text: '原路退回微信支付'
    };
}

function isSupportedRefundPaymentMethod(paymentMethod) {
    return ['wechat', 'goods_fund', 'wallet'].includes(normalizePaymentMethodCode(paymentMethod));
}

function inferRefundResumeOrderStatus(order) {
    if (!order || typeof order !== 'object') return 'paid';
    if (pickString(order.prev_status)) return pickString(order.prev_status);
    if (order.confirmed_at || order.auto_confirmed_at) return 'completed';
    if (order.shipped_at) return 'shipped';
    if (order.paid_at || order.pay_time) return 'paid';
    return 'pending_payment';
}

const ORDER_SHIPPABLE_STATUSES = new Set(['paid', 'agent_confirmed', 'shipping_requested']);

function isGroupOrderLike(order = {}) {
    const sourceOrder = order && typeof order === 'object' ? order : {};
    const firstItem = toArray(sourceOrder.items)[0] || {};
    const orderType = pickString(sourceOrder.type || sourceOrder.order_type || firstItem.activity_type).toLowerCase();
    return orderType === 'group'
        || !!pickString(sourceOrder.group_no)
        || !!pickString(firstItem.group_no)
        || !!pickString(sourceOrder.group_activity_id)
        || !!pickString(firstItem.group_activity_id)
        || !!pickString(sourceOrder.legacy_group_activity_id)
        || !!pickString(firstItem.legacy_group_activity_id);
}

function getEffectiveOrderStatus(orderOrStatus) {
    if (!orderOrStatus || typeof orderOrStatus !== 'object') {
        return pickString(orderOrStatus);
    }
    const rawStatus = pickString(orderOrStatus.status);
    if (rawStatus === 'paid' && isGroupOrderLike(orderOrStatus) && !orderOrStatus.group_completed_at) {
        return 'pending_group';
    }
    return rawStatus;
}

function normalizeAdminPermissionKey(permission) {
    const normalized = pickString(permission).trim();
    return ({
        settlements: 'commissions',
        settings: 'settings_manage',
        system: 'settings_manage'
    }[normalized] || normalized);
}

function normalizePermissionList(rawPermissions, { allowProtected = true } = {}) {
    const permissions = [...new Set(
        toArray(rawPermissions)
            .map((item) => normalizeAdminPermissionKey(item))
            .filter(Boolean)
    )];
    return allowProtected ? permissions : permissions.filter((item) => !PROTECTED_ADMIN_PERMISSIONS.has(item));
}

function getAdminRoleDefinition(roleCode) {
    const normalizedRole = pickString(roleCode).trim();
    if (!normalizedRole) return null;
    const roleRows = getCollection('admin_roles');
    return roleRows.find((item) => {
        return pickString(item.code).trim() === normalizedRole
            || pickString(item.name).trim() === normalizedRole
            || pickString(item._id).trim() === normalizedRole;
    }) || null;
}

function normalizePermissions(admin) {
    const extra = normalizePermissionList(admin.permissions, { allowProtected: false });
    if (pickString(admin.role) === SUPER_ADMIN_ROLE) return ['*'];
    const roleDefinition = getAdminRoleDefinition(admin.role);
    const rolePermissions = normalizePermissionList(roleDefinition?.permissions, { allowProtected: false });
    const presetPermissions = normalizePermissionList(ADMIN_ROLE_PRESETS[admin.role] || [], { allowProtected: false });
    return [...new Set([...(rolePermissions.length ? rolePermissions : presetPermissions), ...extra])];
}

function hasPermission(permissions, required) {
    if (!required) return true;
    if (permissions.includes('*')) return true;
    return permissions.includes(required);
}

function signToken(admin) {
    return jwt.sign(
        { id: admin.id, username: admin.username, role: admin.role },
        jwtSecret,
        { expiresIn: '12h' }
    );
}

function verifyPassword(password, salt, passwordHash) {
    if (!password || !salt || !passwordHash) return false;
    const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return hash === passwordHash;
}

function hashPassword(password, salt) {
    return crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
}

function toNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function roundMoney(v) {
    return Math.round((Number(v) || 0) * 100) / 100;
}

function sanitizeWalletAccountDocId(value) {
    return String(value).replace(/[^a-zA-Z0-9_-]/g, '_');
}

function getWalletAccountUserIds(user = {}) {
    return [...new Set([user.id, user._id, user._legacy_id].filter((value) => value !== null && value !== undefined && value !== ''))];
}

function buildWalletAccountDocId(user = {}) {
    const primary = getWalletAccountUserIds(user)[0] || pickString(user.openid).trim();
    return primary ? `wallet-${sanitizeWalletAccountDocId(primary)}` : '';
}

function findWalletAccountByUser(walletAccounts = [], user = {}) {
    const targets = new Set(getWalletAccountUserIds(user).map((value) => String(value)));
    return walletAccounts.find((account) => targets.has(String(account.user_id))) || null;
}

function toArray(value) {
    if (Array.isArray(value)) return value;
    if (!value) return [];
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
        } catch (_) {
            return value.split(',').map((item) => item.trim()).filter(Boolean);
        }
    }
    return [];
}

function toObject(value, fallback = {}) {
    if (!value) return fallback;
    if (typeof value === 'object' && !Array.isArray(value)) return value;
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return parsed && typeof parsed === 'object' ? parsed : fallback;
        } catch (_) {
            return fallback;
        }
    }
    return fallback;
}

function pickString(value, fallback = '') {
    return value == null ? fallback : String(value);
}

function pickEnvString(keys, fallback = '') {
    for (const key of keys) {
        const value = pickString(process.env[key]).trim();
        if (value) return value;
    }
    return fallback;
}

function resolvePaymentPath(filePath, baseDir) {
    const text = pickString(filePath).trim();
    if (!text) return '';
    if (path.isAbsolute(text)) return text;
    return path.resolve(baseDir, text);
}

function readTextFileMaybe(filePath) {
    if (!filePath) return '';
    try {
        if (!fs.existsSync(filePath)) return '';
        return fs.readFileSync(filePath, 'utf8').trim();
    } catch (_) {
        return '';
    }
}

function readPaymentRuntimeConfig() {
    const filePath = path.resolve(__dirname, '../payment.runtime.json');
    try {
        if (!fs.existsSync(filePath)) return {};
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
        return {};
    }
}

function getPaymentConfigSnapshot() {
    const runtimeConfig = readPaymentRuntimeConfig();
    const paymentEnv = { ...runtimeConfig, ...process.env };
    const baseDir = path.resolve(__dirname, '../../payment');
    const pickPaymentEnv = (keys, fallback = '') => {
        for (const key of keys) {
            const value = pickString(paymentEnv[key]).trim();
            if (value) return value;
        }
        return fallback;
    };
    const privateKeyPath = pickPaymentEnv(['PAYMENT_WECHAT_PRIVATE_KEY_PATH', 'WECHAT_PAY_PRIVATE_KEY_PATH'], 'certs/apiclient_key.pem');
    const platformCertPath = pickPaymentEnv(['PAYMENT_WECHAT_PLATFORM_CERT_PATH', 'WECHAT_PAY_PLATFORM_CERT_PATH'], 'certs/wechatpay_platform.pem');
    const publicKeyPath = pickPaymentEnv(['PAYMENT_WECHAT_PUBLIC_KEY_PATH', 'WECHAT_PAY_PUBLIC_KEY_PATH'], 'certs/wechatpay_pubkey.pem');
    const resolvedPrivateKeyPath = resolvePaymentPath(privateKeyPath, baseDir);
    const resolvedPlatformCertPath = resolvePaymentPath(platformCertPath, baseDir);
    const resolvedPublicKeyPath = resolvePaymentPath(publicKeyPath, baseDir);
    const privateKey = pickPaymentEnv(['PAYMENT_WECHAT_PRIVATE_KEY', 'WECHAT_PAY_PRIVATE_KEY']) || readTextFileMaybe(resolvedPrivateKeyPath);
    const platformCert = pickPaymentEnv(['PAYMENT_WECHAT_PLATFORM_CERT', 'WECHAT_PAY_PLATFORM_CERT']) || readTextFileMaybe(resolvedPlatformCertPath);
    const publicKey = pickPaymentEnv(['PAYMENT_WECHAT_PUBLIC_KEY', 'WECHAT_PAY_PUBLIC_KEY']) || readTextFileMaybe(resolvedPublicKeyPath);
    const mode = pickPaymentEnv(['PAYMENT_MODE'], 'simulation').toLowerCase() || 'simulation';
    const provider = pickPaymentEnv(['PAYMENT_PROVIDER'], 'wechat').toLowerCase() || 'wechat';
    const verifyKeyReady = !!platformCert || !!publicKey;
    const requiredKeys = [
        ['PAYMENT_WECHAT_APPID', !!pickPaymentEnv(['PAYMENT_WECHAT_APPID', 'WECHAT_PAY_APPID'])],
        ['PAYMENT_WECHAT_MCHID', !!pickPaymentEnv(['PAYMENT_WECHAT_MCHID', 'WECHAT_MCH_ID'])],
        ['PAYMENT_WECHAT_NOTIFY_URL', !!pickPaymentEnv(['PAYMENT_WECHAT_NOTIFY_URL', 'WECHAT_PAY_NOTIFY_URL'])],
        ['PAYMENT_WECHAT_SERIAL_NO', !!pickPaymentEnv(['PAYMENT_WECHAT_SERIAL_NO', 'WECHAT_PAY_SERIAL_NO'])],
        ['PAYMENT_WECHAT_API_V3_KEY', !!pickPaymentEnv(['PAYMENT_WECHAT_API_V3_KEY', 'WECHAT_PAY_API_V3_KEY'])],
        ['PAYMENT_WECHAT_PRIVATE_KEY', !!privateKey],
        ['PAYMENT_WECHAT_VERIFY_KEY', verifyKeyReady]
    ];
    const missingFormalKeys = requiredKeys.filter(([, ok]) => !ok).map(([key]) => key);
    return {
        mode,
        provider,
        formalConfigured: missingFormalKeys.length === 0,
        missingFormalKeys,
        checks: {
            PAYMENT_WECHAT_APPID: !!pickPaymentEnv(['PAYMENT_WECHAT_APPID', 'WECHAT_PAY_APPID']),
            PAYMENT_WECHAT_MCHID: !!pickPaymentEnv(['PAYMENT_WECHAT_MCHID', 'WECHAT_MCH_ID']),
            PAYMENT_WECHAT_NOTIFY_URL: !!pickPaymentEnv(['PAYMENT_WECHAT_NOTIFY_URL', 'WECHAT_PAY_NOTIFY_URL']),
            PAYMENT_WECHAT_SERIAL_NO: !!pickPaymentEnv(['PAYMENT_WECHAT_SERIAL_NO', 'WECHAT_PAY_SERIAL_NO']),
            PAYMENT_WECHAT_API_V3_KEY: !!pickPaymentEnv(['PAYMENT_WECHAT_API_V3_KEY', 'WECHAT_PAY_API_V3_KEY']),
            PAYMENT_WECHAT_PRIVATE_KEY: !!privateKey,
            PAYMENT_WECHAT_PLATFORM_CERT: !!platformCert,
            PAYMENT_WECHAT_PUBLIC_KEY: !!publicKey,
            PAYMENT_WECHAT_PUBLIC_KEY_ID: !!pickPaymentEnv(['PAYMENT_WECHAT_PUBLIC_KEY_ID', 'WECHAT_PAY_PUBLIC_KEY_ID']),
            PAYMENT_WECHAT_VERIFY_KEY: verifyKeyReady
        },
        sources: {
            private_key: pickPaymentEnv(['PAYMENT_WECHAT_PRIVATE_KEY', 'WECHAT_PAY_PRIVATE_KEY']) ? 'env-or-runtime' : (privateKey ? 'file' : 'missing'),
            platform_cert: pickPaymentEnv(['PAYMENT_WECHAT_PLATFORM_CERT', 'WECHAT_PAY_PLATFORM_CERT']) ? 'env-or-runtime' : (platformCert ? 'file' : 'missing'),
            public_key: pickPaymentEnv(['PAYMENT_WECHAT_PUBLIC_KEY', 'WECHAT_PAY_PUBLIC_KEY']) ? 'env-or-runtime' : (publicKey ? 'file' : 'missing')
        },
        paths: {
            private_key: resolvedPrivateKeyPath,
            platform_cert: resolvedPlatformCertPath,
            public_key: resolvedPublicKeyPath
        }
    };
}

function getPaymentHealthSnapshot() {
    const snapshot = getPaymentConfigSnapshot();
    const checks = [
        {
            key: 'payment_mode',
            label: '支付运行模式',
            status: snapshot.mode === 'formal' ? 'ok' : 'warning',
            message: `当前模式：${snapshot.mode}`
        },
        {
            key: 'wechat_config',
            label: '微信支付参数',
            status: snapshot.formalConfigured ? 'ok' : 'error',
            message: snapshot.formalConfigured ? '正式支付核心参数已齐全' : `缺少：${snapshot.missingFormalKeys.join(', ')}`
        },
        {
            key: 'private_key_source',
            label: '商户私钥来源',
            status: snapshot.sources.private_key === 'missing' ? 'error' : 'ok',
            message: snapshot.sources.private_key === 'env' ? '私钥来自环境变量' : (snapshot.sources.private_key === 'file' ? `私钥文件：${snapshot.paths.private_key}` : '未发现商户私钥')
        },
        {
            key: 'platform_cert_source',
            label: '回调验签公钥来源',
            status: snapshot.checks.PAYMENT_WECHAT_VERIFY_KEY ? 'ok' : 'error',
            message: snapshot.sources.platform_cert === 'env'
                ? '平台证书来自环境变量'
                : (snapshot.sources.platform_cert === 'file'
                    ? `平台证书文件：${snapshot.paths.platform_cert}`
                    : (snapshot.sources.public_key === 'env'
                        ? '微信支付公钥来自环境变量'
                        : (snapshot.sources.public_key === 'file' ? `微信支付公钥文件：${snapshot.paths.public_key}` : '未发现平台证书或微信支付公钥')))
        }
    ];
    const errors = [];
    const warnings = [];
    if (snapshot.mode !== 'formal') warnings.push(`当前支付模式为 ${snapshot.mode}`);
    if (!snapshot.formalConfigured) errors.push(`缺少正式支付参数：${snapshot.missingFormalKeys.join(', ')}`);
    const status = errors.length ? 'error' : (warnings.length ? 'warning' : 'ok');
    return {
        status,
        summary: status === 'ok' ? '正式支付配置已齐全，已接入真实签名与回调链路。' : (status === 'warning' ? '支付基础配置未切到正式模式。' : '正式支付配置不完整。'),
        checked_at: nowIso(),
        mode: snapshot.mode,
        provider: snapshot.provider,
        checks,
        warnings,
        errors,
        detail: snapshot
    };
}

async function waitForDataStoreReady(timeoutMs = 8000) {
    if (!dataStore?.readyPromise) return;
    await Promise.race([
        Promise.resolve(dataStore.readyPromise),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`数据源初始化超时（>${timeoutMs}ms）`)), timeoutMs))
    ]);
}

function mapProbeStatus(health = {}, probeError = '') {
    if (probeError) return 'error';
    if (health.status === 'error') return 'error';
    if (health.status === 'degraded' || health.status === 'starting') return 'warning';
    return 'ok';
}

async function probeDataStore(options = {}) {
    const startedAt = Date.now();
    const collectionName = pickString(options.collection, 'admins') || 'admins';
    let probeError = '';
    try {
        await waitForDataStoreReady(toNumber(options.timeout_ms, 8000));
        if (options.forceReload !== false) {
            if (typeof dataStore.reloadCollection === 'function') {
                await Promise.resolve(dataStore.reloadCollection(collectionName));
            } else if (typeof dataStore.reloadCollections === 'function') {
                await Promise.resolve(dataStore.reloadCollections([collectionName]));
            }
        }
    } catch (error) {
        probeError = error?.message || '未知错误';
    }

    const latencyMs = Date.now() - startedAt;
    const descriptor = typeof dataStore.describe === 'function' ? dataStore.describe() : {};
    const health = typeof dataStore.cacheHealth === 'function' ? dataStore.cacheHealth() : (typeof dataStore.health === 'function' ? dataStore.health() : {});
    const status = mapProbeStatus(health, probeError);

    return {
        ok: status !== 'error',
        status,
        latency_ms: latencyMs,
        mode: health.mode || descriptor.source || 'unknown',
        source: descriptor.source || health.mode || 'unknown',
        descriptor,
        health,
        error: probeError,
        checked_at: nowIso()
    };
}

function buildCronStatusSnapshot() {
    const cronDefs = [
        { key: 'order-timeout-cancel', label: '超时未支付订单取消', interval: '5m', path: path.resolve(__dirname, '../../order-timeout-cancel/index.js') },
        { key: 'order-auto-confirm', label: '自动确认收货', interval: '1h', path: path.resolve(__dirname, '../../order-auto-confirm/index.js') },
        { key: 'commission-deadline-process', label: '佣金到期处理', interval: '1h', path: path.resolve(__dirname, '../../commission-deadline-process/index.js') }
    ];

    return cronDefs.map((task) => {
        const configured = fs.existsSync(task.path);
        return {
            key: task.key,
            label: task.label,
            interval: task.interval,
            status: configured ? 'unknown' : 'error',
            configured,
            run_count: null,
            error_count: null,
            last_run_at: '',
            last_error: configured ? '未接入任务执行遥测，无法确认最近执行结果' : '本地函数入口不存在'
        };
    });
}

function resolveOperationalStatus(probe = {}) {
    if (probe.status === 'error') return 'unhealthy';
    if (probe.status === 'warning') return 'degraded';
    return 'online';
}

function buildDataSourceRuntimeStatus(probe = {}) {
    const health = probe.health || {};
    const descriptor = probe.descriptor || {};
    return {
        status: resolveOperationalStatus(probe),
        mode: probe.mode || health.mode || descriptor.source || 'unknown',
        source: descriptor.source || health.mode || probe.source || 'unknown',
        latency_ms: probe.latency_ms ?? null,
        checked_at: probe.checked_at || nowIso(),
        ready: health.ready !== false,
        probe_error: probe.error || '',
        collection_source: descriptor.collection_source || '',
        singleton_source: descriptor.singleton_source || '',
        cache_health: health,
        descriptor
    };
}

function buildCronRuntimeStatus(probe = {}) {
    const runtimeStatus = resolveOperationalStatus(probe);
    return {
        status: runtimeStatus,
        checked_at: probe.checked_at || nowIso(),
        probe_error: probe.error || '',
        data_source_mode: probe.mode || probe.health?.mode || '',
        jobs: buildCronStatusSnapshot().map((job) => ({
            ...job,
            runtime_status: runtimeStatus === 'online' ? job.status : 'stale',
            probe_checked_at: probe.checked_at || nowIso(),
            probe_error: probe.error || ''
        }))
    };
}

function assetUrl(value) {
    if (!value) return '';
    if (/^https?:\/\//i.test(value)) return value;
    if (value.startsWith('/uploads') && assetBaseUrl) {
        return `${assetBaseUrl.replace(/\/$/, '')}${value}`;
    }
    return value;
}

function getStorageConfigSnapshot() {
    return getSingleton('storage-config', {
        provider: 'cloudbase',
        bucket: '',
        folder: 'materials',
        mode: 'managed'
    });
}

function getManagedStorageFolder() {
    const configured = pickString(getStorageConfigSnapshot().folder, 'materials')
        .replace(/^\/+/, '')
        .replace(/\/+$/, '');
    return configured || 'materials';
}

function isManagedStorageStrict() {
    return true;
}

function isCloudFileId(value) {
    return /^cloud:\/\//i.test(String(value || ''));
}

function pickAssetRef(source = {}) {
    return pickString(source.file_id || source.image_url || source.url || source.image || source.cover_image || source.coverImage).trim();
}

function getManagedCloud() {
    if (cachedManagedCloud !== undefined) return cachedManagedCloud;
    try {
        const cloud = require('wx-server-sdk');
        cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
        cachedManagedCloud = cloud;
    } catch (_) {
        cachedManagedCloud = null;
    }
    return cachedManagedCloud;
}

async function syncRefundStatusViaPayment(refund = {}) {
    const cloud = getManagedCloud();
    if (!cloud?.callFunction) {
        throw new Error('当前运行环境不支持调用支付云函数');
    }
    const result = await cloud.callFunction({
        name: 'payment',
        data: {
            action: 'syncRefundStatus',
            refund_id: pickString(refund._id || refund.id),
            refund_no: pickString(refund.refund_no)
        }
    });
    const payload = result?.result;
    if (payload?.code && payload.code !== 0) {
        throw new Error(payload.message || '支付云函数同步失败');
    }
    return payload?.data || payload || {};
}

async function resolveManagedFileUrl(fileId) {
    if (!isCloudFileId(fileId)) return assetUrl(fileId);
    const cloud = getManagedCloud();
    if (!cloud?.getTempFileURL) return fileId;
    try {
        const result = await cloud.getTempFileURL({ fileList: [fileId] });
        const file = Array.isArray(result.fileList) ? result.fileList[0] : null;
        return file?.tempFileURL || file?.download_url || fileId;
    } catch (_) {
        return fileId;
    }
}

async function resolveAssetValue(value) {
    if (!value) return '';
    if (isCloudFileId(value)) return resolveManagedFileUrl(value);
    return assetUrl(value);
}

/**
 * 批量解析 URL 数组中的 cloud:// file ID，返回可直接展示的 https URL 数组。
 * 普通 https/本地路径原样处理（走 assetUrl）。
 * CloudBase getTempFileURL 单次最多 50 条，超出时自动分批。
 */
async function batchResolveCloudUrls(urls) {
    if (!urls || !urls.length) return [];
    const cloudIds = [...new Set(urls.filter(isCloudFileId))];
    if (!cloudIds.length) return urls.map(assetUrl);
    const cloud = getManagedCloud();
    if (!cloud?.getTempFileURL) return urls.map(u => isCloudFileId(u) ? u : assetUrl(u));
    const resolved = new Map();
    for (let i = 0; i < cloudIds.length; i += 50) {
        const chunk = cloudIds.slice(i, i + 50);
        const result = await cloud.getTempFileURL({ fileList: chunk }).catch(() => ({ fileList: [] }));
        for (const file of (result.fileList || [])) {
            if (file.fileID) resolved.set(file.fileID, file.tempFileURL || file.download_url || file.fileID);
        }
    }
    return urls.map(u => isCloudFileId(u) ? (resolved.get(u) || u) : assetUrl(u));
}

async function normalizeBannerRecordAsync(banner) {
    const fileId = banner.file_id || '';
    const imageUrl = await resolveAssetValue(pickAssetRef(banner) || fileId);
    const isActive = toBoolean(banner.status ?? banner.is_active ?? 1) ? 1 : 0;
    return {
        ...banner,
        id: banner.id || banner._legacy_id || banner._id,
        file_id: fileId,
        image_url: imageUrl,
        image: imageUrl,
        cover_image: imageUrl,
        url: imageUrl,
        is_active: isActive,
        status: isActive,
        created_at: normalizeDateValue(banner.created_at),
        updated_at: normalizeDateValue(banner.updated_at)
    };
}

async function normalizePopupAdConfigAsync(config) {
    const fileId = config.file_id || '';
    const imageUrl = await resolveAssetValue(pickAssetRef(config) || fileId);
    return {
        enabled: toBoolean(config.enabled),
        title: pickString(config.title),
        file_id: fileId,
        image_url: imageUrl,
        url: imageUrl,
        link_type: pickString(config.link_type),
        link_value: pickString(config.link_value)
    };
}

async function normalizeMaterialRecordAsync(item) {
    const fileId = pickString(item.file_id || '').trim();
    let url;
    if (isCloudFileId(fileId)) {
        // 优先从 cloud:// file_id 重新解析，确保 URL 始终新鲜（不使用已存储的过期 COS 链接）
        url = await resolveManagedFileUrl(fileId);
    } else {
        url = await resolveAssetValue(item.url || item.temp_url || '');
    }
    return {
        ...item,
        id: item.id || item._legacy_id || item._id,
        title: item.title || item.name || '',
        type: item.type || item.usage_type || 'image',
        file_id: fileId,
        url,
        image_url: url,
        temp_url: url
    };
}

async function uploadManagedAsset(file) {
    const cloud = getManagedCloud();
    if (!cloud?.uploadFile) return null;
    const ext = path.extname(file.originalname || '') || '';
    const fileName = `${Date.now()}_${crypto.randomBytes(6).toString('hex')}${ext}`;
    const cloudPath = `${getManagedStorageFolder()}/${new Date().toISOString().slice(0, 10)}/${fileName}`;
    const fileContent = Buffer.isBuffer(file.buffer) ? file.buffer : fs.readFileSync(file.path);
    const uploaded = await cloud.uploadFile({
        cloudPath,
        fileContent
    });
    const fileId = uploaded?.fileID || '';
    if (!fileId) return null;
    const url = await resolveManagedFileUrl(fileId);
    return {
        provider: 'cloudbase',
        file_id: fileId,
        url,
        cloud_path: cloudPath
    };
}

function isRemoteHttpUrl(value) {
    return /^https?:\/\//i.test(pickString(value).trim());
}

function getMaterialMigrationSource(item) {
    const fileId = pickString(item?.file_id).trim();
    const rawUrl = pickString(item?.url || item?.image_url || item?.temp_url).trim();
    if (isCloudFileId(fileId)) return null;
    if (isCloudFileId(rawUrl)) return { kind: 'cloud-id', value: rawUrl };
    if (/^\/(?:uploads)(?:\/|$)/.test(rawUrl)) return { kind: 'local', value: rawUrl };
    if (isRemoteHttpUrl(rawUrl)) return { kind: 'remote', value: rawUrl };
    return null;
}

function getExtensionByMimeType(mimeType) {
    const normalized = pickString(mimeType).split(';')[0].trim().toLowerCase();
    const mapping = {
        'image/jpeg': '.jpg',
        'image/jpg': '.jpg',
        'image/png': '.png',
        'image/webp': '.webp',
        'image/gif': '.gif',
        'image/svg+xml': '.svg',
        'image/bmp': '.bmp',
        'image/x-icon': '.ico',
        'image/vnd.microsoft.icon': '.ico',
        'image/avif': '.avif'
    };
    return mapping[normalized] || '';
}

function getMimeTypeByFilename(fileName) {
    const ext = path.extname(fileName || '').toLowerCase();
    const mapping = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.bmp': 'image/bmp',
        '.ico': 'image/x-icon',
        '.avif': 'image/avif'
    };
    return mapping[ext] || 'application/octet-stream';
}

function getFileNameFromUrl(url, mimeType) {
    try {
        const parsed = new URL(url);
        const baseName = path.basename(decodeURIComponent(parsed.pathname || ''));
        if (baseName && baseName !== '/' && path.extname(baseName)) return baseName;
        const ext = path.extname(baseName || '') || getExtensionByMimeType(mimeType) || '.bin';
        return `${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`;
    } catch (_) {
        const ext = getExtensionByMimeType(mimeType) || '.bin';
        return `${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`;
    }
}

async function downloadRemoteBuffer(url, redirectCount = 0) {
    if (redirectCount > 5) {
        throw new Error('远程文件重定向次数过多');
    }
    return new Promise((resolve, reject) => {
        const transport = /^https:/i.test(url) ? https : http;
        const request = transport.get(url, {
            headers: {
                'User-Agent': 'cloud-mp-admin-migrator/1.0',
                Accept: '*/*'
            }
        }, (response) => {
            const statusCode = Number(response.statusCode || 0);
            if ([301, 302, 303, 307, 308].includes(statusCode) && response.headers.location) {
                response.resume();
                const nextUrl = new URL(response.headers.location, url).toString();
                resolve(downloadRemoteBuffer(nextUrl, redirectCount + 1));
                return;
            }
            if (statusCode < 200 || statusCode >= 300) {
                response.resume();
                reject(new Error(`下载失败，状态码 ${statusCode || 'unknown'}`));
                return;
            }
            const chunks = [];
            let total = 0;
            response.on('data', (chunk) => {
                total += chunk.length;
                if (total > 20 * 1024 * 1024) {
                    request.destroy(new Error('远程文件超过 20MB 限制'));
                    return;
                }
                chunks.push(chunk);
            });
            response.on('end', () => {
                const mimeType = pickString(response.headers['content-type']).split(';')[0].trim() || getMimeTypeByFilename(url);
                resolve({
                    buffer: Buffer.concat(chunks),
                    mimeType,
                    fileName: getFileNameFromUrl(url, mimeType)
                });
            });
        });
        request.setTimeout(15000, () => request.destroy(new Error('下载远程文件超时')));
        request.on('error', reject);
    });
}

async function migrateMaterialAsset(item) {
    const source = getMaterialMigrationSource(item);
    if (!source) {
        return { skipped: true, reason: '该素材无需迁移' };
    }
    if (source.kind === 'cloud-id') {
        return {
            uploaded: {
                provider: 'cloudbase',
                file_id: source.value,
                url: await resolveManagedFileUrl(source.value),
                cloud_path: ''
            },
            source
        };
    }
    if (source.kind === 'local') {
        const rel = source.value.replace(/^\/+/, '');
        const localPath = path.join(uploadsRoot, rel.replace(/^uploads\//, ''));
        if (!fs.existsSync(localPath)) {
            throw new Error('本地文件不存在');
        }
        const buffer = fs.readFileSync(localPath);
        const fileName = path.basename(localPath);
        const file = {
            originalname: fileName,
            mimetype: getMimeTypeByFilename(fileName),
            size: buffer.length,
            buffer
        };
        return {
            uploaded: await uploadManagedAsset(file),
            source,
            localPath
        };
    }
    if (source.kind === 'remote') {
        const remoteFile = await downloadRemoteBuffer(source.value);
        const file = {
            originalname: remoteFile.fileName,
            mimetype: remoteFile.mimeType,
            size: remoteFile.buffer.length,
            buffer: remoteFile.buffer
        };
        return {
            uploaded: await uploadManagedAsset(file),
            source
        };
    }
    throw new Error('暂不支持的迁移来源');
}

function paginate(rows, req) {
    const page = Math.max(1, toNumber(req.query.page || req.body?.page || 1, 1));
    const limit = Math.max(1, Math.min(200, toNumber(req.query.limit || req.body?.limit || 20, 20)));
    const start = (page - 1) * limit;
    const list = rows.slice(start, start + limit);
    return { list, total: rows.length, pagination: { page, limit, total: rows.length } };
}

function createAuditLog(admin, action, target, detail) {
    const rows = getCollection('admin_audit_logs');
    rows.push({
        id: nextId(rows),
        admin_id: admin?.id || null,
        admin_name: admin?.name || admin?.username || 'system',
        action,
        target,
        detail,
        status: 'success',
        created_at: nowIso()
    });
    saveCollection('admin_audit_logs', rows);
}

function getRequestId(req) {
    const headerId = pickString(
        req?.headers?.['x-request-id']
        || req?.headers?.['X-Request-Id']
        || req?.requestId
    ).trim();
    return headerId || crypto.randomUUID();
}

function buildFieldError(field, message, code = 'invalid') {
    return { field, message, code };
}

function ok(res, data, options = {}) {
    res.json({
        code: 0,
        success: true,
        message: options.message || 'ok',
        data,
        request_id: res.req?.requestId || '',
        timestamp: nowIso()
    });
}

function fail(res, message, status = 400, options = {}) {
    const payload = {
        code: status,
        success: false,
        message,
        request_id: res.req?.requestId || '',
        timestamp: nowIso()
    };
    if (options.data !== undefined) payload.data = options.data;
    if (options.field_errors?.length) payload.field_errors = options.field_errors;
    res.status(status).json(payload);
}

function failField(res, field, message, status = 400, code = 'invalid') {
    return fail(res, message, status, {
        field_errors: [buildFieldError(field, message, code)]
    });
}

function failWithFieldErrors(res, fieldErrors = [], message = '提交参数不合法', status = 400) {
    return fail(res, message, status, {
        field_errors: (Array.isArray(fieldErrors) ? fieldErrors : []).filter(Boolean)
    });
}

function toPlainObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function rejectUnknownBodyFields(res, body, allowedFields = [], message = '提交参数不合法') {
    const payload = toPlainObject(body);
    const allowed = new Set(Array.isArray(allowedFields) ? allowedFields : []);
    const unknownFields = Object.keys(payload).filter((field) => !allowed.has(field));
    if (!unknownFields.length) return null;
    const fieldErrors = unknownFields.map((field) => buildFieldError(field, `字段 ${field} 不允许提交`, 'unexpected'));
    failWithFieldErrors(res, fieldErrors, message, 400);
    return fieldErrors;
}

function requireNumberField(value, field, label, options = {}) {
    const { min = null, max = null, integer = false, required = true } = options;
    const raw = value === undefined || value === null || value === '' ? null : Number(value);
    if (raw === null) {
        return required
            ? { ok: false, error: buildFieldError(field, `请填写${label}`, 'required') }
            : { ok: true, value: null };
    }
    if (!Number.isFinite(raw)) {
        return { ok: false, error: buildFieldError(field, `${label}必须是有效数字`, 'invalid_number') };
    }
    if (integer && !Number.isInteger(raw)) {
        return { ok: false, error: buildFieldError(field, `${label}必须是整数`, 'invalid_integer') };
    }
    if (min !== null && raw < min) {
        return { ok: false, error: buildFieldError(field, `${label}不能小于 ${min}`, 'out_of_range') };
    }
    if (max !== null && raw > max) {
        return { ok: false, error: buildFieldError(field, `${label}不能大于 ${max}`, 'out_of_range') };
    }
    return { ok: true, value: raw };
}

function requireEnumField(value, field, label, candidates = [], options = {}) {
    const { required = true } = options;
    const normalized = pickString(value).trim();
    if (!normalized) {
        return required
            ? { ok: false, error: buildFieldError(field, `请填写${label}`, 'required') }
            : { ok: true, value: '' };
    }
    if (!candidates.includes(normalized)) {
        return { ok: false, error: buildFieldError(field, `${label}仅支持：${candidates.join(' / ')}`, 'invalid_enum') };
    }
    return { ok: true, value: normalized };
}

function requireNonEmptyStringField(value, field, label, options = {}) {
    const { maxLength = 200, minLength = 1, required = true } = options;
    const normalized = pickString(value).trim();
    if (!normalized) {
        return required
            ? { ok: false, error: buildFieldError(field, `请填写${label}`, 'required') }
            : { ok: true, value: '' };
    }
    if (normalized.length < minLength) {
        return { ok: false, error: buildFieldError(field, `${label}长度不能少于 ${minLength} 个字符`, 'too_short') };
    }
    if (normalized.length > maxLength) {
        return { ok: false, error: buildFieldError(field, `${label}长度不能超过 ${maxLength} 个字符`, 'too_long') };
    }
    return { ok: true, value: normalized };
}

function isValidHttpUrl(value) {
    const raw = pickString(value).trim();
    if (!raw) return false;
    try {
        const url = new URL(raw);
        return ['http:', 'https:'].includes(url.protocol);
    } catch (_) {
        return false;
    }
}

function getHeaderValue(headers = {}, name) {
    if (!headers || typeof headers !== 'object') return '';
    const target = String(name || '').toLowerCase();
    const hit = Object.entries(headers).find(([key]) => String(key).toLowerCase() === target);
    return pickString(hit?.[1]);
}

function getRawRequestBody(req) {
    if (typeof req?.rawBody === 'string') return req.rawBody;
    if (typeof req?.event?.body === 'string') return req.event.body;
    if (typeof req?.body === 'string') return req.body;
    if (req?.body && typeof req.body === 'object') {
        try {
            return JSON.stringify(req.body);
        } catch (_) {
            return '';
        }
    }
    return '';
}

function readPaymentVerifyKeyInfo() {
    const runtimeConfig = readPaymentRuntimeConfig();
    const paymentEnv = { ...runtimeConfig, ...process.env };
    const baseDir = path.resolve(__dirname, '../../payment');
    const pickPaymentEnv = (keys, fallback = '') => {
        for (const key of keys) {
            const value = pickString(paymentEnv[key]).trim();
            if (value) return value;
        }
        return fallback;
    };
    const platformCertPath = pickPaymentEnv(['PAYMENT_WECHAT_PLATFORM_CERT_PATH', 'WECHAT_PAY_PLATFORM_CERT_PATH'], 'certs/wechatpay_platform.pem');
    const publicKeyPath = pickPaymentEnv(['PAYMENT_WECHAT_PUBLIC_KEY_PATH', 'WECHAT_PAY_PUBLIC_KEY_PATH'], 'certs/wechatpay_pubkey.pem');
    const resolvedPlatformCertPath = resolvePaymentPath(platformCertPath, baseDir);
    const resolvedPublicKeyPath = resolvePaymentPath(publicKeyPath, baseDir);
    const envPlatformCert = pickPaymentEnv(['PAYMENT_WECHAT_PLATFORM_CERT', 'WECHAT_PAY_PLATFORM_CERT']);
    if (envPlatformCert) {
        return { key: envPlatformCert, source: 'env:platform_cert', path: '' };
    }
    const envPublicKey = pickPaymentEnv(['PAYMENT_WECHAT_PUBLIC_KEY', 'WECHAT_PAY_PUBLIC_KEY']);
    if (envPublicKey) {
        return { key: envPublicKey, source: 'env:public_key', path: '' };
    }
    const filePlatformCert = readTextFileMaybe(resolvedPlatformCertPath);
    if (filePlatformCert) {
        return { key: filePlatformCert, source: 'file:platform_cert', path: resolvedPlatformCertPath };
    }
    const filePublicKey = readTextFileMaybe(resolvedPublicKeyPath);
    if (filePublicKey) {
        return { key: filePublicKey, source: 'file:public_key', path: resolvedPublicKeyPath };
    }
    return { key: '', source: 'missing', path: '' };
}

function readPaymentVerifyKey() {
    return readPaymentVerifyKeyInfo().key;
}

async function verifyRefundNotifyRequest(req) {
    const headers = req?.headers || req?.event?.headers || {};
    const rawBody = getRawRequestBody(req);
    const wxTimestamp = getHeaderValue(headers, 'wechatpay-timestamp');
    const wxNonce = getHeaderValue(headers, 'wechatpay-nonce');
    const wxSignature = getHeaderValue(headers, 'wechatpay-signature');
    const wxSerial = getHeaderValue(headers, 'wechatpay-serial');
    const requestAgeSeconds = Math.abs(Math.floor(Date.now() / 1000) - Number(wxTimestamp || 0));

    if (!rawBody) {
        return { ok: false, status: 400, message: '微信退款回调缺少请求体' };
    }
    if (!wxTimestamp || !wxNonce || !wxSignature || !wxSerial) {
        return { ok: false, status: 400, message: '微信退款回调缺少签名头或证书序列号' };
    }
    if (!Number.isFinite(Number(wxTimestamp)) || requestAgeSeconds > 300) {
        return { ok: false, status: 401, message: '微信退款回调时间戳无效或已过期' };
    }

    let callbackData;
    try {
        callbackData = JSON.parse(rawBody);
    } catch (_) {
        return { ok: false, status: 400, message: '微信退款回调请求体不是合法 JSON' };
    }

    const verifyKeyInfo = readPaymentVerifyKeyInfo();
    const verifyKey = verifyKeyInfo.key;
    if (!verifyKey) {
        return { ok: false, status: 503, message: '当前环境缺少微信支付回调验签公钥或平台证书' };
    }

    try {
        const isValid = verifyWechatPaySignature(wxTimestamp, wxNonce, rawBody, wxSignature, verifyKey);
        if (!isValid) {
            return { ok: false, status: 401, message: '微信退款回调验签失败' };
        }
    } catch (error) {
        return { ok: false, status: 401, message: `微信退款回调验签异常：${error.message || '未知错误'}` };
    }

    let refundData = callbackData;
    if (callbackData.resource?.ciphertext) {
        if (!callbackData.resource.nonce) {
            return { ok: false, status: 400, message: '微信退款回调密文缺少 nonce' };
        }
        try {
            refundData = decryptWechatPayResource(
                callbackData.resource.ciphertext,
                callbackData.resource.nonce,
                callbackData.resource.associated_data || 'refund'
            );
        } catch (error) {
            return { ok: false, status: 400, message: `微信退款回调解密失败：${error.message || '未知错误'}` };
        }
    }

    return {
        ok: true,
        callbackData,
        refundData,
        eventType: pickString(callbackData.event_type || '').toUpperCase(),
        serial: wxSerial,
        verify_key_source: verifyKeyInfo.source,
        verify_key_path: verifyKeyInfo.path
    };
}

function auth(req, res, next) {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) return fail(res, '未提供认证令牌', 401);
    try {
        const payload = jwt.verify(header.slice(7), jwtSecret);
        const admin = getCollection('admins').find((item) =>
            (Number(item.id || item._legacy_id) === Number(payload.id)) && toBoolean(item.status)
        );
        if (!admin) return fail(res, '管理员不存在或已禁用', 401);
        req.admin = admin;
        req.permissions = normalizePermissions(admin);
        next();
    } catch (_) {
        return fail(res, '登录已过期，请重新登录', 401);
    }
}

function requirePermission(permission) {
    return (req, res, next) => {
        if (!hasPermission(req.permissions || [], permission)) {
            return fail(res, '没有权限访问该资源', 403);
        }
        next();
    };
}

function normalizeCollectionNames(names = []) {
    return [...new Set((Array.isArray(names) ? names : []).map((name) => pickString(name).trim()).filter(Boolean))];
}

function shouldFreshRead(req, defaultFresh = false) {
    const raw = pickString(req?.query?.fresh_read).trim().toLowerCase();
    if (!raw) return defaultFresh;
    if (['1', 'true', 'yes', 'on', 'fresh'].includes(raw)) return true;
    if (['0', 'false', 'no', 'off', 'cache'].includes(raw)) return false;
    return defaultFresh;
}

async function reloadCollectionsWithMeta(names = []) {
    const normalized = normalizeCollectionNames(names);
    if (!normalized.length) {
        return {
            reloaded_collections: [],
            read_at: nowIso()
        };
    }
    await ensureFreshCollections(normalized);
    return {
        reloaded_collections: normalized,
        read_at: nowIso()
    };
}

async function freshReadMeta(req, names = [], defaultFresh = false) {
    const fresh = shouldFreshRead(req, defaultFresh);
    if (!fresh) {
        return {
            reloaded_collections: [],
            freshness: {
                read_mode: 'cache',
                read_at: nowIso()
            }
        };
    }
    const reloadMeta = await reloadCollectionsWithMeta(names);
    return {
        reloaded_collections: reloadMeta.reloaded_collections,
        freshness: {
            read_mode: 'fresh',
            read_at: reloadMeta.read_at
        }
    };
}

function attachFreshness(payload, freshness) {
    if (!freshness) return payload;
    if (Array.isArray(payload)) {
        return {
            list: payload,
            freshness
        };
    }
    if (payload && typeof payload === 'object') {
        return {
            ...payload,
            freshness
        };
    }
    return {
        value: payload,
        freshness
    };
}

function okStrongRead(res, payload, freshness) {
    return ok(res, attachFreshness(payload, freshness));
}

function okStrongWrite(res, payload, options = {}) {
    return ok(res, {
        data: payload,
        write_result: {
            persisted: options.persisted !== false,
            reloaded_collections: normalizeCollectionNames(options.reloaded_collections),
            fallbacks_used: Array.isArray(options.fallbacks_used) ? options.fallbacks_used : []
        },
        freshness: {
            read_mode: 'fresh',
            read_at: options.read_at || nowIso()
        }
    });
}

const STRONG_CONSISTENCY_COLLECTIONS = {
    orders: ['orders', 'users', 'products', 'commissions', 'refunds'],
    refunds: ['refunds', 'orders', 'users', 'products', 'skus'],
    withdrawals: ['withdrawals', 'users'],
    commissions: ['commissions', 'users', 'orders'],
    users: ['users', 'orders', 'commissions']
};

function parseAddressSnapshot(value) {
    if (!value) return null;
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch (_) {
        return null;
    }
}

function sortByUpdatedDesc(rows) {
    return [...rows].sort((a, b) => {
        const left = new Date(normalizeDateValue(a.updated_at || a.created_at, 0) || 0).getTime();
        const right = new Date(normalizeDateValue(b.updated_at || b.created_at, 0) || 0).getTime();
        return right - left;
    });
}

function productWithRelations(product, categories, skus, reviews) {
    const productId = Number(product.id || product._legacy_id || product._id || 0);
    // 分类关联：同时支持数字 id 和 CloudBase UUID _id（用字符串比较兜底）
    const catId = product.category_id != null ? String(product.category_id) : null;
    const category = catId
        ? categories.find((item) => {
            const cid = item.id ?? item._legacy_id ?? item._id;
            return cid != null && String(cid) === catId;
        }) || null
        : null;
    const productSkus = skus.filter((item) => Number(item.product_id) === productId);
    const productReviews = reviews.filter((item) => Number(item.product_id) === productId);

    // 生成规格摘要
    let specSummary = '';
    if (productSkus.length > 0) {
        const specMap = {};
        productSkus.forEach((sku) => {
            const specs = Array.isArray(sku.specs) && sku.specs.length > 0
                ? sku.specs
                : (sku.spec_name && sku.spec_value ? [{ name: sku.spec_name, value: sku.spec_value }] : []);
            specs.forEach((s) => {
                if (s.name && s.value) {
                    if (!specMap[s.name]) specMap[s.name] = new Set();
                    specMap[s.name].add(s.value);
                }
            });
        });
        specSummary = Object.keys(specMap).map((name) => Array.from(specMap[name]).join('/')).join(' · ');
    }

    return {
        ...product,
        id: productId || product.id || product._legacy_id || product._id,
        status: toBoolean(product.status) ? 1 : 0,
        images: Array.isArray(product.images) ? product.images : [],
        detail_images: Array.isArray(product.detail_images) ? product.detail_images : [],
        category,
        skus: productSkus.map((sku) => ({
            ...sku,
            id: sku.id || sku._legacy_id || sku._id,
            specs: Array.isArray(sku.specs) && sku.specs.length > 0 ? sku.specs : (sku.spec_name && sku.spec_value ? [{ name: sku.spec_name, value: sku.spec_value }] : [])
        })),
        specSummary,
        review_count: productReviews.length
    };
}

function normalizeBannerRecord(banner) {
    const fileId = banner.file_id || '';
    const imageUrl = assetUrl(pickAssetRef(banner) || fileId);
    const isActive = toBoolean(banner.status ?? banner.is_active ?? 1) ? 1 : 0;
    return {
        ...banner,
        id: banner.id || banner._legacy_id || banner._id,
        file_id: fileId,
        image_url: imageUrl,
        image: imageUrl,
        cover_image: imageUrl,
        url: imageUrl,
        is_active: isActive,
        status: isActive,
        created_at: normalizeDateValue(banner.created_at),
        updated_at: normalizeDateValue(banner.updated_at)
    };
}

function normalizePopupAdConfig(config) {
    const fileId = config.file_id || '';
    const imageUrl = assetUrl(pickAssetRef(config) || fileId);
    return {
        enabled: toBoolean(config.enabled),
        title: pickString(config.title),
        file_id: fileId,
        image_url: imageUrl,
        url: imageUrl,
        link_type: pickString(config.link_type),
        link_value: pickString(config.link_value)
    };
}

function getMiniProgramDefault() {
    return configContract.normalizeMiniProgramConfig({});
}

function getMiniProgramConfigSnapshot() {
    const configRows = getCollection('configs');
    const appConfigs = getCollection('app_configs');
    const fromConfigs = configRows.find((item) => item.config_key === 'mini_program_config' || item.key === 'mini_program_config');
    const fromConfigRow = appConfigs.find((item) => item.config_key === 'mini_program_config');
    const fallback = fromConfigs && typeof (fromConfigs.config_value ?? fromConfigs.value) === 'object'
        ? (fromConfigs.config_value ?? fromConfigs.value)
        : (fromConfigRow && typeof fromConfigRow.config_value === 'object'
            ? fromConfigRow.config_value
            : getMiniProgramDefault());
    return configContract.normalizeMiniProgramConfig(getSingleton('mini-program-config', fallback));
}

function getSettingsSnapshot() {
    const configs = getCollection('configs');
    const grouped = {
        COMMISSION: { COMMISSION_RATE: 10 },
        WITHDRAWAL: { MIN_AMOUNT: 100 },
        ORDER: { AUTO_CANCEL_MINUTES: 30, AUTO_CONFIRM_DAYS: 7 },
        USER: { DEFAULT_AVATAR_URL: '/admin/assets/images/default-avatar.svg', IDLE_GUEST_PURGE_DAYS: 7 }
    };
    for (const row of configs) {
        const group = row.config_group || row.category || 'SYSTEM';
        let value = row.config_value;
        if (typeof value === 'string') {
            try {
                value = JSON.parse(value);
            } catch (_) {
                if (row.config_type === 'number') value = Number(value);
                else if (row.config_type === 'boolean') value = value === 'true' || value === '1';
            }
        }
        if (!grouped[group]) grouped[group] = {};
        grouped[group][row.config_key] = value;
    }
    return getSingleton('settings', grouped);
}

function normalizeOrderStatusGroup(status) {
    const effectiveStatus = getEffectiveOrderStatus(status);
    if (effectiveStatus === 'pending' || effectiveStatus === 'pending_payment') return 'pending_pay';
    if (effectiveStatus === 'pending_group') return 'pending_group';
    if (effectiveStatus === 'pending_ship') return 'pending_ship';
    if (['paid', 'agent_confirmed', 'shipping_requested'].includes(effectiveStatus)) return 'pending_ship';
    if (effectiveStatus === 'shipped') return 'pending_receive';
    if (effectiveStatus === 'completed') return 'completed';
    if (['cancelled', 'refunded'].includes(effectiveStatus)) return 'closed';
    return 'all';
}

function buildOrderRecord(order, users, products, commissions) {
    const orderLookupId = primaryId(order) || order.order_no || '';
    const buyer = findUserByAnyId(users, order.openid)
        || findUserByAnyId(users, order.buyer_id)
        || findUserByAnyId(users, order.user_id)
        || null;
    const directReferrer = findUserByAnyId(users, order.direct_referrer_openid || getUserParentRef(buyer));
    const indirectReferrer = findUserByAnyId(users, order.indirect_referrer_openid || getUserParentRef(directReferrer));
    const nearestAgent = findUserByAnyId(users, order.nearest_agent_openid || order.fulfillment_partner_openid);
    const fulfillmentPartner = findUserByAnyId(users, order.fulfillment_partner_openid || order.nearest_agent_openid);
    const pickupVerifier = findUserByAnyId(users, order.pickup_verified_by);
    const orderItems = toArray(order.items);
    const primaryItem = orderItems[0] || null;
    const product = findByLookup(products, order.product_id ?? primaryItem?.product_id) || null;
    const orderCommissions = commissions.filter((item) =>
        rowMatchesLookup(item, orderLookupId, [item.order_id, item.order_no, order.order_no])
    );
    const normalizedItems = (orderItems.length ? orderItems : [{
        product_id: order.product_id,
        qty: order.qty ?? order.quantity ?? 1,
        unit_price: order.unit_price ?? order.price ?? order.total_amount,
        item_amount: order.total_amount,
        snapshot_name: order.product_name,
        snapshot_spec: order.sku?.spec_value || '',
        snapshot_image: toArray(order.product?.images)[0] || ''
    }]).map((item) => {
        const linkedProduct = findByLookup(products, item.product_id) || product || null;
        const productImages = toArray(linkedProduct?.images).map(assetUrl);
        const qty = Math.max(1, toNumber(item.qty ?? item.quantity, 1));
        const unitPrice = toNumber(item.unit_price ?? item.price ?? item.sale_price ?? item.item_amount ?? 0, 0);
        const itemAmount = toNumber(item.item_amount ?? (unitPrice * qty), 0);
        return {
            ...item,
            qty,
            quantity: qty,
            unit_price: unitPrice,
            item_amount: itemAmount,
            snapshot_name: pickString(item.snapshot_name || linkedProduct?.name || order.product_name || '未命名商品'),
            snapshot_spec: pickString(item.snapshot_spec || item.spec_value || item.spec || order.sku?.spec_value || ''),
            snapshot_image: assetUrl(item.snapshot_image || productImages[0] || ''),
            product_id: primaryId(linkedProduct) || item.product_id || order.product_id || ''
        };
    });
    const totalQty = normalizedItems.reduce((sum, item) => sum + toNumber(item.qty, 0), 0) || Math.max(1, toNumber(order.qty ?? order.quantity, 1));
    const productImages = product ? toArray(product.images).map(assetUrl) : [];
    const paymentMethod = normalizePaymentMethodCode(order.payment_method || order.pay_type || order.pay_channel || order.payment_channel);
    const canonicalPayAmount = toNumber(order.pay_amount ?? order.actual_price ?? order.total_amount, 0);
    const normalizedBuyer = buyer ? {
        ...buyer,
        id: primaryId(buyer),
        nickName: getUserNickname(buyer),
        nickname: getUserNickname(buyer),
        avatarUrl: getUserAvatar(buyer),
        avatar_url: getUserAvatar(buyer),
        phone: pickString(buyer.phone),
        member_no: pickString(buyer.member_no || buyer.my_invite_code || buyer.invite_code),
        invite_code: pickString(buyer.my_invite_code || buyer.invite_code || buyer.member_no),
        role_level: getUserRoleLevel(buyer),
        parent_id: getUserParentRef(buyer)
    } : null;
    const normalizedDirectReferrer = buildUserRelationSummary(directReferrer);
    const normalizedIndirectReferrer = buildUserRelationSummary(indirectReferrer);
    const normalizedNearestAgent = buildUserRelationSummary(nearestAgent);
    const normalizedFulfillmentPartner = buildUserRelationSummary(fulfillmentPartner);
    const normalizedProduct = {
        ...(product || {}),
        id: product ? primaryId(product) : (primaryItem?.product_id || order.product_id || ''),
        name: pickString(product?.name || primaryItem?.snapshot_name || order.product_name || '未命名商品'),
        images: (productImages.length ? productImages : [assetUrl(primaryItem?.snapshot_image || '')]).filter(Boolean)
    };
    return {
        ...order,
        id: orderLookupId,
        display_id: buildDisplayId(order, orderLookupId),
        openid: pickString(order.openid),
        raw_status: pickString(order.status),
        status: getEffectiveOrderStatus(order),
        status_group: orderContract.normalizeOrderStatusGroup(getEffectiveOrderStatus(order)),
        status_text: orderContract.getOrderStatusText(getEffectiveOrderStatus(order)),
        status_desc: orderContract.getOrderStatusDesc(getEffectiveOrderStatus(order)),
        buyer: normalizedBuyer,
        product: normalizedProduct,
        items: normalizedItems,
        qty: totalQty,
        quantity: totalQty,
        sku: {
            spec_name: '规格',
            spec_value: pickString(primaryItem?.snapshot_spec || order.sku?.spec_value || '')
        },
        total_amount: toNumber(order.total_amount ?? canonicalPayAmount, 0),
        pay_amount: canonicalPayAmount,
        actual_price: canonicalPayAmount,
        payment_method: paymentMethod,
        payment_method_text: orderContract.getPaymentMethodText(paymentMethod),
        refund_target_text: orderContract.getRefundTargetText(paymentMethod),
        address: parseAddressSnapshot(order.address_snapshot),
        address_snapshot: parseAddressSnapshot(order.address_snapshot),
        pickup_station: order.pickupStation || order.pickup_station || null,
        direct_referrer_id: order.direct_referrer_id || normalizedDirectReferrer?.id || '',
        direct_referrer_openid: order.direct_referrer_openid || normalizedDirectReferrer?.openid || '',
        direct_referrer_role_level: toNumber(order.direct_referrer_role_level, normalizedDirectReferrer?.role_level || 0),
        indirect_referrer_id: order.indirect_referrer_id || normalizedIndirectReferrer?.id || '',
        indirect_referrer_openid: order.indirect_referrer_openid || normalizedIndirectReferrer?.openid || '',
        indirect_referrer_role_level: toNumber(order.indirect_referrer_role_level, normalizedIndirectReferrer?.role_level || 0),
        nearest_agent_id: order.nearest_agent_id || normalizedNearestAgent?.id || '',
        nearest_agent_openid: order.nearest_agent_openid || normalizedNearestAgent?.openid || '',
        nearest_agent_role_level: toNumber(order.nearest_agent_role_level, normalizedNearestAgent?.role_level || 0),
        fulfillment_partner_id: order.fulfillment_partner_id || normalizedFulfillmentPartner?.id || '',
        fulfillment_partner_openid: order.fulfillment_partner_openid || normalizedFulfillmentPartner?.openid || '',
        fulfillment_partner_role_level: toNumber(order.fulfillment_partner_role_level, normalizedFulfillmentPartner?.role_level || 0),
        direct_referrer: normalizedDirectReferrer,
        indirect_referrer: normalizedIndirectReferrer,
        nearest_agent: normalizedNearestAgent,
        distributor: normalizedDirectReferrer,
        agent: normalizedFulfillmentPartner,
        agent_info: normalizedFulfillmentPartner,
        agent_id: order.agent_id || order.nearest_agent_id || normalizedNearestAgent?.id || '',
        pickup_verified_by: pickString(order.pickup_verified_by),
        pickup_verified_station_id: pickString(order.pickup_verified_station_id),
        pickup_verified_user: buildUserRelationSummary(pickupVerifier),
        locked_agent_cost: toNumber(order.locked_agent_cost_total ?? order.locked_agent_cost, 0),
        middle_commission_total: toNumber(
            order.middle_commission_total,
            orderCommissions
                .filter((item) => pickString(item.type).toLowerCase() === 'agent_fulfillment')
                .reduce((sum, item) => sum + toNumber(item.amount, 0), 0)
        ),
        commissions: orderCommissions
    };
}

function patchOrder(id, patcher) {
    return patchCollectionRow('orders', id, patcher);
}

function primaryId(row) {
    return row?.id ?? row?._legacy_id ?? row?._id ?? null;
}

function buildDisplayId(row, fallback = '') {
    const legacyId = row?._legacy_id;
    if (legacyId !== null && legacyId !== undefined && legacyId !== '') return String(legacyId);

    const rawId = row?.id;
    if (rawId !== null && rawId !== undefined && rawId !== '' && /^\d+$/.test(String(rawId))) {
        return String(rawId);
    }

    return pickString(row?._id || rawId || fallback);
}

function valueTokens(value) {
    if (value == null || value === '') return [];
    const raw = String(value).trim();
    if (!raw) return [];
    const tokens = new Set([raw]);
    const numeric = Number(raw);
    if (Number.isFinite(numeric)) {
        tokens.add(String(numeric));
    }
    return [...tokens];
}

function rowLookupTokens(row, extraValues = []) {
    const values = [
        primaryId(row),
        row?._id,
        row?.openid,
        row?.user_id,
        row?.buyer_id,
        row?.order_id,
        row?.order_no,
        row?.member_no,
        row?.my_invite_code,
        row?.invite_code,
        ...extraValues
    ];
    return [...new Set(values.flatMap((item) => valueTokens(item)))];
}

function rowMatchesLookup(row, value, extraValues = []) {
    const targets = valueTokens(value);
    if (!targets.length) return false;
    const tokens = rowLookupTokens(row, extraValues);
    return targets.some((token) => tokens.includes(token));
}

function findByLookup(rows, value, extraValuesGetter) {
    if (value == null || value === '') return null;
    return rows.find((row) => rowMatchesLookup(row, value, typeof extraValuesGetter === 'function' ? extraValuesGetter(row) : [])) || null;
}

function patchCollectionRow(name, id, patcher) {
    const rows = getCollection(name);
    const index = rows.findIndex((item) => rowMatchesLookup(item, id));
    if (index === -1) return null;
    rows[index] = patcher(rows[index]);
    saveCollection(name, rows);
    return rows[index];
}

function getUserNickname(user) {
    return pickString(user?.virtual_display_name || user?.nickname || user?.nickName || user?.name || '微信用户');
}

function getUserAvatar(user) {
    return assetUrl(user?.avatar_url || user?.avatarUrl || user?.avatar || user?.headimgurl || '');
}

function buildReviewRecord(review, users = [], products = [], orders = []) {
    const product = findByLookup(products, review?.product_id);
    const user = findUserByAnyId(users, review?.user_id ?? review?.openid);
    const order = findByLookup(orders, review?.order_id);
    const productImages = toArray(product?.images).map(assetUrl);
    const productImage = productImages[0] || assetUrl(product?.image || product?.cover_image || '');
    const userNickname = getUserNickname(user) || '用户';
    const userAvatar = getUserAvatar(user);

    return {
        ...review,
        id: primaryId(review),
        status: toBoolean(review?.status ?? 1) ? 1 : 0,
        is_featured: toBoolean(review?.is_featured ?? review?.featured ?? 0) ? 1 : 0,
        reply_content: pickString(review?.reply_content || review?.reply || ''),
        rating: toNumber(review?.rating, 5),
        content: pickString(review?.content),
        images: toArray(review?.images).map(assetUrl),
        created_at: normalizeDateValue(review?.created_at),
        updated_at: normalizeDateValue(review?.updated_at),
        user_id: primaryId(user) || review?.user_id || review?.openid || null,
        nickname: userNickname,
        avatar_url: userAvatar,
        user: {
            id: primaryId(user) || review?.user_id || review?.openid || null,
            nickname: userNickname,
            name: userNickname,
            avatar_url: userAvatar,
            avatar: userAvatar,
            phone: pickString(user?.phone),
            openid: pickString(user?.openid)
        },
        product_id: primaryId(product) || review?.product_id || null,
        product_name: pickString(product?.name || '商品'),
        product_image: productImage,
        product: {
            id: primaryId(product) || review?.product_id || null,
            name: pickString(product?.name || '商品'),
            image: productImage,
            cover_image: productImage,
            images: productImages,
            status: toBoolean(product?.status ?? 1) ? 1 : 0
        },
        order_id: primaryId(order) || review?.order_id || null,
        order_no: pickString(order?.order_no || review?.order_no),
        order: order ? {
            id: primaryId(order),
            order_no: pickString(order.order_no),
            status: pickString(order.status)
        } : null
    };
}

function buildProductSummaryRecord(product, fallback = {}) {
    if (!product && !fallback) return null;
    const source = product || {};
    const images = toArray(source.images).map(assetUrl).filter(Boolean);
    const coverImage = assetUrl(
        source.cover_image
        || source.image_url
        || source.image
        || images[0]
        || fallback.image
        || fallback.snapshot_image
        || ''
    );
    const name = pickString(
        source.name
        || source.title
        || fallback.name
        || fallback.snapshot_name
        || fallback.product_name
        || '未命名商品'
    );
    return {
        ...source,
        id: primaryId(source) || fallback.product_id || '',
        _id: source._id || fallback.product_id || '',
        name,
        title: name,
        image: coverImage,
        image_url: coverImage,
        cover_image: coverImage,
        images: images.length ? images : (coverImage ? [coverImage] : []),
        retail_price: toNumber(source.retail_price ?? source.price ?? fallback.price, 0)
    };
}

function getUserParentRef(user) {
    return user?.parent_id
        ?? user?.parent_user_id
        ?? user?.parent_openid
        ?? user?.referrer_id
        ?? user?.referrer_openid
        ?? user?.inviter_id
        ?? user?.inviter_openid
        ?? null;
}

function getUserRoleLevel(user = {}) {
    return toNumber(user.role_level ?? user.distributor_level ?? user.level, 0);
}

function normalizeAgentRoleLevel(roleLevel) {
    const normalized = toNumber(roleLevel, 0);
    if (normalized >= 5) return 5;
    if (normalized === 4) return 4;
    if (normalized === 3) return 3;
    return 0;
}

function resolveSupplyPriceByRole(product = {}, roleLevel = 0) {
    const normalizedRole = normalizeAgentRoleLevel(roleLevel);
    if (!normalizedRole) return null;
    const fieldName = `supply_price_b${normalizedRole === 5 ? 3 : normalizedRole}`;
    const amount = toNumber(product?.[fieldName], NaN);
    return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function buildUserRelationSummary(user = {}) {
    if (!user || typeof user !== 'object') return null;
    return {
        id: primaryId(user) || '',
        openid: pickString(user.openid),
        nickname: getUserNickname(user),
        avatar: getUserAvatar(user),
        role_level: getUserRoleLevel(user)
    };
}

function getUserStatus(user) {
    if (user?.status == null || user?.status === '') return 1;
    return toBoolean(user.status) ? 1 : 0;
}

function buildUserLookupExtras(user = {}) {
    return [
        user?._legacy_id,
        user?.openid,
        user?.phone,
        user?.member_no,
        user?.my_invite_code,
        user?.invite_code
    ];
}

function findUserByAnyId(users, value) {
    return findByLookup(users, value, (user) => buildUserLookupExtras(user));
}

function normalizeUserSearchValue(value) {
    return pickString(value).trim().toLowerCase();
}

function buildUserKeywordSearchText(user = {}) {
    return [
        getUserNickname(user),
        user?.phone,
        user?.openid,
        user?.member_no,
        user?.my_invite_code,
        user?.invite_code,
        primaryId(user),
        user?._legacy_id
    ].filter(Boolean).join(' ').toLowerCase();
}

function userMatchesKeyword(user, keyword) {
    const normalizedKeyword = normalizeUserSearchValue(keyword);
    if (!normalizedKeyword) return true;
    return buildUserKeywordSearchText(user).includes(normalizedKeyword);
}

function userMatchesLookup(user, lookup) {
    if (lookup == null || lookup === '') return true;
    return rowMatchesLookup(user, lookup, buildUserLookupExtras(user));
}

function userMatchesMemberNo(user, memberNo) {
    const normalizedMemberNo = normalizeUserSearchValue(memberNo);
    if (!normalizedMemberNo) return true;
    const tokens = [
        user?.member_no,
        user?.my_invite_code,
        user?.invite_code
    ].flatMap((value) => valueTokens(value).map((token) => String(token).toLowerCase()));
    return tokens.includes(normalizedMemberNo);
}

function normalizeUserStatusFilter(value) {
    const normalized = normalizeUserSearchValue(value);
    if (!normalized) return null;
    if (['1', 'true', 'active', 'enabled', 'normal'].includes(normalized)) return 1;
    if (['0', 'false', 'disabled', 'inactive', 'blocked', 'banned'].includes(normalized)) return 0;
    const numeric = Number(normalized);
    return Number.isFinite(numeric) ? numeric : null;
}

function getUserSearchScore(user, keyword) {
    const normalizedKeyword = normalizeUserSearchValue(keyword);
    if (!normalizedKeyword) return Number.POSITIVE_INFINITY;

    const exactTokens = rowLookupTokens(user, buildUserLookupExtras(user)).map((token) => String(token).toLowerCase());
    if (exactTokens.includes(normalizedKeyword)) return 0;

    const memberNoTokens = [
        user?.member_no,
        user?.my_invite_code,
        user?.invite_code
    ].flatMap((value) => valueTokens(value).map((token) => String(token).toLowerCase()));
    if (memberNoTokens.some((token) => token.startsWith(normalizedKeyword))) return 1;

    const phoneTokens = valueTokens(user?.phone).map((token) => String(token).toLowerCase());
    if (phoneTokens.some((token) => token.startsWith(normalizedKeyword))) return 1;

    const nickname = getUserNickname(user).trim().toLowerCase();
    if (nickname === normalizedKeyword) return 2;
    if (nickname.startsWith(normalizedKeyword)) return 3;

    return buildUserKeywordSearchText(user).includes(normalizedKeyword) ? 4 : Number.POSITIVE_INFINITY;
}

function orderBelongsToUser(order, user) {
    if (!order || !user) return false;
    const userTokens = rowLookupTokens(user, [user?.openid]);
    const orderTokens = rowLookupTokens(order, [order?.buyer_id, order?.openid, order?.user_id]);
    return userTokens.some((token) => orderTokens.includes(token));
}

function getUserOrders(user, orders) {
    return orders.filter((order) => orderBelongsToUser(order, user));
}

function isPaidLikeOrder(order) {
    return ['paid', 'pending_group', 'pickup_pending', 'agent_confirmed', 'shipping_requested', 'shipped', 'completed', 'refunded'].includes(order?.status);
}

function getOrderAmount(order) {
    return toNumber(order?.pay_amount ?? order?.actual_price ?? order?.total_amount, 0);
}

function getDirectChildren(users, leader) {
    const leaderId = primaryId(leader);
    if (leaderId == null) return [];
    return users.filter((user) => {
        const parent = findUserByAnyId(users, getUserParentRef(user));
        return parent && rowMatchesLookup(parent, leaderId);
    });
}

function getUserDescendants(users, leader, maxDepth = Infinity) {
    const descendants = [];
    const visited = new Set();
    const queue = getDirectChildren(users, leader).map((user) => ({ user, depth: 1 }));
    while (queue.length) {
        const { user, depth } = queue.shift();
        const key = String(primaryId(user) ?? user.openid ?? '');
        if (!key || visited.has(key)) continue;
        visited.add(key);
        descendants.push(user);
        if (depth < maxDepth) {
            for (const child of getDirectChildren(users, user)) {
                queue.push({ user: child, depth: depth + 1 });
            }
        }
    }
    return descendants;
}

function buildUserTiny(user) {
    if (!user) return null;
    const canonical = userContract.buildCanonicalUser(user);
    return {
        id: canonical.id,
        nickname: canonical.nickname,
        avatar_url: canonical.avatar_url,
        openid: canonical.openid,
        role_level: canonical.role_level,
        role_name: canonical.role_name,
        is_virtual_settlement: canonical.is_virtual_settlement === true,
        virtual_settlement_type: canonical.virtual_settlement_type,
        virtual_display_name: canonical.virtual_display_name
    };
}

function isVirtualB3SettlementUser(user = {}) {
    if (!user || typeof user !== 'object') return false;
    const settlementType = pickString(user.virtual_settlement_type).trim().toLowerCase();
    return (user.is_virtual_settlement === true || user.is_virtual_settlement === 1 || user.is_virtual_settlement === '1')
        && settlementType === 'b3_region';
}

function buildUserGraph(users) {
    const tokenToUser = new Map();
    const childrenById = new Map();
    const parentById = new Map();

    const registerToken = (token, user) => {
        if (!token) return;
        const key = String(token);
        if (!tokenToUser.has(key)) tokenToUser.set(key, user);
    };

    users.forEach((user) => {
        rowLookupTokens(user, buildUserLookupExtras(user)).forEach((token) => registerToken(token, user));
        registerToken(primaryId(user), user);
        registerToken(user?._legacy_id, user);
        registerToken(user?._id, user);
    });

    const resolveUser = (value) => {
        if (value == null || value === '') return null;
        const probe = {
            id: value,
            _id: value,
            _legacy_id: value,
            openid: value,
            phone: value,
            member_no: value,
            my_invite_code: value,
            invite_code: value
        };
        for (const token of rowLookupTokens(probe, [value])) {
            const hit = tokenToUser.get(token);
            if (hit) return hit;
        }
        return null;
    };

    users.forEach((user) => {
        const userId = primaryId(user);
        if (userId == null) return;
        const parent = resolveUser(getUserParentRef(user));
        if (!parent) return;
        const key = String(userId);
        const parentKey = String(primaryId(parent));
        parentById.set(key, parent);
        if (!childrenById.has(parentKey)) childrenById.set(parentKey, []);
        childrenById.get(parentKey).push(user);
    });

    return {
        resolveUser,
        getParent(user) {
            const userId = primaryId(user);
            if (userId == null) return null;
            return parentById.get(String(userId)) || null;
        },
        getDirectChildren(leader) {
            const leaderId = primaryId(leader);
            if (leaderId == null) return [];
            return childrenById.get(String(leaderId)) || [];
        },
        getDescendants(leader, maxDepth = Infinity) {
            const descendants = [];
            const visited = new Set();
            const queue = this.getDirectChildren(leader).map((user) => ({ user, depth: 1 }));
            while (queue.length) {
                const { user, depth } = queue.shift();
                const key = String(primaryId(user) ?? user?.openid ?? '');
                if (!key || visited.has(key)) continue;
                visited.add(key);
                descendants.push(user);
                if (depth < maxDepth) {
                    for (const child of this.getDirectChildren(user)) {
                        queue.push({ user: child, depth: depth + 1 });
                    }
                }
            }
            return descendants;
        }
    };
}

function buildUserListContext(users, orders) {
    const graph = buildUserGraph(users);
    const orderStats = new Map();
    const directChildCount = new Map();

    users.forEach((user) => {
        directChildCount.set(String(primaryId(user)), graph.getDirectChildren(user).length);
    });

    const assignOrderToUser = (order) => {
        const candidates = [order?.openid, order?.buyer_id, order?.user_id];
        for (const value of candidates) {
            const user = graph.resolveUser(value);
            if (user) return user;
        }
        return null;
    };

    orders.forEach((order) => {
        const owner = assignOrderToUser(order);
        if (!owner) return;
        const ownerId = String(primaryId(owner));
        const current = orderStats.get(ownerId) || { order_count: 0, total_sales: 0 };
        current.order_count += 1;
        if (isPaidLikeOrder(order)) current.total_sales += getOrderAmount(order);
        orderStats.set(ownerId, current);
    });

    return { graph, orderStats, directChildCount };
}

function buildUserListRecord(user, context) {
    const canonical = userContract.buildCanonicalUser(user);
    const userId = String(primaryId(user));
    const orderStat = context.orderStats.get(userId) || { order_count: 0, total_sales: 0 };
    const parent = context.graph.getParent(user);
    const refereeCount = context.directChildCount.get(userId) || 0;

    return {
        ...canonical,
        purchase_level_code: pickString(user.purchase_level_code || user.purchase_level || ''),
        goods_fund_balance: canonical.goods_fund_balance,
        points: toNumber(user.points, 0),
        total_sales: orderStat.total_sales,
        referee_count: refereeCount,
        growth_value: toNumber(user.growth_value, 0),
        status: getUserStatus(user),
        status_text: canonical.status_text,
        discount_rate: toNumber(user.discount_rate, 1),
        order_count: orderStat.order_count,
        tags: toArray(user.tags),
        participate_distribution: user.participate_distribution == null ? 1 : (toBoolean(user.participate_distribution) ? 1 : 0),
        stock_count: toNumber(user.stock_count ?? user.stock ?? 0, 0),
        last_login: pickString(user.last_login || user.last_login_at),
        remark: pickString(user.remark),
        debt_amount: toNumber(user.debt_amount, 0),
        parent: buildUserTiny(parent),
        stats: {
            orderCount: orderStat.order_count,
            teamCount: refereeCount,
            totalCommission: 0
        }
    };
}

function buildUserSearchRecord(user) {
    const canonical = userContract.buildCanonicalUser(user);
    return {
        id: canonical.id,
        _id: canonical._id,
        _legacy_id: user?._legacy_id ?? null,
        nickname: canonical.nickname,
        avatar_url: canonical.avatar_url,
        phone: canonical.phone,
        member_no: canonical.member_no,
        invite_code: canonical.invite_code,
        openid: canonical.openid,
        role_level: canonical.role_level,
        role_name: canonical.role_name,
        status: getUserStatus(user),
        status_text: canonical.status_text
    };
}

function buildUserRecord(user, users, orders, commissions) {
    const canonical = userContract.buildCanonicalUser(user);
    const userOrders = getUserOrders(user, orders);
    const paidOrders = userOrders.filter(isPaidLikeOrder);
    const directChildren = getDirectChildren(users, user);
    const descendants = getUserDescendants(users, user);
    const parent = findUserByAnyId(users, getUserParentRef(user));
    const totalCommission = commissions
        .filter((item) => {
            const order = findByLookup(orders, item.order_id || item.order_no, (row) => [row.order_no, row.openid, row.buyer_id]);
            const commissionUser = findUserByAnyId(users, item.openid || item.user_id || item.receiver_openid || item.beneficiary_openid || (order?.openid || order?.buyer_id));
            return commissionUser && rowMatchesLookup(commissionUser, primaryId(user), [user.openid]);
        })
        .reduce((sum, item) => sum + toNumber(item.amount, 0), 0);

    return {
        ...canonical,
        purchase_level_code: pickString(user.purchase_level_code || user.purchase_level || ''),
        goods_fund_balance: canonical.goods_fund_balance,
        total_sales: paidOrders.reduce((sum, item) => sum + getOrderAmount(item), 0),
        referee_count: directChildren.length,
        growth_value: toNumber(user.growth_value ?? user.points ?? 0, 0),
        status: getUserStatus(user),
        status_text: canonical.status_text,
        discount_rate: toNumber(user.discount_rate, 1),
        order_count: userOrders.length,
        tags: toArray(user.tags),
        participate_distribution: user.participate_distribution == null ? 1 : (toBoolean(user.participate_distribution) ? 1 : 0),
        stock_count: toNumber(user.stock_count ?? user.stock ?? 0, 0),
        last_login: pickString(user.last_login || user.last_login_at),
        remark: pickString(user.remark),
        debt_amount: toNumber(user.debt_amount, 0),
        parent: buildUserTiny(parent),
        stats: {
            orderCount: userOrders.length,
            teamCount: descendants.length,
            totalCommission
        }
    };
}

function buildUserTeamSummary(leader, users, orders, range = 'all') {
    const descendants = getUserDescendants(users, leader);
    const limitTimestamp = range === '30d'
        ? Date.now() - (30 * 24 * 60 * 60 * 1000)
        : 0;
    const descendantRows = descendants.map((user) => buildUserRecord(user, users, orders, []));
    const descendantOrders = descendants.flatMap((user) => getUserOrders(user, orders))
        .filter((order) => {
            if (!limitTimestamp) return true;
            return new Date(order.created_at || order.updated_at || 0).getTime() >= limitTimestamp;
        });
    const paidOrders = descendantOrders.filter(isPaidLikeOrder);

    return {
        leader_id: primaryId(leader),
        descendant_count: descendants.length,
        user_total_sales_sum: descendantRows.reduce((sum, row) => sum + toNumber(row.total_sales, 0), 0),
        user_order_count_sum: descendantRows.reduce((sum, row) => sum + toNumber(row.order_count, 0), 0),
        order_row_count: descendantOrders.length,
        order_actual_price_sum: descendantOrders.reduce((sum, item) => sum + getOrderAmount(item), 0),
        order_paid_row_count: paidOrders.length,
        order_paid_actual_sum: paidOrders.reduce((sum, item) => sum + getOrderAmount(item), 0)
    };
}

function dealerRoleLevelForLevel(level) {
    const normalized = Math.max(1, Math.min(3, toNumber(level, 1)));
    return normalized + 2;
}

function inferDealerLevel(user) {
    const explicit = toNumber(user?.dealer_level, 0);
    if (explicit >= 1 && explicit <= 3) return explicit;
    const roleLevel = toNumber(user?.role_level, 0);
    if (roleLevel >= 5) return 3;
    if (roleLevel >= 4) return 2;
    return 1;
}

function normalizeDealerStatus(status, fallback = 'approved') {
    const value = pickString(status).trim().toLowerCase();
    if (['pending', 'approved', 'rejected', 'suspended'].includes(value)) return value;
    return fallback;
}

function isDealerCandidate(user) {
    if (!user) return false;
    if (pickString(user.dealer_status)) return true;
    if (pickString(user.dealer_no || user.company_name || user.dealer_company_name || user.contact_name || user.contact_email)) return true;
    return toNumber(user.role_level ?? 0, 0) >= 3 || toNumber(user.distributor_level ?? 0, 0) >= 2 || toNumber(user.dealer_level ?? 0, 0) >= 1;
}

function buildDealerRecord(user) {
    const level = inferDealerLevel(user);
    const status = normalizeDealerStatus(user?.dealer_status, isDealerCandidate(user) ? 'approved' : 'pending');
    return {
        id: primaryId(user),
        company_name: pickString(user.company_name || user.dealer_company_name || ''),
        contact_name: pickString(user.contact_name || user.real_name || getUserNickname(user)),
        dealer_no: pickString(user.dealer_no || user.member_no || user.my_invite_code || `DLR-${primaryId(user)}`),
        user_id: primaryId(user),
        user: buildUserTiny(user),
        level,
        status,
        created_at: pickString(user.dealer_applied_at || user.created_at),
        approved_at: status === 'approved' ? pickString(user.dealer_approved_at || user.updated_at) : '',
        contact_phone: pickString(user.contact_phone || user.phone),
        contact_email: pickString(user.contact_email),
        reject_reason: pickString(user.dealer_reject_reason),
        legal_person: pickString(user.legal_person),
        company_address: pickString(user.company_address),
        business_license_no: pickString(user.business_license_no),
        tax_no: pickString(user.tax_no),
        invoice_title: pickString(user.invoice_title || user.company_name || user.dealer_company_name),
        invoice_email: pickString(user.invoice_email || user.contact_email),
        bank_account_name: pickString(user.bank_account_name || user.company_name || user.dealer_company_name),
        bank_account_no: pickString(user.bank_account_no),
        bank_name: pickString(user.bank_name)
    };
}

function normalizeAdminPermissions(rawPermissions, { allowProtected = true } = {}) {
    return normalizePermissionList(rawPermissions, { allowProtected });
}

function isSuperAdminAdmin(admin) {
    return pickString(admin?.role) === SUPER_ADMIN_ROLE;
}

function isValidAdminRole(roleCode) {
    const normalizedRole = pickString(roleCode).trim();
    if (!normalizedRole) return false;
    if (normalizedRole === SUPER_ADMIN_ROLE) return true;
    return !!ADMIN_ROLE_PRESETS[normalizedRole] || !!getAdminRoleDefinition(normalizedRole);
}

function sanitizeAdminRecord(admin) {
    if (!admin) return null;
    return {
        id: primaryId(admin),
        username: pickString(admin.username),
        name: pickString(admin.name || admin.username),
        role: pickString(admin.role || 'admin'),
        permissions: normalizePermissions(admin),
        phone: pickString(admin.phone),
        email: pickString(admin.email),
        status: toBoolean(admin.status) ? 1 : 0,
        last_login_at: pickString(admin.last_login_at),
        last_login_ip: pickString(admin.last_login_ip),
        created_at: pickString(admin.created_at),
        updated_at: pickString(admin.updated_at)
    };
}

function createDefaultBranchAgentPolicy() {
    return {
        enabled: false,
        min_apply_role_level: 3,
        pickup_station_subsidy_enabled: true,
        pickup_station_reward_rate: 0.025,
        pickup_station_subsidy_amount: 0,
        region_reward_tiers: [
            { threshold: 100000, rate: 0.01, label: '10万' },
            { threshold: 300000, rate: 0.02, label: '30万' },
            { threshold: 1000000, rate: 0.03, label: '100万' }
        ]
    };
}

function normalizeBranchAgentPolicySnapshot(rawPolicy) {
    const defaults = createDefaultBranchAgentPolicy();
    const policy = toObject(rawPolicy, {});
    const normalizeRate = (value, fallback) => Math.min(1, Math.max(0, toNumber(value, fallback)));
    const normalizeMoney = (value, fallback) => Math.max(0, toNumber(value, fallback));
    const normalizedRegionRewardTiers = toArray(policy.region_reward_tiers)
        .map((tier, index) => ({
            threshold: Math.max(0, normalizeMoney(tier?.threshold, defaults.region_reward_tiers[index]?.threshold || 0)),
            rate: normalizeRate(tier?.rate, defaults.region_reward_tiers[index]?.rate || 0),
            label: pickString(tier?.label || defaults.region_reward_tiers[index]?.label || '')
        }))
        .filter((tier) => tier.threshold > 0 && tier.rate > 0)
        .sort((a, b) => a.threshold - b.threshold);
    return {
        enabled: toBoolean(policy.enabled),
        min_apply_role_level: Math.max(0, Math.floor(toNumber(policy.min_apply_role_level, defaults.min_apply_role_level))),
        pickup_station_subsidy_enabled: policy.pickup_station_subsidy_enabled === undefined
            ? defaults.pickup_station_subsidy_enabled
            : toBoolean(policy.pickup_station_subsidy_enabled),
        pickup_station_reward_rate: normalizeRate(policy.pickup_station_reward_rate, defaults.pickup_station_reward_rate),
        pickup_station_subsidy_amount: normalizeMoney(policy.pickup_station_subsidy_amount, defaults.pickup_station_subsidy_amount),
        region_reward_tiers: normalizedRegionRewardTiers.length ? normalizedRegionRewardTiers : defaults.region_reward_tiers
    };
}

function getBranchAgentPolicySnapshot() {
    return normalizeBranchAgentPolicySnapshot(getSingleton('branch-agent-policy', createDefaultBranchAgentPolicy()));
}

function getBranchAgentStationsSnapshot() {
    const rows = getCollection('branch_agent_stations');
    if (rows.length) return rows.map((row) => ({
        ...row,
        branch_type: normalizeBranchScopeLevel(row.branch_type || row.type || 'district')
    }));
    return [];
}

function normalizeScopeText(value) {
    return pickString(value).replace(/\s+/g, '').trim().toLowerCase();
}

function normalizeBranchScopeLevel(value) {
    const raw = pickString(value).trim().toLowerCase();
    if (raw === 'area') return 'district';
    if (['province', 'city', 'district', 'school'].includes(raw)) return raw;
    return 'district';
}

function getBranchScopePriority(scopeLevel) {
    return ({
        district: 3,
        city: 2,
        province: 1
    }[normalizeBranchScopeLevel(scopeLevel)] || 0);
}

function buildBranchScopeLabel(station = {}) {
    const scopeLevel = normalizeBranchScopeLevel(station.branch_type);
    if (scopeLevel === 'district') {
        return [pickString(station.province), pickString(station.city), pickString(station.district)].filter(Boolean).join(' / ');
    }
    if (scopeLevel === 'city') {
        return [pickString(station.province), pickString(station.city)].filter(Boolean).join(' / ');
    }
    if (scopeLevel === 'province') {
        return pickString(station.province);
    }
    return [pickString(station.province), pickString(station.city), pickString(station.district)].filter(Boolean).join(' / ');
}

function sortBranchAssignments(rows = []) {
    return [...rows].sort((left, right) => {
        const scopeDiff = getBranchScopePriority(right.branch_type) - getBranchScopePriority(left.branch_type);
        if (scopeDiff !== 0) return scopeDiff;
        return parseTimestamp(right.updated_at || right.created_at) - parseTimestamp(left.updated_at || left.created_at);
    });
}

function buildBranchAssignmentRecord(row) {
    return {
        id: primaryId(row),
        name: pickString(row.name || row.station_name || row.title),
        branch_type: normalizeBranchScopeLevel(row.branch_type || row.type || 'district'),
        province: pickString(row.province),
        city: pickString(row.city),
        district: pickString(row.district),
        region_name: pickString(row.region_name || row.school_name || row.station_area),
        address: pickString(row.address || row.detail_address),
        longitude: row.longitude ?? null,
        latitude: row.latitude ?? null,
        commission_rate: toNumber(row.commission_rate, 0.02),
        status: pickString(row.status || 'active'),
        pickup_commission_tier: pickString(row.pickup_commission_tier || 'A'),
        claimant_id: row.claimant_id || row.user_id || null,
        created_at: pickString(row.created_at),
        updated_at: pickString(row.updated_at || row.created_at),
        scope_label: buildBranchScopeLabel(row)
    };
}

function buildBranchAgentStationRecord(station, users) {
    const claimant = findUserByAnyId(users, station.claimant_id || station.openid || station.user_id);
    return {
        ...station,
        id: primaryId(station),
        branch_type: normalizeBranchScopeLevel(station.branch_type),
        scope_label: buildBranchScopeLabel(station),
        claimant_id: primaryId(claimant) || station.claimant_id || null,
        claimant: buildUserTiny(claimant)
    };
}

function buildBranchAgentClaimRecord(claim, users, stations) {
    const applicant = findUserByAnyId(users, claim.applicant_id || claim.user_id || claim.openid);
    const station = findByLookup(stations, claim.station_id);
    return {
        ...claim,
        id: primaryId(claim),
        applicant_id: primaryId(applicant) || claim.applicant_id || null,
        applicant: applicant ? {
            ...buildUserTiny(applicant),
            role_level: toNumber(applicant.role_level ?? applicant.distributor_level, 0)
        } : null,
        station_id: primaryId(station) || claim.station_id || null,
        station: station ? buildBranchAgentStationRecord(station, users) : null,
        branch_type: pickString(claim.branch_type || station?.branch_type || 'city'),
        region_name: pickString(claim.region_name || station?.region_name),
        real_name: pickString(claim.real_name || applicant?.real_name || applicant?.nickname || applicant?.nickName),
        phone: pickString(claim.phone || applicant?.phone),
        status: pickString(claim.status || 'pending'),
        note: pickString(claim.note)
    };
}

function syncBranchStationToPickupStation(station) {
    if (!station) return null;
    const pickupRows = getCollection('stations');
    const index = pickupRows.findIndex((row) => rowMatchesLookup(row, primaryId(station), [row.id, row._legacy_id]));
    if (index === -1) return null;
    pickupRows[index] = {
        ...pickupRows[index],
        claimant_id: station.claimant_id || pickupRows[index].claimant_id || null,
        branch_type: normalizeBranchScopeLevel(station.branch_type || pickupRows[index].branch_type || 'district'),
        region_name: pickString(station.region_name || pickupRows[index].region_name),
        status: pickString(station.status || pickupRows[index].status || 'active'),
        updated_at: nowIso()
    };
    saveCollection('stations', pickupRows);
    return pickupRows[index];
}

function getBranchAgentTargetUser(station, users) {
    return findUserByAnyId(users, station?.claimant_id || station?.openid || station?.user_id);
}

function getOrderAddressText(order = {}) {
    const addr = order.address_snapshot || order.address || {};
    return [
        pickString(addr.province),
        pickString(addr.city),
        pickString(addr.district),
        pickString(addr.detail),
        pickString(order.region_name)
    ].filter(Boolean).join(' ');
}

function getOrderRegionParts(order = {}) {
    const addr = order.address_snapshot || order.address || {};
    return {
        province: normalizeScopeText(addr.province),
        city: normalizeScopeText(addr.city),
        district: normalizeScopeText(addr.district)
    };
}

function branchAssignmentMatchesOrder(station = {}, order = {}) {
    const scopeLevel = normalizeBranchScopeLevel(station.branch_type);
    if (!['province', 'city', 'district'].includes(scopeLevel)) return false;
    const orderRegion = getOrderRegionParts(order);
    if (!orderRegion.province) return false;
    const stationProvince = normalizeScopeText(station.province);
    const stationCity = normalizeScopeText(station.city);
    const stationDistrict = normalizeScopeText(station.district);
    if (scopeLevel === 'province') {
        return !!stationProvince && stationProvince === orderRegion.province;
    }
    if (scopeLevel === 'city') {
        return !!stationProvince && !!stationCity
            && stationProvince === orderRegion.province
            && stationCity === orderRegion.city;
    }
    return !!stationProvince && !!stationCity && !!stationDistrict
        && stationProvince === orderRegion.province
        && stationCity === orderRegion.city
        && stationDistrict === orderRegion.district;
}

function matchBranchAgentStationForOrder(order, options = {}) {
    const policy = getBranchAgentPolicySnapshot();
    if (!policy.enabled) return null;
    const stations = sortBranchAssignments(
        getBranchAgentStationsSnapshot()
            .map((row) => buildBranchAssignmentRecord(row))
            .filter((item) => pickString(item.status || 'active') === 'active')
    );
    if (!stations.length) return null;

    if (options.preferPickup && order.pickup_station_id) {
        const exact = findByLookup(stations, order.pickup_station_id);
        if (exact) return exact;
    }

    return stations.find((station) => branchAssignmentMatchesOrder(station, order)) || null;
}

function createBranchAgentCommission(order, station, users, options = {}) {
    if (!order || !station) return null;
    const claimant = getBranchAgentTargetUser(station, users);
    if (!claimant || !claimant.openid) return null;

    const rows = getCollection('commissions');
    const type = options.type || 'region_agent';
    const existing = rows.find((row) =>
        rowMatchesLookup(row, order._id || order.id || order.order_no, [row.order_id, row.order_no])
        && pickString(row.type).toLowerCase() === String(type).toLowerCase()
        && rowMatchesLookup(row, claimant.openid, [row.openid, row.user_id])
    );
    if (existing) return existing;

    const amount = Math.max(0, toNumber(options.amount, 0));
    if (amount <= 0) return null;
    const isVirtualB3 = isVirtualB3SettlementUser(claimant);

    const row = {
        id: nextId(rows),
        openid: claimant.openid,
        user_id: primaryId(claimant) || claimant.openid,
        from_openid: order.openid || order.buyer_id || '',
        order_id: order._id || order.id || null,
        order_no: pickString(order.order_no),
        amount: Number(amount.toFixed(2)),
        level: isVirtualB3 ? 5 : toNumber(claimant.role_level ?? claimant.distributor_level, 0),
        status: 'pending_approval',
        type,
        branch_station_id: primaryId(station),
        branch_type: pickString(station.branch_type),
        claimant_virtual_settlement: isVirtualB3,
        claimant_virtual_settlement_type: pickString(claimant.virtual_settlement_type),
        description: pickString(options.description),
        created_at: nowIso(),
        updated_at: nowIso()
    };
    rows.push(row);
    saveCollection('commissions', rows);
    return row;
}

function ensureBranchAgentCommissionForOrder(order, options = {}) {
    if (pickString(order?.type).trim().toLowerCase() === 'exchange') return null;
    const policy = getBranchAgentPolicySnapshot();
    if (!policy.enabled) return null;
    const users = getCollection('users');
    const station = matchBranchAgentStationForOrder(order, options);
    if (!station) return null;

    if (options.preferPickup) {
        const orderAmount = toNumber(order.pay_amount ?? order.actual_price ?? order.total_amount, 0);
        let amount = orderAmount * toNumber(policy.pickup_station_reward_rate, 0);
        if (amount <= 0) amount = toNumber(policy.pickup_station_subsidy_amount, 0);
        return createBranchAgentCommission(order, station, users, {
            amount,
            type: 'pickup_subsidy',
            description: `自提点奖励：${pickString(station.name || station.region_name)}`
        });
    }

    const stationId = primaryId(station);
    const cumulativeAmount = roundMoney(getCollection('orders').reduce((sum, row) => {
        const status = getEffectiveOrderStatus(row);
        if (!['paid', 'agent_confirmed', 'shipping_requested', 'shipped', 'completed'].includes(status)) return sum;
        const matchedStation = matchBranchAgentStationForOrder(row, { preferPickup: false });
        if (!matchedStation || !rowMatchesLookup(matchedStation, stationId, [stationId])) return sum;
        return sum + toNumber(row.pay_amount ?? row.actual_price ?? row.total_amount, 0);
    }, 0));
    const rate = (policy.region_reward_tiers || []).reduce((current, tier) => {
        return cumulativeAmount >= toNumber(tier.threshold, 0) ? toNumber(tier.rate, current) : current;
    }, 0);
    const amount = toNumber(order.pay_amount ?? order.actual_price ?? order.total_amount, 0) * rate;
    const isVirtualB3 = isVirtualB3SettlementUser(getBranchAgentTargetUser(station, users));
    return createBranchAgentCommission(order, station, users, {
        amount,
        type: isVirtualB3 ? 'region_b3_virtual' : 'region_agent',
        description: `${isVirtualB3 ? '虚拟B3区域佣金' : '区域奖励'}：${pickString(station.name || station.region_name)}（累计${cumulativeAmount.toFixed(2)}元）`
    });
}

function getNLeaderRef(user) {
    return user?.n_leader_id ?? user?.leader_id ?? user?.n_leader_openid ?? user?.parent_id ?? user?.parent_openid ?? user?.referrer_openid ?? null;
}

function buildNSystemLeaderRecord(user, users) {
    const members = users.filter((item) => {
        if (toNumber(item.role_level, 0) !== 6) return false;
        const leader = findUserByAnyId(users, getNLeaderRef(item));
        return leader && rowMatchesLookup(leader, primaryId(user), [user.openid]);
    });
    return {
        id: primaryId(user),
        nickname: getUserNickname(user),
        avatar_url: getUserAvatar(user),
        phone: pickString(user.phone),
        wallet_balance: toNumber(user.wallet_balance ?? user.agent_wallet_balance ?? 0, 0),
        balance: toNumber(user.balance ?? user.commission_balance ?? 0, 0),
        n_member_count: members.length,
        createdAt: pickString(user.created_at),
        updatedAt: pickString(user.updated_at)
    };
}

function buildNSystemMemberRecord(user, users) {
    const leader = findUserByAnyId(users, getNLeaderRef(user));
    return {
        id: primaryId(user),
        nickname: getUserNickname(user),
        avatar_url: getUserAvatar(user),
        phone: pickString(user.phone),
        wallet_balance: toNumber(user.wallet_balance ?? user.agent_wallet_balance ?? 0, 0),
        joined_team_at: pickString(user.joined_team_at || user.bound_parent_at || user.created_at),
        nLeader: buildUserTiny(leader),
        agentWallet: {
            balance: toNumber(user.wallet_balance ?? user.agent_wallet_balance ?? 0, 0)
        }
    };
}

function getUpgradeApplicationsSnapshot(users) {
    const rows = getCollection('upgrade_applications');
    if (rows.length) return rows;
    return users
        .filter((user) => [6, 7].includes(toNumber(user.role_level, 0)))
        .slice(0, 20)
        .map((user) => ({
            id: primaryId(user),
            user_id: primaryId(user),
            leader_id: primaryId(findUserByAnyId(users, getNLeaderRef(user))) || null,
            path_type: toNumber(user.role_level, 0) >= 7 ? 'n_upgrade' : 'n_join',
            amount: toNumber(user.n_path_amount ?? 0, 0),
            team_upgrade: false,
            status: 'approved',
            createdAt: pickString(user.updated_at || user.created_at),
            updatedAt: pickString(user.updated_at || user.created_at),
            reviewed_at: pickString(user.updated_at || user.created_at)
        }));
}

function buildUpgradeApplicationRecord(item, users) {
    const user = findUserByAnyId(users, item.user_id || item.openid);
    return {
        ...item,
        id: primaryId(item),
        user_id: primaryId(user) || item.user_id || null,
        user: buildUserTiny(user),
        leader_id: item.leader_id || primaryId(findUserByAnyId(users, item.leader_id)),
        amount: toNumber(item.amount, 0),
        status: pickString(item.status || 'pending_review'),
        path_type: pickString(item.path_type || 'n_join'),
        team_upgrade: toBoolean(item.team_upgrade),
        createdAt: pickString(item.createdAt || item.created_at),
        updatedAt: pickString(item.updatedAt || item.updated_at),
        reviewed_at: pickString(item.reviewed_at),
        remark: pickString(item.remark)
    };
}

function formatUptimeHuman(seconds) {
    const total = Math.max(0, Math.floor(toNumber(seconds, 0)));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
}

function buildOrderItemSnapshot(item, products, skus) {
    const product = findByLookup(products, item?.product_id);
    const sku = findByLookup(skus, item?.sku_id, (row) => [row.product_id]);
    return {
        ...item,
        qty: toNumber(item?.qty ?? item?.quantity, 1),
        quantity: toNumber(item?.qty ?? item?.quantity, 1),
        product: product ? {
            id: primaryId(product),
            name: pickString(item?.snapshot_name || product.name),
            image: assetUrl(item?.snapshot_image || toArray(product.images)[0] || '')
        } : {
            id: item?.product_id || null,
            name: pickString(item?.snapshot_name),
            image: assetUrl(item?.snapshot_image || '')
        },
        sku: {
            id: primaryId(sku),
            spec_value: pickString(item?.snapshot_spec || sku?.spec || sku?.name),
            image: assetUrl(item?.snapshot_image || sku?.image || '')
        },
        display_original_line_amount: roundMoney(item?.original_line_amount ?? item?.item_amount),
        display_coupon_allocated_amount: roundMoney(item?.coupon_allocated_amount),
        display_points_allocated_amount: roundMoney(item?.points_allocated_amount),
        display_cash_paid_allocated_amount: roundMoney(item?.cash_paid_allocated_amount ?? item?.item_amount),
        display_refunded_cash_amount: roundMoney(item?.refunded_cash_amount),
        display_refundable_cash_amount: roundMoney(
            Math.max(0, toNumber(item?.cash_paid_allocated_amount ?? item?.item_amount, 0) - toNumber(item?.refunded_cash_amount, 0))
        ),
        refundable_quantity: Math.max(0, toNumber(item?.quantity ?? item?.qty, 1) - toNumber(item?.refunded_quantity, 0))
    };
}

function buildWithdrawalRecord(withdrawal, users) {
    const user = findUserByAnyId(users, withdrawal.openid || withdrawal.user_id);
    const fee = toNumber(withdrawal.fee, 0);
    const amount = toNumber(withdrawal.amount, 0);
    const withdrawAccount = withdrawal.withdraw_account || {
        type: pickString(withdrawal.method || 'wechat'),
        name: pickString(withdrawal.account_name),
        account: pickString(withdrawal.account || withdrawal.account_no),
        account_no: pickString(withdrawal.account_no),
        bank_name: pickString(withdrawal.bank_name)
    };
    return {
        ...withdrawal,
        id: primaryId(withdrawal),
        display_id: buildDisplayId(withdrawal),
        amount,
        fee,
        actual_amount: toNumber(withdrawal.actual_amount, amount - fee),
        status: pickString(withdrawal.status || 'pending'),
        user_id: primaryId(user) || withdrawal.user_id || withdrawal.openid || null,
        user: buildUserTiny(user),
        withdraw_account: withdrawAccount,
        remark: pickString(withdrawal.remark),
        reject_reason: pickString(withdrawal.reject_reason)
    };
}

function ensureWithdrawalNumericIds() {
    const rows = getCollection('withdrawals');
    let maxId = rows.reduce((max, row) => {
        const candidates = [row.id, row._legacy_id]
            .map((value) => Number(value))
            .filter((value) => Number.isFinite(value));
        const currentMax = candidates.length ? Math.max(...candidates) : max;
        return Math.max(max, currentMax);
    }, 0);
    let changed = false;
    rows.forEach((row) => {
        const hasNumericId = (row.id != null && row.id !== '') || (row._legacy_id != null && row._legacy_id !== '');
        if (hasNumericId) return;
        maxId += 1;
        row.id = maxId;
        row._legacy_id = maxId;
        row.updated_at = row.updated_at || nowIso();
        changed = true;
    });
    if (changed) {
        saveCollection('withdrawals', rows);
    }
    return rows;
}

function buildRefundRecord(refund, users, orders, products, skus) {
    const order = findByLookup(orders, refund.order_id || refund.order_no, (row) => [row.order_no]);
    const items = order ? toArray(order.items).map((item) => buildOrderItemSnapshot(item, products, skus)) : [];
    const user = findUserByAnyId(users, refund.openid || refund.user_id || order?.openid || order?.buyer_id);
    const refundItems = toArray(refund.refund_items).map((line) => ({
        ...line,
        product: {
            id: pickString(line.product_id),
            name: pickString(line.name),
            image: assetUrl(line.image)
        },
        sku: line.spec ? { spec_value: pickString(line.spec) } : null
    }));
    const firstItem = items.find((item) => refundItems.some((refundLine) => refundLine.refund_item_key === item.refund_item_key))
        || items[0]
        || null;
    const paymentMethod = normalizePaymentMethodCode(refund.payment_method || order?.payment_method || order?.pay_type || order?.pay_channel || order?.payment_channel || 'wechat');
    const refundRoute = getRefundRouteMeta(refund.refund_channel || refund.refund_method || paymentMethod);
    return {
        ...refund,
        id: primaryId(refund),
        display_id: buildDisplayId(refund),
        order_id: pickString(primaryId(order) || refund.order_id || refund.order_no),
        openid: pickString(refund.openid || order?.openid || ''),
        amount: toNumber(refund.amount, 0),
        status: pickString(refund.status || 'pending'),
        status_text: orderContract.getRefundStatusText(refund.status || 'pending'),
        status_desc: orderContract.getRefundStatusDesc(refund.status || 'pending'),
        reason: pickString(refund.reason),
        images: toArray(refund.images).map(assetUrl),
        user_id: primaryId(user) || refund.user_id || refund.openid || null,
        user: buildUserTiny(user),
        payment_method: paymentMethod,
        payment_method_text: orderContract.getPaymentMethodText(paymentMethod),
        refund_channel: refundRoute.refund_channel,
        refund_target_text: orderContract.getRefundTargetText(paymentMethod, refund.refund_target_text || refund.refund_target || refund.refund_to || refund.refund_method_text || refundRoute.refund_target_text),
        wx_status: pickString(refund.wx_status || refund.wx_refund_status),
        order: order ? {
            id: primaryId(order),
            order_no: pickString(order.order_no),
            product: firstItem?.product || null,
            payment_method: paymentMethod,
            payment_method_text: orderContract.getPaymentMethodText(paymentMethod),
            pay_amount: toNumber(order.pay_amount ?? order.actual_price ?? order.total_amount, 0),
            points_used: toNumber(order.points_used, 0),
            coupon_discount: toNumber(order.coupon_discount, 0),
            refunded_cash_total: roundMoney(order.refunded_cash_total),
            remaining_refundable_cash: roundMoney(Math.max(0, toNumber(order.pay_amount ?? order.actual_price ?? order.total_amount, 0) - toNumber(order.refunded_cash_total, 0))),
            has_partial_refund: !!order.has_partial_refund
        } : {
            id: refund.order_id || null,
            order_no: pickString(refund.order_no)
        },
        items,
        order_item: firstItem,
        refund_items: refundItems,
        settlement_basis_version: pickString(refund.settlement_basis_version),
        cash_refund_amount: roundMoney(refund.cash_refund_amount ?? refund.amount),
        coupon_refund_amount: roundMoney(refund.coupon_refund_amount),
        points_refund_amount: roundMoney(refund.points_refund_amount),
        reward_points_clawback_amount: Math.max(0, toNumber(refund.reward_points_clawback_amount, 0)),
        growth_clawback_amount: Math.max(0, toNumber(refund.growth_clawback_amount, 0)),
        reject_reason: pickString(refund.reject_reason),
        return_company: pickString(refund.return_company || refund.return_shipping?.company),
        return_tracking_no: pickString(refund.return_tracking_no || refund.return_shipping?.tracking_no),
        processing_at: normalizeDateValue(refund.processing_at),
        completed_at: normalizeDateValue(refund.completed_at)
    };
}

function buildOrderSourceText(order = {}) {
    const sourceOrder = order && typeof order === 'object' ? order : {};
    const firstItem = toArray(sourceOrder.items)[0] || {};
    const orderType = pickString(sourceOrder.type || sourceOrder.order_type || firstItem.activity_type).toLowerCase();
    if (orderType === 'group' || sourceOrder.group_no || firstItem.group_no || sourceOrder.group_activity_id || firstItem.group_activity_id) {
        return '拼团订单';
    }
    if (orderType === 'slash' || sourceOrder.slash_no || firstItem.slash_no) {
        return '砍价订单';
    }
    if (pickString(sourceOrder.delivery_type) === 'pickup') {
        return '到店自提订单';
    }
    return '小程序商城订单';
}

function buildOrderProductSummary(order = {}) {
    const sourceOrder = order && typeof order === 'object' ? order : {};
    const firstItem = toArray(sourceOrder.items)[0] || {};
    return pickString(
        firstItem.snapshot_name
        || firstItem.name
        || sourceOrder.product?.name
        || sourceOrder.product_name
        || ''
    );
}

function getCommissionTypeLabel(type) {
    const normalized = pickString(type || 'other').toLowerCase();
    const labelMap = {
        direct: '直推佣金',
        indirect: '团队佣金',
        team: '团队佣金',
        same_level: '平级奖励',
        peer: '平级奖励',
        pickup_subsidy: '自提补贴',
        agent_assist: '动销奖励',
        assist: '动销奖励',
        agent_fulfillment: '发货利润',
        region_agent: '区域代理奖',
        region_b3_virtual: '虚拟B3区域佣金',
        year_end_dividend: '年终分红',
        stock_diff: '级差利润',
        gap: '级差收益',
        self: '自购返利',
        admin_deduct: '系统扣除',
        admin_credit: '系统补发',
        admin_adjustment: '系统调整'
    };
    return labelMap[normalized] || normalized || '其他';
}

function buildCommissionSourceText(commission = {}, order = {}) {
    const type = pickString(commission.type).toLowerCase();
    const sourceMap = {
        direct: '来自直推下级订单',
        indirect: '来自团队下级订单',
        same_level: '来自平级奖励结算',
        pickup_subsidy: '来自自提核销补贴',
        agent_assist: '来自代理协助奖励',
        agent_fulfillment: '来自代理发货利润',
        region_agent: '来自区域代理收益',
        region_b3_virtual: '来自虚拟B3区域佣金',
        year_end_dividend: '来自年终分红',
        stock_diff: '来自级差利润',
        gap: '来自级差收益',
        self: '来自自购返利'
    };
    return sourceMap[type] || `来自${buildOrderSourceText(order)}`;
}

function buildCommissionRecord(commission, users, orders) {
    const order = findByLookup(orders, commission.order_id || commission.order_no, (row) => [row.order_no]);
    const user = findUserByAnyId(users, commission.openid || commission.user_id || commission.receiver_openid || commission.beneficiary_openid || order?.openid || order?.buyer_id);
    const fromUser = findUserByAnyId(users, commission.from_openid || commission.source_openid || order?.openid || order?.buyer_id);
    return {
        ...commission,
        id: primaryId(commission),
        display_id: buildDisplayId(commission),
        amount: toNumber(commission.amount, 0),
        level: toNumber(commission.level || commission.commission_level, 1),
        status: pickString(commission.status || 'unknown'),
        type_text: getCommissionTypeLabel(commission.type),
        user_id: primaryId(user) || commission.user_id || commission.openid || null,
        user: buildUserTiny(user),
        from_user: buildUserTiny(fromUser),
        source_text: buildCommissionSourceText(commission, order),
        order_source_text: buildOrderSourceText(order),
        order: order ? {
            id: primaryId(order),
            order_no: pickString(order.order_no),
            source_text: buildOrderSourceText(order),
            product_summary: buildOrderProductSummary(order),
            delivery_type: pickString(order.delivery_type)
        } : {
            id: commission.order_id || null,
            order_no: pickString(commission.order_no),
            source_text: '-',
            product_summary: ''
        }
    };
}

function commissionStats(rows) {
    return rows.reduce((stats, row) => {
        const amount = toNumber(row.amount, 0);
        if (row.status === 'frozen') stats.totalFrozen += amount;
        else if (row.status === 'pending_approval') stats.totalPendingApproval += amount;
        else if (['settled', 'completed'].includes(row.status)) stats.totalSettled += amount;
        else if (row.status === 'unknown') stats.totalUnknown += amount;
        return stats;
    }, {
        totalFrozen: 0,
        totalPendingApproval: 0,
        totalSettled: 0,
        totalUnknown: 0
    });
}

function commissionOwnerRef(row) {
    return row.openid || row.user_id || row.receiver_openid || row.beneficiary_openid || null;
}

function applyUserMoneyChange(users, userRef, amount, options = {}) {
    const index = users.findIndex((user) => rowMatchesLookup(user, userRef, [user.openid, user.member_no]));
    if (index === -1) return null;
    const user = users[index];
    const currentBalance = toNumber(user.commission_balance ?? user.balance, 0);
    const currentDebt = toNumber(user.debt_amount, 0);

    if (amount >= 0) {
        const debtOffset = Math.min(currentDebt, amount);
        const credited = amount - debtOffset;
        users[index] = {
            ...user,
            balance: currentBalance + credited,
            commission_balance: currentBalance + credited,
            total_earned: toNumber(user.total_earned, 0) + credited,
            debt_amount: currentDebt - debtOffset,
            updated_at: nowIso()
        };
        return { user: users[index], credited, debt_offset: debtOffset };
    }

    const debit = Math.abs(amount);
    const paidFromBalance = Math.min(currentBalance, debit);
    const debtAdded = debit - paidFromBalance;
    users[index] = {
        ...user,
        balance: currentBalance - paidFromBalance,
        commission_balance: currentBalance - paidFromBalance,
        total_earned: Math.max(0, toNumber(user.total_earned, 0) - paidFromBalance),
        debt_amount: currentDebt + debtAdded,
        updated_at: nowIso()
    };
    if (options.reason) {
        users[index].debt_reason = debtAdded > 0 ? options.reason : user.debt_reason;
    }
    return { user: users[index], debited: paidFromBalance, debt_added: debtAdded };
}

function settleCommissionRow(row, users) {
    if (row.status === 'settled') return { row, changed: false };
    if (row.status !== 'pending_approval') {
        return { row, changed: false, blocked: true };
    }
    const amount = toNumber(row.amount, 0);
    if (amount > 0) {
        applyUserMoneyChange(users, commissionOwnerRef(row), amount, { reason: `佣金结算 ${row.order_no || row.order_id || ''}` });
    }
    return {
        row: {
            ...row,
            status: 'settled',
            approved_at: row.approved_at || nowIso(),
            settled_at: nowIso(),
            updated_at: nowIso()
        },
        changed: true
    };
}

function cancelCommissionRow(row, users, reason) {
    if (row.status === 'cancelled') return { row, changed: false };
    const amount = toNumber(row.amount, 0);
    let nextRow = {
        ...row,
        status: 'cancelled',
        cancelled_at: nowIso(),
        cancel_reason: reason || row.cancel_reason || '',
        updated_at: nowIso()
    };
    if (row.status === 'settled' && !row.clawed_back_at && amount > 0) {
        const clawback = applyUserMoneyChange(users, commissionOwnerRef(row), -amount, { reason: `退款追回佣金 ${row.order_no || row.order_id || ''}` });
        nextRow = {
            ...nextRow,
            clawed_back_at: nowIso(),
            clawback_debited: clawback?.debited || 0,
            clawback_debt_added: clawback?.debt_added || 0
        };
    }
    return { row: nextRow, changed: true };
}

function restoreFrozenCommissionsForOrder(orderId) {
    const rows = getCollection('commissions');
    let changed = 0;
    const nextRows = rows.map((row) => {
        if (!rowMatchesLookup(row, orderId, [row.order_id, row.order_no]) || row.status !== 'frozen') return row;
        changed += 1;
        return {
            ...row,
            status: 'pending',
            frozen_at: null,
            refund_deadline: null,
            updated_at: nowIso()
        };
    });
    if (changed) saveCollection('commissions', nextRows);
    return changed;
}

function cancelCommissionsForOrder(orderId, reason) {
    const rows = getCollection('commissions');
    const users = getCollection('users');
    let changed = 0;
    const nextRows = rows.map((row) => {
        if (!rowMatchesLookup(row, orderId, [row.order_id, row.order_no])) return row;
        if (!['pending', 'frozen', 'pending_approval', 'settled', 'approved'].includes(row.status)) return row;
        const result = cancelCommissionRow(row, users, reason);
        if (result.changed) changed += 1;
        return result.row;
    });
    if (changed) {
        saveCollection('users', users);
        saveCollection('commissions', nextRows);
    }
    return changed;
}

function getAgentSystemConfigValue(key, fallback) {
    const row = getCollection('configs').find((item) => item.config_key === key || item.key === key)
        || getCollection('app_configs').find((item) => item.config_key === key || item.key === key);
    return parseConfigRowValue(row, fallback);
}

function normalizePercentToRate(value, fallback = 0) {
    const num = toNumber(value, fallback);
    return num > 1 ? num / 100 : num;
}

const DEFAULT_REFERRAL_COMMISSION_MATRIX = {
    1: { 0: 20 },
    2: { 0: 30, 1: 5 },
    3: { 1: 20, 2: 10 },
    4: { 1: 30, 2: 20, 3: 10 },
    5: { 1: 35, 2: 25, 3: 15, 4: 5 }
};

function normalizeCommissionMatrixSnapshot(rawMatrix = {}, fallback = DEFAULT_REFERRAL_COMMISSION_MATRIX) {
    const result = {};
    const keys = new Set([...Object.keys(fallback || {}), ...Object.keys(rawMatrix || {})]);
    for (const parentRole of keys) {
        const base = fallback[parentRole] || {};
        const override = (rawMatrix || {})[parentRole] || {};
        const merged = {};
        for (const buyerRole of new Set([...Object.keys(base), ...Object.keys(override)])) {
            const value = toNumber(override[buyerRole] ?? base[buyerRole], NaN);
            if (Number.isFinite(value)) {
                merged[buyerRole] = value;
            }
        }
        if (Object.keys(merged).length) {
            result[parentRole] = merged;
        }
    }
    return result;
}

function matrixRateSnapshot(matrix = {}, parentRole, buyerRole) {
    const row = matrix[parentRole];
    if (!row) return 0;
    const value = toNumber(row[buyerRole], NaN);
    if (!Number.isFinite(value)) return 0;
    return value > 1 ? value / 100 : value;
}

function getReferralCommissionMatrixSnapshot() {
    const configValue = toObject(
        getConfigRowValue('agent_system_commission-matrix', getConfigRowValue('agent_system_commission_matrix', {})),
        {}
    );
    return normalizeCommissionMatrixSnapshot(configValue, DEFAULT_REFERRAL_COMMISSION_MATRIX);
}

function commissionConfigAmountForLevel(product = {}, level, baseAmount = 0) {
    const fixed = firstNumber([product[`commission_amount_${level}`], product[`commission${level}_amount`]]);
    if (fixed !== null) return roundMoney(fixed);
    const rate = firstNumber([product[`commission_rate_${level}`], product[`rate_${level}`]]);
    if (rate !== null) return roundMoney(baseAmount * rate);
    return 0;
}

function resolveSelfSaleRateSnapshot() {
    const config = toObject(
        getConfigRowValue('agent_system_commission-config', getConfigRowValue('agent_system_commission_config', {})),
        {}
    );
    const directSalesPct = toNumber(config?.cost_split?.direct_sales_pct, 40);
    const normalized = directSalesPct > 1 ? directSalesPct / 100 : directSalesPct;
    return Math.max(0, normalized);
}

function ensurePlatformSettlementCommissionsForOrder(order = {}) {
    const rows = getCollection('commissions');
    const users = getCollection('users');
    const products = getCollection('products');
    const buyer = findUserByAnyId(users, order.openid || order.buyer_id || order.user_id);
    const buyerRole = toNumber(order.buyer_role_level ?? buyer?.role_level ?? buyer?.distributor_level, 0);
    if (buyerRole >= 3 && buyer?.openid) {
        const existingSelf = rows.find((row) =>
            rowMatchesLookup(row, order._id || order.id || order.order_no, [row.order_id, row.order_no])
            && rowMatchesLookup(row, buyer.openid, [row.openid, row.user_id])
            && pickString(row.type).toLowerCase() === 'self'
            && ['pending', 'frozen', 'pending_approval', 'approved', 'settled', 'completed'].includes(pickString(row.status).toLowerCase())
        );
        if (existingSelf) return 0;

        const payAmount = roundMoney(toNumber(order.pay_amount ?? order.actual_price ?? order.total_amount, 0));
        const selfSaleRate = resolveSelfSaleRateSnapshot();
        const selfAmount = roundMoney(payAmount * selfSaleRate);
        if (selfAmount <= 0) return 0;

        rows.push({
            id: nextId(rows),
            status: 'pending',
            created_at: nowIso(),
            updated_at: nowIso(),
            openid: buyer.openid,
            user_id: primaryId(buyer) || buyer.openid,
            from_openid: order.openid || order.buyer_id || '',
            buyer_role: buyerRole,
            order_id: order._id || order.id || null,
            order_no: pickString(order.order_no),
            amount: selfAmount,
            level: buyerRole,
            type: 'self',
            self_sale_rate: selfSaleRate,
            self_sale_profit_amount: selfAmount,
            self_sale_goods_value_amount: roundMoney(payAmount - selfAmount)
        });
        saveCollection('commissions', rows);
        return 1;
    }

    const directReferrer = findUserByAnyId(users, order.direct_referrer_openid || order.direct_referrer_id || getUserParentRef(buyer || {}));
    const indirectReferrer = findUserByAnyId(users, order.indirect_referrer_openid || order.indirect_referrer_id || getUserParentRef(directReferrer || {}));
    const beneficiaries = [
        { level: 1, type: 'direct', user: directReferrer },
        { level: 2, type: 'indirect', user: indirectReferrer }
    ].filter((item) => item.user && item.user.openid && item.user.openid !== order.openid);
    if (!beneficiaries.length) return 0;

    const orderItems = buildOrderItemsForResolution(order);
    const payAmount = roundMoney(toNumber(order.pay_amount ?? order.actual_price ?? order.total_amount, 0));
    if (payAmount <= 0) return 0;

    const matrix = getReferralCommissionMatrixSnapshot();
    const itemBaseTotal = orderItems.reduce((sum, item) => {
        const qty = Math.max(1, toNumber(item.qty ?? item.quantity, 1));
        return sum + roundMoney(item.subtotal ?? item.item_amount ?? (toNumber(item.price || item.unit_price, 0) * qty));
    }, 0) || payAmount;

    const totals = new Map();
    for (const item of orderItems) {
        const qty = Math.max(1, toNumber(item.qty ?? item.quantity, 1));
        const product = findByLookup(products, item.product_id) || {};
        const rawBase = roundMoney(item.subtotal ?? item.item_amount ?? (toNumber(item.price || item.unit_price, 0) * qty));
        const allocatedBase = itemBaseTotal > 0 ? roundMoney(payAmount * rawBase / itemBaseTotal) : rawBase;
        const directBeneficiary = beneficiaries.find((entry) => entry.level === 1);
        const directRole = directBeneficiary
            ? toNumber(directBeneficiary.user.role_level ?? directBeneficiary.user.distributor_level ?? directBeneficiary.user.level, 0)
            : 0;
        const directMatrixRate = directBeneficiary ? matrixRateSnapshot(matrix, directRole, buyerRole) : 0;

        for (const beneficiary of beneficiaries) {
            const existing = rows.find((row) =>
                rowMatchesLookup(row, order._id || order.id || order.order_no, [row.order_id, row.order_no])
                && rowMatchesLookup(row, beneficiary.user.openid, [row.openid, row.user_id])
                && pickString(row.type).toLowerCase() === beneficiary.type
                && ['pending', 'frozen', 'pending_approval', 'approved', 'settled', 'completed'].includes(pickString(row.status).toLowerCase())
            );
            if (existing) continue;

            const configured = commissionConfigAmountForLevel(product, beneficiary.level, allocatedBase);
            let amount = 0;
            if (configured > 0) {
                amount = Math.min(allocatedBase, configured);
            } else {
                const roleLevel = toNumber(beneficiary.user.role_level ?? beneficiary.user.distributor_level ?? beneficiary.user.level, 0);
                const myRate = matrixRateSnapshot(matrix, roleLevel, buyerRole);
                const effectiveRate = beneficiary.level === 1 ? myRate : Math.max(0, myRate - directMatrixRate);
                amount = roundMoney(allocatedBase * effectiveRate);
            }
            if (amount <= 0) continue;

            const key = `${beneficiary.user.openid}:${beneficiary.level}:${beneficiary.type}`;
            totals.set(key, {
                openid: beneficiary.user.openid,
                user_id: primaryId(beneficiary.user) || beneficiary.user.openid,
                from_openid: order.openid || order.buyer_id || '',
                order_id: order._id || order.id || null,
                order_no: pickString(order.order_no),
                amount: roundMoney((totals.get(key)?.amount || 0) + amount),
                level: beneficiary.level,
                type: beneficiary.type
            });
        }
    }

    let created = 0;
    for (const row of totals.values()) {
        rows.push({
            id: nextId(rows),
            status: 'pending',
            created_at: nowIso(),
            updated_at: nowIso(),
            buyer_role: buyerRole,
            ...row
        });
        created += 1;
    }
    if (created > 0) {
        saveCollection('commissions', rows);
    }
    return created;
}

async function deductAgentFulfillmentGoodsFund(order = {}, admin = {}) {
    const claimantRef = order?.fulfillment_partner_openid || order?.nearest_agent_openid || order?.agent_info?.openid || order?.agent?.openid || null;
    const users = getCollection('users');
    const claimant = claimantRef ? findUserByAnyId(users, claimantRef) : null;
    if (!claimant?.openid) {
        return { ok: false, reason: '当前订单未锁定履约代理' };
    }

    const amount = roundMoney(toNumber(order.locked_agent_cost_total ?? order.locked_agent_cost, 0));
    if (amount <= 0) {
        return { ok: false, reason: '当前订单缺少锁定代理成本' };
    }

    const currentGoodsFund = roundMoney(toNumber(claimant.agent_wallet_balance != null ? claimant.agent_wallet_balance : claimant.wallet_balance, 0));
    if (currentGoodsFund < amount) {
        return {
            ok: false,
            insufficient: true,
            claimant,
            amount,
            balance: currentGoodsFund
        };
    }

    const nextGoodsFund = roundMoney(currentGoodsFund - amount);
    const userDocId = pickString(claimant._id || claimant.id);
    const walletAccounts = getCollection('wallet_accounts');
    const existingWalletAccount = findWalletAccountByUser(walletAccounts, claimant);
    const walletAccountId = primaryId(existingWalletAccount) || buildWalletAccountDocId(claimant);
    const previousWalletBalance = roundMoney(toNumber(existingWalletAccount?.balance, currentGoodsFund));
    const db = dataStore._internals?.db;

    const rollback = async () => {
        if (db) {
            await db.collection('users').where({ openid: claimant.openid }).update({
                data: {
                    agent_wallet_balance: currentGoodsFund,
                    updated_at: nowIso()
                }
            }).catch(() => {});
            if (walletAccountId) {
                await db.collection('wallet_accounts').doc(String(walletAccountId)).set({
                    data: {
                        ...(existingWalletAccount || {
                            user_id: getWalletAccountUserIds(claimant)[0],
                            openid: claimant.openid,
                            account_type: 'goods_fund',
                            status: 'active',
                            created_at: pickString(existingWalletAccount?.created_at || nowIso())
                        }),
                        balance: previousWalletBalance,
                        updated_at: nowIso()
                    }
                }).catch(() => {});
            }
        } else {
            patchCollectionRow('users', claimant.openid || primaryId(claimant), (row) => ({
                ...row,
                agent_wallet_balance: currentGoodsFund,
                updated_at: nowIso()
            }));
            if (walletAccountId) {
                const currentWallets = getCollection('wallet_accounts');
                const index = currentWallets.findIndex((item) => rowMatchesLookup(item, walletAccountId, [item.user_id, item.openid]));
                const restoredRow = {
                    ...(existingWalletAccount || {
                        _id: walletAccountId,
                        id: walletAccountId,
                        user_id: getWalletAccountUserIds(claimant)[0],
                        openid: claimant.openid,
                        account_type: 'goods_fund',
                        status: 'active',
                        created_at: nowIso()
                    }),
                    balance: previousWalletBalance,
                    updated_at: nowIso()
                };
                if (index >= 0) currentWallets[index] = restoredRow;
                else currentWallets.push(restoredRow);
                saveCollection('wallet_accounts', currentWallets);
            }
        }
    };

    if (db) {
        const deductRes = await db.collection('users')
            .where({ openid: claimant.openid, agent_wallet_balance: _.gte(amount) })
            .update({
                data: {
                    agent_wallet_balance: _.inc(-amount),
                    updated_at: nowIso()
                }
            });
        if (!deductRes.stats || deductRes.stats.updated === 0) {
            const refreshedUser = await db.collection('users').where({ openid: claimant.openid }).limit(1).get().catch(() => ({ data: [] }));
            const actualBalance = roundMoney(toNumber(refreshedUser.data?.[0]?.agent_wallet_balance, currentGoodsFund));
            return {
                ok: false,
                insufficient: true,
                claimant,
                amount,
                balance: actualBalance
            };
        }
        if (walletAccountId) {
            await db.collection('wallet_accounts').doc(String(walletAccountId)).set({
                data: {
                    ...(existingWalletAccount || {
                        user_id: getWalletAccountUserIds(claimant)[0],
                        openid: claimant.openid,
                        account_type: 'goods_fund',
                        status: 'active',
                        created_at: pickString(existingWalletAccount?.created_at || nowIso())
                    }),
                    balance: nextGoodsFund,
                    updated_at: nowIso()
                }
            });
        }
    } else {
        patchCollectionRow('users', claimant.openid || primaryId(claimant), (row) => ({
            ...row,
            agent_wallet_balance: nextGoodsFund,
            updated_at: nowIso()
        }));
        if (walletAccountId) {
            const currentWallets = getCollection('wallet_accounts');
            const index = currentWallets.findIndex((item) => rowMatchesLookup(item, walletAccountId, [item.user_id, item.openid]));
            const nextRow = {
                ...(existingWalletAccount || {
                    _id: walletAccountId,
                    id: walletAccountId,
                    user_id: getWalletAccountUserIds(claimant)[0],
                    openid: claimant.openid,
                    account_type: 'goods_fund',
                    status: 'active',
                    created_at: nowIso()
                }),
                balance: nextGoodsFund,
                updated_at: nowIso()
            };
            if (index >= 0) currentWallets[index] = nextRow;
            else currentWallets.push(nextRow);
            saveCollection('wallet_accounts', currentWallets);
        }
    }

    try {
        await appendGoodsFundLogEntry({
            openid: claimant.openid,
            type: 'order_ship',
            amount: -amount,
            balance_before: currentGoodsFund,
            balance_after: nextGoodsFund,
            user_id: primaryId(claimant),
            order_id: pickString(order._id || order.id),
            order_no: pickString(order.order_no),
            remark: `代理发货扣货款 ${pickString(order.order_no)}`,
            operator_id: admin?.id || '',
            operator_name: admin?.username || '管理员'
        });
    } catch (error) {
        await rollback();
        return { ok: false, reason: `代理货款流水写入失败：${error.message || '未知错误'}` };
    }

    return {
        ok: true,
        claimant,
        amount,
        balance_before: currentGoodsFund,
        balance_after: nextGoodsFund,
        rollback
    };
}

function createCommissionEntry(payload = {}) {
    const rows = getCollection('commissions');
    const row = {
        id: nextId(rows),
        status: 'pending_approval',
        created_at: nowIso(),
        updated_at: nowIso(),
        ...payload
    };
    rows.push(row);
    saveCollection('commissions', rows);
    return row;
}

function collectReferralChain(users, buyer, maxDepth = 8) {
    const chain = [];
    const seen = new Set();
    let currentRef = getUserParentRef(buyer);
    while (currentRef && chain.length < maxDepth) {
        const nextUser = findUserByAnyId(users, currentRef);
        if (!nextUser) break;
        const key = String(primaryId(nextUser) || nextUser.openid || '');
        if (!key || seen.has(key)) break;
        seen.add(key);
        chain.push(nextUser);
        currentRef = getUserParentRef(nextUser);
    }
    return chain;
}

function buildOrderItemsForResolution(order = {}) {
    const items = toArray(order.items);
    if (items.length) return items;
    return [{
        product_id: order.product_id,
        qty: order.qty ?? order.quantity ?? 1,
        quantity: order.qty ?? order.quantity ?? 1,
        item_amount: toNumber(order.pay_amount ?? order.actual_price ?? order.total_amount, 0)
    }];
}

function resolveLockedAgentUnitCostForOrderItem(orderItem = {}, product = {}, roleLevel = 0) {
    const explicit = toNumber(orderItem.locked_agent_cost, NaN);
    if (Number.isFinite(explicit) && explicit > 0) return explicit;
    return resolveSupplyPriceByRole(product, roleLevel);
}

function buildOrderFulfillmentResolution(order = {}, users = [], products = []) {
    const buyer = findUserByAnyId(users, order.openid) || findUserByAnyId(users, order.buyer_id) || findUserByAnyId(users, order.user_id) || null;
    const referralChain = buyer ? collectReferralChain(users, buyer) : [];
    const directReferrer = referralChain[0] || null;
    const indirectReferrer = referralChain[1] || null;
    const nearestAgent = (pickString(order.delivery_type || 'express') === 'express')
        ? (referralChain.find((user) => getUserRoleLevel(user) >= 3) || null)
        : null;
    const nearestAgentRoleLevel = nearestAgent ? normalizeAgentRoleLevel(getUserRoleLevel(nearestAgent)) : 0;
    const items = buildOrderItemsForResolution(order);
    const canCandidateFulfill = !!nearestAgent && nearestAgentRoleLevel > 0;
    let canAgentFulfill = canCandidateFulfill;
    let lockedAgentCostTotal = 0;
    const normalizedItems = items.map((item) => {
        const qty = Math.max(1, toNumber(item.qty ?? item.quantity, 1));
        const product = findByLookup(products, item.product_id) || null;
        const lockedAgentCost = canCandidateFulfill ? resolveLockedAgentUnitCostForOrderItem(item, product || {}, nearestAgentRoleLevel) : null;
        if (canAgentFulfill && !(Number.isFinite(lockedAgentCost) && lockedAgentCost > 0)) {
            canAgentFulfill = false;
        }
        return {
            ...item,
            qty,
            quantity: qty,
            locked_agent_cost: Number.isFinite(lockedAgentCost) && lockedAgentCost > 0 ? roundMoney(lockedAgentCost) : null,
            locked_agent_cost_total: Number.isFinite(lockedAgentCost) && lockedAgentCost > 0 ? roundMoney(lockedAgentCost * qty) : null
        };
    });
    const finalizedItems = normalizedItems.map((item) => {
        if (!canAgentFulfill) {
            return {
                ...item,
                locked_agent_cost: null,
                locked_agent_cost_total: null
            };
        }
        lockedAgentCostTotal += toNumber(item.locked_agent_cost_total, 0);
        return item;
    });
    return {
        buyer,
        directReferrer,
        indirectReferrer,
        nearestAgent,
        fulfillmentPartner: canAgentFulfill ? nearestAgent : null,
        fulfillmentType: canAgentFulfill ? 'agent' : 'platform',
        lockedAgentCostTotal: canAgentFulfill ? roundMoney(lockedAgentCostTotal) : 0,
        items: finalizedItems
    };
}

function removeConflictingReferralCommissions(order = {}, claimant = null) {
    if (!claimant?.openid) return 0;
    const users = getCollection('users');
    const rows = getCollection('commissions');
    let changed = 0;
    const nextRows = rows.map((row) => {
        if (!rowMatchesLookup(row, order._id || order.id || order.order_no, [row.order_id, row.order_no])) return row;
        if (!rowMatchesLookup(row, claimant.openid, [row.openid, row.user_id])) return row;
        if (!['direct', 'indirect'].includes(pickString(row.type).toLowerCase())) return row;
        const result = cancelCommissionRow(row, users, '履约利润优先，推荐佣金归零');
        if (result.changed) changed += 1;
        return result.row;
    });
    if (changed) {
        saveCollection('users', users);
        saveCollection('commissions', nextRows);
    }
    return changed;
}

function ensureAgentFulfillmentCommissionForOrder(order) {
    if (pickString(order?.type).trim().toLowerCase() === 'exchange') return null;
    const fulfillmentType = pickString(order?.fulfillment_type).trim().toLowerCase();
    if (fulfillmentType !== 'agent') return null;
    const claimantRef = order?.fulfillment_partner_openid || order?.nearest_agent_openid || order?.agent_info?.openid || order?.agent?.openid || null;
    if (!claimantRef) return null;
    const users = getCollection('users');
    const claimant = findUserByAnyId(users, claimantRef);
    if (!claimant?.openid) return null;
    const rows = getCollection('commissions');
    const existing = rows.find((row) =>
        rowMatchesLookup(row, order._id || order.id || order.order_no, [row.order_id, row.order_no])
        && pickString(row.type).toLowerCase() === 'agent_fulfillment'
        && rowMatchesLookup(row, claimant.openid, [row.openid, row.user_id])
    );
    if (existing) return existing;
    const payAmount = roundMoney(toNumber(order.pay_amount ?? order.actual_price ?? order.total_amount, 0));
    const lockedAgentCost = roundMoney(toNumber(order.locked_agent_cost_total ?? order.locked_agent_cost, 0));
    const amount = roundMoney(payAmount - lockedAgentCost);
    if (amount <= 0) return null;
    removeConflictingReferralCommissions(order, claimant);
    return createCommissionEntry({
        openid: claimant.openid,
        user_id: primaryId(claimant) || claimant.openid,
        from_openid: order.openid || order.buyer_id || '',
        order_id: order._id || order.id || null,
        order_no: pickString(order.order_no),
        amount,
        level: getUserRoleLevel(claimant),
        type: 'agent_fulfillment',
        locked_agent_cost: lockedAgentCost,
        pay_amount: payAmount,
        description: `代理发货利润：实付 ${payAmount} - 锁定成本 ${lockedAgentCost}`
    });
}

function repairOrderFulfillmentChain(orderId) {
    const orders = getCollection('orders');
    const products = getCollection('products');
    const users = getCollection('users');
    const commissions = getCollection('commissions');
    const current = findByLookup(orders, orderId, (row) => [row.order_no]);
    if (!current) return { ok: false, message: '订单不存在' };
    const status = pickString(current.status).toLowerCase();
    if (['shipped', 'completed', 'refunding', 'refunded', 'cancelled'].includes(status)) {
        return { ok: false, message: `当前状态不允许修复履约链：${current.status || '-'}` };
    }
    const hasSettledCommission = commissions.some((row) =>
        rowMatchesLookup(row, primaryId(current) || current.order_no, [row.order_id, row.order_no])
        && ['settled', 'completed'].includes(pickString(row.status).toLowerCase())
    );
    if (hasSettledCommission) {
        return { ok: false, message: '订单已发生佣金结算，不允许自动修复履约链' };
    }
    const resolution = buildOrderFulfillmentResolution(current, users, products);
    const patched = patchOrder(orderId, (row) => ({
        ...row,
        items: resolution.items,
        direct_referrer_id: resolution.directReferrer ? primaryId(resolution.directReferrer) : '',
        direct_referrer_openid: pickString(resolution.directReferrer?.openid),
        direct_referrer_role_level: resolution.directReferrer ? getUserRoleLevel(resolution.directReferrer) : 0,
        indirect_referrer_id: resolution.indirectReferrer ? primaryId(resolution.indirectReferrer) : '',
        indirect_referrer_openid: pickString(resolution.indirectReferrer?.openid),
        indirect_referrer_role_level: resolution.indirectReferrer ? getUserRoleLevel(resolution.indirectReferrer) : 0,
        nearest_agent_id: resolution.nearestAgent ? primaryId(resolution.nearestAgent) : '',
        nearest_agent_openid: pickString(resolution.nearestAgent?.openid),
        nearest_agent_role_level: resolution.nearestAgent ? normalizeAgentRoleLevel(getUserRoleLevel(resolution.nearestAgent)) : 0,
        fulfillment_partner_id: resolution.fulfillmentPartner ? primaryId(resolution.fulfillmentPartner) : '',
        fulfillment_partner_openid: pickString(resolution.fulfillmentPartner?.openid),
        fulfillment_partner_role_level: resolution.fulfillmentPartner ? getUserRoleLevel(resolution.fulfillmentPartner) : 0,
        distributor: buildUserRelationSummary(resolution.directReferrer),
        agent: buildUserRelationSummary(resolution.fulfillmentPartner),
        agent_info: buildUserRelationSummary(resolution.fulfillmentPartner),
        fulfillment_type: resolution.fulfillmentType,
        locked_agent_cost: resolution.fulfillmentType === 'agent' ? resolution.lockedAgentCostTotal : null,
        locked_agent_cost_total: resolution.fulfillmentType === 'agent' ? resolution.lockedAgentCostTotal : null,
        middle_commission_total: resolution.fulfillmentType === 'agent' ? roundMoney(toNumber(row.middle_commission_total, 0)) : 0,
        referrer_openid: pickString(resolution.directReferrer?.openid),
        updated_at: nowIso()
    }));
    return patched
        ? { ok: true, order: patched }
        : { ok: false, message: '订单修复失败' };
}

function resolveUserReferrer(user = {}) {
    return user.referrer_openid
        || user.parent_openid
        || user.parent_id
        || user.referrer_id
        || user.inviter_openid
        || user.inviter_id
        || null;
}

function findAssistParentUser(childUser, users) {
    const parentRef = resolveUserReferrer(childUser || {});
    return parentRef ? findUserByAnyId(users, parentRef) : null;
}

function resolveAssistBonusAmount(config = {}, countBefore = 0) {
    const tiers = Array.isArray(config.tiers) ? [...config.tiers] : [];
    if (!tiers.length) return 0;
    const countAfter = countBefore + 1;
    const normalized = tiers
        .map((item) => ({
            max_orders: Math.max(1, Math.floor(toNumber(item.max_orders, 0))),
            bonus: Math.max(0, toNumber(item.bonus, 0))
        }))
        .filter((item) => item.max_orders > 0 && item.bonus >= 0)
        .sort((a, b) => a.max_orders - b.max_orders);
    const matched = normalized.find((item) => countAfter <= item.max_orders);
    return toNumber((matched || normalized[normalized.length - 1] || {}).bonus, 0);
}

function ensureAgentAssistCommissionForOrder(order) {
    if (pickString(order?.type).trim().toLowerCase() === 'exchange') return null;
    const fulfillmentType = pickString(order?.fulfillment_type || order?.type).trim().toLowerCase();
    if (fulfillmentType !== 'agent') return null;

    const assistConfig = getAgentSystemConfigValue('agent_system_assist-bonus', { enabled: false, tiers: [] });
    if (!assistConfig || assistConfig.enabled === false) return null;

    const users = getCollection('users');
    const childRef = order?.fulfillment_partner_openid || order?.agent_info?.openid || order?.agent?.openid || order?.nearest_agent_openid || null;
    const childUser = childRef ? findUserByAnyId(users, childRef) : null;
    if (!childUser) return null;
    const parentUser = findAssistParentUser(childUser, users);
    if (!parentUser || !parentUser.openid) return null;

    const parentRole = toNumber(parentUser.role_level ?? parentUser.distributor_level, 0);
    const childRole = toNumber(childUser.role_level ?? childUser.distributor_level, 0);
    if (parentRole <= childRole) return null;

    const rows = getCollection('commissions');
    const existing = rows.find((row) =>
        rowMatchesLookup(row, order._id || order.id || order.order_no, [row.order_id, row.order_no])
        && pickString(row.type).toLowerCase() === 'agent_assist'
        && rowMatchesLookup(row, parentUser.openid, [row.openid, row.user_id])
    );
    if (existing) return existing;

    const historicalCount = rows.filter((row) =>
        pickString(row.type).toLowerCase() === 'agent_assist'
        && rowMatchesLookup(row, parentUser.openid, [row.openid, row.user_id])
    ).length;
    const amount = resolveAssistBonusAmount(assistConfig, historicalCount);
    if (amount <= 0) return null;

    return createCommissionEntry({
        openid: parentUser.openid,
        user_id: primaryId(parentUser) || parentUser.openid,
        from_openid: childUser.openid || childRef,
        order_id: order._id || order.id || null,
        order_no: pickString(order.order_no),
        amount,
        level: parentRole,
        type: 'agent_assist',
        assist_child_role_level: childRole,
        assist_parent_role_level: parentRole,
        description: `协助奖：上级代理协助 ${pickString(childUser.role_name || getUserNickname(childUser))} 发货`
    });
}

function getExitRefundPreview(user, commissions = []) {
    const walletRaw = toNumber(user?.agent_wallet_balance ?? user?.wallet_balance, 0);
    const hasSeparateCommissionBalance = user?.commission_balance != null || (
        user?.balance != null
        && user?.wallet_balance != null
        && toNumber(user.balance, 0) !== toNumber(user.wallet_balance, 0)
    );
    const balanceRaw = hasSeparateCommissionBalance
        ? toNumber(user?.commission_balance ?? user?.balance, 0)
        : 0;
    const pendingCommission = commissions
        .filter((row) => ['pending', 'frozen', 'pending_approval', 'approved'].includes(pickString(row.status)))
        .reduce((sum, row) => sum + toNumber(row.amount, 0), 0);

    return {
        walletRefund: Math.max(0, roundMoney(walletRaw)),
        balanceRefund: Math.max(0, roundMoney(balanceRaw)),
        pendingCommission,
        refundAmount: Math.max(0, roundMoney(walletRaw + balanceRaw))
    };
}

function revokeAgentIdentity(user = {}, exitRules = {}) {
    if (exitRules.auto_revoke_identity === false) return user;
    return {
        ...user,
        role_level: 0,
        role_name: '普通用户',
        distributor_level: 0,
        agent_level: 0,
        participate_distribution: 0,
        discount_rate: 1,
        updated_at: nowIso()
    };
}

function getOrderTotalQuantity(order = {}) {
    const explicit = Math.max(0, toNumber(order.quantity, 0));
    if (explicit > 0) return explicit;
    return toArray(order.items).reduce((sum, item) => {
        return sum + Math.max(1, toNumber(item.qty ?? item.quantity, 1));
    }, 0);
}

function getOrderRefundProgress(order = {}) {
    const totalQuantity = getOrderTotalQuantity(order);
    const payAmount = roundMoney(toNumber(order.pay_amount ?? order.actual_price ?? order.total_amount, 0));
    const refundedQuantity = Math.max(0, toNumber(order.refunded_quantity_total, 0));
    const refundedCash = roundMoney(Math.max(0, toNumber(order.refunded_cash_total, 0)));
    return {
        totalQuantity,
        payAmount,
        refundedQuantity,
        refundedCash
    };
}

function allocateProportionalAmounts(items = [], totalAmount = 0, field = 'item_amount') {
    const total = roundMoney(totalAmount);
    if (total <= 0 || !Array.isArray(items) || items.length === 0) return items.map(() => 0);
    const baseValues = items.map((item) => Math.max(0, roundMoney(item && item[field])));
    const baseTotal = roundMoney(baseValues.reduce((sum, value) => sum + value, 0));
    if (baseTotal <= 0) return items.map((_, index) => index === items.length - 1 ? total : 0);

    let allocatedSum = 0;
    return items.map((item, index) => {
        if (index === items.length - 1) return roundMoney(total - allocatedSum);
        const allocated = roundMoney(total * (baseValues[index] / baseTotal));
        allocatedSum = roundMoney(allocatedSum + allocated);
        return allocated;
    });
}

function buildOrderSettlementItems(order = {}) {
    const rawItems = toArray(order.items);
    const hasSnapshot = rawItems.some((item) => item && item.refund_basis_version === 'snapshot_v1');
    const couponAllocations = hasSnapshot
        ? rawItems.map((item) => roundMoney(item.coupon_allocated_amount))
        : allocateProportionalAmounts(rawItems, toNumber(order.coupon_discount, 0), 'item_amount');
    const pointsAllocations = hasSnapshot
        ? rawItems.map((item) => roundMoney(item.points_allocated_amount))
        : allocateProportionalAmounts(rawItems, toNumber(order.points_discount, 0), 'item_amount');

    return rawItems.map((item, index) => {
        const quantity = Math.max(1, toNumber(item.qty ?? item.quantity, 1));
        const itemAmount = roundMoney(item.item_amount != null ? item.item_amount : item.subtotal);
        const couponAllocatedAmount = roundMoney(couponAllocations[index]);
        const pointsAllocatedAmount = roundMoney(pointsAllocations[index]);
        const cashPaidAllocatedAmount = roundMoney(
            item.cash_paid_allocated_amount != null
                ? item.cash_paid_allocated_amount
                : (itemAmount - couponAllocatedAmount - pointsAllocatedAmount)
        );
        const refundedQuantity = Math.max(0, Math.min(quantity, toNumber(item.refunded_quantity, 0)));
        const refundedCashAmount = roundMoney(Math.max(0, Math.min(cashPaidAllocatedAmount, toNumber(item.refunded_cash_amount, 0))));
        return {
            ...item,
            refund_item_key: item.refund_item_key || `${item.product_id || 'product'}::${item.sku_id || 'nosku'}::${index}`,
            quantity,
            qty: quantity,
            cash_paid_allocated_amount: cashPaidAllocatedAmount,
            refunded_quantity: refundedQuantity,
            refunded_cash_amount: refundedCashAmount,
            refundable_quantity: Math.max(0, quantity - refundedQuantity),
            refundable_cash_amount: roundMoney(Math.max(0, cashPaidAllocatedAmount - refundedCashAmount)),
            refund_basis_version: item.refund_basis_version || (hasSnapshot ? 'snapshot_v1' : 'legacy_estimated')
        };
    });
}

function normalizeRequestedRefundItems(rawItems = []) {
    return toArray(rawItems)
        .map((item) => ({
            refund_item_key: pickString(item.refund_item_key),
            product_id: pickString(item.product_id),
            sku_id: pickString(item.sku_id),
            quantity: Math.max(0, toNumber(item.quantity ?? item.qty, 0))
        }))
        .filter((item) => item.quantity > 0);
}

function inferRefundQuantityEffective(order = {}, refund = {}) {
    const progress = getOrderRefundProgress(order);
    const explicit = Math.max(
        0,
        toNumber(
            refund.refund_quantity_effective != null ? refund.refund_quantity_effective : refund.refund_quantity,
            0
        )
    );
    if (explicit > 0) return explicit;
    return Math.max(1, progress.totalQuantity - progress.refundedQuantity || progress.totalQuantity || 1);
}

function isFullRefundAfterSettlement(order = {}, refund = {}) {
    const progress = getOrderRefundProgress(order);
    const refundQuantity = inferRefundQuantityEffective(order, refund);
    const refundAmount = roundMoney(toNumber(refund.amount ?? refund.refund_amount, 0));
    const nextQuantity = Math.min(progress.totalQuantity, progress.refundedQuantity + refundQuantity);
    const nextCash = Math.min(progress.payAmount, roundMoney(progress.refundedCash + refundAmount));
    return nextQuantity >= Math.max(1, progress.totalQuantity) || nextCash >= progress.payAmount;
}

function buildRefundItemAllocations(order = {}, refundQuantity = 0, refund = {}) {
    const refundItems = normalizeRequestedRefundItems(refund.refund_items);
    if (refundItems.length > 0) {
        const settlementItems = buildOrderSettlementItems(order);
        return refundItems.map((selection) => {
            const target = settlementItems.find((item) => {
                if (selection.refund_item_key && item.refund_item_key === selection.refund_item_key) return true;
                return item.product_id === selection.product_id && String(item.sku_id || '') === String(selection.sku_id || '');
            });
            return target ? { item: target, qty: selection.quantity } : null;
        }).filter(Boolean);
    }

    let remaining = Math.max(0, toNumber(refundQuantity, 0));
    const allocations = [];

    for (const item of buildOrderSettlementItems(order)) {
        if (remaining <= 0) break;
        const itemQty = Math.max(1, toNumber(item.qty ?? item.quantity, 1));
        const restoredQty = Math.min(itemQty, remaining);
        if (restoredQty > 0) {
            allocations.push({ item, qty: restoredQty });
            remaining -= restoredQty;
        }
    }

    return allocations;
}

function hasRefundProgressApplied(order = {}, refund = {}) {
    if (refund.order_progress_applied_at) return true;
    const hasSnapshots = refund.order_refunded_quantity_before != null || refund.order_refunded_cash_before != null;
    if (!hasSnapshots) return false;
    const refundQuantity = inferRefundQuantityEffective(order, refund);
    const expectedQuantity = Math.max(0, toNumber(refund.order_refunded_quantity_before, 0)) + refundQuantity;
    const expectedCash = roundMoney(toNumber(refund.order_refunded_cash_before, 0) + toNumber(refund.amount ?? refund.refund_amount, 0));
    return toNumber(order.refunded_quantity_total, 0) >= expectedQuantity
        || roundMoney(toNumber(order.refunded_cash_total, 0)) >= expectedCash;
}

function buildOrderPatchAfterRefund(order = {}, refund = {}) {
    if (hasRefundProgressApplied(order, refund)) {
        return {
            isFullRefund: pickString(order.status) === 'refunded',
            refundQuantity: inferRefundQuantityEffective(order, refund),
            refundAmount: roundMoney(toNumber(refund.amount ?? refund.refund_amount, 0)),
            rewardPointsClawback: Math.max(0, toNumber(refund.reward_points_clawback_amount, 0)),
            growthClawback: Math.max(0, toNumber(refund.growth_clawback_amount, 0)),
            patch: {
                items: toArray(order.items),
                refunded_quantity_total: toNumber(order.refunded_quantity_total, 0),
                refunded_cash_total: roundMoney(toNumber(order.refunded_cash_total, 0)),
                last_refunded_at: order.last_refunded_at || nowIso(),
                partially_refunded_at: order.partially_refunded_at || null,
                status: pickString(order.status || inferRefundResumeOrderStatus(order)),
                refunded_at: order.refunded_at || null,
                prev_status: null,
                updated_at: nowIso()
            }
        };
    }

    const progress = getOrderRefundProgress(order);
    const refundQuantity = inferRefundQuantityEffective(order, refund);
    const refundAmount = roundMoney(toNumber(refund.amount ?? refund.refund_amount, 0));
    const nextRefundedQuantity = Math.min(progress.totalQuantity, progress.refundedQuantity + refundQuantity);
    const nextRefundedCash = Math.min(progress.payAmount, roundMoney(progress.refundedCash + refundAmount));
    const isFullRefund = isFullRefundAfterSettlement(order, refund);
    const resumedStatus = inferRefundResumeOrderStatus(order);
    const refundItems = toArray(refund.refund_items);
    const keyedRefundItems = new Map(refundItems.map((item) => [pickString(item.refund_item_key), item]));
    const nextOrderItems = buildOrderSettlementItems(order).map((item) => {
        const matched = keyedRefundItems.get(pickString(item.refund_item_key));
        if (!matched) return item;
        return {
            ...item,
            refunded_quantity: Math.min(item.quantity, item.refunded_quantity + Math.max(0, toNumber(matched.quantity, 0))),
            refunded_cash_amount: Math.min(item.cash_paid_allocated_amount, roundMoney(item.refunded_cash_amount + toNumber(matched.cash_refund_amount, 0)))
        };
    });
    const totalPointsEarned = Math.max(0, toNumber(order.points_earned, 0));
    const totalGrowthEarned = Math.max(0, Math.floor(toNumber(order.pay_amount ?? order.actual_price ?? order.total_amount, 0)));
    const rewardPointsClawedBefore = Math.max(0, toNumber(order.reward_points_clawback_total, 0));
    const growthClawedBefore = Math.max(0, toNumber(order.growth_clawback_total, 0));
    const rewardPointsClawback = isFullRefund
        ? Math.max(0, totalPointsEarned - rewardPointsClawedBefore)
        : Math.max(0, Math.min(totalPointsEarned - rewardPointsClawedBefore, Math.round(totalPointsEarned * (refundAmount / Math.max(progress.payAmount, 0.01)))));
    const growthClawback = isFullRefund
        ? Math.max(0, totalGrowthEarned - growthClawedBefore)
        : Math.max(0, Math.min(totalGrowthEarned - growthClawedBefore, Math.round(totalGrowthEarned * (refundAmount / Math.max(progress.payAmount, 0.01)))));

    return {
        isFullRefund,
        refundQuantity,
        refundAmount,
        rewardPointsClawback,
        growthClawback,
        patch: {
            items: nextOrderItems,
            refunded_quantity_total: nextRefundedQuantity,
            refunded_cash_total: nextRefundedCash,
            reward_points_clawback_total: rewardPointsClawedBefore + rewardPointsClawback,
            growth_clawback_total: growthClawedBefore + growthClawback,
            has_partial_refund: !isFullRefund && nextRefundedCash > 0,
            last_refunded_at: nowIso(),
            partially_refunded_at: isFullRefund ? null : nowIso(),
            status: isFullRefund ? 'refunded' : resumedStatus,
            refunded_at: isFullRefund ? nowIso() : null,
            prev_status: null,
            updated_at: nowIso()
        }
    };
}

function restoreOrderStockForRefund(orderId, refund = {}) {
    const orders = getCollection('orders');
    const orderIndex = orders.findIndex((order) => rowMatchesLookup(order, orderId, [order.order_no]));
    if (orderIndex === -1) return { restored: 0 };
    const order = orders[orderIndex];
    if (pickString(refund.type) !== 'return_refund') return { restored: 0, skipped: true };
    if (!order.stock_deducted_at || refund.stock_restored_at) return { restored: 0 };

    const products = getCollection('products');
    const skus = getCollection('skus');
    const refundQuantity = inferRefundQuantityEffective(order, refund);
    const allocations = buildRefundItemAllocations(order, refundQuantity, refund);
    let restored = 0;

    allocations.forEach(({ item, qty }) => {
        const productIndex = products.findIndex((product) => rowMatchesLookup(product, item.product_id));
        if (productIndex !== -1) {
            products[productIndex] = {
                ...products[productIndex],
                stock: toNumber(products[productIndex].stock, 0) + qty,
                sales_count: Math.max(0, toNumber(products[productIndex].sales_count, 0) - qty),
                updated_at: nowIso()
            };
            restored += qty;
        }
        if (item.sku_id) {
            const skuIndex = skus.findIndex((sku) => rowMatchesLookup(sku, item.sku_id));
            if (skuIndex !== -1) {
                skus[skuIndex] = {
                    ...skus[skuIndex],
                    stock: toNumber(skus[skuIndex].stock, 0) + qty,
                    updated_at: nowIso()
                };
            }
        }
    });

    saveCollection('products', products);
    saveCollection('skus', skus);
    patchCollectionRow('refunds', primaryId(refund), (row) => ({
        ...row,
        stock_restored_at: nowIso(),
        updated_at: nowIso()
    }));
    if (dataStore._internals?.db) {
        directPatchDocument('refunds', String(refund._id || refund.id), { stock_restored_at: nowIso() }).catch(() => {});
    }
    return { restored, quantity: refundQuantity };
}

/**
 * 退款完成后仅处理现金对应的用户侧统计。
 * 优惠券和下单抵扣积分不返还；奖励积分/成长值仅在整单退完时扣回。
 * @param {string} orderId - 订单 ID 或 order_no
 */
async function refundOrderExtras(orderId, refund = {}) {
    const orders = getCollection('orders');
    const order = findByLookup(orders, orderId, (row) => [row.order_no]);
    if (!order) return;

    if (refund.buyer_assets_applied_at) {
        return buildOrderPatchAfterRefund(order, refund);
    }

    const db = dataStore._internals && dataStore._internals.db;
    const openid = order.openid;
    if (!openid) return buildOrderPatchAfterRefund(order, refund);

    const settlement = buildOrderPatchAfterRefund(order, refund);
    const { isFullRefund, refundAmount, rewardPointsClawback, growthClawback } = settlement;
    const pointsDelta = rewardPointsClawback > 0 ? -rewardPointsClawback : 0;
    const growthDelta = growthClawback > 0 ? -growthClawback : 0;
    const spentDelta = -refundAmount;
    const orderCountDelta = isFullRefund ? -1 : 0;

    const users = getCollection('users');
    const userIndex = users.findIndex((u) => u.openid === openid);

    if (userIndex !== -1) {
        const u = users[userIndex];
        users[userIndex] = {
            ...u,
            points: Math.max(0, toNumber(u.points, 0) + pointsDelta),
            growth_value: Math.max(0, toNumber(u.growth_value, 0) + growthDelta),
            total_spent: Math.max(0, toNumber(u.total_spent, 0) + spentDelta),
            order_count: Math.max(0, toNumber(u.order_count, 0) + orderCountDelta),
            updated_at: nowIso(),
        };
        saveCollection('users', users);
    }

    if (db) {
        const _ = db.command;
        const dbUpdates = { updated_at: new Date().toISOString() };
        if (pointsDelta !== 0) dbUpdates.points = _.inc(pointsDelta);
        if (growthDelta !== 0) dbUpdates.growth_value = _.inc(growthDelta);
        if (spentDelta !== 0) dbUpdates.total_spent = _.inc(spentDelta);
        if (orderCountDelta !== 0) dbUpdates.order_count = _.inc(orderCountDelta);

        await db.collection('users').where({ openid }).update({ data: dbUpdates })
            .catch((err) => { console.error('[refundOrderExtras] 用户数据回退失败:', err.message); });

        if (rewardPointsClawback > 0) {
            await db.collection('point_logs').add({
                data: {
                    openid,
                    type: 'deduct',
                    amount: -rewardPointsClawback,
                    source: 'order_refund_revoke',
                    order_id: String(order._id),
                    order_no: pickString(order.order_no),
                    description: `订单退款扣回 ${rewardPointsClawback} 奖励积分`,
                    created_at: new Date().toISOString()
                }
            }).catch((err) => { console.error('[refundOrderExtras] 积分扣回流水写入失败:', err.message); });
        }
        if (growthClawback > 0) {
            await db.collection('point_logs').add({
                data: {
                    openid,
                    type: 'deduct',
                    amount: -growthClawback,
                    source: 'order_refund_growth_revoke',
                    order_id: String(order._id),
                    order_no: pickString(order.order_no),
                    description: `订单退款扣回 ${growthClawback} 成长值`,
                    created_at: new Date().toISOString()
                }
            }).catch((err) => { console.error('[refundOrderExtras] 成长值扣回流水写入失败:', err.message); });
        }
    }

    patchCollectionRow('refunds', primaryId(refund), (row) => ({
        ...row,
        reward_points_clawback_amount: settlement.rewardPointsClawback,
        growth_clawback_amount: settlement.growthClawback,
        order_progress_applied_at: nowIso(),
        buyer_assets_applied_at: nowIso(),
        updated_at: nowIso()
    }));
    if (db) {
        await directPatchDocument('refunds', String(refund._id || refund.id), {
            reward_points_clawback_amount: settlement.rewardPointsClawback,
            growth_clawback_amount: settlement.growthClawback,
            order_progress_applied_at: nowIso(),
            buyer_assets_applied_at: nowIso()
        }).catch(() => {});
    }

    return settlement;
}

/**
 * 管理员手动升级代理时记录基金池入池
 * 默认入池金额：B1(role_level=3)→480元，B2(role_level=4)→4600元
 */
async function recordAdminFundPoolEntry(openid, newLevel, oldLevel) {
    if (!openid || newLevel <= oldLevel || newLevel < 3) return;
    const DEFAULT_CONTRIBUTIONS = { 3: 480, 4: 4600 };
    const db = dataStore._internals && dataStore._internals.db;
    if (!db) return;

    try {
        const configRes = await db.collection('configs').where({ key: 'agent_system_fund-pool' }).limit(1).get().catch(() => ({ data: [] }));
        const config = (configRes.data && configRes.data[0]) || {};
        const contributions = config.contribution_by_level || DEFAULT_CONTRIBUTIONS;

        // 从旧等级+1逐级入池（防止跨级升级漏记）
        for (let lv = Math.max(3, oldLevel + 1); lv <= newLevel; lv++) {
            const amount = toNumber(contributions[lv] || DEFAULT_CONTRIBUTIONS[lv], 0);
            if (amount <= 0) continue;

            await db.collection('fund_pool_logs').add({
                data: {
                    openid,
                    role_level: lv,
                    amount,
                    source: 'admin_upgrade',
                    created_at: new Date().toISOString(),
                },
            }).catch((err) => { console.error('[FundPool] 写入fund_pool_logs失败:', err.message); });

            if (config._id) {
                await db.collection('configs').doc(String(config._id)).update({
                    data: {
                        balance: db.command.inc(amount),
                        total_in: db.command.inc(amount),
                        updated_at: new Date().toISOString(),
                    },
                }).catch((err) => { console.error('[FundPool] 更新基金池余额失败:', err.message); });
            }
            console.log(`[FundPool] 管理员入池: openid=${openid}, role_level=${lv}, amount=${amount}`);
        }
    } catch (err) {
        console.error('[FundPool] recordAdminFundPoolEntry异常:', err.message);
    }
}

ensureDir(runtimeRoot);
ensureDir(uploadsRoot);
ensureDir(path.join(runtimeRoot, 'overrides'));

app.use((req, res, next) => {
    req.requestId = getRequestId(req);
    res.setHeader('X-Request-Id', req.requestId);
    next();
});

app.use(cors({
    origin: function (origin, callback) {
        const allowed = [
            /^https?:\/\/localhost(:\d+)?$/,
            /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
            /\.tcb\.qcloud\.la$/,
            /\.cloudbase\.net$/
        ];
        if (!origin || allowed.some(p => p.test(origin))) {
            callback(null, true);
        } else {
            callback(null, false);
        }
    },
    credentials: true
}));
const jsonParser = express.json({
    limit: '10mb',
    verify: (req, _res, buf) => {
        if (buf?.length) {
            req.rawBody = buf.toString('utf8');
        }
    }
});
const urlencodedParser = express.urlencoded({ extended: true });
app.use((req, res, next) => {
    if (req.event) {
        return next();
    }
    jsonParser(req, res, (jsonError) => {
        if (jsonError) return next(jsonError);
        urlencodedParser(req, res, next);
    });
});
app.use((req, _res, next) => {
    if (req.body && typeof req.body === 'object' && Object.keys(req.body).length) {
        return next();
    }
    const rawBody = req.event && Object.prototype.hasOwnProperty.call(req.event, 'body')
        ? req.event.body
        : undefined;
    if (rawBody == null || rawBody === '') {
        return next();
    }
    if (typeof rawBody === 'object') {
        req.body = rawBody;
        return next();
    }
    try {
        req.rawBody = typeof rawBody === 'string' ? rawBody : '';
        req.body = JSON.parse(rawBody);
    } catch (_) {
        req.body = rawBody;
    }
    return next();
});
app.use('/uploads', express.static(uploadsRoot));

const upload = multer({ dest: uploadsRoot });
function getRequestContentType(req) {
    const headers = req && req.headers && typeof req.headers === 'object' ? req.headers : {};
    const eventHeaders = req && req.event && req.event.headers && typeof req.event.headers === 'object' ? req.event.headers : {};
    return String(
        headers['content-type']
        || headers['Content-Type']
        || eventHeaders['content-type']
        || eventHeaders['Content-Type']
        || ''
    ).trim();
}
function parseEventMultipartSingle(req) {
    return new Promise((resolve, reject) => {
        const contentType = getRequestContentType(req);
        if (!/^multipart\/form-data/i.test(contentType)) {
            resolve(false);
            return;
        }
        const rawBody = req.event && Object.prototype.hasOwnProperty.call(req.event, 'body')
            ? req.event.body
            : '';
        if (rawBody == null || rawBody === '') {
            resolve(false);
            return;
        }
        let buffer = null;
        try {
            buffer = Buffer.isBuffer(rawBody)
                ? rawBody
                : req.event?.isBase64Encoded
                    ? Buffer.from(String(rawBody), 'base64')
                    : Buffer.from(String(rawBody), 'binary');
        } catch (error) {
            reject(error);
            return;
        }
        const fields = {};
        let uploadedFile = null;
        const busboy = Busboy({ headers: { 'content-type': contentType } });
        busboy.on('field', (fieldname, value) => {
            fields[fieldname] = value;
        });
        busboy.on('file', (fieldname, file, info) => {
            const chunks = [];
            const originalname = info?.filename || `upload_${Date.now()}.bin`;
            const mimetype = info?.mimeType || 'application/octet-stream';
            file.on('data', (chunk) => {
                chunks.push(chunk);
            });
            file.on('end', () => {
                const fileBuffer = Buffer.concat(chunks);
                uploadedFile = {
                    fieldname,
                    originalname,
                    mimetype,
                    size: fileBuffer.length,
                    buffer: fileBuffer
                };
            });
        });
        busboy.on('finish', () => {
            req.body = fields;
            if (uploadedFile) {
                req.file = uploadedFile;
            }
            resolve(Boolean(uploadedFile));
        });
        busboy.on('error', reject);
        busboy.end(buffer);
    });
}
const uploadSingle = (req, res, next) => {
    if (req.event) {
        const contentType = getRequestContentType(req);
        if (/^multipart\/form-data/i.test(contentType)) {
            return parseEventMultipartSingle(req)
                .then(() => next())
                .catch(next);
        }
        return next();
    }
    return upload.single('file')(req, res, next);
};

// /health 对外只返回最小状态，不暴露内部路径；详细信息需登录查 /admin/api/runtime/data-source
app.get('/health', (req, res) => {
    const health = dataStore.health();
    ok(res, {
        status: health.status === 'ok' ? 'ok' : 'degraded',
        ready: health.ready,
        time: nowIso()
    });
});

app.get('/admin/api/runtime/data-source', auth, (req, res) => {
    ok(res, {
        descriptor: dataStore.describe(),
        health: dataStore.health()
    });
});

app.post('/admin/api/login', (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) return fail(res, '请输入用户名和密码');

    const admin = getCollection('admins').find((item) => item.username === username && toBoolean(item.status));
    if (!admin || !verifyPassword(password, admin.salt, admin.password_hash)) {
        return fail(res, '用户名或密码错误', 401);
    }

    const admins = getCollection('admins').map((item) => Number(item.id) === Number(admin.id)
        ? { ...item, last_login_at: nowIso(), last_login_ip: req.ip || '' }
        : item);
    saveCollection('admins', admins);

    ok(res, {
        token: signToken(admin),
        admin: {
            id: admin.id || admin._legacy_id || admin._id,
            username: admin.username,
            name: admin.name,
            role: admin.role,
            permissions: normalizePermissions(admin)
        }
    });
});

app.post('/admin/api/logout', auth, (req, res) => ok(res, { success: true }));

app.get('/admin/api/profile', auth, (req, res) => {
    ok(res, {
        id: req.admin.id || req.admin._legacy_id || req.admin._id,
        username: req.admin.username,
        name: req.admin.name,
        role: req.admin.role,
        permissions: req.permissions
    });
});

app.put('/admin/api/password', auth, (req, res) => {
    const { old_password, new_password } = req.body || {};
    if (!old_password || !new_password) return fail(res, '请填写原密码和新密码');
    if (!verifyPassword(old_password, req.admin.salt, req.admin.password_hash)) return fail(res, '原密码错误', 401);
    if (String(new_password).length < 6) return fail(res, '新密码至少 6 位');
    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPassword(new_password, salt);
    const admins = getCollection('admins').map((item) => Number(item.id) === Number(req.admin.id)
        ? { ...item, salt, password_hash: passwordHash, updated_at: nowIso() }
        : item);
    saveCollection('admins', admins);
    createAuditLog(req.admin, 'admin.password.update', 'admins', { admin_id: req.admin.id });
    ok(res, { success: true });
});

app.get('/admin/api/products', auth, requirePermission('products'), async (req, res) => {
    await ensureFreshCollections(['products', 'categories', 'skus', 'reviews']);
    const products = getCollection('products');
    const categories = getCollection('categories');
    const skus = getCollection('skus');
    const reviews = getCollection('reviews');

    // 收集所有 cloud:// 图片 ID，批量解析为可用 URL（避免单条逐一请求 getTempFileURL）
    const allCloudIds = [];
    for (const item of products) {
        toArray(item.images).filter(isCloudFileId).forEach(id => allCloudIds.push(id));
        toArray(item.detail_images).filter(isCloudFileId).forEach(id => allCloudIds.push(id));
    }
    const cloudUrlMap = new Map();
    if (allCloudIds.length) {
        const cloud = getManagedCloud();
        if (cloud?.getTempFileURL) {
            const unique = [...new Set(allCloudIds)];
            for (let i = 0; i < unique.length; i += 50) {
                const chunk = unique.slice(i, i + 50);
                const result = await cloud.getTempFileURL({ fileList: chunk }).catch(() => ({ fileList: [] }));
                for (const f of (result.fileList || [])) {
                    if (f.fileID) cloudUrlMap.set(f.fileID, f.tempFileURL || f.download_url || f.fileID);
                }
            }
        }
    }
    const resolveProductUrl = u => isCloudFileId(u) ? (cloudUrlMap.get(u) || u) : assetUrl(u);

    let rows = sortByUpdatedDesc(products).map((item) => productWithRelations({
        ...item,
        images: toArray(item.images).map(resolveProductUrl),
        detail_images: toArray(item.detail_images).map(resolveProductUrl)
    }, categories, skus, reviews));

    const keyword = pickString(req.query.keyword).trim().toLowerCase();
    if (keyword) rows = rows.filter((item) => `${item.name} ${item.description || ''}`.toLowerCase().includes(keyword));
    // 分类过滤：用字符串比较，兼容数字 id 和 CloudBase UUID _id
    if (req.query.category_id) {
        const filterCatId = String(req.query.category_id);
        rows = rows.filter((item) => item.category_id != null && String(item.category_id) === filterCatId);
    }
    if (req.query.status !== undefined && req.query.status !== '') rows = rows.filter((item) => Number(item.status) === Number(req.query.status));

    ok(res, paginate(rows, req));
});

app.get('/admin/api/products/:id', auth, requirePermission('products'), async (req, res) => {
    await ensureFreshCollections(['products']);
    const products = getCollection('products');
    const product = findByLookup(products, req.params.id);
    if (!product) return fail(res, '商品不存在', 404);
    const allUrls = [...toArray(product.images), ...toArray(product.detail_images)];
    const resolvedAll = await batchResolveCloudUrls(allUrls);
    const imgCount = toArray(product.images).length;
    ok(res, {
        ...product,
        id: product.id ?? product._legacy_id ?? product._id,
        images: resolvedAll.slice(0, imgCount),
        detail_images: resolvedAll.slice(imgCount)
    });
});

app.post('/admin/api/products', auth, requirePermission('products'), async (req, res) => {
    await ensureFreshCollections(['products']);
    const rows = getCollection('products');
    const row = {
        id: nextId(rows),
        ...req.body,
        // category_id 保留原始值（字符串 UUID 或数字），不强制转数字
        category_id: req.body?.category_id != null ? req.body.category_id : null,
        retail_price: toNumber(req.body?.retail_price, 0),
        market_price: toNumber(req.body?.market_price, 0),
        cost_price: toNumber(req.body?.cost_price, 0),
        stock: toNumber(req.body?.stock, 0),
        status: req.body?.status != null ? (toBoolean(req.body.status) ? 1 : 0) : 1,
        images: toArray(req.body?.images),
        detail_images: toArray(req.body?.detail_images),
        created_at: nowIso(),
        updated_at: nowIso()
    };
    if (!pickString(row.name).trim()) return fail(res, '商品名称不能为空');
    rows.push(row);
    saveCollection('products', rows);
    // 直写 CloudBase，确保新商品即时持久化（用数字 id 作为文档 _id 方便后续定点更新）
    const db = dataStore._internals?.db;
    if (db) {
        await db.collection('products').doc(String(row.id)).set({ data: { ...row } }).catch((e) => {
            console.error('[product.create] CloudBase write failed:', e.message);
        });
    }
    createAuditLog(req.admin, 'product.create', 'products', { product_id: row.id, name: row.name });
    ok(res, { ...row, id: row.id });
});

app.put('/admin/api/products/:id', auth, requirePermission('products'), async (req, res) => {
    await ensureFreshCollections(['products']);
    const rows = getCollection('products');
    const index = rows.findIndex((item) => rowMatchesLookup(item, req.params.id));
    if (index === -1) return fail(res, '商品不存在', 404);
    rows[index] = {
        ...rows[index],
        ...req.body,
        category_id: req.body?.category_id != null ? req.body.category_id : rows[index].category_id,
        retail_price: req.body?.retail_price != null ? toNumber(req.body.retail_price, 0) : rows[index].retail_price,
        market_price: req.body?.market_price != null ? toNumber(req.body.market_price, 0) : rows[index].market_price,
        cost_price: req.body?.cost_price != null ? toNumber(req.body.cost_price, 0) : rows[index].cost_price,
        stock: req.body?.stock != null ? toNumber(req.body.stock, 0) : rows[index].stock,
        status: req.body?.status != null ? (toBoolean(req.body.status) ? 1 : 0) : rows[index].status,
        images: req.body?.images != null ? toArray(req.body.images) : rows[index].images,
        detail_images: req.body?.detail_images != null ? toArray(req.body.detail_images) : rows[index].detail_images,
        updated_at: nowIso()
    };
    const docId = String(rows[index]._id || rows[index].id || req.params.id);
    saveCollection('products', rows);
    await directPatchDocument('products', docId, rows[index]);
    createAuditLog(req.admin, 'product.update', 'products', { product_id: rows[index].id ?? rows[index]._id });
    ok(res, { ...rows[index], id: rows[index].id ?? rows[index]._legacy_id ?? rows[index]._id });
});

async function updateProductStatus(req, res) {
    await ensureFreshCollections(['products']);
    const nextStatus = toBoolean(req.body?.status ?? req.body?.is_active ?? req.body?.enabled ?? req.body?.value) ? 1 : 0;
    const row = patchCollectionRow('products', req.params.id, (item) => ({
        ...item,
        status: nextStatus,
        is_active: nextStatus,
        updated_at: nowIso()
    }));
    if (!row) return fail(res, '商品不存在', 404);
    // 同步写 CloudBase，确保上架/下架状态持久化
    const docId = String(row._id || row.id || req.params.id);
    await directPatchDocument('products', docId, { status: nextStatus, is_active: nextStatus });
    ok(res, { ...row, id: row.id ?? row._legacy_id ?? row._id });
}

app.put('/admin/api/products/:id/status', auth, requirePermission('products'), updateProductStatus);
app.post('/admin/api/products/:id/status', auth, requirePermission('products'), updateProductStatus);
app.put('/admin/api/products/:id/toggle', auth, requirePermission('products'), updateProductStatus);
app.post('/admin/api/products/:id/toggle', auth, requirePermission('products'), updateProductStatus);

app.delete('/admin/api/products/:id', auth, requirePermission('products'), async (req, res) => {
    await ensureFreshCollections(['products']);
    const rows = getCollection('products');
    const target = findByLookup(rows, req.params.id);
    if (!target) return fail(res, '商品不存在', 404);
    const nextRows = rows.filter((item) => !rowMatchesLookup(item, req.params.id));
    saveCollection('products', nextRows);
    const docId = String(target._id || target.id || req.params.id);
    const db = dataStore._internals?.db;
    if (db) {
        await db.collection('products').doc(docId).remove().catch((e) => {
            console.error('[product.delete] CloudBase remove failed:', e.message);
        });
    }
    createAuditLog(req.admin, 'product.delete', 'products', { product_id: target.id ?? target._id });
    ok(res, { success: true });
});

registerMarketingRoutes(app, {
    auth,
    requirePermission,
    ensureFreshCollections,
    getCollection,
    saveCollection,
    nextId,
    nowIso,
    toNumber,
    toArray,
    toBoolean,
    pickString,
    findByLookup,
    rowMatchesLookup,
    paginate,
    sortByUpdatedDesc,
    assetUrl,
    createAuditLog,
    directPatchDocument,
    appendWalletLogEntry,
    requireManualAdjustmentReason,
    ok,
    fail
});

// ===== SKU 管理 API（多规格支持）=====

// 获取商品的所有 SKU
app.get('/admin/api/products/:productId/skus', auth, requirePermission('products'), (req, res) => {
    const productId = Number(req.params.productId);
    const skus = getCollection('skus');
    const productSkus = skus.filter((item) => Number(item.product_id) === productId).map((item) => ({
        ...item,
        id: item.id || item._legacy_id || item._id,
        // 兼容：确保 specs 数组可用
        specs: Array.isArray(item.specs) ? item.specs : (item.spec_name && item.spec_value ? [{ name: item.spec_name, value: item.spec_value }] : []),
        image: assetUrl(item.image || '')
    }));
    ok(res, { list: productSkus, total: productSkus.length });
});

// 批量更新商品 SKU（整体替换，支持多规格）
app.put('/admin/api/products/:productId/skus', auth, requirePermission('products'), (req, res) => {
    const productId = Number(req.params.productId);
    const products = getCollection('products');
    const product = products.find((item) => Number(item.id || item._legacy_id || item._id) === productId);
    if (!product) return fail(res, '商品不存在', 404);

    const incomingSkus = toArray(req.body.skus);
    const skus = getCollection('skus');

    // 删除旧 SKU
    const remainingSkus = skus.filter((item) => Number(item.product_id) !== productId);

    // 创建新 SKU
    const newSkus = incomingSkus.map((sku, index) => {
        const specs = Array.isArray(sku.specs) ? sku.specs : (sku.spec_name && sku.spec_value ? [{ name: sku.spec_name, value: sku.spec_value }] : []);
        const specName = specs.length === 1 ? specs[0].name : (specs.length > 1 ? specs.map((s) => s.name).join('/') : (sku.spec_name || ''));
        const specValue = specs.length === 1 ? specs[0].value : (specs.length > 1 ? specs.map((s) => s.value).join('/') : (sku.spec_value || sku.spec || ''));

        return {
            id: sku.id || nextId(remainingSkus.concat(newSkus)),
            _legacy_id: null,
            product_id: productId,
            name: sku.name || product.name,
            spec: specValue || '默认规格',
            spec_name: specName,
            spec_value: specValue,
            specs: specs,
            image: sku.image || '',
            price: toNumber(sku.price, 0),
            original_price: toNumber(sku.original_price || sku.market_price, 0),
            stock: toNumber(sku.stock, 0),
            sku_code: pickString(sku.sku_code, ''),
            sort_order: toNumber(sku.sort_order, index),
            created_at: sku.created_at || nowIso(),
            updated_at: nowIso()
        };
    });

    const finalSkus = [...remainingSkus, ...newSkus];
    saveCollection('skus', finalSkus);

    // 同步更新商品库存和最低价
    const totalStock = newSkus.reduce((sum, s) => sum + toNumber(s.stock, 0), 0);
    const minPrice = newSkus.length > 0 ? Math.min(...newSkus.map((s) => toNumber(s.price, 0))) : toNumber(product.retail_price, 0);
    const productIndex = products.findIndex((item) => Number(item.id || item._legacy_id || item._id) === productId);
    if (productIndex !== -1) {
        products[productIndex] = {
            ...products[productIndex],
            stock: totalStock,
            min_price: minPrice,
            retail_price: minPrice,
            updated_at: nowIso()
        };
        saveCollection('products', products);
    }

    createAuditLog(req.admin, 'product.skus.update', 'products', { product_id: productId, sku_count: newSkus.length });
    ok(res, { list: newSkus, total: newSkus.length });
});

// 新增单个 SKU
app.post('/admin/api/products/:productId/skus', auth, requirePermission('products'), (req, res) => {
    const productId = Number(req.params.productId);
    const products = getCollection('products');
    const product = products.find((item) => Number(item.id || item._legacy_id || item._id) === productId);
    if (!product) return fail(res, '商品不存在', 404);

    const skus = getCollection('skus');
    const specs = Array.isArray(req.body.specs) ? req.body.specs : (req.body.spec_name && req.body.spec_value ? [{ name: req.body.spec_name, value: req.body.spec_value }] : []);
    const specName = specs.length === 1 ? specs[0].name : (specs.length > 1 ? specs.map((s) => s.name).join('/') : (req.body.spec_name || ''));
    const specValue = specs.length === 1 ? specs[0].value : (specs.length > 1 ? specs.map((s) => s.value).join('/') : (req.body.spec_value || req.body.spec || ''));

    const sku = {
        id: nextId(skus),
        _legacy_id: null,
        product_id: productId,
        name: req.body.name || product.name,
        spec: specValue || '默认规格',
        spec_name: specName,
        spec_value: specValue,
        specs: specs,
        image: req.body.image || '',
        price: toNumber(req.body.price, 0),
        original_price: toNumber(req.body.original_price || req.body.market_price, 0),
        stock: toNumber(req.body.stock, 0),
        sku_code: pickString(req.body.sku_code, ''),
        sort_order: toNumber(req.body.sort_order, skus.filter((s) => Number(s.product_id) === productId).length),
        created_at: nowIso(),
        updated_at: nowIso()
    };

    skus.push(sku);
    saveCollection('skus', skus);

    // 同步商品库存/最低价
    const productSkus = skus.filter((s) => Number(s.product_id) === productId);
    const totalStock = productSkus.reduce((sum, s) => sum + toNumber(s.stock, 0), 0);
    const minPrice = Math.min(...productSkus.map((s) => toNumber(s.price, 0)));
    const productIndex = products.findIndex((item) => Number(item.id || item._legacy_id || item._id) === productId);
    if (productIndex !== -1) {
        products[productIndex] = { ...products[productIndex], stock: totalStock, min_price: minPrice, retail_price: minPrice, updated_at: nowIso() };
        saveCollection('products', products);
    }

    createAuditLog(req.admin, 'product.sku.create', 'products', { product_id: productId, sku_id: sku.id });
    ok(res, sku);
});

// 更新单个 SKU
app.put('/admin/api/products/:productId/skus/:skuId', auth, requirePermission('products'), (req, res) => {
    const productId = Number(req.params.productId);
    const skuId = Number(req.params.skuId);
    const skus = getCollection('skus');
    const index = skus.findIndex((item) => Number(item.id) === skuId && Number(item.product_id) === productId);
    if (index === -1) return fail(res, 'SKU不存在', 404);

    const specs = Array.isArray(req.body.specs) ? req.body.specs : (req.body.spec_name && req.body.spec_value ? [{ name: req.body.spec_name, value: req.body.spec_value }] : skus[index].specs || []);
    const specName = specs.length === 1 ? specs[0].name : (specs.length > 1 ? specs.map((s) => s.name).join('/') : (req.body.spec_name || skus[index].spec_name || ''));
    const specValue = specs.length === 1 ? specs[0].value : (specs.length > 1 ? specs.map((s) => s.value).join('/') : (req.body.spec_value || req.body.spec || skus[index].spec_value || ''));

    skus[index] = {
        ...skus[index],
        ...req.body,
        spec: specValue || skus[index].spec,
        spec_name: specName,
        spec_value: specValue,
        specs: specs,
        price: req.body.price != null ? toNumber(req.body.price, 0) : skus[index].price,
        original_price: req.body.original_price != null ? toNumber(req.body.original_price, 0) : skus[index].original_price,
        stock: req.body.stock != null ? toNumber(req.body.stock, 0) : skus[index].stock,
        updated_at: nowIso()
    };
    saveCollection('skus', skus);

    // 同步商品库存/最低价
    const products = getCollection('products');
    const productSkus = skus.filter((s) => Number(s.product_id) === productId);
    const totalStock = productSkus.reduce((sum, s) => sum + toNumber(s.stock, 0), 0);
    const minPrice = productSkus.length > 0 ? Math.min(...productSkus.map((s) => toNumber(s.price, 0))) : 0;
    const productIndex = products.findIndex((item) => Number(item.id || item._legacy_id || item._id) === productId);
    if (productIndex !== -1) {
        products[productIndex] = { ...products[productIndex], stock: totalStock, min_price: minPrice, retail_price: minPrice, updated_at: nowIso() };
        saveCollection('products', products);
    }

    ok(res, skus[index]);
});

// 删除单个 SKU
app.delete('/admin/api/products/:productId/skus/:skuId', auth, requirePermission('products'), (req, res) => {
    const productId = Number(req.params.productId);
    const skuId = Number(req.params.skuId);
    const skus = getCollection('skus');
    const nextSkus = skus.filter((item) => !(Number(item.id) === skuId && Number(item.product_id) === productId));
    if (skus.length === nextSkus.length) return fail(res, 'SKU不存在', 404);
    saveCollection('skus', nextSkus);

    // 同步商品库存/最低价
    const products = getCollection('products');
    const productSkus = nextSkus.filter((s) => Number(s.product_id) === productId);
    const totalStock = productSkus.reduce((sum, s) => sum + toNumber(s.stock, 0), 0);
    const minPrice = productSkus.length > 0 ? Math.min(...productSkus.map((s) => toNumber(s.price, 0))) : 0;
    const productIndex = products.findIndex((item) => Number(item.id || item._legacy_id || item._id) === productId);
    if (productIndex !== -1) {
        products[productIndex] = { ...products[productIndex], stock: totalStock, min_price: minPrice, retail_price: minPrice, updated_at: nowIso() };
        saveCollection('products', products);
    }

    createAuditLog(req.admin, 'product.sku.delete', 'products', { product_id: productId, sku_id: skuId });
    ok(res, { success: true });
});

app.get('/admin/api/categories', auth, requirePermission('products'), async (req, res) => {
    await ensureFreshCollections(['categories', 'products']);
    const products = getCollection('products');
    const rows = sortByUpdatedDesc(getCollection('categories')).map((item) => {
        const cid = item.id ?? item._legacy_id ?? item._id;
        return {
            ...item,
            id: cid,           // 保证前端拿到可用的 id 字段（兼容 CloudBase UUID _id）
            status: toBoolean(item.status) ? 1 : 0,
            product_count: products.filter((product) => {
                const pidCat = product.category_id;
                return pidCat != null && cid != null && String(pidCat) === String(cid);
            }).length
        };
    });
    ok(res, { list: rows, total: rows.length });
});

app.post('/admin/api/categories', auth, requirePermission('products'), async (req, res) => {
    await ensureFreshCollections(['categories']);
    const rows = getCollection('categories');
    const row = {
        id: nextId(rows),
        name: pickString(req.body?.name).trim(),
        parent_id: req.body?.parent_id != null ? toNumber(req.body.parent_id, 0) : null,
        icon: req.body?.icon || null,
        sort_order: toNumber(req.body?.sort_order, 0),
        status: req.body?.status != null ? (toBoolean(req.body.status) ? 1 : 0) : 1,
        created_at: nowIso(),
        updated_at: nowIso()
    };
    if (!row.name) return fail(res, '分类名称不能为空');
    rows.push(row);
    saveCollection('categories', rows);
    // 同步直写 CloudBase，确保数据即时持久化
    const db = dataStore._internals?.db;
    if (db) {
        await db.collection('categories').doc(String(row.id)).set({ data: row }).catch((e) => {
            console.error('[category.create] CloudBase write failed:', e.message);
        });
    }
    ok(res, { ...row, id: row.id });
});

app.put('/admin/api/categories/:id', auth, requirePermission('products'), async (req, res) => {
    const rows = getCollection('categories');
    const index = rows.findIndex((item) => rowMatchesLookup(item, req.params.id));
    if (index === -1) return fail(res, '分类不存在', 404);
    rows[index] = { ...rows[index], ...req.body, updated_at: nowIso() };
    const docId = String(rows[index]._id || rows[index].id || req.params.id);
    saveCollection('categories', rows);
    await directPatchDocument('categories', docId, { ...req.body, updated_at: nowIso() });
    ok(res, { ...rows[index], id: rows[index].id ?? rows[index]._id });
});

app.delete('/admin/api/categories/:id', auth, requirePermission('products'), async (req, res) => {
    const products = getCollection('products');
    const catIdStr = String(req.params.id);
    if (products.some((item) => item.category_id != null && String(item.category_id) === catIdStr)) {
        return fail(res, '该分类下仍有关联商品，无法删除');
    }
    const rows = getCollection('categories');
    const target = rows.find((item) => rowMatchesLookup(item, req.params.id));
    if (!target) return fail(res, '分类不存在', 404);
    const nextRows = rows.filter((item) => !rowMatchesLookup(item, req.params.id));
    saveCollection('categories', nextRows);
    const db = dataStore._internals?.db;
    if (db) {
        const docId = String(target._id || target.id || req.params.id);
        await db.collection('categories').doc(docId).remove().catch((e) => {
            console.error('[category.delete] CloudBase remove failed:', e.message);
        });
    }
    ok(res, { success: true });
});

app.get('/admin/api/material-groups', auth, requirePermission('materials'), (req, res) => {
    const materials = getCollection('materials');
    const groups = sortByUpdatedDesc(getCollection('material_groups')).map((item) => ({
        ...item,
        count: materials.filter((material) => Number(material.group_id || 0) === Number(item.id)).length
    }));
    ok(res, [{ id: null, name: '全部素材', count: materials.length, _virtual: true }, ...groups]);
});

app.post('/admin/api/material-groups', auth, requirePermission('materials'), (req, res) => {
    const rows = getCollection('material_groups');
    const row = {
        id: nextId(rows),
        name: pickString(req.body?.name).trim(),
        description: pickString(req.body?.description, ''),
        code: pickString(req.body?.code, ''),
        sort_order: toNumber(req.body?.sort_order, 0),
        status: req.body?.status != null ? (toBoolean(req.body.status) ? 1 : 0) : 1,
        created_at: nowIso(),
        updated_at: nowIso()
    };
    if (!row.name) return fail(res, '分组名称不能为空');
    rows.push(row);
    saveCollection('material_groups', rows);
    ok(res, row);
});

app.put('/admin/api/material-groups/:id', auth, requirePermission('materials'), (req, res) => {
    const rows = getCollection('material_groups');
    const index = rows.findIndex((item) => Number(item.id) === Number(req.params.id));
    if (index === -1) return fail(res, '素材分组不存在', 404);
    rows[index] = { ...rows[index], ...req.body, updated_at: nowIso() };
    saveCollection('material_groups', rows);
    ok(res, rows[index]);
});

app.delete('/admin/api/material-groups/:id', auth, requirePermission('materials'), (req, res) => {
    const groupId = Number(req.params.id);
    const groups = getCollection('material_groups');
    const nextGroups = groups.filter((item) => Number(item.id) !== groupId);
    if (groups.length === nextGroups.length) return fail(res, '素材分组不存在', 404);
    saveCollection('material_groups', nextGroups);
    const materials = getCollection('materials').map((item) => Number(item.group_id || 0) === groupId
        ? { ...item, group_id: null, updated_at: nowIso() }
        : item);
    saveCollection('materials', materials);
    ok(res, { success: true });
});

app.post('/admin/api/material-groups/move', auth, requirePermission('materials'), (req, res) => {
    const ids = toArray(req.body?.material_ids || req.body?.ids).map((item) => Number(item));
    const groupId = req.body?.group_id != null && req.body?.group_id !== '' ? Number(req.body.group_id) : null;
    const rows = getCollection('materials').map((item) => ids.includes(Number(item.id))
        ? { ...item, group_id: groupId, updated_at: nowIso() }
        : item);
    saveCollection('materials', rows);
    ok(res, { success: true, moved: ids.length });
});

app.get('/admin/api/materials', auth, requirePermission('materials'), async (req, res) => {
    let rows = await Promise.all(sortByUpdatedDesc(getCollection('materials')).map((item) => normalizeMaterialRecordAsync(item)));
    const keyword = pickString(req.query.keyword).trim().toLowerCase();
    const type = pickString(req.query.type).trim();
    if (keyword) rows = rows.filter((item) => `${item.title} ${item.description || ''}`.toLowerCase().includes(keyword));
    if (type) rows = rows.filter((item) => item.type === type);
    if (req.query.group_id !== undefined && req.query.group_id !== '') rows = rows.filter((item) => Number(item.group_id || 0) === Number(req.query.group_id));
    ok(res, paginate(rows, req));
});

app.post('/admin/api/materials', auth, requirePermission('materials'), (req, res) => {
    const rows = getCollection('materials');
    const row = {
        id: nextId(rows),
        title: pickString(req.body?.title).trim(),
        type: pickString(req.body?.type, 'image'),
        group_id: req.body?.group_id != null && req.body?.group_id !== '' ? Number(req.body.group_id) : null,
        description: pickString(req.body?.description, ''),
        url: req.body?.url || '',
        thumbnail_url: req.body?.thumbnail_url || '',
        file_id: req.body?.file_id || '',
        status: req.body?.status != null ? (toBoolean(req.body.status) ? 1 : 0) : 1,
        sort_order: toNumber(req.body?.sort_order, 0),
        created_at: nowIso(),
        updated_at: nowIso()
    };
    if (!row.title) return fail(res, '素材名称不能为空');
    rows.push(row);
    saveCollection('materials', rows);
    ok(res, row);
});

app.put('/admin/api/materials/:id', auth, requirePermission('materials'), (req, res) => {
    const rows = getCollection('materials');
    const index = rows.findIndex((item) => Number(item.id) === Number(req.params.id));
    if (index === -1) return fail(res, '素材不存在', 404);
    rows[index] = {
        ...rows[index],
        ...req.body,
        group_id: req.body?.group_id != null && req.body?.group_id !== '' ? Number(req.body.group_id) : rows[index].group_id,
        updated_at: nowIso()
    };
    saveCollection('materials', rows);
    ok(res, rows[index]);
});

app.delete('/admin/api/materials/:id', auth, requirePermission('materials'), (req, res) => {
    const rows = getCollection('materials');
    const nextRows = rows.filter((item) => Number(item.id) !== Number(req.params.id));
    if (rows.length === nextRows.length) return fail(res, '素材不存在', 404);
    saveCollection('materials', nextRows);
    ok(res, { success: true });
});

app.post('/admin/api/upload', auth, requirePermission('materials'), uploadSingle, async (req, res) => {
    let uploadBody = toObject(req.body, {});
    if (!Object.keys(uploadBody).length && req.event && Object.prototype.hasOwnProperty.call(req.event, 'body')) {
        if (typeof req.event.body === 'object' && req.event.body) {
            uploadBody = req.event.body;
        } else if (typeof req.event.body === 'string' && req.event.body) {
            try {
                uploadBody = JSON.parse(req.event.body);
            } catch (_) {
                uploadBody = {};
            }
        }
    }
    const bodyName = pickString(uploadBody.name || uploadBody.file_name || uploadBody.filename);
    const bodyMimeType = pickString(uploadBody.mime_type, 'application/octet-stream');
    const bodyContent = pickString(uploadBody.content_base64);
    console.info('[admin-api] upload request reached', {
        via_event: Boolean(req.event),
        has_multipart_file: Boolean(req.file),
        has_body_content: Boolean(bodyContent),
        content_base64_length: bodyContent ? bodyContent.length : 0,
        event_body_length: req.event && typeof req.event.body === 'string' ? req.event.body.length : 0
    });
    let uploadFile = req.file || null;
    if (!uploadFile && bodyContent) {
        let buffer = null;
        try {
            const normalized = bodyContent.includes(',') ? bodyContent.split(',').pop() : bodyContent;
            buffer = Buffer.from(normalized, 'base64');
        } catch (_) {
            return fail(res, '上传内容不是有效的 base64 数据');
        }
        if (!buffer || !buffer.length) {
            return fail(res, '上传内容为空');
        }
        uploadFile = {
            originalname: bodyName || `upload_${Date.now()}.bin`,
            mimetype: bodyMimeType,
            size: buffer.length,
            buffer
        };
    }
    if (!uploadFile) return fail(res, '未收到上传文件');
    try {
        const managedUpload = await uploadManagedAsset(uploadFile);
        if (managedUpload) {
            if (uploadFile.path) {
                try { fs.unlinkSync(uploadFile.path); } catch (_) {}
            }
            return ok(res, {
                name: uploadFile.originalname,
                url: managedUpload.url,
                file_id: managedUpload.file_id,
                size: uploadFile.size,
                mime_type: uploadFile.mimetype,
                provider: managedUpload.provider,
                cloud_path: managedUpload.cloud_path
            });
        }
        if (uploadFile?.path) {
            try { fs.unlinkSync(uploadFile.path); } catch (_) {}
        }
        return fail(res, '上传失败：当前素材上传已强制使用微信云开发存储，请确认 admin-api 运行在 CloudBase 云函数环境并已正确绑定环境。', 503);
    } catch (error) {
        if (uploadFile?.path) {
            try { fs.unlinkSync(uploadFile.path); } catch (_) {}
        }
        return fail(res, `上传失败：${error.message || '未知错误'}`, 500);
    }
});

app.get('/admin/api/storage/config', auth, requirePermission('materials'), (req, res) => {
    const currentConfig = getStorageConfigSnapshot();
    ok(res, {
        ...currentConfig,
        cloud_enabled: Boolean(getManagedCloud()),
        provider_status: getManagedCloud() ? 'ready' : 'fallback-local',
        strict_upload: isManagedStorageStrict()
    });
});

app.put('/admin/api/storage/config', auth, requirePermission('materials'), (req, res) => {
    const requestConfig = toObject(req.body, {});
    const folder = normalizeStorageFolderInput(requestConfig.folder);
    if (!folder) {
        return failField(res, 'folder', '存储目录只能包含字母、数字、下划线、中划线和斜杠，且不能为空');
    }
    const nextConfig = {
        provider: 'cloudbase',
        bucket: '',
        folder,
        mode: 'managed'
    };
    saveSingleton('storage-config', nextConfig);
    ok(res, {
        ...nextConfig,
        locked: true,
        message: '素材上传已固定为 CloudBase 云存储，不能再切回本地或其他存储。'
    });
});

app.post('/admin/api/storage/test', auth, requirePermission('materials'), async (req, res) => {
    const configuredProvider = pickString(req.body?.provider, getStorageConfigSnapshot().provider || 'cloudbase');
    const cloud = getManagedCloud();
    if (!cloud) {
        return ok(res, {
            success: false,
            provider: configuredProvider,
            checked_at: nowIso(),
            mode: 'fallback-local',
            message: '当前运行环境未启用 CloudBase 云存储 SDK，仍使用本地兜底存储。'
        });
    }
    try {
        const probe = await cloud.getTempFileURL({ fileList: ['cloudbase://non-existent/probe.txt'] });
        ok(res, {
            success: true,
            provider: configuredProvider,
            checked_at: nowIso(),
            mode: 'managed',
            probe: Array.isArray(probe.fileList) ? probe.fileList.length : 0
        });
    } catch (error) {
        ok(res, {
            success: false,
            provider: configuredProvider,
            checked_at: nowIso(),
            mode: 'managed',
            message: error.message || 'CloudBase 存储探测失败'
        });
    }
});

app.get('/admin/api/banners', auth, requirePermission('content'), async (req, res) => {
    let rows = await Promise.all(sortByUpdatedDesc(getCollection('banners')).map((item) => normalizeBannerRecordAsync(item)));
    if (req.query.position) rows = rows.filter((item) => item.position === req.query.position);
    ok(res, paginate(rows, req));
});

app.post('/admin/api/banners', auth, requirePermission('content'), async (req, res) => {
    const rows = getCollection('banners');
    const row = {
        id: nextId(rows),
        title: pickString(req.body?.title),
        subtitle: pickString(req.body?.subtitle),
        kicker: pickString(req.body?.kicker),
        product_id: req.body?.product_id != null ? Number(req.body.product_id) : null,
        file_id: pickString(req.body?.file_id),
        image_url: pickString(req.body?.image_url || req.body?.url || req.body?.file_id),
        link_type: pickString(req.body?.link_type, 'product'),
        link_value: pickString(req.body?.link_value),
        position: pickString(req.body?.position, 'home'),
        sort_order: toNumber(req.body?.sort_order, 0),
        status: req.body?.status != null ? (toBoolean(req.body.status) ? 1 : 0) : 1,
        created_at: nowIso(),
        updated_at: nowIso()
    };
    rows.push(row);
    saveCollection('banners', rows);
    ok(res, await normalizeBannerRecordAsync(row));
});

app.put('/admin/api/banners/:id', auth, requirePermission('content'), async (req, res) => {
    const rows = getCollection('banners');
    const index = rows.findIndex((item) => rowMatchesLookup(item, req.params.id));
    if (index === -1) return fail(res, 'Banner 不存在', 404);
    rows[index] = {
        ...rows[index],
        ...req.body,
        file_id: req.body?.file_id != null ? pickString(req.body.file_id) : rows[index].file_id || '',
        image_url: req.body?.image_url != null || req.body?.url != null || req.body?.file_id != null || req.body?.image != null || req.body?.cover_image != null
            ? pickString(req.body?.image_url || req.body?.url || req.body?.image || req.body?.cover_image || req.body?.file_id)
            : rows[index].image_url,
        updated_at: nowIso()
    };
    saveCollection('banners', rows);
    ok(res, await normalizeBannerRecordAsync(rows[index]));
});

async function updateBannerStatus(req, res) {
    const row = patchCollectionRow('banners', req.params.id, (item) => {
        const nextStatus = toBoolean(req.body?.status ?? req.body?.is_active ?? req.body?.enabled ?? req.body?.value ?? 1) ? 1 : 0;
        return {
            ...item,
            status: nextStatus,
            is_active: nextStatus,
            updated_at: nowIso()
        };
    });
    if (!row) return fail(res, 'Banner 不存在', 404);
    ok(res, await normalizeBannerRecordAsync(row));
}

app.put('/admin/api/banners/:id/status', auth, requirePermission('content'), updateBannerStatus);
app.post('/admin/api/banners/:id/status', auth, requirePermission('content'), updateBannerStatus);
app.put('/admin/api/banners/:id/toggle', auth, requirePermission('content'), updateBannerStatus);
app.post('/admin/api/banners/:id/toggle', auth, requirePermission('content'), updateBannerStatus);

app.delete('/admin/api/banners/:id', auth, requirePermission('content'), (req, res) => {
    const rows = getCollection('banners');
    const nextRows = rows.filter((item) => Number(item.id) !== Number(req.params.id));
    if (rows.length === nextRows.length) return fail(res, 'Banner 不存在', 404);
    saveCollection('banners', nextRows);
    ok(res, { success: true });
});

app.get('/admin/api/contents', auth, requirePermission('content'), (req, res) => {
    let rows = sortByUpdatedDesc(getCollection('contents'));
    if (!rows.length) {
        rows = sortByUpdatedDesc(getCollection('content_boards')).map((item) => ({
            id: item.id,
            title: item.board_name,
            key: item.board_key,
            scene: item.scene,
            type: item.board_type,
            status: item.is_active,
            sort_order: item.sort_order,
            created_at: item.created_at,
            updated_at: item.updated_at
        }));
    }
    ok(res, paginate(rows, req));
});

app.post('/admin/api/contents', auth, requirePermission('content'), (req, res) => {
    const rows = getCollection('contents');
    const row = {
        id: nextId(rows),
        title: pickString(req.body?.title),
        key: pickString(req.body?.key),
        scene: pickString(req.body?.scene, 'home'),
        type: pickString(req.body?.type, 'custom'),
        content: req.body?.content ?? null,
        status: req.body?.status != null ? (toBoolean(req.body.status) ? 1 : 0) : 1,
        sort_order: toNumber(req.body?.sort_order, 0),
        created_at: nowIso(),
        updated_at: nowIso()
    };
    rows.push(row);
    saveCollection('contents', rows);
    ok(res, row);
});

app.put('/admin/api/contents/:id', auth, requirePermission('content'), (req, res) => {
    const rows = getCollection('contents');
    const index = rows.findIndex((item) => Number(item.id) === Number(req.params.id));
    if (index === -1) return fail(res, '内容不存在', 404);
    rows[index] = { ...rows[index], ...req.body, updated_at: nowIso() };
    saveCollection('contents', rows);
    ok(res, rows[index]);
});

app.delete('/admin/api/contents/:id', auth, requirePermission('content'), (req, res) => {
    const rows = getCollection('contents');
    const nextRows = rows.filter((item) => Number(item.id) !== Number(req.params.id));
    if (rows.length === nextRows.length) return fail(res, '内容不存在', 404);
    saveCollection('contents', nextRows);
    ok(res, { success: true });
});

app.get('/admin/api/logs', auth, requirePermission('logs'), (req, res) => {
    let rows = sortByUpdatedDesc(getCollection('admin_audit_logs'));
    const { action, resource, target, start_date, end_date, admin_id } = req.query;
    // 按 action 前缀过滤（支持 "create" 匹配 "product.create" 等）
    if (action) {
        const a = String(action).toLowerCase();
        rows = rows.filter((r) => {
            const ra = String(r.action || '').toLowerCase();
            return ra === a || ra.endsWith(`.${a}`) || ra.includes(`.${a}.`);
        });
    }
    // 按资源类型（target 字段）过滤
    const targetFilter = resource || target;
    if (targetFilter) {
        const t = String(targetFilter).toLowerCase();
        rows = rows.filter((r) => String(r.target || '').toLowerCase().includes(t));
    }
    if (admin_id) {
        rows = rows.filter((r) => String(r.admin_id) === String(admin_id));
    }
    if (start_date) {
        const from = new Date(start_date).getTime();
        rows = rows.filter((r) => new Date(r.created_at).getTime() >= from);
    }
    if (end_date) {
        // 包含当天结束
        const to = new Date(end_date).getTime() + 86400000;
        rows = rows.filter((r) => new Date(r.created_at).getTime() < to);
    }
    ok(res, paginate(rows, req));
});

app.get('/admin/api/logs/export', auth, requirePermission('logs'), (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=\"admin-logs.json\"');
    res.send(JSON.stringify(getCollection('admin_audit_logs'), null, 2));
});

app.get('/admin/api/reviews', auth, requirePermission('content'), (req, res) => {
    const users = getCollection('users');
    const products = getCollection('products');
    const orders = getCollection('orders');
    let rows = sortByUpdatedDesc(getCollection('reviews')).map((item) => buildReviewRecord(item, users, products, orders));
    const keyword = pickString(req.query.keyword).trim().toLowerCase();
    const status = pickString(req.query.status).trim();
    if (keyword) {
        rows = rows.filter((item) => [
            item.content,
            item.product_name,
            item.nickname,
            item.order_no,
            item.reply_content
        ].filter(Boolean).join(' ').toLowerCase().includes(keyword));
    }
    if (status !== '') rows = rows.filter((item) => String(item.status) === status);
    ok(res, paginate(rows, req));
});

function updateReviewRow(req, res, patcher) {
    const row = patchCollectionRow('reviews', req.params.id, (item) => ({
        ...item,
        ...patcher(item),
        updated_at: nowIso()
    }));
    if (!row) return fail(res, '评价不存在', 404);
    const users = getCollection('users');
    const products = getCollection('products');
    const orders = getCollection('orders');
    ok(res, buildReviewRecord(row, users, products, orders));
}

app.put('/admin/api/reviews/:id', auth, requirePermission('content'), (req, res) => updateReviewRow(req, res, () => ({ ...toObject(req.body, {}) })));
app.post('/admin/api/reviews/:id', auth, requirePermission('content'), (req, res) => updateReviewRow(req, res, () => ({ ...toObject(req.body, {}) })));
app.put('/admin/api/reviews/:id/status', auth, requirePermission('content'), (req, res) => updateReviewRow(req, res, () => ({ status: toBoolean(req.body?.status ?? req.body?.visible ?? req.body?.enabled ?? 1) ? 1 : 0 })));
app.post('/admin/api/reviews/:id/status', auth, requirePermission('content'), (req, res) => updateReviewRow(req, res, () => ({ status: toBoolean(req.body?.status ?? req.body?.visible ?? req.body?.enabled ?? 1) ? 1 : 0 })));
app.put('/admin/api/reviews/:id/featured', auth, requirePermission('content'), (req, res) => updateReviewRow(req, res, () => ({ is_featured: toBoolean(req.body?.is_featured ?? req.body?.featured ?? req.body?.value ?? 1) ? 1 : 0 })));
app.post('/admin/api/reviews/:id/featured', auth, requirePermission('content'), (req, res) => updateReviewRow(req, res, () => ({ is_featured: toBoolean(req.body?.is_featured ?? req.body?.featured ?? req.body?.value ?? 1) ? 1 : 0 })));
app.put('/admin/api/reviews/:id/reply', auth, requirePermission('content'), (req, res) => updateReviewRow(req, res, () => ({ reply_content: pickString(req.body?.reply_content ?? req.body?.reply ?? req.body?.content) })));
app.post('/admin/api/reviews/:id/reply', auth, requirePermission('content'), (req, res) => updateReviewRow(req, res, () => ({ reply_content: pickString(req.body?.reply_content ?? req.body?.reply ?? req.body?.content) })));

app.get('/admin/api/home-sections', auth, requirePermission('content'), (req, res) => {
    const products = getCollection('products');
    const rows = sortByUpdatedDesc(getCollection('content_boards')).map((row) => {
        const linkedProducts = getCollection('content_board_products')
            .filter((item) => rowMatchesLookup(item, row.id || row._id, [item.board_id]))
            .map((item) => ({
                ...item,
                product: buildProductSummaryRecord(findByLookup(products, item.product_id), item)
            }));
        return configContract.normalizeHomeSectionRecord({
            ...row,
            board_name: pickString(row.board_name || row.name || row.title || row.board_key || '未命名内容位'),
            board_key: pickString(row.board_key || row.key || `board_${row.id || row._id}`),
            linked_products: linkedProducts,
            linked_product_count: linkedProducts.length
        });
    });
    ok(res, { list: rows, total: rows.length });
});

app.get('/admin/api/home-sections/schemas', auth, requirePermission('content'), (req, res) => ok(res, [
    { key: 'hero', label: '顶部 Hero', fields: ['title', 'subtitle', 'file_id', 'image_url'] },
    { key: 'product_board', label: '商品板块', fields: ['board_key', 'board_name'] }
]));

app.post('/admin/api/home-sections', auth, requirePermission('content'), (req, res) => {
    const rows = getCollection('content_boards');
    const nextRow = configContract.normalizeHomeSectionRecord({
        id: nextId(rows),
        ...toObject(req.body, {}),
        created_at: nowIso(),
        updated_at: nowIso()
    });
    rows.push(nextRow);
    saveCollection('content_boards', rows);
    ok(res, nextRow);
});
app.put('/admin/api/home-sections/:id', auth, requirePermission('content'), (req, res) => {
    const updated = patchCollectionRow('content_boards', req.params.id, (row) => configContract.normalizeHomeSectionRecord({
        ...row,
        ...toObject(req.body, {}),
        updated_at: nowIso()
    }));
    if (!updated) return fail(res, '首页内容位不存在', 404);
    ok(res, updated);
});
app.put('/admin/api/home-sections/:id/toggle', auth, requirePermission('content'), (req, res) => {
    const updated = patchCollectionRow('content_boards', req.params.id, (row) => configContract.normalizeHomeSectionRecord({
        ...row,
        is_visible: row.is_visible ? 0 : 1,
        updated_at: nowIso()
    }));
    if (!updated) return fail(res, '首页内容位不存在', 404);
    ok(res, { success: true, id: updated.id, is_visible: updated.is_visible });
});
app.delete('/admin/api/home-sections/:id', auth, requirePermission('content'), (req, res) => {
    const rows = getCollection('content_boards');
    const before = rows.length;
    const nextRows = rows.filter((item) => !rowMatchesLookup(item, req.params.id));
    if (nextRows.length === before) return fail(res, '首页内容位不存在', 404);
    saveCollection('content_boards', nextRows);
    ok(res, { success: true, id: req.params.id });
});
app.post('/admin/api/home-sections/sort', auth, requirePermission('content'), (req, res) => {
    const orders = Array.isArray(req.body?.orders) ? req.body.orders : [];
    const rows = getCollection('content_boards').map((item) => {
        const hit = orders.find((order) => rowMatchesLookup(item, order.id));
        if (!hit) return item;
        return configContract.normalizeHomeSectionRecord({
            ...item,
            sort_order: Number(hit.sort_order || item.sort_order || 0),
            is_visible: hit.is_visible === undefined ? item.is_visible : hit.is_visible,
            updated_at: nowIso()
        });
    });
    saveCollection('content_boards', rows);
    ok(res, { success: true, sort: orders });
});

app.get('/admin/api/mass-messages', auth, requirePermission('settings_manage'), (req, res) => ok(res, paginate(sortByUpdatedDesc(getCollection('mass_messages')), req)));

// 群发消息：预览目标用户（不实际发送，只返回匹配用户名单）
app.post('/admin/api/mass-messages/preview', auth, requirePermission('settings_manage'), (req, res) => {
    if (rejectUnknownBodyFields(res, req.body, ['targetType', 'targetRoles', 'targetUsers'], '群发预览参数不合法')) return;
    const targetTypeCheck = requireEnumField(req.body?.targetType, 'targetType', '目标用户类型', ['all', 'role', 'specific', 'distributor', 'active_30d']);
    if (!targetTypeCheck.ok) return failWithFieldErrors(res, [targetTypeCheck.error], '群发预览参数不合法');

    const users = getCollection('users');
    const { targetRoles, targetUsers } = req.body || {};
    const targetType = targetTypeCheck.value;
    const ROLE_LABEL = { 0: '普通用户', 1: '会员', 2: '团长', 3: '代理商', 4: '合伙人' };
    const PREVIEW_LIMIT = 100;

    let matched = [];
    if (targetType === 'all') {
        matched = users;
    } else if (targetType === 'role') {
        const levels = toArray(targetRoles).map(Number).filter(Number.isFinite);
        if (!levels.length) {
            return failWithFieldErrors(res, [buildFieldError('targetRoles', '按等级群发时必须至少提供一个用户等级', 'required')], '群发预览参数不合法');
        }
        matched = users.filter((u) => levels.includes(toNumber(u.role_level ?? u.distributor_level ?? u.level, 0)));
    } else if (targetType === 'specific') {
        const ids = toArray(targetUsers).map(String).filter(Boolean);
        if (!ids.length) {
            return failWithFieldErrors(res, [buildFieldError('targetUsers', '指定用户群发时必须提供目标用户列表', 'required')], '群发预览参数不合法');
        }
        matched = users.filter((u) => ids.some((id) => rowMatchesLookup(u, id, [u.openid, u.member_no])));
    } else if (targetType === 'distributor') {
        matched = users.filter((u) => toNumber(u.role_level ?? u.distributor_level ?? u.level, 0) >= 2);
    } else if (targetType === 'active_30d') {
        const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
        matched = users.filter((u) => {
            const ts = u.last_active_at || u.last_login_at || u.updated_at || u.created_at;
            return ts && new Date(ts).getTime() >= since;
        });
    }

    const level = (u) => toNumber(u.role_level ?? u.distributor_level ?? u.level, 0);
    ok(res, {
        count: matched.length,
        preview: matched.slice(0, PREVIEW_LIMIT).map((u) => ({
            id: u.id || u._legacy_id || u._id,
            nickname: pickString(u.nickname || u.nickName || u.name || '未知用户'),
            member_no: pickString(u.member_no || ''),
            role_level: level(u),
            role_label: ROLE_LABEL[level(u)] || `等级${level(u)}`,
            phone: pickString(u.phone || u.mobile || '').replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')
        })),
        truncated: matched.length > PREVIEW_LIMIT
    });
});

app.post('/admin/api/mass-messages', auth, requirePermission('settings_manage'), (req, res) => {
    if (rejectUnknownBodyFields(res, req.body, ['title', 'content', 'contentType', 'sendType', 'scheduledAt', 'jump_path', 'targetType', 'targetRoles', 'targetUsers', 'channel', 'summary', 'remark'], '群发消息参数不合法')) return;
    const titleCheck = requireNonEmptyStringField(req.body?.title, 'title', '消息标题', { maxLength: 80 });
    const contentCheck = requireNonEmptyStringField(req.body?.content, 'content', '消息内容', { maxLength: 2000 });
    const targetTypeCheck = requireEnumField(req.body?.targetType, 'targetType', '目标用户类型', ['all', 'role', 'specific', 'distributor', 'active_30d']);
    const sendTypeCheck = requireEnumField(req.body?.sendType || 'draft', 'sendType', '发送方式', ['draft', 'immediate', 'scheduled']);
    const fieldErrors = [titleCheck, contentCheck, targetTypeCheck, sendTypeCheck]
        .filter((item) => !item.ok)
        .map((item) => item.error);
    if (targetTypeCheck.ok && targetTypeCheck.value === 'role' && !toArray(req.body?.targetRoles).length) {
        fieldErrors.push(buildFieldError('targetRoles', '按等级群发时必须至少提供一个用户等级', 'required'));
    }
    if (targetTypeCheck.ok && targetTypeCheck.value === 'specific' && !toArray(req.body?.targetUsers).length) {
        fieldErrors.push(buildFieldError('targetUsers', '指定用户群发时必须提供目标用户列表', 'required'));
    }
    if (sendTypeCheck.ok && sendTypeCheck.value === 'scheduled' && !pickString(req.body?.scheduledAt).trim()) {
        fieldErrors.push(buildFieldError('scheduledAt', '定时群发必须提供发送时间', 'required'));
    }
    if (fieldErrors.length) return failWithFieldErrors(res, fieldErrors, '群发消息参数不合法');

    const rows = getCollection('mass_messages');
    const row = {
        id: nextId(rows),
        title: titleCheck.value,
        content: contentCheck.value,
        contentType: pickString(req.body?.contentType || 'text') || 'text',
        sendType: sendTypeCheck.value,
        scheduledAt: pickString(req.body?.scheduledAt || ''),
        jump_path: pickString(req.body?.jump_path || ''),
        targetType: targetTypeCheck.value,
        targetRoles: toArray(req.body?.targetRoles).map(Number).filter(Number.isFinite),
        targetUsers: toArray(req.body?.targetUsers).map((item) => String(item)).filter(Boolean),
        channel: pickString(req.body?.channel || 'miniprogram'),
        summary: pickString(req.body?.summary || ''),
        remark: pickString(req.body?.remark || ''),
        status: sendTypeCheck.value === 'draft' ? 'draft' : 'pending',
        created_at: nowIso(),
        updated_at: nowIso()
    };
    rows.push(row);
    saveCollection('mass_messages', rows);
    ok(res, row);
});

app.post('/admin/api/mass-messages/:id/send', auth, requirePermission('settings_manage'), (req, res) => {
    const rows = getCollection('mass_messages');
    const index = rows.findIndex((item) => Number(item.id) === Number(req.params.id));
    if (index === -1) return fail(res, '群发任务不存在', 404);
    rows[index] = { ...rows[index], status: 'sent', sent_at: nowIso(), updated_at: nowIso() };
    saveCollection('mass_messages', rows);
    ok(res, rows[index]);
});

app.delete('/admin/api/mass-messages/:id', auth, requirePermission('settings_manage'), (req, res) => {
    const rows = getCollection('mass_messages');
    saveCollection('mass_messages', rows.filter((item) => Number(item.id) !== Number(req.params.id)));
    ok(res, { success: true });
});

async function buildFreshUserWriteResponse(userId, fallbackData = null) {
    const reloadMeta = await reloadCollectionsWithMeta(STRONG_CONSISTENCY_COLLECTIONS.users);
    const users = getCollection('users');
    const orders = getCollection('orders');
    const commissions = getCollection('commissions');
    const freshUser = findUserByAnyId(users, userId);
    return {
        data: freshUser ? buildUserRecord(freshUser, users, orders, commissions) : fallbackData,
        reloadMeta
    };
}

app.get('/admin/api/users', auth, requirePermission('users'), (req, res) => {
    return (async () => {
    const readMeta = await freshReadMeta(req, STRONG_CONSISTENCY_COLLECTIONS.users, true);
    const users = getCollection('users');
    const orders = getCollection('orders');
    const context = buildUserListContext(users, orders);
    let rows = sortByUpdatedDesc(users).map((item) => buildUserListRecord(item, context));

    const lookup = pickString(req.query.lookup).trim();
    const keyword = pickString(req.query.keyword).trim().toLowerCase();
    const memberNo = pickString(req.query.member_no).trim().toLowerCase();
    const roleLevel = pickString(req.query.role_level).trim();
    const status = normalizeUserStatusFilter(req.query.status);
    const leaderId = pickString(req.query.team_leader_id).trim();

    if (lookup) {
        rows = rows.filter((item) => userMatchesLookup(item, lookup));
    }
    if (keyword) {
        rows = rows.filter((item) => userMatchesKeyword(item, keyword));
    }
    if (memberNo) {
        rows = rows.filter((item) => userMatchesMemberNo(item, memberNo));
    }
    if (roleLevel !== '') rows = rows.filter((item) => Number(item.role_level) === Number(roleLevel));
    if (status !== null) rows = rows.filter((item) => Number(item.status) === Number(status));
    if (leaderId) {
        const leader = context.graph.resolveUser(leaderId);
        const descendants = leader ? context.graph.getDescendants(leader) : [];
        const descendantIds = new Set(descendants.map((item) => String(primaryId(item))));
        rows = rows.filter((item) => descendantIds.has(String(item.id)));
    }

    okStrongRead(res, paginate(rows, req), readMeta.freshness);
    })();
});

app.get('/admin/api/users/search', auth, requirePermission('users'), (req, res) => {
    const keyword = pickString(req.query.keyword).trim();
    const limit = Math.max(1, Math.min(50, toNumber(req.query.limit, 20)));

    if (!keyword) {
        return ok(res, { list: [], total: 0 });
    }

    const matches = sortByUpdatedDesc(getCollection('users'))
        .map((user) => ({ user, score: getUserSearchScore(user, keyword) }))
        .filter((item) => Number.isFinite(item.score))
        .sort((a, b) => a.score - b.score);

    ok(res, {
        list: matches.slice(0, limit).map(({ user }) => buildUserSearchRecord(user)),
        total: matches.length
    });
});

app.get('/admin/api/users/:id', auth, requirePermission('users'), (req, res) => {
    return (async () => {
    const readMeta = await freshReadMeta(req, STRONG_CONSISTENCY_COLLECTIONS.users, true);
    const users = getCollection('users');
    const orders = getCollection('orders');
    const commissions = getCollection('commissions');
    const user = findUserByAnyId(users, req.params.id);
    if (!user) return fail(res, '用户不存在', 404);
    okStrongRead(res, buildUserRecord(user, users, orders, commissions), readMeta.freshness);
    })();
});

app.get('/admin/api/users/:id/team', auth, requirePermission('users'), (req, res) => {
    return (async () => {
    const readMeta = await freshReadMeta(req, STRONG_CONSISTENCY_COLLECTIONS.users, true);
    const users = getCollection('users');
    const orders = getCollection('orders');
    const commissions = getCollection('commissions');
    const user = findUserByAnyId(users, req.params.id);
    if (!user) return fail(res, '用户不存在', 404);
    const level = toNumber(req.query.level, 0);
    const directChildren = getDirectChildren(users, user);
    const members = level === 1
        ? directChildren
        : level === 2
            ? getUserDescendants(users, user, 2).filter((item) => !directChildren.some((child) => rowMatchesLookup(child, primaryId(item), [item.openid])))
            : getUserDescendants(users, user);
    const rows = members.map((item) => ({
        ...buildUserRecord(item, users, orders, commissions),
        joined_team_at: item.joined_team_at || item.bound_parent_at || item.created_at
    }));
    okStrongRead(res, paginate(rows, req), readMeta.freshness);
    })();
});

app.get('/admin/api/users/:id/team-summary', auth, requirePermission('users'), (req, res) => {
    return (async () => {
    const readMeta = await freshReadMeta(req, STRONG_CONSISTENCY_COLLECTIONS.users, true);
    const users = getCollection('users');
    const orders = getCollection('orders');
    const user = findUserByAnyId(users, req.params.id);
    if (!user) return fail(res, '用户不存在', 404);
    okStrongRead(res, buildUserTeamSummary(user, users, orders, pickString(req.query.range || 'all')), readMeta.freshness);
    })();
});

app.put('/admin/api/users/:id/role', auth, requirePermission('user_role_manage'), async (req, res) => {
    if (rejectUnknownBodyFields(res, req.body, ['role_level', 'agent_level'], '用户角色参数不合法')) return;
    const roleLevelCheck = requireNumberField(req.body?.role_level, 'role_level', '角色等级', { min: 0, max: 5, integer: true });
    const agentLevelCheck = req.body?.agent_level == null
        ? { ok: true, value: null }
        : requireNumberField(req.body?.agent_level, 'agent_level', '代理等级', { min: 0, max: 5, integer: true, required: false });
    const roleFieldErrors = [roleLevelCheck, agentLevelCheck].filter((item) => !item.ok).map((item) => item.error);
    if (roleFieldErrors.length) return failWithFieldErrors(res, roleFieldErrors, '用户角色参数不合法');
    const roleLevel = roleLevelCheck.value;
    const users = getCollection('users');
    const existingUser = findByLookup(users, req.params.id);
    const oldLevel = toNumber(existingUser && (existingUser.role_level ?? existingUser.distributor_level), 0);
    const updated = patchCollectionRow('users', req.params.id, (row) => ({
        ...row,
        role_level: roleLevel,
        distributor_level: agentLevelCheck.value != null ? agentLevelCheck.value : row.distributor_level,
        role_upgraded_at: roleLevel > oldLevel ? nowIso() : (row.role_upgraded_at || nowIso()),
        updated_at: nowIso()
    }));
    if (!updated) return fail(res, '用户不存在', 404);
    const openid = updated.openid;
    if (openid && roleLevel > oldLevel && roleLevel >= 3) {
        recordAdminFundPoolEntry(openid, roleLevel, oldLevel).catch(() => {});
    }
    createAuditLog(req.admin, 'user.role.update', 'users', { user_id: primaryId(updated), role_level: roleLevel });
    const fresh = await buildFreshUserWriteResponse(req.params.id, updated);
    okStrongWrite(res, fresh.data, {
        persisted: true,
        reloaded_collections: fresh.reloadMeta.reloaded_collections,
        read_at: fresh.reloadMeta.read_at
    });
});

// ── 货款余额手动调整 ──
app.put('/admin/api/users/:id/goods-fund', auth, requirePermission('user_balance_adjust'), async (req, res) => {
    if (rejectUnknownBodyFields(res, req.body, ['amount', 'type', 'reason'], '货款调整参数不合法')) return;
    const amountCheck = requireNumberField(req.body?.amount, 'amount', '货款金额', { min: 0 });
    const typeCheck = requireEnumField(req.body?.type ?? 'add', 'type', '调整类型', ['add', 'subtract']);
    const reasonFieldCheck = requireNonEmptyStringField(req.body?.reason, 'reason', '调整原因', { maxLength: 200 });
    const goodsFundFieldErrors = [amountCheck, typeCheck, reasonFieldCheck].filter((item) => !item.ok).map((item) => item.error);
    if (goodsFundFieldErrors.length) return failWithFieldErrors(res, goodsFundFieldErrors, '货款调整参数不合法');
    const amount = amountCheck.value;
    const reasonCheck = requireManualAdjustmentReason(reasonFieldCheck.value, '调整原因');
    if (!reasonCheck.ok) return failWithFieldErrors(res, [buildFieldError('reason', reasonCheck.message, 'invalid_reason')], '货款调整参数不合法');
    const type = typeCheck.value;
    const user = findUserByAnyId(getCollection('users'), req.params.id);
    if (!user) return fail(res, '用户不存在', 404);
    const userDocId = pickString(user._id || user.id);
    const userOpenid = pickString(user.openid);
    if (!userOpenid) return fail(res, '用户缺少 openid，不能调整货款余额', 400);
    const current = toNumber(user.agent_wallet_balance != null ? user.agent_wallet_balance : user.wallet_balance, 0);
    if (type === 'subtract' && amount > current) {
        return fail(res, `货款余额不足，当前余额 ${roundMoney(current)}，不能扣减 ${roundMoney(amount)}`, 400);
    }
    const delta = type === 'subtract' ? -amount : amount;
    const next = roundMoney(current + delta);
    const patch = { agent_wallet_balance: next, updated_at: nowIso() };
    if (dataStore._internals?.db) {
        if (!userDocId) return fail(res, '用户文档不存在，无法更新货款余额', 500);
        const writeOk = await directPatchDocument('users', userDocId, patch);
        if (!writeOk) return fail(res, '货款余额更新失败，请稍后重试', 500);
    } else {
        const updated = patchCollectionRow('users', req.params.id, (row) => ({ ...row, ...patch }));
        if (!updated) return fail(res, '用户不存在', 404);
    }
    try {
        await appendGoodsFundLogEntry({
            openid: userOpenid,
            type: 'admin_adjustment',
            amount: delta,
            balance_before: current,
            balance_after: next,
            user_id: primaryId(user),
            remark: `管理员${type === 'subtract' ? '扣减' : '增加'}货款 ${roundMoney(amount)} 元：${reasonCheck.reason}`,
            operator_id: req.admin?.id || '',
            operator_name: req.admin?.username || '管理员'
        });
    } catch (error) {
        const rollbackPatch = { agent_wallet_balance: current, updated_at: nowIso() };
        if (dataStore._internals?.db && userDocId) {
            await directPatchDocument('users', userDocId, rollbackPatch);
        } else {
            patchCollectionRow('users', req.params.id, (row) => ({ ...row, ...rollbackPatch }));
        }
        return fail(res, `货款流水写入失败：${error.message || '未知错误'}`, 500);
    }
    const updatedUser = { ...user, ...patch };
    createAuditLog(req.admin, 'user.goods_fund.adjust', 'users', {
        user_id: primaryId(updatedUser),
        type,
        amount,
        reason: reasonCheck.reason
    });
    const fresh = await buildFreshUserWriteResponse(req.params.id, updatedUser);
    okStrongWrite(res, fresh.data, {
        persisted: true,
        reloaded_collections: fresh.reloadMeta.reloaded_collections,
        read_at: fresh.reloadMeta.read_at
    });
});

// ── 积分手动调整 ──
app.put('/admin/api/users/:id/points', auth, requirePermission('user_balance_adjust'), async (req, res) => {
    if (rejectUnknownBodyFields(res, req.body, ['amount', 'type', 'reason'], '积分调整参数不合法')) return;
    const amountCheck = requireNumberField(req.body?.amount, 'amount', '积分', { min: 0, integer: true });
    const typeCheck = requireEnumField(req.body?.type ?? 'add', 'type', '调整类型', ['add', 'subtract']);
    const reasonFieldCheck = requireNonEmptyStringField(req.body?.reason, 'reason', '调整原因', { maxLength: 200 });
    const pointFieldErrors = [amountCheck, typeCheck, reasonFieldCheck].filter((item) => !item.ok).map((item) => item.error);
    if (pointFieldErrors.length) return failWithFieldErrors(res, pointFieldErrors, '积分调整参数不合法');
    const amount = amountCheck.value;
    const reasonCheck = requireManualAdjustmentReason(reasonFieldCheck.value, '调整原因');
    if (!reasonCheck.ok) return failWithFieldErrors(res, [buildFieldError('reason', reasonCheck.message, 'invalid_reason')], '积分调整参数不合法');
    const type = typeCheck.value;
    const user = findUserByAnyId(getCollection('users'), req.params.id);
    if (!user) return fail(res, '用户不存在', 404);
    const userDocId = pickString(user._id || user.id);
    const userOpenid = pickString(user.openid);
    if (!userOpenid) return fail(res, '用户缺少 openid，不能调整积分', 400);
    const current = toNumber(user.points, 0);
    if (type === 'subtract' && amount > current) {
        return fail(res, `积分不足，当前积分 ${Math.round(current)}，不能扣减 ${Math.round(amount)}`, 400);
    }
    const delta = type === 'subtract' ? -amount : amount;
    const next = Math.round(current + delta);
    const patch = { points: next, updated_at: nowIso() };
    if (dataStore._internals?.db) {
        if (!userDocId) return fail(res, '用户文档不存在，无法更新积分', 500);
        const writeOk = await directPatchDocument('users', userDocId, patch);
        if (!writeOk) return fail(res, '积分更新失败，请稍后重试', 500);
    } else {
        const updated = patchCollectionRow('users', req.params.id, (row) => ({ ...row, ...patch }));
        if (!updated) return fail(res, '用户不存在', 404);
    }
    try {
        await appendPointLogEntry({
            openid: userOpenid,
            type: delta >= 0 ? 'admin_adjust' : 'admin_deduct',
            amount: delta,
            source: 'admin_manual_points',
            user_id: primaryId(user),
            description: `管理员${type === 'subtract' ? '扣减' : '增加'}积分 ${Math.round(amount)}：${reasonCheck.reason}`,
            operator_id: req.admin?.id || '',
            operator_name: req.admin?.username || '管理员'
        });
    } catch (error) {
        const rollbackPatch = { points: current, updated_at: nowIso() };
        if (dataStore._internals?.db && userDocId) {
            await directPatchDocument('users', userDocId, rollbackPatch);
        } else {
            patchCollectionRow('users', req.params.id, (row) => ({ ...row, ...rollbackPatch }));
        }
        return fail(res, `积分流水写入失败：${error.message || '未知错误'}`, 500);
    }
    const updatedUser = { ...user, ...patch };
    createAuditLog(req.admin, 'user.points.adjust', 'users', {
        user_id: primaryId(updatedUser),
        type,
        amount,
        reason: reasonCheck.reason
    });
    const fresh = await buildFreshUserWriteResponse(req.params.id, updatedUser);
    okStrongWrite(res, fresh.data, {
        persisted: true,
        reloaded_collections: fresh.reloadMeta.reloaded_collections,
        read_at: fresh.reloadMeta.read_at
    });
});

// ── 成长值手动调整 ──
app.put('/admin/api/users/:id/growth', auth, requirePermission('user_balance_adjust'), async (req, res) => {
    if (rejectUnknownBodyFields(res, req.body, ['amount', 'type', 'reason'], '成长值调整参数不合法')) return;
    const amountCheck = requireNumberField(req.body?.amount, 'amount', '成长值', { min: 0, integer: true });
    const typeCheck = requireEnumField(req.body?.type ?? 'add', 'type', '调整类型', ['add', 'subtract']);
    const reasonFieldCheck = requireNonEmptyStringField(req.body?.reason, 'reason', '调整原因', { maxLength: 200 });
    const growthFieldErrors = [amountCheck, typeCheck, reasonFieldCheck].filter((item) => !item.ok).map((item) => item.error);
    if (growthFieldErrors.length) return failWithFieldErrors(res, growthFieldErrors, '成长值调整参数不合法');
    const amount = amountCheck.value;
    const reasonCheck = requireManualAdjustmentReason(reasonFieldCheck.value, '调整原因');
    if (!reasonCheck.ok) return failWithFieldErrors(res, [buildFieldError('reason', reasonCheck.message, 'invalid_reason')], '成长值调整参数不合法');
    const type = typeCheck.value;
    const user = findUserByAnyId(getCollection('users'), req.params.id);
    if (!user) return fail(res, '用户不存在', 404);
    const userDocId = pickString(user._id || user.id);
    const userOpenid = pickString(user.openid);
    if (!userOpenid) return fail(res, '用户缺少 openid，不能调整成长值', 400);
    const current = toNumber(user.growth_value, 0);
    if (type === 'subtract' && amount > current) {
        return fail(res, `成长值不足，当前成长值 ${Math.round(current)}，不能扣减 ${Math.round(amount)}`, 400);
    }
    const delta = type === 'subtract' ? -amount : amount;
    const next = Math.round(current + delta);
    const patch = { growth_value: next, updated_at: nowIso() };
    if (dataStore._internals?.db) {
        if (!userDocId) return fail(res, '用户文档不存在，无法更新成长值', 500);
        const writeOk = await directPatchDocument('users', userDocId, patch);
        if (!writeOk) return fail(res, '成长值更新失败，请稍后重试', 500);
    } else {
        const updated = patchCollectionRow('users', req.params.id, (row) => ({ ...row, ...patch }));
        if (!updated) return fail(res, '用户不存在', 404);
    }
    try {
        await appendPointLogEntry({
            openid: userOpenid,
            type: 'admin_growth_adjust',
            amount: delta,
            source: 'admin_manual_growth',
            user_id: primaryId(user),
            description: `管理员${type === 'subtract' ? '扣减' : '增加'}成长值 ${Math.round(amount)}：${reasonCheck.reason}`,
            operator_id: req.admin?.id || '',
            operator_name: req.admin?.username || '管理员'
        });
    } catch (error) {
        const rollbackPatch = { growth_value: current, updated_at: nowIso() };
        if (dataStore._internals?.db && userDocId) {
            await directPatchDocument('users', userDocId, rollbackPatch);
        } else {
            patchCollectionRow('users', req.params.id, (row) => ({ ...row, ...rollbackPatch }));
        }
        return fail(res, `成长值流水写入失败：${error.message || '未知错误'}`, 500);
    }
    const updatedUser = { ...user, ...patch };
    createAuditLog(req.admin, 'user.growth.adjust', 'users', {
        user_id: primaryId(updatedUser),
        type,
        amount,
        reason: reasonCheck.reason
    });
    const fresh = await buildFreshUserWriteResponse(req.params.id, updatedUser);
    okStrongWrite(res, fresh.data, {
        persisted: true,
        reloaded_collections: fresh.reloadMeta.reloaded_collections,
        read_at: fresh.reloadMeta.read_at
    });
});

// ── 佣金手动调整（直接向 commissions 集合插入一条记录） ──
app.post('/admin/api/users/:id/commission', auth, requirePermission('user_balance_adjust'), async (req, res) => {
    const amount = toNumber(req.body?.amount, NaN);
    if (!Number.isFinite(amount) || amount <= 0) return fail(res, '金额必须大于0');
    const reasonCheck = requireManualAdjustmentReason(req.body?.reason, '调整原因');
    if (!reasonCheck.ok) return fail(res, reasonCheck.message);
    const type = pickString(req.body?.type, 'add'); // add | subtract
    const userRows = getCollection('users');
    const user = userRows.find((u) => rowMatchesLookup(u, req.params.id));
    if (!user) return fail(res, '用户不存在', 404);
    const currentCommission = toNumber(user.commission_balance != null ? user.commission_balance : user.balance, 0);
    if (type === 'subtract' && amount > currentCommission) {
        return fail(res, `佣金余额不足，当前余额 ${roundMoney(currentCommission)}，不能扣减 ${roundMoney(amount)}`, 400);
    }

    const comms = getCollection('commissions');
    const newRecord = {
        _id: String(Date.now()) + Math.random().toString(36).slice(2, 8),
        openid: user.openid,
        user_id: primaryId(user),
        type: type === 'subtract' ? 'admin_deduct' : 'admin_credit',
        amount: type === 'subtract' ? -Math.abs(amount) : Math.abs(amount),
        status: 'settled',
        source: 'admin_manual',
        remark: reasonCheck.reason,
        operator_id: req.admin?.id || '',
        operator_name: req.admin?.username || '管理员',
        created_at: nowIso(),
        updated_at: nowIso()
    };
    if (dataStore._internals?.db) {
        await dataStore._internals.db.collection('commissions').add({ data: newRecord });
    } else {
        saveCollection('commissions', [...comms, newRecord]);
    }

    // 同步更新 users.commission_balance / balance
    const delta = type === 'subtract' ? -amount : amount;
    const next = roundMoney(currentCommission + delta);
    const userPatch = {
        commission_balance: next,
        balance: next,
        updated_at: nowIso()
    };
    if (dataStore._internals?.db) {
        const userDocId = pickString(user._id || user.id);
        if (!userDocId) return fail(res, '用户文档不存在，无法更新佣金余额', 500);
        const writeOk = await directPatchDocument('users', userDocId, userPatch);
        if (!writeOk) return fail(res, '佣金余额更新失败，请稍后重试', 500);
    } else {
        patchCollectionRow('users', req.params.id, (row) => ({ ...row, ...userPatch }));
    }

    createAuditLog(req.admin, 'user.commission.adjust', 'commissions', {
        user_id: primaryId(user),
        type,
        amount,
        reason: reasonCheck.reason
    });
    const fresh = await buildFreshUserWriteResponse(req.params.id, null);
    okStrongWrite(res, {
        success: true,
        record: newRecord,
        fresh_user: fresh.data
    }, {
        persisted: true,
        reloaded_collections: fresh.reloadMeta.reloaded_collections,
        read_at: fresh.reloadMeta.read_at
    });
});

app.post('/admin/api/users/:id/debt-settlement', auth, requirePermission('user_balance_adjust'), async (req, res) => {
    const amount = roundMoney(toNumber(req.body?.amount, NaN));
    if (!Number.isFinite(amount) || amount <= 0) return fail(res, '处理金额必须大于 0');
    const reasonCheck = requireManualAdjustmentReason(req.body?.reason, '处理原因');
    if (!reasonCheck.ok) return fail(res, reasonCheck.message);
    const source = pickString(req.body?.source || 'goods_fund').trim();
    if (!['goods_fund', 'offline'].includes(source)) return fail(res, '仅支持货款抵扣或线下确认两种处理方式');

    const users = getCollection('users');
    const orders = getCollection('orders');
    const commissions = getCollection('commissions');
    const user = findUserByAnyId(users, req.params.id);
    if (!user) return fail(res, '用户不存在', 404);

    const userDocId = pickString(user._id || user.id);
    const userOpenid = pickString(user.openid);
    if (!userOpenid) return fail(res, '用户缺少 openid，不能处理欠款', 400);

    const currentDebt = roundMoney(toNumber(user.debt_amount, 0));
    if (currentDebt <= 0) return fail(res, '当前用户没有待处理欠款', 400);
    if (amount > currentDebt) return fail(res, `处理金额不能超过当前欠款 ${currentDebt}`, 400);

    const currentGoodsFund = roundMoney(toNumber(user.agent_wallet_balance != null ? user.agent_wallet_balance : user.wallet_balance, 0));
    if (source === 'goods_fund' && amount > currentGoodsFund) {
        return fail(res, `货款余额不足，当前余额 ${currentGoodsFund}，不能抵扣 ${amount}`, 400);
    }

    const nextDebt = roundMoney(currentDebt - amount);
    const nextGoodsFund = source === 'goods_fund'
        ? roundMoney(currentGoodsFund - amount)
        : currentGoodsFund;

    const patch = {
        debt_amount: nextDebt,
        debt_reason: nextDebt > 0 ? pickString(user.debt_reason || reasonCheck.reason) : '',
        updated_at: nowIso()
    };
    if (source === 'goods_fund') {
        patch.agent_wallet_balance = nextGoodsFund;
    }

    if (dataStore._internals?.db) {
        if (!userDocId) return fail(res, '用户文档不存在，无法更新欠款', 500);
        const writeOk = await directPatchDocument('users', userDocId, patch);
        if (!writeOk) return fail(res, '欠款处理失败，请稍后重试', 500);
    } else {
        const updated = patchCollectionRow('users', req.params.id, (row) => ({ ...row, ...patch }));
        if (!updated) return fail(res, '用户不存在', 404);
    }

    try {
        await appendGoodsFundLogEntry({
            openid: userOpenid,
            type: 'debt_settlement',
            amount: source === 'goods_fund' ? -amount : 0,
            debt_offset: amount,
            settlement_source: source,
            balance_before: currentGoodsFund,
            balance_after: nextGoodsFund,
            debt_before: currentDebt,
            debt_after: nextDebt,
            user_id: primaryId(user),
            remark: `欠款处理 ${amount} 元：${reasonCheck.reason}`,
            operator_id: req.admin?.id || '',
            operator_name: req.admin?.username || '管理员'
        });
    } catch (error) {
        const rollback = {
            debt_amount: currentDebt,
            debt_reason: pickString(user.debt_reason),
            updated_at: nowIso()
        };
        if (source === 'goods_fund') {
            rollback.agent_wallet_balance = currentGoodsFund;
        }
        if (dataStore._internals?.db && userDocId) {
            await directPatchDocument('users', userDocId, rollback);
        } else {
            patchCollectionRow('users', req.params.id, (row) => ({ ...row, ...rollback }));
        }
        return fail(res, `欠款处理流水写入失败：${error.message || '未知错误'}`, 500);
    }

    const updatedUser = buildUserRecord({ ...user, ...patch }, getCollection('users'), orders, commissions);
    createAuditLog(req.admin, 'user.debt.settle', 'users', {
        user_id: primaryId(user),
        amount,
        source,
        debt_before: currentDebt,
        debt_after: nextDebt,
        goods_fund_before: currentGoodsFund,
        goods_fund_after: nextGoodsFund,
        reason: reasonCheck.reason
    });
    const fresh = await buildFreshUserWriteResponse(req.params.id, updatedUser);
    okStrongWrite(res, fresh.data, {
        persisted: true,
        reloaded_collections: fresh.reloadMeta.reloaded_collections,
        read_at: fresh.reloadMeta.read_at
    });
});

app.put('/admin/api/users/:id/status', auth, requirePermission('user_status_manage'), async (req, res) => {
    const updated = patchCollectionRow('users', req.params.id, (row) => ({
        ...row,
        status: toBoolean(req.body?.status) ? 1 : 0,
        status_reason: pickString(req.body?.reason),
        updated_at: nowIso()
    }));
    if (!updated) return fail(res, '用户不存在', 404);
    createAuditLog(req.admin, 'user.status.update', 'users', { user_id: primaryId(updated), status: toBoolean(req.body?.status) ? 1 : 0 });
    const fresh = await buildFreshUserWriteResponse(req.params.id, updated);
    okStrongWrite(res, fresh.data, {
        persisted: true,
        reloaded_collections: fresh.reloadMeta.reloaded_collections,
        read_at: fresh.reloadMeta.read_at
    });
});

app.post('/admin/api/users/batch-role', auth, requirePermission('user_role_manage'), async (req, res) => {
    const ids = toArray(req.body?.user_ids || req.body?.ids);
    const roleLevel = toNumber(req.body?.role_level, NaN);
    if (!ids.length || !Number.isFinite(roleLevel)) return fail(res, '请提供用户列表和角色等级');
    const rows = getCollection('users').map((row) => ids.some((id) => rowMatchesLookup(row, id))
        ? { ...row, role_level: roleLevel, updated_at: nowIso() }
        : row);
    saveCollection('users', rows);
    createAuditLog(req.admin, 'user.role.batch-update', 'users', { user_ids: ids, role_level: roleLevel });
    const reloadMeta = await reloadCollectionsWithMeta(STRONG_CONSISTENCY_COLLECTIONS.users);
    okStrongWrite(res, { success: true, affected: ids.length }, {
        persisted: true,
        reloaded_collections: reloadMeta.reloaded_collections,
        read_at: reloadMeta.read_at
    });
});

app.put('/admin/api/users/:id/remark', auth, requirePermission('users'), async (req, res) => {
    const updated = patchCollectionRow('users', req.params.id, (row) => ({
        ...row,
        remark: pickString(req.body?.remark),
        tags: toArray(req.body?.tags),
        updated_at: nowIso()
    }));
    if (!updated) return fail(res, '用户不存在', 404);
    const fresh = await buildFreshUserWriteResponse(req.params.id, updated);
    okStrongWrite(res, fresh.data, {
        persisted: true,
        reloaded_collections: fresh.reloadMeta.reloaded_collections,
        read_at: fresh.reloadMeta.read_at
    });
});

app.put('/admin/api/users/:id/commerce', auth, requirePermission('users'), async (req, res) => {
    const updated = patchCollectionRow('users', req.params.id, (row) => ({
        ...row,
        participate_distribution: req.body?.participate_distribution == null ? row.participate_distribution : (toBoolean(req.body.participate_distribution) ? 1 : 0),
        updated_at: nowIso()
    }));
    if (!updated) return fail(res, '用户不存在', 404);
    const fresh = await buildFreshUserWriteResponse(req.params.id, updated);
    okStrongWrite(res, fresh.data, {
        persisted: true,
        reloaded_collections: fresh.reloadMeta.reloaded_collections,
        read_at: fresh.reloadMeta.read_at
    });
});

app.put('/admin/api/users/:id/invite-code', auth, requirePermission('users'), async (req, res) => {
    const updated = patchCollectionRow('users', req.params.id, (row) => ({
        ...row,
        invite_code: pickString(req.body?.invite_code),
        updated_at: nowIso()
    }));
    if (!updated) return fail(res, '用户不存在', 404);
    const fresh = await buildFreshUserWriteResponse(req.params.id, updated);
    okStrongWrite(res, fresh.data, {
        persisted: true,
        reloaded_collections: fresh.reloadMeta.reloaded_collections,
        read_at: fresh.reloadMeta.read_at
    });
});

app.put('/admin/api/users/:id/member-no', auth, requirePermission('users'), async (req, res) => {
    const updated = patchCollectionRow('users', req.params.id, (row) => ({
        ...row,
        member_no: pickString(req.body?.member_no),
        updated_at: nowIso()
    }));
    if (!updated) return fail(res, '用户不存在', 404);
    const fresh = await buildFreshUserWriteResponse(req.params.id, updated);
    okStrongWrite(res, fresh.data, {
        persisted: true,
        reloaded_collections: fresh.reloadMeta.reloaded_collections,
        read_at: fresh.reloadMeta.read_at
    });
});

app.put('/admin/api/users/:id/parent', auth, requirePermission('user_parent_manage'), async (req, res) => {
    const users = getCollection('users');
    const current = findUserByAnyId(users, req.params.id);
    if (!current) return fail(res, '用户不存在', 404);
    const nextParent = req.body?.new_parent_id ? findUserByAnyId(users, req.body.new_parent_id) : null;
    if (req.body?.new_parent_id && !nextParent) return fail(res, '新上级不存在', 404);
    if (nextParent && rowMatchesLookup(nextParent, primaryId(current), [current.openid])) return fail(res, '不能将用户设置为自己的上级');
    const updatedRows = users.map((row) => rowMatchesLookup(row, req.params.id)
        ? {
            ...row,
            parent_id: nextParent ? primaryId(nextParent) : null,
            parent_openid: nextParent?.openid || '',
            referrer_openid: nextParent?.openid || '',
            updated_at: nowIso()
        }
        : row);
    saveCollection('users', updatedRows);
    createAuditLog(req.admin, 'user.parent.update', 'users', {
        user_id: primaryId(current),
        new_parent_id: nextParent ? primaryId(nextParent) : null,
        reason: pickString(req.body?.reason)
    });
    const fresh = await buildFreshUserWriteResponse(req.params.id, findUserByAnyId(updatedRows, req.params.id));
    okStrongWrite(res, fresh.data, {
        persisted: true,
        reloaded_collections: fresh.reloadMeta.reloaded_collections,
        read_at: fresh.reloadMeta.read_at
    });
});

app.put('/admin/api/users/:id/purchase-level', auth, requirePermission('users'), async (req, res) => {
    const updated = patchCollectionRow('users', req.params.id, (row) => ({
        ...row,
        purchase_level_code: req.body?.purchase_level_code == null ? '' : pickString(req.body.purchase_level_code),
        updated_at: nowIso()
    }));
    if (!updated) return fail(res, '用户不存在', 404);
    const fresh = await buildFreshUserWriteResponse(req.params.id, updated);
    okStrongWrite(res, fresh.data, {
        persisted: true,
        reloaded_collections: fresh.reloadMeta.reloaded_collections,
        read_at: fresh.reloadMeta.read_at
    });
});

app.get('/admin/api/dealers', auth, requirePermission('dealers'), (req, res) => {
    const users = getCollection('users');
    const keyword = pickString(req.query.keyword).trim().toLowerCase();
    const status = normalizeDealerStatus(req.query.status, '');

    let rows = sortByUpdatedDesc(users)
        .filter(isDealerCandidate)
        .map((user) => buildDealerRecord(user));

    if (status) rows = rows.filter((item) => item.status === status);
    if (keyword) {
        rows = rows.filter((item) => [
            item.company_name,
            item.contact_name,
            item.dealer_no,
            item.user?.nickname,
            item.user_id
        ].filter(Boolean).join(' ').toLowerCase().includes(keyword));
    }

    ok(res, paginate(rows, req));
});

app.put('/admin/api/dealers/:id/approve', auth, requirePermission('dealers'), async (req, res) => {
    const approvedAt = nowIso();
    const users = getCollection('users');
    const existingUser = findByLookup(users, req.params.id);
    const oldLevel = toNumber(existingUser && (existingUser.role_level ?? existingUser.distributor_level), 0);
    const updated = patchCollectionRow('users', req.params.id, (row) => {
        const newLevel = Math.max(toNumber(row.role_level, 0), 3);
        return {
            ...row,
            dealer_status: 'approved',
            dealer_approved_at: approvedAt,
            dealer_level: inferDealerLevel(row),
            role_level: newLevel,
            distributor_level: Math.max(toNumber(row.distributor_level, 0), 2),
            role_upgraded_at: newLevel > oldLevel ? approvedAt : (row.role_upgraded_at || approvedAt),
            updated_at: approvedAt
        };
    });
    if (!updated) return fail(res, '经销商不存在', 404);
    const newLevel = toNumber(updated.role_level, 0);
    if (updated.openid && newLevel > oldLevel && newLevel >= 3) {
        recordAdminFundPoolEntry(updated.openid, newLevel, oldLevel).catch(() => {});
    }
    createAuditLog(req.admin, 'dealer.approve', 'users', { dealer_user_id: primaryId(updated) });
    ok(res, buildDealerRecord(updated));
});

app.put('/admin/api/dealers/:id/reject', auth, requirePermission('dealers'), (req, res) => {
    const rejectedAt = nowIso();
    const updated = patchCollectionRow('users', req.params.id, (row) => ({
        ...row,
        dealer_status: 'rejected',
        dealer_reject_reason: pickString(req.body?.reason),
        updated_at: rejectedAt
    }));
    if (!updated) return fail(res, '经销商不存在', 404);
    createAuditLog(req.admin, 'dealer.reject', 'users', { dealer_user_id: primaryId(updated), reason: pickString(req.body?.reason) });
    ok(res, buildDealerRecord(updated));
});

app.put('/admin/api/dealers/:id/level', auth, requirePermission('dealers'), async (req, res) => {
    const level = toNumber(req.body?.level, NaN);
    if (!Number.isFinite(level) || level < 1 || level > 3) return fail(res, '请提供有效的经销商等级');
    const updatedAt = nowIso();
    const users = getCollection('users');
    const existingUser = findByLookup(users, req.params.id);
    const oldLevel = toNumber(existingUser && (existingUser.role_level ?? existingUser.distributor_level), 0);
    const updated = patchCollectionRow('users', req.params.id, (row) => {
        const newRoleLevel = dealerRoleLevelForLevel(level);
        return {
            ...row,
            dealer_level: level,
            dealer_status: normalizeDealerStatus(row.dealer_status, 'approved'),
            role_level: newRoleLevel,
            distributor_level: Math.max(toNumber(row.distributor_level, 0), level),
            role_upgraded_at: newRoleLevel > oldLevel ? updatedAt : (row.role_upgraded_at || updatedAt),
            updated_at: updatedAt
        };
    });
    if (!updated) return fail(res, '经销商不存在', 404);
    const newLevel = toNumber(updated.role_level, 0);
    if (updated.openid && newLevel > oldLevel && newLevel >= 3) {
        recordAdminFundPoolEntry(updated.openid, newLevel, oldLevel).catch(() => {});
    }
    createAuditLog(req.admin, 'dealer.level.update', 'users', { dealer_user_id: primaryId(updated), level });
    ok(res, buildDealerRecord(updated));
});

app.put('/admin/api/dealers/:id/profile', auth, requirePermission('dealers'), (req, res) => {
    const updated = patchCollectionRow('users', req.params.id, (row) => ({
        ...row,
        company_name: req.body?.company_name != null ? pickString(req.body.company_name) : row.company_name,
        contact_name: req.body?.contact_name != null ? pickString(req.body.contact_name) : row.contact_name,
        contact_phone: req.body?.contact_phone != null ? pickString(req.body.contact_phone) : row.contact_phone,
        contact_email: req.body?.contact_email != null ? pickString(req.body.contact_email) : row.contact_email,
        legal_person: req.body?.legal_person != null ? pickString(req.body.legal_person) : row.legal_person,
        company_address: req.body?.company_address != null ? pickString(req.body.company_address) : row.company_address,
        business_license_no: req.body?.business_license_no != null ? pickString(req.body.business_license_no) : row.business_license_no,
        tax_no: req.body?.tax_no != null ? pickString(req.body.tax_no) : row.tax_no,
        invoice_title: req.body?.invoice_title != null ? pickString(req.body.invoice_title) : row.invoice_title,
        invoice_email: req.body?.invoice_email != null ? pickString(req.body.invoice_email) : row.invoice_email,
        bank_account_name: req.body?.bank_account_name != null ? pickString(req.body.bank_account_name) : row.bank_account_name,
        bank_account_no: req.body?.bank_account_no != null ? pickString(req.body.bank_account_no) : row.bank_account_no,
        bank_name: req.body?.bank_name != null ? pickString(req.body.bank_name) : row.bank_name,
        updated_at: nowIso()
    }));
    if (!updated) return fail(res, '经销商不存在', 404);
    createAuditLog(req.admin, 'dealer.profile.update', 'users', { dealer_user_id: primaryId(updated) });
    ok(res, buildDealerRecord(updated));
});

app.get('/admin/api/admins', auth, requirePermission('admins'), (req, res) => {
    const keyword = pickString(req.query.keyword).trim().toLowerCase();
    const role = pickString(req.query.role).trim();
    let rows = sortByUpdatedDesc(getCollection('admins')).map(sanitizeAdminRecord);
    if (keyword) {
        rows = rows.filter((item) => [item.username, item.name, item.phone, item.email, item.id]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(keyword));
    }
    if (role) rows = rows.filter((item) => item.role === role);
    ok(res, paginate(rows, req));
});

app.post('/admin/api/admins', auth, requirePermission('admins'), (req, res) => {
    if (!isSuperAdminAdmin(req.admin)) return fail(res, '只有超级管理员可以创建管理员账号', 403);
    const rows = getCollection('admins');
    const username = pickString(req.body?.username).trim();
    const password = pickString(req.body?.password);
    const role = pickString(req.body?.role || 'operator').trim() || 'operator';
    if (!username) return fail(res, '请输入用户名');
    if (password.length < 6) return fail(res, '密码至少6位');
    if (!isValidAdminRole(role)) return fail(res, '管理员角色无效');
    if (rows.some((item) => pickString(item.username).toLowerCase() === username.toLowerCase())) {
        return fail(res, '用户名已存在');
    }
    const salt = crypto.randomBytes(16).toString('hex');
    const row = {
        id: nextId(rows),
        username,
        name: pickString(req.body?.name || username),
        role,
        permissions: normalizeAdminPermissions(req.body?.permissions, { allowProtected: role === SUPER_ADMIN_ROLE }),
        phone: pickString(req.body?.phone),
        email: pickString(req.body?.email),
        password_hash: hashPassword(password, salt),
        salt,
        status: 1,
        created_at: nowIso(),
        updated_at: nowIso(),
        last_login_at: '',
        last_login_ip: ''
    };
    rows.push(row);
    saveCollection('admins', rows);
    createAuditLog(req.admin, 'admin.create', 'admins', { admin_id: row.id, username: row.username });
    ok(res, sanitizeAdminRecord(row));
});

app.put('/admin/api/admins/:id', auth, requirePermission('admins'), (req, res) => {
    const rows = getCollection('admins');
    const target = rows.find((item) => rowMatchesLookup(item, req.params.id));
    if (!target) return fail(res, '管理员不存在', 404);
    const isSelf = rowMatchesLookup(target, req.admin.id, [req.admin.username]);
    const canManageAllAdmins = isSuperAdminAdmin(req.admin);
    if (!canManageAllAdmins && !isSelf) {
        return fail(res, '只有超级管理员可以修改其他管理员', 403);
    }
    const nextRole = req.body?.role != null ? pickString(req.body.role).trim() : pickString(target.role);
    if (!isValidAdminRole(nextRole)) return fail(res, '管理员角色无效');
    if (pickString(target.role) === SUPER_ADMIN_ROLE) {
        if (nextRole !== SUPER_ADMIN_ROLE) return fail(res, '不能调整超级管理员角色', 403);
        if (req.body?.status != null && !toBoolean(req.body.status)) return fail(res, '不能禁用超级管理员', 403);
    }
    const permissions = req.body?.permissions != null
        ? normalizeAdminPermissions(req.body.permissions, { allowProtected: nextRole === SUPER_ADMIN_ROLE })
        : target.permissions;
    const updated = patchCollectionRow('admins', req.params.id, (row) => ({
        ...row,
        name: req.body?.name != null ? pickString(req.body.name) : row.name,
        role: canManageAllAdmins ? nextRole : row.role,
        permissions: canManageAllAdmins ? permissions : row.permissions,
        phone: req.body?.phone != null ? pickString(req.body.phone) : row.phone,
        email: req.body?.email != null ? pickString(req.body.email) : row.email,
        status: canManageAllAdmins && req.body?.status != null ? (toBoolean(req.body.status) ? 1 : 0) : row.status,
        updated_at: nowIso()
    }));
    createAuditLog(req.admin, 'admin.update', 'admins', { admin_id: primaryId(updated) });
    ok(res, sanitizeAdminRecord(updated));
});

app.put('/admin/api/admins/:id/password', auth, requirePermission('admins'), (req, res) => {
    const rows = getCollection('admins');
    const target = rows.find((item) => rowMatchesLookup(item, req.params.id));
    if (!target) return fail(res, '管理员不存在', 404);
    const isSelf = rowMatchesLookup(target, req.admin.id, [req.admin.username]);
    if (!isSelf && !isSuperAdminAdmin(req.admin)) {
        return fail(res, '只有超级管理员可以重置其他管理员密码', 403);
    }
    const password = pickString(req.body?.new_password || req.body?.password);
    if (password.length < 6) return fail(res, '密码至少6位');
    const salt = crypto.randomBytes(16).toString('hex');
    const updated = patchCollectionRow('admins', req.params.id, (row) => ({
        ...row,
        salt,
        password_hash: hashPassword(password, salt),
        updated_at: nowIso()
    }));
    createAuditLog(req.admin, isSelf ? 'admin.password.update' : 'admin.password.reset', 'admins', { admin_id: primaryId(updated) });
    ok(res, { success: true });
});

app.delete('/admin/api/admins/:id', auth, requirePermission('admins'), (req, res) => {
    if (!isSuperAdminAdmin(req.admin)) return fail(res, '只有超级管理员可以删除管理员账号', 403);
    const rows = getCollection('admins');
    const target = rows.find((item) => rowMatchesLookup(item, req.params.id));
    if (!target) return fail(res, '管理员不存在', 404);
    if (pickString(target.role) === SUPER_ADMIN_ROLE) return fail(res, '不能删除超级管理员', 403);
    saveCollection('admins', rows.filter((item) => !rowMatchesLookup(item, req.params.id)));
    createAuditLog(req.admin, 'admin.delete', 'admins', { admin_id: primaryId(target) });
    ok(res, { success: true });
});

app.get('/admin/api/branch-agent-policy', auth, requirePermission('dealers'), (req, res) => {
    ok(res, getBranchAgentPolicySnapshot());
});

app.put('/admin/api/branch-agent-policy', auth, requirePermission('dealers'), (req, res) => {
    const current = getBranchAgentPolicySnapshot();
    const payload = toObject(req.body, {});
    const nextPolicy = normalizeBranchAgentPolicySnapshot({
        ...current,
        ...payload,
        region_reward_tiers: Array.isArray(payload.region_reward_tiers) ? payload.region_reward_tiers : current.region_reward_tiers
    });
    saveSingleton('branch-agent-policy', nextPolicy);
    upsertConfigRow('branch-agent-policy', nextPolicy, {
        category: 'dealers',
        group: 'dealers',
        description: '分支代理策略'
    });
    createAuditLog(req.admin, 'branch-agent.policy.update', 'branch-agent-policy', {});
    ok(res, nextPolicy);
});

app.get('/admin/api/branch-agents/stations', auth, requirePermission('dealers'), (req, res) => {
    const users = getCollection('users');
    const rows = sortByUpdatedDesc(getBranchAgentStationsSnapshot()).map((item) => buildBranchAgentStationRecord(item, users));
    ok(res, rows);
});

app.post('/admin/api/branch-agents/stations', auth, requirePermission('dealers'), (req, res) => {
    const rows = getCollection('branch_agent_stations');
    const row = {
        id: nextId(rows),
        name: pickString(req.body?.name),
        status: pickString(req.body?.status || 'active'),
        branch_type: normalizeBranchScopeLevel(req.body?.branch_type || 'district'),
        province: pickString(req.body?.province),
        city: pickString(req.body?.city),
        district: pickString(req.body?.district),
        claimant_id: req.body?.claimant_id || null,
        created_at: nowIso(),
        updated_at: nowIso()
    };
    rows.push(row);
    saveCollection('branch_agent_stations', rows);
    syncBranchStationToPickupStation(row);
    createAuditLog(req.admin, 'branch-agent.station.create', 'branch_agent_stations', { station_id: row.id });
    ok(res, row);
});

app.put('/admin/api/branch-agents/stations/:id', auth, requirePermission('dealers'), (req, res) => {
    const updated = patchCollectionRow('branch_agent_stations', req.params.id, (row) => ({
        ...row,
        name: req.body?.name != null ? pickString(req.body.name) : row.name,
        branch_type: req.body?.branch_type != null ? normalizeBranchScopeLevel(req.body.branch_type) : normalizeBranchScopeLevel(row.branch_type),
        province: req.body?.province != null ? pickString(req.body.province) : row.province,
        city: req.body?.city != null ? pickString(req.body.city) : row.city,
        district: req.body?.district != null ? pickString(req.body.district) : row.district,
        claimant_id: req.body?.claimant_id !== undefined ? (req.body.claimant_id || null) : row.claimant_id,
        status: req.body?.status != null ? pickString(req.body.status) : row.status,
        updated_at: nowIso()
    }));
    if (!updated) return fail(res, '点位不存在', 404);
    syncBranchStationToPickupStation(updated);
    createAuditLog(req.admin, 'branch-agent.station.update', 'branch_agent_stations', { station_id: primaryId(updated) });
    ok(res, updated);
});

app.get('/admin/api/branch-agents/claims', auth, requirePermission('dealers'), (req, res) => {
    const users = getCollection('users');
    const stations = getBranchAgentStationsSnapshot();
    const rows = sortByUpdatedDesc(getCollection('branch_agent_claims')).map((item) => buildBranchAgentClaimRecord(item, users, stations));
    ok(res, rows);
});

app.put('/admin/api/branch-agents/claims/:id/review', auth, requirePermission('dealers'), (req, res) => {
    const action = pickString(req.body?.action).trim();
    if (!['approve', 'reject'].includes(action)) return fail(res, '请提供有效操作');
    const updated = patchCollectionRow('branch_agent_claims', req.params.id, (row) => ({
        ...row,
        status: action === 'approve' ? 'approved' : 'rejected',
        reviewed_at: nowIso(),
        note: pickString(req.body?.note),
        updated_at: nowIso()
    }));
    if (!updated) return fail(res, '申请不存在', 404);
    if (action === 'approve' && updated.station_id) {
        const stationUpdated = patchCollectionRow('branch_agent_stations', updated.station_id, (row) => ({
            ...row,
            claimant_id: updated.applicant_id || updated.user_id || updated.openid || row.claimant_id || null,
            status: 'active',
            updated_at: nowIso()
        }));
        syncBranchStationToPickupStation(stationUpdated);
    }
    createAuditLog(req.admin, `branch-agent.claim.${action}`, 'branch_agent_claims', { claim_id: primaryId(updated) });
    ok(res, updated);
});

app.get('/admin/api/n-system/leaders', auth, requirePermission('dealers'), (req, res) => {
    const search = pickString(req.query.search).trim().toLowerCase();
    let rows = sortByUpdatedDesc(getCollection('users'))
        .filter((user) => toNumber(user.role_level, 0) === 7)
        .map((user) => buildNSystemLeaderRecord(user, getCollection('users')));
    if (search) {
        rows = rows.filter((item) => [item.nickname, item.phone, item.id].filter(Boolean).join(' ').toLowerCase().includes(search));
    }
    ok(res, paginate(rows, req));
});

app.get('/admin/api/n-system/members', auth, requirePermission('dealers'), (req, res) => {
    const users = getCollection('users');
    const search = pickString(req.query.search).trim().toLowerCase();
    let rows = sortByUpdatedDesc(users)
        .filter((user) => toNumber(user.role_level, 0) === 6)
        .map((user) => buildNSystemMemberRecord(user, users));
    if (search) {
        rows = rows.filter((item) => [item.nickname, item.phone, item.id, item.nLeader?.nickname].filter(Boolean).join(' ').toLowerCase().includes(search));
    }
    ok(res, paginate(rows, req));
});

app.get('/admin/api/n-system/leaders/:id/members', auth, requirePermission('dealers'), (req, res) => {
    const users = getCollection('users');
    const leader = findUserByAnyId(users, req.params.id);
    if (!leader) return fail(res, '大N不存在', 404);
    const rows = sortByUpdatedDesc(users)
        .filter((user) => toNumber(user.role_level, 0) === 6)
        .filter((user) => {
            const mappedLeader = findUserByAnyId(users, getNLeaderRef(user));
            return mappedLeader && rowMatchesLookup(mappedLeader, primaryId(leader), [leader.openid]);
        })
        .map((user) => buildNSystemMemberRecord(user, users));
    ok(res, { list: rows, total: rows.length });
});

app.get('/admin/api/upgrade-applications', auth, requirePermission('dealers'), (req, res) => {
    const users = getCollection('users');
    const status = pickString(req.query.status).trim();
    const pathTypes = pickString(req.query.path_type).split(',').map((item) => item.trim()).filter(Boolean);
    let rows = sortByUpdatedDesc(getUpgradeApplicationsSnapshot(users)).map((item) => buildUpgradeApplicationRecord(item, users));
    if (status) rows = rows.filter((item) => item.status === status);
    if (pathTypes.length) rows = rows.filter((item) => pathTypes.includes(item.path_type));
    ok(res, paginate(rows, req));
});

app.put('/admin/api/upgrade-applications/:id/review', auth, requirePermission('dealers'), (req, res) => {
    const action = pickString(req.body?.action).trim();
    if (!['approve', 'reject'].includes(action)) return fail(res, '请提供有效操作');
    const status = action === 'approve' ? 'approved' : 'rejected';
    const rows = getCollection('upgrade_applications');
    const ensureSeeded = rows.length ? rows : getUpgradeApplicationsSnapshot(getCollection('users'));
    if (!rows.length) saveCollection('upgrade_applications', ensureSeeded);
    const updated = patchCollectionRow('upgrade_applications', req.params.id, (row) => ({
        ...row,
        status,
        remark: pickString(req.body?.remark),
        reviewed_at: nowIso(),
        updatedAt: nowIso()
    }));
    if (!updated) return fail(res, '申请不存在', 404);
    if (status === 'approved' && updated.user_id) {
        const users = getCollection('users');
        const existingUser = findByLookup(users, updated.user_id);
        const oldLevel = toNumber(existingUser && (existingUser.role_level ?? existingUser.distributor_level), 0);
        const newLevel = updated.path_type === 'n_upgrade' ? 7 : Math.max(6, toNumber(oldLevel, 0));
        patchCollectionRow('users', updated.user_id, (row) => ({
            ...row,
            role_level: newLevel,
            role_upgraded_at: newLevel > oldLevel ? nowIso() : (row.role_upgraded_at || nowIso()),
            updated_at: nowIso()
        }));
        const patchedUser = findByLookup(getCollection('users'), updated.user_id);
        if (patchedUser && patchedUser.openid && newLevel > oldLevel && newLevel >= 3) {
            recordAdminFundPoolEntry(patchedUser.openid, newLevel, oldLevel).catch(() => {});
        }
    }
    createAuditLog(req.admin, `upgrade-application.${action}`, 'upgrade_applications', { application_id: primaryId(updated) });
    ok(res, updated);
});

app.get('/admin/api/withdrawals', auth, requirePermission('withdrawals'), (req, res) => {
    return (async () => {
    const readMeta = await freshReadMeta(req, STRONG_CONSISTENCY_COLLECTIONS.withdrawals, true);
    const users = getCollection('users');
    let rows = sortByUpdatedDesc(ensureWithdrawalNumericIds()).map((item) => buildWithdrawalRecord(item, users));
    const keyword = pickString(req.query.keyword).trim().toLowerCase();
    const status = pickString(req.query.status).trim();
    if (keyword) {
        rows = rows.filter((item) => [
            item.user?.nickname,
            item.user?.phone,
            item.user?.member_no,
            item.user?.invite_code,
            item.user_id,
            item.id,
            item.withdraw_account?.name,
            item.withdraw_account?.account,
            item.withdraw_account?.account_no
        ].filter(Boolean).join(' ').toLowerCase().includes(keyword));
    }
    if (status) rows = rows.filter((item) => item.status === status);
    okStrongRead(res, paginate(rows, req), readMeta.freshness);
    })();
});

app.put('/admin/api/withdrawals/:id/approve', auth, requirePermission('withdrawals'), async (req, res) => {
    await ensureFreshCollections(['withdrawals']);
    const current = findByLookup(ensureWithdrawalNumericIds(), req.params.id);
    if (!current) return fail(res, '提现记录不存在', 404);
    if (pickString(current.status) !== 'pending') return fail(res, '当前状态不可审核通过', 400);
    const patch = {
        status: 'approved',
        approved_at: nowIso(),
        remark: pickString(req.body?.remark || current.remark),
        updated_at: nowIso()
    };
    const writeOk = await directPatchDocument('withdrawals', String(current._id || current.id), patch);
    if (!writeOk && dataStore._internals?.db) return fail(res, '提现状态更新失败，请稍后重试', 500);
    const updated = patchCollectionRow('withdrawals', req.params.id, (row) => ({ ...row, ...patch }));
    createAuditLog(req.admin, 'withdrawal.approve', 'withdrawals', { withdrawal_id: primaryId(updated || current), amount: toNumber(current.amount, 0) });
    const reloadMeta = await reloadCollectionsWithMeta(STRONG_CONSISTENCY_COLLECTIONS.withdrawals);
    const freshCurrent = findByLookup(ensureWithdrawalNumericIds(), req.params.id);
    okStrongWrite(res, freshCurrent || updated || { ...current, ...patch }, {
        persisted: true,
        reloaded_collections: reloadMeta.reloaded_collections,
        read_at: reloadMeta.read_at
    });
});

app.put('/admin/api/withdrawals/:id/reject', auth, requirePermission('withdrawals'), async (req, res) => {
    await ensureFreshCollections(['withdrawals', 'users']);
    const current = findByLookup(ensureWithdrawalNumericIds(), req.params.id);
    if (!current) return fail(res, '提现记录不存在', 404);
    if (['completed', 'rejected', 'failed', 'cancelled'].includes(pickString(current.status))) {
        return fail(res, '当前状态不可驳回', 400);
    }
    const reasonCheck = requireManualAdjustmentReason(req.body?.reason, '拒绝原因');
    if (!reasonCheck.ok) return fail(res, reasonCheck.message);
    const withdrawalPatch = {
        ...current,
        status: 'rejected',
        reject_reason: reasonCheck.reason,
        remark: reasonCheck.reason,
        refunded_at: nowIso(),
        updated_at: nowIso()
    };
    const writeOk = await directPatchDocument('withdrawals', String(current._id || current.id), withdrawalPatch);
    if (!writeOk && dataStore._internals?.db) return fail(res, '提现状态更新失败，请稍后重试', 500);
    const updated = patchCollectionRow('withdrawals', req.params.id, (row) => ({ ...row, ...withdrawalPatch })) || withdrawalPatch;

    const refundAmount = toNumber(current.amount, 0);
    const refundOpenid = current.openid || '';
    if (refundAmount > 0) {
        const user = findUserByAnyId(getCollection('users'), current.user_id || current.openid);
        if (!user) return fail(res, '提现用户不存在，无法回退余额', 400);
        const userDocId = pickString(user._id || user.id);
        const currentBalance = toNumber(user.commission_balance ?? user.balance, 0);
        const currentWithdrawn = toNumber(user.total_withdrawn, 0);
        const userPatch = {
            balance: roundMoney(currentBalance + refundAmount),
            commission_balance: roundMoney(currentBalance + refundAmount),
            total_withdrawn: Math.max(0, roundMoney(currentWithdrawn - refundAmount)),
            updated_at: nowIso()
        };
        if (dataStore._internals?.db) {
            if (!userDocId) return fail(res, '提现用户文档不存在，无法回退余额', 500);
            const userWriteOk = await directPatchDocument('users', userDocId, userPatch);
            if (!userWriteOk) return fail(res, '提现余额回退失败，请稍后重试', 500);
        } else {
            patchCollectionRow('users', current.user_id || current.openid, (row) => ({ ...row, ...userPatch }));
        }
        if (refundOpenid) {
            try {
                await appendWalletLogEntry({
                    openid: refundOpenid,
                    type: 'withdraw_reject_refund',
                    amount: refundAmount,
                    withdraw_id: primaryId(current),
                    description: `提现驳回退回 ${refundAmount} 元`,
                    remark: reasonCheck.reason
                });
            } catch (error) {
                const rollbackPatch = {
                    balance: currentBalance,
                    commission_balance: currentBalance,
                    total_withdrawn: currentWithdrawn,
                    updated_at: nowIso()
                };
                if (dataStore._internals?.db && userDocId) {
                    await directPatchDocument('users', userDocId, rollbackPatch);
                } else {
                    patchCollectionRow('users', current.user_id || current.openid, (row) => ({ ...row, ...rollbackPatch }));
                }
                return fail(res, `提现驳回回款流水写入失败：${error.message || '未知错误'}`, 500);
            }
        }
    }
    createAuditLog(req.admin, 'withdrawal.reject', 'withdrawals', {
        withdrawal_id: primaryId(current),
        amount: refundAmount,
        reason: reasonCheck.reason
    });
    const reloadMeta = await reloadCollectionsWithMeta(STRONG_CONSISTENCY_COLLECTIONS.withdrawals);
    const freshCurrent = findByLookup(ensureWithdrawalNumericIds(), req.params.id);
    okStrongWrite(res, freshCurrent || updated, {
        persisted: true,
        reloaded_collections: reloadMeta.reloaded_collections,
        read_at: reloadMeta.read_at
    });
});

app.put('/admin/api/withdrawals/:id/complete', auth, requirePermission('withdrawals'), async (req, res) => {
    await ensureFreshCollections(['withdrawals']);
    const current = findByLookup(ensureWithdrawalNumericIds(), req.params.id);
    if (!current) return fail(res, '提现记录不存在', 404);
    if (pickString(current.status) !== 'approved') return fail(res, '当前状态不可确认打款', 400);
    const reasonCheck = requireManualAdjustmentReason(req.body?.remark, '打款备注');
    if (!reasonCheck.ok) return fail(res, reasonCheck.message);
    const patch = {
        status: 'completed',
        completed_at: nowIso(),
        remark: reasonCheck.reason,
        updated_at: nowIso()
    };
    const writeOk = await directPatchDocument('withdrawals', String(current._id || current.id), patch);
    if (!writeOk && dataStore._internals?.db) return fail(res, '提现完成状态更新失败，请稍后重试', 500);
    const updated = patchCollectionRow('withdrawals', req.params.id, (row) => ({ ...row, ...patch }));
    createAuditLog(req.admin, 'withdrawal.complete', 'withdrawals', {
        withdrawal_id: primaryId(updated || current),
        amount: toNumber(current.amount, 0),
        remark: reasonCheck.reason
    });
    const reloadMeta = await reloadCollectionsWithMeta(STRONG_CONSISTENCY_COLLECTIONS.withdrawals);
    const freshCurrent = findByLookup(ensureWithdrawalNumericIds(), req.params.id);
    okStrongWrite(res, freshCurrent || updated || { ...current, ...patch }, {
        persisted: true,
        reloaded_collections: reloadMeta.reloaded_collections,
        read_at: reloadMeta.read_at
    });
});

app.get('/admin/api/refunds', auth, requirePermission('refunds'), async (req, res) => {
    const readMeta = await freshReadMeta(req, STRONG_CONSISTENCY_COLLECTIONS.refunds, true);
    const users = getCollection('users');
    const orders = getCollection('orders');
    const products = getCollection('products');
    const skus = getCollection('skus');
    let rows = sortByUpdatedDesc(getCollection('refunds')).map((item) => buildRefundRecord(item, users, orders, products, skus));
    const keyword = pickString(req.query.keyword).trim().toLowerCase();
    const status = pickString(req.query.status).trim();
    if (keyword) {
        rows = rows.filter((item) => [
            item.order?.order_no,
            item.user?.nickname,
            item.user?.phone,
            item.user?.member_no,
            item.user_id,
            item.order_item?.product?.name,
            item.reason,
            item.id
        ].filter(Boolean).join(' ').toLowerCase().includes(keyword));
    }
    if (status) rows = rows.filter((item) => item.status === status);
    okStrongRead(res, paginate(rows, req), readMeta.freshness);
});

app.get('/admin/api/refunds/:id', auth, requirePermission('refunds'), async (req, res) => {
    const readMeta = await freshReadMeta(req, STRONG_CONSISTENCY_COLLECTIONS.refunds, true);
    const users = getCollection('users');
    const orders = getCollection('orders');
    const products = getCollection('products');
    const skus = getCollection('skus');
    const row = findByLookup(getCollection('refunds'), req.params.id);
    if (!row) return fail(res, '退款记录不存在', 404);
    okStrongRead(res, buildRefundRecord(row, users, orders, products, skus), readMeta.freshness);
});

app.put('/admin/api/refunds/:id/approve', auth, requirePermission('refunds'), async (req, res) => {
    if (rejectUnknownBodyFields(res, req.body, ['remark'], '退款审核参数不合法')) return;
    const remarkCheck = req.body?.remark == null
        ? { ok: true, value: '' }
        : requireNonEmptyStringField(req.body?.remark, 'remark', '审核备注', { maxLength: 200, required: false });
    if (!remarkCheck.ok) return failWithFieldErrors(res, [remarkCheck.error], '退款审核参数不合法');
    // 1. 重新从 CloudBase 加载退款集合，确保缓存里有这条记录
    await ensureFreshCollections(['refunds', 'orders', 'users', 'products', 'skus']);

    // 2. 校验记录存在
    const refund = findByLookup(getCollection('refunds'), req.params.id);
    if (!refund) return fail(res, '退款记录不存在', 404);
    if (refund.status !== 'pending') {
        return fail(res, refund.status === 'approved' ? '已经审核通过' : `当前状态不允许审核: ${refund.status}`, 400);
    }

    const updateData = {
        status: 'approved',
        approved_at: nowIso(),
        remark: remarkCheck.value || pickString(refund.remark)
    };

    // 3. 精确直写到 CloudBase（不走全量替换，不会超时）
    const writeOk = await directPatchDocument('refunds', String(refund._id), updateData);
    if (!writeOk) {
        return fail(res, '状态更新失败，CloudBase 写入错误，请稍后重试', 500);
    }

    // 4. filesystem 模式下补充走 patchCollectionRow
    if (!dataStore._internals?.db) {
        patchCollectionRow('refunds', req.params.id, (row) => ({ ...row, ...updateData }));
        await Promise.resolve(dataStore.flush?.());
    }

    // 5. 重新加载并返回最新格式化记录
    const reloadMeta = await reloadCollectionsWithMeta(STRONG_CONSISTENCY_COLLECTIONS.refunds);
    const users = getCollection('users');
    const orders = getCollection('orders');
    const products = getCollection('products');
    const skus = getCollection('skus');
    const freshRefund = findByLookup(getCollection('refunds'), req.params.id);
    createAuditLog(req.admin, 'refund.approve', 'refunds', { refund_id: req.params.id });
    okStrongWrite(res, buildRefundRecord(freshRefund || { ...refund, ...updateData }, users, orders, products, skus), {
        persisted: true,
        reloaded_collections: reloadMeta.reloaded_collections,
        read_at: reloadMeta.read_at
    });
});

app.put('/admin/api/refunds/:id/reject', auth, requirePermission('refunds'), async (req, res) => {
    if (rejectUnknownBodyFields(res, req.body, ['reason'], '退款拒绝参数不合法')) return;
    const reasonField = requireNonEmptyStringField(req.body?.reason, 'reason', '拒绝原因', { maxLength: 200 });
    if (!reasonField.ok) return failWithFieldErrors(res, [reasonField.error], '退款拒绝参数不合法');
    await ensureFreshCollections(['refunds', 'orders', 'users']);
    const rejectedRefund = findByLookup(getCollection('refunds'), req.params.id);
    if (!rejectedRefund) return fail(res, '退款记录不存在', 404);
    if (!['pending', 'approved'].includes(pickString(rejectedRefund.status))) {
        return fail(res, `当前状态不允许拒绝: ${rejectedRefund.status}`, 400);
    }
    const rejectData = { status: 'rejected', reject_reason: reasonField.value };
    const writeOk = await directPatchDocument('refunds', String(rejectedRefund._id), rejectData);
    if (!writeOk) return fail(res, '状态更新失败，请稍后重试', 500);
    if (!dataStore._internals?.db) {
        patchCollectionRow('refunds', req.params.id, (row) => ({ ...row, ...rejectData }));
    }
    const orderId = rejectedRefund?.order_id || rejectedRefund?.order_no;
    if (orderId) {
        restoreFrozenCommissionsForOrder(orderId);
        patchCollectionRow('orders', orderId, (order) => ({
            ...order,
            status: order.status === 'refunding' ? (order.prev_status || (order.confirmed_at || order.auto_confirmed_at ? 'completed' : (order.shipped_at ? 'shipped' : (order.paid_at ? 'paid' : 'pending_payment')))) : order.status,
            updated_at: nowIso()
        }));
    }
    createAuditLog(req.admin, 'refund.reject', 'refunds', { refund_id: req.params.id, order_id: orderId });
    await Promise.resolve(dataStore.flush?.());
    const reloadMeta = await reloadCollectionsWithMeta(STRONG_CONSISTENCY_COLLECTIONS.refunds);
    const freshReject = findByLookup(getCollection('refunds'), req.params.id);
    const rUsers = getCollection('users');
    const rOrders = getCollection('orders');
    const rProducts = getCollection('products');
    const rSkus = getCollection('skus');
    okStrongWrite(res, buildRefundRecord(freshReject || { ...rejectedRefund, ...rejectData }, rUsers, rOrders, rProducts, rSkus), {
        persisted: true,
        reloaded_collections: reloadMeta.reloaded_collections,
        read_at: reloadMeta.read_at
    });
});

app.put('/admin/api/refunds/:id/complete', auth, requirePermission('refunds'), async (req, res) => {
    if (rejectUnknownBodyFields(res, req.body, ['return_company', 'return_tracking_no'], '退款执行参数不合法')) return;
    const returnCompanyCheck = req.body?.return_company == null
        ? { ok: true, value: '' }
        : requireNonEmptyStringField(req.body?.return_company, 'return_company', '退货快递公司', { maxLength: 60, required: false });
    const returnTrackingCheck = req.body?.return_tracking_no == null
        ? { ok: true, value: '' }
        : requireNonEmptyStringField(req.body?.return_tracking_no, 'return_tracking_no', '退货物流单号', { maxLength: 80, required: false });
    const completeFieldErrors = [returnCompanyCheck, returnTrackingCheck].filter((item) => !item.ok).map((item) => item.error);
    if (completeFieldErrors.length) return failWithFieldErrors(res, completeFieldErrors, '退款执行参数不合法');
    await ensureFreshCollections(['refunds', 'orders', 'users', 'wallet_accounts']);
    const refunds = getCollection('refunds');
    const refund = findByLookup(refunds, req.params.id);
    if (!refund) return fail(res, '退款记录不存在', 404);
    if (!['approved', 'processing'].includes(pickString(refund.status))) {
        return fail(res, refund.status === 'completed' ? '退款已完成' : '当前状态不允许退款', 400);
    }

    const users = getCollection('users');
    const orders = getCollection('orders');
    const orderId = refund.order_id || refund.order_no;
    const order = findByLookup(orders, orderId, (row) => [row.order_no]);
    if (!order) return fail(res, '关联订单不存在', 400);

    const paymentMethod = normalizePaymentMethodCode(order.payment_method || order.pay_type || order.pay_channel || order.payment_channel || 'wechat');
    if (!isSupportedRefundPaymentMethod(paymentMethod)) {
        return fail(res, '订单缺少有效支付方式，不能继续退款。请先修复订单支付信息后再处理退款', 400);
    }
    const refundRoute = getRefundRouteMeta(paymentMethod);
    const refundAmount = toNumber(refund.amount, 0);
    const orderProgress = getOrderRefundProgress(order);
    const remainingCash = Math.max(0, roundMoney(orderProgress.payAmount - orderProgress.refundedCash));
    if (refundAmount <= 0 || orderProgress.payAmount <= 0) return fail(res, '退款金额不合法', 400);
    if (refundAmount > remainingCash) {
        return fail(res, `退款金额(${refundAmount})不能超过剩余可退现金(${remainingCash})`, 400);
    }

    // 先持久化 processing 状态，防止并发重复提交
    const processingData = {
        status: 'processing',
        processing_at: refund.processing_at || nowIso(),
        payment_method: paymentMethod,
        refund_channel: refundRoute.refund_channel,
        refund_target_text: refundRoute.refund_target_text,
        return_company: returnCompanyCheck.value || pickString(refund.return_company),
        return_tracking_no: returnTrackingCheck.value || pickString(refund.return_tracking_no)
    };
    await directPatchDocument('refunds', String(refund._id), processingData);
    patchCollectionRow('refunds', req.params.id, (row) => ({ ...row, ...processingData, updated_at: nowIso() }));

    const orderRefundingPatch = {
        status: 'refunding',
        prev_status: pickString(order.status).toLowerCase() === 'refunded'
            ? inferRefundResumeOrderStatus(order)
            : (pickString(order.prev_status) || (pickString(order.status).toLowerCase() === 'refunding' ? inferRefundResumeOrderStatus(order) : pickString(order.status || inferRefundResumeOrderStatus(order))))
    };
    await directPatchDocument('orders', String(order._id), orderRefundingPatch);
    patchCollectionRow('orders', orderId, (row) => ({ ...row, ...orderRefundingPatch, updated_at: nowIso() }));

    let rollbackInternalFunds = null;
    try {
        if (paymentMethod === 'goods_fund') {
            // 货款支付订单：退回 agent_wallet_balance（内部余额），不发起微信退款
            const buyerOpenid = pickString(order.openid || order.buyer_id || refund.openid || refund.user_id);
            if (!buyerOpenid) throw new Error('货款退款：找不到买家 openid');
            const buyerUser = findUserByAnyId(users, buyerOpenid);
            if (!buyerUser) throw new Error('货款退款：找不到买家用户记录');
            const previousGoodsFund = roundMoney(toNumber(buyerUser.agent_wallet_balance != null ? buyerUser.agent_wallet_balance : buyerUser.wallet_balance, 0));
            const nextGoodsFund = roundMoney(previousGoodsFund + refundAmount);
            const walletAccountUserIds = getWalletAccountUserIds(buyerUser);

            const db = dataStore._internals && dataStore._internals.db;
            if (db) {
                const _ = db.command;
                await db.collection('users').where({ openid: buyerOpenid }).update({
                    data: {
                        agent_wallet_balance: _.inc(refundAmount),
                        updated_at: new Date().toISOString()
                    }
                });
                let walletAccount = null;
                for (const candidate of walletAccountUserIds) {
                    const accountRes = await db.collection('wallet_accounts')
                        .where({ user_id: candidate })
                        .limit(1)
                        .get()
                        .catch(() => ({ data: [] }));
                    if (accountRes.data && accountRes.data[0]) {
                        walletAccount = accountRes.data[0];
                        break;
                    }
                }
                const accountId = walletAccount?._id || walletAccount?.id || buildWalletAccountDocId(buyerUser);
                if (!accountId) throw new Error('货款退款：无法确定钱包账户标识');
                if (walletAccount) {
                    await db.collection('wallet_accounts').doc(String(accountId)).update({
                        data: {
                            balance: nextGoodsFund,
                            updated_at: new Date().toISOString()
                        }
                    });
                } else {
                    await db.collection('wallet_accounts').doc(String(accountId)).set({
                        data: {
                            user_id: walletAccountUserIds[0],
                            openid: buyerOpenid,
                            balance: nextGoodsFund,
                            account_type: 'goods_fund',
                            status: 'active',
                            created_at: new Date().toISOString(),
                            updated_at: new Date().toISOString()
                        }
                    });
                }
                rollbackInternalFunds = async () => {
                    await db.collection('users').where({ openid: buyerOpenid }).update({
                        data: {
                            agent_wallet_balance: previousGoodsFund,
                            updated_at: new Date().toISOString()
                        }
                    }).catch(() => {});
                    await db.collection('wallet_accounts').doc(String(accountId)).set({
                        data: {
                            user_id: walletAccountUserIds[0],
                            openid: buyerOpenid,
                            balance: previousGoodsFund,
                            account_type: 'goods_fund',
                            status: 'active',
                            created_at: pickString(walletAccount?.created_at || new Date().toISOString()),
                            updated_at: new Date().toISOString()
                        }
                    }).catch(() => {});
                };
                await appendWalletLogEntry({
                    openid: buyerOpenid,
                    user_id: walletAccountUserIds[0],
                    account_id: String(accountId),
                    change_type: 'refund',
                    amount: refundAmount,
                    balance_before: previousGoodsFund,
                    balance_after: nextGoodsFund,
                    ref_type: 'order_refund',
                    ref_id: pickString(refund._id || refund.id),
                    remark: `订单退款 ${pickString(order.order_no)}`,
                    created_at: new Date().toISOString()
                });
                // 写货款流水日志
                await appendGoodsFundLogEntry({
                    openid: buyerOpenid,
                    type: 'refund',
                    amount: refundAmount,
                    order_id: String(order._id),
                    order_no: pickString(order.order_no),
                    remark: `订单退款 ${pickString(order.order_no)}`,
                    created_at: new Date().toISOString()
                });
            } else {
                // Filesystem/开发模式：更新内存
                const userIdx = users.findIndex((u) => u.openid === buyerOpenid);
                if (userIdx !== -1) {
                    users[userIdx] = {
                        ...users[userIdx],
                        agent_wallet_balance: nextGoodsFund,
                        updated_at: nowIso()
                    };
                    saveCollection('users', users);
                    const walletAccounts = getCollection('wallet_accounts');
                    const existingWalletAccount = findWalletAccountByUser(walletAccounts, buyerUser);
                    const accountId = primaryId(existingWalletAccount) || buildWalletAccountDocId(buyerUser);
                    const nextWalletAccount = existingWalletAccount
                        ? {
                            ...existingWalletAccount,
                            balance: nextGoodsFund,
                            updated_at: nowIso()
                        }
                        : {
                            _id: accountId,
                            id: accountId,
                            user_id: walletAccountUserIds[0],
                            openid: buyerOpenid,
                            balance: nextGoodsFund,
                            account_type: 'goods_fund',
                            status: 'active',
                            created_at: nowIso(),
                            updated_at: nowIso()
                        };
                    if (existingWalletAccount) {
                        const walletIndex = walletAccounts.findIndex((item) => primaryId(item) === primaryId(existingWalletAccount));
                        if (walletIndex !== -1) walletAccounts[walletIndex] = nextWalletAccount;
                    } else {
                        walletAccounts.push(nextWalletAccount);
                    }
                    saveCollection('wallet_accounts', walletAccounts);
                    rollbackInternalFunds = async () => {
                        const rollbackIdx = users.findIndex((u) => u.openid === buyerOpenid);
                        if (rollbackIdx !== -1) {
                            users[rollbackIdx] = {
                                ...users[rollbackIdx],
                                agent_wallet_balance: previousGoodsFund,
                                updated_at: nowIso()
                            };
                            saveCollection('users', users);
                        }
                        const rollbackWalletAccounts = getCollection('wallet_accounts');
                        const rollbackAccount = findWalletAccountByUser(rollbackWalletAccounts, buyerUser);
                        if (rollbackAccount) {
                            const rollbackWalletIndex = rollbackWalletAccounts.findIndex((item) => primaryId(item) === primaryId(rollbackAccount));
                            if (rollbackWalletIndex !== -1) {
                                rollbackWalletAccounts[rollbackWalletIndex] = {
                                    ...rollbackWalletAccounts[rollbackWalletIndex],
                                    balance: previousGoodsFund,
                                    updated_at: nowIso()
                                };
                                saveCollection('wallet_accounts', rollbackWalletAccounts);
                            }
                        }
                    };
                    await appendWalletLogEntry({
                        openid: buyerOpenid,
                        user_id: walletAccountUserIds[0],
                        account_id: String(accountId),
                        change_type: 'refund',
                        amount: refundAmount,
                        balance_before: previousGoodsFund,
                        balance_after: nextGoodsFund,
                        ref_type: 'order_refund',
                        ref_id: pickString(refund._id || refund.id),
                        remark: `订单退款 ${pickString(order.order_no)}`,
                        created_at: nowIso()
                    });
                }
            }

            cancelCommissionsForOrder(orderId, '货款退款完成，佣金作废');
            restoreOrderStockForRefund(orderId, refund);
            const settlement = await refundOrderExtras(orderId, refund);

            const completedData = { status: 'completed', completed_at: nowIso() };
            const refundWriteOk = await directPatchDocument('refunds', String(refund._id), completedData);
            if (!refundWriteOk && dataStore._internals?.db) throw new Error('退款记录更新失败');
            patchCollectionRow('refunds', req.params.id, (row) => ({ ...row, ...completedData }));

            const orderWriteOk = await directPatchDocument('orders', String(order._id), settlement.patch);
            if (!orderWriteOk && dataStore._internals?.db) throw new Error('订单状态更新失败');
            patchCollectionRow('orders', orderId, (row) => ({ ...row, ...settlement.patch }));

            createAuditLog(req.admin, 'refund.complete', 'refunds', { refund_id: req.params.id, order_id: orderId, payment_method: paymentMethod });
            const reloadMeta = await reloadCollectionsWithMeta(STRONG_CONSISTENCY_COLLECTIONS.refunds);
            const gfFresh = findByLookup(getCollection('refunds'), req.params.id);
            const gfUsers = getCollection('users');
            const gfOrders = getCollection('orders');
            okStrongWrite(res, buildRefundRecord(gfFresh || { ...refund, ...completedData }, gfUsers, gfOrders, getCollection('products'), getCollection('skus')), {
                persisted: true,
                reloaded_collections: reloadMeta.reloaded_collections,
                read_at: reloadMeta.read_at
            });
        } else if (['wallet', 'balance', 'credit', 'debt'].includes(paymentMethod)) {
            const walletOwner = findUserByAnyId(users, order.openid || order.buyer_id || refund.openid || refund.user_id);
            const walletOwnerDocId = pickString(walletOwner?._id || walletOwner?.id);
            const walletOwnerOpenid = pickString(walletOwner?.openid || order.openid || refund.openid);
            const previousBalance = toNumber(walletOwner?.balance ?? walletOwner?.commission_balance, 0);
            const previousCommissionBalance = toNumber(walletOwner?.commission_balance ?? walletOwner?.balance, 0);
            const previousTotalEarned = toNumber(walletOwner?.total_earned, 0);
            const previousDebtAmount = toNumber(walletOwner?.debt_amount, 0);
            const previousDebtReason = pickString(walletOwner?.debt_reason);
            const change = applyUserMoneyChange(users, order.openid || order.buyer_id || refund.openid || refund.user_id, refundAmount, {
                reason: `订单退款 ${pickString(order.order_no)}`
            });
            if (!change) throw new Error('退款用户不存在，无法退回余额');
            if (!walletOwnerOpenid) throw new Error('退款用户 openid 缺失，无法写余额流水');

            if (dataStore._internals?.db) {
                if (!walletOwnerDocId) throw new Error('退款用户文档不存在，无法持久化余额变更');
                const userWriteOk = await directPatchDocument('users', walletOwnerDocId, {
                    balance: toNumber(change.user.balance, 0),
                    commission_balance: toNumber(change.user.commission_balance, 0),
                    total_earned: toNumber(change.user.total_earned, 0),
                    debt_amount: toNumber(change.user.debt_amount, 0),
                    debt_reason: pickString(change.user.debt_reason)
                });
                if (!userWriteOk) throw new Error('退款用户余额更新失败');
                rollbackInternalFunds = async () => {
                    await directPatchDocument('users', walletOwnerDocId, {
                        balance: previousBalance,
                        commission_balance: previousCommissionBalance,
                        total_earned: previousTotalEarned,
                        debt_amount: previousDebtAmount,
                        debt_reason: previousDebtReason
                    });
                };
            } else {
                saveCollection('users', users);
                rollbackInternalFunds = async () => {
                    const rollbackUser = findUserByAnyId(users, walletOwnerOpenid || walletOwnerDocId || order.openid || refund.openid);
                    if (rollbackUser) {
                        const rollbackKey = primaryId(rollbackUser) || walletOwnerOpenid;
                        patchCollectionRow('users', rollbackKey, (row) => ({
                            ...row,
                            balance: previousBalance,
                            commission_balance: previousCommissionBalance,
                            total_earned: previousTotalEarned,
                            debt_amount: previousDebtAmount,
                            debt_reason: previousDebtReason,
                            updated_at: nowIso()
                        }));
                    }
                };
            }

            await appendWalletLogEntry({
                openid: walletOwnerOpenid,
                type: 'refund',
                amount: refundAmount,
                refund_id: pickString(refund._id || refund.id),
                refund_no: pickString(refund.refund_no),
                order_id: pickString(order._id || order.id || orderId),
                order_no: pickString(order.order_no),
                description: `订单退款 ${pickString(order.order_no)}`
            });

            cancelCommissionsForOrder(orderId, '退款完成，佣金作废');
            restoreOrderStockForRefund(orderId, refund);
            const settlement = await refundOrderExtras(orderId, refund);

            // 余额退款是内部操作，补偿完成后再落终态
            const completedData = { status: 'completed', completed_at: nowIso() };
            const refundWriteOk = await directPatchDocument('refunds', String(refund._id), completedData);
            if (!refundWriteOk && dataStore._internals?.db) {
                throw new Error('退款记录更新失败');
            }
            patchCollectionRow('refunds', req.params.id, (row) => ({ ...row, ...completedData }));

            const orderWriteOk = await directPatchDocument('orders', String(order._id), settlement.patch);
            if (!orderWriteOk && dataStore._internals?.db) {
                throw new Error('订单状态更新失败');
            }
            patchCollectionRow('orders', orderId, (row) => ({ ...row, ...settlement.patch }));

            createAuditLog(req.admin, 'refund.complete', 'refunds', { refund_id: req.params.id, order_id: orderId, payment_method: paymentMethod });
            const reloadMeta = await reloadCollectionsWithMeta(STRONG_CONSISTENCY_COLLECTIONS.refunds);
            const cFresh = findByLookup(getCollection('refunds'), req.params.id);
            const cUsers = getCollection('users');
            const cOrders = getCollection('orders');
            const cProducts = getCollection('products');
            const cSkus = getCollection('skus');
            okStrongWrite(res, buildRefundRecord(cFresh || { ...refund, ...completedData }, cUsers, cOrders, cProducts, cSkus), {
                persisted: true,
                reloaded_collections: reloadMeta.reloaded_collections,
                read_at: reloadMeta.read_at
            });
        } else {
            // 微信支付退款：先锁定 refund_no，再调用微信 API，防止重复提交产生双重退款
            // 如果已有 refund_no（之前调用过），复用；否则生成新的
            const refundNo = pickString(refund.refund_no) || `RF-${pickString(order.order_no)}-${Date.now()}`;

            // 将 refund_no 先写入 CloudBase，后续重试时可复用同一单号（微信幂等）
            await directPatchDocument('refunds', String(refund._id), { refund_no: refundNo });
            patchCollectionRow('refunds', req.params.id, (row) => ({ ...row, refund_no: refundNo }));

            const totalFee = Math.round(getOrderAmount(order) * 100);
            const wxResult = await createWechatRefund({
                orderNo: pickString(order.order_no),
                refundNo,
                totalFee,
                refundFee: Math.round(refundAmount * 100),
                reason: pickString(refund.reason, '管理员退款')
            });
            const wxStatus = pickString(wxResult.status || 'PROCESSING').toUpperCase();
            const wxRefundId = pickString(wxResult.refund_id || refund.wx_refund_id);

            if (wxStatus === 'SUCCESS') {
                cancelCommissionsForOrder(orderId, '退款完成，佣金作废');
                restoreOrderStockForRefund(orderId, refund);
                const settlement = await refundOrderExtras(orderId, refund);

                // 极少数情况：微信同步返回成功，补偿完成后再落终态
                const completedData = { status: 'completed', completed_at: nowIso(), wx_refund_id: wxRefundId, wx_status: wxStatus };
                await directPatchDocument('refunds', String(refund._id), completedData);
                patchCollectionRow('refunds', req.params.id, (row) => ({ ...row, ...completedData }));
                await directPatchDocument('orders', String(order._id), settlement.patch);
                patchCollectionRow('orders', orderId, (row) => ({ ...row, ...settlement.patch }));
                createAuditLog(req.admin, 'refund.complete', 'refunds', { refund_id: req.params.id, order_id: orderId, payment_method: paymentMethod, wx_status: wxStatus });
                const reloadMeta = await reloadCollectionsWithMeta(STRONG_CONSISTENCY_COLLECTIONS.refunds);
                const freshComplete = findByLookup(getCollection('refunds'), req.params.id);
                okStrongWrite(res, buildRefundRecord(freshComplete || { ...refund, ...completedData }, getCollection('users'), getCollection('orders'), getCollection('products'), getCollection('skus')), {
                    persisted: true,
                    reloaded_collections: reloadMeta.reloaded_collections,
                    read_at: reloadMeta.read_at
                });
            } else {
                // 正常情况：微信返回 PROCESSING，等待异步回调确认
                const processingFinal = { status: 'processing', wx_refund_id: wxRefundId, wx_status: wxStatus };
                await directPatchDocument('refunds', String(refund._id), processingFinal);
                patchCollectionRow('refunds', req.params.id, (row) => ({ ...row, ...processingFinal }));

                createAuditLog(req.admin, 'refund.processing', 'refunds', { refund_id: req.params.id, order_id: orderId, payment_method: paymentMethod, wx_refund_id: wxRefundId, wx_status: wxStatus });
                const reloadMeta = await reloadCollectionsWithMeta(STRONG_CONSISTENCY_COLLECTIONS.refunds);
                const freshProcessing = findByLookup(getCollection('refunds'), req.params.id);
                okStrongWrite(res, {
                    ...(freshProcessing
                        ? buildRefundRecord(freshProcessing, getCollection('users'), getCollection('orders'), getCollection('products'), getCollection('skus'))
                        : { ...refund, ...processingFinal }),
                    note: '退款申请已提交微信，处理结果将通过回调通知更新'
                }, {
                    persisted: true,
                    reloaded_collections: reloadMeta.reloaded_collections,
                    read_at: reloadMeta.read_at
                });
            }
        }
    } catch (error) {
        if (rollbackInternalFunds) {
            await rollbackInternalFunds().catch(() => {});
        }
        // 出错时将状态回滚到 approved，保留错误信息
        const revertData = { status: 'approved', wx_error: pickString(error.message) };
        await directPatchDocument('refunds', String(refund._id), revertData);
        patchCollectionRow('refunds', req.params.id, (row) => ({ ...row, ...revertData, updated_at: nowIso() }));

        const prevOrderStatus = order.status === 'refunding'
            ? (order.prev_status || (order.confirmed_at || order.auto_confirmed_at ? 'completed' : (order.shipped_at ? 'shipped' : (order.paid_at ? 'paid' : 'pending_payment'))))
            : order.status;
        await directPatchDocument('orders', String(order._id), { status: prevOrderStatus });
        patchCollectionRow('orders', orderId, (row) => ({ ...row, status: prevOrderStatus, updated_at: nowIso() }));

        return fail(res, `退款失败：${error.message || '未知错误'}`, 500);
    }
});

app.put('/admin/api/refunds/:id/sync', auth, requirePermission('refunds'), async (req, res) => {
    if (rejectUnknownBodyFields(res, req.body, [], '退款状态同步参数不合法')) return;
    await ensureFreshCollections(['refunds', 'orders', 'users', 'products', 'skus']);
    const refund = findByLookup(getCollection('refunds'), req.params.id);
    if (!refund) return fail(res, '退款记录不存在', 404);

    const order = findByLookup(getCollection('orders'), refund.order_id || refund.order_no, (row) => [row.order_no]);
    const paymentMethod = normalizePaymentMethodCode(refund.payment_method || order?.payment_method || order?.pay_type || order?.pay_channel || order?.payment_channel || '');
    if (paymentMethod !== 'wechat') {
        return fail(res, '当前退款不是微信退款，无需同步状态', 400);
    }
    if (!pickString(refund.refund_no)) {
        return fail(res, '退款单缺少 refund_no，无法同步微信状态', 400);
    }

    try {
        const syncResult = await syncRefundStatusViaPayment(refund);
        await Promise.resolve(dataStore.flush?.());
        const reloadMeta = await reloadCollectionsWithMeta(STRONG_CONSISTENCY_COLLECTIONS.refunds);
        const freshRefund = findByLookup(getCollection('refunds'), req.params.id);
        const users = getCollection('users');
        const orders = getCollection('orders');
        const products = getCollection('products');
        const skus = getCollection('skus');
        okStrongWrite(res, {
            ...buildRefundRecord(freshRefund || refund, users, orders, products, skus),
            sync_result: syncResult
        }, {
            persisted: true,
            reloaded_collections: reloadMeta.reloaded_collections,
            read_at: reloadMeta.read_at
        });
    } catch (error) {
        return fail(res, error.message || '同步微信退款状态失败', 500);
    }
});

// 微信退款回调通知处理：当微信完成退款后，将退款记录更新为 completed 或 failed
app.post('/admin/api/refunds/wechat-notify', async (req, res) => {
    const verified = await verifyRefundNotifyRequest(req);
    if (!verified.ok) {
        return res.status(verified.status || 401).json({
            code: 'REJECTED',
            success: false,
            message: verified.message,
            request_id: req.requestId || '',
            timestamp: nowIso()
        });
    }
    try {
        const eventType = verified.eventType;
        if (!eventType.startsWith('REFUND.')) {
            return res.json({ code: 'SUCCESS', message: 'Ignored non-refund event' });
        }
        const refundData = verified.refundData || {};
        const outRefundNo = pickString(refundData.out_refund_no || verified.callbackData?.out_refund_no);
        const refundStatus = pickString(refundData.refund_status || '').toUpperCase();
        if (!outRefundNo) {
            return res.status(400).json({
                code: 'REJECTED',
                success: false,
                message: '微信退款回调缺少 out_refund_no',
                request_id: req.requestId || '',
                timestamp: nowIso()
            });
        }

        await ensureFreshCollections(['refunds', 'orders']);
        const refunds = getCollection('refunds');
        const refund = refunds.find((row) => pickString(row.refund_no) === outRefundNo);
        if (!refund) {
            console.warn(`[RefundNotify] 未找到退款记录 refund_no=${outRefundNo}`);
            return res.json({ code: 'SUCCESS', message: 'Refund not found' });
        }

        if (pickString(refund.status) === 'completed' || pickString(refund.status) === 'failed') {
            return res.json({ code: 'SUCCESS', message: 'Already in terminal state' });
        }

        const refundDocId = String(refund._id || primaryId(refund));
        const orderId = refund.order_id || refund.order_no;
        const orders = getCollection('orders');
        const order = orderId ? findByLookup(orders, orderId) : null;
        const orderDocId = order ? String(order._id) : null;

        if (refundStatus === 'SUCCESS') {
            const refundCompleteData = {
                status: 'completed',
                completed_at: nowIso(),
                wx_refund_id: pickString(refundData.refund_id || refund.wx_refund_id),
                wx_refund_status: refundStatus,
                wx_success_time: pickString(refundData.success_time || '')
            };
            await directPatchDocument('refunds', refundDocId, refundCompleteData);
            patchCollectionRow('refunds', primaryId(refund), (row) => ({ ...row, ...refundCompleteData, updated_at: nowIso() }));

            cancelCommissionsForOrder(orderId, '退款完成，佣金作废');
            restoreOrderStockForRefund(orderId, refund);
            const settlement = await refundOrderExtras(orderId, refund);

            if (orderDocId) {
                await directPatchDocument('orders', orderDocId, settlement.patch);
            }
            patchCollectionRow('orders', orderId, (row) => ({ ...row, ...settlement.patch }));
            console.log(`[RefundNotify] 退款成功处理完毕: ${outRefundNo}, order=${orderId}, serial=${verified.serial}, key_source=${verified.verify_key_source}`);
        } else if (['ABNORMAL', 'CLOSED'].includes(refundStatus)) {
            const refundFailData = {
                status: 'failed',
                wx_refund_id: pickString(refundData.refund_id || refund.wx_refund_id),
                wx_refund_status: refundStatus
            };
            await directPatchDocument('refunds', refundDocId, refundFailData);
            patchCollectionRow('refunds', primaryId(refund), (row) => ({ ...row, ...refundFailData, updated_at: nowIso() }));

            if (orderDocId && order) {
                const revertStatus = order.status === 'refunding'
                    ? (order.prev_status || (order.confirmed_at || order.auto_confirmed_at ? 'completed' : (order.shipped_at ? 'shipped' : (order.paid_at ? 'paid' : 'pending_payment'))))
                    : order.status;
                await directPatchDocument('orders', orderDocId, { status: revertStatus });
                patchCollectionRow('orders', orderId, (row) => ({
                    ...row,
                    status: row.status === 'refunding' ? revertStatus : row.status,
                    updated_at: nowIso()
                }));
            }
            console.warn(`[RefundNotify] 退款异常/关闭: ${outRefundNo}, status=${refundStatus}, serial=${verified.serial}`);
        } else {
            return res.json({ code: 'SUCCESS', message: `Ignored refund status: ${refundStatus || 'UNKNOWN'}` });
        }

        await Promise.resolve(dataStore.flush?.());
        res.json({ code: 'SUCCESS', message: 'OK' });
    } catch (err) {
        console.error('[RefundNotify] 处理退款回调失败:', err.message);
        res.status(500).json({
            code: 'REJECTED',
            success: false,
            message: err.message || '退款回调处理失败',
            request_id: req.requestId || '',
            timestamp: nowIso()
        });
    }
});

app.get('/admin/api/commissions', auth, requirePermission('commissions'), async (req, res) => {
    const readMeta = await freshReadMeta(req, STRONG_CONSISTENCY_COLLECTIONS.commissions, true);
    const users = getCollection('users');
    const orders = getCollection('orders');
    let rows = sortByUpdatedDesc(getCollection('commissions')).map((item) => buildCommissionRecord(item, users, orders));
    const status = pickString(req.query.status).trim();
    const type = pickString(req.query.type).trim().toLowerCase();
    const keyword = pickString(req.query.keyword).trim().toLowerCase();
    const userId = pickString(req.query.user_id).trim();
    if (status) rows = rows.filter((item) => item.status === status);
    if (type) rows = rows.filter((item) => pickString(item.type).trim().toLowerCase() === type);
    if (keyword) {
        rows = rows.filter((item) => [
            item.user?.nickname,
            item.user?.invite_code,
            item.user?.member_no,
            item.from_user?.nickname,
            item.from_user?.invite_code,
            item.from_user?.member_no,
            item.order?.order_no,
            item.order?.product_summary,
            item.id
        ].filter(Boolean).join(' ').toLowerCase().includes(keyword));
    }
    if (userId) rows = rows.filter((item) => rowMatchesLookup(item.user || item, userId, [item.user_id]));
    const pageResult = paginate(rows, req);
    okStrongRead(res, { ...pageResult, stats: commissionStats(rows) }, readMeta.freshness);
});

app.put('/admin/api/commissions/:id/approve', auth, requirePermission('commissions'), async (req, res) => {
    const rows = getCollection('commissions');
    const users = getCollection('users');
    const index = rows.findIndex((row) => rowMatchesLookup(row, req.params.id));
    if (index === -1) return fail(res, '佣金记录不存在', 404);
    const result = settleCommissionRow(rows[index], users);
    if (result.blocked) return fail(res, '当前佣金状态不允许审批入账');
    rows[index] = result.row;
    saveCollection('users', users);
    saveCollection('commissions', rows);
    createAuditLog(req.admin, 'commission.approve_settle', 'commissions', { commission_id: req.params.id });
    await Promise.resolve(dataStore.flush?.());
    const updated = rows[index];
    if (!updated) return fail(res, '佣金记录不存在', 404);
    const reloadMeta = await reloadCollectionsWithMeta(STRONG_CONSISTENCY_COLLECTIONS.commissions);
    const freshRows = getCollection('commissions');
    const freshUpdated = freshRows.find((row) => rowMatchesLookup(row, req.params.id)) || updated;
    okStrongWrite(res, freshUpdated, {
        persisted: true,
        reloaded_collections: reloadMeta.reloaded_collections,
        read_at: reloadMeta.read_at
    });
});

app.put('/admin/api/commissions/:id/reject', auth, requirePermission('commissions'), async (req, res) => {
    const rows = getCollection('commissions');
    const users = getCollection('users');
    const index = rows.findIndex((row) => rowMatchesLookup(row, req.params.id));
    if (index === -1) return fail(res, '佣金记录不存在', 404);
    if (pickString(rows[index].status) !== 'pending_approval') {
        return fail(res, '当前佣金状态不允许驳回');
    }
    rows[index] = cancelCommissionRow(rows[index], users, pickString(req.body?.reason || '管理员驳回')).row;
    saveCollection('users', users);
    saveCollection('commissions', rows);
    createAuditLog(req.admin, 'commission.reject_cancel', 'commissions', { commission_id: req.params.id });
    await Promise.resolve(dataStore.flush?.());
    const updated = rows[index];
    if (!updated) return fail(res, '佣金记录不存在', 404);
    const reloadMeta = await reloadCollectionsWithMeta(STRONG_CONSISTENCY_COLLECTIONS.commissions);
    const freshRows = getCollection('commissions');
    const freshUpdated = freshRows.find((row) => rowMatchesLookup(row, req.params.id)) || updated;
    okStrongWrite(res, freshUpdated, {
        persisted: true,
        reloaded_collections: reloadMeta.reloaded_collections,
        read_at: reloadMeta.read_at
    });
});

app.post('/admin/api/commissions/batch-approve', auth, requirePermission('commissions'), async (req, res) => {
    const ids = toArray(req.body?.commission_ids || req.body?.ids);
    if (!ids.length) return fail(res, '请选择要操作的佣金记录');
    const users = getCollection('users');
    let affected = 0;
    const blockedIds = [];
    const rows = getCollection('commissions').map((row) => {
        if (!ids.some((id) => rowMatchesLookup(row, id))) return row;
        const result = settleCommissionRow(row, users);
        if (result.blocked) blockedIds.push(primaryId(row));
        if (result.changed) affected += 1;
        return result.row;
    });
    saveCollection('users', users);
    saveCollection('commissions', rows);
    createAuditLog(req.admin, 'commission.batch_approve_settle', 'commissions', { affected, blocked_ids: blockedIds });
    await Promise.resolve(dataStore.flush?.());
    const reloadMeta = await reloadCollectionsWithMeta(STRONG_CONSISTENCY_COLLECTIONS.commissions);
    okStrongWrite(res, { success: true, affected, blocked_ids: blockedIds }, {
        persisted: true,
        reloaded_collections: reloadMeta.reloaded_collections,
        read_at: reloadMeta.read_at,
        fallbacks_used: blockedIds.length ? ['blocked_ids'] : []
    });
});

app.post('/admin/api/commissions/batch-reject', auth, requirePermission('commissions'), async (req, res) => {
    const ids = toArray(req.body?.commission_ids || req.body?.ids);
    if (!ids.length) return fail(res, '请选择要操作的佣金记录');
    const users = getCollection('users');
    let affected = 0;
    const blockedIds = [];
    const rows = getCollection('commissions').map((row) => {
        if (!ids.some((id) => rowMatchesLookup(row, id))) return row;
        if (pickString(row.status) !== 'pending_approval') {
            blockedIds.push(primaryId(row));
            return row;
        }
        const result = cancelCommissionRow(row, users, pickString(req.body?.reason || '管理员批量驳回'));
        if (result.changed) affected += 1;
        return result.row;
    });
    saveCollection('users', users);
    saveCollection('commissions', rows);
    createAuditLog(req.admin, 'commission.batch_reject_cancel', 'commissions', { affected, blocked_ids: blockedIds });
    await Promise.resolve(dataStore.flush?.());
    const reloadMeta = await reloadCollectionsWithMeta(STRONG_CONSISTENCY_COLLECTIONS.commissions);
    okStrongWrite(res, { success: true, affected, blocked_ids: blockedIds }, {
        persisted: true,
        reloaded_collections: reloadMeta.reloaded_collections,
        read_at: reloadMeta.read_at,
        fallbacks_used: blockedIds.length ? ['blocked_ids'] : []
    });
});

app.get('/admin/api/orders', auth, requirePermission('orders'), async (req, res) => {
    const readMeta = await freshReadMeta(req, STRONG_CONSISTENCY_COLLECTIONS.orders, true);
    const users = getCollection('users');
    const products = getCollection('products');
    const commissions = getCollection('commissions');
    let rows = sortByUpdatedDesc(getCollection('orders')).map((item) => buildOrderRecord(item, users, products, commissions));

    const status = pickString(req.query.status).trim();
    const statusGroup = pickString(req.query.status_group).trim();
    const paymentMethod = pickString(req.query.payment_method).trim();
    const deliveryType = pickString(req.query.delivery_type).trim();
    const searchField = pickString(req.query.search_field, 'auto').trim();
    const searchValue = pickString(req.query.search_value).trim().toLowerCase();
    const productName = pickString(req.query.product_name).trim().toLowerCase();
    const startDate = pickString(req.query.start_date).trim();
    const endDate = pickString(req.query.end_date).trim();
    const includeSuborders = toBoolean(req.query.include_suborders);

    if (!includeSuborders) rows = rows.filter((item) => !item.parent_order_id);
    if (status) rows = rows.filter((item) => getEffectiveOrderStatus(item) === status);
    else if (statusGroup && statusGroup !== 'all') rows = rows.filter((item) => normalizeOrderStatusGroup(item) === statusGroup);
    if (paymentMethod) {
        rows = rows.filter((item) => normalizePaymentMethodCode(
            item.payment_method || item.pay_channel || item.pay_type || item.payment_channel || ''
        ) === paymentMethod);
    }
    if (deliveryType) rows = rows.filter((item) => (item.delivery_type || 'express') === deliveryType);
    if (productName) rows = rows.filter((item) => `${item.product?.name || ''}`.toLowerCase().includes(productName));
    if (startDate) rows = rows.filter((item) => getDateKey(item.created_at, '') >= startDate);
    if (endDate) rows = rows.filter((item) => getDateKey(item.created_at, '') <= endDate);

    if (searchValue) {
        rows = rows.filter((item) => {
            const haystack = {
                order_no: item.order_no || '',
                buyer_nickname: item.buyer?.nickname || '',
                buyer_phone: item.buyer?.phone || '',
                member_no: item.buyer?.member_no || '',
                receiver_name: item.address?.receiver_name || item.address?.name || '',
                receiver_phone: item.address?.phone || '',
                product_name: item.product?.name || ''
            };
            if (searchField !== 'auto') return String(haystack[searchField] || '').toLowerCase().includes(searchValue);
            return Object.values(haystack).some((value) => String(value).toLowerCase().includes(searchValue));
        });
    }

    okStrongRead(res, {
        ...paginate(rows, req),
        summary: {
            pending_pay: rows.filter((item) => normalizeOrderStatusGroup(item) === 'pending_pay').length,
            pending_group: rows.filter((item) => normalizeOrderStatusGroup(item) === 'pending_group').length,
            pending_ship: rows.filter((item) => normalizeOrderStatusGroup(item) === 'pending_ship').length,
            pending_receive: rows.filter((item) => normalizeOrderStatusGroup(item) === 'pending_receive').length,
            completed: rows.filter((item) => normalizeOrderStatusGroup(item) === 'completed').length,
            closed: rows.filter((item) => normalizeOrderStatusGroup(item) === 'closed').length
        }
    }, readMeta.freshness);
});

app.get('/admin/api/orders/export', auth, requirePermission('orders'), (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=\"orders.json\"');
    res.send(JSON.stringify(getCollection('orders'), null, 2));
});

app.get('/admin/api/orders/:id', auth, requirePermission('orders'), async (req, res) => {
    const readMeta = await freshReadMeta(req, STRONG_CONSISTENCY_COLLECTIONS.orders, true);
    const users = getCollection('users');
    const products = getCollection('products');
    const commissions = getCollection('commissions');
    const order = findByLookup(getCollection('orders'), req.params.id, (item) => [item.order_no]);
    if (!order) return fail(res, '订单不存在', 404);
    okStrongRead(res, buildOrderRecord(order, users, products, commissions), readMeta.freshness);
});

app.put('/admin/api/orders/:id/ship', auth, requirePermission('orders'), async (req, res) => {
    if (rejectUnknownBodyFields(res, req.body, ['fulfillment_type', 'type', 'tracking_no', 'logistics_company'], '订单发货参数不合法')) return;
    const fulfillmentRaw = pickString(req.body?.fulfillment_type || req.body?.type).trim().toLowerCase();
    const requestedFulfillmentType = fulfillmentRaw === 'agent'
        ? 'agent'
        : (['company', 'platform'].includes(fulfillmentRaw) ? 'company' : fulfillmentRaw);
    const fulfillmentTypeCheck = requireEnumField(requestedFulfillmentType, 'fulfillment_type', '履约方式', ['company', 'agent']);
    const logisticsConfig = toPlainObject(getMiniProgramConfigSnapshot().logistics_config);
    const trackingRequired = logisticsConfig.shipping_tracking_no_required !== false;
    const companyRequired = !!logisticsConfig.shipping_company_name_required;
    const trackingNo = pickString(req.body?.tracking_no).trim();
    const logisticsCompany = pickString(req.body?.logistics_company).trim();
    const fieldErrors = [];
    if (!fulfillmentTypeCheck.ok) fieldErrors.push(fulfillmentTypeCheck.error);
    if (trackingRequired && !trackingNo) fieldErrors.push(buildFieldError('tracking_no', '物流单号不能为空', 'required'));
    if (companyRequired && !logisticsCompany) fieldErrors.push(buildFieldError('logistics_company', '物流公司不能为空', 'required'));
    if (fieldErrors.length) return failWithFieldErrors(res, fieldErrors, '订单发货参数不合法');

    await ensureFreshCollections(['orders', 'users', 'products', 'commissions']);
    const current = findByLookup(getCollection('orders'), req.params.id, (item) => [item.order_no]);
    if (!current) return fail(res, '订单不存在', 404);
    if (getEffectiveOrderStatus(current) === 'pending_group') {
        return fail(res, '当前拼团订单尚未成团，不允许发货', 400);
    }
    if (!ORDER_SHIPPABLE_STATUSES.has(String(current.status || ''))) {
        return fail(res, `当前订单状态不允许发货：${current.status || '-'}`, 400);
    }
    let finalFulfillmentType = requestedFulfillmentType || current.fulfillment_type || 'company';
    let fallbackNotice = '';
    let deductionResult = null;

    if (requestedFulfillmentType === 'agent') {
        const lockedAgentCost = toNumber(current.locked_agent_cost_total ?? current.locked_agent_cost, 0);
        if (!pickString(current.fulfillment_partner_openid || current.nearest_agent_openid)) {
            finalFulfillmentType = 'company';
            fallbackNotice = '当前订单未锁定可履约代理，已自动改为平台发货';
        } else if (lockedAgentCost <= 0) {
            finalFulfillmentType = 'company';
            fallbackNotice = '当前订单缺少锁定代理成本，已自动改为平台发货';
        } else {
            deductionResult = await deductAgentFulfillmentGoodsFund(current, req.admin);
            if (!deductionResult.ok && deductionResult.insufficient) {
                finalFulfillmentType = 'company';
                fallbackNotice = `代理货款余额不足（当前 ¥${roundMoney(deductionResult.balance).toFixed(2)}），已自动改为平台发货`;
                ensurePlatformSettlementCommissionsForOrder(current);
            } else if (!deductionResult.ok) {
                return fail(res, deductionResult.reason || '代理货款扣减失败', 500);
            }
        }
    }

    let updated = null;
    try {
        updated = patchOrder(req.params.id, (row) => ({
            ...row,
            logistics_company: logisticsCompany || row.logistics_company || '',
            tracking_no: trackingNo || row.tracking_no || '',
            fulfillment_type: finalFulfillmentType,
            fulfillment_partner_id: finalFulfillmentType === 'agent' ? row.fulfillment_partner_id : '',
            fulfillment_partner_openid: finalFulfillmentType === 'agent' ? row.fulfillment_partner_openid : '',
            fulfillment_partner_role_level: finalFulfillmentType === 'agent' ? row.fulfillment_partner_role_level : 0,
            agent: finalFulfillmentType === 'agent' ? row.agent : null,
            agent_info: finalFulfillmentType === 'agent' ? row.agent_info : null,
            locked_agent_cost: finalFulfillmentType === 'agent' ? row.locked_agent_cost : null,
            locked_agent_cost_total: finalFulfillmentType === 'agent' ? row.locked_agent_cost_total : null,
            middle_commission_total: finalFulfillmentType === 'agent' ? row.middle_commission_total : 0,
            status: 'shipped',
            shipped_at: nowIso(),
            updated_at: nowIso()
        }));
        if (!updated) return fail(res, '订单不存在', 404);

        const fulfillmentCommission = ensureAgentFulfillmentCommissionForOrder(updated);
        ensureAgentAssistCommissionForOrder(updated);
        ensureBranchAgentCommissionForOrder(updated, { preferPickup: false });
        if (fulfillmentCommission) {
            const commissionAmount = roundMoney(toNumber(fulfillmentCommission.amount, 0));
            const patched = patchOrder(req.params.id, (row) => ({
                ...row,
                middle_commission_total: commissionAmount,
                updated_at: nowIso()
            }));
            if (patched) {
                updated.middle_commission_total = commissionAmount;
            }
        }
    } catch (error) {
        if (deductionResult?.rollback) {
            await deductionResult.rollback().catch(() => {});
        }
        return fail(res, error.message || '订单发货失败', 500);
    }

    createAuditLog(req.admin, 'order.ship', 'orders', {
        order_id: primaryId(updated) || req.params.id,
        order_no: pickString(updated.order_no),
        fulfillment_type: finalFulfillmentType,
        fallback_notice: fallbackNotice,
        deducted_goods_fund_amount: roundMoney(deductionResult?.amount || 0)
    });
    const reloadMeta = await reloadCollectionsWithMeta(STRONG_CONSISTENCY_COLLECTIONS.orders);
    const users = getCollection('users');
    const products = getCollection('products');
    const commissions = getCollection('commissions');
    const refreshed = findByLookup(getCollection('orders'), req.params.id, (row) => [row.order_no]);
    const payload = {
        ...(refreshed ? buildOrderRecord(refreshed, users, products, commissions) : updated),
        fulfillment_fallback: requestedFulfillmentType === 'agent' && finalFulfillmentType !== 'agent',
        fulfillment_notice: fallbackNotice,
        deducted_goods_fund_amount: roundMoney(deductionResult?.amount || 0)
    };
    okStrongWrite(res, payload, {
        persisted: true,
        reloaded_collections: reloadMeta.reloaded_collections,
        read_at: reloadMeta.read_at,
        fallbacks_used: fallbackNotice ? ['platform_fallback'] : []
    });
});

app.put('/admin/api/orders/:id/amount', auth, requirePermission('order_amount_adjust'), async (req, res) => {
    if (rejectUnknownBodyFields(res, req.body, ['pay_amount', 'actual_price'], '订单金额调整参数不合法')) return;
    const amountCheck = requireNumberField(req.body?.pay_amount ?? req.body?.actual_price, 'pay_amount', '订单金额', { min: 0.01 });
    if (!amountCheck.ok) return failWithFieldErrors(res, [amountCheck.error], '订单金额调整参数不合法');
    await ensureFreshCollections(['orders']);
    const payAmount = amountCheck.value;
    const updated = patchOrder(req.params.id, (row) => ({
        ...row,
        pay_amount: payAmount,
        actual_price: payAmount,
        updated_at: nowIso()
    }));
    if (!updated) return fail(res, '订单不存在', 404);
    const reloadMeta = await reloadCollectionsWithMeta(STRONG_CONSISTENCY_COLLECTIONS.orders);
    const freshUpdated = findByLookup(getCollection('orders'), req.params.id, (row) => [row.order_no]) || updated;
    okStrongWrite(res, freshUpdated, {
        persisted: true,
        reloaded_collections: reloadMeta.reloaded_collections,
        read_at: reloadMeta.read_at
    });
});

app.put('/admin/api/orders/:id/remark', auth, requirePermission('orders'), async (req, res) => {
    await ensureFreshCollections(['orders']);
    const nextRemark = pickString(req.body?.remark);
    const updated = patchOrder(req.params.id, (row) => ({
        ...row,
        admin_remark: [pickString(row.admin_remark), nextRemark].filter(Boolean).join('\n'),
        updated_at: nowIso()
    }));
    if (!updated) return fail(res, '订单不存在', 404);
    const reloadMeta = await reloadCollectionsWithMeta(STRONG_CONSISTENCY_COLLECTIONS.orders);
    const freshUpdated = findByLookup(getCollection('orders'), req.params.id, (row) => [row.order_no]) || updated;
    okStrongWrite(res, freshUpdated, {
        persisted: true,
        reloaded_collections: reloadMeta.reloaded_collections,
        read_at: reloadMeta.read_at
    });
});

app.put('/admin/api/orders/:id/repair-fulfillment', auth, requirePermission('orders'), async (req, res) => {
    await ensureFreshCollections(['orders', 'users', 'products', 'commissions']);
    const result = repairOrderFulfillmentChain(req.params.id);
    if (!result.ok) return fail(res, result.message, 400);
    if (result.order?.fulfillment_partner_openid) {
        const users = getCollection('users');
        const claimant = findUserByAnyId(users, result.order.fulfillment_partner_openid);
        removeConflictingReferralCommissions(result.order, claimant);
    }
    const docId = String(result.order?._id || result.order?.id || req.params.id);
    await directPatchDocument('orders', docId, result.order).catch(() => {});
    await ensureFreshCollections(['orders', 'users', 'products', 'commissions']);
    const users = getCollection('users');
    const products = getCollection('products');
    const commissions = getCollection('commissions');
    const refreshed = findByLookup(getCollection('orders'), req.params.id, (row) => [row.order_no]);
    if (!refreshed) return fail(res, '订单不存在', 404);
    okStrongWrite(res, buildOrderRecord(refreshed, users, products, commissions), {
        persisted: true,
        reloaded_collections: STRONG_CONSISTENCY_COLLECTIONS.orders,
        read_at: nowIso()
    });
});

app.put('/admin/api/orders/:id/force-complete', auth, requirePermission('order_force_complete'), async (req, res) => {
    if (rejectUnknownBodyFields(res, req.body, ['reason'], '强制完成参数不合法')) return;
    const reasonCheck = requireNonEmptyStringField(req.body?.reason, 'reason', '完成原因', { maxLength: 200 });
    if (!reasonCheck.ok) return failWithFieldErrors(res, [reasonCheck.error], '强制完成参数不合法');
    await ensureFreshCollections(['orders']);
    const reason = reasonCheck.value;
    const updated = patchOrder(req.params.id, (row) => ({
        ...row,
        status: 'completed',
        completed_at: nowIso(),
        admin_remark: [pickString(row.admin_remark), reason].filter(Boolean).join('\n'),
        updated_at: nowIso()
    }));
    if (!updated) return fail(res, '订单不存在', 404);
    const reloadMeta = await reloadCollectionsWithMeta(STRONG_CONSISTENCY_COLLECTIONS.orders);
    const freshUpdated = findByLookup(getCollection('orders'), req.params.id, (row) => [row.order_no]) || updated;
    okStrongWrite(res, freshUpdated, {
        persisted: true,
        reloaded_collections: reloadMeta.reloaded_collections,
        read_at: reloadMeta.read_at
    });
});

app.put('/admin/api/orders/:id/force-cancel', auth, requirePermission('order_force_cancel'), async (req, res) => {
    if (rejectUnknownBodyFields(res, req.body, ['reason'], '强制取消参数不合法')) return;
    const reasonCheck = requireNonEmptyStringField(req.body?.reason, 'reason', '取消原因', { maxLength: 200 });
    if (!reasonCheck.ok) return failWithFieldErrors(res, [reasonCheck.error], '强制取消参数不合法');
    await ensureFreshCollections(['orders']);
    const reason = reasonCheck.value;
    const updated = patchOrder(req.params.id, (row) => ({
        ...row,
        status: 'cancelled',
        admin_remark: [pickString(row.admin_remark), reason].filter(Boolean).join('\n'),
        updated_at: nowIso()
    }));
    if (!updated) return fail(res, '订单不存在', 404);
    const reloadMeta = await reloadCollectionsWithMeta(STRONG_CONSISTENCY_COLLECTIONS.orders);
    const freshUpdated = findByLookup(getCollection('orders'), req.params.id, (row) => [row.order_no]) || updated;
    okStrongWrite(res, freshUpdated, {
        persisted: true,
        reloaded_collections: reloadMeta.reloaded_collections,
        read_at: reloadMeta.read_at
    });
});

app.get('/admin/api/logistics/order/:id', auth, requirePermission('orders'), async (req, res) => {
    await ensureFreshCollections(['orders']);
    const order = findByLookup(getCollection('orders'), req.params.id, (item) => [item.order_no]);
    if (!order) return fail(res, '订单不存在', 404);
    ok(res, {
        order_id: order.id,
        logistics_company: order.logistics_company || '',
        tracking_no: order.tracking_no || '',
        refresh: toBoolean(req.query.refresh),
        traces: [],
        updated_at: nowIso()
    });
});

// ===== 财务看板汇总接口 =====
app.get('/admin/api/finance/overview', auth, requirePermission('statistics'), (req, res) => {
    const orders = getCollection('orders');
    const commissions = getCollection('commissions');
    const withdrawals = getCollection('withdrawals');
    const users = getCollection('users');
    const dividendExecs = getCollection('dividend_executions');

    // 从 configs 读取 agent-system 配置
    const configs = getCollection('configs');
    function getAgentConfig(key, fallback) {
        const row = configs.find((c) => c.config_key === `agent_system_${key}` || c.key === `agent_system_${key}`);
        if (!row) return fallback;
        if (row.config_value !== undefined) {
            try { return typeof row.config_value === 'string' ? JSON.parse(row.config_value) : row.config_value; } catch (_) { return row.config_value; }
        }
        return row.value !== undefined ? row.value : fallback;
    }

    // ── 销售 GMV ──
    const paidStatuses = ['paid', 'pending_group', 'agent_confirmed', 'shipping_requested', 'shipped', 'completed'];
    const paidOrders = orders.filter((o) => paidStatuses.includes(String(o.status || '')));
    const since30d = Date.now() - 30 * 86400000;
    const gmv = paidOrders.reduce((s, o) => s + toNumber(o.pay_amount ?? o.total_amount ?? o.actual_price, 0), 0);
    const gmv_30d = paidOrders
        .filter((o) => new Date(o.created_at || 0).getTime() >= since30d)
        .reduce((s, o) => s + toNumber(o.pay_amount ?? o.total_amount ?? o.actual_price, 0), 0);

    // ── 佣金 ──
    const commissionStats = { total: 0, frozen: 0, pending_approval: 0, settled: 0, cancelled: 0 };
    commissions.forEach((c) => {
        const amt = toNumber(c.amount, 0);
        commissionStats.total += amt;
        const s = String(c.status || '');
        if (s === 'frozen') commissionStats.frozen += amt;
        else if (s === 'pending_approval') commissionStats.pending_approval += amt;
        else if (['settled', 'completed', 'approved'].includes(s)) commissionStats.settled += amt;
        else if (s === 'cancelled') commissionStats.cancelled += amt;
    });

    // ── 提现 ──
    const withdrawalStats = { pending_amount: 0, completed_amount: 0, total_fee: 0, pending_count: 0 };
    withdrawals.forEach((w) => {
        const amt = toNumber(w.amount, 0);
        const fee = toNumber(w.fee, 0);
        const s = String(w.status || '');
        if (s === 'pending') { withdrawalStats.pending_amount += amt; withdrawalStats.pending_count++; }
        if (['completed', 'approved'].includes(s)) withdrawalStats.completed_amount += amt;
        withdrawalStats.total_fee += fee;
    });

    // ── 代理商货款（debt_amount） ──
    const debtors = users
        .filter((u) => toNumber(u.debt_amount, 0) > 0)
        .map((u) => ({
            user_id: u.id || u._legacy_id || u._id,
            nickname: pickString(u.nickname || u.nickName || u.name || ''),
            invite_code: pickString(u.my_invite_code || u.invite_code || u.member_no || ''),
            member_no: pickString(u.my_invite_code || u.invite_code || u.member_no || ''),
            role_level: toNumber(u.role_level ?? u.distributor_level, 0),
            debt_amount: toNumber(u.debt_amount, 0),
            debt_reason: pickString(u.debt_reason || '')
        }))
        .sort((a, b) => b.debt_amount - a.debt_amount);

    // ── 基金池 ──
    const fundPool = getAgentConfig('fund-pool', { enabled: false });
    const fundPoolRow = configs.find((c) => c.config_key === 'agent_system_fund-pool' || c.key === 'agent_system_fund-pool') || {};

    // ── 分红 ──
    const sortedExecs = sortByUpdatedDesc(dividendExecs);
    const lastExec = sortedExecs[0] || null;

    ok(res, {
        gmv,
        gmv_30d,
        commissions: commissionStats,
        withdrawals: withdrawalStats,
        agent_debt: {
            total_debt: debtors.reduce((s, d) => s + d.debt_amount, 0),
            debtor_count: debtors.length,
            debtors
        },
        fund_pool: fundPool,
        fund_pool_sub: {
            mirror_ops: toNumber(fundPoolRow.sub_mirror_ops, 0),
            travel: toNumber(fundPoolRow.sub_travel, 0),
            parent: toNumber(fundPoolRow.sub_parent, 0),
            personal: toNumber(fundPoolRow.sub_personal, 0),
            total_balance: toNumber(fundPoolRow.balance, 0),
            total_in: toNumber(fundPoolRow.total_in, 0),
        },
        dividend: {
            last_executed_year: lastExec?.year || null,
            last_total_distributed: toNumber(lastExec?.totalDistributed, 0),
            executions: sortedExecs.slice(0, 10)
        }
    });
});

// ─── 业绩贡献榜：按 agent 出单统计（日/月/季度） ───
app.get('/admin/api/finance/agent-performance', auth, requirePermission('statistics'), (req, res) => {
    const period = pickString(req.query.period || 'month'); // day | month | quarter
    const refDate = req.query.date ? new Date(req.query.date) : new Date();
    const limit = toNumber(req.query.limit, 50);

    // 计算本期起止时间
    let periodStart, periodEnd;
    const y = refDate.getFullYear();
    const m = refDate.getMonth(); // 0-indexed
    const d = refDate.getDate();
    if (period === 'day') {
        const iso = refDate.toISOString().slice(0, 10);
        periodStart = iso;
        periodEnd = iso;
    } else if (period === 'month') {
        periodStart = `${y}-${String(m + 1).padStart(2, '0')}-01`;
        const lastDay = new Date(y, m + 1, 0).getDate();
        periodEnd = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    } else { // quarter
        const q = Math.floor(m / 3);
        const qStartM = q * 3;
        const qEndM = qStartM + 2;
        periodStart = `${y}-${String(qStartM + 1).padStart(2, '0')}-01`;
        const qEndLastDay = new Date(y, qEndM + 1, 0).getDate();
        periodEnd = `${y}-${String(qEndM + 1).padStart(2, '0')}-${String(qEndLastDay).padStart(2, '0')}`;
    }

    const paidStatuses = ['paid', 'agent_confirmed', 'shipping_requested', 'shipped', 'completed'];
    const orders = getCollection('orders');
    const users = getCollection('users');

    // 从订单提取 agent openid（多字段兼容）
    function getOrderAgentOpenid(order) {
        return order?.fulfillment_partner_openid
            || order?.nearest_agent_openid
            || order?.agent_info?.openid
            || order?.agent?.openid
            || order?.distributor?.openid
            || order?.referrer_openid
            || null;
    }

    // 过滤本期已付订单
    const periodOrders = orders.filter((o) => {
        if (!paidStatuses.includes(String(o.status || ''))) return false;
        const dateStr = String(o.created_at || o.pay_time || '').slice(0, 10);
        return dateStr >= periodStart && dateStr <= periodEnd;
    });

    // 按 agent openid 聚合业绩
    const agentMap = {};
    for (const o of periodOrders) {
        const agentOid = getOrderAgentOpenid(o);
        if (!agentOid) continue;
        if (!agentMap[agentOid]) agentMap[agentOid] = { openid: agentOid, order_count: 0, gmv: 0 };
        agentMap[agentOid].order_count += 1;
        agentMap[agentOid].gmv += toNumber(o.pay_amount ?? o.total_amount ?? o.actual_price, 0);
    }

    // 关联用户信息，按 GMV 排名
    const ranked = Object.values(agentMap)
        .sort((a, b) => b.gmv - a.gmv)
        .slice(0, limit)
        .map((item, idx) => {
            const u = users.find((x) => x.openid === item.openid) || {};
            return {
                rank: idx + 1,
                openid: item.openid,
                user_id: u.id || u._legacy_id || u._id || item.openid,
                nickname: pickString(u.nickname || u.nickName || u.name || item.openid),
                invite_code: pickString(u.my_invite_code || u.invite_code || u.member_no || ''),
                member_no: pickString(u.my_invite_code || u.invite_code || u.member_no || ''),
                role_level: toNumber(u.role_level ?? u.distributor_level, 0),
                order_count: item.order_count,
                gmv: Number(item.gmv.toFixed(2))
            };
        });

    ok(res, {
        period,
        period_start: periodStart,
        period_end: periodEnd,
        total_agents: Object.keys(agentMap).length,
        list: ranked
    });
});

// ─── 个人/团队池子贡献：分红资格预览 + 团队业绩贡献 ───
app.get('/admin/api/finance/pool-contributions', auth, requirePermission('statistics'), (req, res) => {
    const users = getCollection('users');
    const configs = getCollection('configs');
    const commissions = getCollection('commissions');

    function getAgentCfg(key, fallback) {
        const row = configs.find((c) => c.config_key === `agent_system_${key}` || c.key === `agent_system_${key}`);
        if (!row) return fallback;
        if (row.config_value !== undefined) {
            try { return typeof row.config_value === 'string' ? JSON.parse(row.config_value) : row.config_value; } catch (_) { return row.config_value; }
        }
        return row.value !== undefined ? row.value : fallback;
    }

    const dividendRules = getAgentCfg('dividend-rules', { enabled: false, source_pct: 0, b_team_award: { enabled: false, ranks: [] }, b1_personal_award: { enabled: false, ranks: [] } });

    // 广度优先展开邀请树，计算直系+团队总销售额
    function getAllDescendants(userList, openid, visited = new Set()) {
        visited.add(openid);
        const result = [];
        for (const u of userList) {
            const parentOid = u.invited_by || u.referrer_openid || u.parent_openid || '';
            if (parentOid === openid && !visited.has(u.openid)) {
                result.push(u);
                result.push(...getAllDescendants(userList, u.openid, visited));
            }
        }
        return result;
    }

    // 合伙人（等级>=4）的团队业绩贡献
    const partners = users.filter((u) => toNumber(u.role_level ?? u.distributor_level, 0) >= 4);
    const partnerContributions = partners.map((u) => {
        const descendants = getAllDescendants(users, u.openid, new Set());
        const teamSales = [u, ...descendants].reduce((s, m) => s + toNumber(m.total_spent, 0), 0);
        const personalSales = toNumber(u.total_spent, 0);
        // 累计已结算佣金
        const totalCommission = commissions
            .filter((c) => (c.openid === u.openid || c.user_id === String(u.id || u._id)) && ['settled', 'completed', 'approved'].includes(String(c.status || '')))
            .reduce((s, c) => s + toNumber(c.amount, 0), 0);
        return {
            user_id: u.id || u._legacy_id || u._id,
            openid: u.openid,
            nickname: pickString(u.nickname || u.nickName || u.name || ''),
            invite_code: pickString(u.my_invite_code || u.invite_code || u.member_no || ''),
            member_no: pickString(u.my_invite_code || u.invite_code || u.member_no || ''),
            role_level: toNumber(u.role_level ?? u.distributor_level, 0),
            personal_sales: Number(personalSales.toFixed(2)),
            team_size: descendants.length + 1,
            team_sales: Number(teamSales.toFixed(2)),
            settled_commission: Number(totalCommission.toFixed(2))
        };
    }).sort((a, b) => b.team_sales - a.team_sales);

    // 代理商（等级3）个人贡献
    const agentContributions = users
        .filter((u) => toNumber(u.role_level ?? u.distributor_level, 0) === 3)
        .map((u) => {
            const personalSales = toNumber(u.total_spent, 0);
            const totalCommission = commissions
                .filter((c) => (c.openid === u.openid || c.user_id === String(u.id || u._id)) && ['settled', 'completed', 'approved'].includes(String(c.status || '')))
                .reduce((s, c) => s + toNumber(c.amount, 0), 0);
            return {
                user_id: u.id || u._legacy_id || u._id,
                openid: u.openid,
                nickname: pickString(u.nickname || u.nickName || u.name || ''),
                invite_code: pickString(u.my_invite_code || u.invite_code || u.member_no || ''),
                member_no: pickString(u.my_invite_code || u.invite_code || u.member_no || ''),
                personal_sales: Number(personalSales.toFixed(2)),
                settled_commission: Number(totalCommission.toFixed(2))
            };
        })
        .sort((a, b) => b.personal_sales - a.personal_sales)
        .slice(0, 50);

    ok(res, {
        dividend_enabled: !!dividendRules.enabled,
        dividend_source_pct: toNumber(dividendRules.source_pct, 0),
        partner_contributions: partnerContributions,
        agent_contributions: agentContributions.slice(0, 50)
    });
});

app.get('/admin/api/statistics/overview', auth, requirePermission('statistics'), (req, res) => {
    const orders = getCollection('orders');
    const products = getCollection('products');
    const users = getCollection('users');
    const paidStatuses = ['paid', 'agent_confirmed', 'shipping_requested', 'shipped', 'completed'];
    const paidOrders = orders.filter((item) => paidStatuses.includes(String(item.status || '')));
    const today = getDateKey(Date.now(), nowIso().slice(0, 10));
    const todayOrders = orders.filter((item) => getDateKey(item.created_at, '') === today);
    const todayPaidOrders = paidOrders.filter((item) => getDateKey(item.paid_at || item.pay_time || item.created_at, '') === today);
    ok(res, {
        total_sales: paidOrders.reduce((sum, item) => sum + toNumber(item.pay_amount ?? item.actual_price ?? item.total_amount, 0), 0),
        total_orders: orders.length,
        total_users: users.length,
        total_products: products.length,
        today_orders: todayOrders.length,
        today_sales: todayPaidOrders.reduce((sum, item) => sum + toNumber(item.pay_amount ?? item.actual_price ?? item.total_amount, 0), 0),
        pending_ship: orders.filter((item) => normalizeOrderStatusGroup(item) === 'pending_ship').length,
        pending_refund: getCollection('refunds').filter((item) => item.status === 'pending').length,
        low_stock_count: products.filter((item) => toNumber(item.stock, 0) <= 10).length
    });
});

app.get('/admin/api/operations/dashboard', auth, async (req, res) => {
    await ensureFreshCollections(['orders', 'products', 'users', 'refunds', 'withdrawals', 'commissions']);
    const orders = getCollection('orders');
    const products = getCollection('products');
    const users = getCollection('users');
    const refunds = getCollection('refunds');
    const withdrawals = getCollection('withdrawals');
    const commissions = getCollection('commissions');
    const today = getDateKey(Date.now(), nowIso().slice(0, 10));
    const paidStatuses = ['paid', 'agent_confirmed', 'shipping_requested', 'shipped', 'completed'];
    const todayOrders = orders.filter((item) => getDateKey(item.created_at, '') === today);
    const todayPaidOrders = orders.filter((item) => {
        return paidStatuses.includes(String(item.status || ''))
            && getDateKey(item.paid_at || item.pay_time || item.created_at, '') === today;
    });
    const pendingShipCount = orders.filter((item) => normalizeOrderStatusGroup(item) === 'pending_ship').length;
    const pendingReceiveCount = orders.filter((item) => normalizeOrderStatusGroup(item) === 'pending_receive').length;
    const pendingRefundCount = refunds.filter((item) => pickString(item.status) === 'pending').length;
    const pendingWithdrawalCount = withdrawals.filter((item) => pickString(item.status) === 'pending').length;
    const pendingCommissionCount = commissions.filter((item) => pickString(item.status) === 'pending_approval').length;

    ok(res, {
        kpi: {
            today_orders: todayOrders.length,
            today_sales: todayPaidOrders.reduce((sum, item) => sum + toNumber(item.pay_amount ?? item.actual_price ?? item.total_amount, 0), 0),
            total_users: users.length,
            pending_ship: pendingShipCount,
            pendingShip: pendingShipCount
        },
        pending: {
            withdrawals: pendingWithdrawalCount,
            refunds: pendingRefundCount,
            commissions: pendingCommissionCount
        },
        recent_orders: sortByUpdatedDesc(orders).slice(0, 8),
        low_stock: sortByUpdatedDesc(products)
            .filter((item) => toNumber(item.stock, 0) <= 10)
            .slice(0, 8)
            .map((item) => ({ ...item, images: toArray(item.images).map(assetUrl) })),
        hot_products: sortByUpdatedDesc(products)
            .sort((a, b) => toNumber(b.heat_score, 0) - toNumber(a.heat_score, 0))
            .slice(0, 8)
            .map((item) => ({ ...item, images: toArray(item.images).map(assetUrl) })),
        todo: {
            pending_ship: pendingShipCount,
            pending_receive: pendingReceiveCount,
            pending_refund: pendingRefundCount,
            pending_withdrawal: pendingWithdrawalCount,
            pending_commission: pendingCommissionCount
        }
    });
});

app.get('/admin/api/system/status', auth, requirePermission('settings_manage'), async (req, res) => {
    const probe = await probeDataStore({ collection: pickString(req.query.collection, 'admins') || 'admins', forceReload: true });
    const memory = process.memoryUsage();
    const heapPercent = memory.heapTotal > 0 ? Math.round((memory.heapUsed / memory.heapTotal) * 100) : 0;
    const freeMemMb = Math.round(os.freemem() / 1024 / 1024);
    const totalMemMb = Math.round(os.totalmem() / 1024 / 1024);
    const cacheHealth = typeof dataStore.cacheHealth === 'function' ? dataStore.cacheHealth() : dataStore.health();
    ok(res, {
        status: resolveOperationalStatus(probe),
        runtime: 'cloudrun-admin-service',
        services: {
            database: buildDataSourceRuntimeStatus(probe)
        },
        process: {
            pid: process.pid,
            node_version: process.version,
            uptime_seconds: Math.floor(process.uptime()),
            uptime_human: formatUptimeHuman(process.uptime())
        },
        memory: {
            rss_mb: Math.round(memory.rss / 1024 / 1024),
            heap_used_mb: Math.round(memory.heapUsed / 1024 / 1024),
            heap_total_mb: Math.round(memory.heapTotal / 1024 / 1024),
            heap_percent: heapPercent
        },
        os: {
            platform: `${os.platform()} ${os.release()}`,
            free_mem_mb: freeMemMb,
            total_mem_mb: totalMemMb,
            load_avg: os.loadavg().map((item) => Number(item.toFixed(2)))
        },
        data_source: buildDataSourceRuntimeStatus(probe),
        cron: buildCronRuntimeStatus(probe),
        data_root: dataRoot,
        runtime_root: runtimeRoot,
        upload_root: uploadsRoot,
        cache_health: cacheHealth,
        checked_at: probe.checked_at || nowIso()
    });
});

app.get('/admin/api/payment-health', auth, requirePermission('settings_manage'), (req, res) => {
    ok(res, getPaymentHealthSnapshot());
});

app.get('/admin/api/settings', auth, requirePermission('settings_manage'), (req, res) => ok(res, getSettingsSnapshot()));

app.put('/admin/api/settings', auth, requirePermission('settings_manage'), (req, res) => {
    const current = getSettingsSnapshot();
    const next = { ...current };
    const category = req.body?.category;
    if (category && req.body?.settings && typeof req.body.settings === 'object') {
        next[category] = { ...(next[category] || {}), ...req.body.settings };
    } else {
        Object.assign(next, toObject(req.body, {}));
    }
    saveSingleton('settings', next);
    ok(res, next);
});

app.get('/admin/api/mini-program-config', auth, (req, res) => ok(res, getMiniProgramConfigSnapshot()));

app.put('/admin/api/mini-program-config', auth, requirePermission('settings_manage'), (req, res) => {
    const nextConfig = configContract.normalizeMiniProgramConfig({ ...getMiniProgramConfigSnapshot(), ...toObject(req.body, {}) });
    saveSingleton('mini-program-config', nextConfig);
    upsertConfigRow('mini_program_config', nextConfig, {
        category: 'MINIPROGRAM',
        group: 'MINIPROGRAM',
        description: '小程序运行时配置',
        is_public: true
    });
    ok(res, nextConfig);
});

function parseConfigRowValue(row, fallback) {
    if (!row) return fallback;
    const value = row.config_value !== undefined ? row.config_value : row.value;
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value === 'string') {
        try { return JSON.parse(value); } catch (_) { return value; }
    }
    return value;
}

function getConfigRowValue(key, fallback) {
    const row = getCollection('configs').find((item) => item.config_key === key || item.key === key)
        || getCollection('app_configs').find((item) => item.config_key === key || item.key === key);
    return parseConfigRowValue(row, fallback);
}

function collectWalletLogsForUser(user = {}) {
    const userIds = [primaryId(user), user?.id, user?._legacy_id, user?._id].filter((value) => value !== null && value !== undefined && value !== '');
    return sortByUpdatedDesc(getCollection('wallet_logs').filter((row) => {
        if (user.openid && pickString(row.openid) === pickString(user.openid)) return true;
        return userIds.some((id) => rowMatchesLookup(row, id, [row.user_id]));
    }));
}

function collectGoodsFundLogsForUser(user = {}) {
    return sortByUpdatedDesc(getCollection('goods_fund_logs').filter((row) => {
        if (user.openid && pickString(row.openid) === pickString(user.openid)) return true;
        return rowMatchesLookup(row, primaryId(user), [row.user_id]);
    }));
}

function buildOrderAuditSnapshot(order = {}, users = [], products = [], commissions = [], refunds = []) {
    const orderId = primaryId(order) || order.order_no;
    const orderNo = pickString(order.order_no);
    const orderRecord = buildOrderRecord(order, users, products, commissions);
    const relatedRefunds = refunds
        .filter((item) => rowMatchesLookup(item, orderId, [item.order_id, item.order_no, orderNo]))
        .map((item) => buildRefundRecord(item, users, getCollection('orders'), products, getCollection('skus')));
    const relatedCommissions = commissions
        .filter((item) => rowMatchesLookup(item, orderId, [item.order_id, item.order_no, orderNo]))
        .map((item) => buildCommissionRecord(item, users, getCollection('orders')));
    const buyer = findUserByAnyId(users, order.openid || order.buyer_id || order.user_id);
    return {
        order: orderRecord,
        refunds: relatedRefunds,
        commissions: relatedCommissions,
        buyer_wallet_logs: buyer ? collectWalletLogsForUser(buyer).slice(0, 20) : [],
        buyer_goods_fund_logs: buyer ? collectGoodsFundLogsForUser(buyer).slice(0, 20) : [],
        audit_logs: sortByUpdatedDesc(getCollection('admin_audit_logs').filter((row) => {
            return rowMatchesLookup(row, orderId, [row.target_id, row.target, row.order_id, row.order_no, orderNo]);
        })).slice(0, 20)
    };
}

function buildUserAuditSnapshot(user = {}, users = [], orders = [], commissions = []) {
    const userId = primaryId(user);
    const canonical = buildUserRecord(user, users, orders, commissions);
    const recentOrders = sortByUpdatedDesc(orders)
        .filter((row) => rowMatchesLookup(row, userId, [row.openid, row.user_id, row.buyer_id]))
        .slice(0, 20)
        .map((row) => buildOrderRecord(row, users, getCollection('products'), commissions));
    const recentCommissions = sortByUpdatedDesc(commissions)
        .filter((row) => rowMatchesLookup(row, userId, [row.user_id, row.openid]))
        .slice(0, 20)
        .map((row) => buildCommissionRecord(row, users, orders));
    const recentWithdrawals = sortByUpdatedDesc(getCollection('withdrawals'))
        .filter((row) => rowMatchesLookup(row, userId, [row.user_id, row.openid]))
        .slice(0, 20)
        .map((row) => buildWithdrawalRecord(row, users));
    return {
        user: canonical,
        parent: buildUserTiny(findUserByAnyId(users, getUserParentRef(user))),
        direct_children: getDirectChildren(users, user).slice(0, 20).map((row) => buildUserListRecord(row, buildUserListContext(users, orders))),
        recent_orders: recentOrders,
        recent_commissions: recentCommissions,
        recent_withdrawals: recentWithdrawals,
        wallet_logs: collectWalletLogsForUser(user).slice(0, 20),
        goods_fund_logs: collectGoodsFundLogsForUser(user).slice(0, 20),
        audit_logs: sortByUpdatedDesc(getCollection('admin_audit_logs').filter((row) => {
            return rowMatchesLookup(row, userId, [row.target_id, row.user_id, row.openid]);
        })).slice(0, 20)
    };
}

function buildConfigSourceReport(key) {
    const normalizedKey = pickString(key).trim();
    const configRows = getCollection('configs').filter((row) => row.config_key === normalizedKey || row.key === normalizedKey);
    const appConfigRows = getCollection('app_configs').filter((row) => row.config_key === normalizedKey || row.key === normalizedKey);
    const singletonValue = getSingleton(normalizedKey, undefined);
    const singletonExists = singletonValue !== undefined;
    let effective = null;
    if (singletonExists) {
        effective = {
            source: 'singleton',
            key: normalizedKey,
            value: singletonValue
        };
    } else if (configRows[0]) {
        effective = {
            source: 'configs',
            key: normalizedKey,
            value: parseConfigRowValue(configRows[0], null)
        };
    } else if (appConfigRows[0]) {
        effective = {
            source: 'app_configs',
            key: normalizedKey,
            value: parseConfigRowValue(appConfigRows[0], null)
        };
    }
    return {
        key: normalizedKey,
        effective,
        singleton: singletonExists ? singletonValue : null,
        configs: configRows.map((row) => ({
            id: primaryId(row),
            config_key: row.config_key || row.key,
            updated_at: row.updated_at || row.created_at,
            value: parseConfigRowValue(row, null)
        })),
        app_configs: appConfigRows.map((row) => ({
            id: primaryId(row),
            config_key: row.config_key || row.key,
            updated_at: row.updated_at || row.created_at,
            value: parseConfigRowValue(row, null)
        }))
    };
}

function upsertConfigRow(key, value, options = {}) {
    const rows = getCollection('configs');
    const index = rows.findIndex((item) => item.config_key === key || item.key === key);
    const row = {
        ...(index === -1 ? { id: nextId(rows), created_at: nowIso() } : rows[index]),
        config_key: key,
        key,
        config_value: value,
        value,
        config_type: 'json',
        category: options.category || rows[index]?.category || 'MEMBER',
        config_group: options.group || rows[index]?.config_group || options.category || 'MEMBER',
        description: options.description || rows[index]?.description || key,
        is_public: options.is_public != null ? options.is_public : (rows[index]?.is_public ?? false),
        active: true,
        status: true,
        updated_at: nowIso()
    };
    if (index === -1) rows.push(row);
    else rows[index] = row;
    saveCollection('configs', rows);
    return row;
}

function createDefaultPeerBonusConfig() {
    return {
        enabled: true,
        default_version: 'team',
        cooldown_days: 90,
        social: {
            level_3: { pct: 10 },
            level_4: { pct: 20 },
            level_5: { pct: 20 }
        },
        team: {
            level_3: { cash: 100, exchange_coupons: 2, coupon_product_value: 399, unlock_reward: 160, allowed_product_ids: [], allowed_sku_ids: [], exchange_title: '' },
            level_4: { cash: 2400, exchange_coupons: 15, coupon_product_value: 399, unlock_reward: 160, allowed_product_ids: [], allowed_sku_ids: [], exchange_title: '' },
            level_5: { cash: 0, exchange_coupons: 0, coupon_product_value: 0, unlock_reward: 0, allowed_product_ids: [], allowed_sku_ids: [], exchange_title: '' }
        },
        refund_dev_fee_pct: 1.5,
        level_1: 0,
        level_2: 0,
        level_3: 100,
        level_4: 2000,
        level_5: 0,
        product_sets_3: 2,
        product_sets_4: 15,
        product_sets_5: 0
    };
}

function normalizePeerBonusLevelConfig(raw = {}, fallback = {}) {
    return {
        cash: Math.max(0, toNumber(raw.cash, fallback.cash || 0)),
        exchange_coupons: Math.max(0, Math.floor(toNumber(raw.exchange_coupons, fallback.exchange_coupons || 0))),
        coupon_product_value: Math.max(0, toNumber(raw.coupon_product_value, fallback.coupon_product_value || 0)),
        unlock_reward: Math.max(0, toNumber(raw.unlock_reward, fallback.unlock_reward || 0)),
        allowed_product_ids: toArray(raw.allowed_product_ids).map((value) => pickString(value)).filter(Boolean),
        allowed_sku_ids: toArray(raw.allowed_sku_ids).map((value) => pickString(value)).filter(Boolean),
        exchange_title: pickString(raw.exchange_title || fallback.exchange_title)
    };
}

function normalizePeerBonusConfig(raw = {}) {
    const defaults = createDefaultPeerBonusConfig();
    const source = toObject(raw, {});
    return {
        ...defaults,
        ...source,
        enabled: source.enabled === undefined ? defaults.enabled : toBoolean(source.enabled),
        default_version: ['team', 'social'].includes(pickString(source.default_version).toLowerCase()) ? pickString(source.default_version).toLowerCase() : defaults.default_version,
        cooldown_days: Math.max(0, Math.floor(toNumber(source.cooldown_days, defaults.cooldown_days))),
        refund_dev_fee_pct: Math.max(0, toNumber(source.refund_dev_fee_pct, defaults.refund_dev_fee_pct)),
        social: {
            level_3: { pct: Math.max(0, toNumber(source.social?.level_3?.pct, defaults.social.level_3.pct)) },
            level_4: { pct: Math.max(0, toNumber(source.social?.level_4?.pct, defaults.social.level_4.pct)) },
            level_5: { pct: Math.max(0, toNumber(source.social?.level_5?.pct, defaults.social.level_5.pct)) }
        },
        team: {
            level_3: normalizePeerBonusLevelConfig(source.team?.level_3, defaults.team.level_3),
            level_4: normalizePeerBonusLevelConfig(source.team?.level_4, defaults.team.level_4),
            level_5: normalizePeerBonusLevelConfig(source.team?.level_5, defaults.team.level_5)
        }
    };
}

function buildExchangeMetaFromPeerBonus(peerBonus, bonusLevel) {
    const config = normalizePeerBonusConfig(peerBonus);
    const teamConfig = toObject(config.team?.[`level_${bonusLevel}`], {});
    const allowedProductIds = toArray(teamConfig.allowed_product_ids).map((value) => pickString(value)).filter(Boolean);
    const allowedSkuIds = toArray(teamConfig.allowed_sku_ids).map((value) => pickString(value)).filter(Boolean);
    const title = pickString(teamConfig.exchange_title || `平级奖兑换券（${toNumber(teamConfig.coupon_product_value, 0)}元产品）`);
    return {
        bonus_level: Math.max(0, toNumber(bonusLevel, 0)),
        allowed_product_ids: allowedProductIds,
        allowed_sku_ids: allowedSkuIds,
        coupon_product_value: Math.max(0, toNumber(teamConfig.coupon_product_value, 0)),
        unlock_reward: Math.max(0, toNumber(teamConfig.unlock_reward, 0)),
        title,
        bind_status: allowedProductIds.length || allowedSkuIds.length ? 'ready' : 'pending_bind'
    };
}

function normalizeAlertConfigPayload(input, current = {}) {
    const source = toObject(input, {});
    const next = {
        dingtalk: {
            enabled: toBoolean(source.dingtalk?.enabled ?? current.dingtalk?.enabled ?? false),
            webhook: pickString(source.dingtalk?.webhook ?? current.dingtalk?.webhook),
            secret: pickString(source.dingtalk?.secret ?? current.dingtalk?.secret)
        },
        wecom: {
            enabled: toBoolean(source.wecom?.enabled ?? current.wecom?.enabled ?? false),
            webhook: pickString(source.wecom?.webhook ?? current.wecom?.webhook)
        },
        email: {
            enabled: toBoolean(source.email?.enabled ?? current.email?.enabled ?? false),
            recipients: toArray(source.email?.recipients ?? current.email?.recipients).map((item) => pickString(item).trim()).filter(Boolean)
        }
    };
    const fieldErrors = [];

    if (next.dingtalk.enabled && next.dingtalk.webhook && !isValidHttpUrl(next.dingtalk.webhook)) {
        fieldErrors.push(buildFieldError('dingtalk.webhook', '钉钉 webhook 必须是有效的 http/https URL'));
    }
    if (next.wecom.enabled && next.wecom.webhook && !isValidHttpUrl(next.wecom.webhook)) {
        fieldErrors.push(buildFieldError('wecom.webhook', '企业微信 webhook 必须是有效的 http/https URL'));
    }
    if (next.email.enabled && next.email.recipients.some((item) => !item.includes('@'))) {
        fieldErrors.push(buildFieldError('email.recipients', '邮件接收人列表必须是有效邮箱地址数组'));
    }

    return { value: next, fieldErrors };
}

function normalizeFeatureTogglePayload(input, current = {}) {
    const source = toObject(input, {});
    const allowedKeys = Object.keys({
        ...toObject(getMiniProgramConfigSnapshot().feature_flags, {}),
        ...toObject(current, {})
    });
    const fieldErrors = [];
    const next = { ...current };

    const unknownKeys = Object.keys(source).filter((key) => !allowedKeys.includes(key));
    if (unknownKeys.length) {
        fieldErrors.push(buildFieldError('feature_toggles', `不支持的开关键：${unknownKeys.join(', ')}`, 'unknown_key'));
    }

    allowedKeys.forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(source, key)) {
            next[key] = toBoolean(source[key]);
        }
    });

    return { value: next, fieldErrors };
}

function normalizeStorageFolderInput(value) {
    const folder = pickString(value, 'materials')
        .trim()
        .replace(/^\/+/, '')
        .replace(/\/+$/, '');
    if (!folder) return '';
    if (!/^[a-zA-Z0-9/_-]{1,120}$/.test(folder)) return '';
    return folder;
}

function getMemberTierConfigSnapshot() {
    const fallback = getSingleton('member-tier-config', {});
    return {
        member_levels: getConfigRowValue('member_level_config', fallback.member_levels || []),
        growth_rules: getConfigRowValue('growth_rule_config', fallback.growth_rules || {}),
        growth_tiers: getConfigRowValue('growth_tier_config', fallback.growth_tiers || []),
        upgrade_rules: getConfigRowValue('member_upgrade_rule_config', getConfigRowValue('agent_system_upgrade_rules', fallback.upgrade_rules || {
            enabled: true,
            c1_min_purchase: 299,
            c2_referee_count: 2,
            c2_min_sales: 580,
            b1_referee_count: 10,
            b1_recharge: 3000,
            b2_referee_count: 10,
            b2_recharge: 30000,
            b3_referee_b2_count: 3,
            b3_referee_b1_count: 30,
            b3_recharge: 198000,
            effective_order_days: 7
        })),
        peer_bonus: normalizePeerBonusConfig(getConfigRowValue('agent_system_peer_bonus', getConfigRowValue('agent_system_peer-bonus', fallback.peer_bonus || {}))),
        point_levels: getConfigRowValue('point_level_config', fallback.point_levels || []),
        point_rules: getConfigRowValue('point_rule_config', fallback.point_rules || {})
    };
}

app.get('/admin/api/member-tier-config', auth, requirePermission('settings_manage'), (req, res) => ok(res, getMemberTierConfigSnapshot()));

app.put('/admin/api/member-tier-config', auth, requirePermission('settings_manage'), (req, res) => {
    const nextConfig = toObject(req.body, {});
    saveSingleton('member-tier-config', {
        member_levels: toArray(nextConfig.member_levels),
        growth_rules: toObject(nextConfig.growth_rules, {}),
        growth_tiers: toArray(nextConfig.growth_tiers),
        upgrade_rules: toObject(nextConfig.upgrade_rules, {}),
        peer_bonus: normalizePeerBonusConfig(nextConfig.peer_bonus),
        point_levels: toArray(nextConfig.point_levels),
        point_rules: toObject(nextConfig.point_rules, {})
    });
    upsertConfigRow('member_level_config', toArray(nextConfig.member_levels), {
        description: '会员/代理等级配置',
        is_public: true
    });
    upsertConfigRow('growth_rule_config', toObject(nextConfig.growth_rules, {}), {
        description: '成长值来源规则配置'
    });
    upsertConfigRow('growth_tier_config', toArray(nextConfig.growth_tiers), {
        description: '成长值折扣阶梯配置',
        is_public: true
    });
    upsertConfigRow('member_upgrade_rule_config', toObject(nextConfig.upgrade_rules, {}), {
        description: '会员升级门槛配置',
        is_public: true
    });
    upsertConfigRow('agent_system_peer_bonus', normalizePeerBonusConfig(nextConfig.peer_bonus), {
        description: '平级奖励与兑换券配置',
        is_public: true
    });
    upsertConfigRow('point_level_config', toArray(nextConfig.point_levels), {
        category: 'POINTS',
        group: 'POINTS',
        description: '积分中心等级特权配置',
        is_public: true
    });
    upsertConfigRow('point_rule_config', toObject(nextConfig.point_rules, {}), {
        category: 'POINTS',
        group: 'POINTS',
        description: '积分行为奖励规则'
    });
    createAuditLog(req.admin, 'member-tier-config.update', 'configs', {
        member_levels: toArray(nextConfig.member_levels).length,
        growth_tiers: toArray(nextConfig.growth_tiers).length
    });
    ok(res, getMemberTierConfigSnapshot());
});

app.post('/admin/api/member-tier-config/exchange-coupons/backfill', auth, requirePermission('settings_manage'), async (req, res) => {
    await ensureFreshCollections(['user_coupons']);
    const peerBonus = normalizePeerBonusConfig(getConfigRowValue('agent_system_peer_bonus', getConfigRowValue('agent_system_peer-bonus', {})));
    const rows = getCollection('user_coupons');
    let updated = 0;
    let pendingBind = 0;
    const nextRows = rows.map((row) => {
        if (pickString(row.coupon_type).toLowerCase() !== 'exchange') return row;
        if (pickString(row.source).toLowerCase() !== 'peer_bonus') return row;
        if (row.exchange_meta && typeof row.exchange_meta === 'object' && Object.keys(row.exchange_meta).length > 0) return row;
        const bonusLevel = Math.max(0, toNumber(row.bonus_role_level, 0));
        if (!bonusLevel) return row;
        const exchangeMeta = buildExchangeMetaFromPeerBonus(peerBonus, bonusLevel);
        if (exchangeMeta.bind_status !== 'ready') pendingBind += 1;
        updated += 1;
        return {
            ...row,
            exchange_meta: exchangeMeta,
            updated_at: nowIso()
        };
    });
    if (updated > 0) {
        saveCollection('user_coupons', nextRows);
        await Promise.resolve(dataStore.flush?.());
    }
    createAuditLog(req.admin, 'member-tier-config.exchange-coupons.backfill', 'user_coupons', { updated, pending_bind: pendingBind });
    ok(res, { updated, pending_bind: pendingBind });
});

app.get('/admin/api/alert-config', auth, requirePermission('settings_manage'), (req, res) => ok(res, getSingleton('alert-config', {
    dingtalk: { enabled: false, webhook: '', secret: '' },
    wecom: { enabled: false, webhook: '' },
    email: { enabled: false, recipients: [] }
})));

app.put('/admin/api/alert-config', auth, requirePermission('settings_manage'), (req, res) => {
    if (rejectUnknownBodyFields(res, req.body, ['dingtalk', 'wecom', 'email'], '告警配置参数不合法')) return;
    const normalized = normalizeAlertConfigPayload(req.body, getSingleton('alert-config', {}));
    if (normalized.fieldErrors.length) return failWithFieldErrors(res, normalized.fieldErrors, '告警配置参数不合法');
    saveSingleton('alert-config', normalized.value);
    ok(res, normalized.value);
});

app.post('/admin/api/alert-config/test', auth, requirePermission('settings_manage'), (req, res) => {
    if (rejectUnknownBodyFields(res, req.body, ['provider'], '告警测试参数不合法')) return;
    ok(res, {
        success: true,
        provider: req.body?.provider || 'unknown',
        tested_at: nowIso()
    });
});

app.get('/admin/api/feature-toggles', auth, requirePermission('settings_manage'), (req, res) => ok(res, getSingleton('feature-toggles', getMiniProgramConfigSnapshot().feature_flags || {})));

app.post('/admin/api/feature-toggles', auth, requirePermission('settings_manage'), (req, res) => {
    const normalized = normalizeFeatureTogglePayload(req.body, getSingleton('feature-toggles', {}));
    if (normalized.fieldErrors.length) return failWithFieldErrors(res, normalized.fieldErrors, '功能开关参数不合法');
    saveSingleton('feature-toggles', normalized.value);
    ok(res, normalized.value);
});

app.get('/admin/api/debug/process', auth, requirePermission('settings_manage'), (req, res) => ok(res, {
    pid: process.pid,
    uptime: process.uptime(),
    uptime_human: formatUptimeHuman(process.uptime()),
    node_version: process.version,
    memory: process.memoryUsage()
}));
app.get('/admin/api/debug/anomalies', auth, requirePermission('settings_manage'), (req, res) => {
    const orders = getCollection('orders');
    const longPendingOrders = orders.filter((item) => pickString(item.status) === 'pending_payment').length;
    const recentPayments = orders.filter((item) => isPaidLikeOrder(item)).length;
    const issues = [];
    if (longPendingOrders > 10) issues.push(`存在 ${longPendingOrders} 单超时未支付订单`);
    ok(res, {
        status: issues.length ? 'warning' : 'normal',
        issues,
        stats: {
            long_pending_orders: longPendingOrders,
            recent_payments: recentPayments,
            recent_pay_rate_percent: recentPayments > 0 ? 100 : 0
        }
    });
});
app.get('/admin/api/debug/db-ping', auth, requirePermission('settings_manage'), async (req, res) => {
    const probe = await probeDataStore({ collection: pickString(req.query.collection, 'admins') || 'admins', forceReload: true });
    ok(res, {
        status: resolveOperationalStatus(probe),
        mode: probe.mode,
        latency_ms: probe.latency_ms,
        probe_error: probe.error || '',
        checked_at: probe.checked_at
    });
});
app.get('/admin/api/debug/data-source', auth, requirePermission('settings_manage'), async (req, res) => {
    const probe = await probeDataStore({ collection: pickString(req.query.collection, 'admins') || 'admins', forceReload: false });
    ok(res, { descriptor: dataStore.describe(), health: dataStore.health(), probe, checked_at: nowIso() });
});
app.get('/admin/api/debug/order-chain', auth, requirePermission('settings_manage'), async (req, res) => {
    const lookup = pickString(req.query.order_id || req.query.id || req.query.order_no).trim();
    if (!lookup) return fail(res, '请提供订单 ID 或订单号');
    const readMeta = await freshReadMeta(req, STRONG_CONSISTENCY_COLLECTIONS.orders, true);
    const users = getCollection('users');
    const products = getCollection('products');
    const commissions = getCollection('commissions');
    const refunds = getCollection('refunds');
    const order = findByLookup(getCollection('orders'), lookup, (row) => [row.order_no]);
    if (!order) return fail(res, '订单不存在', 404);
    okStrongRead(res, buildOrderAuditSnapshot(order, users, products, commissions, refunds), readMeta.freshness);
});
app.get('/admin/api/debug/user-chain', auth, requirePermission('settings_manage'), async (req, res) => {
    const lookup = pickString(req.query.user_id || req.query.id || req.query.openid || req.query.member_no).trim();
    if (!lookup) return fail(res, '请提供用户 ID / OPENID / 会员码');
    const readMeta = await freshReadMeta(req, STRONG_CONSISTENCY_COLLECTIONS.users, true);
    const users = getCollection('users');
    const orders = getCollection('orders');
    const commissions = getCollection('commissions');
    const user = findUserByAnyId(users, lookup);
    if (!user) return fail(res, '用户不存在', 404);
    okStrongRead(res, buildUserAuditSnapshot(user, users, orders, commissions), readMeta.freshness);
});
app.get('/admin/api/debug/config-source', auth, requirePermission('settings_manage'), async (req, res) => {
    const key = pickString(req.query.key).trim();
    if (!key) return fail(res, '请提供配置 key');
    const readMeta = await freshReadMeta(req, ['configs', 'app_configs', 'admin_singletons'], true);
    okStrongRead(res, buildConfigSourceReport(key), readMeta.freshness);
});
app.get('/admin/api/debug/cron-status', auth, requirePermission('settings_manage'), async (req, res) => {
    const probe = await probeDataStore({ collection: pickString(req.query.collection, 'admins') || 'admins', forceReload: false });
    ok(res, buildCronRuntimeStatus(probe));
});
app.get('/admin/api/debug/logs', auth, requirePermission('settings_manage'), (req, res) => {
    const lines = sortByUpdatedDesc(getCollection('admin_audit_logs'))
        .slice(0, toNumber(req.query.lines, 100))
        .map((item) => `[${item.created_at || nowIso()}] ${item.admin_name || 'system'} ${item.action} ${item.target}`);
    ok(res, {
        lines,
        note: '当前日志来源为管理端操作审计，尚未接入外部日志服务'
    });
});

app.get('/admin/api/popup-ad-config', auth, requirePermission('content'), async (req, res) => ok(res, configContract.normalizePopupAdConfig(await normalizePopupAdConfigAsync(getSingleton('popup-ad-config', {
    enabled: false,
    title: '',
    file_id: '',
    image_url: '',
    link_type: '',
    link_value: ''
})))));

app.put('/admin/api/popup-ad-config', auth, requirePermission('content'), async (req, res) => {
    const nextConfig = configContract.normalizePopupAdConfig(await normalizePopupAdConfigAsync({ ...getSingleton('popup-ad-config', {}), ...toObject(req.body, {}) }));
    saveSingleton('popup-ad-config', nextConfig);
    ok(res, nextConfig);
});

// Storage migration: move legacy local /uploads and remote COS/http materials to CloudBase storage
app.get('/admin/api/storage/migrate/preview', auth, requirePermission('materials'), async (req, res) => {
    try {
        const rows = getCollection('materials');
        const needMigrate = rows
            .map((item) => ({ item, source: getMaterialMigrationSource(item) }))
            .filter((entry) => entry.source);
        const by_source = needMigrate.reduce((acc, entry) => {
            acc[entry.source.kind] = (acc[entry.source.kind] || 0) + 1;
            return acc;
        }, {});
        ok(res, {
            total: rows.length,
            need_migrate: needMigrate.length,
            by_source,
            sample: needMigrate.slice(0, 10).map(({ item, source }) => ({
                id: item.id || item._legacy_id || item._id,
                title: item.title || item.name || '',
                source: source.kind,
                url: source.value
            }))
        });
    } catch (error) {
        fail(res, error.message || '预览失败', 500);
    }
});

app.post('/admin/api/storage/migrate', auth, requirePermission('materials'), async (req, res) => {
    const limit = Math.max(1, Math.min(50, toNumber(req.body?.limit, 10)));
    let success = 0;
    let failed = 0;
    const details = [];
    try {
        const rows = getCollection('materials');
        const candidates = rows
            .map((item) => ({ item, source: getMaterialMigrationSource(item) }))
            .filter((entry) => entry.source)
            .slice(0, limit);
        for (const { item, source } of candidates) {
            const sourceValue = source.value;
            try {
                const migrated = await migrateMaterialAsset(item);
                const uploaded = migrated?.uploaded;
                if (!uploaded?.file_id) {
                    failed += 1;
                    details.push({ id: item.id, title: item.title, source: source.kind, url: sourceValue, error: '上传失败' });
                    continue;
                }
                const updated = {
                    ...item,
                    file_id: uploaded.file_id,
                    url: uploaded.file_id,
                    image_url: uploaded.file_id,
                    temp_url: uploaded.url,
                    updated_at: nowIso()
                };
                const index = rows.findIndex((row) => Number(row.id || row._legacy_id || row._id) === Number(item.id || item._legacy_id || item._id));
                if (index >= 0) rows[index] = updated;
                success += 1;
                details.push({
                    id: item.id || item._legacy_id || item._id,
                    title: item.title || item.name || '',
                    source: source.kind,
                    from: sourceValue,
                    to: uploaded.file_id
                });
            } catch (error) {
                failed += 1;
                details.push({
                    id: item.id || item._legacy_id || item._id,
                    title: item.title || item.name || '',
                    source: source.kind,
                    url: sourceValue,
                    error: error.message || '未知错误'
                });
            }
        }
        if (success > 0) {
            saveCollection('materials', rows);
            await Promise.resolve(dataStore.flush?.());
        }
        ok(res, {
            success: true,
            requested_limit: limit,
            processed: candidates.length,
            migrated: success,
            failed,
            remaining_estimate: Math.max(rows.filter((item) => getMaterialMigrationSource(item)).length - success, 0),
            details
        });
    } catch (error) {
        fail(res, error.message || '迁移失败', 500);
    }
});

app.use((req, res) => fail(res, `未实现的接口：${req.method} ${req.path}`, 404));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
    console.error(`[admin-api] Unhandled error on ${req.method} ${req.path}:`, err);
    if (!res.headersSent) {
        fail(res, err.message || '服务器内部错误', 500);
    }
});

app.locals.dataStore = dataStore;

module.exports = app;
