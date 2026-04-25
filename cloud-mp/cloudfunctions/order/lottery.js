'use strict';

const crypto = require('crypto');
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

const { toNumber, toArray, toBoolean, getAllRecords } = require('./shared/utils');
const orderCreate = require('./order-create');

const DEFAULT_GOODS_FUND_ROLE_LEVELS = [3, 4, 5, 6];
const AUTO_REWARD_TYPES = new Set(['points', 'coupon', 'goods_fund']);
const CLAIM_REWARD_TYPES = new Set(['physical', 'mystery']);

function pickString(value, fallback = '') {
    if (value == null) return fallback;
    const text = String(value).trim();
    return text || fallback;
}

function hasValue(value) {
    return value !== null && value !== undefined && value !== '';
}

function roundMoney(value) {
    return Math.round(toNumber(value, 0) * 100) / 100;
}

function normalizePrizeType(value) {
    const raw = pickString(value, 'miss').toLowerCase();
    if (raw === 'point') return 'points';
    if (['miss', 'points', 'coupon', 'goods_fund', 'physical', 'mystery'].includes(raw)) return raw;
    return 'miss';
}

function normalizeScopeIds(value) {
    if (Array.isArray(value)) {
        return [...new Set(value.map((item) => pickString(item)).filter(Boolean))];
    }
    const raw = pickString(value);
    if (!raw) return [];
    if (raw.startsWith('[') && raw.endsWith(']')) {
        try {
            return normalizeScopeIds(JSON.parse(raw));
        } catch (_) {
            return [];
        }
    }
    return [...new Set(raw.split(',').map((item) => item.trim()).filter(Boolean))];
}

function normalizeRoleLevelList(value, fallback = DEFAULT_GOODS_FUND_ROLE_LEVELS) {
    const source = Array.isArray(value) ? value : (hasValue(value) ? [value] : fallback);
    return [...new Set(source
        .map((item) => Math.floor(toNumber(item, 0)))
        .filter((item) => item > 0)
    )];
}

function generateId() {
    return crypto.randomBytes(12).toString('hex');
}

