'use strict';
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const BATCH_SIZE = 100;

function toNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function isoDate(value) {
    if (!value) return '';
    try {
        const date = new Date(value);
        if (!Number.isNaN(date.getTime())) return date.toISOString();
    } catch (_) {}
    return String(value);
}

function buildCollectionQuery(collectionName, where) {
    const collection = db.collection(collectionName);
    return where ? collection.where(where) : collection;
}

function normalizeScopeIds(value) {
    if (Array.isArray(value)) return value.map((item) => String(item));
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) return parsed.map((item) => String(item));
        } catch (_) {
            return value.split(',').map((item) => item.trim()).filter(Boolean);
        }
    }
    return [];
}

async function readAll(collectionName, where) {
    const countRes = await buildCollectionQuery(collectionName, where).count().catch(() => ({ total: 0 }));
    const total = toNumber(countRes.total, 0);
    if (!total) return [];

    const tasks = [];
    for (let skip = 0; skip < total; skip += BATCH_SIZE) {
        tasks.push(buildCollectionQuery(collectionName, where).skip(skip).limit(BATCH_SIZE).get().catch(() => ({ data: [] })));
    }
    const rows = await Promise.all(tasks);
    return rows.flatMap((item) => item.data || []);
}

async function getUserByOpenid(openid) {
    const res = await db.collection('users').where({ openid }).limit(1).get();
    return res.data[0] || null;
}

async function getUserByAnyId(idStr) {
    if (!idStr) return null;
    // 依次尝试不同 ID 字段
    const queries = [
        { openid: idStr },
        { id: Number(idStr) || idStr },
        { _legacy_id: idStr }
    ];
    for (const q of queries) {
        const res = await db.collection('users').where(q).limit(1).get().catch(() => ({ data: [] }));
        if (res.data && res.data.length > 0) return res.data[0];
    }
    // 最后尝试 _id
    try {
        const doc = await db.collection('users').doc(idStr).get();
        if (doc.data) return doc.data;
    } catch (_) {}
    return null;
}

function buildOwnedIdentifiers(openid, user) {
    const identifiers = new Set();
    [openid, user?.openid, user?.id, user?._id, user?._legacy_id].forEach((value) => {
        if (value != null && value !== '') {
            identifiers.add(String(value));
        }
    });
    return identifiers;
}

const DEFAULT_GROWTH_TIERS = [
    { level: 1, name: '普通会员', min: 0, discount: 1, enabled: true },
    { level: 2, name: '银卡会员', min: 100, discount: 0.95, enabled: true },
    { level: 3, name: '金卡会员', min: 500, discount: 0.9, enabled: true },
    { level: 4, name: '钻石会员', min: 2000, discount: 0.85, enabled: true }
];

const DEFAULT_MEMBER_LEVELS = [
    { level: 1, name: '普通会员', discount_rate: 1, enabled: true },
    { level: 2, name: '银卡会员', discount_rate: 0.95, enabled: true },
    { level: 3, name: '金卡会员', discount_rate: 0.9, enabled: true },
    { level: 4, name: '钻石会员', discount_rate: 0.85, enabled: true }
];

async function getMemberTierConfig() {
    try {
        const res = await db.collection('configs')
            .where({ type: 'member-tier-config', active: true })
            .limit(1).get();
        if (res.data && res.data.length > 0 && res.data[0].value) {
            return res.data[0].value;
        }
    } catch (e) {
        console.error('[getMemberTierConfig] 读取失败，使用默认值:', e);
    }
    return null;
}

function buildGrowthProgress(pointsValue, tierConfig) {
    const points = toNumber(pointsValue, 0);
    const tiers = (tierConfig || DEFAULT_GROWTH_TIERS).map((t) => ({
        level: toNumber(t.level, 0),
        name: t.name || '未知等级',
        min: toNumber(t.min || t.min_growth_value || t.growth_threshold, 0),
        discount: toNumber(t.discount, 1),
        enabled: t.enabled !== false
    })).filter((t) => t.enabled).sort((a, b) => a.min - b.min);

    if (!tiers.length) {
        tiers.push({ level: 1, name: '普通会员', min: 0, discount: 1 });
    }

    let current = tiers[0];
    let next = tiers[1] || null;
    for (let i = 0; i < tiers.length; i += 1) {
        if (points >= tiers[i].min) {
            current = tiers[i];
            next = tiers[i + 1] || null;
        }
    }
    const percent = next ? Math.min(100, Math.round(((points - current.min) / Math.max(1, next.min - current.min)) * 100)) : 100;
    return { current, next, percent, next_threshold: next ? next.min : null };
}

function formatUser(user, tierConfig) {
    const nickName = user.nickName || user.nickname || '';
    const avatarUrl = user.avatarUrl || user.avatar_url || '';
    const points = toNumber(user.points != null ? user.points : user.growth_value, 0);
    const balance = toNumber(user.wallet_balance != null ? user.wallet_balance : user.balance, 0);
    return {
        ...user,
        nickName,
        nickname: nickName,
        avatarUrl,
        avatar_url: avatarUrl,
        distributor_level: toNumber(user.distributor_level != null ? user.distributor_level : user.agent_level, 0),
        wallet_balance: balance,
        balance,
        growth_value: points,
        points,
        invite_code: user.invite_code || user.my_invite_code || '',
        growth_progress: buildGrowthProgress(points, tierConfig)
    };
}

