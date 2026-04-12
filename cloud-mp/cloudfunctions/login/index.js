'use strict';
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

// ==================== 共享模块导入 ====================
const {
    validateAction, validateAmount, validateInteger, validateString,
    validateArray, validateRequiredFields
} = require('./shared/validators');
const {
    CloudBaseError, ERROR_CODES, errorHandler, cloudFunctionWrapper
} = require('./shared/errors');
const {
    success, error, paginated, list, created, updated, deleted,
    badRequest, unauthorized, forbidden, notFound, conflict, serverError
} = require('./shared/response');
const {
    DEFAULT_GROWTH_TIERS, calculateTier, buildGrowthProgress, loadTierConfig
} = require('./shared/growth');
const {
    toNumber, toArray, toString, toBoolean, getDeep, setDeep, deepClone, merge, pick, omit, generateId, delay
} = require('./shared/utils');

// ==================== 云初始化 ====================


function createInviteCode() {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 8; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}

// 自动为用户发放新人注册优惠券（幂等）
async function ensureWelcomeCoupons(openid, userId) {
    try {
        // 查找所有注册/见面礼/开运/新人券模板
        const tplRes = await db.collection('coupons').where({
            name: db.RegExp({ regexp: '注册|见面礼|开运|新人', options: 'i' })
        }).get();

        const templates = tplRes.data.filter((t) => t.type !== undefined && t.is_active !== false);
        if (!templates.length) return 0;

        let claimedCount = 0;
        for (const tpl of templates) {
            const cid = tpl.id != null ? String(tpl.id) : tpl._id;
            // 检查是否已领
            const existing = await db.collection('user_coupons').where({
                openid,
                coupon_id: cid
            }).count().catch(() => ({ total: 0 }));
            if (existing.total > 0) continue;

            // 检查库存
            if (tpl.stock > 0) {
                const totalClaimed = await db.collection('user_coupons').where({ coupon_id: cid }).count().catch(() => ({ total: 0 }));
                if (totalClaimed.total >= tpl.stock) continue;
            }

            const validDays = toNumber(tpl.valid_days, 30);
            await db.collection('user_coupons').add({
                data: {
                    openid,
                    user_id: userId || openid,
                    coupon_id: cid,
                    coupon_name: tpl.name,
                    coupon_type: tpl.type === 'percent' ? 'percent' : 'fixed',
                    coupon_value: toNumber(tpl.value, 0),
                    min_purchase: toNumber(tpl.min_purchase, 0),
                    scope: tpl.scope || 'all',
                    scope_ids: Array.isArray(tpl.scope_ids) ? tpl.scope_ids : [],
                    status: 'unused',
                    created_at: db.serverDate(),
                    expire_at: db.serverDate({ offset: validDays * 24 * 60 * 60 })
                }
            });
            claimedCount += 1;
        }

        // 标记已发放
        await db.collection('users').where({ openid }).update({
            data: { register_coupons_issued: true, updated_at: db.serverDate() }
        }).catch(() => {});

        return claimedCount;
    } catch (err) {
        console.error('[Login] 发放新人券失败:', err);
        return 0;
    }
}

function formatUser(user, openid, tierConfig) {
    const points = toNumber(user.points != null ? user.points : user.growth_value, 0);
    const goodsFundBalance = toNumber(user.agent_wallet_balance != null ? user.agent_wallet_balance : user.wallet_balance, 0);
    const balance = toNumber(user.commission_balance != null ? user.commission_balance : user.balance, 0);
    const roleLevel = toNumber(user.role_level, 0);
    const distLevel = toNumber(user.distributor_level != null ? user.distributor_level : user.agent_level, 0);
    const ROLE_NAMES = { 0: '普通用户', 1: '会员', 2: '团长', 3: '代理商', 4: '高级代理', 5: '合伙人' };
    return {
        openid,
        _id: user._id,
        nickName: user.nickName || user.nickname || '新用户',
        nickname: user.nickName || user.nickname || '新用户',
        avatarUrl: user.avatarUrl || user.avatar_url || '',
        avatar_url: user.avatarUrl || user.avatar_url || '',
        phone: user.phone || '',
        gender: user.gender || '',
        level: roleLevel,
        level_name: user.role_name || ROLE_NAMES[roleLevel] || '普通用户',
        role_level: roleLevel,
        role_name: user.role_name || ROLE_NAMES[roleLevel] || '普通用户',
        is_distributor: distLevel > 0,
        distributor_level: distLevel,
        invite_code: user.my_invite_code || user.invite_code || '',
        my_invite_code: user.my_invite_code || '',
        register_coupons_issued: !!user.register_coupons_issued,
        growth_value: points,
        growth_progress: buildGrowthProgress(points, tierConfig),
        wallet_balance: goodsFundBalance,
        agent_wallet_balance: goodsFundBalance,
        commission_balance: balance,
        balance,
        points
    };
}

exports.main = cloudFunctionWrapper(async (event) => {
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;
    const { action, invite_code } = event;

    if (action === 'login' || !action) {
        let userRes = await db.collection('users').where({ openid }).limit(1).get();
        let isNewUser = false;

        if (!userRes.data.length) {
            isNewUser = true;
            let referrerOpenid = '';
            if (invite_code) {
                const inviterRes = await db.collection('users').where({ my_invite_code: invite_code }).limit(1).get().catch(() => ({ data: [] }));
                if (inviterRes.data.length) referrerOpenid = inviterRes.data[0].openid;
            }

            const newUser = {
                openid,
                nickName: '新用户',
                nickname: '新用户',
                avatarUrl: '',
                avatar_url: '',
                phone: '',
                gender: '',
                points: 0,
                growth_value: 0,
                agent_wallet_balance: 0,
                wallet_balance: 0,
                commission_balance: 0,
                balance: 0,
                role_level: 0,
                role_name: '普通用户',
                distributor_level: 0,
                agent_level: 0,
                referrer_openid: referrerOpenid,
                my_invite_code: createInviteCode(),
                invite_code: '',  // invite_code 由 my_invite_code 统一读取，不重复生成
                register_coupons_issued: false,
                created_at: db.serverDate(),
                updated_at: db.serverDate()
            };

            await db.collection('users').add({ data: newUser });
            userRes = await db.collection('users').where({ openid }).limit(1).get();
        }

        const rawUser = userRes.data[0];

        // 自动发放新人优惠券（幂等：未发放过才发）
        if (!rawUser.register_coupons_issued) {
            await ensureWelcomeCoupons(openid, rawUser._id);
            // 重新读取以获取更新后的 register_coupons_issued
            userRes = await db.collection('users').where({ openid }).limit(1).get();
        }

        // 读取会员等级配置
        let tierConfig = null;
        try {
            const cfgRes = await db.collection('configs').where({ type: 'member-tier-config', active: true }).limit(1).get();
            if (cfgRes.data && cfgRes.data.length > 0 && cfgRes.data[0].value) tierConfig = cfgRes.data[0].value;
        } catch (_) {}

        const userData = formatUser(userRes.data[0], openid, tierConfig);
        return success({
            ...userData,
            is_new_user: isNewUser,
            level_up: false,
            level_name: userData.level_name,
            register_coupons_issued: userData.register_coupons_issued
        });
    }

    throw badRequest(`未知 action: ${action}`);
});