function parseDateValue(value) {
    if (!value) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (typeof value === 'object') {
        if (typeof value._seconds === 'number') return new Date(value._seconds * 1000);
        if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
        if (value.$date) return parseDateValue(value.$date);
        if (typeof value.toDate === 'function') {
            try { return value.toDate(); } catch (_) {}
        }
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function addDaysIso(days = 0) {
    const safeDays = Math.max(0, Math.floor(toNumber(days, 0)));
    return new Date(Date.now() + safeDays * 24 * 60 * 60 * 1000).toISOString();
}

function parseConfigValue(value, fallback = {}) {
    if (value === null || value === undefined || value === '') return fallback;
    if (typeof value === 'string') {
        try {
            return JSON.parse(value);
        } catch (_) {
            return fallback;
        }
    }
    return value && typeof value === 'object' ? value : fallback;
}

function isEnabledFlag(value, fallback = true) {
    if (value === undefined || value === null || value === '') return fallback;
    if (value === true || value === 1 || value === '1') return true;
    if (value === false || value === 0 || value === '0') return false;
    const normalized = String(value).trim().toLowerCase();
    if (['true', 'yes', 'y', 'on', 'enabled', 'active'].includes(normalized)) return true;
    if (['false', 'no', 'n', 'off', 'disabled', 'inactive'].includes(normalized)) return false;
    return fallback;
}

function resolveLotteryId(params = {}) {
    return pickString(params.lottery_id || params.pool_id || params.lotteryId || params.poolId || 'default', 'default');
}

function prizeMatchesLottery(prize = {}, lotteryId = 'default') {
    const target = pickString(lotteryId, 'default');
    const scopes = normalizeScopeIds(
        prize.lottery_ids
        || prize.lottery_id
        || prize.pool_ids
        || prize.pool_id
        || prize.pool
    );
    if (target === 'default') return scopes.length === 0 || scopes.includes('default');
    return scopes.includes(target);
}

function resolveClaimDeadline(record = {}, claim = null) {
    return parseDateValue(
        claim && claim.claim_deadline_at
            ? claim.claim_deadline_at
            : record.claim_deadline_at
    );
}

function isClaimDeadlineExpired(record = {}, claim = null) {
    const deadline = resolveClaimDeadline(record, claim);
    return !!deadline && deadline.getTime() < Date.now();
}

async function expireClaimIfNeeded(record = {}, claim = null) {
    if (!isClaimDeadlineExpired(record, claim)) return { record, claim, expired: false };
    const finalClaimStatuses = new Set(['approved', 'shipped', 'completed', 'expired', 'cancelled']);
    const finalRecordStatuses = new Set(['issued', 'completed', 'cancelled']);
    if (finalRecordStatuses.has(pickString(record.fulfillment_status))) {
        return { record, claim, expired: false };
    }
    const claimStatus = pickString(claim && claim.status);
    if (claim && finalClaimStatuses.has(claimStatus) && claimStatus !== 'expired') {
        return { record, claim, expired: false };
    }
    const nextRecord = {
        ...record,
        fulfillment_status: 'expired',
        failure_reason: pickString(record.failure_reason || '领奖已截止')
    };
    if (pickString(record.id)) {
        await persistIssuedRecord(record.id, {
            fulfillment_status: 'expired',
            failure_reason: nextRecord.failure_reason
        }).catch(() => null);
    }
    let nextClaim = claim;
    if (claim && !finalClaimStatuses.has(claimStatus)) {
        const claimId = pickString(claim._id || claim.id);
        nextClaim = { ...claim, status: 'expired', updated_at: new Date().toISOString() };
        if (claimId) {
            await db.collection('lottery_claims').doc(claimId).update({
                data: {
                    status: 'expired',
                    updated_at: db.serverDate()
                }
            }).catch(() => null);
        }
    }
    return { record: nextRecord, claim: nextClaim, expired: true };
}

function getPrizeVisual(type = 'miss') {
    return {
        miss: { emoji: '🍀', badge: '好运签', theme: '#6B7280', accent: '#D1D5DB' },
        points: { emoji: '⭐', badge: '积分奖', theme: '#2563EB', accent: '#93C5FD' },
        coupon: { emoji: '🎫', badge: '优惠券', theme: '#10B981', accent: '#6EE7B7' },
        goods_fund: { emoji: '💰', badge: '货款奖', theme: '#0F766E', accent: '#5EEAD4' },
        physical: { emoji: '🎁', badge: '实物奖', theme: '#F59E0B', accent: '#FDE68A' },
        mystery: { emoji: '✨', badge: '神秘大奖', theme: '#7C3AED', accent: '#C4B5FD' }
    }[type] || { emoji: '🎁', badge: '奖品', theme: '#6B7280', accent: '#D1D5DB' };
}

function buildAssetRef(source = {}) {
    if (!source || typeof source !== 'object') return pickString(source);
    return pickString(
        source.file_id
        || source.fileId
        || source.image_url
        || source.url
        || source.image
        || source.cover_image
        || source.coverImage
        || toArray(source.images)[0]
    );
}

function isCloudFileId(value) {
    return /^cloud:\/\//i.test(pickString(value));
}

async function batchResolveManagedFileUrls(fileIds = []) {
    const ids = [...new Set((Array.isArray(fileIds) ? fileIds : []).filter(isCloudFileId))];
    const resolved = new Map();
    if (!ids.length) return resolved;
    for (let i = 0; i < ids.length; i += 50) {
        const chunk = ids.slice(i, i + 50);
        const result = await cloud.getTempFileURL({ fileList: chunk }).catch(() => ({ fileList: [] }));
        (result.fileList || []).forEach((file) => {
            if (!file || !file.fileID) return;
            resolved.set(file.fileID, pickString(file.tempFileURL || file.download_url));
        });
    }
    return resolved;
}

function resolveManagedAssetUrl(assetRef, resolvedMap = new Map()) {
    const ref = pickString(assetRef);
    if (!ref) return '';
    if (isCloudFileId(ref)) return pickString(resolvedMap.get(ref));
    if (/^https?:\/\//i.test(ref)) return ref;
    return '';
}

async function findOneByAnyId(collectionName, rawId) {
    if (!hasValue(rawId)) return null;
    const id = String(rawId);
    const byDocId = await db.collection(collectionName).doc(id).get().catch(() => ({ data: null }));
    if (byDocId.data) return byDocId.data;

    const candidates = [id];
    const numericId = Number(id);
    if (Number.isFinite(numericId)) candidates.push(numericId);

    const res = await db.collection(collectionName)
        .where(_.or([
            { id: _.in(candidates) },
            { _legacy_id: _.in(candidates) }
        ]))
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));

    return res.data && res.data[0] ? res.data[0] : null;
}

async function findCouponTemplateByAnyId(rawId) {
    return findOneByAnyId('coupons', rawId);
}

function buildDirectCouponConfig(prize = {}, couponTemplate = null) {
    const amount = roundMoney(
        prize.coupon_amount != null
            ? prize.coupon_amount
            : (pickString(prize.type).toLowerCase() === 'coupon' && !hasValue(prize.coupon_id)
                ? (prize.prize_value != null ? prize.prize_value : prize.value)
                : (couponTemplate ? (couponTemplate.value != null ? couponTemplate.value : couponTemplate.coupon_value) : 0))
    );
    return {
        coupon_amount: amount,
        coupon_min_purchase: roundMoney(prize.coupon_min_purchase != null ? prize.coupon_min_purchase : (couponTemplate ? couponTemplate.min_purchase : 0)),
        coupon_valid_days: Math.max(1, Math.floor(toNumber(prize.coupon_valid_days != null ? prize.coupon_valid_days : (couponTemplate ? couponTemplate.valid_days : 30), 30))),
        coupon_scope: pickString(prize.coupon_scope || (couponTemplate ? couponTemplate.scope : 'all'), 'all'),
        coupon_scope_ids: normalizeScopeIds(prize.coupon_scope_ids != null ? prize.coupon_scope_ids : (couponTemplate ? couponTemplate.scope_ids : []))
    };
}

async function normalizePrizeRuntime(prize = {}) {
    const type = normalizePrizeType(prize.type);
    const visual = getPrizeVisual(type);
    const couponTemplate = type === 'coupon' && hasValue(prize.coupon_id)
        ? await findCouponTemplateByAnyId(prize.coupon_id)
        : null;
    const couponConfig = type === 'coupon' ? buildDirectCouponConfig(prize, couponTemplate) : buildDirectCouponConfig({}, null);
    return {
        ...prize,
        id: pickString(prize._id || prize.id || prize._legacy_id),
        type,
        name: pickString(prize.name || visual.badge || '未命名奖品'),
        prize_value: roundMoney(prize.prize_value != null ? prize.prize_value : prize.value),
        cost_points: Math.max(0, Math.floor(toNumber(prize.cost_points, 0))),
        stock: prize.stock == null ? -1 : Math.floor(toNumber(prize.stock, -1)),
        probability: toNumber(prize.probability || prize.weight, 0),
        image_ref: buildAssetRef(prize),
        display_emoji: pickString(prize.display_emoji || visual.emoji),
        badge_text: pickString(prize.badge_text || visual.badge),
        theme_color: pickString(prize.theme_color || visual.theme),
        accent_color: pickString(prize.accent_color || visual.accent),
        coupon_id: pickString(prize.coupon_id),
        ...couponConfig,
        eligible_role_levels: normalizeRoleLevelList(prize.eligible_role_levels, DEFAULT_GOODS_FUND_ROLE_LEVELS),
        fallback_reward_type: normalizePrizeType(prize.fallback_reward_type || 'points') === 'miss'
            ? 'points'
            : normalizePrizeType(prize.fallback_reward_type || 'points'),
        claim_required: prize.claim_required == null ? CLAIM_REWARD_TYPES.has(type) : !!toBoolean(prize.claim_required),
        shipping_required: prize.shipping_required == null ? type === 'physical' : !!toBoolean(prize.shipping_required),
        claim_instruction: pickString(prize.claim_instruction),
        claim_deadline_days: Math.max(0, Math.floor(toNumber(prize.claim_deadline_days, 7))),
        is_active: prize.is_active == null ? !!toBoolean(prize.status, true) : !!toBoolean(prize.is_active),
        needs_coupon_migration: type === 'coupon' && hasValue(prize.coupon_id) && !hasValue(prize.coupon_amount)
    };
}

function buildRewardSnapshot(prize = {}) {
    return {
        prize_id: pickString(prize.id || prize._id || prize._legacy_id),
        name: prize.name,
        type: prize.type,
        prize_value: prize.prize_value,
        cost_points: prize.cost_points,
        image_ref: prize.image_ref,
        display_emoji: prize.display_emoji,
        badge_text: prize.badge_text,
        theme_color: prize.theme_color,
        accent_color: prize.accent_color,
        coupon_amount: prize.coupon_amount,
        coupon_min_purchase: prize.coupon_min_purchase,
        coupon_valid_days: prize.coupon_valid_days,
        coupon_scope: prize.coupon_scope,
        coupon_scope_ids: prize.coupon_scope_ids,
        eligible_role_levels: prize.eligible_role_levels,
        fallback_reward_type: prize.fallback_reward_type,
        claim_required: prize.claim_required,
        shipping_required: prize.shipping_required,
        claim_instruction: prize.claim_instruction,
        claim_deadline_days: prize.claim_deadline_days
    };
}

function normalizeLegacyRecord(record = {}) {
    const rewardType = normalizePrizeType(record.reward_actual_type || record.prize_type || record.reward_snapshot?.type || record.type || 'miss');
    const drawStatus = pickString(record.draw_status || (rewardType === 'miss' ? 'miss' : 'won'), rewardType === 'miss' ? 'miss' : 'won');
    let fulfillmentStatus = pickString(record.fulfillment_status || '');
    if (!fulfillmentStatus) {
        if (CLAIM_REWARD_TYPES.has(rewardType)) fulfillmentStatus = 'claim_required';
        else if (drawStatus === 'miss') fulfillmentStatus = 'completed';
        else fulfillmentStatus = 'issued';
    }
    const fulfillmentMode = pickString(record.fulfillment_mode || (AUTO_REWARD_TYPES.has(rewardType) ? 'auto' : 'claim'), AUTO_REWARD_TYPES.has(rewardType) ? 'auto' : 'claim');
    return {
        ...record,
        id: pickString(record._id || record.id),
        prize_type: rewardType,
        reward_actual_type: normalizePrizeType(record.reward_actual_type || rewardType),
        draw_status: drawStatus,
        fulfillment_status: fulfillmentStatus,
        fulfillment_mode: fulfillmentMode,
        reward_ref_type: pickString(record.reward_ref_type),
        reward_ref_id: pickString(record.reward_ref_id),
        failure_reason: pickString(record.failure_reason),
        claim_id: pickString(record.claim_id),
        shipping_required: record.shipping_required == null ? rewardType === 'physical' : !!toBoolean(record.shipping_required),
        claim_required: record.claim_required == null ? CLAIM_REWARD_TYPES.has(rewardType) : !!toBoolean(record.claim_required),
        reward_snapshot: record.reward_snapshot && typeof record.reward_snapshot === 'object'
            ? record.reward_snapshot
            : buildRewardSnapshot({
                id: record.prize_id,
                name: pickString(record.prize_name),
                type: rewardType,
                prize_value: roundMoney(record.prize_value != null ? record.prize_value : record.value),
                image_ref: buildAssetRef(record),
                display_emoji: getPrizeVisual(rewardType).emoji,
                badge_text: getPrizeVisual(rewardType).badge,
                theme_color: getPrizeVisual(rewardType).theme,
                accent_color: getPrizeVisual(rewardType).accent,
                coupon_amount: roundMoney(record.prize_value != null ? record.prize_value : record.value),
                coupon_min_purchase: 0,
                coupon_valid_days: 30,
                coupon_scope: 'all',
                coupon_scope_ids: [],
                eligible_role_levels: DEFAULT_GOODS_FUND_ROLE_LEVELS,
                fallback_reward_type: 'points',
                claim_required: CLAIM_REWARD_TYPES.has(rewardType),
                shipping_required: rewardType === 'physical',
                claim_instruction: '',
                claim_deadline_days: 7,
                cost_points: toNumber(record.cost_points, 0)
            }),
        claim_deadline_at: pickString(record.claim_deadline_at),
        created_at: record.created_at,
        updated_at: record.updated_at
    };
}

function getRecordStatusText(status = '') {
    return {
        pending: '待发放',
        issued: '已发放',
        claim_required: '待领取',
        claim_submitted: '已提交',
        approved: '待发货',
        shipped: '已发货',
        completed: '已完成',
        failed: '发放失败',
        cancelled: '已取消',
        expired: '已过期'
    }[pickString(status)] || '处理中';
}

function requiresLotteryClaim(record = {}) {
    if (record.claim_required != null) return !!toBoolean(record.claim_required);
    const rewardType = normalizePrizeType(record.reward_actual_type || record.prize_type);
    return CLAIM_REWARD_TYPES.has(rewardType);
}

function buildLotteryAction(record = {}) {
    const rewardType = normalizePrizeType(record.reward_actual_type || record.prize_type);
    const status = pickString(record.fulfillment_status);
    if (isClaimDeadlineExpired(record)) return { type: '', text: '' };
    if (status === 'issued') {
        if (rewardType === 'coupon') return { type: 'coupon_list', text: '去券包' };
        if (rewardType === 'goods_fund') return { type: 'goods_fund_wallet', text: '去货款钱包' };
        if (rewardType === 'points') return { type: 'points_page', text: '去积分页' };
    }
    if (
        requiresLotteryClaim(record)
        && ['claim_required', 'claim_submitted', 'approved', 'shipped'].includes(status)
    ) {
        return {
            type: 'claim',
            text: status === 'claim_required'
                ? '去领取'
                : (status === 'shipped' ? '查看物流' : '查看进度')
        };
    }
    return { type: '', text: '' };
}

function formatPrizeValue(record = {}) {
    const rewardType = normalizePrizeType(record.reward_actual_type || record.prize_type);
    const snapshot = record.reward_snapshot || {};
    if (rewardType === 'points') return `${Math.max(0, Math.floor(toNumber(snapshot.prize_value, record.prize_value)))} 积分`;
    if (rewardType === 'coupon') return `${roundMoney(snapshot.coupon_amount != null ? snapshot.coupon_amount : snapshot.prize_value)} 元券`;
    if (rewardType === 'goods_fund') return `¥${roundMoney(snapshot.prize_value)} 货款`;
    if (rewardType === 'physical') return '实物礼品';
    if (rewardType === 'mystery') return '神秘大奖';
    return '试试下一次好运';
}

async function buildLotteryRecordView(record = {}, claim = null, resolvedAssetMap = new Map()) {
    const normalized = normalizeLegacyRecord(record);
    const snapshot = normalized.reward_snapshot || {};
    const visual = getPrizeVisual(normalized.reward_actual_type || normalized.prize_type);
    const action = buildLotteryAction(normalized);
    const claimDerivedStatus = claim
        ? (claim.status === 'submitted'
            ? 'claim_submitted'
            : (claim.status === 'approved'
                ? 'approved'
                : (claim.status === 'shipped'
                    ? 'shipped'
                    : (claim.status === 'completed'
                        ? 'completed'
                        : 'claim_required'))))
        : '';
    return {
        id: normalized.id,
        record_id: normalized.id,
        prize_id: pickString(normalized.prize_id || snapshot.prize_id),
        prize_name: pickString(normalized.prize_name || snapshot.name),
        prize_type: normalizePrizeType(normalized.prize_type),
        reward_actual_type: normalizePrizeType(normalized.reward_actual_type || normalized.prize_type),
        draw_status: normalized.draw_status,
        fulfillment_status: normalized.fulfillment_status,
        fulfillment_status_text: getRecordStatusText(normalized.fulfillment_status),
        fulfillment_mode: normalized.fulfillment_mode,
        reward_ref_type: normalized.reward_ref_type,
        reward_ref_id: normalized.reward_ref_id,
        failure_reason: normalized.failure_reason,
        created_at: normalized.created_at,
        updated_at: normalized.updated_at,
        claim_id: normalized.claim_id,
        claim_status: pickString(claim && claim.status),
        claim_status_text: claim ? getRecordStatusText(claimDerivedStatus) : '',
        action_type: action.type,
        action_text: action.text,
        can_action: !!action.type,
        display_emoji: pickString(snapshot.display_emoji || visual.emoji),
        badge_text: pickString(snapshot.badge_text || visual.badge),
        theme_color: pickString(snapshot.theme_color || visual.theme),
        accent_color: pickString(snapshot.accent_color || visual.accent),
        display_value: formatPrizeValue(normalized),
        image_url: resolveManagedAssetUrl(snapshot.image_ref, resolvedAssetMap),
        claim_instruction: pickString(snapshot.claim_instruction),
        shipping_required: !!normalized.shipping_required,
        claim_deadline_at: normalized.claim_deadline_at || (claim && claim.claim_deadline_at) || ''
    };
}

async function getLotteryRecordById(recordId, openid = '') {
    if (!hasValue(recordId)) return null;
    const record = await findOneByAnyId('lottery_records', recordId);
    if (!record) return null;
    if (openid && pickString(record.openid) !== pickString(openid)) return null;
    return normalizeLegacyRecord(record);
}

async function getLotteryClaimById(claimId) {
    return hasValue(claimId) ? findOneByAnyId('lottery_claims', claimId) : null;
}

async function getLotteryClaimByRecordId(recordId) {
    if (!hasValue(recordId)) return null;
    const res = await db.collection('lottery_claims')
        .where({ lottery_record_id: pickString(recordId) })
        .orderBy('updated_at', 'desc')
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));
    return res.data && res.data[0] ? res.data[0] : null;
}

