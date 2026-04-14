'use strict';
const crypto = require('crypto');
const QRCode = require('qrcode');
const cloud = require('wx-server-sdk');
const db = cloud.database();
const _ = db.command;
const { toNumber } = require('./shared/utils');
const orderCreate = require('./order-create');

const PICKUP_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function hasValue(value) {
    return value !== null && value !== undefined && value !== '';
}

function parseDate(val) {
    if (!val) return null;
    if (val instanceof Date) return val;
    if (typeof val === 'string' || typeof val === 'number') {
        const d = new Date(val);
        return Number.isFinite(d.getTime()) ? d : null;
    }
    if (typeof val === 'object') {
        if (val.$date) return parseDate(val.$date);
        if (typeof val._seconds === 'number') return new Date(val._seconds * 1000);
        if (typeof val.seconds === 'number') return new Date(val.seconds * 1000);
        if (val.toDate && typeof val.toDate === 'function') return val.toDate();
    }
    return null;
}

function refundDeadlineDate() {
    const days = Math.max(0, toNumber(process.env.REFUND_MAX_DAYS || process.env.COMMISSION_FREEZE_DAYS, 7));
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function parseConfigValue(row, fallback) {
    if (!row) return fallback;
    const value = row.config_value !== undefined ? row.config_value : row.value;
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value === 'string') {
        try { return JSON.parse(value); } catch (_) { return fallback; }
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
        .where({ config_key: key, status: _.in([true, 1, '1']) })
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));
    return legacyRes.data && legacyRes.data[0] ? legacyRes.data[0] : null;
}

async function ensurePickupSubsidyCommission(order, verifierOpenid) {
    if (!order?.pickup_station_id) return null;
    const [policyRow, station] = await Promise.all([
        getConfigByKey('branch-agent-policy'),
        (async () => {
            const branchStation = await findOneByAnyId('branch_agent_stations', order.pickup_station_id);
            if (branchStation) return branchStation;
            return findOneByAnyId('stations', order.pickup_station_id);
        })()
    ]);
    const policy = {
        enabled: false,
        pickup_station_subsidy_enabled: false,
        pickup_station_subsidy_amount: 0,
        pickup_tiers: {},
        ...parseConfigValue(policyRow, {})
    };
    if (!policy.enabled || !policy.pickup_station_subsidy_enabled || !station) return null;

    const claimantId = station.claimant_id || station.user_id || station.openid;
    const claimant = claimantId ? await findOneByAnyId('users', claimantId) : null;
    if (!claimant?.openid) return null;

    const existing = await db.collection('commissions')
        .where({
            order_id: order._id,
            openid: claimant.openid,
            type: 'pickup_subsidy'
        })
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));
    if (existing.data && existing.data[0]) return existing.data[0];

    const tierKey = String(station.pickup_commission_tier || 'A').trim() || 'A';
    const tier = policy.pickup_tiers?.[tierKey] || {};
    const payAmount = toNumber(order.actual_price ?? order.pay_amount ?? order.total_amount, 0);
    let amount = payAmount * toNumber(tier.rate, 0) + toNumber(tier.fixed_yuan, 0);
    if (amount <= 0) amount = toNumber(policy.pickup_station_subsidy_amount, 0);
    amount = Number(amount.toFixed(2));
    if (amount <= 0) return null;

    const result = await db.collection('commissions').add({
        data: {
            openid: claimant.openid,
            user_id: claimant.id || claimant._id || claimant.openid,
            from_openid: order.openid || '',
            order_id: order._id,
            order_no: order.order_no || '',
            amount,
            level: toNumber(claimant.role_level ?? claimant.distributor_level, 0),
            type: 'pickup_subsidy',
            status: 'pending_approval',
            branch_station_id: station.id || station._id || order.pickup_station_id,
            pickup_verified_by: verifierOpenid || '',
            created_at: db.serverDate(),
            updated_at: db.serverDate(),
            description: `自提核销补贴：${station.name || station.region_name || '站点'}`
        }
    });
    return { _id: result._id, amount };
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

async function getUserByOpenid(openid) {
    if (!hasValue(openid)) return null;
    const res = await db.collection('users')
        .where({ openid })
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));
    return res.data && res.data[0] ? res.data[0] : null;
}

function buildUserIdCandidates(user = {}) {
    return [user.id, user._legacy_id, user._id]
        .filter((id) => id !== null && id !== undefined && id !== '')
        .map((id) => String(id));
}

