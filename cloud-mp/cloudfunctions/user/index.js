'use strict';

const cloud = require('wx-server-sdk');
const https = require('https');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

const DEFAULT_ROLE_NAMES = {
    0: 'VIP会员',
    1: '初级会员 C1',
    2: '高级会员 C2',
    3: '推广合伙人 B1',
    4: '运营合伙人 B2',
    5: '区域合伙人 B3'
};

const DEFAULT_AGENT_UPGRADE_RULES = {
    enabled: true,
    c1_min_purchase: 299,
    c2_referee_count: 2,
    c2_min_sales: 580,
    b1_referee_count: 10,
    b1_recharge: 3000,
    b2_referee_count: 10,
    b2_recharge: 30000,
    b3_referee_b1_count: 30,
    b3_referee_b2_count: 3,
    b3_recharge: 198000,
    effective_order_days: 7
};

const {
    CloudBaseError, cloudFunctionWrapper, withTransientDbReadRetry
} = require('./shared/errors');
const {
    success, badRequest, unauthorized, notFound, serverError
} = require('./shared/response');
const { calculateTier } = require('./shared/growth');
const { toNumber: toNum, getAllRecords } = require('./shared/utils');

// 子模块导入
const userProfile = require('./user-profile');
const userGrowth = require('./user-growth');
const userAddresses = require('./user-addresses');
const userCoupons = require('./user-coupons');
const userCouponTickets = require('./user-coupon-tickets');
const userDepositOrders = require('./user-deposit-orders');
const userFavorites = require('./user-favorites');
const userNotifications = require('./user-notifications');
const userWallet = require('./user-wallet');

function parseConfigValue(row, fallback) {
    if (!row) return fallback;
    const value = row.config_value !== undefined ? row.config_value : row.value;
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value === 'string') {
        try {
            return JSON.parse(value);
        } catch (_) {
            return value;
        }
    }
    return value;
}

function roundMoney(value) {
    return Math.round(toNum(value, 0) * 100) / 100;
}

function parseTimestamp(value) {
    if (!value) return 0;
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value === 'string') {
        const ts = new Date(value).getTime();
        return Number.isFinite(ts) ? ts : 0;
    }
    if (typeof value === 'object') {
        if (typeof value._seconds === 'number') return value._seconds * 1000;
        if (typeof value.seconds === 'number') return value.seconds * 1000;
        if (value.$date !== undefined) return parseTimestamp(value.$date);
        if (typeof value.toDate === 'function') {
            const date = value.toDate();
            return date instanceof Date ? date.getTime() : 0;
        }
    }
    return 0;
}

function isEnabledFlag(value, fallback = true) {
    if (value === undefined || value === null || value === '') return fallback;
    if (value === true || value === 1 || value === '1') return true;
    if (value === false || value === 0 || value === '0') return false;
    const normalized = String(value).trim().toLowerCase();
    if (!normalized) return fallback;
    if (['true', 'yes', 'y', 'on', 'enabled', 'enable', 'active', 'show', 'visible'].includes(normalized)) return true;
    if (['false', 'no', 'n', 'off', 'disabled', 'disable', 'inactive', 'hidden'].includes(normalized)) return false;
    return fallback;
}

function isConfigRowEnabled(row = {}) {
    if (row.active !== undefined && row.active !== null && row.active !== '') {
        return isEnabledFlag(row.active, true);
    }
    if (row.status !== undefined && row.status !== null && row.status !== '') {
        return isEnabledFlag(row.status, true);
    }
    return true;
}

function pickPreferredConfigRow(rows = []) {
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const enabledRows = rows.filter(isConfigRowEnabled);
    const source = enabledRows.length ? enabledRows : rows.slice();
    return source.sort((a, b) => {
        const timeDiff = parseTimestamp(b.updated_at || b.created_at) - parseTimestamp(a.updated_at || a.created_at);
        if (timeDiff !== 0) return timeDiff;
        return String(b._id || b.id || '').localeCompare(String(a._id || a.id || ''));
    })[0] || null;
}

async function getConfigByKey(key) {
    const res = await db.collection('configs')
        .where(_.or([{ config_key: key }, { key }]))
        .limit(20)
        .get()
        .catch(() => ({ data: [] }));
    const row = pickPreferredConfigRow(res.data || []);
    if (row) return row;
    const legacyRes = await db.collection('app_configs')
        .where(_.or([{ config_key: key }, { key }]))
        .limit(20)
        .get()
        .catch(() => ({ data: [] }));
    return pickPreferredConfigRow(legacyRes.data || []);
}

async function getConfigByKeys(keys = []) {
    for (const key of keys) {
        const row = await getConfigByKey(key);
        if (row) return row;
    }
    return null;
}