async function ensureWalletAccountForReward(user) {
    const seeded = orderCreate.getUserGoodsFundBalance ? orderCreate.getUserGoodsFundBalance(user) : toNumber(user.agent_wallet_balance ?? user.wallet_balance, 0);
    return orderCreate.ensureWalletAccountForUser
        ? orderCreate.ensureWalletAccountForUser(user, seeded)
        : null;
}

async function issuePointsReward(openid, record, points, reason) {
    const amount = Math.max(0, Math.floor(toNumber(points, 0)));
    if (amount <= 0) throw new Error('积分奖励配置异常');
    const updateRes = await db.collection('users').where({ openid }).update({
        data: {
            points: _.inc(amount),
            growth_value: _.inc(amount),
            updated_at: db.serverDate()
        }
    });
    if (!updateRes.stats || updateRes.stats.updated === 0) {
        throw new Error('积分奖励发放失败：用户不存在');
    }
    const logRes = await db.collection('point_logs').add({
        data: {
            openid,
            type: 'earn',
            amount,
            source: 'lottery',
            lottery_record_id: record.id,
            prize_id: pickString(record.prize_id),
            description: reason,
            created_at: db.serverDate()
        }
    });
    return {
        reward_actual_type: 'points',
        reward_ref_type: 'point_log',
        reward_ref_id: logRes._id || ''
    };
}