function normalizePickupCode(rawCode) {
    return String(rawCode || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function isValidPickupCode(rawCode) {
    return /^[A-Z0-9]{16}$/.test(normalizePickupCode(rawCode));
}

function generatePickupCode() {
    let code = '';
    while (code.length < 16) {
        const bytes = crypto.randomBytes(16);
        for (const byte of bytes) {
            code += PICKUP_CODE_CHARS[byte % PICKUP_CODE_CHARS.length];
            if (code.length === 16) break;
        }
    }
    return code;
}

function getPickupQrToken(order = {}) {
    return String(order.pickup_qr_token || order.qr_token || order.pickup_qr_code || '').trim();
}

function generatePickupQrToken(orderId, pickupCode) {
    return crypto
        .createHash('sha256')
        .update(`${String(orderId || '')}:${pickupCode}:${process.env.JWT_SECRET || 'pickup_salt'}`)
        .digest('hex');
}

async function ensurePickupCredentials(order) {
    if (!order || order.delivery_type !== 'pickup') return order;

    const normalizedCode = normalizePickupCode(order.pickup_code);
    const currentQrToken = getPickupQrToken(order);
    const canRefresh = order.status === 'paid' || order.status === 'pickup_pending';
    const shouldRefresh = canRefresh && (!isValidPickupCode(normalizedCode) || !currentQrToken);

    if (!shouldRefresh) {
        if (normalizedCode && normalizedCode !== order.pickup_code) {
            order.pickup_code = normalizedCode;
        }
        if (currentQrToken && !order.pickup_qr_token) {
            order.pickup_qr_token = currentQrToken;
        }
        return order;
    }

    const pickupCode = isValidPickupCode(normalizedCode) ? normalizedCode : generatePickupCode();
    const pickupQrToken = currentQrToken || generatePickupQrToken(order._id || order.id || order.order_no, pickupCode);
    const patch = {
        pickup_code: pickupCode,
        pickup_qr_token: pickupQrToken,
        status: 'pickup_pending',
        updated_at: db.serverDate(),
    };

    if (order._id) {
        await db.collection('orders').doc(order._id).update({ data: patch }).catch(() => null);
    }

    Object.assign(order, patch);
    return order;
}

function buildPickupStationSummary(stationInfo) {
    if (!stationInfo) return null;
    return {
        _id: stationInfo._id,
        id: stationInfo.id || stationInfo._legacy_id || stationInfo._id,
        name: stationInfo.name || '',
        province: stationInfo.province || '',
        city: stationInfo.city || '',
        district: stationInfo.district || '',
        address: stationInfo.address || '',
        phone: stationInfo.phone || stationInfo.contact_phone || '',
        contact_phone: stationInfo.contact_phone || stationInfo.phone || '',
        pickup_contact: stationInfo.pickup_contact || stationInfo.contact_name || '',
        business_hours: stationInfo.business_hours || '',
        business_time_start: stationInfo.business_time_start || '',
        business_time_end: stationInfo.business_time_end || ''
    };
}

async function buildPickupQrDataUrl(qrToken) {
    const normalizedToken = String(qrToken || '').trim();
    if (!normalizedToken) return '';
    try {
        return await QRCode.toDataURL(normalizedToken, {
            width: 240,
            margin: 2,
            errorCorrectionLevel: 'M'
        });
    } catch (_) {
        return '';
    }
}

async function getVerifierStationScope(openid) {
    const user = await getUserByOpenid(openid);
    const userIds = buildUserIdCandidates(user);
    const rows = await db.collection('station_staff')
        .where({ status: 'active', can_verify: 1 })
        .limit(500)
        .get()
        .catch(() => ({ data: [] }));
    const scopedRows = (rows.data || []).filter((row) => {
        if (String(row.openid || '') === String(openid)) return true;
        return userIds.includes(String(row.user_id || ''));
    });
    const stationIds = [...new Set(scopedRows.map((row) => String(row.station_id || '')).filter(Boolean))];
    return { user, userIds, stationIds };
}

async function requireVerifierStation(openid, rawStationId) {
    const stationId = hasValue(rawStationId) ? String(rawStationId) : '';
    const scope = await getVerifierStationScope(openid);
    if (!scope.stationIds.length) {
        throw new Error('当前账号没有自提核销权限');
    }
    const targetStationId = stationId || (scope.stationIds.length === 1 ? scope.stationIds[0] : '');
    if (!targetStationId) {
        throw new Error('请选择当前核销门店');
    }
    if (!scope.stationIds.includes(String(targetStationId))) {
        throw new Error('当前账号不属于该自提门店，无法查看或核销');
    }
    const station = await findOneByAnyId('stations', targetStationId);
    if (!station) {
        throw new Error('自提门店不存在');
    }
    return {
        stationId: String(targetStationId),
        station,
        scope
    };
}

async function findCouponTemplateByAnyId(rawId) {
    return findOneByAnyId('coupons', rawId);
}

function isActivityOpen(activity) {
    return activity && (
        activity.status === true
        || activity.status === 'active'
        || activity.is_active === true
        || activity.active === true
    );
}

function productSummary(product) {
    if (!product) return null;
    const images = Array.isArray(product.images) ? product.images : (product.image || product.cover ? [product.image || product.cover] : []);
    return {
        id: product.id || product._legacy_id || product._id,
        _id: product._id,
        name: product.name || product.title || '商品',
        images,
        image: images[0] || '',
        retail_price: product.retail_price || product.price || product.min_price || 0
    };
}

async function loadProductSummary(productId) {
    const product = await findOneByAnyId('products', productId);
    return productSummary(product);
}

function groupStatusForClient(status, options = {}) {
    const normalized = String(status || '').trim().toLowerCase();
    const memberCount = Math.max(0, toNumber(options.memberCount, 0));
    const minMembers = Math.max(0, toNumber(options.minMembers, 0));

    if (normalized === 'completed' || normalized === 'success') return 'success';
    if (normalized === 'cancelled') return 'cancelled';
    if (normalized === 'failed' || normalized === 'fail' || normalized === 'expired') return 'fail';
    if (minMembers > 0 && memberCount >= minMembers) return 'success';
    if (normalized === 'pending' || normalized === 'open' || !normalized) return 'open';
    return normalized;
}

function buildGroupMemberFromOrder(order = {}) {
    if (!order || !order.openid) return null;
    return {
        openid: order.openid,
        order_id: order._id || '',
        order_no: order.order_no || '',
        joined_at: order.group_joined_at || order.paid_at || order.created_at || null,
        paid_at: order.paid_at || order.pay_time || order.created_at || null
    };
}

function mergeGroupMembersWithOrders(group = {}, orders = []) {
    const paidLikeStatuses = new Set(['pending_group', 'paid', 'pickup_pending', 'agent_confirmed', 'shipping_requested', 'shipped', 'completed']);
    const merged = {};
    const seedMembers = Array.isArray(group.members) ? group.members : [];
    seedMembers.forEach((member) => {
        if (!member || !member.openid) return;
        merged[`openid:${member.openid}`] = member;
        if (member.order_id) merged[`order:${member.order_id}`] = member;
    });
    orders
        .filter((order) => paidLikeStatuses.has(order.status))
        .forEach((order) => {
            const member = buildGroupMemberFromOrder(order);
            if (!member) return;
            const key = member.order_id ? `order:${member.order_id}` : `openid:${member.openid}`;
            if (!merged[key]) merged[key] = member;
            if (!merged[`openid:${member.openid}`]) merged[`openid:${member.openid}`] = member;
        });
    return Object.values(merged).filter((member, index, list) => {
        return list.findIndex((item) => item.order_id === member.order_id || item.openid === member.openid) === index;
    });
}

function groupStatusForFallbackOrder(order = {}) {
    if (order.status === 'pending_group') return 'open';
    if (['paid', 'pickup_pending', 'agent_confirmed', 'shipping_requested', 'shipped', 'completed'].includes(order.status)) return 'success';
    if (['cancelled', 'refunding', 'refunded'].includes(order.status)) return 'fail';
    return 'open';
}

function lotteryCouponTemplateId(prize = {}) {
    const candidates = [prize.coupon_id, prize.prize_value, prize.value];
    for (const candidate of candidates) {
        if (hasValue(candidate)) return candidate;
    }
    return null;
}

// ==================== 拼团 ====================

/**
 * 加入拼团
 * @param {string} openid - 用户 openid
 * @param {object} params - { group_id, product_id, sku_id, qty, address_id }
 */
async function joinGroup(openid, params) {
    const groupActivityId = params.group_id || params.activity_id || params.id;
    if (!groupActivityId) throw new Error('缺少拼团活动 ID');

    const activity = await findOneByAnyId('group_activities', groupActivityId);
    if (!activity) throw new Error('拼团活动不存在');
    if (!isActivityOpen(activity)) throw new Error('拼团活动已结束');
    const now = new Date();
    if (activity.end_time && new Date(activity.end_time) < now) throw new Error('拼团活动已过期');

    const productId = params.product_id || activity.product_id;
    const order = await orderCreate.createOrder(openid, {
        items: [{
            product_id: productId,
            sku_id: params.sku_id || '',
            quantity: params.qty || params.quantity || 1
        }],
        address_id: params.address_id || '',
        delivery_type: params.delivery_type || 'express',
        pickup_station_id: params.pickup_station_id || '',
        memo: params.memo || '',
        type: 'group',
        group_activity_id: activity._id || String(groupActivityId),
        group_no: params.group_no || ''
    });

    return {
        success: true,
        order_id: order._id,
        id: order._id,
        order_no: order.order_no,
        group_no: params.group_no || '',
        total_amount: order.total_amount,
        pay_amount: order.pay_amount,
        need_pay: true
    };
}

/**
 * 我的拼团列表（含已支付的 group_orders 和未支付的 orders）
 */
async function myGroups(openid, params = {}) {
    const page = toNumber(params.page, 1);
    const pageSize = toNumber(params.pageSize || params.size, 50);

    const [groupRes, pendingOrdersRes, myOrdersRes] = await Promise.all([
        db.collection('group_orders')
            .where({ 'members.openid': openid })
            .orderBy('created_at', 'desc')
            .limit(pageSize)
            .get().catch(() => ({ data: [] })),
        db.collection('orders')
            .where({
                openid,
                type: 'group',
                status: 'pending_payment',
            })
            .orderBy('created_at', 'desc')
            .limit(20)
            .get().catch(() => ({ data: [] })),
        db.collection('orders')
            .where({
                openid,
                type: 'group',
            })
            .orderBy('created_at', 'desc')
            .limit(100)
            .get().catch(() => ({ data: [] }))
    ]);

    const groups = groupRes.data || [];
    const pendingOrders = (pendingOrdersRes.data || []).filter(o => !o.group_joined_at);
    const myOrders = myOrdersRes.data || [];

    const joinedGroupNos = new Set(groups.map(g => g.group_no));

    const CANCELLED_STATUSES = new Set(['cancelled', 'refunding', 'refunded']);
    const PAID_STATUSES = new Set(['paid', 'pending_group', 'pickup_pending', 'agent_confirmed', 'shipping_requested', 'shipped', 'completed']);

    function orderPriority(order) {
        if (!order) return 99;
        if (PAID_STATUSES.has(order.status)) return 0;
        if (order.status === 'pending_payment') return 1;
        if (CANCELLED_STATUSES.has(order.status)) return 2;
        return 1;
    }

    function pickBestOrder(orders = []) {
        return (orders || []).reduce((best, cur) => {
            if (!cur) return best;
            if (!best) return cur;
            const priorityDiff = orderPriority(cur) - orderPriority(best);
            if (priorityDiff !== 0) return priorityDiff < 0 ? cur : best;
            const timeDiff = new Date(cur.created_at || 0).getTime() - new Date(best.created_at || 0).getTime();
            if (timeDiff !== 0) return timeDiff > 0 ? cur : best;
            return cur;
        }, null);
    }

    const allActivityIds = new Set();
    groups.forEach(g => { if (g.activity_id) allActivityIds.add(g.activity_id); });
    pendingOrders.forEach(o => {
        const aid = o.group_activity_id || o.legacy_group_activity_id;
        if (aid) allActivityIds.add(aid);
    });

    const activityMap = {};
    await Promise.all([...allActivityIds].map(async (aid) => {
        const activity = await findOneByAnyId('group_activities', aid);
        const product = activity ? await loadProductSummary(activity.product_id) : null;
        activityMap[aid] = { activity, product };
    }));

    const relatedOrderPool = [];
    const seenRelatedOrderIds = new Set();
    function collectRelatedOrders(rows = []) {
        rows.forEach((order) => {
            if (!order || !order._id || seenRelatedOrderIds.has(order._id)) return;
            seenRelatedOrderIds.add(order._id);
            relatedOrderPool.push(order);
        });
    }

    collectRelatedOrders(myOrders);

    const relatedGroupNos = [...joinedGroupNos].filter(Boolean);
    const relatedActivityIds = [];
    groups.forEach((group) => {
        if (group.activity_id) relatedActivityIds.push(group.activity_id);
        if (group.legacy_activity_id) relatedActivityIds.push(group.legacy_activity_id);
    });

    const relatedOrderQueries = [];
    if (relatedGroupNos.length > 0) {
        relatedOrderQueries.push(
            db.collection('orders')
                .where({ group_no: _.in(relatedGroupNos) })
                .limit(100)
                .get()
                .catch(() => ({ data: [] }))
        );
    }
    const uniqueRelatedActivityIds = [...new Set(relatedActivityIds)].filter(Boolean);
    if (uniqueRelatedActivityIds.length > 0) {
        relatedOrderQueries.push(
            db.collection('orders')
                .where(_.or([
                    { group_activity_id: _.in(uniqueRelatedActivityIds) },
                    { legacy_group_activity_id: _.in(uniqueRelatedActivityIds) }
                ]))
                .limit(100)
                .get()
                .catch(() => ({ data: [] }))
        );
    }

    const relatedOrderResults = await Promise.all(relatedOrderQueries);
    relatedOrderResults.forEach((res) => collectRelatedOrders(res.data || []));

    function getRelatedOrdersForGroup(group = {}) {
        const groupActivityIds = new Set([group.activity_id, group.legacy_activity_id].filter(Boolean));
        return relatedOrderPool.filter((order) => {
            const aid = order.group_activity_id || order.legacy_group_activity_id;
            if (group.group_no && order.group_no) {
                return order.group_no === group.group_no;
            }
            return !order.group_no && aid && groupActivityIds.has(aid);
        });
    }

    const paidItems = groups.map(g => {
        const related = activityMap[g.activity_id] || {};
        const minMembers = g.group_size || related.activity?.min_members || related.activity?.group_size || 2;
        const relatedOrders = getRelatedOrdersForGroup(g);
        const myOrder = pickBestOrder(
            relatedOrders.filter((order) => order.openid === openid)
        );
        const mergedMembers = mergeGroupMembersWithOrders(g, relatedOrders);
        const memberCount = mergedMembers.length;
        const clientStatus = groupStatusForClient(g.status, { memberCount, minMembers });
        const myPaymentStatus = myOrder
            ? (myOrder.status === 'pending_payment' ? 'unpaid'
                : (CANCELLED_STATUSES.has(myOrder.status) ? 'cancelled' : 'paid'))
            : 'paid';
        return {
            _id: g._id,
            id: g._id || g.group_no,
            group_no: g.group_no,
            activity_id: g.activity_id,
            status: g.status,
            member_count: memberCount,
            group_size: g.group_size,
            is_leader: g.leader_openid === openid,
            payment_status: myPaymentStatus,
            order_id: myOrder?._id || '',
            order_no: myOrder?.order_no || '',
            pay_amount: myOrder?.pay_amount || myOrder?.total_amount || 0,
            my_order_status: myOrder?.status || '',
            groupOrder: {
                group_no: g.group_no,
                status: clientStatus,
                current_members: memberCount,
                min_members: minMembers,
                product: related.product
            },
            created_at: g.created_at,
        };
    });

    const unpaidItems = pendingOrders
        .filter(o => !joinedGroupNos.has(o.group_no))
        .map(o => {
            const aid = o.group_activity_id || o.legacy_group_activity_id;
            const related = activityMap[aid] || {};
            const product = related.product || productSummary(o.product || {});
            const firstItem = Array.isArray(o.items) ? o.items[0] : {};
            return {
                _id: o._id,
                id: o._id,
                group_no: o.group_no || '',
                activity_id: aid || '',
                order_id: o._id,
                order_no: o.order_no,
                status: 'pending_payment',
                member_count: 0,
                group_size: related.activity?.group_size || related.activity?.min_members || 2,
                is_leader: !o.group_no,
                payment_status: 'unpaid',
                pay_amount: o.pay_amount || o.total_amount || 0,
                groupOrder: {
                    group_no: o.group_no || '',
                    status: 'unpaid',
                    current_members: 0,
                    min_members: related.activity?.min_members || related.activity?.group_size || 2,
                    product: product || {
                        name: firstItem.name || firstItem.snapshot_name || o.product_name || '拼团商品',
                        images: firstItem.image ? [firstItem.image] : [],
                        image: firstItem.image || ''
                    }
                },
                created_at: o.created_at,
            };
        });

    const coveredOrderIds = new Set([...paidItems, ...unpaidItems].map((item) => String(item.order_id || '')).filter(Boolean));
    const paidFallbackItems = await Promise.all(
        myOrders
            .filter((order) => PAID_STATUSES.has(order.status) && !coveredOrderIds.has(String(order._id || '')))
            .map(async (order) => {
                const aid = order.group_activity_id || order.legacy_group_activity_id;
                const related = activityMap[aid] || {};
                const firstItem = Array.isArray(order.items) ? (order.items[0] || {}) : {};
                const product = related.product || productSummary(order.product || {}) || await loadProductSummary(order.product_id || firstItem.product_id || '');
                return {
                    _id: order._id,
                    id: order._id,
                    group_no: order.group_no || '',
                    activity_id: aid || '',
                    order_id: order._id,
                    order_no: order.order_no,
                    status: order.status,
                    member_count: 1,
                    group_size: related.activity?.group_size || related.activity?.min_members || 2,
                    is_leader: !order.group_no || !related.activity,
                    payment_status: 'paid',
                    pay_amount: order.pay_amount || order.total_amount || 0,
                    my_order_status: order.status || '',
                    groupOrder: {
                        group_no: order.group_no || '',
                        status: groupStatusForFallbackOrder(order),
                        current_members: 1,
                        min_members: related.activity?.min_members || related.activity?.group_size || 2,
                        product
                    },
                    _memberCurrent: 1,
                    _memberMin: related.activity?.min_members || related.activity?.group_size || 2,
                    _memberText: `1/${related.activity?.min_members || related.activity?.group_size || 2}人`,
                    created_at: order.created_at
                };
            })
    );

    const combined = [...unpaidItems, ...paidItems, ...paidFallbackItems]
        .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
    const total = combined.length;
    const start = (page - 1) * pageSize;

    return {
        list: combined.slice(start, start + pageSize),
        total,
        page,
        pageSize,
    };
}

/**
 * 拼团订单详情
 */
async function groupOrderDetail(openid, params) {
    const groupNo = params.group_no || params.id;
    if (!groupNo) throw new Error('缺少拼团编号');

    const groupRes = await db.collection('group_orders')
        .where({ group_no: groupNo })
        .limit(1).get().catch(() => ({ data: [] }));

    if (!groupRes.data || groupRes.data.length === 0) {
        throw new Error('拼团不存在');
    }

    const group = groupRes.data[0];

    const activityId = group.activity_id || group.legacy_activity_id || '';
    let allOrders = [];
    const seenOrderIds = new Set();
    try {
        const res1 = await db.collection('orders')
            .where({ group_no: groupNo })
            .get().catch(() => ({ data: [] }));
        (res1.data || []).forEach(o => {
            if (o && o._id && !seenOrderIds.has(o._id)) {
                seenOrderIds.add(o._id);
                allOrders.push(o);
            }
        });
    } catch (e) { console.warn('[groupOrderDetail] query by group_no failed:', e.message); }
    if (activityId) {
        try {
            const res2 = await db.collection('orders')
                .where({ group_activity_id: activityId })
                .get().catch(() => ({ data: [] }));
            (res2.data || []).forEach(o => {
                if (o && o._id && !seenOrderIds.has(o._id)) {
                    seenOrderIds.add(o._id);
                    allOrders.push(o);
                }
            });
        } catch (e) { console.warn('[groupOrderDetail] query by activity_id failed:', e.message); }
    }
    const ordersRes = { data: allOrders };

    // 查活动信息
    let activityInfo = null;
    let product = null;
    if (group.activity_id) {
        activityInfo = await findOneByAnyId('group_activities', group.activity_id || group.legacy_activity_id);
        if (activityInfo) {
            product = await loadProductSummary(activityInfo.product_id);
        }
    }
    const expireHours = toNumber(activityInfo?.expire_hours, 24);
    let expire_at = null;
    let remain_seconds = null;
    const createdDate = parseDate(group.created_at);
    if (createdDate) {
        const createdMs = createdDate.getTime();
        const expireMs = createdMs + expireHours * 3600 * 1000;
        expire_at = new Date(expireMs).toISOString();
        remain_seconds = Math.max(0, Math.floor((expireMs - Date.now()) / 1000));
    }

    // 批量拉取成员用户信息（昵称、头像）
    const mergedMembers = mergeGroupMembersWithOrders(group, ordersRes.data || []);
    const memberCount = mergedMembers.length;
    const memberOpenids = mergedMembers.map(m => m.openid).filter(Boolean);
    let memberUserMap = {};
    if (memberOpenids.length > 0) {
        const usersRes = await db.collection('users')
            .where({ openid: _.in(memberOpenids) })
            .limit(memberOpenids.length + 5)
            .get()
            .catch(() => ({ data: [] }));
        (usersRes.data || []).forEach(u => {
            memberUserMap[u.openid] = {
                openid: u.openid,
                nickName: u.nickName || u.nickname || '团队成员',
                nickname: u.nickName || u.nickname || '团队成员',
                avatarUrl: u.avatarUrl || u.avatar_url || u.avatar || ''
            };
        });
    }

    const paidLikeStatuses = new Set(['paid', 'pending_group', 'pickup_pending', 'agent_confirmed', 'shipping_requested', 'shipped', 'completed']);
    const cancelledStatuses = new Set(['cancelled', 'refunding', 'refunded']);

    function detailOrderPriority(o) {
        if (!o) return 99;
        if (paidLikeStatuses.has(o.status)) return 0;
        if (o.status === 'pending_payment') return 1;
        if (cancelledStatuses.has(o.status)) return 2;
        return 1;
    }

    const myOrders = (ordersRes.data || [])
        .filter((o) => o.openid === openid)
        .sort((a, b) => detailOrderPriority(a) - detailOrderPriority(b)
            || new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
    const exactMyOrders = myOrders.filter((order) => groupNo && order.group_no === groupNo);
    const fallbackMyOrders = exactMyOrders.length
        ? exactMyOrders
        : myOrders.filter((order) => {
            const aid = order.group_activity_id || order.legacy_group_activity_id;
            return !order.group_no && aid && [group.activity_id, group.legacy_activity_id].filter(Boolean).includes(aid);
        });
    const myOrder = (exactMyOrders.length ? exactMyOrders : (fallbackMyOrders.length ? fallbackMyOrders : myOrders))[0] || null;
    const isMember = mergedMembers.some((m) => m.openid === openid);
    const minMembers = group.group_size || activityInfo?.min_members || activityInfo?.group_size || 2;
    const clientStatus = groupStatusForClient(group.status, { memberCount, minMembers });
    const myPaymentStatus = myOrder
        ? (myOrder.status === 'pending_payment'
            ? 'unpaid'
            : (paidLikeStatuses.has(myOrder.status) ? 'paid' : (cancelledStatuses.has(myOrder.status) ? 'cancelled' : 'unknown')))
        : (isMember ? 'paid' : 'unknown');

    return {
        _id: group._id,
        activity_id: group.activity_id || '',
        group_no: group.group_no,
        status: clientStatus,
        raw_status: group.status,
        member_count: memberCount,
        current_members: memberCount,
        min_members: minMembers,
        group_size: group.group_size,
        is_leader: group.leader_openid === openid,
        is_member: isMember,
        my_payment_status: myPaymentStatus,
        my_order_id: myOrder?._id || '',
        my_order_no: myOrder?.order_no || '',
        my_order_status: myOrder?.status || '',
        my_tracking_no: myOrder?.tracking_no || '',
        my_delivery_type: myOrder?.delivery_type || '',
        my_logistics_company: myOrder?.logistics_company || myOrder?.shipping_company || '',
        expire_at,
        remain_seconds,
        members: mergedMembers.map(m => ({
            openid: m.openid,
            joined_at: m.joined_at,
            is_leader: m.openid === group.leader_openid,
            is_me: m.openid === openid,
            user: memberUserMap[m.openid] || null
        })),
        orders: (ordersRes.data || []).map(o => ({
            _id: o._id,
            order_no: o.order_no,
            openid: o.openid,
            status: o.status,
            total_amount: o.total_amount,
            pay_amount: o.pay_amount,
            created_at: o.created_at,
        })),
        activity: activityInfo ? {
            _id: activityInfo._id,
            name: activityInfo.name || '',
            group_price: activityInfo.group_price || activityInfo.price,
            original_price: activityInfo.original_price || 0,
            min_members: activityInfo.min_members || activityInfo.group_size || group.group_size || 2,
            max_members: activityInfo.max_members || activityInfo.group_size || group.group_size || 10,
            stock_limit: activityInfo.stock_limit || 0,
            sold_count: activityInfo.sold_count || 0,
            expire_hours: expireHours,
            image: activityInfo.image || (activityInfo.images || [])[0] || '',
        } : null,
        product,
        group_price: activityInfo?.group_price || activityInfo?.price || 0,
        max_members: activityInfo?.max_members || group.group_size || 10,
        created_at: group.created_at,
    };
}

// ==================== 砍价 ====================

/**
 * 发起砍价
 * @param {string} openid - 用户 openid
 * @param {object} params - { slash_id (活动ID), product_id }
 */
async function slashStart(openid, params) {
    const slashActivityId = params.slash_id || params.activity_id || params.id;
    if (!slashActivityId) throw new Error('缺少砍价活动 ID');

    // 1. 查砍价活动
    const activity = await findOneByAnyId('slash_activities', slashActivityId);
    if (!activity) throw new Error('砍价活动不存在');
    const activityId = activity._id || String(slashActivityId);

    if (!isActivityOpen(activity)) throw new Error('砍价活动已结束');

    // 2. 检查是否已发起
    const existingRes = await db.collection('slash_records')
        .where({
            openid,
            status: 'active',
            activity_id: _.in([activityId, String(slashActivityId)].filter(Boolean))
        })
        .limit(1).get().catch(() => ({ data: [] }));
    if (existingRes.data && existingRes.data.length > 0) {
        const existingRecord = existingRes.data[0];
        return {
            success: true,
            existing: true,
            slash_id: existingRecord._id,
            slash_no: existingRecord.slash_no,
            current_price: existingRecord.current_price,
            target_price: existingRecord.target_price,
            message: '已为你找到进行中的砍价，继续查看即可'
        };
    }


    // 3. 创建砍价记录
    const originalPrice = toNumber(activity.original_price || activity.price, 0);
    const targetPrice = toNumber(activity.target_price || activity.slash_price, 0);
    const maxSlash = toNumber(activity.max_slash || activity.max_cut, originalPrice - targetPrice);
    const currentPrice = originalPrice;
    const slashNo = 'SLH' + Date.now() + Math.floor(Math.random() * 1000);

    const record = {
        slash_no: slashNo,
        activity_id: activityId,
        legacy_activity_id: activity.id || activity._legacy_id || slashActivityId,
        openid,
        product_id: activity.product_id || params.product_id || '',
        original_price: originalPrice,
        target_price: targetPrice,
        current_price: currentPrice,
        total_slashed: 0,
        max_slash: maxSlash,
        slash_count: 0,
        helpers: [],
        status: 'active',
        created_at: db.serverDate(),
        updated_at: db.serverDate(),
    };

    const result = await db.collection('slash_records').add({ data: record });

    return {
        success: true,
        slash_id: result._id,
        slash_no: slashNo,
        original_price: originalPrice,
        target_price: targetPrice,
        current_price: currentPrice,
    };
}

/**
 * 帮砍一刀
 * @param {string} openid - 帮砍者 openid
 * @param {object} params - { slash_id (砍价记录ID), slash_no }
 */
async function slashHelp(openid, params) {
    const slashId = params.slash_id || params.slash_no || params.id;
    if (!slashId) throw new Error('缺少砍价记录 ID');

    // 1. 查砍价记录
    const recordRes = await db.collection('slash_records')
        .where(_.or([
            { slash_no: String(slashId) },
            { _id: String(slashId) }
        ]))
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));
    const record = recordRes.data && recordRes.data[0] ? recordRes.data[0] : null;
    if (!record) throw new Error('砍价记录不存在');

    if (record.status !== 'active') throw new Error('砍价已结束');

    // 2. 不能帮自己砍
    if (record.openid === openid) throw new Error('不能帮自己砍价');

    // 3. 检查是否已帮砍
    const helpers = record.helpers || [];
    if (helpers.some(h => h.openid === openid)) {
        throw new Error('您已帮砍过了');
    }

    // 4. 计算砍价金额（随机，但不超过剩余可砍金额）
    const remaining = record.current_price - record.target_price;
    if (remaining <= 0) throw new Error('已砍到目标价');

    const minCut = Math.max(0.01, remaining * 0.05);
    const maxCut = Math.min(remaining * 0.3, record.max_slash / (record.slash_count + 5 + 1));
    const cutAmount = Math.round((minCut + Math.random() * (maxCut - minCut)) * 100) / 100;
    const newPrice = Math.max(record.target_price, Math.round((record.current_price - cutAmount) * 100) / 100);
    const actualCut = Math.round((record.current_price - newPrice) * 100) / 100;

    // 5. 更新记录
    await db.collection('slash_records').doc(record._id).update({
        data: {
            current_price: newPrice,
            total_slashed: _.inc(actualCut),
            slash_count: _.inc(1),
            helpers: _.push({
                openid,
                cut_amount: actualCut,
                helped_at: db.serverDate(),
            }),
            status: newPrice <= record.target_price ? 'completed' : 'active',
            updated_at: db.serverDate(),
        },
    });

    return {
        success: true,
        cut_amount: actualCut,
        current_price: newPrice,
        target_price: record.target_price,
        is_completed: newPrice <= record.target_price,
    };
}

/**
 * 砍价记录详情
 */
async function slashDetail(openid, params) {
    const slashNo = params.slash_no || params.slash_id || params.id;
    if (!slashNo) throw new Error('缺少砍价编号');

    const recordRes = await db.collection('slash_records')
        .where(_.or([
            { slash_no: String(slashNo) },
            { _id: String(slashNo) }
        ]))
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));

    if (!recordRes.data || recordRes.data.length === 0) {
        throw new Error('砍价记录不存在');
    }

    const record = recordRes.data[0];
    const activity = await findOneByAnyId('slash_activities', record.activity_id || record.legacy_activity_id);
    const product = await loadProductSummary(record.product_id || activity?.product_id);
    const originalPrice = toNumber(record.original_price || activity?.original_price, 0);
    const floorPrice = toNumber(record.target_price || activity?.floor_price || activity?.target_price, 0);
    const currentPrice = toNumber(record.current_price, originalPrice);
    let status = record.status || 'active';
    if (status === 'completed') status = 'success';
    if (currentPrice <= floorPrice && floorPrice > 0) status = 'success';

    const helpers = Array.isArray(record.helpers) ? record.helpers : [];
    const maxHelpers = activity?.max_helpers;
    const helperCount = record.slash_count || helpers.length;
    const alreadyHelped = !!helpers.find((h) => h.openid === openid);
    const isOwner = record.openid === openid;
    const helperFull = maxHelpers > 0 && helperCount >= maxHelpers;

    // 批量拉取帮砍好友的用户信息（昵称、头像）
    const helperOpenids = helpers.map(h => h.openid).filter(Boolean);
    let helperUserMap = {};
    if (helperOpenids.length > 0) {
        const usersRes = await db.collection('users')
            .where({ openid: _.in(helperOpenids) })
            .limit(helperOpenids.length + 5)
            .get()
            .catch(() => ({ data: [] }));
        (usersRes.data || []).forEach(u => {
            helperUserMap[u.openid] = {
                openid: u.openid,
                nickName: u.nickName || u.nickname || '好友',
                nickname: u.nickName || u.nickname || '好友',
                avatarUrl: u.avatarUrl || u.avatar_url || u.avatar || ''
            };
        });
    }

    const enrichedHelpers = helpers.map(h => ({
        ...h,
        user: helperUserMap[h.openid] || null,
        is_me: h.openid === openid  // 标记当前登录用户自己的帮砍记录
    }));

    return {
        _id: record._id,
        id: record._id,
        slash_no: record.slash_no,
        status,
        raw_status: record.status,
        original_price: originalPrice,
        floor_price: floorPrice,
        target_price: floorPrice,
        current_price: currentPrice,
        total_slashed: record.total_slashed || Math.max(0, originalPrice - currentPrice),
        helper_count: helperCount,
        helpers: enrichedHelpers,   // 包含用户昵称头像
        is_owner: isOwner,          // 当前用户是否是砍价发起人
        already_helped: alreadyHelped, // 当前用户是否已帮砍过
        helper_full: helperFull,    // 帮砍名额是否已满
        product,
        activity: activity ? {
            _id: activity._id,
            id: activity.id || activity._legacy_id || activity._id,
            max_helpers: activity.max_helpers,
            min_slash_per_helper: activity.min_slash_per_helper,
            max_slash_per_helper: activity.max_slash_per_helper,
            stock_limit: activity.stock_limit || 0,
            sold_count: activity.sold_count || 0,
            expire_hours: activity.expire_hours || 0
        } : {},
        created_at: record.created_at,
        updated_at: record.updated_at
    };
}

