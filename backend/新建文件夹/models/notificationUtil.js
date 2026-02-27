const { Notification } = require('./index');

/**
 * 发送通知
 * @param {number} userId 接收用户ID
 * @param {string} title 标题
 * @param {string} content 内容
 * @param {string} type 类型: upgrade, commission, stock, system
 * @param {string} relatedId 关联ID
 */
const sendNotification = async (userId, title, content, type, relatedId = null) => {
    try {
        await Notification.create({
            user_id: userId,
            title,
            content,
            type,
            related_id: relatedId
        });
        console.log(`[通知] 已向用户 ${userId} 发送 ${type} 通知: ${title}`);
    } catch (error) {
        console.error('发送通知失败:', error);
    }
};

module.exports = {
    sendNotification
};
