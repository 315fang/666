'use strict';

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const {
    SYSTEM_REFUND_REASON,
    autoRefundGroupOrder,
} = require('./system-refund');

const ACTIVE_GROUP_STATUSES = ['pending', 'open'];
const PAID_LIKE_ORDER_STATUSES = new Set(['pending_group', 'paid', 'pickup_pending', 'agent_confirmed', 'shipping_requested', 'shipped', 'completed']);

function toNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function hasValue(value) {
    return value !== null && value !== undefined && value !== '';
}

function parseDate(value) {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value === 'string' || typeof value === 'number') {
        const parsed = new Date(value);
        return Number.isFinite(parsed.getTime()) ? parsed : null;
    }
    if (typeof value === 'object') {
        if (value.$date) return parseDate(value.$date);
        if (typeof value._seconds === 'number') return new Date(value._seconds * 1000);
        if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
        if (typeof value.toDate === 'function') return value.toDate();
    }
    return null;
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
            { _legacy_id: _.in(candidates) },
        ]))
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));
    return res.data && res.data[0] ? res.data[0] : null;
}

async function queryOrdersByIds(orderIds = []) {
    const ids = [...new Set(orderIds.filter(hasValue).map((value) => String(value)))];
    if (!ids.length) return [];
    const res = await db.collection('orders')
        .where({ _id: _.in(ids) })
        .limit(Math.max(ids.length, 1))
        .get()
        .catch(() => ({ data: [] }));
    return res.data || [];
}

function buildGroupRefs(group = {}) {
    const orderIds = new Set();
    const orderNos = new Set();
    const members = Array.isArray(group.members) ? group.members : [];
    members.forEach((member) => {
        if (hasValue(member?.order_id)) orderIds.add(String(member.order_id));
        if (hasValue(member?.order_no)) orderNos.add(String(member.order_no));
    });
    return {
        groupNo: hasValue(group.group_no) ? String(group.group_no) : '',
        orderIds,
        orderNos,
    };
}

function orderBelongsToGroup(order = {}, refs = {}) {
    if (!order) return false;
    const groupNo = hasValue(order.group_no) ? String(order.group_no) : '';
    if (refs.groupNo && groupNo && refs.groupNo === groupNo) return true;

    const orderId = hasValue(order._id || order.id) ? String(order._id || order.id) : '';
    if (orderId && refs.orderIds.has(orderId)) return true;

    const orderNo = hasValue(order.order_no) ? String(order.order_no) : '';
    if (orderNo && refs.orderNos.has(orderNo)) return true;

    return false;
}

function buildMemberFromOrder(order = {}) {
    if (!order || !order.openid) return null;
    return {
        openid: order.openid,
        order_id: order._id || '',
        order_no: order.order_no || '',
    };
}

function mergeEffectiveMembers(group = {}, orders = []) {
    const byOpenid = new Map();
    const byOrderId = new Map();
    const byOrderNo = new Map();
    const orderById = new Map();
    const orderByNo = new Map();

    orders.forEach((order) => {
        if (!order) return;
        if (hasValue(order._id)) orderById.set(String(order._id), order);
        if (hasValue(order.order_no)) orderByNo.set(String(order.order_no), order);
    });

    function upsertMember(member) {
        if (!member || !member.openid) return;
        const openid = String(member.openid);
        const orderId = hasValue(member.order_id) ? String(member.order_id) : '';
        const orderNo = hasValue(member.order_no) ? String(member.order_no) : '';
        const existing = byOpenid.get(openid)
            || (orderId ? byOrderId.get(orderId) : null)
            || (orderNo ? byOrderNo.get(orderNo) : null)
            || null;
        const merged = existing ? {
            ...existing,
            ...member,
            openid,
            order_id: existing.order_id || orderId,
            order_no: existing.order_no || orderNo,
        } : {
            ...member,
            openid,
            order_id: orderId,
            order_no: orderNo,
        };
        byOpenid.set(openid, merged);
        if (merged.order_id) byOrderId.set(merged.order_id, merged);
        if (merged.order_no) byOrderNo.set(merged.order_no, merged);
    }

    const seedMembers = Array.isArray(group.members) ? group.members : [];
    seedMembers.forEach((member) => {
        if (!member || !member.openid) return;
        const linkedOrder = (hasValue(member.order_id) && orderById.get(String(member.order_id)))
            || (hasValue(member.order_no) && orderByNo.get(String(member.order_no)))
            || null;
        if (linkedOrder && !PAID_LIKE_ORDER_STATUSES.has(linkedOrder.status)) return;
        upsertMember(member);
    });

    orders.filter((order) => PAID_LIKE_ORDER_STATUSES.has(order.status)).forEach((order) => {
        const member = buildMemberFromOrder(order);
        if (member) upsertMember(member);
    });

    return Array.from(byOpenid.values());
}