async function issueCouponReward(openid, user, record, snapshot) {
    const couponAmount = roundMoney(snapshot.coupon_amount != null ? snapshot.coupon_amount : snapshot.prize_value);
    if (couponAmount <= 0) throw new Error('优惠券奖励配置异常');
    const docId = generateId();
    const validDays = Math.max(1, Math.floor(toNumber(snapshot.coupon_valid_days, 30)));
    const userCouponDoc = {
        id: docId,
        openid,
        user_id: user && (user.id || user._id || user._legacy_id) ? (user.id || user._id || user._legacy_id) : openid,
        coupon_id: pickString(record.prize_id || record.id),
        coupon_name: pickString(record.prize_name || snapshot.name || '抽奖优惠券'),
        coupon_type: 'fixed',
        coupon_value: couponAmount,
        min_purchase: roundMoney(snapshot.coupon_min_purchase),
        scope: pickString(snapshot.coupon_scope || 'all'),
        scope_ids: normalizeScopeIds(snapshot.coupon_scope_ids),
        status: 'unused',
        source: 'lottery',
        source_lottery_record_id: record.id,
        source_prize_id: pickString(record.prize_id),
        created_at: new Date().toISOString(),
        expire_at: addDaysIso(validDays),
        updated_at: new Date().toISOString()
    };
    await db.collection('user_coupons').doc(docId).set({ data: userCouponDoc });
    return {
        reward_actual_type: 'coupon',
        reward_ref_type: 'user_coupon',
        reward_ref_id: docId
    };
}

