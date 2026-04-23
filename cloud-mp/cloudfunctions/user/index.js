'use strict';

const cloud = require('wx-server-sdk');
const https = require('https');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

const DEFAULT_ROLE_NAMES = {
    0: 'VIP用户',
    1: '初级会员',
    2: '高级会员',
    3: '推广合伙人',
    4: '运营合伙人',
    5: '区域合伙人',
    6: '店长'
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
const { calculateTier, buildGrowthProgress } = require('./shared/growth');
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
const portalPassword = require('./user-portal-password');
const {
    resolveRoleLevel,
    resolveRoleName,
    resolveGoodsFundBalance
} = require('./user-contract');
const {
    pickString,
    rowMatchesLookup,
    sortStationsByPickupPreference,
    summarizeStationStockForItems
} = require('./shared/pickup-station-stock');
const { assertPortalPassword } = require('./user-portal-password');

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
    return '成长会员权益';
}

function resolveGrowthValue(source = {}) {
    return toNum(source.growth_value, 0);
}

function resolvePointsValue(source = {}) {
    return toNum(source.points != null ? source.points : source.growth_value, 0);
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

/** 与小程序「我的」页 growthDisplay / applyGrowthDisplay 字段对齐 */
function mapGrowthProgressToFrontend(raw) {
    if (!raw || !raw.tier) {
        return {
            current: { name: '' },
            next: null,
            percent: 0,
            next_threshold: null
        };
    }
    const threshold = raw.nextLevel && raw.nextLevel.threshold != null ? Number(raw.nextLevel.threshold) : null;
    return {
        current: { name: raw.tier.name || '' },
        next: raw.nextLevel ? { name: raw.nextLevel.name || '' } : null,
        percent: Number.isFinite(raw.progress) ? raw.progress : 0,
        next_threshold: Number.isFinite(threshold) ? threshold : null
    };
}

async function enrichUserWithGrowthProgress(formattedUser) {
    if (!formattedUser) return formattedUser;
    const growthValue = resolveGrowthValue(formattedUser);
    const config = await loadMembershipConfig();
    const growthTiers = normalizeGrowthTiers(config.growth_tiers);
    const raw = buildGrowthProgress(growthValue, growthTiers.length ? growthTiers : null);
    return {
        ...formattedUser,
        growth_value: growthValue,
        growth_progress: mapGrowthProgressToFrontend(raw)
    };
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

function isTestOrder(order = {}) {
    return order.is_test_order === true || order.is_test_order === 1 || order.is_test_order === '1';
}

function isEffectiveUpgradeOrder(order = {}, effectiveDays = DEFAULT_AGENT_UPGRADE_RULES.effective_order_days) {
    if (isTestOrder(order)) return false;
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
        roleName: roleMeta?.name || DEFAULT_ROLE_NAMES[nextRoleLevel] || 'VIP用户',
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

function parsePickupItemsParam(rawItems) {
    if (!rawItems) return [];
    let source = rawItems;
    if (typeof rawItems === 'string') {
        try {
            source = JSON.parse(rawItems);
        } catch (_) {
            return [];
        }
    }
    if (!Array.isArray(source)) return [];
    return source
        .map((item) => ({
            product_id: pickString(item && item.product_id),
            sku_id: pickString(item && item.sku_id),
            quantity: Math.max(1, toNum(item && (item.quantity ?? item.qty), 1)),
            name: pickString(item && (item.name || item.snapshot_name))
        }))
        .filter((item) => item.product_id);
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
    const [stationRes, staffRes, user, users] = await Promise.all([
        getAllRecords(db, 'stations', { status: 'active' }).catch(() => []),
        getAllRecords(db, 'station_staff', { status: 'active' }).catch(() => []),
        findUserByOpenid(openid),
        getAllRecords(db, 'users').catch(() => [])
    ]);
    const stations = (stationRes || []).map(normalizeStation);
    const userIds = user ? buildUserIdCandidates(user).map((id) => String(id)) : [];
    const userMap = buildStoreManagerUserMap(users || []);
    const relatedStaff = (staffRes || []).filter((row) => {
        if (String(row.openid || '') === String(openid)) return true;
        return userIds.includes(String(row.user_id || ''));
    });
    const allowedStationIds = new Set(relatedStaff.map((row) => String(row.station_id || '')));
    const scopedStations = stations.filter((station) => allowedStationIds.has(String(station.id))).map((station) => {
        const stationStaff = (staffRes || []).filter((row) => String(row.station_id || '') === String(station.id));
        const myStaffRow = relatedStaff.find((row) => String(row.station_id || '') === String(station.id));
        const staffPreview = stationStaff.slice(0, 3).map((row) => {
            const staffUser = getUserByMap(userMap, row.user_id) || getUserByMap(userMap, row.openid);
            return {
                id: row._id || row.id || '',
                user_id: row.user_id || '',
                role: pickString(row.role || 'staff'),
                can_verify: toNum(row.can_verify, 0) === 1,
                user: staffUser ? {
                    nick_name: pickString(staffUser.nickName || staffUser.nickname),
                    nickname: pickString(staffUser.nickName || staffUser.nickname),
                    phone: pickString(staffUser.phone)
                } : {
                    nick_name: '',
                    nickname: '',
                    phone: ''
                }
            };
        });
        return {
            ...station,
            my_role: pickString(myStaffRow?.role || 'staff'),
            can_verify: toNum(myStaffRow?.can_verify, 0) === 1 || pickString(myStaffRow?.role) === 'manager',
            staff_summary: {
                total: stationStaff.length,
                verify_count: stationStaff.filter((row) => toNum(row.can_verify, 0) === 1).length,
                manager_count: stationStaff.filter((row) => pickString(row.role) === 'manager').length,
                preview: staffPreview
            }
        };
    });
    return {
        hasVerifyAccess: scopedStations.some((station) => station.can_verify),
        stations: scopedStations,
        stationCount: scopedStations.length,
        requiresStationSelection: scopedStations.filter((station) => station.can_verify).length > 1,
        managerStationCount: scopedStations.filter((station) => station.my_role === 'manager').length
    };
}

function toIsoString(value) {
    const ts = parseTimestamp(value);
    return ts ? new Date(ts).toISOString() : '';
}

function buildStoreManagerUserMap(users = []) {
    const map = new Map();
    (Array.isArray(users) ? users : []).forEach((user) => {
        [user._id, user.id, user._legacy_id, user.openid].forEach((key) => {
            if (key == null || key === '') return;
            map.set(String(key), user);
        });
    });
    return map;
}

function dedupeRows(rows = []) {
    const merged = new Map();
    (Array.isArray(rows) ? rows : []).forEach((row) => {
        if (!row || typeof row !== 'object') return;
        const key = String(row._id || row.id || row._legacy_id || row.openid || JSON.stringify(row));
        if (!merged.has(key)) merged.set(key, row);
    });
    return Array.from(merged.values());
}

function buildLookupCandidates(values = []) {
    const strings = [];
    const numbers = [];
    [...new Set((Array.isArray(values) ? values : []).filter((value) => value !== null && value !== undefined && value !== ''))]
        .forEach((value) => {
            const str = String(value).trim();
            if (str) strings.push(str);
            const num = Number(value);
            if (Number.isFinite(num)) numbers.push(num);
        });
    return {
        strings: [...new Set(strings)],
        numbers: [...new Set(numbers)]
    };
}

async function queryRecordsByFieldValues(collectionName, field, values = []) {
    const { strings, numbers } = buildLookupCandidates(values);
    const tasks = [];
    if (strings.length) {
        tasks.push(getAllRecords(db, collectionName, { [field]: _.in(strings) }).catch(() => []));
    }
    if (numbers.length) {
        tasks.push(getAllRecords(db, collectionName, { [field]: _.in(numbers) }).catch(() => []));
    }
    if (!tasks.length) return [];
    return dedupeRows((await Promise.all(tasks)).flat());
}

async function queryUsersByLookups(values = []) {
    const { strings, numbers } = buildLookupCandidates(values);
    const [byOpenid, byId, byLegacy, byDoc] = await Promise.all([
        strings.length ? getAllRecords(db, 'users', { openid: _.in(strings) }).catch(() => []) : Promise.resolve([]),
        numbers.length ? getAllRecords(db, 'users', { id: _.in(numbers) }).catch(() => []) : Promise.resolve([]),
        numbers.length ? getAllRecords(db, 'users', { _legacy_id: _.in(numbers) }).catch(() => []) : Promise.resolve([]),
        strings.length ? getAllRecords(db, 'users', { _id: _.in(strings) }).catch(() => []) : Promise.resolve([])
    ]);
    return dedupeRows([...byOpenid, ...byId, ...byLegacy, ...byDoc]);
}

function getUserByMap(userMap, lookup) {
    if (lookup == null || lookup === '') return null;
    return userMap.get(String(lookup)) || null;
}

function buildStoreStaffPreview(staffRows = [], userMap = new Map()) {
    return staffRows.slice(0, 5).map((row) => {
        const staffUser = getUserByMap(userMap, row.user_id) || getUserByMap(userMap, row.openid);
        return {
            id: row._id || row.id || '',
            user_id: row.user_id || '',
            role: pickString(row.role || 'staff'),
            can_verify: toNum(row.can_verify, 0) === 1,
            user: staffUser ? {
                nick_name: pickString(staffUser.nickName || staffUser.nickname),
                nickname: pickString(staffUser.nickName || staffUser.nickname),
                phone: pickString(staffUser.phone)
            } : {
                nick_name: '',
                nickname: '',
                phone: ''
            }
        };
    });
}

function buildStoreManagerStations(stations = [], staffRows = [], users = [], openid, currentUser = null) {
    const userIds = currentUser ? buildUserIdCandidates(currentUser).map((id) => String(id)) : [];
    const userMap = buildStoreManagerUserMap(users);
    const managerRows = (staffRows || []).filter((row) => {
        if (pickString(row.status || 'active') !== 'active') return false;
        if (pickString(row.role) !== 'manager') return false;
        if (String(row.openid || '') === String(openid)) return true;
        return userIds.includes(String(row.user_id || ''));
    });
    const managerStationIds = new Set(managerRows.map((row) => String(row.station_id || '')));
    return (stations || [])
        .filter((station) => managerStationIds.has(String(station.id)))
        .map((station) => {
            const stationStaff = (staffRows || []).filter((row) => String(row.station_id || '') === String(station.id) && pickString(row.status || 'active') === 'active');
            const claimant = getUserByMap(userMap, station.pickup_claimant_id || station.pickup_claimant_openid || station.claimant_id || station.claimant_openid);
            return {
                ...station,
                claimant: claimant ? {
                    id: claimant._id || claimant.id || claimant._legacy_id || '',
                    openid: claimant.openid || '',
                    nick_name: pickString(claimant.nickName || claimant.nickname),
                    nickname: pickString(claimant.nickName || claimant.nickname),
                    phone: pickString(claimant.phone)
                } : null,
                staff_summary: {
                    total: stationStaff.length,
                    verify_count: stationStaff.filter((row) => toNum(row.can_verify, 0) === 1).length,
                    manager_count: stationStaff.filter((row) => pickString(row.role) === 'manager').length,
                    preview: buildStoreStaffPreview(stationStaff, userMap)
                }
            };
        });
}

function summarizeMoneyByType(rows = [], allowedTypes = []) {
    return roundMoney((rows || [])
        .filter((row) => allowedTypes.includes(pickString(row.type)))
        .reduce((sum, row) => sum + toNum(row.amount, 0), 0));
}

function buildStoreManagerOrderSummary(order = {}, context = {}) {
    const item = Array.isArray(order.items) && order.items[0] ? order.items[0] : {};
    const station = context.stationMap.get(String(order.pickup_station_id || '')) || null;
    const verifier = getUserByMap(context.userMap, order.pickup_verified_by);
    const orderKey = String(order._id || order.id || '');
    const orderNo = pickString(order.order_no);
    const orderCommissions = (context.commissions || []).filter((row) => {
        const rowOrderId = pickString(row.order_id);
        const rowOrderNo = pickString(row.order_no);
        return (rowOrderId && rowOrderId === orderKey) || (rowOrderNo && rowOrderNo === orderNo);
    });
    const goodsFundLogs = (context.goodsFundLogs || []).filter((row) => {
        const rowOrderId = pickString(row.order_id);
        const rowOrderNo = pickString(row.order_no);
        return (rowOrderId && rowOrderId === orderKey) || (rowOrderNo && rowOrderNo === orderNo);
    });
    const serviceFeeAmount = summarizeMoneyByType(orderCommissions, ['pickup_service_fee', 'pickup_subsidy']);
    const principalReturnAmount = summarizeMoneyByType(goodsFundLogs, ['pickup_principal_return']);
    const principalReversalAmount = Math.abs(summarizeMoneyByType(goodsFundLogs, ['pickup_principal_reversal']));
    return {
        id: orderKey,
        order_no: orderNo,
        status: pickString(order.status),
        product_name: pickString(item.snapshot_name || item.name || order.product_name),
        product_spec: pickString(item.snapshot_spec || item.spec),
        quantity: Array.isArray(order.items) ? order.items.reduce((sum, current) => sum + Math.max(1, toNum(current.qty || current.quantity, 1)), 0) : Math.max(1, toNum(order.quantity || order.qty, 1)),
        pickup_station_name: pickString(station?.name || order.pickupStation?.name),
        pickup_verified_by: pickString(order.pickup_verified_by),
        pickup_verified_by_name: pickString(verifier?.nickName || verifier?.nickname),
        pickup_verified_at: toIsoString(order.verified_at || order.pickup_verified_at || order.confirmed_at),
        service_fee_amount: serviceFeeAmount,
        principal_return_amount: principalReturnAmount,
        principal_reversal_amount: principalReversalAmount,
        display_pay_amount: roundMoney(toNum(order.pay_amount ?? order.actual_price ?? order.total_amount, 0)).toFixed(2)
    };
}

async function buildStoreManagerWorkbench(openid) {
    const currentUser = await findUserByOpenid(openid);
    const currentUserIds = buildUserIdCandidates(currentUser).map((id) => String(id));
    const [managerRowsByOpenid, managerRowsByUserId] = await Promise.all([
        queryRecordsByFieldValues('station_staff', 'openid', [openid]),
        queryRecordsByFieldValues('station_staff', 'user_id', currentUserIds)
    ]);
    const managerRows = dedupeRows([...managerRowsByOpenid, ...managerRowsByUserId]).filter((row) => {
        return pickString(row.status || 'active') === 'active' && pickString(row.role) === 'manager';
    });
    const managedStationLookups = managerRows.map((row) => row.station_id).filter(Boolean);
    if (!managedStationLookups.length) {
        return {
            summary: {
                station_count: 0,
                pending_order_count: 0,
                recent_verified_count: 0,
                procurement_pending_count: 0,
                service_fee_total: 0,
                principal_return_total: 0
            },
            stations: [],
            pending_orders: [],
            recent_verified_orders: [],
            procurements: []
        };
    }

    const [stationRowsById, stationRowsByLegacy, stationRowsByDoc, stationStaff] = await Promise.all([
        queryRecordsByFieldValues('stations', 'id', managedStationLookups),
        queryRecordsByFieldValues('stations', '_legacy_id', managedStationLookups),
        queryRecordsByFieldValues('stations', '_id', managedStationLookups),
        queryRecordsByFieldValues('station_staff', 'station_id', managedStationLookups)
    ]);
    const normalizedStationRows = dedupeRows([...stationRowsById, ...stationRowsByLegacy, ...stationRowsByDoc]).map(normalizeStation);
    const relatedUserLookups = [
        openid,
        ...currentUserIds,
        ...stationStaff.flatMap((row) => [row.user_id, row.openid]),
        ...normalizedStationRows.flatMap((station) => [
            station.pickup_claimant_id,
            station.pickup_claimant_openid,
            station.claimant_id,
            station.claimant_openid
        ])
    ];
    const users = await queryUsersByLookups(relatedUserLookups);
    const stations = buildStoreManagerStations(normalizedStationRows, stationStaff || [], users || [], openid, currentUser);
    const stationIds = stations.map((station) => String(station.id));
    const userMap = buildStoreManagerUserMap(users || []);
    const stationMap = new Map(stations.map((station) => [String(station.id), station]));
    const [stationOrdersRaw, procurementsRaw] = await Promise.all([
        queryRecordsByFieldValues('orders', 'pickup_station_id', stationIds),
        queryRecordsByFieldValues('station_procurement_orders', 'station_id', stationIds)
    ]);
    const stationOrders = (stationOrdersRaw || []).filter((order) => String(order.delivery_type || '') === 'pickup');
    const verifierLookups = stationOrders.flatMap((order) => [order.pickup_verified_by]);
    const verifierUsers = await queryUsersByLookups(verifierLookups);
    verifierUsers.forEach((user) => {
        [user._id, user.id, user._legacy_id, user.openid].forEach((key) => {
            if (key == null || key === '') return;
            userMap.set(String(key), user);
        });
    });
    const claimantOpenids = stations.map((station) => pickString(station.claimant?.openid)).filter(Boolean);
    const [commissionRows, goodsFundLogs] = await Promise.all([
        claimantOpenids.length ? getAllRecords(db, 'commissions', { openid: _.in(claimantOpenids) }).catch(() => []) : Promise.resolve([]),
        claimantOpenids.length ? getAllRecords(db, 'goods_fund_logs', { openid: _.in(claimantOpenids) }).catch(() => []) : Promise.resolve([])
    ]);

    const pendingOrdersAll = stationOrders
        .filter((order) => pickString(order.status) === 'pickup_pending')
        .sort((a, b) => parseTimestamp(b.created_at) - parseTimestamp(a.created_at));
    const pendingOrders = pendingOrdersAll
        .slice(0, 8)
        .map((order) => buildStoreManagerOrderSummary(order, { stationMap, userMap, commissions: commissionRows, goodsFundLogs }));
    const recentVerifiedOrdersAll = stationOrders
        .filter((order) => hasValue(order.pickup_verified_by) || hasValue(order.pickup_verified_at) || hasValue(order.verified_at))
        .sort((a, b) => parseTimestamp(b.pickup_verified_at || b.verified_at || b.confirmed_at) - parseTimestamp(a.pickup_verified_at || a.verified_at || a.confirmed_at));
    const recentVerifiedOrders = recentVerifiedOrdersAll
        .slice(0, 10)
        .map((order) => buildStoreManagerOrderSummary(order, { stationMap, userMap, commissions: commissionRows, goodsFundLogs }));
    const procurementRows = (procurementsRaw || [])
        .filter((row) => stationIds.includes(String(row.station_id || '')))
        .sort((a, b) => parseTimestamp(b.created_at) - parseTimestamp(a.created_at))
        .slice(0, 10)
        .map((row) => ({
            id: row._id || row.id || '',
            procurement_no: pickString(row.procurement_no),
            station_id: pickString(row.station_id),
            station_name: pickString(stationMap.get(String(row.station_id))?.name || row.station_snapshot?.name),
            product_name: pickString(row.product_snapshot?.name),
            sku_spec: pickString(row.product_snapshot?.sku_spec || row.product_snapshot?.sku_name),
            quantity: Math.max(0, toNum(row.quantity, 0)),
            cost_price: roundMoney(row.cost_price).toFixed(2),
            total_cost: roundMoney(row.total_cost).toFixed(2),
            status: pickString(row.status),
            supplier_name: pickString(row.supplier_name),
            operator_name: pickString(row.operator_name),
            expected_arrival_date: pickString(row.expected_arrival_date),
            remark: pickString(row.remark),
            review_reason: pickString(row.review_reason),
            receive_contact_name: pickString(row.receive_contact_name || row.receive_snapshot?.contact_name),
            receive_contact_phone: pickString(row.receive_contact_phone || row.receive_snapshot?.contact_phone),
            receive_address: pickString(row.receive_address || row.receive_snapshot?.full_address),
            created_at: toIsoString(row.created_at),
            received_at: toIsoString(row.received_at)
        }));

    return {
        summary: {
            station_count: stations.length,
            pending_order_count: pendingOrdersAll.length,
            recent_verified_count: recentVerifiedOrdersAll.length,
            procurement_pending_count: procurementRows.filter((row) => ['pending_approval', 'pending_receive'].includes(row.status)).length,
            service_fee_total: roundMoney((commissionRows || [])
                .filter((row) => claimantOpenids.includes(pickString(row.openid)) && ['pickup_service_fee', 'pickup_subsidy'].includes(pickString(row.type)))
                .reduce((sum, row) => sum + toNum(row.amount, 0), 0)),
            principal_return_total: roundMoney((goodsFundLogs || [])
                .filter((row) => claimantOpenids.includes(pickString(row.openid)) && pickString(row.type) === 'pickup_principal_return')
                .reduce((sum, row) => sum + toNum(row.amount, 0), 0))
        },
        stations,
        pending_orders: pendingOrders,
        recent_verified_orders: recentVerifiedOrders,
        procurements: procurementRows
    };
}

function normalizeAgentRoleLevel(roleLevel) {
    const normalized = Math.floor(toNum(roleLevel, 0));
    if (normalized >= 5) return 5;
    if (normalized === 4) return 4;
    if (normalized === 3) return 3;
    return 0;
}

function resolveSupplyPriceByRole(product = {}, sku = {}, roleLevel = 0) {
    const normalizedRole = normalizeAgentRoleLevel(roleLevel);
    if (!normalizedRole) return null;
    const fieldName = `supply_price_b${normalizedRole === 5 ? 3 : normalizedRole}`;
    const amount = toNum(sku?.[fieldName] ?? product?.[fieldName], NaN);
    return Number.isFinite(amount) && amount > 0 ? roundMoney(amount) : null;
}

function productOwnsSku(product = {}, sku = {}) {
    const productIds = [product._id, product.id, product._legacy_id].filter((value) => value !== null && value !== undefined && value !== '').map(String);
    const skuProductIds = [sku.product_id, sku.productId].filter((value) => value !== null && value !== undefined && value !== '').map(String);
    return skuProductIds.some((value) => productIds.includes(value));
}

function buildProductLookupValues(product = {}) {
    return [product._id, product.id, product._legacy_id]
        .filter((value) => value !== null && value !== undefined && value !== '');
}

async function loadProductSkus(product = {}) {
    const productLookups = buildProductLookupValues(product);
    const fallbackProductId = productLookups[0] || '';
    const embeddedSkus = Array.isArray(product.skus)
        ? product.skus.map((sku) => ({
            ...sku,
            product_id: sku.product_id || sku.productId || fallbackProductId
        }))
        : [];
    if (!productLookups.length) return embeddedSkus;
    const [byProductId, byProductIdCamel] = await Promise.all([
        queryRecordsByFieldValues('skus', 'product_id', productLookups),
        queryRecordsByFieldValues('skus', 'productId', productLookups)
    ]);
    return dedupeRows([...embeddedSkus, ...byProductId, ...byProductIdCamel]);
}

function buildStationReceiveSnapshot(station = {}, claimantUser = {}) {
    const fullAddress = [
        station.province,
        station.city,
        station.district,
        station.address
    ].map((item) => pickString(item)).filter(Boolean).join(' ');
    return {
        contact_name: pickString(station.contact_name || station.manager_name || station.claimant?.nick_name || station.claimant?.nickname || claimantUser.nickName || claimantUser.nickname || station.name),
        contact_phone: pickString(station.contact_phone || station.phone || station.claimant?.phone || claimantUser.phone),
        province: pickString(station.province),
        city: pickString(station.city),
        district: pickString(station.district),
        address: pickString(station.address),
        full_address: fullAddress
    };
}

async function findOneByAnyId(collectionName, rawId) {
    if (!rawId) return null;
    const id = String(rawId);
    const numeric = toNum(rawId, NaN);
    const [doc, byId, byLegacy] = await Promise.all([
        db.collection(collectionName).doc(id).get().catch(() => ({ data: null })),
        Number.isFinite(numeric) ? db.collection(collectionName).where({ id: numeric }).limit(1).get().catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
        Number.isFinite(numeric) ? db.collection(collectionName).where({ _legacy_id: numeric }).limit(1).get().catch(() => ({ data: [] })) : Promise.resolve({ data: [] })
    ]);
    return doc.data || byId.data?.[0] || byLegacy.data?.[0] || null;
}

function buildProcurementNo(rows = []) {
    const seq = (Array.isArray(rows) ? rows.length : 0) + 1;
    return `PROC${Date.now()}${String(seq).padStart(3, '0')}`;
}

async function resolveManagerStationBinding(openid, requestedStationId = '') {
    const [stationRows, staffRows, users, currentUser] = await Promise.all([
        getAllRecords(db, 'stations', { status: 'active' }).catch(() => []),
        getAllRecords(db, 'station_staff', { status: 'active' }).catch(() => []),
        getAllRecords(db, 'users').catch(() => []),
        findUserByOpenid(openid)
    ]);
    const stations = buildStoreManagerStations((stationRows || []).map(normalizeStation), staffRows || [], users || [], openid, currentUser);
    if (!stations.length) throw badRequest('当前账号未被后台指派为店长');
    const station = requestedStationId
        ? stations.find((item) => String(item.id) === String(requestedStationId))
        : stations[0];
    if (!station) throw badRequest('当前账号不属于该门店');
    return {
        station,
        currentUser: currentUser || getUserByMap(buildStoreManagerUserMap(users || []), openid)
    };
}

async function createStoreManagerProcurement(openid, params = {}) {
    const stationId = pickString(params.station_id);
    const productId = pickString(params.product_id);
    const skuId = pickString(params.sku_id);
    const quantity = Math.max(0, Math.floor(toNum(params.quantity, 0)));
    const supplierName = pickString(params.supplier_name);
    const operatorName = pickString(params.operator_name);
    const expectedArrivalDate = pickString(params.expected_arrival_date);
    const remark = pickString(params.remark);
    const portalPassword = pickString(params.portal_password);

    if (!stationId) throw badRequest('请选择门店');
    if (!productId) throw badRequest('请选择商品');
    if (!quantity) throw badRequest('采购数量必须大于 0');
    if (!supplierName) throw badRequest('请填写供应商');
    if (!operatorName) throw badRequest('请填写经办人');

    const [{ station, currentUser }, product, initialSku, procurements] = await Promise.all([
        resolveManagerStationBinding(openid, stationId),
        findOneByAnyId('products', productId),
        skuId ? findOneByAnyId('skus', skuId) : Promise.resolve(null),
        getAllRecords(db, 'station_procurement_orders').catch(() => [])
    ]);

    if (!product) throw badRequest('商品不存在');
    const productSkus = await loadProductSkus(product);
    let sku = initialSku;
    if (skuId && !sku) {
        sku = productSkus.find((item) => rowMatchesLookup(item, skuId, [item.sku_id])) || null;
    }
    if (productSkus.length > 0 && !skuId) throw badRequest('请选择商品规格');
    if (skuId && !sku) throw badRequest('规格不存在');
    if (sku && !productOwnsSku(product, sku)) throw badRequest('规格不属于当前商品');

    await assertPortalPassword(db, openid, portalPassword);

    const roleLevel = resolveRoleLevel(currentUser || {});
    const defaultCostPrice = resolveSupplyPriceByRole(product, sku || {}, roleLevel)
        || roundMoney(toNum(sku?.cost_price ?? product.cost_price, 0));
    const costPrice = roundMoney(toNum(params.cost_price, defaultCostPrice));
    if (!(costPrice > 0)) throw badRequest('进货成本价必须大于 0');
    const totalCost = roundMoney(costPrice * quantity);

    const claimantUser = station.claimant?.openid === openid ? (currentUser || null) : await findUserByOpenid(openid);
    if (!claimantUser) throw badRequest('店长账户异常，无法创建采购单');
    const receiveSnapshot = buildStationReceiveSnapshot(station, claimantUser);
    const procurement = {
        id: (Array.isArray(procurements) ? procurements.length : 0) + 1,
        procurement_no: buildProcurementNo(procurements),
        station_id: station.id,
        claimant_id: claimantUser._id || claimantUser.id || claimantUser._legacy_id || '',
        claimant_openid: claimantUser.openid || '',
        product_id: product._id || product.id || '',
        sku_id: sku ? (sku._id || sku.id || '') : '',
        quantity,
        cost_price: costPrice,
        total_cost: totalCost,
        status: 'pending_approval',
        supplier_name: supplierName,
        operator_name: operatorName,
        expected_arrival_date: expectedArrivalDate,
        remark,
        receive_contact_name: receiveSnapshot.contact_name,
        receive_contact_phone: receiveSnapshot.contact_phone,
        receive_address: receiveSnapshot.full_address,
        receive_snapshot: receiveSnapshot,
        station_snapshot: {
            id: station.id,
            name: station.name,
            province: station.province,
            city: station.city,
            district: station.district,
            address: station.address,
            contact_name: receiveSnapshot.contact_name,
            contact_phone: receiveSnapshot.contact_phone,
            full_address: receiveSnapshot.full_address
        },
        product_snapshot: {
            id: product._id || product.id || '',
            name: pickString(product.name),
            sku_name: pickString(sku?.name),
            sku_spec: pickString(sku?.spec || sku?.spec_value)
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };
    await db.collection('station_procurement_orders').add({ data: procurement });
    return {
        procurement_no: procurement.procurement_no,
        status: procurement.status,
        total_cost: totalCost,
        station_name: station.name
    };
}

const REVIEW_MARKER = '[已评价]';

function hasReviewRemark(remark) {
    return pickString(remark).includes(REVIEW_MARKER);
}

function collectReviewLookupTokens(review = {}) {
    return [...new Set([
        review && review.order_id,
        review && review.order_no
    ].map((value) => pickString(value)).filter(Boolean))];
}

function collectOrderReviewLookupTokens(order = {}) {
    return [...new Set([
        order && order._id,
        order && order.id,
        order && order._legacy_id,
        order && order.order_no
    ].map((value) => pickString(value)).filter(Boolean))];
}

function isOrderReviewed(order = {}, reviewLookup) {
    if (order.reviewed === true || order.reviewed_at || hasReviewRemark(order.remark)) return true;
    if (!reviewLookup || typeof reviewLookup.has !== 'function') return false;
    return collectOrderReviewLookupTokens(order).some((token) => reviewLookup.has(token));
}

function isPendingReviewOrder(order = {}, reviewLookup) {
    return pickString(order && order.status) === 'completed' && !isOrderReviewed(order, reviewLookup);
}

async function loadUserReviewLookup(openid) {
    if (!openid) return new Set();
    const reviews = await getAllRecords(db, 'reviews', { openid }).catch(() => []);
    const reviewLookup = new Set();
    (reviews || []).forEach((review) => {
        collectReviewLookupTokens(review).forEach((token) => reviewLookup.add(token));
    });
    return reviewLookup;
}

async function getDashboardOrderStats(openid) {
    const statuses = ['pending_payment', 'pending_group', 'paid', 'shipped'];
    const counts = {};

    await Promise.all(statuses.map(async (status) => {
        const res = await db.collection('orders').where({ openid, status }).count().catch(() => ({ total: 0 }));
        counts[status] = res.total || 0;
    }));

    const [completedOrders, refundRes, reviewLookup] = await Promise.all([
        getAllRecords(db, 'orders', { openid, status: 'completed' }).catch(() => []),
        db.collection('refunds')
            .where({ openid, status: _.in(['pending', 'approved', 'processing']) })
            .count()
            .catch(() => ({ total: 0 })),
        loadUserReviewLookup(openid)
    ]);

    return {
        pending: counts.pending_payment || 0,
        paid: (counts.paid || 0) + (counts.pending_group || 0),
        shipped: counts.shipped || 0,
        pendingReview: (completedOrders || []).filter((order) => isPendingReviewOrder(order, reviewLookup)).length,
        refund: refundRes.total || 0
    };
}

function isCouponExpired(coupon = {}) {
    const exp = coupon && (coupon.expire_at || coupon.expires_at || coupon.end_at || coupon.valid_until);
    if (!exp) return false;
    const ts = new Date(exp).getTime();
    return Number.isFinite(ts) && ts <= Date.now();
}

async function countUnreadNotifications(openid) {
    const res = await db.collection('notifications')
        .where({ openid, is_read: false })
        .count()
        .catch(() => ({ total: 0 }));
    return Number(res.total || 0);
}

async function buildDashboardAssetRow(openid) {
    const [coupons, pointsAccount] = await Promise.all([
        withTransientDbReadRetry(
            () => userCoupons.listCoupons(openid, 'unused'),
            { action: 'dashboardBootstrap.assetRow.coupons', openid }
        ).catch(() => []),
        withTransientDbReadRetry(
            () => userWallet.pointsAccount(openid),
            { action: 'dashboardBootstrap.assetRow.points', openid }
        ).catch(() => ({}))
    ]);

    const validCoupons = (Array.isArray(coupons) ? coupons : []).filter((coupon) => !isCouponExpired(coupon));
    return {
        unusedCouponCount: validCoupons.length,
        pointsBalance: toNum(
            pointsAccount.balance_points != null
                ? pointsAccount.balance_points
                : resolvePointsValue(pointsAccount),
            0
        )
    };
}

async function buildDashboardFavoritePreview(openid) {
    const favorites = await userFavorites.getFavorites(openid, {}).catch(() => []);
    const list = Array.isArray(favorites) ? favorites : [];
    const image = list[0] && (list[0].image || list[0].product_image) ? (list[0].image || list[0].product_image) : '';
    return {
        count: list.length,
        sub: list.length ? `${list.length}件收藏宝贝` : '暂无收藏',
        image,
        hasImage: !!image
    };
}

async function buildDashboardDistributionCard(openid) {
    const user = await findUserByOpenid(openid).catch(() => null);
    const walletInfo = await userWallet.getWalletInfo(openid).catch(() => ({}));
    const team = user ? await getDirectMembers(user).catch(() => []) : [];
    const goodsFundBalance = walletInfo.goods_fund_balance != null
        ? walletInfo.goods_fund_balance
        : resolveGoodsFundBalance(user || {});
    const commissionBalance = walletInfo.commission_balance != null
        ? walletInfo.commission_balance
        : (walletInfo.balance != null ? walletInfo.balance : 0);
    const frozenAmount = walletInfo.commission && walletInfo.commission.frozen != null
        ? walletInfo.commission.frozen
        : 0;
    const roleLevel = resolveRoleLevel(user || {});
    const roleName = resolveRoleName(user || {});

    return {
        balance: String(Math.trunc(toNum(goodsFundBalance, 0))),
        commissionBalance: String(Math.trunc(toNum(commissionBalance, 0))),
        frozenAmount: toNum(frozenAmount, 0).toFixed(2),
        teamCount: Array.isArray(team) ? team.length : 0,
        roleLevel,
        roleName,
        isAgent: roleLevel >= 2
    };
}

async function buildDashboardPickupScopeLight(openid) {
    const scope = await getPickupVerifyScope(openid).catch(() => ({
        hasVerifyAccess: false,
        stations: [],
        stationCount: 0
    }));
    const stations = Array.isArray(scope.stations) ? scope.stations : [];
    const managerStations = stations.filter((item) => pickString(item.my_role) === 'manager');

    return {
        hasVerifyAccess: !!scope.hasVerifyAccess,
        isStoreManager: managerStations.length > 0,
        stationCount: Number(scope.stationCount || stations.length || 0),
        stationName: managerStations[0] && managerStations[0].name ? managerStations[0].name : ''
    };
}

async function buildDashboardBootstrapPayload(openid) {
    const [
        orderStats,
        notificationsCount,
        assetRow,
        favoritePreview,
        distributionCard,
        pickupScopeLight
    ] = await Promise.all([
        getDashboardOrderStats(openid).catch(() => ({
            pending: 0,
            paid: 0,
            shipped: 0,
            pendingReview: 0,
            refund: 0
        })),
        countUnreadNotifications(openid).catch(() => 0),
        buildDashboardAssetRow(openid).catch(() => ({
            unusedCouponCount: 0,
            pointsBalance: 0
        })),
        buildDashboardFavoritePreview(openid).catch(() => ({
            count: 0,
            sub: '暂无收藏',
            image: '',
            hasImage: false
        })),
        buildDashboardDistributionCard(openid).catch(() => ({
            balance: '0',
            commissionBalance: '0',
            frozenAmount: '0.00',
            teamCount: 0,
            roleLevel: 0,
            roleName: DEFAULT_ROLE_NAMES[0],
            isAgent: false
        })),
        buildDashboardPickupScopeLight(openid).catch(() => ({
            hasVerifyAccess: false,
            isStoreManager: false,
            stationCount: 0,
            stationName: ''
        }))
    ]);

    return {
        orderStats,
        notificationsCount,
        assetRow,
        quadPreview: {
            favorite: favoritePreview,
            footprint: {
                count: 0,
                sub: '看过的商品',
                image: '',
                hasImage: false
            }
        },
        distributionCard,
        pickupScopeLight
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
        return success(await enrichUserWithGrowthProgress(await userProfile.formatUser(user)));
    }),

    'getProfile': asyncHandler(async (openid, params) => {
        await syncEligibleRoleLevelIfNeeded(openid);
        const user = await userProfile.getProfile(openid);
        if (!user) throw notFound('用户不存在');
        return success(await enrichUserWithGrowthProgress(await userProfile.formatUser(user)));
    }),

    'updateProfile': asyncHandler(async (openid, params) => {
        if (!params || Object.keys(params).length === 0) {
            throw badRequest('缺少更新数据');
        }
        const user = await userProfile.updateProfile(openid, params);
        return success(await enrichUserWithGrowthProgress(await userProfile.formatUser(user)));
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
        const growthValue = resolveGrowthValue(user);
        const tier = calculateTier(growthValue, growthTiers.length ? growthTiers : null);
        return success({
            growth_value: growthValue,
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
        const growthValue = resolveGrowthValue(user);
        const points = resolvePointsValue(user);
        const tier = calculateTier(growthValue, growthTiers.length ? growthTiers : null);
        const roleLevel = toNum(user.role_level, 0);
        const roleLevelConfig = memberLevels.find((item) => Number(item.level) === roleLevel);
        return success({
            current_level: roleLevel,
            current_name: user.role_name || roleLevelConfig?.name || 'VIP用户',
            points,
            growth_value: growthValue,
            next_level: tier.nextLevel,
            next_level_points: tier.nextThreshold,
            progress: tier.pointsNeeded,
            current: {
                role_level: roleLevel,
                role_name: user.role_name || roleLevelConfig?.name || 'VIP用户',
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

    'couponCenter': asyncHandler(async (openid) => {
        const [templates, mine] = await Promise.all([
            withTransientDbReadRetry(
                () => userCoupons.listCouponCenter(openid),
                { action: 'couponCenter', openid }
            ),
            withTransientDbReadRetry(
                () => userCoupons.listCoupons(openid, 'unused'),
                { action: 'couponCenter.mine', openid }
            )
        ]);
        return success({
            list: templates,
            mine: mine.slice(0, 3),
            unused_count: mine.length
        });
    }),

    'getCouponInfo': asyncHandler(async (openid, params) => {
        const ticketId = String(params.ticket || params.ticket_id || params.t || '').trim();
        if (ticketId) {
            const ticketInfo = await userCouponTickets.getClaimTicketInfo(ticketId);
            return success({
                found: !!ticketInfo.found,
                ticket_status: ticketInfo.ticket_status || 'invalid',
                coupon: ticketInfo.coupon || null,
                claim_status: ticketInfo.claim_status || '',
                claim_message: ticketInfo.claim_message || '',
                can_claim: ticketInfo.can_claim !== false
            });
        }

        const id = String(params.coupon_id || params.id || '');
        if (!id) throw badRequest('缺少优惠券 ID');
        return success(await userCoupons.getCouponClaimInfo(openid, id));
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

    'dashboardBootstrap': asyncHandler(async (openid) => {
        return success(await buildDashboardBootstrapPayload(openid));
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
            current_name: evaluation.user.role_name || DEFAULT_ROLE_NAMES[evaluation.currentRoleLevel] || 'VIP用户',
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
                role_name: user.role_name || DEFAULT_ROLE_NAMES[toNum(user.role_level, 0)] || 'VIP用户',
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

    'applyInitialPassword': asyncHandler(async (openid, params) => {
        return success(await portalPassword.applyInitialPassword(db, openid));
    }),

    'changePortalPassword': asyncHandler(async (openid, params) => {
        return success(await portalPassword.changePortalPassword(
            db,
            openid,
            params.current_password || params.old_password,
            params.new_password || params.password
        ));
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
            requires_station_selection: scope.requiresStationSelection,
            manager_station_count: scope.managerStationCount || 0
        });
    }),

    'storeManagerWorkbench': asyncHandler(async (openid) => {
        return success(await buildStoreManagerWorkbench(openid));
    }),

    'storeManagerCreateProcurement': asyncHandler(async (openid, params) => {
        return success(await createStoreManagerProcurement(openid, params));
    }),

    'pickupOptions': asyncHandler(async (openid, params) => {
        const [stationsRes, stockRows] = await Promise.all([
            getAllRecords(db, 'stations', { status: 'active' }).catch(() => []),
            getAllRecords(db, 'station_sku_stocks').catch(() => [])
        ]);
        const requestedItems = parsePickupItemsParam(params.items);
        const sortedStations = sortStationsByPickupPreference(
            (stationsRes || [])
                .map(normalizeStation)
                .filter((row) => Number(row.is_pickup_point ?? row.pickup_enabled ?? 1) === 1),
            {
                lat: params.lat,
                lng: params.lng,
                sortCity: params.sort_city
            }
        );
        const list = sortedStations
            .map((station) => {
                const availability = summarizeStationStockForItems(stockRows || [], station.id, requestedItems);
                const selectable = requestedItems.length ? availability.selectable : true;
                return {
                    ...station,
                    stock_status: availability.stock_status,
                    stock_status_text: availability.stock_status_text,
                    pickup_stock_text: selectable ? '有货' : '无货',
                    pickup_stock_available: selectable,
                    selectable
                };
            });
        return success({ list });
    }),

    'regionFromPoint': asyncHandler(async (openid, params) => {
        const lat = Number(params.lat);
        const lng = Number(params.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            throw badRequest('请提供有效 lat、lng');
        }
        return success(await reverseGeocode(lat, lng));
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