/**
 * 我的砍价列表
 */
async function mySlashList(openid, params = {}) {
    const page = toNumber(params.page, 1);
    const pageSize = toNumber(params.pageSize || params.size, 20);
    const status = params.status;

    let query = db.collection('slash_records').where({ openid });
    if (status) {
        query = query.where({ status });
    }

    const [res, totalRes] = await Promise.all([
        query.orderBy('created_at', 'desc')
            .skip((page - 1) * pageSize)
            .limit(pageSize)
            .get().catch(() => ({ data: [] })),
        db.collection('slash_records').where({ openid, ...(status ? { status } : {}) })
            .count().catch(() => ({ total: 0 })),
    ]);

    const records = res.data || [];
    const activityPairs = await Promise.all(records.map(async (r) => {
        const activity = await findOneByAnyId('slash_activities', r.activity_id || r.legacy_activity_id);
        const product = activity ? await loadProductSummary(activity.product_id || r.product_id) : await loadProductSummary(r.product_id);
        return [r.slash_no, { activity, product }];
    }));
    const activityMap = activityPairs.reduce((map, [slashNo, value]) => {
        map[slashNo] = value;
        return map;
    }, {});

    return {
        list: records.map(r => {
            const related = activityMap[r.slash_no] || {};
            const activity = related.activity || {};
            return {
            _id: r._id,
            id: r._id || r.slash_no,
            slash_no: r.slash_no,
            activity_id: r.activity_id,
            product_id: r.product_id,
            original_price: r.original_price,
            target_price: r.target_price,
            floor_price: r.target_price || activity.floor_price || activity.target_price || 0,
            current_price: r.current_price,
            total_slashed: r.total_slashed,
            slash_count: r.slash_count,
            helper_count: r.slash_count || (Array.isArray(r.helpers) ? r.helpers.length : 0),
            product: related.product,
            status: r.status,
            created_at: r.created_at,
        };
        }),
        total: totalRes.total || 0,
        page,
        pageSize,
    };
}

