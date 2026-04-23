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
const { buildCanonicalUser } = require('./user-contract');
const { resolveUserAvatarFields } = require('./shared/asset-url');

// ==================== 云初始化 ====================


function createInviteCode() {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 8; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}

function couponExpireOffsetMs(validDays) {
    const days = Math.max(1, Math.floor(toNumber(validDays, 30)));
    return days * 24 * 60 * 60 * 1000;
}

function hasValue(value) {
    return value !== null && value !== undefined && value !== '';
}

function primaryId(user = {}) {
    return user._id || user.id || user._legacy_id || '';
}

function hasBoundParent(user = {}) {
    return !!(
        toString(user.referrer_openid, '').trim()
        || toString(user.parent_openid, '').trim()
        || hasValue(user.parent_id)
    );
}

function uniqueValues(values = []) {
    const seen = {};
    const result = [];
    values.forEach((value) => {
        if (!hasValue(value)) return;
        const key = String(value);
        if (seen[key]) return;
        seen[key] = true;
        result.push(value);
    });
    return result;
}

function parseConfigValue(row, fallback) {
    if (!row) return fallback;
    const value = row.config_value !== undefined ? row.config_value : row.value;
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value === 'string') {
        try {
            return JSON.parse(value);
        } catch (_) {
            return fallback;
        }
    }
    return value;
}

async function getConfigByKey(key) {
    const res = await db.collection('configs')
        .where(_.or([{ config_key: key }, { key }]))
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));
    if (res.data && res.data[0]) return res.data[0];
    const legacyRes = await db.collection('app_configs')
        .where(_.or([{ config_key: key }, { key }]))
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));
    return legacyRes.data && legacyRes.data[0] ? legacyRes.data[0] : null;
}

async function findInviterByInviteCode(inviteCode = '') {
    const normalizedCode = toString(inviteCode, '').trim().toUpperCase();
    if (!normalizedCode) return null;
    const res = await db.collection('users')
        .where(_.or([
            { my_invite_code: normalizedCode },
            { invite_code: normalizedCode },
            { member_no: normalizedCode }
        ]))
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));
    return res.data && res.data[0] ? res.data[0] : null;
}

async function bindExistingUserReferrerIfNeeded(openid, user = {}, inviteCode = '') {
    const normalizedOpenid = toString(openid, '').trim();
    const normalizedCode = toString(inviteCode, '').trim().toUpperCase();
    if (!normalizedOpenid || !normalizedCode || !user) {
        return user;
    }
    if (hasBoundParent(user)) {
        return user;
    }

    const inviter = await findInviterByInviteCode(normalizedCode);
    if (!inviter) {
        return user;
    }
    if (toString(inviter.openid, '').trim() === normalizedOpenid) {
        return user;
    }

    const parentId = primaryId(inviter) || null;
    const patch = {
        referrer_openid: toString(inviter.openid, '').trim(),
        parent_openid: toString(inviter.openid, '').trim(),
        parent_id: parentId,
        joined_team_at: db.serverDate(),
        bound_parent_at: db.serverDate(),
        relation_source: 'share_invite',
        invitation_source: 'share_invite',
        line_locked: true,
        updated_at: db.serverDate()
    };

    const userId = primaryId(user);
    if (userId) {
        await db.collection('users').doc(String(userId)).update({ data: patch });
    } else {
        await db.collection('users').where({ openid: normalizedOpenid }).update({ data: patch });
    }

    await awardInviteSuccessPoints(patch.referrer_openid, normalizedOpenid);

    const refreshed = await db.collection('users').where({ openid: normalizedOpenid }).limit(1).get().catch(() => ({ data: [] }));
    return refreshed.data && refreshed.data[0] ? refreshed.data[0] : { ...user, ...patch };
}

async function loadInvitePointRule() {
    const row = await getConfigByKey('point_rule_config');
    const raw = parseConfigValue(row, {}) || {};
    const invite = raw.invite_success && typeof raw.invite_success === 'object' ? raw.invite_success : {};
    return {
        points: Math.max(0, toNumber(invite.points, 50)),
        remark: String(invite.remark || '成功邀请新用户加入团队')
    };
}

async function awardInviteSuccessPoints(referrerOpenid, inviteeOpenid) {
    if (!referrerOpenid || !inviteeOpenid || referrerOpenid === inviteeOpenid) return 0;
    const rule = await loadInvitePointRule();
    if (rule.points <= 0) return 0;

    const existing = await db.collection('point_logs')
        .where({ openid: referrerOpenid, source: 'invite_success', invitee_openid: inviteeOpenid })
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));
    if (existing.data && existing.data[0]) return 0;

    await db.collection('users').where({ openid: referrerOpenid }).update({
        data: {
            points: _.inc(rule.points),
            updated_at: db.serverDate()
        }
    }).catch(() => null);

    await db.collection('point_logs').add({
        data: {
            openid: referrerOpenid,
            type: 'earn',
            amount: rule.points,
            source: 'invite_success',
            invitee_openid: inviteeOpenid,
            description: rule.remark,
            created_at: db.serverDate()
        }
    }).catch(() => null);

    return rule.points;
}

async function getWelcomeCouponTemplates() {
    const tplRes = await db.collection('coupons').where({
        name: db.RegExp({ regexp: '注册|见面礼|开运|新人', options: 'i' })
    }).get();

    return (tplRes.data || []).filter((tpl) => tpl.type !== undefined && tpl.is_active !== false);
}