async function loadGroupOrders(group = {}) {
    const refs = buildGroupRefs(group);
    const collected = [];
    const seen = new Set();
    const pushRows = (rows = []) => {
        rows.forEach((order) => {
            if (!order || !order._id || seen.has(String(order._id))) return;
            seen.add(String(order._id));
            collected.push(order);
        });
    };

    if (refs.groupNo) {
        const byGroupNo = await db.collection('orders')
            .where({ group_no: refs.groupNo })
            .limit(100)
            .get()
            .catch(() => ({ data: [] }));
        pushRows(byGroupNo.data || []);
    }

    const byIds = await queryOrdersByIds([...refs.orderIds]);
    pushRows(byIds);

    return collected.filter((order) => orderBelongsToGroup(order, refs));
}

function resolveGroupExpiry(group = {}, activity = null, memberCount = 0) {
    const minMembers = Math.max(2, toNumber(group.group_size || activity?.min_members || activity?.group_size, 2));
    const expireHours = Math.max(1, toNumber(activity?.expire_hours, 24));
    const createdDate = parseDate(group.created_at);
    if (!createdDate) {
        return {
            minMembers,
            memberCount,
            expireHours,
            expireAt: null,
            expired: false,
            shouldExpire: false,
        };
    }

    const expireAt = new Date(createdDate.getTime() + expireHours * 3600 * 1000);
    const expired = expireAt.getTime() <= Date.now();
    return {
        minMembers,
        memberCount,
        expireHours,
        expireAt,
        expired,
        shouldExpire: expired && memberCount < minMembers,
    };
}

async function processExpiredGroups(limit = 100) {
    const res = await db.collection('group_orders')
        .where({ status: _.in(ACTIVE_GROUP_STATUSES) })
        .orderBy('created_at', 'asc')
        .limit(limit)
        .get()
        .catch(() => ({ data: [] }));

    const groups = res.data || [];
    if (!groups.length) {
        return { expiredGroups: 0, refundedOrders: 0, errors: [] };
    }

    let expiredGroups = 0;
    let refundedOrders = 0;
    const errors = [];
    const activityCache = new Map();

    for (const group of groups) {
        try {
            const activityKey = String(group.activity_id || group.legacy_activity_id || '');
            let activity = activityCache.get(activityKey) || null;
            if (!activity && activityKey) {
                activity = await findOneByAnyId('group_activities', activityKey);
                activityCache.set(activityKey, activity || null);
            }

            const relatedOrders = await loadGroupOrders(group);
            const members = mergeEffectiveMembers(group, relatedOrders);
            const expiry = resolveGroupExpiry(group, activity, members.length);
            if (!expiry.shouldExpire) continue;

            const updateRes = await db.collection('group_orders')
                .where({ _id: String(group._id), status: _.in(ACTIVE_GROUP_STATUSES) })
                .update({
                    data: {
                        status: 'expired',
                        expired_at: db.serverDate(),
                        updated_at: db.serverDate(),
                    }
                });

            if (!updateRes.stats || updateRes.stats.updated === 0) {
                continue;
            }

            expiredGroups += 1;

            for (const order of relatedOrders) {
                if (!order || order.status !== 'pending_group') continue;
                const result = await autoRefundGroupOrder(order, {
                    reason: SYSTEM_REFUND_REASON,
                    description: `拼团 ${group.group_no || ''} 超时未成团，系统自动退款`,
                    groupNo: group.group_no || '',
                    groupActivityId: group.activity_id || group.legacy_activity_id || '',
                });
                if (!result.skipped && !result.error) {
                    refundedOrders += 1;
                }
                if (result.error) {
                    errors.push({ group_no: group.group_no || '', order_id: order._id, error: result.error });
                }
            }
        } catch (error) {
            errors.push({ group_no: group.group_no || '', error: error.message });
        }
    }

    return { expiredGroups, refundedOrders, errors };
}

module.exports = {
    processExpiredGroups,
};
