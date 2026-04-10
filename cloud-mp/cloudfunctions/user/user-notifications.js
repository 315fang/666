'use strict';
const cloud = require('wx-server-sdk');
const db = cloud.database();

/**
 * 获取通知列表
 */
async function listNotifications(openid, params = {}) {
    const status = params.status; // 'unread' / 'read' / all
    let query = db.collection('notifications').where({ openid });

    if (status && status !== 'all') {
        query = query.where({ is_read: status === 'read' });
    }

    const res = await query.orderBy('created_at', 'desc').limit(50).get().catch(() => ({ data: [] }));

    // 统计未读数
    const unreadCount = await db.collection('notifications')
        .where({ openid, is_read: false })
        .count().catch(() => ({ total: 0 }));

    return {
        list: res.data || [],
        unread_count: unreadCount.total || 0,
    };
}

/**
 * 标记通知已读
 */
async function markRead(openid, notificationId) {
    const notification = await db.collection('notifications').doc(notificationId).get().catch(() => ({ data: null }));
    if (!notification.data || notification.data.openid !== openid) {
        throw new Error('通知不存在');
    }

    await db.collection('notifications').doc(notificationId).update({
        data: { is_read: true, read_at: db.serverDate() },
    });

    return { success: true };
}

/**
 * 标记全部已读
 */
async function markAllRead(openid) {
    await db.collection('notifications')
        .where({ openid, is_read: false })
        .update({ data: { is_read: true, read_at: db.serverDate() } });

    return { success: true };
}

/**
 * 发送通知（内部调用）
 */
async function sendNotification(openid, data) {
    const result = await db.collection('notifications').add({
        data: {
            openid,
            type: data.type || 'system',
            title: data.title || '',
            content: data.content || '',
            is_read: false,
            link_type: data.link_type || '',
            link_id: data.link_id || '',
            created_at: db.serverDate(),
        },
    });
    return result._id;
}

module.exports = {
    listNotifications,
    markRead,
    markAllRead,
    sendNotification,
};
