'use strict';
const cloud = require('wx-server-sdk');
const db = cloud.database();
const _ = db.command;
const { toNumber } = require('./shared/utils');

// ==================== 拼团 ====================

/**
 * 加入拼团
 * @param {string} openid - 用户 openid
 * @param {object} params - { group_id, product_id, sku_id, qty, address_id }
 */
async function joinGroup(openid, params) {
    const groupActivityId = params.group_id || params.id;
    if (!groupActivityId) throw new Error('缺少拼团活动 ID');

    // 1. 查拼团活动
    const activityRes = await db.collection('group_activities').doc(groupActivityId).get().catch(() => ({ data: null }));
    if (!activityRes.data) throw new Error('拼团活动不存在');
    const activity = activityRes.data;

    if (activity.status !== 'active') throw new Error('拼团活动已结束');
    const now = new Date();
    if (activity.end_time && new Date(activity.end_time) < now) throw new Error('拼团活动已过期');

    // 2. 查找进行中的团（未满员）
    let groupNo = params.group_no || null;
    let groupOrder = null;

    if (groupNo) {
        // 加入指定团
        const groupRes = await db.collection('group_orders')
            .where({ group_no: groupNo, status: 'pending' })
            .limit(1).get().catch(() => ({ data: [] }));
        if (groupRes.data && groupRes.data.length > 0) {
            groupOrder = groupRes.data[0];
            if (groupOrder.members && groupOrder.members.length >= activity.group_size) {
                throw new Error('该团已满员');
            }
        }
    }

    // 如果没有指定团或指定团不存在，查找可加入的团
    if (!groupOrder) {
        const availableGroupRes = await db.collection('group_orders')
            .where({
                activity_id: groupActivityId,
                status: 'pending',
            })
            .limit(5).get().catch(() => ({ data: [] }));

        for (const g of (availableGroupRes.data || [])) {
            if (!g.members || g.members.length < (activity.group_size || 2)) {
                groupOrder = g;
                break;
            }
        }
    }

    // 如果没有可加入的团，开新团
    if (!groupOrder) {
        groupNo = 'GRP' + Date.now() + Math.floor(Math.random() * 1000);
        const newGroup = {
            group_no: groupNo,
            activity_id: groupActivityId,
            leader_openid: openid,
            status: 'pending',
            members: [{
                openid,
                joined_at: db.serverDate(),
            }],
            group_size: activity.group_size || 2,
            created_at: db.serverDate(),
            updated_at: db.serverDate(),
        };
        const createRes = await db.collection('group_orders').add({ data: newGroup });
        groupOrder = { _id: createRes._id, ...newGroup };
    } else {
        // 加入已有团
        groupNo = groupOrder.group_no;
        const memberExists = (groupOrder.members || []).some(m => m.openid === openid);
        if (memberExists) throw new Error('您已加入该团');

        await db.collection('group_orders').doc(groupOrder._id).update({
            data: {
                members: _.push({ openid, joined_at: db.serverDate() }),
                updated_at: db.serverDate(),
            },
        });

        // 检查是否满员
        const currentMembers = (groupOrder.members || []).length + 1;
        if (currentMembers >= (activity.group_size || 2)) {
            await db.collection('group_orders').doc(groupOrder._id).update({
                data: { status: 'completed', completed_at: db.serverDate() },
            });
        }
    }

    // 3. 创建拼团订单
    const productId = params.product_id || activity.product_id;
    const qty = toNumber(params.qty || params.quantity, 1);
    const groupPrice = toNumber(activity.group_price || activity.price, 0);
    const totalAmount = Math.round(groupPrice * qty * 100) / 100;

    const orderNo = 'GRP_ORD' + Date.now() + Math.floor(Math.random() * 1000);

    const order = {
        order_no: orderNo,
        openid,
        type: 'group',
        group_no: groupNo,
        activity_id: groupActivityId,
        product_id: productId || '',
        sku_id: params.sku_id || '',
        qty,
        unit_price: groupPrice,
        total_amount: totalAmount,
        pay_amount: totalAmount,
        address_id: params.address_id || '',
        status: 'pending_payment',
        created_at: db.serverDate(),
        updated_at: db.serverDate(),
    };

    const result = await db.collection('orders').add({ data: order });

    return {
        success: true,
        order_id: result._id,
        order_no: orderNo,
        group_no: groupNo,
        total_amount: totalAmount,
        pay_amount: totalAmount,
    };
}

/**
 * 我的拼团列表
 */
