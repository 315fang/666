const express = require('express');
const router = express.Router();
const MassMessageService = require('../../services/MassMessageService');
const { adminAuth, checkPermission } = require('../../middleware/adminAuth');
const { User } = require('../../models');
const { Op } = require('sequelize');

/**
 * 群发信息管理路由
 */

// ========== 消息管理 ==========

// 获取群发消息列表
router.get('/mass-messages', adminAuth, async (req, res) => {
    try {
        const { status, targetType, page = 1, limit = 20 } = req.query;
        
        const result = await MassMessageService.getList({
            status,
            targetType,
            limit: parseInt(limit),
            offset: (parseInt(page) - 1) * parseInt(limit)
        });

        res.json({
            code: 0,
            data: result
        });
    } catch (error) {
        console.error('[MassMessage] 获取列表失败:', error);
        res.status(500).json({
            code: 500,
            message: error.message
        });
    }
});

// 获取消息详情
router.get('/mass-messages/:id', adminAuth, async (req, res) => {
    try {
        const detail = await MassMessageService.getDetail(req.params.id);
        res.json({
            code: 0,
            data: detail
        });
    } catch (error) {
        res.status(500).json({
            code: 500,
            message: error.message
        });
    }
});

// 创建群发消息
router.post('/mass-messages', adminAuth, checkPermission('notification'), async (req, res) => {
    try {
        const {
            title,
            content,
            contentType,
            targetType,
            targetRoles,
            targetUsers,
            targetTags,
            sendType,
            scheduledAt
        } = req.body;

        // 验证必填字段
        if (!title || !content || !targetType) {
            return res.status(400).json({
                code: 400,
                message: '标题、内容和目标类型不能为空'
            });
        }

        const message = await MassMessageService.create({
            title,
            content,
            contentType: contentType || 'text',
            targetType,
            targetRoles,
            targetUsers,
            targetTags,
            sendType: sendType || 'immediate',
            scheduledAt
        }, req.user.id);

        res.json({
            code: 0,
            data: message,
            message: sendType === 'immediate' ? '消息已开始发送' : '草稿已保存'
        });
    } catch (error) {
        console.error('[MassMessage] 创建失败:', error);
        res.status(500).json({
            code: 500,
            message: error.message
        });
    }
});

// 取消发送
router.put('/mass-messages/:id/cancel', adminAuth, checkPermission('notification'), async (req, res) => {
    try {
        const result = await MassMessageService.cancel(req.params.id);
        res.json({
            code: 0,
            data: result,
            message: '已取消发送'
        });
    } catch (error) {
        res.status(400).json({
            code: 400,
            message: error.message
        });
    }
});

// 删除消息
router.delete('/mass-messages/:id', adminAuth, checkPermission('notification'), async (req, res) => {
    try {
        await MassMessageService.delete(req.params.id);
        res.json({
            code: 0,
            message: '删除成功'
        });
    } catch (error) {
        res.status(400).json({
            code: 400,
            message: error.message
        });
    }
});

// ========== 目标用户选择 ==========

// 获取可选的用户标签
router.get('/mass-messages/tags', adminAuth, async (req, res) => {
    try {
        const tags = await MassMessageService.getUserTags();
        res.json({
            code: 0,
            data: tags
        });
    } catch (error) {
        res.status(500).json({
            code: 500,
            message: error.message
        });
    }
});

// 搜索用户（用于选择特定用户）
router.get('/mass-messages/users/search', adminAuth, async (req, res) => {
    try {
        const { keyword, limit = 20 } = req.query;
        
        const where = {};
        if (keyword) {
            where[Op.or] = [
                { nickname: { [Op.like]: `%${keyword}%` } },
                { phone: { [Op.like]: `%${keyword}%` } }
            ];
        }

        const users = await User.findAll({
            where,
            attributes: ['id', 'nickname', 'avatar_url', 'phone', 'role_level'],
            limit: parseInt(limit),
            order: [['created_at', 'DESC']]
        });

        res.json({
            code: 0,
            data: users
        });
    } catch (error) {
        res.status(500).json({
            code: 500,
            message: error.message
        });
    }
});

// 预览目标用户数量
router.post('/mass-messages/preview-count', adminAuth, async (req, res) => {
    try {
        const { targetType, targetRoles, targetTags, targetUsers } = req.body;
        
        // 创建一个临时消息对象来计算数量
        const mockMessage = {
            targetType,
            targetRoles,
            targetTags,
            targetUsers
        };

        const targetUsers_list = await MassMessageService.getTargetUsers(mockMessage);

        res.json({
            code: 0,
            data: {
                count: targetUsers_list.length
            }
        });
    } catch (error) {
        res.status(500).json({
            code: 500,
            message: error.message
        });
    }
});

// ========== 统计信息 ==========

// 获取发送统计
router.get('/mass-messages/statistics', adminAuth, async (req, res) => {
    try {
        const stats = await MassMessageService.getStatistics();
        res.json({
            code: 0,
            data: stats
        });
    } catch (error) {
        res.status(500).json({
            code: 500,
            message: error.message
        });
    }
});

module.exports = router;