async function issueGoodsFundReward(openid, user, record, snapshot) {
    const amount = roundMoney(snapshot.prize_value);
    if (amount <= 0) throw new Error('货款奖励配置异常');
    const eligibleLevels = normalizeRoleLevelList(snapshot.eligible_role_levels, DEFAULT_GOODS_FUND_ROLE_LEVELS);
    const roleLevel = orderCreate.getUserRoleLevel ? orderCreate.getUserRoleLevel(user) : toNumber(user && user.role_level, 0);
    if (!eligibleLevels.includes(roleLevel)) {
        const rule = orderCreate.getPointDeductionRule
            ? await orderCreate.getPointDeductionRule()
            : { yuanPerPoint: 0.1 };
        const points = Math.max(1, Math.round(amount / Math.max(0.01, toNumber(rule.yuanPerPoint, 0.1))));
        const fallbackResult = await issuePointsReward(openid, record, points, `抽奖货款奖励折算积分 ${points}`);
        return {
            ...fallbackResult,
            reward_actual_type: 'points'
        };
    }

    const account = await ensureWalletAccountForReward(user);
    if (!account || !pickString(account._id || account.id)) {
        throw new Error('货款奖励发放失败：无法初始化货款账户');
    }

    await db.collection('wallet_accounts').doc(String(account._id || account.id)).update({
        data: {
            balance: _.inc(amount),
            updated_at: db.serverDate()
        }
    });
    await db.collection('users').where({ openid }).update({
        data: {
            agent_wallet_balance: _.inc(amount),
            wallet_balance: _.inc(amount),
            updated_at: db.serverDate()
        }
    }).catch(() => null);
    const logRes = await db.collection('goods_fund_logs').add({
        data: {
            openid,
            user_id: user && (user.id || user._id || user._legacy_id) ? (user.id || user._id || user._legacy_id) : openid,
            type: 'lottery_reward',
            amount,
            lottery_record_id: record.id,
            prize_id: pickString(record.prize_id),
            remark: `抽奖获得货款 ¥${amount.toFixed(2)}`,
            created_at: db.serverDate()
        }
    });
    return {
        reward_actual_type: 'goods_fund',
        reward_ref_type: 'goods_fund_log',
        reward_ref_id: logRes._id || ''
    };
}

async function persistIssuedRecord(recordId, patch = {}) {
    await db.collection('lottery_records').doc(String(recordId)).update({
        data: {
            ...patch,
            updated_at: db.serverDate()
        }
    });
}