async function loadMembershipConfig() {
    const [memberLevelRow, growthTierRow, growthRuleRow, commercePolicyRow, purchaseLevelRow, pointLevelRow, pointRuleRow, upgradeRuleRow] = await Promise.all([
        getConfigByKey('member_level_config'),
        getConfigByKey('growth_tier_config'),
        getConfigByKey('growth_rule_config'),
        getConfigByKey('commerce_policy_config'),
        getConfigByKey('purchase_level_config'),
        getConfigByKey('point_level_config'),
        getConfigByKey('point_rule_config'),
        getConfigByKey('member_upgrade_rule_config')
    ]);

    const growthTiers = parseConfigValue(growthTierRow, []);
    const memberLevels = parseConfigValue(memberLevelRow, []);
    return {
        member_levels: Array.isArray(memberLevels) ? memberLevels : [],
        growth_tiers: Array.isArray(growthTiers) ? growthTiers : [],
        growth_rules: parseConfigValue(growthRuleRow, {}),
        commerce_policy: parseConfigValue(commercePolicyRow, {}),
        purchase_levels: parseConfigValue(purchaseLevelRow, []),
        point_levels: parseConfigValue(pointLevelRow, []),
        point_rules: parseConfigValue(pointRuleRow, {}),
        upgrade_rules: {
            ...DEFAULT_AGENT_UPGRADE_RULES,
            ...parseConfigValue(upgradeRuleRow, {})
        }
    };
}

async function loadAgentUpgradeRules() {
    const row = await getConfigByKeys([
        'member_upgrade_rule_config',
        'agent_system_upgrade-rules',
        'agent_system_upgrade_rules'
    ]);
    return {
        ...DEFAULT_AGENT_UPGRADE_RULES,
        ...parseConfigValue(row, {})
    };
}

function discountText(discount) {
    void discount;
    return '积分权益';
}

function normalizeGrowthTiers(rows = []) {
    return rows
        .map((row, index) => ({
            level: toNum(row.level != null ? row.level : index + 1, index + 1),
            name: row.name || `成长档位${index + 1}`,
            min: toNum(row.min != null ? row.min : row.growth_threshold, 0),
            discount: 1,
            discountText: discountText(1),
            desc: row.desc || row.description || '',
            enabled: row.enabled !== false
        }))
        .sort((a, b) => a.min - b.min);
}

function normalizeMemberLevels(rows = []) {
    return rows
        .map((row) => ({
            ...row,
            level: toNum(row.level, 0),
            name: row.name || '代理等级',
            discount_rate: 1,
            discountText: discountText(1),
            perks: Array.isArray(row.perks)
                ? row.perks
                : [row.description || row.desc || row.benefits].filter(Boolean)
        }))
        .sort((a, b) => a.level - b.level);
}

function userRelationIds(user = {}) {
    const ids = [user.id, user._legacy_id, user._id].filter((value) => value !== null && value !== undefined && value !== '');
    const out = [];
    ids.forEach((id) => {
        out.push(id);
        const num = Number(id);
        if (Number.isFinite(num)) out.push(num);
        out.push(String(id));
    });
    return [...new Set(out.map((item) => `${typeof item}:${item}`))].map((key) => {
        const [, value] = key.split(':');
        const numeric = Number(value);
        return key.startsWith('number:') && Number.isFinite(numeric) ? numeric : value;
    });
}

function directRelationWhere(user = {}) {
    const clauses = [];
    if (user.openid) clauses.push({ referrer_openid: user.openid });
    const ids = userRelationIds(user);
    if (ids.length) clauses.push({ parent_id: _.in(ids) });
    if (!clauses.length) return { referrer_openid: '__none__' };
    return clauses.length === 1 ? clauses[0] : _.or(clauses);
}

async function getDirectMembers(user = {}) {
    if (!user || !user.openid) return [];
    return getAllRecords(db, 'users', directRelationWhere(user)).catch(() => []);
}

async function getRechargeTotal(openid) {
    if (!openid) return 0;
    const rows = await getAllRecords(db, 'wallet_recharge_orders', { openid }).catch(() => []);
    return rows
        .filter((row) => ['paid', 'completed', 'success'].includes(String(row.status || '').toLowerCase()))
        .reduce((sum, row) => sum + toNum(row.amount, 0), 0);
}

function isEffectiveUpgradeOrder(order = {}, effectiveDays = DEFAULT_AGENT_UPGRADE_RULES.effective_order_days) {
    const status = String(order.status || '').toLowerCase();
    if (['cancelled', 'canceled', 'refunded', 'pending', 'pending_payment', 'after_sale', 'refunding'].includes(status)) {
        return false;
    }
    if (toNum(order.refunded_cash_total, 0) > 0 || order.has_partial_refund === true) {
        return false;
    }
    const confirmedAt = parseTimestamp(order.confirmed_at || order.completed_at || order.auto_confirmed_at);
    if (!confirmedAt) return false;
    const cutoff = Date.now() - Math.max(0, effectiveDays) * 24 * 60 * 60 * 1000;
    return confirmedAt <= cutoff;
}