// ==================== 抽奖 ====================

/**
 * 抽奖
 * @param {string} openid - 用户 openid
 * @param {object} params - { lottery_id }
 */
async function lotteryDraw(openid, params) {
    const lotteryId = params.lottery_id || 'default';

    // 1. 查抽奖配置
    const configRes = await db.collection('configs')
        .where(_.or([
            { type: 'lottery', active: true },
            { config_group: 'lottery' },
            { config_key: 'lottery_config' }
        ]))
        .limit(1).get().catch(() => ({ data: [] }));

    const configRow = configRes.data && configRes.data[0] ? configRes.data[0] : null;
    const config = configRow ? (configRow.config_value || configRow.value || {}) : {};

    // 2. 检查抽奖次数
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    const todayRecords = await db.collection('lottery_records')
        .where({
            openid,
            created_at: _.gte(today),
        })
        .count().catch(() => ({ total: 0 }));

    const maxDaily = toNumber(config.max_daily_draws, 3);
    if (todayRecords.total >= maxDaily) {
        throw new Error(`今日抽奖次数已用完（${maxDaily}次）`);
    }

    // 3. 查奖品池
    const prizesRes = await db.collection('lottery_prizes')
        .where(_.or([
            { is_active: true },
            { active: true },
            { status: true }
        ]))
        .orderBy('sort_order', 'asc')
        .get().catch(() => ({ data: [] }));

    const prizes = prizesRes.data || [];
    if (prizes.length === 0) throw new Error('暂无奖品');

    // 4. 按概率抽奖（加权随机）
    const totalWeight = prizes.reduce((sum, p) => sum + toNumber(p.probability || p.weight, 1), 0);
    let random = Math.random() * totalWeight;
    let selectedPrize = prizes[prizes.length - 1]; // 默认最后一个（通常是谢谢参与）

    for (const prize of prizes) {
        random -= toNumber(prize.probability || prize.weight, 1);
        if (random <= 0) {
            selectedPrize = prize;
            break;
        }
    }

    // 5. 检查库存
    if (selectedPrize.stock !== undefined && selectedPrize.stock !== null && selectedPrize.stock !== -1 && selectedPrize.stock <= 0) {
        // 库存不足，给个安慰奖
        const consolation = prizes.find(p => p.type === 'consolation' || p.is_consolation);
        selectedPrize = consolation || prizes[prizes.length - 1];
    }

    // 6. 创建抽奖记录
    const record = {
        openid,
        prize_id: selectedPrize._id,
        prize_name: selectedPrize.name || '',
        prize_type: selectedPrize.type || 'point',
        prize_value: selectedPrize.prize_value != null ? selectedPrize.prize_value : (selectedPrize.value || 0),
        lottery_id: lotteryId,
        created_at: db.serverDate(),
    };

    const result = await db.collection('lottery_records').add({ data: record });

    // 7. 发放奖品
    if (selectedPrize.type === 'point' || selectedPrize.type === 'points') {
        const points = toNumber(selectedPrize.prize_value != null ? selectedPrize.prize_value : selectedPrize.value, 0);
        if (points > 0) {
            await db.collection('users').where({ openid }).update({
                data: {
                    points: _.inc(points),
                    growth_value: _.inc(points),
                    updated_at: db.serverDate(),
                },
            });
            await db.collection('point_logs').add({
                data: {
                    openid, type: 'earn', amount: points,
                    source: 'lottery', description: `抽奖获得${points}积分`,
                    created_at: db.serverDate(),
                },
            });
        }
    } else if (selectedPrize.type === 'coupon') {
        // 发放优惠券
        const couponTemplateId = lotteryCouponTemplateId(selectedPrize);
        if (couponTemplateId) {
            const [couponTemplate, userRes] = await Promise.all([
                findCouponTemplateByAnyId(couponTemplateId),
                db.collection('users').where({ openid }).limit(1).get().catch(() => ({ data: [] }))
            ]);
            const user = userRes.data && userRes.data[0] ? userRes.data[0] : null;
            const validDays = Math.max(1, toNumber(couponTemplate?.valid_days, 30));
            await db.collection('user_coupons').add({
                data: {
                    openid,
                    user_id: user && (user.id || user._id || user._legacy_id) ? (user.id || user._id || user._legacy_id) : openid,
                    coupon_id: couponTemplate && couponTemplate.id != null ? couponTemplate.id : (couponTemplate?._id || couponTemplateId),
                    coupon_name: couponTemplate?.name || selectedPrize.name || '优惠券',
                    coupon_type: couponTemplate?.type === 'percent' ? 'percent' : (couponTemplate?.type || couponTemplate?.coupon_type || 'fixed'),
                    coupon_value: toNumber(couponTemplate?.value != null ? couponTemplate.value : couponTemplate?.coupon_value, 0),
                    min_purchase: toNumber(couponTemplate?.min_purchase, 0),
                    scope: couponTemplate?.scope || 'all',
                    scope_ids: Array.isArray(couponTemplate?.scope_ids) ? couponTemplate.scope_ids : [],
                    status: 'unused',
                    source: 'lottery',
                    source_prize_id: selectedPrize._id || selectedPrize.id || '',
                    created_at: db.serverDate(),
                    expire_at: db.serverDate({ offset: validDays * 24 * 60 * 60 * 1000 })
                },
            });
        }
    }

    // 8. 扣减库存
    if (selectedPrize.stock !== undefined && selectedPrize.stock !== null && selectedPrize.stock > 0) {
        await db.collection('lottery_prizes').doc(selectedPrize._id).update({
            data: { stock: _.inc(-1) },
        }).catch(() => {});
    }

    return {
        success: true,
        record_id: result._id,
        prize: {
            _id: selectedPrize._id,
            name: selectedPrize.name,
            type: selectedPrize.type || 'point',
            value: selectedPrize.prize_value != null ? selectedPrize.prize_value : (selectedPrize.value || 0),
            prize_value: selectedPrize.prize_value != null ? selectedPrize.prize_value : (selectedPrize.value || 0),
            image: selectedPrize.image || '',
        },
    };
}

