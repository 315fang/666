'use strict';
const cloud = require('wx-server-sdk');
const db = cloud.database();

/**
 * 获取订单状态
 */
async function getOrderStatus(openid, orderId) {
    const order = await db.collection('orders').doc(orderId).get().catch(() => ({ data: null }));
    if (!order.data || order.data.openid !== openid) return null;

    return {
        order_id: order.data._id,
        order_no: order.data.order_no,
        status: order.data.status,
        pay_amount: order.data.pay_amount,
        created_at: order.data.created_at,
        paid_at: order.data.paid_at || null,
        shipped_at: order.data.shipped_at || null,
        confirmed_at: order.data.confirmed_at || null,
        cancelled_at: order.data.cancelled_at || null,
    };
}

/**
 * 更新订单状态（供其他模块调用）
 */
async function updateOrderStatus(orderId, newStatus, extraData = {}) {
    await db.collection('orders').doc(orderId).update({
        data: {
            status: newStatus,
            ...extraData,
            updated_at: db.serverDate(),
        },
    });
    return { success: true };
}

module.exports = {
    getOrderStatus,
    updateOrderStatus,
};