async function fulfillLotteryRecord(record, user = null) {
    const normalized = normalizeLegacyRecord(record);
    if (!AUTO_REWARD_TYPES.has(normalized.reward_actual_type || normalized.prize_type)) {
        return normalized;
    }
    if (pickString(normalized.reward_ref_id)) {
        return normalized;
    }

    const snapshot = normalized.reward_snapshot || {};
    const openid = pickString(normalized.openid);
    const buyer = user || (orderCreate.findUserByOpenid ? await orderCreate.findUserByOpenid(openid) : null);
    let rewardResult = null;
    const rewardType = normalizePrizeType(normalized.reward_actual_type || normalized.prize_type);

    if (rewardType === 'points') {
        rewardResult = await issuePointsReward(openid, normalized, snapshot.prize_value, `抽奖获得${Math.max(0, Math.floor(toNumber(snapshot.prize_value, 0)))}积分`);
    } else if (rewardType === 'coupon') {
        rewardResult = await issueCouponReward(openid, buyer, normalized, snapshot);
    } else if (rewardType === 'goods_fund') {
        rewardResult = await issueGoodsFundReward(openid, buyer, normalized, snapshot);
    }

    if (!rewardResult) {
        throw new Error('暂不支持的自动发奖类型');
    }

    await persistIssuedRecord(normalized.id, {
        reward_actual_type: rewardResult.reward_actual_type,
        reward_ref_type: rewardResult.reward_ref_type,
        reward_ref_id: rewardResult.reward_ref_id,
        fulfillment_status: 'issued',
        failure_reason: ''
    });
    return {
        ...normalized,
        reward_actual_type: rewardResult.reward_actual_type,
        reward_ref_type: rewardResult.reward_ref_type,
        reward_ref_id: rewardResult.reward_ref_id,
        fulfillment_status: 'issued'
    };
}

async function createLotteryClaim(openid, params = {}) {
    const recordId = pickString(params.record_id || params.id);
    let record = await getLotteryRecordById(recordId, openid);
    if (!record) throw new Error('中奖记录不存在');

    const rewardType = normalizePrizeType(record.reward_actual_type || record.prize_type);
    if (!CLAIM_REWARD_TYPES.has(rewardType)) {
        throw new Error('当前奖品不需要领取');
    }

    let existingClaim = record.claim_id
        ? await getLotteryClaimById(record.claim_id)
        : await getLotteryClaimByRecordId(record.id);
    const expireResult = await expireClaimIfNeeded(record, existingClaim);
    record = expireResult.record;
    existingClaim = expireResult.claim;
    if (expireResult.expired) {
        throw new Error('领奖已截止');
    }
    const existingStatus = pickString(existingClaim && existingClaim.status);
    if (['approved', 'shipped', 'completed'].includes(existingStatus)) {
        return {
            record,
            claim: existingClaim,
            can_submit: false
        };
    }

    const addressId = pickString(params.address_id || params.addressId);
    if (!addressId) throw new Error('请选择收货地址');
    const address = await findOneByAnyId('addresses', addressId);
    if (!address || pickString(address.openid) !== openid) {
        throw new Error('收货地址不存在或不属于当前用户');
    }

    const addressSnapshot = orderCreate.buildAddressSnapshot
        ? orderCreate.buildAddressSnapshot(address)
        : {
            receiver_name: pickString(address.receiver_name || address.name),
            name: pickString(address.receiver_name || address.name),
            phone: pickString(address.phone || address.contact_phone),
            province: pickString(address.province),
            city: pickString(address.city),
            district: pickString(address.district),
            detail: pickString(address.detail || address.detail_address || address.address),
            detail_address: pickString(address.detail || address.detail_address || address.address)
        };

    if (!pickString(addressSnapshot.receiver_name)) throw new Error('收货地址缺少收货人姓名');
    if (!pickString(params.phone || addressSnapshot.phone)) throw new Error('请填写联系电话');
    if (!pickString(addressSnapshot.province) || !pickString(addressSnapshot.city) || !pickString(addressSnapshot.detail)) {
        throw new Error('收货地址信息不完整');
    }

    const phone = pickString(params.phone || addressSnapshot.phone);
    const claimId = pickString(existingClaim && (existingClaim._id || existingClaim.id)) || generateId();
    const snapshot = record.reward_snapshot || {};
    const claimDoc = {
        id: claimId,
        lottery_record_id: record.id,
        prize_id: pickString(record.prize_id),
        prize_name: pickString(record.prize_name || snapshot.name),
        prize_type: rewardType,
        openid,
        user_id: pickString(record.user_id || openid),
        status: 'submitted',
        address_id: addressId,
        address_snapshot: addressSnapshot,
        receiver_name: pickString(addressSnapshot.receiver_name),
        phone,
        province: pickString(addressSnapshot.province),
        city: pickString(addressSnapshot.city),
        district: pickString(addressSnapshot.district),
        detail: pickString(addressSnapshot.detail),
        detail_address: pickString(addressSnapshot.detail_address || addressSnapshot.detail),
        remark: pickString(params.remark),
        shipping_required: snapshot.shipping_required == null ? rewardType === 'physical' : !!toBoolean(snapshot.shipping_required),
        claim_instruction: pickString(snapshot.claim_instruction),
        claim_deadline_at: pickString(record.claim_deadline_at || addDaysIso(snapshot.claim_deadline_days || 7)),
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };

    await db.collection('lottery_claims').doc(claimId).set({ data: claimDoc });
    await persistIssuedRecord(record.id, {
        claim_id: claimId,
        fulfillment_status: 'claim_submitted',
        failure_reason: ''
    });

    return {
        record: {
            ...record,
            claim_id: claimId,
            fulfillment_status: 'claim_submitted'
        },
        claim: claimDoc,
        can_submit: false
    };
}

