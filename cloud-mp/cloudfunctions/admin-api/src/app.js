const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const https = require('https');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const { dataRoot, normalizedDataRoot, runtimeRoot, uploadsRoot, jwtSecret, assetBaseUrl, preferNormalizedData } = require('./config');
const { createDataStore } = require('./store');
const { registerMarketingRoutes } = require('./admin-marketing');

const app = express();
const dataStore = createDataStore();
let cachedManagedCloud = undefined;

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

function nextId(rows) {
    return rows.reduce((max, row) => {
        const numericId = Number(primaryId(row));
        return Number.isFinite(numericId) ? Math.max(max, numericId) : max;
    }, 0) + 1;
}

function nowIso() {
    return new Date().toISOString();
}

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

async function normalizeBannerRecordAsync(banner) {
    const fileId = banner.file_id || '';
    const imageUrl = await resolveAssetValue(banner.image_url || banner.url || banner.image || banner.cover_image || fileId);
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
    const imageUrl = await resolveAssetValue(config.image_url || config.url || fileId);
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
    const fileId = item.file_id || '';
    const url = await resolveAssetValue(item.url || item.temp_url || fileId);
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
        created_at: nowIso()
    });
    saveCollection('admin_audit_logs', rows);
}

function auth(req, res, next) {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) return res.status(401).json({ code: 401, message: '未提供认证令牌' });
    try {
        const payload = jwt.verify(header.slice(7), jwtSecret);
        const admin = getCollection('admins').find((item) =>
            (Number(item.id || item._legacy_id) === Number(payload.id)) && toBoolean(item.status)
        );
        if (!admin) return res.status(401).json({ code: 401, message: '管理员不存在或已禁用' });
        req.admin = admin;
        req.permissions = normalizePermissions(admin);
        next();
    } catch (_) {
        return res.status(401).json({ code: 401, message: '登录已过期，请重新登录' });
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

function ok(res, data) {
    res.json({ code: 0, data });
}

function fail(res, message, status = 400) {
    res.status(status).json({ code: status, message });
}

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
    const category = categories.find((item) => Number(item.id || item._legacy_id || item._id) === Number(product.category_id)) || null;
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
    const imageUrl = assetUrl(banner.image_url || banner.url || banner.image || banner.cover_image || fileId);
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
    const imageUrl = assetUrl(config.image_url || config.url || fileId);
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
    return {
        brand_config: {
            brand_name: '问兰',
            share_title: '问兰 · 品牌甄选',
            customer_service_wechat: 'wl_service',
            customer_service_hours: '9:00-21:00',
            nav_brand_title: '问兰镜像',
            nav_brand_sub: '品牌甄选',
            about_summary: '品牌甄选，值得信赖。',
            activity_share_title: '问兰 · 当季品牌活动进行中',
            logistics_page_title: '物流跟踪',
            tab_bar: {
                color: '#64748B',
                selectedColor: '#C6A16E',
                backgroundColor: '#F8FCFD',
                borderStyle: 'white',
                items: [
                    { index: 0, text: '商城首页' },
                    { index: 1, text: '全部商品' },
                    { index: 2, text: '热门活动' },
                    { index: 3, text: '我的会员' }
                ]
            }
        },
        feature_flags: {
            show_station_entry: false,
            show_pickup_entry: false,
            enable_logistics_entry: true,
            enable_lottery_entry: false
        },
        activity_page_config: {
            permanent_section_title: '常驻活动',
            permanent_section_desc: '长期可参与，随时进入',
            limited_section_title: '限时活动',
            limited_section_desc: '抓紧时间，过期即止',
            pending_toast: '活动筹备中'
        },
        lottery_config: {
            hero_title: '把积分换成一点仪式感',
            hero_subtitle: '奖池支持后台配置 emoji、配色和标签，小奖池也能做出活动感。',
            result_win_title: '恭喜，手气不错',
            result_miss_title: '这次差一点点'
        },
        membership_config: {
            login_agreement_hint: '登录后查看订单、积分、佣金等信息'
        },
        logistics_config: {
            shipping_mode: 'third_party',
            shipping_tracking_no_required: true,
            shipping_company_name_required: false
        },
        customer_service_channel: {
            channel_service_phone: '',
            product_service_phone: '',
            qr_code_url: ''
        },
        withdrawal_config: {
            fee_rate_percent: 0,
            fee_cap_max: 0
        },
        light_prompt_modals: {
            coupon_usage: {
                enabled: true,
                title: '优惠券说明',
                body: '在结算页「礼遇与优惠」中选择可用券。'
            }
        },
        product_detail_pledges: { items: {} }
    };
}

function getMiniProgramConfigSnapshot() {
    const appConfigs = getCollection('app_configs');
    const fromConfigRow = appConfigs.find((item) => item.config_key === 'mini_program_config');
    const fallback = fromConfigRow && typeof fromConfigRow.config_value === 'object'
        ? fromConfigRow.config_value
        : getMiniProgramDefault();
    return getSingleton('mini-program-config', fallback);
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
    if (status === 'pending') return 'pending_pay';
    if (status === 'pending_ship') return 'pending_ship';
    if (['paid', 'agent_confirmed', 'shipping_requested'].includes(status)) return 'pending_ship';
    if (status === 'shipped') return 'pending_receive';
    if (status === 'completed') return 'completed';
    if (['cancelled', 'refunded'].includes(status)) return 'closed';
    return 'all';
}

function buildOrderRecord(order, users, products, commissions) {
    const orderId = Number(order.id || order._legacy_id || order._id || 0);
    const buyer = findUserByAnyId(users, order.openid)
        || findUserByAnyId(users, order.buyer_id)
        || findUserByAnyId(users, order.user_id)
        || null;
    const orderItems = toArray(order.items);
    const primaryItem = orderItems[0] || null;
    const product = findByLookup(products, order.product_id ?? primaryItem?.product_id) || null;
    const orderCommissions = commissions.filter((item) => Number(item.order_id) === orderId);
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
    const paymentMethodRaw = pickString(order.payment_method || order.pay_type || order.pay_channel || order.payment_channel).trim().toLowerCase();
    const paymentMethod = ['wechat', 'wx', 'jsapi', 'miniapp', 'wechatpay', 'weixin'].includes(paymentMethodRaw)
        ? 'wechat'
        : (['wallet', 'balance', 'credit', 'debt'].includes(paymentMethodRaw) ? 'wallet' : paymentMethodRaw);
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
        role_level: toNumber(buyer.role_level ?? buyer.distributor_level, 0),
        parent_id: getUserParentRef(buyer)
    } : null;
    const normalizedProduct = {
        ...(product || {}),
        id: product ? primaryId(product) : (primaryItem?.product_id || order.product_id || ''),
        name: pickString(product?.name || primaryItem?.snapshot_name || order.product_name || '未命名商品'),
        images: (productImages.length ? productImages : [assetUrl(primaryItem?.snapshot_image || '')]).filter(Boolean)
    };
    return {
        ...order,
        id: orderId || order.id || order._legacy_id || order._id,
        buyer: normalizedBuyer,
        product: normalizedProduct,
        items: normalizedItems,
        qty: totalQty,
        quantity: totalQty,
        sku: {
            spec_name: '规格',
            spec_value: pickString(primaryItem?.snapshot_spec || order.sku?.spec_value || '')
        },
        actual_price: toNumber(order.actual_price ?? order.pay_amount ?? order.total_amount, 0),
        payment_method: paymentMethod,
        address: parseAddressSnapshot(order.address_snapshot),
        address_snapshot: parseAddressSnapshot(order.address_snapshot),
        commissions: orderCommissions
    };
}

function patchOrder(id, patcher) {
    const rows = getCollection('orders');
    const index = rows.findIndex((item) => Number(item.id) === Number(id));
    if (index === -1) return null;
    rows[index] = patcher(rows[index]);
    saveCollection('orders', rows);
    return rows[index];
}

