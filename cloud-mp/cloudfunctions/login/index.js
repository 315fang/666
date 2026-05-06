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

function sanitizeDocIdPart(value) {
    return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function userDocIdForOpenid(openid) {
    return `user-${sanitizeDocIdPart(openid)}`;
}

function invitePointLogDocId(referrerOpenid, inviteeOpenid) {
    return `invite-success-${sanitizeDocIdPart(referrerOpenid)}-${sanitizeDocIdPart(inviteeOpenid)}`;
}

function removeFieldPatch() {
    return typeof _.remove === 'function' ? _.remove() : undefined;
}

function assignRemoveField(patch, field) {
    const removeValue = removeFieldPatch();
    if (removeValue !== undefined) {
        patch[field] = removeValue;
    }
    return patch;
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
        invited_by_openid: toString(inviter.openid, '').trim(),
        invited_by_user_id: parentId,
        invited_by_name: toString(inviter.nick_name || inviter.nickname || inviter.nickName || inviter.member_no || inviter.my_invite_code || inviter.invite_code || '', '').trim(),
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

    const lockWhere = {
        openid: inviteeOpenid,
        invite_points_awarded_at: _.exists(false),
        invite_points_awarding_at: _.exists(false)
    };
    const lockData = {
        invite_points_awarding_at: db.serverDate(),
        invite_points_awarded_to_openid: referrerOpenid,
        updated_at: db.serverDate()
    };
    assignRemoveField(lockData, 'invite_points_award_error');
    const lockRes = await db.collection('users').where(lockWhere).update({ data: lockData }).catch(() => ({ stats: { updated: 0 } }));
    if (!lockRes.stats || lockRes.stats.updated === 0) return 0;

    try {
        const referrerUpdate = await db.collection('users').where({ openid: referrerOpenid }).update({
            data: {
                points: _.inc(rule.points),
                updated_at: db.serverDate()
            }
        });
        if (!referrerUpdate.stats || referrerUpdate.stats.updated === 0) {
            throw new Error('邀请人不存在，积分未发放');
        }

        await db.collection('point_logs').doc(invitePointLogDocId(referrerOpenid, inviteeOpenid)).set({
            data: {
                openid: referrerOpenid,
                type: 'earn',
                amount: rule.points,
                source: 'invite_success',
                invitee_openid: inviteeOpenid,
                description: rule.remark,
                created_at: db.serverDate(),
                updated_at: db.serverDate()
            }
        }).catch((err) => {
            console.error('[Login] 邀请积分流水写入失败:', err.message);
        });

        const donePatch = {
            invite_points_awarded_at: db.serverDate(),
            invite_points_awarded_to_openid: referrerOpenid,
            updated_at: db.serverDate()
        };
        assignRemoveField(donePatch, 'invite_points_awarding_at');
        assignRemoveField(donePatch, 'invite_points_award_error');
        await db.collection('users').where({ openid: inviteeOpenid }).update({ data: donePatch }).catch(() => null);
    } catch (err) {
        const failPatch = {
            invite_points_award_error: err.message || String(err),
            invite_points_award_failed_at: db.serverDate(),
            updated_at: db.serverDate()
        };
        assignRemoveField(failPatch, 'invite_points_awarding_at');
        await db.collection('users').where({ openid: inviteeOpenid }).update({ data: failPatch }).catch(() => null);
        return 0;
    }

    return rule.points;
}

function toCouponIdCandidates(couponId) {
    if (!hasValue(couponId)) return [];
    const raw = String(couponId).trim();
    const numeric = Number(raw);
    return uniqueValues([
        raw,
        Number.isFinite(numeric) ? numeric : null
    ]);
}

function isActiveCouponTemplate(tpl = {}) {
    return tpl
        && tpl.is_active !== false
        && tpl.is_active !== 0
        && tpl.status !== false
        && tpl.status !== 0;
}

async function getRegisterCouponAutoRule() {
    const res = await db.collection('coupon_auto_rules')
        .where({ trigger_event: 'register' })
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));
    const row = res.data && res.data[0] ? res.data[0] : null;
    if (!row) return { configured: false, enabled: false, coupon_id: null, target_levels: [] };
    return {
        configured: true,
        enabled: toBoolean(row.enabled, false),
        coupon_id: hasValue(row.coupon_id) ? row.coupon_id : null,
        target_levels: toArray(row.target_levels).map((level) => Number(level)).filter((level) => Number.isFinite(level))
    };
}