async function getEffectiveOrderSales(openid, effectiveDays = DEFAULT_AGENT_UPGRADE_RULES.effective_order_days) {
    if (!openid) return 0;
    const rows = await getAllRecords(db, 'orders', { openid }).catch(() => []);
    return roundMoney(rows.reduce((sum, row) => {
        if (!isEffectiveUpgradeOrder(row, effectiveDays)) return sum;
        return sum + toNum(row.pay_amount ?? row.actual_price ?? row.total_amount, 0);
    }, 0));
}

function deriveEligibleRoleLevel(currentRoleLevel = 0, effectiveSales = 0, directMembers = [], rechargeTotal = 0, upgradeRules = DEFAULT_AGENT_UPGRADE_RULES) {
    const totalSpent = toNum(effectiveSales, 0);
    let nextRoleLevel = toNum(currentRoleLevel, 0);

    if (totalSpent >= toNum(upgradeRules.c1_min_purchase, DEFAULT_AGENT_UPGRADE_RULES.c1_min_purchase)) {
        nextRoleLevel = Math.max(nextRoleLevel, 1);
    }

    const c1OrAboveCount = directMembers.filter((member) => toNum(member.role_level ?? member.distributor_level, 0) >= 1).length;
    if (
        totalSpent >= toNum(upgradeRules.c2_min_sales, DEFAULT_AGENT_UPGRADE_RULES.c2_min_sales)
        && c1OrAboveCount >= toNum(upgradeRules.c2_referee_count, DEFAULT_AGENT_UPGRADE_RULES.c2_referee_count)
    ) {
        nextRoleLevel = Math.max(nextRoleLevel, 2);
    }

    if (
        c1OrAboveCount >= toNum(upgradeRules.b1_referee_count, DEFAULT_AGENT_UPGRADE_RULES.b1_referee_count)
        || rechargeTotal >= toNum(upgradeRules.b1_recharge, DEFAULT_AGENT_UPGRADE_RULES.b1_recharge)
    ) {
        nextRoleLevel = Math.max(nextRoleLevel, 3);
    }

    const b1OrAboveCount = directMembers.filter((member) => toNum(member.role_level ?? member.distributor_level, 0) >= 3).length;
    if (
        b1OrAboveCount >= toNum(upgradeRules.b2_referee_count, DEFAULT_AGENT_UPGRADE_RULES.b2_referee_count)
        || rechargeTotal >= toNum(upgradeRules.b2_recharge, DEFAULT_AGENT_UPGRADE_RULES.b2_recharge)
    ) {
        nextRoleLevel = Math.max(nextRoleLevel, 4);
    }

    const b2OrAboveCount = directMembers.filter((member) => toNum(member.role_level ?? member.distributor_level, 0) >= 4).length;
    if (
        rechargeTotal >= toNum(upgradeRules.b3_recharge, DEFAULT_AGENT_UPGRADE_RULES.b3_recharge)
        || b1OrAboveCount >= toNum(upgradeRules.b3_referee_b1_count, DEFAULT_AGENT_UPGRADE_RULES.b3_referee_b1_count)
        || b2OrAboveCount >= toNum(upgradeRules.b3_referee_b2_count, DEFAULT_AGENT_UPGRADE_RULES.b3_referee_b2_count)
    ) {
        nextRoleLevel = Math.max(nextRoleLevel, 5);
    }

    return nextRoleLevel;
}

async function evaluateAgentUpgrade(openid) {
    const user = await userGrowth.getUser(openid);
    if (!user) throw notFound('用户不存在');
    const [upgradeRules, membershipConfig] = await Promise.all([
        loadAgentUpgradeRules(),
        loadMembershipConfig()
    ]);
    const [directMembers, rechargeTotal, effectiveSales] = await Promise.all([
        getDirectMembers(user),
        getRechargeTotal(openid),
        getEffectiveOrderSales(openid, toNum(upgradeRules.effective_order_days, DEFAULT_AGENT_UPGRADE_RULES.effective_order_days))
    ]);
    const memberLevels = normalizeMemberLevels(membershipConfig.member_levels);
    const currentRoleLevel = toNum(user.role_level, 0);
    const nextRoleLevel = deriveEligibleRoleLevel(currentRoleLevel, effectiveSales, directMembers, rechargeTotal, upgradeRules);
    const roleMeta = memberLevels.find((item) => Number(item.level) === nextRoleLevel);
    return {
        user,
        memberLevels,
        upgradeRules,
        currentRoleLevel,
        nextRoleLevel,
        rechargeTotal,
        effectiveSales,
        directMembers,
        roleName: roleMeta?.name || DEFAULT_ROLE_NAMES[nextRoleLevel] || '普通用户',
        discountRate: 1
    };
}

