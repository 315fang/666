const { MassMessage, User, UserTag, UserTagRelation, Notification } = require('../models');
const { Op } = require('sequelize');
const axios = require('axios');

/**
 * 群发信息服务
 */
class MassMessageService {
    constructor() {
        this.wxAppId = process.env.WECHAT_APPID;
        this.wxSecret = process.env.WECHAT_SECRET;
        this.accessToken = null;
        this.tokenExpiry = null;
    }

    /**
     * 创建群发消息
     * @param {Object} data - 消息数据
     * @param {number} adminId - 管理员ID
     */
    async create(data, adminId) {
        const message = await MassMessage.create({
            title: data.title,
            content: data.content,
            contentType: data.contentType || 'text',
            targetType: data.targetType,
            targetRoles: data.targetRoles,
            targetUsers: data.targetUsers,
            targetTags: data.targetTags,
            sendType: data.sendType || 'immediate',
            scheduledAt: data.scheduledAt,
            createdBy: adminId,
            status: data.sendType === 'immediate' ? 'pending' : 'draft'
        });

        // 如果是立即发送，开始执行
        if (data.sendType === 'immediate' || !data.sendType) {
            this.executeSend(message.id);
        }

        return message;
    }

    /**
     * 执行群发
     * @param {number} messageId - 消息ID
     */
    async executeSend(messageId) {
        const message = await MassMessage.findByPk(messageId);
        if (!message) {
            throw new Error('消息不存在');
        }

        if (message.status !== 'pending' && message.status !== 'draft') {
            throw new Error('消息状态不正确');
        }

        // 更新状态为发送中
        await message.update({ status: 'sending', sentAt: new Date() });

        try {
            // 获取目标用户
            const targetUsers = await this.getTargetUsers(message);
            const totalCount = targetUsers.length;

            if (totalCount === 0) {
                await message.update({
                    status: 'completed',
                    totalCount: 0,
                    completedAt: new Date()
                });
                return { success: true, sentCount: 0 };
            }

            // 更新总数
            await message.update({ totalCount });

            // 批量发送（每批100人）
            const batchSize = 100;
            let sentCount = 0;
            let failCount = 0;
            const failDetails = [];

            for (let i = 0; i < targetUsers.length; i += batchSize) {
                const batch = targetUsers.slice(i, i + batchSize);
                
                for (const user of batch) {
                    try {
                        await this.sendToUser(user, message);
                        sentCount++;
                    } catch (error) {
                        failCount++;
                        failDetails.push({
                            userId: user.id,
                            error: error.message
                        });
                    }
                }

                // 更新进度
                await message.update({
                    sentCount,
                    failCount
                });

                // 每批暂停100ms，避免请求过快
                if (i + batchSize < targetUsers.length) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }

            // 更新完成状态
            await message.update({
                status: failCount === totalCount ? 'failed' : 'completed',
                sentCount,
                failCount,
                resultDetails: { failDetails },
                completedAt: new Date()
            });

            return {
                success: true,
                totalCount,
                sentCount,
                failCount
            };

        } catch (error) {
            await message.update({
                status: 'failed',
                errorMessage: error.message,
                completedAt: new Date()
            });
            throw error;
        }
    }

    /**
     * 获取目标用户列表
     */
    async getTargetUsers(message) {
        const where = {};
        const { Op } = require('sequelize');
        const { User, UserTagRelation } = require('../models');

        switch (message.targetType) {
            case 'all':
                // 所有用户（除了被禁用的）
                where.status = { [Op.ne]: 'disabled' };
                break;

            case 'role':
                // 按角色筛选
                if (message.targetRoles && message.targetRoles.length > 0) {
                    where.role_level = { [Op.in]: message.targetRoles };
                }
                break;

            case 'tag':
                // 按标签筛选
                if (message.targetTags && message.targetTags.length > 0) {
                    const userIds = await UserTagRelation.findAll({
                        where: { tag_id: { [Op.in]: message.targetTags } },
                        attributes: ['user_id'],
                        raw: true
                    });
                    where.id = { [Op.in]: userIds.map(u => u.user_id) };
                }
                break;

            case 'specific':
                // 特定用户
                if (message.targetUsers && message.targetUsers.length > 0) {
                    where.id = { [Op.in]: message.targetUsers };
                }
                break;
        }

        const users = await User.findAll({
            where,
            attributes: ['id', 'openid', 'nickname', 'role_level'],
            raw: true
        });

        return users;
    }