function formatAddress(address) {
    const id = address.id != null ? address.id : address._id;
    return {
        ...address,
        id,
        openid: address.openid || address.user_id || '',
        receiver_name: address.receiver_name || address.contact_name || address.name || '',
        phone: address.phone || address.contact_phone || '',
        detail: address.detail || address.detail_address || '',
        contact_name: address.receiver_name || address.contact_name || address.name || '',
        contact_phone: address.phone || address.contact_phone || '',
        detail_address: address.detail || address.detail_address || '',
        is_default: !!address.is_default
    };
}

function formatCoupon(coupon) {
    return {
        ...coupon,
        id: coupon.id != null ? coupon.id : coupon._id,
        coupon_id: coupon.coupon_id != null ? coupon.coupon_id : coupon.id,
        min_purchase: toNumber(coupon.min_purchase, 0),
        coupon_value: toNumber(coupon.coupon_value, 0)
    };
}

async function queryAddresses(openid, user = null) {
    const identifiers = buildOwnedIdentifiers(openid, user);
    const orConditions = [...identifiers].map((id) => [{ openid: id }, { user_id: id }]).flat();
    const where = orConditions.length > 0 ? _.or(orConditions) : { openid };
    const rows = await readAll('addresses', where);
    return rows.sort((a, b) => {
        const left = Number(!!a.is_default);
        const right = Number(!!b.is_default);
        if (right !== left) return right - left;
        return new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime();
    });
}

async function getAddressById(openid, addressId, user = null) {
    const rows = await queryAddresses(openid, user);
    return rows.find((item) => String(item._id) === String(addressId) || String(item.id) === String(addressId)) || null;
}

async function resetDefaultAddress(openid, user = null) {
    const rows = await queryAddresses(openid, user);
    await Promise.all(rows.filter((item) => item.is_default).map((item) => db.collection('addresses').doc(item._id).update({
        data: { is_default: false, updated_at: db.serverDate() }
    })));
}

function matchOwnedRow(item, openid, user) {
    const identifiers = new Set([
        String(openid),
        String(user?.id || ''),
        String(user?._legacy_id || '')
    ]);
    return [
        item?.openid,
        item?.user_id,
        item?.buyer_id
    ].some((candidate) => candidate != null && identifiers.has(String(candidate)));
}

async function queryByOwnership(collectionName, openid, user, extraWhere) {
    const identifiers = buildOwnedIdentifiers(openid, user);
    const orConditions = [...identifiers].map((id) => [{ openid: id }, { user_id: id }, { buyer_id: id }]).flat();
    const ownershipWhere = orConditions.length > 0 ? _.or(orConditions) : { openid };
    const combinedWhere = extraWhere ? _.and(ownershipWhere, extraWhere) : ownershipWhere;
    return readAll(collectionName, combinedWhere);
}

async function listOrdersForUser(openid, user) {
    const identifiers = buildOwnedIdentifiers(openid, user);
    const orConditions = [...identifiers].map((id) => [{ openid: id }, { buyer_id: id }, { user_id: id }]).flat();
    const where = orConditions.length > 0 ? _.or(orConditions) : { openid };
    return readAll('orders', where);
}

function buildCommissionOverview(rows) {
    return rows.reduce((acc, row) => {
        const amount = toNumber(row.amount, 0);
        const status = row.status || 'pending_approval';
        acc.total += amount;
        if (status === 'frozen') acc.frozen += amount;
        else if (status === 'pending' || status === 'pending_approval') acc.pendingIn += amount;
        else if (status === 'approved' || status === 'available') acc.approved += amount;
        else if (status === 'settled' || status === 'completed') acc.available += amount;
        return acc;
    }, {
        total: 0,
        frozen: 0,
        pendingIn: 0,
        approved: 0,
        available: 0
    });
}

const WALLET_COMMISSION_STATUSES = new Set(['settled', 'available', 'completed']);
const WALLET_WITHDRAWAL_STATUSES = new Set(['pending', 'approved', 'processing', 'completed', 'paid']);

function roundMoney(value) {
    return Math.round(toNumber(value, 0) * 100) / 100;
}

function buildWalletLedger(commissions, withdrawals, storedBalance) {
    const settledCommission = roundMoney((commissions || []).reduce((sum, row) => {
        const status = String(row.status || '').toLowerCase();
        return WALLET_COMMISSION_STATUSES.has(status) ? sum + toNumber(row.amount, 0) : sum;
    }, 0));

    const committedWithdrawal = roundMoney((withdrawals || []).reduce((sum, row) => {
        const status = String(row.status || '').toLowerCase();
        return WALLET_WITHDRAWAL_STATUSES.has(status) ? sum + toNumber(row.amount, 0) : sum;
    }, 0));

    const safeStoredBalance = Math.max(0, roundMoney(storedBalance));
    const hasLedger = (commissions || []).length > 0 || (withdrawals || []).length > 0;
    const balance = hasLedger
        ? Math.max(0, roundMoney(settledCommission - committedWithdrawal))
        : safeStoredBalance;

    return {
        hasLedger,
        balance,
        settledCommission,
        committedWithdrawal,
        storedBalance: safeStoredBalance,
        drift: roundMoney(balance - safeStoredBalance)
    };
}

async function syncWalletBalance(user, balance) {
    if (!user?._id) return;
    const current = Math.max(0, roundMoney(user.wallet_balance != null ? user.wallet_balance : user.balance));
    const next = Math.max(0, roundMoney(balance));
    if (Math.abs(current - next) < 0.01) return;
    await db.collection('users').doc(user._id).update({
        data: {
            wallet_balance: next,
            balance: next,
            updated_at: db.serverDate()
        }
    }).catch((err) => {
        console.warn('[wallet] sync balance failed:', err);
    });
}