async function syncEligibleRoleLevelIfNeeded(openid) {
    const evaluation = await evaluateAgentUpgrade(openid);
    if (evaluation.nextRoleLevel <= evaluation.currentRoleLevel) {
        return { ...evaluation, synced: false };
    }
    const nextDistributorLevel = Math.max(
        toNum(evaluation.user.distributor_level != null ? evaluation.user.distributor_level : evaluation.user.agent_level, 0),
        evaluation.nextRoleLevel
    );
    await db.collection('users').where({ openid }).update({
        data: {
            role_level: evaluation.nextRoleLevel,
            role_name: evaluation.roleName,
            distributor_level: nextDistributorLevel,
            agent_level: nextDistributorLevel,
            participate_distribution: 1,
            discount_rate: 1,
            role_upgraded_at: db.serverDate(),
            updated_at: db.serverDate()
        }
    });
    const refreshedUser = await userGrowth.getUser(openid);
    return {
        ...evaluation,
        synced: true,
        currentRoleLevel: evaluation.nextRoleLevel,
        user: refreshedUser || {
            ...evaluation.user,
            role_level: evaluation.nextRoleLevel,
            role_name: evaluation.roleName,
            distributor_level: nextDistributorLevel,
            agent_level: nextDistributorLevel,
            discount_rate: 1
        }
    };
}

function normalizeStation(row = {}) {
    const latitude = row.latitude != null ? row.latitude : row.lat;
    const longitude = row.longitude != null ? row.longitude : row.lng;
    const la = Number(latitude);
    const lo = Number(longitude);
    const hasCoord = Number.isFinite(la) && Number.isFinite(lo);
    return {
        ...row,
        id: row.id || row._legacy_id || row._id,
        latitude: hasCoord ? la : null,
        longitude: hasCoord ? lo : null,
        coordinate_missing: !hasCoord,
        address: row.address || '',
        province: row.province || '',
        city: row.city || '',
        district: row.district || ''
    };
}

async function findUserByOpenid(openid) {
    if (!openid) return null;
    const res = await db.collection('users')
        .where({ openid })
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));
    return res.data && res.data[0] ? res.data[0] : null;
}

function buildUserIdCandidates(user = {}) {
    return [user.id, user._legacy_id, user._id]
        .filter((id) => id !== null && id !== undefined && id !== '');
}

async function getPickupVerifyScope(openid) {
    if (!openid) {
        return {
            hasVerifyAccess: false,
            stations: [],
            stationCount: 0,
            requiresStationSelection: false
        };
    }
    const [stationRes, staffRes, user] = await Promise.all([
        getAllRecords(db, 'stations', { status: 'active' }).catch(() => []),
        getAllRecords(db, 'station_staff', { status: 'active' }).catch(() => []),
        findUserByOpenid(openid)
    ]);
    const stations = (stationRes || []).map(normalizeStation);
    const userIds = user ? buildUserIdCandidates(user).map((id) => String(id)) : [];
    const activeStaff = (staffRes || []).filter((row) => {
        if (toNum(row.can_verify, 0) !== 1) return false;
        if (String(row.openid || '') === String(openid)) return true;
        return userIds.includes(String(row.user_id || ''));
    });
    const allowedStationIds = new Set(activeStaff.map((row) => String(row.station_id || '')));
    const scopedStations = stations.filter((station) => allowedStationIds.has(String(station.id)));
    return {
        hasVerifyAccess: scopedStations.length > 0,
        stations: scopedStations,
        stationCount: scopedStations.length,
        requiresStationSelection: scopedStations.length > 1
    };
}

async function reverseGeocode(latitude, longitude) {
    const key = String(process.env.TENCENT_MAP_KEY || '').trim();
    if (!key || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return { region: null, configured: !!key, error: '' };
    }
    const path = `/ws/geocoder/v1/?location=${encodeURIComponent(`${latitude},${longitude}`)}&key=${encodeURIComponent(key)}`;
    return new Promise((resolve) => {
        const req = https.request({
            hostname: 'apis.map.qq.com',
            path,
            method: 'GET',
            timeout: 10000
        }, (res) => {
            let body = '';
            res.on('data', (chunk) => { body += chunk; });
            res.on('end', () => {
                try {
                    const json = JSON.parse(body);
                    const ac = json.result && json.result.address_component;
                    if (json.status === 0 && ac) {
                        resolve({
                            configured: true,
                            error: '',
                            region: {
                                province: String(ac.province || '').trim(),
                                city: String(ac.city || '').trim(),
                                district: String(ac.district || '').trim(),
                                street: String(ac.street || '').trim()
                            }
                        });
                        return;
                    }
                    resolve({ region: null, configured: true, error: String(json.message || '').trim() });
                    return;
                } catch (_) {}
                resolve({ region: null, configured: true, error: '地图接口返回异常' });
            });
        });
        req.on('error', () => resolve({ region: null, configured: true, error: '地图接口请求失败' }));
        req.on('timeout', () => {
            req.destroy();
            resolve({ region: null, configured: true, error: '地图接口请求超时' });
        });
        req.end();
    });
}

// 统一的异步处理包装
const asyncHandler = (handler) => async (...args) => {
    try {
        return await handler(...args);
    } catch (err) {
        if (err instanceof CloudBaseError) throw err;
        if (err && typeof err === 'object' && 'code' in err && 'success' in err && 'message' in err) throw err;
        throw serverError(err.message || '操作失败');
    }
};