function buildWelcomeCouponIdCandidates(templates = []) {
    const values = [];
    templates.forEach((tpl) => {
        if (!tpl) return;
        if (hasValue(tpl.id)) {
            values.push(tpl.id, String(tpl.id));
        }
        if (hasValue(tpl._id)) values.push(tpl._id);
    });
    return uniqueValues(values);
}

function buildUserIdCandidates(openid, user = {}) {
    const values = [openid];
    if (hasValue(user.id)) values.push(user.id, String(user.id));
    if (hasValue(user._id)) values.push(user._id);
    return uniqueValues(values);
}

async function hasAnyWelcomeCouponRecord(openid, user = {}) {
    const templates = await getWelcomeCouponTemplates();
    const couponIds = buildWelcomeCouponIdCandidates(templates);
    if (!couponIds.length) return false;

    const userIds = buildUserIdCandidates(openid, user);
    const queries = [
        db.collection('user_coupons')
            .where({ openid, coupon_id: _.in(couponIds) })
            .limit(1)
            .get()
            .catch(() => ({ data: [] }))
    ];

    if (userIds.length) {
        queries.push(
            db.collection('user_coupons')
                .where({ user_id: _.in(userIds), coupon_id: _.in(couponIds) })
                .limit(1)
                .get()
                .catch(() => ({ data: [] }))
        );
    }

    const results = await Promise.all(queries);
    return results.some((result) => Array.isArray(result.data) && result.data.length > 0);
}

// 自动为用户发放新人注册优惠券（幂等）
async function ensureWelcomeCoupons(openid, userId) {
    try {
        // 查找所有注册/见面礼/开运/新人券模板
        const templates = await getWelcomeCouponTemplates();
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
                    // CloudBase serverDate offset 使用毫秒，这里必须按“天 -> 毫秒”换算。
                    expire_at: db.serverDate({ offset: couponExpireOffsetMs(validDays) })
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

async function formatUser(user, openid, tierConfig) {
    const growthValue = toNumber(user.growth_value, 0);
    const points = toNumber(user.points != null ? user.points : user.growth_value, 0);
    const roleLevel = toNumber(user.role_level, 0);
    const distLevel = toNumber(user.distributor_level != null ? user.distributor_level : user.agent_level, 0);
    const resolvedUser = await resolveUserAvatarFields({ ...user, openid });
    const canonical = buildCanonicalUser(resolvedUser, {
        register_coupons_issued: !!user.register_coupons_issued,
        growth_value: growthValue,
        growth_progress: buildGrowthProgress(growthValue, tierConfig),
        points
    });
    return {
        ...canonical,
        level: roleLevel,
        level_name: canonical.role_name,
        distributor_level: distLevel,
        account_visibility: toString(user.account_visibility, 'visible'),
        hidden_reason: toString(user.hidden_reason, ''),
        hidden_at: toString(user.hidden_at, ''),
        account_origin: toString(user.account_origin, 'normal')
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
            let inviter = null;
            if (invite_code) {
                inviter = await findInviterByInviteCode(invite_code);
                if (inviter) referrerOpenid = inviter.openid;
            }

            const newUser = {
                openid,
                nickName: '新用户',
                nickname: '新用户',
                avatarUrl: '',
                avatar_url: '',
                phone: '',
                gender: '',
                account_visibility: 'visible',
                hidden_reason: '',
                hidden_at: '',
                account_origin: 'auto_login',
                points: 0,
                growth_value: 0,
                agent_wallet_balance: 0,
                wallet_balance: 0,
                commission_balance: 0,
                balance: 0,
                role_level: 0,
                role_name: 'VIP用户',
                distributor_level: 0,
                agent_level: 0,
                referrer_openid: referrerOpenid,
                parent_openid: referrerOpenid,
                parent_id: inviter ? (primaryId(inviter) || null) : null,
                my_invite_code: createInviteCode(),
                invite_code: '',  // invite_code 由 my_invite_code 统一读取，不重复生成
                relation_source: referrerOpenid ? 'share_invite' : '',
                invitation_source: referrerOpenid ? 'share_invite' : '',
                joined_team_at: referrerOpenid ? db.serverDate() : null,
                bound_parent_at: referrerOpenid ? db.serverDate() : null,
                line_locked: !!referrerOpenid,
                register_coupons_issued: false,
                created_at: db.serverDate(),
                updated_at: db.serverDate()
            };

            await db.collection('users').add({ data: newUser });
            if (referrerOpenid) {
                await awardInviteSuccessPoints(referrerOpenid, openid);
            }
            userRes = await db.collection('users').where({ openid }).limit(1).get();
        } else if (invite_code) {
            const reboundUser = await bindExistingUserReferrerIfNeeded(openid, userRes.data[0], invite_code);
            userRes = { data: [reboundUser] };
        }

        const rawUser = userRes.data[0];

        // 自动发放新人优惠券（幂等：未发放过才发）
        let hasWelcomeCouponRecord = false;
        if (rawUser.register_coupons_issued) {
            hasWelcomeCouponRecord = await hasAnyWelcomeCouponRecord(openid, rawUser);
        }

        if (!rawUser.register_coupons_issued || !hasWelcomeCouponRecord) {
            if (rawUser.register_coupons_issued && !hasWelcomeCouponRecord) {
                console.warn('[Login] register_coupons_issued=true 但缺少券记录，尝试补发新人券:', openid);
            }
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

        const userData = await formatUser(userRes.data[0], openid, tierConfig);
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
