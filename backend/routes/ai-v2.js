/**
 * AI模块统一路由 - V2版本
 * 
 * 统一所有AI相关API，支持：
 * - 用户端智能助手
 * - 会话管理
 * - 工具调用
 */

const express = require('express');
const router = express.Router();
const EnhancedUserAssistant = require('../modules/ai/services/EnhancedUserAssistant');
const ToolRegistry = require('../modules/ai/ToolRegistry');
const { authenticate } = require('../middleware/auth');

/**
 * @route POST /api/v2/ai/chat
 * @desc 用户端AI对话
 * @access Private
 */
router.post('/chat', authenticate, async (req, res) => {
    try {
        const { message, session_id, context } = req.body;
        const userId = req.user.id;
        
        if (!message || typeof message !== 'string') {
            return res.status(400).json({
                code: 400,
                message: '消息不能为空'
            });
        }

        const result = await EnhancedUserAssistant.processMessage(
            message,
            userId,
            session_id,
            {
                ...context,
                role: req.user.role || 'user'
            }
        );

        if (result.success) {
            res.json({
                code: 200,
                data: {
                    reply: result.response,
                    session_id: result.sessionId,
                    actions: result.actions,
                    tool_used: result.toolUsed
                }
            });
        } else {
            res.status(500).json({
                code: 500,
                message: result.error || '处理失败'
            });
        }
    } catch (error) {
        console.error('[AI-V2] Chat Error:', error);
        res.status(500).json({
            code: 500,
            message: 'AI服务暂时不可用'
        });
    }
});

/**
 * @route GET /api/v2/ai/session/:sessionId/history
 * @desc 获取会话历史
 * @access Private
 */
router.get('/session/:sessionId/history', authenticate, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const history = EnhancedUserAssistant.getSessionHistory(sessionId);
        
        res.json({
            code: 200,
            data: { history }
        });
    } catch (error) {
        res.status(500).json({
            code: 500,
            message: error.message
        });
    }
});

/**
 * @route GET /api/v2/ai/tools
 * @desc 获取可用工具列表
 * @access Private
 */
router.get('/tools', authenticate, async (req, res) => {
    try {
        const { category, enabled } = req.query;
        
        const filters = {};
        if (category) filters.category = category;
        if (enabled !== undefined) filters.enabled = enabled === 'true';
        
        const tools = ToolRegistry.list(filters);
        const stats = ToolRegistry.getStats();
        
        res.json({
            code: 200,
            data: {
                tools,
                stats
            }
        });
    } catch (error) {
        res.status(500).json({
            code: 500,
            message: error.message
        });
    }
});

/**
 * @route GET /api/v2/ai/tools/categories
 * @desc 获取工具分类
 * @access Private
 */
router.get('/tools/categories', authenticate, async (req, res) => {
    try {
        const categories = ToolRegistry.getCategories();
        
        res.json({
            code: 200,
            data: { categories }
        });
    } catch (error) {
        res.status(500).json({
            code: 500,
            message: error.message
        });
    }
});

/**
 * @route POST /api/v2/ai/tools/:name/execute
 * @desc 直接执行工具（调试用）
 * @access Private (Admin only in production)
 */
router.post('/tools/:name/execute', authenticate, async (req, res) => {
    try {
        const { name } = req.params;
        const { args } = req.body;
        const userId = req.user.id;
        
        // 生产环境应该限制权限
        if (process.env.NODE_ENV === 'production' && req.user.role !== 'admin') {
            return res.status(403).json({
                code: 403,
                message: '权限不足'
            });
        }

        const result = await ToolRegistry.execute(name, args || {}, { userId });
        
        res.json({
            code: 200,
            data: result
        });
    } catch (error) {
        res.status(500).json({
            code: 500,
            message: error.message
        });
    }
});

/**
 * @route GET /api/v2/ai/quick-actions
 * @desc 获取快捷操作列表
 * @access Private
 */
router.get('/quick-actions', authenticate, async (req, res) => {
    try {
        const userRole = req.user.role || 'user';
        
        // 根据用户角色返回不同的快捷操作
        const actions = [
            {
                id: 'search_hot',
                label: '🔥 热门商品',
                message: '帮我推荐几款热销商品',
                icon: 'fire'
            },
            {
                id: 'check_orders',
                label: '📦 我的订单',
                message: '查看我的最近订单',
                icon: 'package'
            },
            {
                id: 'refund_policy',
                label: '🔄 退款政策',
                message: '退款政策是什么？',
                icon: 'refresh'
            }
        ];

        // 会员以上添加更多快捷操作
        if (['member', 'leader', 'agent'].includes(userRole)) {
            actions.push({
                id: 'check_commission',
                label: '💰 我的佣金',
                message: '查看我的佣金余额',
                icon: 'money'
            });
        }

        // 团长以上
        if (['leader', 'agent'].includes(userRole)) {
            actions.push({
                id: 'team_status',
                label: '👥 团队概况',
                message: '查看我的团队成员',
                icon: 'team'
            });
        }

        res.json({
            code: 200,
            data: { actions }
        });
    } catch (error) {
        res.status(500).json({
            code: 500,
            message: error.message
        });
    }
});

module.exports = router;