function pickAddressText(value) {
    if (value === undefined || value === null) return '';
    return String(value).trim();
}

function resolveAddressReceiverName(source = {}) {
    return pickAddressText(
        source.receiver_name
        || source.recipient
        || source.contact_name
        || source.name
    );
}

function resolveAddressPhone(source = {}) {
    return pickAddressText(source.phone || source.contact_phone);
}

function resolveAddressDetail(source = {}) {
    return pickAddressText(source.detail || source.detail_address || source.address);
}

function normalizeAddressRecord(address = {}) {
    const receiverName = resolveAddressReceiverName(address);
    const phone = resolveAddressPhone(address);
    const detail = resolveAddressDetail(address);
    const isDefault = address.is_default === true || address.is_default === 1 || address.is_default === '1';

    return {
        ...address,
        id: address.id || address._id || address.address_id || '',
        receiver_name: receiverName,
        recipient: receiverName,
        name: pickAddressText(address.name) || receiverName,
        phone,
        contact_phone: pickAddressText(address.contact_phone) || phone,
        province: pickAddressText(address.province),
        city: pickAddressText(address.city),
        district: pickAddressText(address.district),
        detail,
        detail_address: pickAddressText(address.detail_address) || detail,
        is_default: isDefault
    };
}

function pickDefaultAddressRecord(addresses = []) {
    if (!Array.isArray(addresses) || addresses.length === 0) return null;
    return addresses.find((item) => item && item.is_default) || addresses[0] || null;
}

function buildAddressWriteData(params = {}) {
    const receiverName = resolveAddressReceiverName(params);
    const detail = resolveAddressDetail(params);

    return {
        receiver_name: receiverName,
        recipient: receiverName,
        phone: resolveAddressPhone(params),
        province: pickAddressText(params.province),
        city: pickAddressText(params.city),
        district: pickAddressText(params.district),
        detail,
        detail_address: detail,
        is_default: params.is_default === true || params.is_default === 1 || params.is_default === '1'
    };
}

