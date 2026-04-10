'use strict';
const cloud = require('wx-server-sdk');
const db = cloud.database();
const { getAllRecords } = require('./shared/utils');

/**
 * 查询用户订单（分页获取，突破 100 条限制）
 */
async function queryOrders(openid, status = null) {
    try {
        const where = { openid };
        if (status) where.status = status;
        const allOrders = await getAllRecords(db, 'orders', where);
        return allOrders.sort((a, b) => {
            const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
            const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
            return tb - ta;
        });
    } catch (err) {
        console.error('[order-query] queryOrders 失败:', err.message);
        return [];
    }
}

/**
 * 获取订单详情
 */
async function getOrderDetail(openid, orderId) {
    const order = await db.collection('orders').doc(orderId).get().catch(() => ({ data: null }));
    
    if (!order.data || order.data.openid !== openid) {
        return null;
    }

    return order.data;
}

module.exports = {
    queryOrders,
    getOrderDetail
};