function userMatchesAutoCouponRule(rule = {}, user = {}) {
    const levels = Array.isArray(rule.target_levels) ? rule.target_levels : [];
    if (!levels.length) return true;
    const level = toNumber(user.role_level ?? user.distributor_level ?? user.level, 0);
    return levels.includes(level);
}

async function findCouponTemplateByRuleCouponId(couponId) {
    const candidates = toCouponIdCandidates(couponId);
    if (!candidates.length) return null;
    const byNumericId = await db.collection('coupons')
        .where({ id: _.in(candidates) })
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));
    if (byNumericId.data && byNumericId.data[0]) return byNumericId.data[0];

    const byDocId = await db.collection('coupons')
        .doc(String(couponId).trim())
        .get()
        .catch(() => null);
    return byDocId && byDocId.data ? byDocId.data : null;
}

async function getWelcomeCouponTemplates(user = {}) {
    const rule = await getRegisterCouponAutoRule();
    if (!rule.enabled || !userMatchesAutoCouponRule(rule, user)) return [];

    if (hasValue(rule.coupon_id)) {
        const tpl = await findCouponTemplateByRuleCouponId(rule.coupon_id);
        return isActiveCouponTemplate(tpl) ? [tpl] : [];
    }

    const tplRes = await db.collection('coupons').where({
        name: db.RegExp({ regexp: '注册|见面礼|开运|新人', options: 'i' })
    }).get();

    return (tplRes.data || []).filter(isActiveCouponTemplate);
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

function welcomeCouponDocId(openid, couponId) {
    return `welcome-${sanitizeDocIdPart(openid)}-${sanitizeDocIdPart(couponId)}`;
}

function getChinaDayKey(date = new Date()) {
    const china = new Date(date.getTime() + 8 * 60 * 60 * 1000);
    return china.toISOString().slice(0, 10);
}

async function claimWelcomeCouponTemplate(openid, userId, template = {}) {
    if (typeof db.runTransaction !== 'function') {
        throw new Error('当前数据库不支持事务发放新人券');
    }
    return await db.runTransaction(async (tx) => {
        const tplSnap = template._id
            ? await tx.collection('coupons').doc(String(template._id)).get().catch(() => ({ data: null }))
            : await tx.collection('coupons').where({ id: template.id }).limit(1).get().catch(() => ({ data: [] }));
        const latest = Array.isArray(tplSnap.data) ? tplSnap.data[0] : tplSnap.data;
        if (!latest || !isActiveCouponTemplate(latest)) return false;
        if (!latest._id) throw new Error('新人券模板缺少文档 ID');

        const cid = latest.id != null ? String(latest.id) : String(latest._id);
        const docId = welcomeCouponDocId(openid, cid);
        const existing = await tx.collection('user_coupons').doc(docId).get().catch(() => ({ data: null }));
        if (existing.data) return false;

        const stock = toNumber(latest.stock, 0);
        const issuedCount = toNumber(latest.issued_count, 0);
        if (stock > 0 && issuedCount >= stock) return false;

        const dayKey = getChinaDayKey();
        const claimedTodayCount = String(latest.claim_day_key || '') === dayKey
            ? toNumber(latest.claimed_today_count, 0)
            : 0;
        const dailyLimit = toNumber(latest.daily_limit ?? latest.daily_claim_limit ?? latest.claim_limit_daily, 0);
        if (dailyLimit > 0 && claimedTodayCount >= dailyLimit) return false;

        const templateType = latest.type || latest.coupon_type || 'fixed';
        const templateValue = latest.value != null ? latest.value : latest.coupon_value;
        const validDays = toNumber(latest.valid_days, 30);
        await tx.collection('coupons').doc(String(latest._id)).update({
            data: {
                issued_count: _.inc(1),
                claim_day_key: dayKey,
                claimed_today_count: claimedTodayCount + 1,
                updated_at: db.serverDate()
            }
        });
        await tx.collection('user_coupons').doc(docId).set({
            data: {
                openid,
                user_id: userId || openid,
                coupon_id: cid,
                coupon_name: latest.name || latest.coupon_name || '优惠券',
                coupon_type: templateType === 'percent' ? 'percent' : (templateType === 'exchange' ? 'exchange' : 'fixed'),
                coupon_value: toNumber(templateValue, 0),
                min_purchase: toNumber(latest.min_purchase, 0),
                scope: latest.scope || 'all',
                scope_ids: Array.isArray(latest.scope_ids) ? latest.scope_ids : [],
                status: 'unused',
                source: 'welcome',
                created_at: db.serverDate(),
                expire_at: db.serverDate({ offset: couponExpireOffsetMs(validDays) })
            }
        });
        return true;
    });
}

async function hasAnyWelcomeCouponRecord(openid, user = {}) {
    const templates = await getWelcomeCouponTemplates(user);
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
async function ensureWelcomeCoupons(openid, userId, user = {}) {
    try {
        // 查找所有注册/见面礼/开运/新人券模板
        const templates = await getWelcomeCouponTemplates(user);
        if (!templates.length) return 0;

        let claimedCount = 0;
        let transientFailure = false;
        for (const tpl of templates) {
            const cid = tpl.id != null ? String(tpl.id) : tpl._id;
            // 检查是否已领
            const existing = await db.collection('user_coupons').where({
                openid,
                coupon_id: cid
            }).count().catch(() => ({ total: 0 }));
            if (existing.total > 0) continue;

            try {
                const claimed = await claimWelcomeCouponTemplate(openid, userId, tpl);
                if (claimed) claimedCount += 1;
            } catch (claimErr) {
                transientFailure = true;
                console.error('[Login] 新人券事务发放失败:', claimErr.message || claimErr);
            }
        }

        if (!transientFailure) {
            try {
                await db.collection('users').where({ openid }).update({
                    data: { register_coupons_issued: true, updated_at: db.serverDate() }
                });
            } catch (err) {
                console.error('[login] 标记注册优惠券已发放失败:', err);
            }
        }

        return claimedCount;
    } catch (err) {
        console.error('[Login] 发放新人券失败:', err);
        return 0;
    }
}

async function formatUser(user, openid, tierConfig) {
    const growthValue = Math.max(0, toNumber(user.growth_value, 0));
    const points = Math.max(0, toNumber(user.points != null ? user.points : user.growth_value, 0));
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
                invited_by_openid: referrerOpenid,
                invited_by_user_id: inviter ? (primaryId(inviter) || null) : null,
                invited_by_name: inviter ? toString(inviter.nick_name || inviter.nickname || inviter.nickName || inviter.member_no || inviter.my_invite_code || inviter.invite_code || '', '').trim() : '',
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

            await db.collection('users').doc(userDocIdForOpenid(openid)).set({ data: newUser });
            if (referrerOpenid) {
                await awardInviteSuccessPoints(referrerOpenid, openid);
            }
            userRes = await db.collection('users').where({ openid }).limit(1).get();
            if (!userRes.data.length) {
                const userDoc = await db.collection('users').doc(userDocIdForOpenid(openid)).get().catch(() => ({ data: null }));
                userRes = { data: userDoc.data ? [userDoc.data] : [] };
            }
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
            await ensureWelcomeCoupons(openid, rawUser._id, rawUser);
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

exports._test = {
    userDocIdForOpenid,
    invitePointLogDocId
};