// ==================== 自提核销 ====================

/**
 * 待核销订单列表（门店管理员查看）
 */
async function pickupPendingOrders(openid, params = {}) {
    const { stationId, station } = await requireVerifierStation(openid, params.station_id || params.pickup_station_id);
    const page = toNumber(params.page, 1);
    const pageSize = toNumber(params.pageSize || params.size, 20);

    let query = db.collection('orders').where({
        delivery_type: 'pickup',
        status: _.in(['paid', 'pickup_pending']),
    });

    query = query.where({ pickup_station_id: stationId });

    const [res, totalRes] = await Promise.all([
        query.orderBy('paid_at', 'desc')
            .skip((page - 1) * pageSize)
            .limit(pageSize)
            .get().catch(() => ({ data: [] })),
        query.count().catch(() => ({ total: 0 })),
    ]);

    const normalizedOrders = await Promise.all((res.data || []).map((order) => ensurePickupCredentials(order)));

    return {
        list: normalizedOrders.map(o => ({
            _id: o._id,
            id: o._id,
            order_no: o.order_no,
            openid: o.openid,
            items: o.items || [],
            pay_amount: o.pay_amount,
            pickup_station_id: o.pickup_station_id,
            pickup_code: normalizePickupCode(o.pickup_code),
            pickup_qr_token: getPickupQrToken(o),
            status: o.status,
            paid_at: o.paid_at,
            picked_up_at: o.picked_up_at || null,
        })),
        total: totalRes.total || 0,
        page,
        pageSize,
        station: station ? {
            id: station.id || station._legacy_id || station._id,
            name: station.name || '',
            address: station.address || '',
            phone: station.contact_phone || station.phone || ''
        } : null
    };
}

