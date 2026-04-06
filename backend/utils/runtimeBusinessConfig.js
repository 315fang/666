const { AppConfig } = require('../models');
const constants = require('../config/constants');
const { loadMiniProgramConfig } = require('./miniprogramConfig');

const CACHE_TTL_MS = 30 * 1000;
const cacheStore = new Map();

async function getConfigValue(category, key, fallback, parser = (value) => value) {
    const cacheKey = `${category}:${key}`;
    const cached = cacheStore.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.value;
    }

    const row = await AppConfig.findOne({
        where: { category, config_key: key, status: 1 },
        attributes: ['config_value']
    });

    let value = fallback;
    if (row && row.config_value !== undefined && row.config_value !== null && row.config_value !== '') {
        try {
            value = parser(row.config_value);
        } catch (_) {
            value = fallback;
        }
    }

    cacheStore.set(cacheKey, {
        value,
        expiresAt: Date.now() + CACHE_TTL_MS
    });
    return value;
}

function normalizeDbFeeRate(raw) {
    const n = parseFloat(raw);
    if (!Number.isFinite(n)) return constants.WITHDRAWAL.FEE_RATE;
    /* 大于 1 视为「百分比数值」如 10 表示 10% */
    return n > 1 ? n / 100 : n;
}

async function getWithdrawalRuntimeConfig() {
    const minAmount = await getConfigValue('WITHDRAWAL', 'MIN_AMOUNT', constants.WITHDRAWAL.MIN_AMOUNT, (value) => parseFloat(value));
    let feeRate = normalizeDbFeeRate(
        await getConfigValue('WITHDRAWAL', 'FEE_RATE', constants.WITHDRAWAL.FEE_RATE, (value) => parseFloat(value))
    );
    let feeCapMax = await getConfigValue('WITHDRAWAL', 'FEE_CAP_MAX', constants.WITHDRAWAL.FEE_CAP_MAX, (value) => parseFloat(value));
    feeCapMax = Number.isFinite(feeCapMax) ? feeCapMax : constants.WITHDRAWAL.FEE_CAP_MAX;

    try {
        const mini = await loadMiniProgramConfig(AppConfig);
        const w = mini && typeof mini.withdrawal_config === 'object' ? mini.withdrawal_config : {};
        if (Object.prototype.hasOwnProperty.call(w, 'fee_rate_percent')) {
            const p = parseFloat(w.fee_rate_percent);
            if (Number.isFinite(p)) {
                feeRate = p / 100;
            }
        }
        if (Object.prototype.hasOwnProperty.call(w, 'fee_cap_max')) {
            const c = parseFloat(w.fee_cap_max);
            if (Number.isFinite(c)) {
                feeCapMax = c;
            }
        }
    } catch (e) {
        console.warn('[getWithdrawalRuntimeConfig] 读取小程序 withdrawal_config 失败，沿用 WITHDRAWAL', e.message);
    }

    return {
        ...constants.WITHDRAWAL,
        MIN_AMOUNT: Number.isFinite(minAmount) ? minAmount : constants.WITHDRAWAL.MIN_AMOUNT,
        FEE_RATE: feeRate,
        FEE_CAP_MAX: feeCapMax
    };
}

async function getOrderRuntimeConfig() {
    const autoCancelMinutes = await getConfigValue('ORDER', 'AUTO_CANCEL_MINUTES', constants.ORDER.AUTO_CANCEL_MINUTES, (value) => parseInt(value, 10));
    const autoConfirmDays = await getConfigValue('ORDER', 'AUTO_CONFIRM_DAYS', constants.ORDER.AUTO_CONFIRM_DAYS, (value) => parseInt(value, 10));
    return {
        ...constants.ORDER,
        AUTO_CANCEL_MINUTES: Number.isFinite(autoCancelMinutes) ? autoCancelMinutes : constants.ORDER.AUTO_CANCEL_MINUTES,
        AUTO_CONFIRM_DAYS: Number.isFinite(autoConfirmDays) ? autoConfirmDays : constants.ORDER.AUTO_CONFIRM_DAYS
    };
}

/**
 * 用户维护：纯游客闲置清理天数、默认头像（SYSTEM 键可覆盖 env/常量）
 */
async function getUserMaintenanceConfig() {
    const purgeRaw = await getConfigValue(
        'SYSTEM',
        'USER_IDLE_GUEST_PURGE_DAYS',
        constants.USER.IDLE_GUEST_PURGE_DAYS,
        (value) => parseInt(value, 10)
    );
    let idleGuestPurgeDays = Number.isFinite(purgeRaw) ? purgeRaw : constants.USER.IDLE_GUEST_PURGE_DAYS;
    if (idleGuestPurgeDays < 0) idleGuestPurgeDays = 0;

    const avatarFromDb = await getConfigValue(
        'SYSTEM',
        'USER_DEFAULT_AVATAR_URL',
        constants.USER.DEFAULT_AVATAR_URL || '',
        (value) => String(value || '').trim()
    );
    const defaultAvatarUrl =
        avatarFromDb && String(avatarFromDb).trim()
            ? String(avatarFromDb).trim()
            : (constants.USER.DEFAULT_AVATAR_URL || '/assets/images/default-avatar.svg');

    return {
        idleGuestPurgeDays,
        defaultAvatarUrl
    };
}

function clearRuntimeBusinessConfigCache() {
    cacheStore.clear();
}

module.exports = {
    getWithdrawalRuntimeConfig,
    getOrderRuntimeConfig,
    getUserMaintenanceConfig,
    clearRuntimeBusinessConfigCache
};