// 主处理函数
const handleAction = {
    // ===== 个人资料 =====
    'profile': asyncHandler(async (openid, params) => {
        await syncEligibleRoleLevelIfNeeded(openid);
        const user = await userProfile.getProfile(openid);
        if (!user) throw notFound('用户不存在');
        return success(userProfile.formatUser(user));
    }),

    'getProfile': asyncHandler(async (openid, params) => {
        await syncEligibleRoleLevelIfNeeded(openid);
        const user = await userProfile.getProfile(openid);
        if (!user) throw notFound('用户不存在');
        return success(userProfile.formatUser(user));
    }),

    'updateProfile': asyncHandler(async (openid, params) => {
        if (!params || Object.keys(params).length === 0) {
            throw badRequest('缺少更新数据');
        }
        const user = await userProfile.updateProfile(openid, params);
        return success(userProfile.formatUser(user));
    }),

    'getStats': asyncHandler(async (openid) => {
        await syncEligibleRoleLevelIfNeeded(openid);
        const user = await userGrowth.getUser(openid);
        if (!user) throw notFound('用户不存在');
        return success(userGrowth.buildUserStats(user));
    }),

    'balance': asyncHandler(async (openid) => {
        await syncEligibleRoleLevelIfNeeded(openid);
        const user = await userGrowth.getUser(openid);
        if (!user) throw notFound('用户不存在');
        return success(userGrowth.buildUserStats(user));
    }),

    'growth': asyncHandler(async (openid) => {
        const syncResult = await syncEligibleRoleLevelIfNeeded(openid);
        const user = syncResult.user || await userGrowth.getUser(openid);
        if (!user) throw notFound('用户不存在');
        const config = await loadMembershipConfig();
        const growthTiers = normalizeGrowthTiers(config.growth_tiers);
        const points = toNum(user.points || user.growth_value, 0);
        const tier = calculateTier(points, growthTiers.length ? growthTiers : null);
        return success({
            points,
            tier: tier.level,
            nextTierPoints: tier.nextThreshold,
            progress: tier.pointsNeeded
        });
    }),

    'memberTierMeta': asyncHandler(async (openid) => {
        const syncResult = await syncEligibleRoleLevelIfNeeded(openid);
        const user = syncResult.user || await userGrowth.getUser(openid);
        if (!user) throw notFound('用户不存在');
        const config = await loadMembershipConfig();
        const growthTiers = normalizeGrowthTiers(config.growth_tiers);
        const memberLevels = normalizeMemberLevels(config.member_levels);
        const points = toNum(user.points || user.growth_value, 0);
        const tier = calculateTier(points, growthTiers.length ? growthTiers : null);
        const roleLevel = toNum(user.role_level, 0);
        const roleLevelConfig = memberLevels.find((item) => Number(item.level) === roleLevel);
        return success({
            current_level: roleLevel,
            current_name: user.role_name || roleLevelConfig?.name || '普通用户',
            points,
            next_level: tier.nextLevel,
            next_level_points: tier.nextThreshold,
            progress: tier.pointsNeeded,
            current: {
                role_level: roleLevel,
                role_name: user.role_name || roleLevelConfig?.name || '普通用户',
                current_growth_tier: tier
            },
            growth_tiers: growthTiers,
            member_levels: memberLevels,
            growth_rules: config.growth_rules || {},
            upgrade_rules: config.upgrade_rules || DEFAULT_AGENT_UPGRADE_RULES,
            point_levels: Array.isArray(config.point_levels) ? config.point_levels : [],
            point_rules: config.point_rules || {}
        });
    }),

    // ===== 地址 =====
    'listAddresses': asyncHandler(async (openid) => {
        const addresses = await withTransientDbReadRetry(
            () => userAddresses.listAddresses(openid),
            { action: 'listAddresses', openid }
        );
        return success({ list: addresses.map(normalizeAddressRecord) });
    }),

    'getDefaultAddress': asyncHandler(async (openid) => {
        const addresses = await withTransientDbReadRetry(
            () => userAddresses.listAddresses(openid),
            { action: 'getDefaultAddress', openid }
        );
        const address = pickDefaultAddressRecord(addresses);
        return success(address ? normalizeAddressRecord(address) : null);
    }),

    'getAddressDetail': asyncHandler(async (openid, params) => {
        const id = params.address_id || params.id;
        if (!id) throw badRequest('缺少地址 ID');
        const addresses = await withTransientDbReadRetry(
            () => userAddresses.listAddresses(openid),
            { action: 'getAddressDetail', openid }
        );
        const addr = addresses.find(a => a._id === id);
        if (!addr) throw notFound('地址不存在');
        return success(normalizeAddressRecord(addr));
    }),

    'addAddress': asyncHandler(async (openid, params) => {
        const addressData = buildAddressWriteData(params);
        if (!addressData.receiver_name) {
            throw badRequest('请填写收货人姓名');
        }
        if (!addressData.province || !addressData.city || !addressData.detail) {
            throw badRequest('缺少必要地址信息');
        }
        const address = await userAddresses.addAddress(openid, addressData);
        return success({ id: address._id });
    }),

    'updateAddress': asyncHandler(async (openid, params) => {
        const id = params.address_id || params.id;
        if (!id) throw badRequest('缺少地址 ID');
        const addressData = buildAddressWriteData(params);
        if (!addressData.receiver_name) {
            throw badRequest('请填写收货人姓名');
        }
        if (!addressData.province || !addressData.city || !addressData.detail) {
            throw badRequest('缺少必要地址信息');
        }
        await userAddresses.updateAddress(id, addressData);
        return success(null);
    }),

    'deleteAddress': asyncHandler(async (openid, params) => {
        const id = params.address_id || params.id;
        if (!id) throw badRequest('缺少地址 ID');
        await userAddresses.deleteAddress(id);
        return success(null);
    }),

    'setDefaultAddress': asyncHandler(async (openid, params) => {
        const id = params.address_id || params.id;
        if (!id) throw badRequest('缺少地址 ID');
        await userAddresses.setDefaultAddress(openid, id);
        return success(null);
    }),

    // ===== 优惠券 =====
    'listCoupons': asyncHandler(async (openid, params) => {
        const coupons = await withTransientDbReadRetry(
            () => userCoupons.listCoupons(openid, params && params.status),
            { action: 'listCoupons', openid }
        );
        return success({ list: coupons });
    }),

    'getCouponInfo': asyncHandler(async (_openid, params) => {
        const ticketId = String(params.ticket || params.ticket_id || params.t || '').trim();
        if (ticketId) {
            const ticketInfo = await userCouponTickets.getClaimTicketInfo(ticketId);
            return success({
                found: !!ticketInfo.found,
                ticket_status: ticketInfo.ticket_status || 'invalid',
                coupon: ticketInfo.coupon || null
            });
        }

        const id = String(params.coupon_id || params.id || '');
        if (!id) throw badRequest('缺少优惠券 ID');
        const numId = Number(id);
        const hasNumeric = Number.isFinite(numId) && !isNaN(numId);
        let coupon = null;
        if (hasNumeric) {
            const r = await db.collection('coupons').where({ id: numId }).limit(1).get().catch(() => ({ data: [] }));
            coupon = r.data && r.data[0];
        }
        if (!coupon) {
            const r2 = await db.collection('coupons').where({ id: id }).limit(1).get().catch(() => ({ data: [] }));
            coupon = r2.data && r2.data[0];
        }
        if (!coupon) {
            try { const r3 = await db.collection('coupons').doc(id).get(); coupon = r3.data; } catch (_) {}
        }
        if (!coupon) return success({ coupon: null, found: false });
        const couponId = coupon.id != null ? String(coupon.id) : coupon._id;
        return success({
            found: true,
            coupon: {
                id: couponId,
                name: coupon.name,
                type: coupon.type || coupon.coupon_type || 'fixed',
                value: coupon.value ?? coupon.coupon_value ?? 0,
                min_purchase: coupon.min_purchase ?? 0,
                valid_days: coupon.valid_days ?? 30,
                description: coupon.description || '',
                stock: coupon.stock ?? -1,
                is_active: coupon.is_active ?? 1
            }
        });
    }),

    'claimCoupon': asyncHandler(async (openid, params) => {
        const ticketId = params.ticket || params.ticket_id || params.t;
        if (ticketId) {
            const claimedByTicket = await userCouponTickets.claimCouponByTicket(openid, ticketId);
            return success(claimedByTicket);
        }
        const id = params.coupon_id || params.id;
        if (!id) throw badRequest('缺少优惠券 ID');
        const claimed = await userCoupons.claimCoupon(openid, id);
        return success(claimed);
    }),

    'listDepositOrders': asyncHandler(async (openid) => {
        const orders = await userDepositOrders.listDepositOrders(openid);
        return success({ list: orders });
    }),

    'claimWelcomeCoupons': asyncHandler(async (openid) => {
        const count = await userCoupons.claimWelcomeCoupons(openid);
        return success({ claimed_count: count });
    }),

    'availableCoupons': asyncHandler(async (openid, params) => {
        const coupons = await withTransientDbReadRetry(
            () => userWallet.availableCoupons(openid, params),
            { action: 'availableCoupons', openid }
        );
        return success({ list: coupons });
    }),

    // ===== 收藏 =====
    'getFavorites': asyncHandler(async (openid, params) => {
        const favorites = await userFavorites.getFavorites(openid, params);
        return success({ list: favorites });
    }),

    'addFavorite': asyncHandler(async (openid, params) => {
        const productId = params.product_id || params.id;
        if (!productId) throw badRequest('缺少商品 ID');
        const result = await userFavorites.addFavorite(openid, productId);
        return success(result);
    }),

    'removeFavorite': asyncHandler(async (openid, params) => {
        const productId = params.product_id || params.id;
        if (!productId) throw badRequest('缺少商品 ID');
        const result = await userFavorites.removeFavorite(openid, productId);
        return success(result);
    }),

    'removeFavoriteById': asyncHandler(async (openid, params) => {
        const id = params.favorite_id || params.id;
        if (!id) throw badRequest('缺少收藏记录 ID');
        const result = await userFavorites.removeFavoriteById(openid, id);
        return success(result);
    }),

    'favoriteStatus': asyncHandler(async (openid, params) => {
        const productId = params.product_id || params.id;
        const result = await userFavorites.getFavoriteStatus(openid, productId);
        return success(result);
    }),

    'syncFavorites': asyncHandler(async (openid, params) => {
        const result = await userFavorites.syncFavorites(openid, params.product_ids || []);
        return success(result);
    }),

    'clearAllFavorites': asyncHandler(async (openid) => {
        const result = await userFavorites.clearAllFavorites(openid);
        return success(result);
    }),

    // ===== 通知 =====
    'listNotifications': asyncHandler(async (openid, params) => {
        const result = await userNotifications.listNotifications(openid, params);
        return success(result);
    }),

    'markRead': asyncHandler(async (openid, params) => {
        const id = params.notification_id || params.id;
        if (!id) throw badRequest('缺少通知 ID');
        const result = await userNotifications.markRead(openid, id);
        return success(result);
    }),

    // ===== 钱包 / 积分 =====
    'walletInfo': asyncHandler(async (openid) => {
        const result = await userWallet.getWalletInfo(openid);
        return success(result);
    }),

    'walletCommissions': asyncHandler(async (openid, params) => {
        const result = await userWallet.walletCommissions(openid, params);
        // result 现在是 { list, total, page, limit }
        return success(result);
    }),

    'pointsAccount': asyncHandler(async (openid) => {
        const result = await withTransientDbReadRetry(
            () => userWallet.pointsAccount(openid),
            { action: 'pointsAccount', openid }
        );
        return success(result);
    }),

    'pointsSignInStatus': asyncHandler(async (openid) => {
        const result = await userWallet.pointsSignInStatus(openid);
        return success(result);
    }),

    'pointsSignIn': asyncHandler(async (openid) => {
        const result = await userWallet.pointsSignIn(openid);
        return success(result);
    }),

    'pointsTasks': asyncHandler(async (openid) => {
        const result = await userWallet.pointsTasks(openid);
        return success({ list: result });
    }),

    'pointsLogs': asyncHandler(async (openid, params) => {
        const result = await userWallet.pointsLogs(openid, params);
        return success({ list: result });
    }),

    // ===== 升级 / 其他 =====
    'upgradeEligibility': asyncHandler(async (openid) => {
        const evaluation = await evaluateAgentUpgrade(openid);
        const points = toNum(evaluation.user.points || evaluation.user.growth_value, 0);
        return success({
            current_level: evaluation.currentRoleLevel,
            current_name: evaluation.user.role_name || DEFAULT_ROLE_NAMES[evaluation.currentRoleLevel] || '普通用户',
            current_points: points,
            can_upgrade: evaluation.nextRoleLevel > evaluation.currentRoleLevel,
            next_level: evaluation.nextRoleLevel,
            next_name: evaluation.roleName,
            required_points: null,
            direct_member_count: evaluation.directMembers.length,
            recharge_total: Number(evaluation.rechargeTotal.toFixed(2)),
            rules: evaluation.upgradeRules
        });
    }),

    'upgrade': asyncHandler(async (openid, params) => {
        const evaluation = await evaluateAgentUpgrade(openid);
        if (evaluation.nextRoleLevel <= evaluation.currentRoleLevel) {
            throw badRequest('当前未满足升级条件');
        }
        const nextDistributorLevel = Math.max(
            toNum(evaluation.user.distributor_level != null ? evaluation.user.distributor_level : evaluation.user.agent_level, 0),
            evaluation.nextRoleLevel
        );
        await db.collection('users').where({ openid }).update({
            data: {
                role_level: evaluation.nextRoleLevel,
                role_name: evaluation.roleName,
                distributor_level: nextDistributorLevel,
                agent_level: nextDistributorLevel,
                participate_distribution: 1,
                discount_rate: 1,
                updated_at: db.serverDate()
            },
        });
        return success({ new_level: evaluation.nextRoleLevel, role_name: evaluation.roleName });
    }),

    'upgradeApply': asyncHandler(async (openid, params) => {
        const user = await userGrowth.getUser(openid);
        if (!user) throw notFound('用户不存在');
        const pathType = String(params.path_type || 'standard').trim() || 'standard';
        const leaderId = params.leader_id || params.parent_id || null;
        const existing = await db.collection('upgrade_applications')
            .where({ openid, path_type: pathType, status: _.in(['pending', 'approved']) })
            .limit(1)
            .get()
            .catch(() => ({ data: [] }));
        if (existing.data && existing.data[0]) {
            return success({ success: true, id: existing.data[0]._id, status: existing.data[0].status, message: '申请已存在' });
        }

        const result = await db.collection('upgrade_applications').add({
            data: {
                openid,
                user_id: user._id || user.id || '',
                role_level: toNum(user.role_level, 0),
                role_name: user.role_name || DEFAULT_ROLE_NAMES[toNum(user.role_level, 0)] || '普通用户',
                path_type: pathType,
                leader_id: leaderId,
                status: 'pending',
                remark: String(params.remark || '').trim(),
                created_at: db.serverDate(),
                updatedAt: db.serverDate()
            }
        });
        return success({ success: true, id: result._id, message: '申请已提交' });
    }),

    'getPreferences': asyncHandler(async (openid) => {
        const user = await userProfile.getProfile(openid);
        if (!user) throw notFound('用户不存在');
        return success(user.preferences || {});
    }),

    'submitPreferences': asyncHandler(async (openid, params) => {
        await db.collection('users').where({ openid }).update({
            data: { preferences: params, updated_at: db.serverDate() },
        });
        return success({ success: true });
    }),

    'applyInitialPassword': asyncHandler(async (openid, params) => {
        throw badRequest('该功能暂未开放');
    }),

    'listStations': asyncHandler(async (openid, params) => {
        const res = await getAllRecords(db, 'stations', { status: 'active' }).catch(() => []);
        return success({ list: (res || []).map(normalizeStation) });
    }),

    'getPickupScope': asyncHandler(async (openid, params) => {
        const scope = await getPickupVerifyScope(openid);
        return success({
            has_verify_access: scope.hasVerifyAccess,
            stations: scope.stations,
            station_count: scope.stationCount,
            requires_station_selection: scope.requiresStationSelection
        });
    }),

    'pickupOptions': asyncHandler(async (openid, params) => {
        const res = await getAllRecords(db, 'stations', { status: 'active' }).catch(() => []);
        return success({ list: (res || []).map(normalizeStation).filter((row) => Number(row.is_pickup_point ?? row.pickup_enabled ?? 1) === 1) });
    }),

    'regionFromPoint': asyncHandler(async (openid, params) => {
        const lat = Number(params.lat);
        const lng = Number(params.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            throw badRequest('请提供有效 lat、lng');
        }
        return success(await reverseGeocode(lat, lng));
    }),

    'listTickets': asyncHandler(async (openid, params) => {
        return success({ list: [] });
    }),
};

// 别名处理
const aliasMap = {};

exports.main = cloudFunctionWrapper(async (event) => {
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;
    const { action, ...params } = event;
    const publicActions = ['listStations', 'pickupOptions', 'regionFromPoint'];
    const actualAction = aliasMap[action] || action;
    const handler = handleAction[actualAction];

    if (!handler) {
        throw badRequest(`未知 action: ${action}`);
    }

    if (!openid && !publicActions.includes(actualAction)) {
        throw unauthorized('未登录');
    }

    return handler(openid || '', params);
});