async function getLotteryClaimDetail(openid, recordId) {
    let record = await getLotteryRecordById(recordId, openid);
    if (!record) throw new Error('中奖记录不存在');
    let claim = record.claim_id
        ? await getLotteryClaimById(record.claim_id)
        : await getLotteryClaimByRecordId(record.id);
    const expireResult = await expireClaimIfNeeded(record, claim);
    record = expireResult.record;
    claim = expireResult.claim;
    const rewardNeedsClaim = requiresLotteryClaim(record);
    return {
        record,
        claim,
        can_submit: !expireResult.expired && rewardNeedsClaim && (
            ['claim_required', 'failed'].includes(pickString(record.fulfillment_status))
            || pickString(claim && claim.status) === 'rejected'
        )
    };
}

async function listLotteryRecords(openid, params = {}) {
    const limit = Math.max(1, Math.min(50, Math.floor(toNumber(params.limit || params.pageSize, 20))));
    const res = await db.collection('lottery_records')
        .where({ openid })
        .orderBy('created_at', 'desc')
        .limit(limit)
        .get()
        .catch(() => ({ data: [] }));

    const records = (res.data || []).map((item) => normalizeLegacyRecord(item));
    const claimIds = records.map((item) => pickString(item.claim_id)).filter(Boolean);
    const recordIds = records.map((item) => pickString(item.id)).filter(Boolean);
    const claimMap = new Map();
    if (claimIds.length > 0 || recordIds.length > 0) {
        const where = claimIds.length > 0
            ? _.or([
                { _id: _.in(claimIds) },
                { lottery_record_id: _.in(recordIds) }
            ])
            : { lottery_record_id: _.in(recordIds) };
        const claims = await getAllRecords(db, 'lottery_claims', where).catch(() => []);
        claims.forEach((item) => {
            claimMap.set(pickString(item._id || item.id), item);
            if (pickString(item.lottery_record_id)) {
                claimMap.set(`record:${pickString(item.lottery_record_id)}`, item);
            }
        });
    }

    const assetRefs = records
        .map((item) => pickString(item.reward_snapshot && item.reward_snapshot.image_ref))
        .filter(isCloudFileId);
    const assetMap = await batchResolveManagedFileUrls(assetRefs);

    const list = [];
    for (const record of records) {
        const claim = claimMap.get(pickString(record.claim_id))
            || claimMap.get(`record:${record.id}`)
            || null;
        list.push(await buildLotteryRecordView(record, claim, assetMap));
    }
    return {
        list
    };
}

function pickConfigPayload(row = {}) {
    if (!row) return {};
    return parseConfigValue(row.config_value !== undefined ? row.config_value : (row.value !== undefined ? row.value : row), {});
}

async function loadMiniProgramConfig() {
    const query = _.or([
        { config_key: 'mini_program_config' },
        { key: 'mini_program_config' }
    ]);
    const [configRes, appConfigRes] = await Promise.all([
        db.collection('configs').where(query).limit(1).get().catch(() => ({ data: [] })),
        db.collection('app_configs').where(query).limit(1).get().catch(() => ({ data: [] }))
    ]);
    const row = (configRes.data && configRes.data[0]) || (appConfigRes.data && appConfigRes.data[0]) || null;
    return pickConfigPayload(row);
}

async function loadLotteryRuntimeConfig() {
    const configRes = await db.collection('configs')
        .where(_.or([
            { type: 'lottery', active: true },
            { config_group: 'lottery' },
            { config_key: 'lottery_config' },
            { key: 'lottery_config' }
        ]))
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));
    const configRow = configRes.data && configRes.data[0] ? configRes.data[0] : null;
    const config = pickConfigPayload(configRow);
    const miniProgramConfig = await loadMiniProgramConfig();
    const featureFlags = miniProgramConfig.feature_flags || miniProgramConfig.feature_toggles || {};
    if (featureFlags.enable_lottery_entry === false || featureFlags.enable_lottery_entry === 0 || featureFlags.enable_lottery_entry === '0') {
        throw new Error('积分抽奖暂未开放');
    }
    if (!isEnabledFlag(config.enabled ?? config.active ?? config.status, true)) {
        throw new Error('积分抽奖活动未启用');
    }
    return config;
}