async function myGroups(openid, params = {}) {
    const page = toNumber(params.page, 1);
    const pageSize = toNumber(params.pageSize || params.size, 20);

    const res = await db.collection('group_orders')
        .where({
            'members.openid': openid,
        })
        .orderBy('created_at', 'desc')
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .get().catch(() => ({ data: [] }));

    const totalRes = await db.collection('group_orders')
        .where({ 'members.openid': openid })
        .count().catch(() => ({ total: 0 }));

    return {
        list: (res.data || []).map(g => ({
            _id: g._id,
            group_no: g.group_no,
            activity_id: g.activity_id,
            status: g.status,
            member_count: (g.members || []).length,
            group_size: g.group_size,
            is_leader: g.leader_openid === openid,
            created_at: g.created_at,
        })),
        total: totalRes.total || 0,
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

    // 查关联订单
    const ordersRes = await db.collection('orders')
        .where({ group_no: groupNo })
        .orderBy('created_at', 'asc')
        .get().catch(() => ({ data: [] }));

    // 查活动信息
    let activityInfo = null;
    if (group.activity_id) {
        const actRes = await db.collection('group_activities').doc(group.activity_id).get().catch(() => ({ data: null }));
        activityInfo = actRes.data || null;
    }

    return {
        _id: group._id,
        group_no: group.group_no,
        status: group.status,
        member_count: (group.members || []).length,
        group_size: group.group_size,
        is_leader: group.leader_openid === openid,
        members: (group.members || []).map(m => ({
            openid: m.openid,
            joined_at: m.joined_at,
            is_leader: m.openid === group.leader_openid,
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
            image: activityInfo.image || (activityInfo.images || [])[0] || '',
        } : null,
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
    const slashActivityId = params.slash_id || params.id;
    if (!slashActivityId) throw new Error('缺少砍价活动 ID');

    // 1. 查砍价活动
    const activityRes = await db.collection('slash_activities').doc(slashActivityId).get().catch(() => ({ data: null }));
    if (!activityRes.data) throw new Error('砍价活动不存在');
    const activity = activityRes.data;

    if (activity.status !== 'active') throw new Error('砍价活动已结束');

    // 2. 检查是否已发起
    const existingRes = await db.collection('slash_records')
        .where({ openid, activity_id: slashActivityId, status: 'active' })
        .limit(1).get().catch(() => ({ data: [] }));
    if (existingRes.data && existingRes.data.length > 0) {
        throw new Error('您已发起过砍价');
    }

    // 3. 创建砍价记录
    const originalPrice = toNumber(activity.original_price || activity.price, 0);
    const targetPrice = toNumber(activity.target_price || activity.slash_price, 0);
    const maxSlash = toNumber(activity.max_slash || activity.max_cut, originalPrice - targetPrice);
    const currentPrice = originalPrice;
    const slashNo = 'SLH' + Date.now() + Math.floor(Math.random() * 1000);

    const record = {
        slash_no: slashNo,
        activity_id: slashActivityId,
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
    const slashId = params.slash_id || params.id;
    if (!slashId) throw new Error('缺少砍价记录 ID');

    // 1. 查砍价记录
    const recordRes = await db.collection('slash_records').doc(slashId).get().catch(() => ({ data: null }));
    if (!recordRes.data) throw new Error('砍价记录不存在');
    const record = recordRes.data;

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
    await db.collection('slash_records').doc(slashId).update({
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

    return {
        list: (res.data || []).map(r => ({
            _id: r._id,
            slash_no: r.slash_no,
            activity_id: r.activity_id,
            product_id: r.product_id,
            original_price: r.original_price,
            target_price: r.target_price,
            current_price: r.current_price,
            total_slashed: r.total_slashed,
            slash_count: r.slash_count,
            status: r.status,
            created_at: r.created_at,
        })),
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
        .where({ type: 'lottery', active: true })
        .limit(1).get().catch(() => ({ data: [] }));

    const config = configRes.data && configRes.data[0] ? configRes.data[0].value : null;
    if (!config) throw new Error('暂无抽奖活动');

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
        .where({ active: true })
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
    if (selectedPrize.stock !== undefined && selectedPrize.stock !== null && selectedPrize.stock <= 0) {
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
        prize_value: selectedPrize.value || 0,
        lottery_id: lotteryId,
        created_at: db.serverDate(),
    };

    const result = await db.collection('lottery_records').add({ data: record });

    // 7. 发放奖品
    if (selectedPrize.type === 'point' || selectedPrize.type === 'points') {
        const points = toNumber(selectedPrize.value, 0);
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
        if (selectedPrize.coupon_id) {
            await db.collection('user_coupons').add({
                data: {
                    openid,
                    coupon_id: selectedPrize.coupon_id,
                    status: 'unused',
                    source: 'lottery',
                    created_at: db.serverDate(),
                },
            });
        }
    }

    // 8. 扣减库存
    if (selectedPrize.stock !== undefined && selectedPrize.stock !== null) {
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
            value: selectedPrize.value || 0,
            image: selectedPrize.image || '',
        },
    };
}

// ==================== 自提核销 ====================

/**
 * 待核销订单列表（门店管理员查看）
 */
async function pickupPendingOrders(openid, params = {}) {
    const stationId = params.station_id;
    const page = toNumber(params.page, 1);
    const pageSize = toNumber(params.pageSize || params.size, 20);

    let query = db.collection('orders').where({
        delivery_type: 'pickup',
        status: _.in(['paid', 'pickup_pending']),
    });

    if (stationId) {
        query = query.where({ pickup_station_id: stationId });
    }

    const [res, totalRes] = await Promise.all([
        query.orderBy('paid_at', 'desc')
            .skip((page - 1) * pageSize)
            .limit(pageSize)
            .get().catch(() => ({ data: [] })),
        query.count().catch(() => ({ total: 0 })),
    ]);

    return {
        list: (res.data || []).map(o => ({
            _id: o._id,
            order_no: o.order_no,
            openid: o.openid,
            items: o.items || [],
            pay_amount: o.pay_amount,
            pickup_station_id: o.pickup_station_id,
            pickup_code: o.pickup_code || '',
            status: o.status,
            paid_at: o.paid_at,
        })),
        total: totalRes.total || 0,
        page,
        pageSize,
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

    // 如果订单已支付但没有核销码，生成一个
    if ((order.status === 'paid' || order.status === 'pickup_pending') && !order.pickup_code) {
        const pickupCode = String(Math.floor(100000 + Math.random() * 900000));
        await db.collection('orders').doc(orderId).update({
            data: {
                pickup_code: pickupCode,
                status: 'pickup_pending',
                updated_at: db.serverDate(),
            },
        });
        order.pickup_code = pickupCode;
        order.status = 'pickup_pending';
    }

    // 查自提站信息
    let stationInfo = null;
    if (order.pickup_station_id) {
        const stationRes = await db.collection('stations').doc(order.pickup_station_id).get().catch(() => ({ data: null }));
        stationInfo = stationRes.data || null;
    }

    return {
        _id: order._id,
        order_no: order.order_no,
        status: order.status,
        items: order.items || [],
        pay_amount: order.pay_amount,
        pickup_code: order.pickup_code || '',
        pickup_qr_code: order.pickup_qr_code || '',
        station: stationInfo ? {
            _id: stationInfo._id,
            name: stationInfo.name || '',
            address: stationInfo.address || '',
            phone: stationInfo.phone || '',
            business_hours: stationInfo.business_hours || '',
        } : null,
        paid_at: order.paid_at,
        picked_up_at: order.picked_up_at || null,
    };
}

/**
 * 核销码验证（门店管理员用）
 */
async function pickupVerifyCode(openid, params) {
    const code = params.pickup_code || params.code;
    if (!code) throw new Error('缺少核销码');

    // 1. 查找对应订单
    const orderRes = await db.collection('orders')
        .where({ pickup_code: code, delivery_type: 'pickup' })
        .limit(1).get().catch(() => ({ data: [] }));

    if (!orderRes.data || orderRes.data.length === 0) {
        throw new Error('核销码无效');
    }

    const order = orderRes.data[0];

    if (order.status !== 'paid' && order.status !== 'pickup_pending') {
        throw new Error(`订单状态不允许核销: ${order.status}`);
    }

    // 2. 核销
    await db.collection('orders').doc(order._id).update({
        data: {
            status: 'completed',
            picked_up_at: db.serverDate(),
            pickup_verified_by: openid,
            updated_at: db.serverDate(),
        },
    });

    // 3. 确认收货后的佣金结算
    await db.collection('commissions')
        .where({ order_id: order._id, status: 'pending' })
        .update({ data: { status: 'settled', settled_at: db.serverDate() } })
        .catch(() => {});

    return {
        success: true,
        order_id: order._id,
        order_no: order.order_no,
        message: '核销成功',
    };
}

/**
 * 二维码核销（门店管理员用）
 */
async function pickupVerifyQr(openid, params) {
    // 二维码内容和核销码逻辑一样，只是参数来源不同
    const qrData = params.qr_data || params.qr_code || params.pickup_code;
    if (!qrData) throw new Error('缺少二维码数据');

    // 尝试从二维码数据中提取核销码
    let code = qrData;
    try {
        const parsed = JSON.parse(qrData);
        code = parsed.pickup_code || parsed.code || qrData;
    } catch (_) {
        // 非JSON格式，直接使用
    }

    return pickupVerifyCode(openid, { pickup_code: code });
}

module.exports = {
    joinGroup,
    myGroups,
    groupOrderDetail,
    slashStart,
    slashHelp,
    mySlashList,
    lotteryDraw,
    pickupPendingOrders,
    pickupMyOrder,
    pickupVerifyCode,
    pickupVerifyQr,
};