    /**
     * 发送消息给单个用户
     */
    async sendToUser(user, message) {
        // 方式1：写入站内通知表
        await Notification.create({
            user_id: user.id,
            type: 'system',
            title: message.title,
            content: message.content,
            is_read: false,
            created_at: new Date()
        });

        // 方式2：发送微信服务通知（如果配置了）
        if (user.openid && this.wxAppId && this.wxSecret) {
            try {
                await this.sendWechatTemplateMessage(user.openid, message);
            } catch (error) {
                console.error(`发送微信通知失败 [User ${user.id}]:`, error.message);
                // 微信发送失败不影响整体流程
            }
        }

        // 记录接收
        const { UserMassMessage } = require('../models');
        await UserMassMessage.create({
            userId: user.id,
            massMessageId: message.id,
            status: 'unread',
            receivedAt: new Date()
        });
    }

    /**
     * 发送微信模板消息
     */
    async sendWechatTemplateMessage(openid, message) {
        // 获取access_token
        const token = await this.getAccessToken();
        
        // 这里使用微信的订阅消息或统一服务消息
        // 实际实现需要根据你的微信配置调整
        const url = `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${token}`;
        
        const data = {
            touser: openid,
            template_id: process.env.WX_TEMPLATE_ID || 'your_template_id',
            page: 'pages/index/index',
            data: {
                thing1: { value: message.title },
                thing2: { value: message.content.substring(0, 20) + '...' }
            }
        };

        const response = await axios.post(url, data);
        
        if (response.data.errcode !== 0) {
            throw new Error(response.data.errmsg);
        }

        return response.data;
    }

    /**
     * 获取微信access_token
     */
    async getAccessToken() {
        // 检查token是否过期
        if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
            return this.accessToken;
        }

        const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${this.wxAppId}&secret=${this.wxSecret}`;
        const response = await axios.get(url);

        if (response.data.access_token) {
            this.accessToken = response.data.access_token;
            this.tokenExpiry = Date.now() + (response.data.expires_in - 300) * 1000; // 提前5分钟过期
            return this.accessToken;
        }

        throw new Error('获取access_token失败');
    }

    /**
     * 获取消息列表
     */
    async getList(filters = {}) {
        const where = {};

        if (filters.status) where.status = filters.status;
        if (filters.targetType) where.targetType = filters.targetType;

        const messages = await MassMessage.findAll({
            where,
            order: [['createdAt', 'DESC']],
            limit: filters.limit || 20,
            offset: filters.offset || 0
        });

        const total = await MassMessage.count({ where });

        return { list: messages, total };
    }

    /**
     * 获取消息详情
     */
    async getDetail(messageId) {
        const message = await MassMessage.findByPk(messageId);
        if (!message) {
            throw new Error('消息不存在');
        }

        // 获取阅读统计
        const { UserMassMessage } = require('../models');
        const readStats = await UserMassMessage.findAll({
            where: { massMessageId: messageId },
            attributes: ['status', [require('sequelize').fn('COUNT', '*'), 'count']],
            group: ['status'],
            raw: true
        });

        return {
            ...message.toJSON(),
            readStats
        };
    }

    /**
     * 取消发送
     */
    async cancel(messageId) {
        const message = await MassMessage.findByPk(messageId);
        
        if (!message) {
            throw new Error('消息不存在');
        }

        if (message.status !== 'draft' && message.status !== 'pending') {
            throw new Error('只能取消草稿或待发送的消息');
        }

        await message.update({ status: 'cancelled' });
        return { success: true };
    }

    /**
     * 删除消息
     */
    async delete(messageId) {
        const message = await MassMessage.findByPk(messageId);
        
        if (!message) {
            throw new Error('消息不存在');
        }

        if (message.status === 'sending') {
            throw new Error('发送中的消息不能删除');
        }

        await message.destroy();
        return { success: true };
    }

    /**
     * 获取用户标签列表
     */
    async getUserTags() {
        return await UserTag.findAll({
            order: [['createdAt', 'DESC']]
        });
    }

    /**
     * 获取发送统计
     */
    async getStatistics() {
        const stats = await MassMessage.findAll({
            attributes: [
                'status',
                [require('sequelize').fn('COUNT', '*'), 'count'],
                [require('sequelize').fn('SUM', require('sequelize').col('total_count')), 'totalUsers'],
                [require('sequelize').fn('SUM', require('sequelize').col('sent_count')), 'totalSent'],
                [require('sequelize').fn('SUM', require('sequelize').col('read_count')), 'totalRead']
            ],
            group: ['status'],
            raw: true
        });

        return stats;
    }
}

module.exports = new MassMessageService();