async function drawLottery(openid, params = {}) {
    const lotteryId = resolveLotteryId(params);
    const config = await loadLotteryRuntimeConfig();

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayRecords = await db.collection('lottery_records')
        .where({
            openid,
            created_at: _.gte(today)
        })
        .count()
        .catch(() => ({ total: 0 }));
    const maxDaily = toNumber(config.max_daily_draws, 3);
    if (todayRecords.total >= maxDaily) {
        throw new Error(`今日抽奖次数已用完（${maxDaily}次）`);
    }

    const prizesRes = await db.collection('lottery_prizes')
        .where(_.or([
            { is_active: true },
            { is_active: 1 },
            { status: true },
            { status: 1 }
        ]))
        .orderBy('sort_order', 'asc')
        .get()
        .catch(() => ({ data: [] }));
    const prizes = [];
    for (const prizeRow of (prizesRes.data || [])) {
        const normalized = await normalizePrizeRuntime(prizeRow);
        if (normalized.is_active && prizeMatchesLottery(normalized, lotteryId)) prizes.push(normalized);
    }
    if (!prizes.length) throw new Error('暂无奖品');
    const drawCostPoints = Math.max(0, Math.floor(toNumber(prizes[0].cost_points || config.cost_points, 0)));
    if (drawCostPoints > 0) {
        const deductRes = await db.collection('users')
            .where({ openid, points: _.gte(drawCostPoints) })
            .update({
                data: {
                    points: _.inc(-drawCostPoints),
                    updated_at: db.serverDate()
                }
            })
            .catch(() => ({ stats: { updated: 0 } }));
        if (!deductRes.stats || deductRes.stats.updated === 0) {
            throw new Error(`积分不足，当前抽奖需要 ${drawCostPoints} 积分`);
        }
        await db.collection('point_logs').add({
            data: {
                openid,
                type: 'spend',
                amount: drawCostPoints,
                source: 'lottery_draw',
                description: `抽奖消耗 ${drawCostPoints} 积分`,
                created_at: db.serverDate()
            }
        }).catch(() => null);
    }

    const totalWeight = prizes.reduce((sum, item) => sum + Math.max(0, toNumber(item.probability, 0)), 0);
    if (totalWeight <= 0) throw new Error('奖池概率配置异常');

    let selectedPrize = prizes[prizes.length - 1];
    let random = Math.random() * totalWeight;
    for (const prize of prizes) {
        random -= Math.max(0, toNumber(prize.probability, 0));
        if (random <= 0) {
            selectedPrize = prize;
            break;
        }
    }

    if (selectedPrize.stock !== -1) {
        const updateRes = await db.collection('lottery_prizes')
            .where({ _id: selectedPrize._id, stock: _.gt(0) })
            .update({
                data: {
                    stock: _.inc(-1),
                    updated_at: db.serverDate()
                }
            })
            .catch(() => ({ stats: { updated: 0 } }));
        if (!updateRes.stats || updateRes.stats.updated === 0) {
            const consolation = prizes.find((item) => normalizePrizeType(item.type) === 'miss');
            selectedPrize = consolation || { ...selectedPrize, type: 'miss', prize_value: 0, stock: -1 };
        }
    }

    const normalizedPrize = await normalizePrizeRuntime(selectedPrize);
    const rewardSnapshot = buildRewardSnapshot(normalizedPrize);
    const rewardType = normalizePrizeType(normalizedPrize.type);
    const drawStatus = rewardType === 'miss' ? 'miss' : 'won';
    const initialFulfillmentStatus = AUTO_REWARD_TYPES.has(rewardType)
        ? 'pending'
        : (CLAIM_REWARD_TYPES.has(rewardType) ? 'claim_required' : 'completed');
    const recordDoc = {
        openid,
        user_id: openid,
        prize_id: normalizedPrize.id,
        prize_name: normalizedPrize.name,
        prize_type: rewardType,
        prize_value: normalizedPrize.prize_value,
        lottery_id: lotteryId,
        cost_points: drawCostPoints,
        draw_status: drawStatus,
        fulfillment_status: initialFulfillmentStatus,
        fulfillment_mode: AUTO_REWARD_TYPES.has(rewardType) ? 'auto' : (CLAIM_REWARD_TYPES.has(rewardType) ? 'claim' : 'manual'),
        reward_ref_type: '',
        reward_ref_id: '',
        reward_actual_type: rewardType,
        failure_reason: '',
        claim_id: '',
        shipping_required: !!rewardSnapshot.shipping_required,
        claim_required: !!rewardSnapshot.claim_required,
        claim_deadline_at: rewardSnapshot.claim_required ? addDaysIso(rewardSnapshot.claim_deadline_days || 7) : '',
        reward_snapshot: rewardSnapshot,
        created_at: db.serverDate(),
        updated_at: db.serverDate()
    };

    const result = await db.collection('lottery_records').add({ data: recordDoc });
    let issuedRecord = normalizeLegacyRecord({
        ...recordDoc,
        _id: result._id,
        id: result._id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    });

    try {
        if (AUTO_REWARD_TYPES.has(rewardType) && drawStatus === 'won') {
            const user = orderCreate.findUserByOpenid ? await orderCreate.findUserByOpenid(openid) : null;
            issuedRecord = await fulfillLotteryRecord(issuedRecord, user);
        } else if (drawStatus === 'miss') {
            await persistIssuedRecord(issuedRecord.id, {
                fulfillment_status: 'completed',
                reward_actual_type: 'miss'
            });
            issuedRecord.fulfillment_status = 'completed';
        }
    } catch (error) {
        await persistIssuedRecord(issuedRecord.id, {
            fulfillment_status: AUTO_REWARD_TYPES.has(rewardType) ? 'failed' : initialFulfillmentStatus,
            failure_reason: error.message || '发奖失败'
        }).catch(() => null);
        issuedRecord.fulfillment_status = AUTO_REWARD_TYPES.has(rewardType) ? 'failed' : initialFulfillmentStatus;
        issuedRecord.failure_reason = error.message || '发奖失败';
    }

    const assetMap = await batchResolveManagedFileUrls([pickString(rewardSnapshot.image_ref)].filter(Boolean));
    const recordView = await buildLotteryRecordView(issuedRecord, null, assetMap);
    return {
        success: true,
        record_id: issuedRecord.id,
        fulfillment_status: recordView.fulfillment_status,
        reward_actual_type: recordView.reward_actual_type,
        action_type: recordView.action_type,
        action_text: recordView.action_text,
        prize: {
            _id: normalizedPrize.id,
            name: normalizedPrize.name,
            type: normalizedPrize.type,
            value: normalizedPrize.prize_value,
            prize_value: normalizedPrize.prize_value,
            image: recordView.image_url,
            image_url: recordView.image_url,
            display_emoji: recordView.display_emoji,
            badge_text: recordView.badge_text,
            theme_color: recordView.theme_color,
            accent_color: recordView.accent_color
        }
    };
}

module.exports = {
    drawLottery,
    listLotteryRecords,
    getLotteryClaimDetail,
    createLotteryClaim,
    normalizePrizeRuntime,
    normalizeLegacyRecord,
    buildLotteryRecordView,
    fulfillLotteryRecord
};