/**
 * 我的自提订单
 */
async function pickupMyOrder(openid, params) {
    const orderId = params.order_id || params.id;
    if (!orderId) throw new Error('缺少订单 ID');

    const orderRes = await db.collection('orders').doc(orderId).get().catch(() => ({ data: null }));
    if (!orderRes.data || orderRes.data.openid !== openid) {
        throw new Error('订单不存在');
    }

    const order = orderRes.data;
    if (order.delivery_type !== 'pickup') {
        throw new Error('该订单不是自提订单');
    }

    await ensurePickupCredentials(order);

    // 查自提站信息
    let stationInfo = null;
    if (order.pickup_station_id) {
        stationInfo = await findOneByAnyId('stations', order.pickup_station_id);
    }

    const pickupStation = buildPickupStationSummary(stationInfo);
    const pickupQrToken = getPickupQrToken(order);
    const pickupQrDataUrl = order.verified_at ? '' : await buildPickupQrDataUrl(pickupQrToken);

    return {
        _id: order._id,
        order_no: order.order_no,
        status: order.status,
        items: order.items || [],
        pay_amount: order.pay_amount,
        pickup_code: normalizePickupCode(order.pickup_code),
        pickup_qr_token: pickupQrToken,
        qr_token: pickupQrToken,
        pickup_qr_code: pickupQrToken,
        pickup_qr_data_url: pickupQrDataUrl,
        pickupStation,
        pickup_station: pickupStation,
        station: pickupStation,
        paid_at: order.paid_at,
        picked_up_at: order.picked_up_at || null,
        verified_at: order.verified_at || order.pickup_verified_at || order.picked_up_at || null,
    };
}