function primaryId(row) {
    return row?.id ?? row?._legacy_id ?? row?._id ?? null;
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
    return pickString(user?.nickname || user?.nickName || user?.name || '微信用户');
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

function getUserStatus(user) {
    if (user?.status == null || user?.status === '') return 1;
    return toBoolean(user.status) ? 1 : 0;
}

function findUserByAnyId(users, value) {
    return findByLookup(users, value, (user) => [user?.openid, user?.phone, user?.member_no, user?.my_invite_code]);
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
    return ['paid', 'pending_ship', 'agent_confirmed', 'shipping_requested', 'shipped', 'completed', 'refunded'].includes(order?.status);
}

function getOrderAmount(order) {
    return toNumber(order?.actual_price ?? order?.pay_amount ?? order?.total_amount, 0);
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
    return {
        id: primaryId(user),
        nickname: getUserNickname(user),
        avatar_url: getUserAvatar(user),
        openid: pickString(user.openid)
    };
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
        rowLookupTokens(user, [user?.openid, user?.phone, user?.member_no, user?.my_invite_code]).forEach((token) => registerToken(token, user));
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
            my_invite_code: value
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
    const userId = String(primaryId(user));
    const orderStat = context.orderStats.get(userId) || { order_count: 0, total_sales: 0 };
    const parent = context.graph.getParent(user);
    const refereeCount = context.directChildCount.get(userId) || 0;

    return {
        ...user,
        id: primaryId(user),
        nickname: getUserNickname(user),
        avatar_url: getUserAvatar(user),
        openid: pickString(user.openid),
        phone: pickString(user.phone),
        member_no: pickString(user.member_no || user.my_invite_code || user.invite_code),
        invite_code: pickString(user.my_invite_code || user.invite_code || user.member_no),
        role_level: toNumber(user.role_level ?? user.distributor_level, 0),
        purchase_level_code: pickString(user.purchase_level_code || user.purchase_level || ''),
        balance: toNumber(user.balance ?? user.wallet_balance, 0),
        total_sales: orderStat.total_sales,
        referee_count: refereeCount,
        growth_value: toNumber(user.growth_value ?? user.points ?? 0, 0),
        status: getUserStatus(user),
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

function buildUserRecord(user, users, orders, commissions) {
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
        ...user,
        id: primaryId(user),
        nickname: getUserNickname(user),
        avatar_url: getUserAvatar(user),
        openid: pickString(user.openid),
        phone: pickString(user.phone),
        member_no: pickString(user.member_no || user.my_invite_code || user.invite_code),
        invite_code: pickString(user.my_invite_code || user.invite_code || user.member_no),
        role_level: toNumber(user.role_level ?? user.distributor_level, 0),
        purchase_level_code: pickString(user.purchase_level_code || user.purchase_level || ''),
        balance: toNumber(user.balance ?? user.wallet_balance, 0),
        total_sales: paidOrders.reduce((sum, item) => sum + getOrderAmount(item), 0),
        referee_count: directChildren.length,
        growth_value: toNumber(user.growth_value ?? user.points ?? 0, 0),
        status: getUserStatus(user),
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
        reject_reason: pickString(user.dealer_reject_reason)
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
        type_commission_rate: { school: 0.01, area: 0.015, city: 0.02, province: 0.03 },
        pickup_station_subsidy_enabled: false,
        pickup_station_subsidy_amount: 0,
        pickup_tiers: {
            A: { rate: 0, fixed_yuan: 2 },
            B: { rate: 0.005, fixed_yuan: 1 },
            C: { rate: 0.01, fixed_yuan: 0 },
            D: { rate: 0.015, fixed_yuan: 1 }
        }
    };
}

function normalizeBranchAgentPolicySnapshot(rawPolicy) {
    const defaults = createDefaultBranchAgentPolicy();
    const policy = toObject(rawPolicy, {});
    const typeCommissionRate = toObject(policy.type_commission_rate, {});
    const pickupTiers = toObject(policy.pickup_tiers, {});
    const normalizeRate = (value, fallback) => Math.min(1, Math.max(0, toNumber(value, fallback)));
    const normalizeMoney = (value, fallback) => Math.max(0, toNumber(value, fallback));
    const normalizedPickupTiers = {};
    for (const tierKey of Object.keys(defaults.pickup_tiers)) {
        const tierDefaults = defaults.pickup_tiers[tierKey];
        const tierPayload = toObject(pickupTiers[tierKey], {});
        normalizedPickupTiers[tierKey] = {
            rate: normalizeRate(tierPayload.rate, tierDefaults.rate),
            fixed_yuan: normalizeMoney(tierPayload.fixed_yuan, tierDefaults.fixed_yuan)
        };
    }
    return {
        enabled: toBoolean(policy.enabled),
        min_apply_role_level: Math.max(0, Math.floor(toNumber(policy.min_apply_role_level, defaults.min_apply_role_level))),
        type_commission_rate: {
            school: normalizeRate(typeCommissionRate.school, defaults.type_commission_rate.school),
            area: normalizeRate(typeCommissionRate.area, defaults.type_commission_rate.area),
            city: normalizeRate(typeCommissionRate.city, defaults.type_commission_rate.city),
            province: normalizeRate(typeCommissionRate.province, defaults.type_commission_rate.province)
        },
        pickup_station_subsidy_enabled: toBoolean(policy.pickup_station_subsidy_enabled),
        pickup_station_subsidy_amount: normalizeMoney(policy.pickup_station_subsidy_amount, defaults.pickup_station_subsidy_amount),
        pickup_tiers: normalizedPickupTiers
    };
}

function getBranchAgentPolicySnapshot() {
    return normalizeBranchAgentPolicySnapshot(getSingleton('branch-agent-policy', createDefaultBranchAgentPolicy()));
}

function getBranchAgentStationsSnapshot() {
    const rows = getCollection('branch_agent_stations');
    if (rows.length) return rows;
    return sortByUpdatedDesc(getCollection('pickup_stations')).map((row) => ({
        id: primaryId(row),
        name: pickString(row.name || row.station_name || row.title),
        branch_type: pickString(row.branch_type || row.type || 'city'),
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
        updated_at: pickString(row.updated_at || row.created_at)
    }));
}

function buildBranchAgentStationRecord(station, users) {
    const claimant = findUserByAnyId(users, station.claimant_id || station.openid || station.user_id);
    return {
        ...station,
        id: primaryId(station),
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
        }
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

function buildRefundRecord(refund, users, orders, products, skus) {
    const order = findByLookup(orders, refund.order_id || refund.order_no, (row) => [row.order_no]);
    const items = order ? toArray(order.items).map((item) => buildOrderItemSnapshot(item, products, skus)) : [];
    const user = findUserByAnyId(users, refund.openid || refund.user_id || order?.openid || order?.buyer_id);
    const firstItem = items[0] || null;
    return {
        ...refund,
        id: primaryId(refund),
        amount: toNumber(refund.amount, 0),
        status: pickString(refund.status || 'pending'),
        reason: pickString(refund.reason),
        images: toArray(refund.images).map(assetUrl),
        user_id: primaryId(user) || refund.user_id || refund.openid || null,
        user: buildUserTiny(user),
        order: order ? {
            id: primaryId(order),
            order_no: pickString(order.order_no),
            product: firstItem?.product || null
        } : {
            id: refund.order_id || null,
            order_no: pickString(refund.order_no)
        },
        items,
        order_item: firstItem,
        reject_reason: pickString(refund.reject_reason),
        return_company: pickString(refund.return_company),
        return_tracking_no: pickString(refund.return_tracking_no)
    };
}

function buildCommissionRecord(commission, users, orders) {
    const order = findByLookup(orders, commission.order_id || commission.order_no, (row) => [row.order_no]);
    const user = findUserByAnyId(users, commission.openid || commission.user_id || commission.receiver_openid || commission.beneficiary_openid || order?.openid || order?.buyer_id);
    return {
        ...commission,
        id: primaryId(commission),
        amount: toNumber(commission.amount, 0),
        level: toNumber(commission.level || commission.commission_level, 1),
        status: pickString(commission.status || 'pending_approval'),
        user_id: primaryId(user) || commission.user_id || commission.openid || null,
        user: buildUserTiny(user),
        order: order ? {
            id: primaryId(order),
            order_no: pickString(order.order_no)
        } : {
            id: commission.order_id || null,
            order_no: pickString(commission.order_no)
        }
    };
}

function commissionStats(rows) {
    return rows.reduce((stats, row) => {
        const amount = toNumber(row.amount, 0);
        if (row.status === 'frozen') stats.totalFrozen += amount;
        else if (row.status === 'pending_approval') stats.totalPendingApproval += amount;
        else if (row.status === 'approved') stats.totalApproved += amount;
        else if (['settled', 'completed'].includes(row.status)) stats.totalSettled += amount;
        return stats;
    }, {
        totalFrozen: 0,
        totalPendingApproval: 0,
        totalApproved: 0,
        totalSettled: 0
    });
}

function commissionOwnerRef(row) {
    return row.openid || row.user_id || row.receiver_openid || row.beneficiary_openid || null;
}

function applyUserMoneyChange(users, userRef, amount, options = {}) {
    const index = users.findIndex((user) => rowMatchesLookup(user, userRef, [user.openid, user.member_no]));
    if (index === -1) return null;
    const user = users[index];
    const currentBalance = toNumber(user.wallet_balance ?? user.balance, 0);
    const currentDebt = toNumber(user.debt_amount, 0);

    if (amount >= 0) {
        const debtOffset = Math.min(currentDebt, amount);
        const credited = amount - debtOffset;
        users[index] = {
            ...user,
            wallet_balance: currentBalance + credited,
            balance: currentBalance + credited,
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
        wallet_balance: currentBalance - paidFromBalance,
        balance: currentBalance - paidFromBalance,
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
    if (!['pending_approval', 'approved', 'pending'].includes(row.status)) {
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

function restoreOrderStockForRefund(orderId) {
    const orders = getCollection('orders');
    const orderIndex = orders.findIndex((order) => rowMatchesLookup(order, orderId, [order.order_no]));
    if (orderIndex === -1) return { restored: 0 };
    const order = orders[orderIndex];
    if (!order.stock_deducted_at || order.refund_stock_restored_at) return { restored: 0 };

    const products = getCollection('products');
    const skus = getCollection('skus');
    let restored = 0;
    toArray(order.items).forEach((item) => {
        const qty = Math.max(1, toNumber(item.qty ?? item.quantity, 1));
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

    orders[orderIndex] = {
        ...order,
        refund_stock_restored_at: nowIso(),
        updated_at: nowIso()
    };
    saveCollection('products', products);
    saveCollection('skus', skus);
    saveCollection('orders', orders);
    return { restored };
}

ensureDir(runtimeRoot);
ensureDir(uploadsRoot);
ensureDir(path.join(runtimeRoot, 'overrides'));

app.use(cors());
const jsonParser = express.json({ limit: '10mb' });
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
        req.body = JSON.parse(rawBody);
    } catch (_) {
        req.body = rawBody;
    }
    return next();
});
app.use('/uploads', express.static(uploadsRoot));

const upload = multer({ dest: uploadsRoot });
const uploadSingle = (req, res, next) => {
    if (req.event) {
        return next();
    }
    return upload.single('file')(req, res, next);
};

app.get('/health', (req, res) => {
    const descriptor = dataStore.describe();
    const health = dataStore.health();
    ok(res, {
        status: 'ok',
        runtime: 'cloudrun-admin-service',
        data_root: dataRoot,
        normalized_data_root: normalizedDataRoot,
        runtime_root: runtimeRoot,
        data_source: {
            source: descriptor.source,
            collection_source: descriptor.collection_source,
            singleton_source: descriptor.singleton_source
        },
        data_source_health: {
            status: health.status,
            mode: health.mode,
            ready: health.ready,
            mapped_collections: health.mapped_collections,
            dirty_collections: health.dirty_collections,
            warnings_count: Array.isArray(health.warnings) ? health.warnings.length : 0
        },
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

app.get('/admin/api/products', auth, requirePermission('products'), (req, res) => {
    const products = getCollection('products');
    const categories = getCollection('categories');
    const skus = getCollection('skus');
    const reviews = getCollection('reviews');
    let rows = sortByUpdatedDesc(products).map((item) => productWithRelations({
        ...item,
        images: toArray(item.images).map(assetUrl),
        detail_images: toArray(item.detail_images).map(assetUrl)
    }, categories, skus, reviews));

    const keyword = pickString(req.query.keyword).trim().toLowerCase();
    if (keyword) rows = rows.filter((item) => `${item.name} ${item.description || ''}`.toLowerCase().includes(keyword));
    if (req.query.category_id) rows = rows.filter((item) => Number(item.category_id) === Number(req.query.category_id));
    if (req.query.status !== undefined && req.query.status !== '') rows = rows.filter((item) => Number(item.status) === Number(req.query.status));

    ok(res, paginate(rows, req));
});

app.get('/admin/api/products/:id', auth, requirePermission('products'), (req, res) => {
    const products = getCollection('products');
    const product = products.find((item) => Number(item.id || item._legacy_id || item._id) === Number(req.params.id));
    if (!product) return fail(res, '商品不存在', 404);
    ok(res, {
        ...product,
        id: product.id || product._legacy_id || product._id,
        images: toArray(product.images).map(assetUrl),
        detail_images: toArray(product.detail_images).map(assetUrl)
    });
});

app.post('/admin/api/products', auth, requirePermission('products'), (req, res) => {
    const rows = getCollection('products');
    const row = {
        id: nextId(rows),
        ...req.body,
        category_id: req.body?.category_id != null ? toNumber(req.body.category_id, 0) : null,
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
    createAuditLog(req.admin, 'product.create', 'products', { product_id: row.id, name: row.name });
    ok(res, row);
});

app.put('/admin/api/products/:id', auth, requirePermission('products'), (req, res) => {
    const rows = getCollection('products');
    const index = rows.findIndex((item) => Number(item.id) === Number(req.params.id));
    if (index === -1) return fail(res, '商品不存在', 404);
    rows[index] = {
        ...rows[index],
        ...req.body,
        category_id: req.body?.category_id != null ? toNumber(req.body.category_id, 0) : rows[index].category_id,
        retail_price: req.body?.retail_price != null ? toNumber(req.body.retail_price, 0) : rows[index].retail_price,
        market_price: req.body?.market_price != null ? toNumber(req.body.market_price, 0) : rows[index].market_price,
        cost_price: req.body?.cost_price != null ? toNumber(req.body.cost_price, 0) : rows[index].cost_price,
        stock: req.body?.stock != null ? toNumber(req.body.stock, 0) : rows[index].stock,
        status: req.body?.status != null ? (toBoolean(req.body.status) ? 1 : 0) : rows[index].status,
        images: req.body?.images != null ? toArray(req.body.images) : rows[index].images,
        detail_images: req.body?.detail_images != null ? toArray(req.body.detail_images) : rows[index].detail_images,
        updated_at: nowIso()
    };
    saveCollection('products', rows);
    createAuditLog(req.admin, 'product.update', 'products', { product_id: rows[index].id });
    ok(res, rows[index]);
});

function updateProductStatus(req, res) {
    const nextStatus = toBoolean(req.body?.status ?? req.body?.is_active ?? req.body?.enabled ?? req.body?.value) ? 1 : 0;
    const row = patchCollectionRow('products', req.params.id, (item) => ({
        ...item,
        status: nextStatus,
        is_active: nextStatus,
        updated_at: nowIso()
    }));
    if (!row) return fail(res, '商品不存在', 404);
    ok(res, row);
}

app.put('/admin/api/products/:id/status', auth, requirePermission('products'), updateProductStatus);
app.post('/admin/api/products/:id/status', auth, requirePermission('products'), updateProductStatus);
app.put('/admin/api/products/:id/toggle', auth, requirePermission('products'), updateProductStatus);
app.post('/admin/api/products/:id/toggle', auth, requirePermission('products'), updateProductStatus);

app.delete('/admin/api/products/:id', auth, requirePermission('products'), (req, res) => {
    const rows = getCollection('products');
    const nextRows = rows.filter((item) => Number(item.id) !== Number(req.params.id));
    if (rows.length === nextRows.length) return fail(res, '商品不存在', 404);
    saveCollection('products', nextRows);
    createAuditLog(req.admin, 'product.delete', 'products', { product_id: Number(req.params.id) });
    ok(res, { success: true });
});

registerMarketingRoutes(app, {
    auth,
    requirePermission,
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

app.get('/admin/api/categories', auth, requirePermission('products'), (req, res) => {
    const products = getCollection('products');
    const rows = sortByUpdatedDesc(getCollection('categories')).map((item) => ({
        ...item,
        status: toBoolean(item.status) ? 1 : 0,
        product_count: products.filter((product) => Number(product.category_id) === Number(item.id)).length
    }));
    ok(res, { list: rows, total: rows.length });
});

app.post('/admin/api/categories', auth, requirePermission('products'), (req, res) => {
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
    ok(res, row);
});

app.put('/admin/api/categories/:id', auth, requirePermission('products'), (req, res) => {
    const rows = getCollection('categories');
    const index = rows.findIndex((item) => Number(item.id) === Number(req.params.id));
    if (index === -1) return fail(res, '分类不存在', 404);
    rows[index] = { ...rows[index], ...req.body, updated_at: nowIso() };
    saveCollection('categories', rows);
    ok(res, rows[index]);
});

app.delete('/admin/api/categories/:id', auth, requirePermission('products'), (req, res) => {
    const products = getCollection('products');
    if (products.some((item) => Number(item.category_id) === Number(req.params.id))) {
        return fail(res, '该分类下仍有关联商品，无法删除');
    }
    const rows = getCollection('categories');
    const nextRows = rows.filter((item) => Number(item.id) !== Number(req.params.id));
    if (rows.length === nextRows.length) return fail(res, '分类不存在', 404);
    saveCollection('categories', nextRows);
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
    const nextConfig = {
        provider: 'cloudbase',
        bucket: '',
        folder: pickString(requestConfig.folder, 'materials') || 'materials',
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

app.get('/admin/api/logs', auth, (req, res) => ok(res, paginate(sortByUpdatedDesc(getCollection('admin_audit_logs')), req)));

app.get('/admin/api/logs/export', auth, (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=\"admin-logs.json\"');
    res.send(JSON.stringify(getCollection('admin_audit_logs'), null, 2));
});

app.get('/admin/api/reviews', auth, (req, res) => {
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

app.put('/admin/api/reviews/:id', auth, (req, res) => updateReviewRow(req, res, () => ({ ...toObject(req.body, {}) })));
app.post('/admin/api/reviews/:id', auth, (req, res) => updateReviewRow(req, res, () => ({ ...toObject(req.body, {}) })));
app.put('/admin/api/reviews/:id/status', auth, (req, res) => updateReviewRow(req, res, () => ({ status: toBoolean(req.body?.status ?? req.body?.visible ?? req.body?.enabled ?? 1) ? 1 : 0 })));
app.post('/admin/api/reviews/:id/status', auth, (req, res) => updateReviewRow(req, res, () => ({ status: toBoolean(req.body?.status ?? req.body?.visible ?? req.body?.enabled ?? 1) ? 1 : 0 })));
app.put('/admin/api/reviews/:id/featured', auth, (req, res) => updateReviewRow(req, res, () => ({ is_featured: toBoolean(req.body?.is_featured ?? req.body?.featured ?? req.body?.value ?? 1) ? 1 : 0 })));
app.post('/admin/api/reviews/:id/featured', auth, (req, res) => updateReviewRow(req, res, () => ({ is_featured: toBoolean(req.body?.is_featured ?? req.body?.featured ?? req.body?.value ?? 1) ? 1 : 0 })));
app.put('/admin/api/reviews/:id/reply', auth, (req, res) => updateReviewRow(req, res, () => ({ reply_content: pickString(req.body?.reply_content ?? req.body?.reply ?? req.body?.content) })));
app.post('/admin/api/reviews/:id/reply', auth, (req, res) => updateReviewRow(req, res, () => ({ reply_content: pickString(req.body?.reply_content ?? req.body?.reply ?? req.body?.content) })));

app.get('/admin/api/home-sections', auth, requirePermission('content'), (req, res) => {
    const rows = sortByUpdatedDesc(getCollection('content_boards'));
    ok(res, { list: rows, total: rows.length });
});

app.get('/admin/api/home-sections/schemas', auth, requirePermission('content'), (req, res) => ok(res, [
    { key: 'hero', label: '顶部 Hero', fields: ['title', 'subtitle', 'file_id', 'image_url'] },
    { key: 'product_board', label: '商品板块', fields: ['board_key', 'board_name'] }
]));

app.post('/admin/api/home-sections', auth, requirePermission('content'), (req, res) => ok(res, req.body || {}));
app.put('/admin/api/home-sections/:id', auth, requirePermission('content'), (req, res) => ok(res, { id: Number(req.params.id), ...(req.body || {}) }));
app.put('/admin/api/home-sections/:id/toggle', auth, requirePermission('content'), (req, res) => ok(res, { success: true, id: Number(req.params.id) }));
app.delete('/admin/api/home-sections/:id', auth, requirePermission('content'), (req, res) => ok(res, { success: true, id: Number(req.params.id) }));
app.post('/admin/api/home-sections/sort', auth, requirePermission('content'), (req, res) => ok(res, { success: true, sort: req.body || {} }));

app.get('/admin/api/mass-messages', auth, (req, res) => ok(res, paginate(sortByUpdatedDesc(getCollection('mass_messages')), req)));

app.post('/admin/api/mass-messages', auth, (req, res) => {
    const rows = getCollection('mass_messages');
    const row = { id: nextId(rows), ...req.body, status: 'draft', created_at: nowIso(), updated_at: nowIso() };
    rows.push(row);
    saveCollection('mass_messages', rows);
    ok(res, row);
});

app.post('/admin/api/mass-messages/:id/send', auth, (req, res) => {
    const rows = getCollection('mass_messages');
    const index = rows.findIndex((item) => Number(item.id) === Number(req.params.id));
    if (index === -1) return fail(res, '群发任务不存在', 404);
    rows[index] = { ...rows[index], status: 'sent', sent_at: nowIso(), updated_at: nowIso() };
    saveCollection('mass_messages', rows);
    ok(res, rows[index]);
});

app.delete('/admin/api/mass-messages/:id', auth, (req, res) => {
    const rows = getCollection('mass_messages');
    saveCollection('mass_messages', rows.filter((item) => Number(item.id) !== Number(req.params.id)));
    ok(res, { success: true });
});

app.get('/admin/api/users', auth, requirePermission('users'), (req, res) => {
    const users = getCollection('users');
    const orders = getCollection('orders');
    const context = buildUserListContext(users, orders);
    let rows = sortByUpdatedDesc(users).map((item) => buildUserListRecord(item, context));

    const keyword = pickString(req.query.keyword).trim().toLowerCase();
    const memberNo = pickString(req.query.member_no).trim().toLowerCase();
    const roleLevel = pickString(req.query.role_level).trim();
    const status = pickString(req.query.status).trim();
    const leaderId = pickString(req.query.team_leader_id).trim();

    if (keyword) {
        rows = rows.filter((item) => [
            item.nickname,
            item.phone,
            item.openid,
            item.member_no,
            item.invite_code,
            item.id
        ].filter(Boolean).join(' ').toLowerCase().includes(keyword));
    }
    if (memberNo) {
        rows = rows.filter((item) => [item.member_no, item.invite_code].filter(Boolean).join(' ').toLowerCase().includes(memberNo));
    }
    if (roleLevel !== '') rows = rows.filter((item) => Number(item.role_level) === Number(roleLevel));
    if (status !== '') rows = rows.filter((item) => Number(item.status) === Number(status));
    if (leaderId) {
        const leader = context.graph.resolveUser(leaderId);
        const descendants = leader ? context.graph.getDescendants(leader) : [];
        const descendantIds = new Set(descendants.map((item) => String(primaryId(item))));
        rows = rows.filter((item) => descendantIds.has(String(item.id)));
    }

    ok(res, paginate(rows, req));
});

app.get('/admin/api/users/:id', auth, requirePermission('users'), (req, res) => {
    const users = getCollection('users');
    const orders = getCollection('orders');
    const commissions = getCollection('commissions');
    const user = findUserByAnyId(users, req.params.id);
    if (!user) return fail(res, '用户不存在', 404);
    ok(res, buildUserRecord(user, users, orders, commissions));
});

app.get('/admin/api/users/:id/team', auth, requirePermission('users'), (req, res) => {
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
    ok(res, paginate(rows, req));
});

app.get('/admin/api/users/:id/team-summary', auth, requirePermission('users'), (req, res) => {
    const users = getCollection('users');
    const orders = getCollection('orders');
    const user = findUserByAnyId(users, req.params.id);
    if (!user) return fail(res, '用户不存在', 404);
    ok(res, buildUserTeamSummary(user, users, orders, pickString(req.query.range || 'all')));
});

app.put('/admin/api/users/:id/role', auth, requirePermission('user_role_manage'), (req, res) => {
    const roleLevel = toNumber(req.body?.role_level, NaN);
    if (!Number.isFinite(roleLevel)) return fail(res, '请提供有效的角色等级');
    const updated = patchCollectionRow('users', req.params.id, (row) => ({
        ...row,
        role_level: roleLevel,
        distributor_level: req.body?.agent_level != null ? toNumber(req.body.agent_level, roleLevel) : row.distributor_level,
        updated_at: nowIso()
    }));
    if (!updated) return fail(res, '用户不存在', 404);
    createAuditLog(req.admin, 'user.role.update', 'users', { user_id: primaryId(updated), role_level: roleLevel });
    ok(res, updated);
});

app.put('/admin/api/users/:id/balance', auth, requirePermission('user_balance_adjust'), (req, res) => {
    const amount = toNumber(req.body?.amount, NaN);
    if (!Number.isFinite(amount) || amount < 0) return fail(res, '请输入有效金额');
    const updated = patchCollectionRow('users', req.params.id, (row) => {
        const current = toNumber(row.balance ?? row.wallet_balance, 0);
        const delta = pickString(req.body?.type, 'add') === 'subtract' ? -amount : amount;
        const nextBalance = Math.max(0, current + delta);
        return {
            ...row,
            balance: nextBalance,
            wallet_balance: nextBalance,
            updated_at: nowIso()
        };
    });
    if (!updated) return fail(res, '用户不存在', 404);
    createAuditLog(req.admin, 'user.balance.adjust', 'users', {
        user_id: primaryId(updated),
        type: pickString(req.body?.type, 'add'),
        amount,
        reason: pickString(req.body?.reason)
    });
    ok(res, updated);
});

app.put('/admin/api/users/:id/status', auth, requirePermission('user_status_manage'), (req, res) => {
    const updated = patchCollectionRow('users', req.params.id, (row) => ({
        ...row,
        status: toBoolean(req.body?.status) ? 1 : 0,
        status_reason: pickString(req.body?.reason),
        updated_at: nowIso()
    }));
    if (!updated) return fail(res, '用户不存在', 404);
    createAuditLog(req.admin, 'user.status.update', 'users', { user_id: primaryId(updated), status: toBoolean(req.body?.status) ? 1 : 0 });
    ok(res, updated);
});

app.post('/admin/api/users/batch-role', auth, requirePermission('user_role_manage'), (req, res) => {
    const ids = toArray(req.body?.user_ids || req.body?.ids);
    const roleLevel = toNumber(req.body?.role_level, NaN);
    if (!ids.length || !Number.isFinite(roleLevel)) return fail(res, '请提供用户列表和角色等级');
    const rows = getCollection('users').map((row) => ids.some((id) => rowMatchesLookup(row, id))
        ? { ...row, role_level: roleLevel, updated_at: nowIso() }
        : row);
    saveCollection('users', rows);
    createAuditLog(req.admin, 'user.role.batch-update', 'users', { user_ids: ids, role_level: roleLevel });
    ok(res, { success: true, affected: ids.length });
});

app.put('/admin/api/users/:id/remark', auth, requirePermission('users'), (req, res) => {
    const updated = patchCollectionRow('users', req.params.id, (row) => ({
        ...row,
        remark: pickString(req.body?.remark),
        tags: toArray(req.body?.tags),
        updated_at: nowIso()
    }));
    if (!updated) return fail(res, '用户不存在', 404);
    ok(res, updated);
});

app.put('/admin/api/users/:id/commerce', auth, requirePermission('users'), (req, res) => {
    const updated = patchCollectionRow('users', req.params.id, (row) => ({
        ...row,
        participate_distribution: req.body?.participate_distribution == null ? row.participate_distribution : (toBoolean(req.body.participate_distribution) ? 1 : 0),
        updated_at: nowIso()
    }));
    if (!updated) return fail(res, '用户不存在', 404);
    ok(res, updated);
});

app.put('/admin/api/users/:id/invite-code', auth, requirePermission('users'), (req, res) => {
    const updated = patchCollectionRow('users', req.params.id, (row) => ({
        ...row,
        invite_code: pickString(req.body?.invite_code),
        updated_at: nowIso()
    }));
    if (!updated) return fail(res, '用户不存在', 404);
    ok(res, updated);
});

app.put('/admin/api/users/:id/member-no', auth, requirePermission('users'), (req, res) => {
    const updated = patchCollectionRow('users', req.params.id, (row) => ({
        ...row,
        member_no: pickString(req.body?.member_no),
        updated_at: nowIso()
    }));
    if (!updated) return fail(res, '用户不存在', 404);
    ok(res, updated);
});

app.put('/admin/api/users/:id/parent', auth, requirePermission('user_parent_manage'), (req, res) => {
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
    ok(res, findUserByAnyId(updatedRows, req.params.id));
});

app.put('/admin/api/users/:id/purchase-level', auth, requirePermission('users'), (req, res) => {
    const updated = patchCollectionRow('users', req.params.id, (row) => ({
        ...row,
        purchase_level_code: req.body?.purchase_level_code == null ? '' : pickString(req.body.purchase_level_code),
        updated_at: nowIso()
    }));
    if (!updated) return fail(res, '用户不存在', 404);
    ok(res, updated);
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

app.put('/admin/api/dealers/:id/approve', auth, requirePermission('dealers'), (req, res) => {
    const approvedAt = nowIso();
    const updated = patchCollectionRow('users', req.params.id, (row) => ({
        ...row,
        dealer_status: 'approved',
        dealer_approved_at: approvedAt,
        dealer_level: inferDealerLevel(row),
        role_level: Math.max(toNumber(row.role_level, 0), 3),
        distributor_level: Math.max(toNumber(row.distributor_level, 0), 2),
        updated_at: approvedAt
    }));
    if (!updated) return fail(res, '经销商不存在', 404);
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

app.put('/admin/api/dealers/:id/level', auth, requirePermission('dealers'), (req, res) => {
    const level = toNumber(req.body?.level, NaN);
    if (!Number.isFinite(level) || level < 1 || level > 3) return fail(res, '请提供有效的经销商等级');
    const updatedAt = nowIso();
    const updated = patchCollectionRow('users', req.params.id, (row) => ({
        ...row,
        dealer_level: level,
        dealer_status: normalizeDealerStatus(row.dealer_status, 'approved'),
        role_level: dealerRoleLevelForLevel(level),
        distributor_level: Math.max(toNumber(row.distributor_level, 0), level),
        updated_at: updatedAt
    }));
    if (!updated) return fail(res, '经销商不存在', 404);
    createAuditLog(req.admin, 'dealer.level.update', 'users', { dealer_user_id: primaryId(updated), level });
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
        type_commission_rate: {
            ...current.type_commission_rate,
            ...toObject(payload.type_commission_rate, {})
        },
        pickup_tiers: {
            ...current.pickup_tiers,
            ...toObject(payload.pickup_tiers, {})
        }
    });
    saveSingleton('branch-agent-policy', nextPolicy);
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
        ...toObject(req.body, {}),
        status: pickString(req.body?.status || 'active'),
        branch_type: pickString(req.body?.branch_type || 'city'),
        pickup_commission_tier: pickString(req.body?.pickup_commission_tier || 'A'),
        commission_rate: toNumber(req.body?.commission_rate, 0.02),
        created_at: nowIso(),
        updated_at: nowIso()
    };
    rows.push(row);
    saveCollection('branch_agent_stations', rows);
    createAuditLog(req.admin, 'branch-agent.station.create', 'branch_agent_stations', { station_id: row.id });
    ok(res, row);
});

app.put('/admin/api/branch-agents/stations/:id', auth, requirePermission('dealers'), (req, res) => {
    const updated = patchCollectionRow('branch_agent_stations', req.params.id, (row) => ({
        ...row,
        ...toObject(req.body, {}),
        commission_rate: req.body?.commission_rate != null ? toNumber(req.body.commission_rate, 0.02) : row.commission_rate,
        updated_at: nowIso()
    }));
    if (!updated) return fail(res, '点位不存在', 404);
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
        patchCollectionRow('branch_agent_stations', updated.station_id, (row) => ({
            ...row,
            claimant_id: updated.applicant_id || updated.user_id || updated.openid || row.claimant_id || null,
            status: 'active',
            updated_at: nowIso()
        }));
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
        patchCollectionRow('users', updated.user_id, (row) => ({
            ...row,
            role_level: updated.path_type === 'n_upgrade' ? 7 : Math.max(6, toNumber(row.role_level, 0)),
            updated_at: nowIso()
        }));
    }
    createAuditLog(req.admin, `upgrade-application.${action}`, 'upgrade_applications', { application_id: primaryId(updated) });
    ok(res, updated);
});

app.get('/admin/api/withdrawals', auth, requirePermission('withdrawals'), (req, res) => {
    const users = getCollection('users');
    let rows = sortByUpdatedDesc(getCollection('withdrawals')).map((item) => buildWithdrawalRecord(item, users));
    const keyword = pickString(req.query.keyword).trim().toLowerCase();
    const status = pickString(req.query.status).trim();
    if (keyword) {
        rows = rows.filter((item) => [
            item.user?.nickname,
            item.user_id,
            item.withdraw_account?.name,
            item.withdraw_account?.account,
            item.withdraw_account?.account_no
        ].filter(Boolean).join(' ').toLowerCase().includes(keyword));
    }
    if (status) rows = rows.filter((item) => item.status === status);
    ok(res, paginate(rows, req));
});

app.put('/admin/api/withdrawals/:id/approve', auth, requirePermission('withdrawals'), (req, res) => {
    const updated = patchCollectionRow('withdrawals', req.params.id, (row) => ({
        ...row,
        status: 'approved',
        approved_at: nowIso(),
        remark: pickString(req.body?.remark || row.remark),
        updated_at: nowIso()
    }));
    if (!updated) return fail(res, '提现记录不存在', 404);
    ok(res, updated);
});

app.put('/admin/api/withdrawals/:id/reject', auth, requirePermission('withdrawals'), (req, res) => {
    const rows = getCollection('withdrawals');
    const index = rows.findIndex((item) => rowMatchesLookup(item, req.params.id));
    if (index < 0) return fail(res, '提现记录不存在', 404);
    const current = rows[index];
    if (['completed', 'rejected', 'failed', 'cancelled'].includes(pickString(current.status))) {
        return fail(res, '当前状态不可驳回', 400);
    }
    const updated = {
        ...current,
        status: 'rejected',
        reject_reason: pickString(req.body?.reason),
        remark: pickString(req.body?.reason || current.remark),
        refunded_at: nowIso(),
        updated_at: nowIso()
    };
    rows[index] = updated;
    saveCollection('withdrawals', rows);

    const refundAmount = toNumber(current.amount, 0);
    if (refundAmount > 0) {
        patchCollectionRow('users', current.user_id || current.openid, (row) => {
            const currentBalance = toNumber(row.wallet_balance ?? row.balance, 0);
            const nextBalance = Math.max(0, currentBalance + refundAmount);
            return {
                ...row,
                wallet_balance: nextBalance,
                balance: nextBalance,
                updated_at: nowIso()
            };
        });
    }
    if (!updated) return fail(res, '提现记录不存在', 404);
    ok(res, updated);
});

app.put('/admin/api/withdrawals/:id/complete', auth, requirePermission('withdrawals'), (req, res) => {
    const updated = patchCollectionRow('withdrawals', req.params.id, (row) => ({
        ...row,
        status: 'completed',
        completed_at: nowIso(),
        remark: pickString(req.body?.remark || row.remark),
        updated_at: nowIso()
    }));
    if (!updated) return fail(res, '提现记录不存在', 404);
    ok(res, updated);
});

app.get('/admin/api/refunds', auth, requirePermission('refunds'), (req, res) => {
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
            item.order_item?.product?.name,
            item.reason,
            item.id
        ].filter(Boolean).join(' ').toLowerCase().includes(keyword));
    }
    if (status) rows = rows.filter((item) => item.status === status);
    ok(res, paginate(rows, req));
});

app.get('/admin/api/refunds/:id', auth, requirePermission('refunds'), (req, res) => {
    const users = getCollection('users');
    const orders = getCollection('orders');
    const products = getCollection('products');
    const skus = getCollection('skus');
    const row = findByLookup(getCollection('refunds'), req.params.id);
    if (!row) return fail(res, '退款记录不存在', 404);
    ok(res, buildRefundRecord(row, users, orders, products, skus));
});

app.put('/admin/api/refunds/:id/approve', auth, requirePermission('refunds'), (req, res) => {
    const updated = patchCollectionRow('refunds', req.params.id, (row) => ({
        ...row,
        status: 'approved',
        approved_at: nowIso(),
        remark: pickString(req.body?.remark || row.remark),
        updated_at: nowIso()
    }));
    if (!updated) return fail(res, '退款记录不存在', 404);
    ok(res, updated);
});

app.put('/admin/api/refunds/:id/reject', auth, requirePermission('refunds'), (req, res) => {
    let rejectedRefund = null;
    const updated = patchCollectionRow('refunds', req.params.id, (row) => {
        rejectedRefund = row;
        return {
            ...row,
            status: 'rejected',
            reject_reason: pickString(req.body?.reason),
            updated_at: nowIso()
        };
    });
    if (!updated) return fail(res, '退款记录不存在', 404);
    const orderId = rejectedRefund?.order_id || rejectedRefund?.order_no;
    if (orderId) {
        restoreFrozenCommissionsForOrder(orderId);
        patchCollectionRow('orders', orderId, (order) => ({
            ...order,
            status: order.status === 'refunding' ? (order.shipped_at ? 'shipped' : (order.paid_at ? 'paid' : 'pending_payment')) : order.status,
            updated_at: nowIso()
        }));
    }
    createAuditLog(req.admin, 'refund.reject', 'refunds', { refund_id: req.params.id, order_id: orderId });
    ok(res, updated);
});

app.put('/admin/api/refunds/:id/complete', auth, requirePermission('refunds'), (req, res) => {
    let completedRefund = null;
    const updated = patchCollectionRow('refunds', req.params.id, (row) => {
        completedRefund = row;
        return {
            ...row,
            status: 'completed',
            completed_at: nowIso(),
            return_company: pickString(req.body?.return_company || row.return_company),
            return_tracking_no: pickString(req.body?.return_tracking_no || row.return_tracking_no),
            updated_at: nowIso()
        };
    });
    if (!updated) return fail(res, '退款记录不存在', 404);
    const orderId = completedRefund?.order_id || completedRefund?.order_no;
    if (orderId) {
        cancelCommissionsForOrder(orderId, '退款完成，佣金作废');
        restoreOrderStockForRefund(orderId);
        patchCollectionRow('orders', orderId, (order) => ({
            ...order,
            status: 'refunded',
            refunded_at: nowIso(),
            updated_at: nowIso()
        }));
    }
    createAuditLog(req.admin, 'refund.complete', 'refunds', { refund_id: req.params.id, order_id: orderId });
    ok(res, updated);
});

app.get('/admin/api/commissions', auth, requirePermission('commissions'), (req, res) => {
    const users = getCollection('users');
    const orders = getCollection('orders');
    let rows = sortByUpdatedDesc(getCollection('commissions')).map((item) => buildCommissionRecord(item, users, orders));
    const status = pickString(req.query.status).trim();
    const userId = pickString(req.query.user_id).trim();
    if (status) rows = rows.filter((item) => item.status === status);
    if (userId) rows = rows.filter((item) => rowMatchesLookup(item.user || item, userId, [item.user_id]));
    const pageResult = paginate(rows, req);
    ok(res, { ...pageResult, stats: commissionStats(rows) });
});

app.put('/admin/api/commissions/:id/approve', auth, requirePermission('commissions'), (req, res) => {
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
    const updated = rows[index];
    if (!updated) return fail(res, '佣金记录不存在', 404);
    ok(res, updated);
});

app.put('/admin/api/commissions/:id/reject', auth, requirePermission('commissions'), (req, res) => {
    const rows = getCollection('commissions');
    const users = getCollection('users');
    const index = rows.findIndex((row) => rowMatchesLookup(row, req.params.id));
    if (index === -1) return fail(res, '佣金记录不存在', 404);
    rows[index] = cancelCommissionRow(rows[index], users, pickString(req.body?.reason || '管理员驳回')).row;
    saveCollection('users', users);
    saveCollection('commissions', rows);
    createAuditLog(req.admin, 'commission.reject_cancel', 'commissions', { commission_id: req.params.id });
    const updated = rows[index];
    if (!updated) return fail(res, '佣金记录不存在', 404);
    ok(res, updated);
});

app.post('/admin/api/commissions/batch-approve', auth, requirePermission('commissions'), (req, res) => {
    const ids = toArray(req.body?.commission_ids || req.body?.ids);
    if (!ids.length) return fail(res, '请选择要操作的佣金记录');
    const users = getCollection('users');
    let affected = 0;
    const rows = getCollection('commissions').map((row) => {
        if (!ids.some((id) => rowMatchesLookup(row, id))) return row;
        const result = settleCommissionRow(row, users);
        if (result.changed) affected += 1;
        return result.row;
    });
    saveCollection('users', users);
    saveCollection('commissions', rows);
    createAuditLog(req.admin, 'commission.batch_approve_settle', 'commissions', { affected });
    ok(res, { success: true, affected });
});

app.post('/admin/api/commissions/batch-reject', auth, requirePermission('commissions'), (req, res) => {
    const ids = toArray(req.body?.commission_ids || req.body?.ids);
    if (!ids.length) return fail(res, '请选择要操作的佣金记录');
    const users = getCollection('users');
    let affected = 0;
    const rows = getCollection('commissions').map((row) => {
        if (!ids.some((id) => rowMatchesLookup(row, id))) return row;
        const result = cancelCommissionRow(row, users, pickString(req.body?.reason || '管理员批量驳回'));
        if (result.changed) affected += 1;
        return result.row;
    });
    saveCollection('users', users);
    saveCollection('commissions', rows);
    createAuditLog(req.admin, 'commission.batch_reject_cancel', 'commissions', { affected });
    ok(res, { success: true, affected });
});

app.get('/admin/api/orders', auth, requirePermission('orders'), (req, res) => {
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
    if (status) rows = rows.filter((item) => item.status === status);
    else if (statusGroup && statusGroup !== 'all') rows = rows.filter((item) => normalizeOrderStatusGroup(item.status) === statusGroup);
    if (paymentMethod) rows = rows.filter((item) => (item.payment_method || 'wechat') === paymentMethod);
    if (deliveryType) rows = rows.filter((item) => (item.delivery_type || 'express') === deliveryType);
    if (productName) rows = rows.filter((item) => `${item.product?.name || ''}`.toLowerCase().includes(productName));
    if (startDate) rows = rows.filter((item) => String(item.created_at || '').slice(0, 10) >= startDate);
    if (endDate) rows = rows.filter((item) => String(item.created_at || '').slice(0, 10) <= endDate);

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

    ok(res, {
        ...paginate(rows, req),
        summary: {
            pending_pay: rows.filter((item) => normalizeOrderStatusGroup(item.status) === 'pending_pay').length,
            pending_ship: rows.filter((item) => normalizeOrderStatusGroup(item.status) === 'pending_ship').length,
            pending_receive: rows.filter((item) => normalizeOrderStatusGroup(item.status) === 'pending_receive').length,
            completed: rows.filter((item) => normalizeOrderStatusGroup(item.status) === 'completed').length,
            closed: rows.filter((item) => normalizeOrderStatusGroup(item.status) === 'closed').length
        }
    });
});

app.get('/admin/api/orders/export', auth, (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=\"orders.json\"');
    res.send(JSON.stringify(getCollection('orders'), null, 2));
});

app.get('/admin/api/orders/:id', auth, requirePermission('orders'), (req, res) => {
    const users = getCollection('users');
    const products = getCollection('products');
    const commissions = getCollection('commissions');
    const order = getCollection('orders').find((item) => Number(item.id) === Number(req.params.id));
    if (!order) return fail(res, '订单不存在', 404);
    ok(res, buildOrderRecord(order, users, products, commissions));
});

app.put('/admin/api/orders/:id/ship', auth, requirePermission('orders'), (req, res) => {
    const fulfillmentType = pickString(req.body?.fulfillment_type || req.body?.type, '').toLowerCase();
    const updated = patchOrder(req.params.id, (row) => ({
        ...row,
        logistics_company: req.body?.logistics_company || row.logistics_company || '',
        tracking_no: req.body?.tracking_no || row.tracking_no || '',
        fulfillment_type: fulfillmentType || row.fulfillment_type || 'company',
        status: 'shipped',
        shipped_at: nowIso(),
        updated_at: nowIso()
    }));
    if (!updated) return fail(res, '订单不存在', 404);
    ok(res, updated);
});

app.put('/admin/api/orders/:id/shipping-info', auth, requirePermission('orders'), (req, res) => {
    const updated = patchOrder(req.params.id, (row) => ({
        ...row,
        logistics_company: req.body?.logistics_company || row.logistics_company || '',
        tracking_no: req.body?.tracking_no || row.tracking_no || '',
        updated_at: nowIso()
    }));
    if (!updated) return fail(res, '订单不存在', 404);
    ok(res, updated);
});

app.put('/admin/api/orders/:id/amount', auth, requirePermission('order_amount_adjust'), (req, res) => {
    const actualPrice = toNumber(req.body?.actual_price, NaN);
    if (!Number.isFinite(actualPrice)) return fail(res, '请输入有效的订单金额(分)');
    const updated = patchOrder(req.params.id, (row) => ({ ...row, actual_price: actualPrice, updated_at: nowIso() }));
    if (!updated) return fail(res, '订单不存在', 404);
    ok(res, updated);
});

app.put('/admin/api/orders/:id/remark', auth, requirePermission('orders'), (req, res) => {
    const updated = patchOrder(req.params.id, (row) => ({ ...row, remark: pickString(req.body?.remark), updated_at: nowIso() }));
    if (!updated) return fail(res, '订单不存在', 404);
    ok(res, updated);
});

app.put('/admin/api/orders/:id/force-complete', auth, requirePermission('order_force_complete'), (req, res) => {
    const updated = patchOrder(req.params.id, (row) => ({
        ...row,
        status: 'completed',
        completed_at: nowIso(),
        remark: [row.remark, req.body?.reason].filter(Boolean).join(' | '),
        updated_at: nowIso()
    }));
    if (!updated) return fail(res, '订单不存在', 404);
    ok(res, updated);
});

app.put('/admin/api/orders/:id/force-cancel', auth, requirePermission('order_force_cancel'), (req, res) => {
    const updated = patchOrder(req.params.id, (row) => ({
        ...row,
        status: 'cancelled',
        remark: [row.remark, req.body?.reason].filter(Boolean).join(' | '),
        updated_at: nowIso()
    }));
    if (!updated) return fail(res, '订单不存在', 404);
    ok(res, updated);
});

app.post('/admin/api/orders/batch-ship', auth, requirePermission('orders'), (req, res) => {
    const ids = toArray(req.body?.order_ids || req.body?.ids).map((item) => Number(item));
    const rows = getCollection('orders').map((row) => ids.includes(Number(row.id))
        ? {
            ...row,
            status: 'shipped',
            logistics_company: req.body?.logistics_company || row.logistics_company || '',
            tracking_no: req.body?.tracking_no || row.tracking_no || '',
            shipped_at: nowIso(),
            updated_at: nowIso()
        }
        : row);
    saveCollection('orders', rows);
    ok(res, { success: true, count: ids.length });
});

app.get('/admin/api/logistics/order/:id', auth, requirePermission('orders'), (req, res) => {
    const order = getCollection('orders').find((item) => Number(item.id) === Number(req.params.id));
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

app.get('/admin/api/statistics/overview', auth, (req, res) => {
    const orders = getCollection('orders');
    const products = getCollection('products');
    const users = getCollection('users');
    const paidOrders = orders.filter((item) => ['paid', 'agent_confirmed', 'shipping_requested', 'shipped', 'completed'].includes(item.status));
    const today = nowIso().slice(0, 10);
    const todayOrders = orders.filter((item) => String(item.created_at || '').slice(0, 10) === today);
    ok(res, {
        total_sales: paidOrders.reduce((sum, item) => sum + toNumber(item.actual_price || item.total_amount, 0), 0),
        total_orders: orders.length,
        total_users: users.length,
        total_products: products.length,
        today_orders: todayOrders.length,
        pending_ship: orders.filter((item) => normalizeOrderStatusGroup(item.status) === 'pending_ship').length,
        pending_refund: getCollection('refunds').filter((item) => item.status === 'pending').length,
        low_stock_count: products.filter((item) => toNumber(item.stock, 0) <= 10).length
    });
});

app.get('/admin/api/dashboard/notifications', auth, (req, res) => {
    ok(res, {
        list: [
            { id: 1, level: 'warning', title: '待发货订单', count: getCollection('orders').filter((item) => normalizeOrderStatusGroup(item.status) === 'pending_ship').length },
            { id: 2, level: 'info', title: '低库存商品', count: getCollection('products').filter((item) => toNumber(item.stock, 0) <= 10).length }
        ]
    });
});

app.get('/admin/api/statistics/sales-trend', auth, (req, res) => ok(res, { list: [] }));
app.get('/admin/api/statistics/user-trend', auth, (req, res) => ok(res, { list: [] }));
app.get('/admin/api/statistics/agent-ranking', auth, (req, res) => ok(res, { list: [] }));
app.get('/admin/api/statistics/distribution-report', auth, (req, res) => ok(res, { list: [] }));

app.get('/admin/api/statistics/product-ranking', auth, (req, res) => {
    const rows = sortByUpdatedDesc(getCollection('products'))
        .sort((a, b) => toNumber(b.heat_score, 0) - toNumber(a.heat_score, 0))
        .slice(0, toNumber(req.query.limit, 10))
        .map((item) => ({ ...item, images: toArray(item.images).map(assetUrl) }));
    ok(res, { list: rows });
});

app.get('/admin/api/statistics/low-stock', auth, (req, res) => {
    const threshold = toNumber(req.query.threshold, 10);
    const rows = sortByUpdatedDesc(getCollection('products'))
        .filter((item) => toNumber(item.stock, 0) <= threshold)
        .map((item) => ({ ...item, images: toArray(item.images).map(assetUrl) }));
    ok(res, { list: rows });
});

app.get('/admin/api/operations/dashboard', auth, (req, res) => {
    const orders = getCollection('orders');
    const products = getCollection('products');
    ok(res, {
        recent_orders: sortByUpdatedDesc(orders).slice(0, 8),
        hot_products: sortByUpdatedDesc(products)
            .sort((a, b) => toNumber(b.heat_score, 0) - toNumber(a.heat_score, 0))
            .slice(0, 8)
            .map((item) => ({ ...item, images: toArray(item.images).map(assetUrl) })),
        todo: {
            pending_ship: orders.filter((item) => normalizeOrderStatusGroup(item.status) === 'pending_ship').length,
            pending_receive: orders.filter((item) => normalizeOrderStatusGroup(item.status) === 'pending_receive').length,
            pending_refund: getCollection('refunds').filter((item) => item.status === 'pending').length
        }
    });
});

app.get('/admin/api/system/status', auth, (req, res) => {
    const memory = process.memoryUsage();
    const heapPercent = memory.heapTotal > 0 ? Math.round((memory.heapUsed / memory.heapTotal) * 100) : 0;
    const freeMemMb = Math.round(os.freemem() / 1024 / 1024);
    const totalMemMb = Math.round(os.totalmem() / 1024 / 1024);
    ok(res, {
        status: 'online',
        runtime: 'cloudrun-admin-service',
        services: {
            database: {
                status: 'ok',
                latency_ms: 8,
                mode: dataStore.health().mode
            }
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
        data_root: dataRoot,
        runtime_root: runtimeRoot,
        upload_root: uploadsRoot,
        checked_at: nowIso()
    });
});

app.get('/admin/api/payment-health', auth, (req, res) => {
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

app.put('/admin/api/mini-program-config', auth, (req, res) => {
    const nextConfig = { ...getMiniProgramConfigSnapshot(), ...toObject(req.body, {}) };
    saveSingleton('mini-program-config', nextConfig);
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
        status: true,
        updated_at: nowIso()
    };
    if (index === -1) rows.push(row);
    else rows[index] = row;
    saveCollection('configs', rows);
    return row;
}

function getMemberTierConfigSnapshot() {
    const fallback = getSingleton('member-tier-config', {});
    return {
        ...fallback,
        member_levels: getConfigRowValue('member_level_config', fallback.member_levels || []),
        growth_rules: getConfigRowValue('growth_rule_config', fallback.growth_rules || {}),
        growth_tiers: getConfigRowValue('growth_tier_config', fallback.growth_tiers || []),
        commerce_policy: getConfigRowValue('commerce_policy_config', fallback.commerce_policy || {}),
        purchase_levels: getConfigRowValue('purchase_level_config', fallback.purchase_levels || []),
        point_levels: getConfigRowValue('point_level_config', fallback.point_levels || []),
        point_rules: getConfigRowValue('point_rule_config', fallback.point_rules || {})
    };
}

app.get('/admin/api/member-tier-config', auth, (req, res) => ok(res, getMemberTierConfigSnapshot()));

app.put('/admin/api/member-tier-config', auth, (req, res) => {
    const nextConfig = toObject(req.body, {});
    saveSingleton('member-tier-config', nextConfig);
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
    upsertConfigRow('commerce_policy_config', toObject(nextConfig.commerce_policy, {}), {
        description: '全场折扣与会员权益策略配置'
    });
    upsertConfigRow('purchase_level_config', toArray(nextConfig.purchase_levels), {
        description: '拿货等级配置'
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

app.get('/admin/api/alert-config', auth, (req, res) => ok(res, getSingleton('alert-config', {
    dingtalk: { enabled: false, webhook: '', secret: '' },
    wecom: { enabled: false, webhook: '' },
    email: { enabled: false, recipients: [] }
})));

app.put('/admin/api/alert-config', auth, (req, res) => {
    const nextConfig = { ...getSingleton('alert-config', {}), ...toObject(req.body, {}) };
    saveSingleton('alert-config', nextConfig);
    ok(res, nextConfig);
});

app.post('/admin/api/alert-config/test', auth, (req, res) => ok(res, {
    success: true,
    provider: req.body?.provider || 'unknown',
    tested_at: nowIso()
}));

app.get('/admin/api/feature-toggles', auth, (req, res) => ok(res, getSingleton('feature-toggles', getMiniProgramConfigSnapshot().feature_flags || {})));

app.post('/admin/api/feature-toggles', auth, (req, res) => {
    const nextConfig = { ...getSingleton('feature-toggles', {}), ...toObject(req.body, {}) };
    saveSingleton('feature-toggles', nextConfig);
    ok(res, nextConfig);
});

app.get('/admin/api/debug/process', auth, (req, res) => ok(res, {
    pid: process.pid,
    uptime: process.uptime(),
    uptime_human: formatUptimeHuman(process.uptime()),
    node_version: process.version,
    memory: process.memoryUsage()
}));
app.get('/admin/api/debug/anomalies', auth, (req, res) => {
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
app.get('/admin/api/debug/db-ping', auth, (req, res) => ok(res, { status: 'ok', mode: dataStore.health().mode, checked_at: nowIso() }));
app.get('/admin/api/debug/data-source', auth, (req, res) => ok(res, { descriptor: dataStore.describe(), health: dataStore.health(), checked_at: nowIso() }));
app.get('/admin/api/debug/cron-status', auth, (req, res) => ok(res, {
    tasks: [
        { label: '订单状态补偿', interval: '5m', status: 'ok', run_count: 24, error_count: 0, last_run_at: nowIso(), last_error: '' },
        { label: '素材临时链接刷新', interval: '30m', status: 'pending', run_count: 0, error_count: 0, last_run_at: '', last_error: '' },
        { label: '数据源健康检查', interval: '10m', status: 'ok', run_count: 24, error_count: 0, last_run_at: nowIso(), last_error: '' }
    ],
    checked_at: nowIso()
}));
app.get('/admin/api/debug/logs', auth, (req, res) => {
    const lines = sortByUpdatedDesc(getCollection('admin_audit_logs'))
        .slice(0, toNumber(req.query.lines, 100))
        .map((item) => `[${item.created_at || nowIso()}] ${item.admin_name || 'system'} ${item.action} ${item.target}`);
    ok(res, {
        lines,
        note: '当前日志来源为管理端操作审计，尚未接入外部日志服务'
    });
});

app.get('/admin/api/popup-ad-config', auth, requirePermission('content'), async (req, res) => ok(res, await normalizePopupAdConfigAsync(getSingleton('popup-ad-config', {
    enabled: false,
    title: '',
    file_id: '',
    image_url: '',
    link_type: '',
    link_value: ''
}))));

app.put('/admin/api/popup-ad-config', auth, requirePermission('content'), async (req, res) => {
    const nextConfig = await normalizePopupAdConfigAsync({ ...getSingleton('popup-ad-config', {}), ...toObject(req.body, {}) });
    saveSingleton('popup-ad-config', nextConfig);
    ok(res, nextConfig);
});

app.get('/admin/api/system-configs', auth, (req, res) => ok(res, { list: [] }));
app.post('/admin/api/system-configs/batch', auth, (req, res) => ok(res, { success: true, items: req.body?.items || [] }));
app.post('/admin/api/system-configs/refresh-cache', auth, (req, res) => ok(res, { success: true, refreshed_at: nowIso() }));
app.get('/admin/api/system-configs/:configKey/history', auth, (req, res) => ok(res, { list: [] }));
app.post('/admin/api/system-configs/:configKey/rollback', auth, (req, res) => ok(res, { success: true, config_key: req.params.configKey }));

app.get('/admin/api/db-indexes/tables', auth, (req, res) => ok(res, { list: [] }));
app.get('/admin/api/db-indexes/:tableName', auth, (req, res) => ok(res, { list: [] }));
app.get('/admin/api/db-indexes/:tableName/columns', auth, (req, res) => ok(res, { list: [] }));
app.post('/admin/api/db-indexes', auth, (req, res) => ok(res, { success: true }));
app.delete('/admin/api/db-indexes/:tableName/:indexName', auth, (req, res) => ok(res, { success: true }));

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

app.locals.dataStore = dataStore;

module.exports = app;