function normalizeWalletWithdrawal(row) {
    return {
        ...row,
        id: row.id || row._legacy_id || row._id,
        type: 'withdrawal',
        amount: roundMoney(row.amount),
        fee: roundMoney(row.fee),
        actual_amount: roundMoney(row.actual_amount != null ? row.actual_amount : (toNumber(row.amount, 0) - toNumber(row.fee, 0))),
        status: row.status || 'pending',
        created_at: isoDate(row.created_at),
        updated_at: isoDate(row.updated_at),
        refund_deadline: '',
        withdrawal_no: row.withdrawal_no || '',
        remark: row.remark || '',
        reject_reason: row.reject_reason || ''
    };
}

function buildPointsAccount(user, orders, status = {}) {
    const profile = formatUser(user || {});
    const growth = profile.growth_progress || buildGrowthProgress(profile.growth_value);
    const level = growth.current?.level || 1;
    const balancePoints = profile.points;
    const totalPoints = profile.points;
    const streak = toNumber(status.streak != null ? status.streak : user?.points_signin_streak, 0);
    const todaySigned = Boolean(status.signed != null ? status.signed : user?.points_today_signed);
    const next = growth.next || null;
    const totalOrders = orders.length;

    return {
        balance_points: balancePoints,
        total_points: totalPoints,
        growth_value: profile.growth_value,
        level,
        level_name: growth.current?.name || `Lv${level}`,
        checkin_streak: streak,
        today_signed: todaySigned,
        total_orders: totalOrders,
        next_level: next ? {
            level: next.level,
            name: next.name,
            min: next.min,
            growth_needed: Math.max(0, next.min - profile.growth_value)
        } : null,
        growth_progress: toNumber(growth.percent, 100)
    };
}

function buildPointsTasks(account) {
    return {
        tasks: [
            {
                id: 'daily-signin',
                title: '每日签到',
                desc: account.today_signed ? '今日已完成签到' : '每日签到可获得积分',
                points: 10,
                done: !!account.today_signed,
                current: account.today_signed ? 1 : 0,
                total: 1
            },
            {
                id: 'growth-progress',
                title: '成长值进度',
                desc: account.next_level
                    ? `当前为 ${account.level_name}，距离 ${account.next_level.name} 还差 ${account.next_level.growth_needed} 成长值`
                    : '已达到当前成长体系最高展示档位',
                points: 0,
                done: !account.next_level,
                current: account.growth_value,
                total: account.next_level ? account.next_level.min : account.growth_value || 1
            }
        ]
    };
}

function normalizePointsLog(row) {
    return {
        ...row,
        id: row.id || row._legacy_id || row._id,
        points: toNumber(row.points != null ? row.points : row.amount, 0),
        created_at: isoDate(row.created_at),
        type: row.type || row.change_type || 'manual'
    };
}

async function buildMemberTierMeta() {
    const savedConfig = await getMemberTierConfig();

    const growthTiers = ((savedConfig && savedConfig.tiers) || DEFAULT_GROWTH_TIERS).map((t) => ({
        level: toNumber(t.level, 0),
        name: t.name || '未知等级',
        min: toNumber(t.min || t.min_growth_value || t.growth_threshold, 0),
        discount: toNumber(t.discount, 1),
        desc: t.desc || '',
        enabled: t.enabled !== false
    })).filter((t) => t.enabled).sort((a, b) => a.min - b.min);

    const memberLevels = ((savedConfig && savedConfig.member_levels) || DEFAULT_MEMBER_LEVELS).map((m) => ({
        level: toNumber(m.level, 0),
        name: m.name || '未知等级',
        discount_rate: toNumber(m.discount_rate || m.discount, 1),
        desc: m.desc || '',
        perks: m.perks || [],
        enabled: m.enabled !== false
    })).filter((m) => m.enabled).sort((a, b) => a.level - b.level);

    const purchaseLevels = (savedConfig && savedConfig.purchase_levels) || [
        { code: 'retail', name: '零售', enabled: true },
        { code: 'member', name: '会员价', enabled: true },
        { code: 'leader', name: '团长价', enabled: true },
        { code: 'agent', name: '代理价', enabled: true }
    ];

    return { growth_tiers: growthTiers, member_levels: memberLevels, purchase_levels: purchaseLevels };
}