async function finalizePickupVerification(order, openid, stationId) {
    if (!order) {
        throw new Error('核销码无效');
    }

    if (String(order.pickup_station_id || '') !== String(stationId)) {
        throw new Error('当前订单不属于你所在门店');
    }

    if (order.status !== 'paid' && order.status !== 'pickup_pending') {
        throw new Error(`订单状态不允许核销: ${order.status}`);
    }

    await db.collection('orders').doc(order._id).update({
        data: {
            status: 'completed',
            picked_up_at: db.serverDate(),
            pickup_verified_by: openid,
            pickup_verified_station_id: stationId,
            updated_at: db.serverDate(),
        },
    });

    await db.collection('commissions')
        .where({ order_id: order._id, status: _.in(['pending', 'pending_approval']) })
        .update({
            data: {
                status: 'frozen',
                frozen_at: db.serverDate(),
                refund_deadline: refundDeadlineDate(),
                updated_at: db.serverDate()
            }
        })
        .catch(() => {});

    await ensurePickupSubsidyCommission(order, openid).catch(() => null);

    return {
        success: true,
        order_id: order._id,
        order_no: order.order_no,
        message: '核销成功',
    };
}

/**
 * 核销码验证（门店管理员用）
 */
async function pickupVerifyCode(openid, params) {
    const code = normalizePickupCode(params.pickup_code || params.code);
    if (!code) throw new Error('缺少核销码');
    const { stationId } = await requireVerifierStation(openid, params.station_id || params.pickup_station_id);

    // 1. 查找对应订单
    const orderRes = await db.collection('orders')
        .where({ pickup_code: code, delivery_type: 'pickup' })
        .limit(1).get().catch(() => ({ data: [] }));

    if (!orderRes.data || orderRes.data.length === 0) {
        throw new Error('核销码无效');
    }

    return finalizePickupVerification(orderRes.data[0], openid, stationId);
}

