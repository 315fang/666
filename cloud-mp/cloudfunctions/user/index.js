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
    b3_recharge: 198000
};

const {
    CloudBaseError, cloudFunctionWrapper
} = require('./shared/errors');
const {
    success, badRequest, unauthorized, notFound, serverError
} = require('./shared/response');
const { calculateTier, toNumber } = require('./shared/growth');
const { toNumber: toNum, getAllRecords } = require('./shared/utils');

// 子模块导入
const userProfile = require('./user-profile');
const userGrowth = require('./user-growth');
const userAddresses = require('./user-addresses');
const userCoupons = require('./user-coupons');
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

async function getConfigByKey(key) {
    const res = await db.collection('configs')
        .where({ config_key: key })
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));
    if (res.data && res.data[0]) return res.data[0];
    const legacyRes = await db.collection('app_configs')
        .where({ config_key: key, status: true })
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));
    return legacyRes.data && legacyRes.data[0] ? legacyRes.data[0] : null;
}

async function getConfigByKeys(keys = []) {
    for (const key of keys) {
        const row = await getConfigByKey(key);
        if (row) return row;
    }
    return null;
}

async function loadMembershipConfig() {
    const [memberLevelRow, growthTierRow, growthRuleRow, commercePolicyRow, purchaseLevelRow, pointLevelRow, pointRuleRow] = await Promise.all([
        getConfigByKey('member_level_config'),
        getConfigByKey('growth_tier_config'),
        getConfigByKey('growth_rule_config'),
        getConfigByKey('commerce_policy_config'),
        getConfigByKey('purchase_level_config'),
        getConfigByKey('point_level_config'),
        getConfigByKey('point_rule_config')
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
        point_rules: parseConfigValue(pointRuleRow, {})
    };
}

async function loadAgentUpgradeRules() {
    const row = await getConfigByKeys([
        'agent_system_upgrade-rules',
        'agent_system_upgrade_rules'
    ]);
    return {
        ...DEFAULT_AGENT_UPGRADE_RULES,
        ...parseConfigValue(row, {})
    };
}

function discountText(discount) {
    if (discount == null) return '原价';
    const d = Number(discount);
    if (!Number.isFinite(d) || d >= 1) return '原价';
    const fold = parseFloat((d * 10).toFixed(2));
    return `${fold % 1 === 0 ? fold.toFixed(0) : fold.toFixed(1)}折`;
}

function normalizeGrowthTiers(rows = []) {
    return rows
        .map((row, index) => ({
            level: toNum(row.level != null ? row.level : index + 1, index + 1),
            name: row.name || `成长档位${index + 1}`,
            min: toNum(row.min != null ? row.min : row.growth_threshold, 0),
            discount: toNum(row.discount != null ? row.discount : row.discount_rate, 1),
            discountText: discountText(row.discount != null ? row.discount : row.discount_rate),
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
            discount_rate: toNum(row.discount_rate != null ? row.discount_rate : row.discount, 1),
            discountText: discountText(row.discount_rate != null ? row.discount_rate : row.discount),
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

function deriveEligibleRoleLevel(user = {}, directMembers = [], rechargeTotal = 0, upgradeRules = DEFAULT_AGENT_UPGRADE_RULES) {
    const currentRoleLevel = toNum(user.role_level ?? user.distributor_level ?? user.level, 0);
    let nextRoleLevel = currentRoleLevel;
    const totalSpent = toNum(user.total_spent != null ? user.total_spent : user.growth_value, 0);

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

    const c2OrAboveCount = directMembers.filter((member) => toNum(member.role_level ?? member.distributor_level, 0) >= 2).length;
    if (
        c2OrAboveCount >= toNum(upgradeRules.b1_referee_count, DEFAULT_AGENT_UPGRADE_RULES.b1_referee_count)
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

    if (rechargeTotal >= toNum(upgradeRules.b3_recharge, DEFAULT_AGENT_UPGRADE_RULES.b3_recharge)) {
        nextRoleLevel = Math.max(nextRoleLevel, 5);
    }

    return nextRoleLevel;
}

async function evaluateAgentUpgrade(openid) {
    const user = await userGrowth.getUser(openid);
    if (!user) throw notFound('用户不存在');
    const [upgradeRules, membershipConfig, directMembers, rechargeTotal] = await Promise.all([
        loadAgentUpgradeRules(),
        loadMembershipConfig(),
        getDirectMembers(user),
        getRechargeTotal(openid)
    ]);
    const memberLevels = normalizeMemberLevels(membershipConfig.member_levels);
    const currentRoleLevel = toNum(user.role_level, 0);
    const nextRoleLevel = deriveEligibleRoleLevel(user, directMembers, rechargeTotal, upgradeRules);
    const roleMeta = memberLevels.find((item) => Number(item.level) === nextRoleLevel);
    return {
        user,
        memberLevels,
        upgradeRules,
        currentRoleLevel,
        nextRoleLevel,
        rechargeTotal,
        directMembers,
        roleName: roleMeta?.name || DEFAULT_ROLE_NAMES[nextRoleLevel] || '普通用户',
        discountRate: roleMeta?.discount_rate != null ? toNum(roleMeta.discount_rate, 1) : null
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
        const user = await userProfile.getProfile(openid);
        if (!user) throw notFound('用户不存在');
        return success(userProfile.formatUser(user));
    }),

    'getProfile': asyncHandler(async (openid, params) => {
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
        const user = await userGrowth.getUser(openid);
        if (!user) throw notFound('用户不存在');
        return success(userGrowth.buildUserStats(user));
    }),

    'balance': asyncHandler(async (openid) => {
        const user = await userGrowth.getUser(openid);
        if (!user) throw notFound('用户不存在');
        return success(userGrowth.buildUserStats(user));
    }),

    'growth': asyncHandler(async (openid) => {
        const user = await userGrowth.getUser(openid);
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
        const user = await userGrowth.getUser(openid);
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
            commerce_policy: config.commerce_policy || {},
            purchase_levels: Array.isArray(config.purchase_levels) ? config.purchase_levels : [],
            point_levels: Array.isArray(config.point_levels) ? config.point_levels : [],
            point_rules: config.point_rules || {}
        });
    }),

    // ===== 地址 =====
    'listAddresses': asyncHandler(async (openid) => {
        const addresses = await userAddresses.listAddresses(openid);
        return success({ list: addresses.map(normalizeAddressRecord) });
    }),

    'getAddressDetail': asyncHandler(async (openid, params) => {
        const id = params.address_id || params.id;
        if (!id) throw badRequest('缺少地址 ID');
        const addresses = await userAddresses.listAddresses(openid);
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
        const coupons = await userCoupons.listCoupons(openid, params && params.status);
        return success({ list: coupons });
    }),

    'getCouponInfo': asyncHandler(async (_openid, params) => {
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
        const id = params.coupon_id || params.id;
        if (!id) throw badRequest('缺少优惠券 ID');
        const claimed = await userCoupons.claimCoupon(openid, id);
        return success(claimed);
    }),

    'claimWelcomeCoupons': asyncHandler(async (openid) => {
        const count = await userCoupons.claimWelcomeCoupons(openid);
        return success({ claimed_count: count });
    }),

    'availableCoupons': asyncHandler(async (openid, params) => {
        const coupons = await userWallet.availableCoupons(openid, params);
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
        const result = await userWallet.pointsAccount(openid);
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
                discount_rate: evaluation.discountRate != null ? evaluation.discountRate : evaluation.user.discount_rate,
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
        const res = await db.collection('stations').where({ status: 'active' }).limit(10).get().catch(() => ({ data: [] }));
        const stations = (res.data || []).map(normalizeStation);
        // 检查用户是否有关联的站点验证权限（pickup_verifiers）
        let hasVerifyAccess = false;
        if (openid && stations.length > 0) {
            const activeStatuses = [true, 'active', 1, '1'];
            const verifierRes = await db.collection('pickup_verifiers')
                .where({ openid, status: _.in(activeStatuses) })
                .limit(1)
                .get().catch(() => ({ data: [] }));
            hasVerifyAccess = verifierRes.data && verifierRes.data.length > 0;

            if (!hasVerifyAccess) {
                const userRes = await db.collection('users')
                    .where({ openid })
                    .limit(1)
                    .get().catch(() => ({ data: [] }));
                const user = userRes.data && userRes.data[0];
                const userIds = user
                    ? [user.id, user._legacy_id, user._id]
                    : [];
                const validUserIds = userIds
                    .filter((id) => id !== null && id !== undefined && id !== '');
                if (validUserIds.length > 0) {
                    const userVerifierRes = await db.collection('pickup_verifiers')
                        .where({ user_id: _.in(validUserIds), status: _.in(activeStatuses) })
                        .limit(1)
                        .get().catch(() => ({ data: [] }));
                    hasVerifyAccess = userVerifierRes.data && userVerifierRes.data.length > 0;
                }
            }
        }
        return success({ has_verify_access: hasVerifyAccess, stations });
    }),

    'pickupOptions': asyncHandler(async (openid, params) => {
        const res = await getAllRecords(db, 'stations', { status: 'active' }).catch(() => []);
        return success({ list: (res || []).map(normalizeStation) });
    }),

    'regionFromPoint': asyncHandler(async (openid, params) => {
        const lat = Number(params.lat);
        const lng = Number(params.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            throw badRequest('请提供有效 lat、lng');
        }
        return success(await reverseGeocode(lat, lng));
    }),

    'shareEligibility': asyncHandler(async (openid) => {
        return success({ eligible: true, reward_points: 5 });
    }),

    'submitQuestionnaire': asyncHandler(async (openid, params) => {
        return success({ success: true, reward_points: 10 });
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