exports.main = async (event) => {
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;
    const { action, ...params } = event;
    const user = await getUserByOpenid(openid);

    if (action === 'getProfile') {
        if (!user) return { code: 404, success: false, message: '用户不存在' };
        const tierConfig = await getMemberTierConfig();
        return { code: 0, success: true, data: formatUser(user, tierConfig) };
    }

    if (action === 'updateProfile') {
        if (!user) return { code: 404, success: false, message: '用户不存在' };
        const update = { updated_at: db.serverDate() };
        if (params.nickname) {
            update.nickName = params.nickname;
            update.nickname = params.nickname;
        }
        if (params.avatar_url || params.avatarUrl) {
            update.avatarUrl = params.avatarUrl || params.avatar_url;
            update.avatar_url = params.avatarUrl || params.avatar_url;
        }
        if (params.phone) update.phone = params.phone;
        await db.collection('users').doc(user._id).update({ data: update });
        return { code: 0, success: true };
    }

    if (action === 'getStats') {
        if (!user) return { code: 0, success: true, data: { points: 0, balance: 0, distributor_level: 0, role_level: 0 } };
        return {
            code: 0,
            success: true,
            data: {
                points: toNumber(user.points != null ? user.points : user.growth_value, 0),
                balance: toNumber(user.wallet_balance != null ? user.wallet_balance : user.balance, 0),
                distributor_level: toNumber(user.distributor_level != null ? user.distributor_level : user.agent_level, 0),
                agent_level: toNumber(user.agent_level != null ? user.agent_level : user.distributor_level, 0),
                role_level: toNumber(user.role_level, 0)
            }
        };
    }

    if (action === 'listAddresses') {
        const rows = await queryAddresses(openid, user);
        return { code: 0, success: true, data: rows.map(formatAddress) };
    }

    if (action === 'getAddressDetail') {
        const address = await getAddressById(openid, params.address_id, user);
        if (!address) return { code: 404, success: false, message: '地址不存在' };
        return { code: 0, success: true, data: formatAddress(address) };
    }

    if (action === 'addAddress') {
        if (params.is_default) await resetDefaultAddress(openid, user);
        const payload = {
            openid,
            user_id: user?.id || openid,
            receiver_name: params.receiver_name || params.contact_name || '',
            phone: params.phone || params.contact_phone || '',
            province: params.province || '',
            city: params.city || '',
            district: params.district || '',
            detail: params.detail || params.detail_address || '',
            is_default: !!params.is_default,
            created_at: db.serverDate(),
            updated_at: db.serverDate()
        };
        const res = await db.collection('addresses').add({ data: payload });
        return { code: 0, success: true, data: { _id: res._id } };
    }

    if (action === 'updateAddress') {
        const address = await getAddressById(openid, params.address_id, user);
        if (!address) return { code: 404, success: false, message: '地址不存在' };
        if (params.is_default) await resetDefaultAddress(openid, user);
        await db.collection('addresses').doc(address._id).update({
            data: {
                receiver_name: params.receiver_name || params.contact_name || address.receiver_name || '',
                phone: params.phone || params.contact_phone || address.phone || '',
                province: params.province || address.province || '',
                city: params.city || address.city || '',
                district: params.district || address.district || '',
                detail: params.detail || params.detail_address || address.detail || '',
                is_default: params.is_default != null ? !!params.is_default : !!address.is_default,
                openid,
                user_id: user?.id || openid,
                updated_at: db.serverDate()
            }
        });
        return { code: 0, success: true };
    }

    if (action === 'deleteAddress') {
        const address = await getAddressById(openid, params.address_id, user);
        if (!address) return { code: 404, success: false, message: '地址不存在' };
        await db.collection('addresses').doc(address._id).remove();
        return { code: 0, success: true };
    }

    if (action === 'setDefaultAddress') {
        const address = await getAddressById(openid, params.address_id, user);
        if (!address) return { code: 404, success: false, message: '地址不存在' };
        await resetDefaultAddress(openid, user);
        await db.collection('addresses').doc(address._id).update({
            data: { is_default: true, openid, user_id: user?.id || openid, updated_at: db.serverDate() }
        });
        return { code: 0, success: true };
    }

    // ── 收藏同步 ────────────────────────────────
    if (action === 'syncFavorites') {
        if (!user) return { code: 401, success: false, message: '请先登录' };
        const favorites = Array.isArray(params.favorites) ? params.favorites : [];
        const existingRows = await queryByOwnership('user_favorites', openid, user);
        const existingPids = new Set(existingRows.map((item) => String(item.product_id)));
        let synced = 0;
        for (const fav of favorites) {
            const pid = String(fav.product_id || fav.id || '');
            if (pid && !existingPids.has(pid)) {
                await db.collection('user_favorites').add({
                    data: {
                        openid,
                        user_id: user.id || user._legacy_id || openid,
                        product_id: pid,
                        created_at: db.serverDate(),
                        updated_at: db.serverDate()
                    }
                }).catch(() => null);
                synced += 1;
            }
        }
        return { code: 0, success: true, data: { synced, total: favorites.length } };
    }

    if (action === 'listCoupons') {
        const status = params.status || 'unused';
        const rows = await queryByOwnership('user_coupons', openid, user, { status });
        return { code: 0, success: true, data: rows.map(formatCoupon) };
    }

    // 领取单张优惠券（从 coupons 模板写入 user_coupons）
    if (action === 'claimCoupon') {
        const couponId = params.coupon_id;
        if (!couponId) return { code: 400, success: false, message: '缺少 coupon_id' };
        const template = await db.collection('coupons').doc(String(couponId)).get().catch(() => ({ data: null }));
        const tpl = template.data;
        if (!tpl) return { code: 404, success: false, message: '优惠券模板不存在' };
        if (tpl.is_active === false) return { code: 400, success: false, message: '该优惠券已下架' };
        if (tpl.stock > 0) {
            const claimedCount = (await db.collection('user_coupons').where({ coupon_id: String(tpl.id) || tpl._id }).count()).total;
            if (claimedCount >= tpl.stock) return { code: 400, success: false, message: '该优惠券已领完' };
        }
        const already = await queryByOwnership('user_coupons', openid, user, { coupon_id: String(tpl.id) || tpl._id });
        if (already.length > 0) return { code: 409, success: false, message: '已经领取过了' };
        const now = new Date();
        const validDays = toNumber(tpl.valid_days, 30);
        const expireAt = new Date(now.getTime() + validDays * 86400000);
        const newDoc = {
            openid,
            user_id: user ? user._id : openid,
            coupon_id: String(tpl.id) || tpl._id,
            coupon_name: tpl.name,
            coupon_type: tpl.type === 'percent' ? 'percent' : 'fixed',
            coupon_value: toNumber(tpl.value, 0),
            min_purchase: toNumber(tpl.min_purchase, 0),
            scope: tpl.scope || 'all',
            scope_ids: Array.isArray(tpl.scope_ids) ? tpl.scope_ids : [],
            status: 'unused',
            created_at: db.serverDate(),
            expire_at: db.serverDate({ offset: validDays * 24 * 60 * 60 })
        };
        const res = await db.collection('user_coupons').add({ data: newDoc });
        return { code: 0, success: true, data: { id: res._id, ...newDoc } };
    }

    // 领取所有新人注册券（自动发放，幂等）
    if (action === 'claimWelcomeCoupons') {
        const allTemplates = await readAll('coupons', {});
        const templates = allTemplates.filter((t) =>
            t.is_active !== false && t.type !== undefined && (t.name.includes('注册') || t.name.includes('见面礼') || t.name.includes('开运') || t.name.includes('新人'))
        );
        const results = [];
        for (const tpl of templates) {
            const cid = String(tpl.id) || tpl._id;
            const already = await queryByOwnership('user_coupons', openid, user, { coupon_id: cid });
            if (already.length > 0) continue;
            if (tpl.stock > 0) {
                const claimed = (await db.collection('user_coupons').where({ coupon_id: cid }).count()).total;
                if (claimed >= tpl.stock) continue;
            }
            const validDays = toNumber(tpl.valid_days, 30);
            const newDoc = {
                openid,
                user_id: user ? user._id : openid,
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
            };
            const res = await db.collection('user_coupons').add({ data: newDoc });
            results.push({ id: res._id, coupon_name: tpl.name });
        }
        return { code: 0, success: true, data: { claimed_count: results.length, coupons: results } };
    }

    if (action === 'getFavorites') {
        const rows = await queryByOwnership('user_favorites', openid, user);
        return { code: 0, success: true, data: { list: rows, total: rows.length } };
    }

    if (action === 'addFavorite') {
        const rows = await queryByOwnership('user_favorites', openid, user);
        const exists = rows.find((item) => String(item.product_id) === String(params.product_id));
        if (!exists) {
            await db.collection('user_favorites').add({
                data: {
                    openid,
                    user_id: user?.id || openid,
                    product_id: params.product_id,
                    created_at: db.serverDate(),
                    updated_at: db.serverDate()
                }
            });
        }
        return { code: 0, success: true };
    }

    if (action === 'removeFavorite') {
        const rows = await queryByOwnership('user_favorites', openid, user);
        const target = rows.find((item) => String(item.product_id) === String(params.product_id));
        if (target) await db.collection('user_favorites').doc(target._id).remove();
        return { code: 0, success: true };
    }

    if (action === 'listNotifications') {
        const rows = await queryByOwnership('notifications', openid, user);
        rows.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
        const unreadCount = rows.filter((item) => !item.is_read).length;
        return { code: 0, success: true, data: { list: rows, total: rows.length, unread_count: unreadCount } };
    }

    if (action === 'markRead') {
        await db.collection('notifications').doc(String(params.notification_id)).update({
            data: { is_read: true, updated_at: db.serverDate() }
        }).catch(() => null);
        return { code: 0, success: true };
    }

    if (action === 'listStations') {
        const res = await db.collection('stations').where({ status: 'active' }).get().catch(() => ({ data: [] }));
        return { code: 0, success: true, data: res.data };
    }

    // ── 我的门店/核销权限（my-station 页 + 门店核销入口） ──
    if (action === 'getPickupScope') {
        if (!user) {
            return { code: 0, success: true, data: { has_verify_access: false, station_count: 0, requires_station_selection: false, stations: [] } };
        }

        // 1. 查找当前用户在 pickup_verifiers 中的记录
        const userIds = [String(user.id || ''), String(user._id || ''), String(user._legacy_id || ''), String(openid)];
        const verifiersOrConds = _.or(
            ...userIds.filter(Boolean).map((id) => [{ user_id: id }, { openid: id }]).flat()
        );
        const verifierRows = await readAll('pickup_verifiers', _.and(verifiersOrConds, { status: 'active' }));

        if (!verifierRows.length) {
            return { code: 0, success: true, data: { has_verify_access: false, station_count: 0, requires_station_selection: false, stations: [] } };
        }

        // 2. 收集用户所属门店 ID
        const myStationIds = new Set(verifierRows.map((v) => String(v.station_id)).filter(Boolean));

        // 3. 查询所有相关门店
        const allStations = await readAll('stations', {});
        const myStations = allStations.filter((s) => {
            const sid = String(s.id || s._id || '');
            return myStationIds.has(sid) && (s.status === 'active' || s.status === 1 || s.status === '1');
        });

        // 4. 批量查询所有相关门店的核销员，并预加载用户信息
        const allStationIds = myStations.map((s) => Number(s.id || s._id));
        const allStationVerifiers = [];
        for (const sid of allStationIds) {
            const rows = await readAll('pickup_verifiers', { station_id: sid });
            allStationVerifiers.push(...rows);
        }
        const activeVerifiers = allStationVerifiers.filter((v) => v.status === 'active');

        // 批量查询涉及的用户信息
        const involvedUserIds = [...new Set(activeVerifiers.map((v) => String(v.user_id)).filter(Boolean))];
        const userMap = {};
        for (const uid of involvedUserIds) {
            const u = await getUserByAnyId(uid);
            if (u) userMap[uid] = u;
        }

        // 5. 组装每个门店的数据
        const stationResults = [];
        for (const station of myStations) {
            const sid = String(station.id || station._id);
            const stationVerifiers = activeVerifiers.filter((v) => String(v.station_id) === sid);

            const managerCount = stationVerifiers.filter((v) => v.role === 'manager').length;
            const verifyCount = stationVerifiers.length;

            const myVerifier = verifierRows.find((v) => String(v.station_id) === sid);
            const myRole = myVerifier?.role || 'staff';
            const canVerify = !!myVerifier;

            const preview = stationVerifiers.slice(0, 5).map((v) => {
                const vUser = userMap[String(v.user_id)] || null;
                return {
                    id: v.id || v._id,
                    user_id: v.user_id,
                    role: v.role || (v.remark && v.remark.includes('店长') ? 'manager' : 'staff'),
                    can_verify: v.status === 'active',
                    user: vUser ? {
                        nickname: vUser.nickname || vUser.nickName || '',
                        phone: vUser.phone || ''
                    } : { nickname: '用户' + v.user_id, phone: '' }
                };
            });

            stationResults.push({
                id: sid,
                name: station.name || station.station_name || '',
                province: station.province || '',
                city: station.city || '',
                district: station.district || '',
                address: station.address || '',
                contact_phone: station.contact_phone || station.pickup_contact || '',
                business_time_start: station.business_time_start || '',
                business_time_end: station.business_time_end || '',
                my_role: myRole,
                can_verify: canVerify,
                staff_summary: {
                    total: stationVerifiers.length,
                    verify_count: verifyCount,
                    manager_count: managerCount,
                    preview
                }
            });
        }

        const requiresStationSelection = stationResults.length > 1;

        return {
            code: 0,
            success: true,
            data: {
                has_verify_access: stationResults.length > 0,
                station_count: stationResults.length,
                requires_station_selection: requiresStationSelection,
                stations: stationResults
            }
        };
    }

    // ── 升级资格检查 ──────────────────────────────
    if (action === 'upgradeEligibility') {
        if (!user) return { code: 0, success: true, data: { eligible: false, message: '请先登录' } };
        const currentLevel = toNumber(user.role_level, 0);
        const targetLevel = toNumber(params.target_level, currentLevel + 1);
        // 简单的升级条件：订单数和消费额达到阈值
        const userOrders = await listOrdersForUser(openid, user);
        const totalSpent = userOrders
            .filter((o) => ['paid', 'completed', 'shipped', 'pending_ship'].includes(o.status))
            .reduce((sum, o) => sum + toNumber(o.pay_amount != null ? o.pay_amount : o.actual_price, 0), 0);
        const THRESHOLDS = [
            { level: 1, min_orders: 0, min_spent: 0 },       // 普通用户
            { level: 2, min_orders: 1, min_spent: 0 },       // 会员
            { level: 3, min_orders: 5, min_spent: 500 },     // 团长
            { level: 4, min_orders: 20, min_spent: 2000 }    // 代理商
        ];
        const threshold = THRESHOLDS.find((t) => t.level === targetLevel) || { min_orders: 999, min_spent: 99999 };
        const conditionsMet = [
            { key: 'orders', label: '订单数', current: userOrders.length, required: threshold.min_orders, met: userOrders.length >= threshold.min_orders },
            { key: 'spent', label: '消费额', current: totalSpent, required: threshold.min_spent, met: totalSpent >= threshold.min_spent }
        ];
        const eligible = currentLevel < targetLevel && conditionsMet.every((c) => c.met);
        return {
            code: 0,
            success: true,
            data: {
                eligible,
                current_level: currentLevel,
                target_level: targetLevel,
                conditions_met: conditionsMet,
                message: eligible ? '满足升级条件' : '条件未满足'
            }
        };
    }

    // ── 执行升级 ────────────────────────────────
    if (action === 'upgrade') {
        if (!user) return { code: 401, success: false, message: '请先登录' };
        const currentLevel = toNumber(user.role_level, 0);
        const targetLevel = toNumber(params.target_level, currentLevel + 1);
        if (targetLevel <= currentLevel) return { code: 400, success: false, message: '目标等级不能低于当前等级' };
        // 复用资格检查逻辑
        const userOrders = await listOrdersForUser(openid, user);
        const totalSpent = userOrders
            .filter((o) => ['paid', 'completed', 'shipped', 'pending_ship'].includes(o.status))
            .reduce((sum, o) => sum + toNumber(o.pay_amount != null ? o.pay_amount : o.actual_price, 0), 0);
        const THRESHOLDS = [
            { level: 1, min_orders: 0, min_spent: 0 },
            { level: 2, min_orders: 1, min_spent: 0 },
            { level: 3, min_orders: 5, min_spent: 500 },
            { level: 4, min_orders: 20, min_spent: 2000 }
        ];
        const threshold = THRESHOLDS.find((t) => t.level === targetLevel) || { min_orders: 999, min_spent: 99999 };
        const eligible = userOrders.length >= threshold.min_orders && totalSpent >= threshold.min_spent;
        if (!eligible) return { code: 400, success: false, message: '升级条件未满足' };
        await db.collection('users').doc(user._id).update({
            data: { role_level: targetLevel, updated_at: db.serverDate() }
        });
        return { code: 0, success: true, data: { new_level: targetLevel } };
    }

    if (action === 'availableCoupons') {
        const allCoupons = await queryByOwnership('user_coupons', openid, user, { status: 'unused' });
        const now = new Date();
        const amount = toNumber(params.amount, 0);
        const productIds = String(params.product_ids || '').split(',').map((item) => item.trim()).filter(Boolean);
        const categoryIds = String(params.category_ids || '').split(',').map((item) => item.trim()).filter(Boolean);

        const available = allCoupons.filter((c) => {
            // 检查是否过期
            const expireAt = c.expire_at ? new Date(c.expire_at) : null;
            if (expireAt && expireAt <= now) return false;

            // 检查最低消费门槛
            const minPurchase = toNumber(c.min_purchase, 0);
            if (minPurchase > 0 && amount < minPurchase) return false;

            // 检查适用范围
            const scope = c.scope || 'all';
            if (scope === 'all') return true;
            if (scope === 'product') {
                const ids = normalizeScopeIds(c.scope_ids);
                return productIds.some((pid) => ids.includes(String(pid)));
            }
            if (scope === 'category') {
                const ids = normalizeScopeIds(c.scope_ids);
                return categoryIds.some((cid) => ids.includes(String(cid)));
            }
            return true;
        });

        return { code: 0, success: true, data: available.map(formatCoupon) };
    }

    const orders = user ? await listOrdersForUser(openid, user) : [];
    const commissions = user ? await queryByOwnership('commissions', openid, user) : [];
    const withdrawals = user ? await queryByOwnership('withdrawals', openid, user) : [];
    const commissionOverview = buildCommissionOverview(commissions);
    const walletLedger = buildWalletLedger(
        commissions,
        withdrawals,
        toNumber(user?.wallet_balance != null ? user?.wallet_balance : user?.balance, 0)
    );

    if (action === 'pointsSignInStatus') {
        const signedAt = String(user?.points_last_signin_at || '').slice(0, 10);
        const today = new Date().toISOString().slice(0, 10);
        const signed = signedAt === today || !!user?.points_today_signed;
        return {
            code: 0,
            success: true,
            data: {
                status: signed,
                signed,
                consecutive: toNumber(user?.points_signin_streak, 0),
                streak: toNumber(user?.points_signin_streak, 0),
                points_today: signed ? 10 : 0
            }
        };
    }

    if (action === 'pointsAccount') {
        const signInStatus = { streak: toNumber(user?.points_signin_streak, 0), signed: !!user?.points_today_signed };
        const account = buildPointsAccount(user, orders, signInStatus);
        return { code: 0, success: true, data: account };
    }

    if (action === 'pointsTasks') {
        const account = buildPointsAccount(user, orders);
        return { code: 0, success: true, data: buildPointsTasks(account) };
    }

    if (action === 'pointsLogs') {
        const rows = (await queryByOwnership('points_logs', openid, user))
            .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
            .map(normalizePointsLog);
        return { code: 0, success: true, data: { list: rows, pagination: { total: rows.length, page: 1, limit: rows.length || 30 } } };
    }

    if (action === 'pointsSignIn') {
        if (!user) return { code: 401, success: false, message: '请先登录' };
        const today = new Date().toISOString().slice(0, 10);
        const signedAt = String(user.points_last_signin_at || '').slice(0, 10);
        if (signedAt === today || user.points_today_signed) {
            return { code: 400, success: false, message: '今日已签到' };
        }

        const currentPoints = toNumber(user.points != null ? user.points : user.growth_value, 0);
        const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        const nextStreak = String(user.points_last_signin_at || '').slice(0, 10) === yesterday
            ? toNumber(user.points_signin_streak, 0) + 1
            : 1;
        const earned = 10;

        await db.collection('users').doc(user._id).update({
            data: {
                points: currentPoints + earned,
                growth_value: currentPoints + earned,
                points_today_signed: true,
                points_last_signin_at: today,
                points_signin_streak: nextStreak,
                updated_at: db.serverDate()
            }
        });

        await db.collection('points_logs').add({
            data: {
                openid,
                user_id: user.id || user._legacy_id || openid,
                type: 'daily_signin',
                title: '每日签到',
                points: earned,
                created_at: db.serverDate(),
                updated_at: db.serverDate()
            }
        }).catch(() => null);

        return {
            code: 0,
            success: true,
            data: {
                points_earned: earned,
                streak: nextStreak,
                total_points: currentPoints + earned,
                balance_points: currentPoints + earned,
                level: buildGrowthProgress(currentPoints + earned).current.level
            }
        };
    }

    if (action === 'walletInfo') {
        if (user && walletLedger.hasLedger && Math.abs(walletLedger.drift) >= 0.01) {
            await syncWalletBalance(user, walletLedger.balance);
        }
        return {
            code: 0,
            success: true,
            data: {
                commission: commissionOverview,
                points: toNumber(user?.points != null ? user.points : user?.growth_value, 0),
                balance: walletLedger.balance
            }
        };
    }

    if (action === 'walletCommissions') {
        if (user && walletLedger.hasLedger && Math.abs(walletLedger.drift) >= 0.01) {
            await syncWalletBalance(user, walletLedger.balance);
        }
        const rows = commissions
            .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
            .map((item) => ({
                ...item,
                id: item.id || item._legacy_id || item._id,
                amount: toNumber(item.amount, 0),
                created_at: isoDate(item.created_at),
                refund_deadline: isoDate(item.refund_deadline)
            }))
            .concat(withdrawals.map(normalizeWalletWithdrawal))
            .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
        return { code: 0, success: true, data: { list: rows, pagination: { total: rows.length, page: 1, limit: rows.length || 20 } } };
    }

    // ── 会员等级元数据 ────────────────────────────
    if (action === 'memberTierMeta') {
        const tierConfig = await getMemberTierConfig();
        const data = await buildMemberTierMeta();
        if (user) {
            const g = toNumber(user.points != null ? user.points : user.growth_value, 0);
            const roleLevel = toNumber(user.role_level, 0);
            const roleName = user.role_name || user.distributor_level_name || '';
            const rawTiers = (data.growth_tiers || []).slice().sort((a, b) => (a.min || 0) - (b.min || 0));
            let currentIdx = 0;
            for (let i = 0; i < rawTiers.length; i++) {
                if (g >= (rawTiers[i].min || 0)) currentIdx = i;
                else break;
            }
            const currentTier = rawTiers[currentIdx] || {};
            data.current = {
                current_growth_tier: { min: currentTier.min || 0 },
                role_name: roleName || currentTier.name || '普通用户'
            };
        }
        return { code: 0, success: true, data };
    }

    // ── 用户偏好 ────────────────────────────────
    if (action === 'getPreferences') {
        const prefs = user?.preferences || {};
        return { code: 0, success: true, data: prefs };
    }

    if (action === 'submitPreferences') {
        if (!user) return { code: 401, success: false, message: '请先登录' };
        await db.collection('users').doc(user._id).update({
            data: { preferences: params, updated_at: db.serverDate() }
        });
        return { code: 0, success: true };
    }

    // ── 清空收藏 ────────────────────────────────
    if (action === 'clearAllFavorites') {
        const rows = await queryByOwnership('user_favorites', openid, user);
        await Promise.all(rows.map((item) => db.collection('user_favorites').doc(item._id).remove()));
        return { code: 0, success: true };
    }

    // ── 门户初始密码 ─────────────────────────────
    if (action === 'applyInitialPassword') {
        if (!user) return { code: 401, success: false, message: '请先登录' };
        const raw = String(Date.now()).slice(-6);
        await db.collection('users').doc(user._id).update({
            data: { portal_password: raw, portal_password_set: true, updated_at: db.serverDate() }
        });
        return { code: 0, success: true, data: { password: raw } };
    }

    // ── 升级申请 ────────────────────────────────
    if (action === 'upgradeApply') {
        if (!user) return { code: 401, success: false, message: '请先登录' };
        await db.collection('upgrade_requests').add({
            data: {
                openid,
                user_id: user.id || user._legacy_id || openid,
                current_level: toNumber(user.role_level, 0),
                target_level: toNumber(params.target_level, toNumber(user.role_level, 0) + 1),
                reason: params.reason || '',
                status: 'pending',
                created_at: db.serverDate(),
                updated_at: db.serverDate()
            }
        });
        return { code: 0, success: true, data: { message: '申请已提交' } };
    }

    // ── 工单列表 ────────────────────────────────
    if (action === 'listTickets') {
        const rows = await queryByOwnership('tickets', openid, user);
        rows.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
        return { code: 0, success: true, data: { list: rows, total: rows.length } };
    }

    // ── 分享资格 ────────────────────────────────
    if (action === 'shareEligibility') {
        if (!user) return { code: 0, success: true, data: { eligible: false, reason: '请先登录' } };
        const level = toNumber(user.role_level, 0);
        return {
            code: 0,
            success: true,
            data: {
                eligible: level >= 1,
                reason: level < 1 ? '需成为会员才能分享' : '',
                share_code: user.my_invite_code || user.invite_code || ''
            }
        };
    }

    // ── 问卷提交 ────────────────────────────────
    if (action === 'submitQuestionnaire') {
        if (!user) return { code: 401, success: false, message: '请先登录' };
        await db.collection('questionnaire_responses').add({
            data: {
                openid,
                user_id: user.id || user._legacy_id || openid,
                answers: params.answers || {},
                created_at: db.serverDate()
            }
        });
        return { code: 0, success: true, data: { message: '提交成功' } };
    }

    // ── 自提站点选项(下单时选择) ──────────────────────
    if (action === 'pickupOptions') {
        const res = await db.collection('stations')
            .where({ status: _.in([true, 1, '1']), support_pickup: _.in([true, 1, '1']) })
            .get()
            .catch(() => ({ data: [] }));
        return { code: 0, success: true, data: res.data.map((item) => ({
            ...item,
            id: item.id || item._id
        })) };
    }

    // ── 按ID取消收藏 ────────────────────────────
    if (action === 'removeFavoriteById') {
        const favoriteId = params.favorite_id;
        if (!favoriteId) return { code: 400, success: false, message: '缺少收藏记录ID' };
        // 先尝试按 product_id 删除（兼容前端传 product_id 的场景）
        const rows = await queryByOwnership('user_favorites', openid, user);
        const target = rows.find((item) =>
            String(item._id) === String(favoriteId) ||
            String(item.id) === String(favoriteId) ||
            String(item.product_id) === String(favoriteId)
        );
        if (target) await db.collection('user_favorites').doc(target._id).remove();
        return { code: 0, success: true };
    }

    return { code: 400, success: false, message: `未知 action: ${action}` };
};