/**
 * 二维码核销（门店管理员用）
 */
async function pickupVerifyQr(openid, params) {
    const { stationId } = await requireVerifierStation(openid, params.station_id || params.pickup_station_id);
    const rawQr = String(params.qr_token || params.pickup_qr_token || params.qr_data || params.qr_code || params.pickup_code || '').trim();
    if (!rawQr) throw new Error('缺少二维码数据');

    let qrToken = rawQr;
    let pickupCode = '';
    try {
        const parsed = JSON.parse(rawQr);
        qrToken = String(parsed.pickup_qr_token || parsed.qr_token || parsed.token || rawQr).trim();
        pickupCode = normalizePickupCode(parsed.pickup_code || parsed.code || '');
    } catch (_) {
        qrToken = rawQr;
    }

    if (qrToken) {
        const orderRes = await db.collection('orders')
            .where({ pickup_qr_token: qrToken, delivery_type: 'pickup' })
            .limit(1)
            .get()
            .catch(() => ({ data: [] }));

        if (orderRes.data && orderRes.data[0]) {
            return finalizePickupVerification(orderRes.data[0], openid, stationId);
        }
    }

    if (pickupCode) {
        return pickupVerifyCode(openid, { pickup_code: pickupCode, station_id: stationId });
    }

    const qrData = rawQr;
    if (!qrData) throw new Error('缺少二维码数据');

    // 尝试从二维码数据中提取核销码
    let code = qrData;
    try {
        const parsed = JSON.parse(qrData);
        code = parsed.pickup_code || parsed.code || parsed.pickup_qr_token || parsed.qr_token || qrData;
    } catch (_) {
        // 非JSON格式，直接使用
    }

    return pickupVerifyCode(openid, { pickup_code: code, station_id: stationId });
}

module.exports = {
    joinGroup,
    myGroups,
    groupOrderDetail,
    slashStart,
    slashHelp,
    slashDetail,
    mySlashList,
    lotteryDraw,
    pickupPendingOrders,
    pickupMyOrder,
    pickupVerifyCode,
    pickupVerifyQr,
};
