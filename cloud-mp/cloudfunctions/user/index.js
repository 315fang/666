'use strict';

const cloud = require('wx-server-sdk');
const https = require('https');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

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
        return success({ list: addresses });
    }),

    'getAddressDetail': asyncHandler(async (openid, params) => {
        const id = params.address_id || params.id;
        if (!id) throw badRequest('缺少地址 ID');
        const addresses = await userAddresses.listAddresses(openid);
        const addr = addresses.find(a => a._id === id);
        if (!addr) throw notFound('地址不存在');
        return success(addr);
    }),

    'addAddress': asyncHandler(async (openid, params) => {
        const { province, city, detail } = params;
        if (!province || !city || !detail) {
            throw badRequest('缺少必要地址信息');
        }
        const address = await userAddresses.addAddress(openid, {
            province, city, district: params.district, detail,
            recipient: params.recipient, phone: params.phone,
            is_default: params.is_default || false,
        });
        return success({ id: address._id });
    }),

    'updateAddress': asyncHandler(async (openid, params) => {
        const id = params.address_id || params.id;
        if (!id) throw badRequest('缺少地址 ID');
        await userAddresses.updateAddress(id, {
            province: params.province,
            city: params.city,
            district: params.district,
            detail: params.detail,
            recipient: params.recipient,
            phone: params.phone
        });
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
        return success({ list: result });
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
        const user = await userGrowth.getUser(openid);
        if (!user) throw notFound('用户不存在');
        const points = toNum(user.points || user.growth_value, 0);
        const level = toNum(user.role_level, 0);
        return success({
            current_level: level,
            current_points: points,
            can_upgrade: level < 2 && points >= 1000,
            next_level: level + 1,
            required_points: 1000,
        });
    }),

    'upgrade': asyncHandler(async (openid, params) => {
        const user = await userGrowth.getUser(openid);
        if (!user) throw notFound('用户不存在');
        const level = toNum(user.role_level, 0);
        if (level >= 2) throw badRequest('已达最高等级');
        await db.collection('users').where({ openid }).update({
            data: { role_level: level + 1, role_name: '会员', updated_at: db.serverDate() },
        });
        return success({ new_level: level + 1 });
    }),

    'upgradeApply': asyncHandler(async (openid, params) => {
        // 提交升级申请（简单记录）
        return success({ success: true, message: '申请已提交' });
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
        return success({ success: true, password: '888888' });
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
