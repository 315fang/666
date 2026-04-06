const express = require('express');
const router = express.Router();
const AIOpsService = require('../../services/AIOpsService');
const { adminAuth, checkPermission } = require('../../middleware/adminAuth');

/**
 * AI运维监控中心路由
 */

// ========== 仪表盘 ==========

// 获取仪表盘数据
router.get('/dashboard', adminAuth, async (req, res) => {
    try {
        const data = await AIOpsService.getDashboardData();
        res.json({
            code: 0,
            data
        });
    } catch (error) {
        console.error('[AI-Ops] 获取仪表盘失败:', error);
        res.status(500).json({
            code: 500,
            message: error.message
        });
    }
});

// ========== 告警管理 ==========

// 获取告警列表
router.get('/alerts', adminAuth, async (req, res) => {
    try {
        const { status, level, category, limit } = req.query;
        
        const alerts = await AIOpsService.getAlerts({
            status,
            level,
            category,
            limit: parseInt(limit) || 50
        });
        
        res.json({
            code: 0,
            data: alerts
        });
    } catch (error) {
        console.error('[AI-Ops] 获取告警列表失败:', error);
        res.status(500).json({
            code: 500,
            message: error.message
        });
    }
});

// 获取告警统计
router.get('/alerts/stats', adminAuth, async (req, res) => {
    try {
        const stats = await AIOpsService.getAlertStats();
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

// 获取单个告警详情
router.get('/alerts/:id', adminAuth, async (req, res) => {
    try {
        const { AIAlert } = require('../../models');
        const alert = await AIAlert.findByPk(req.params.id);
        
        if (!alert) {
            return res.status(404).json({
                code: 404,
                message: '告警不存在'
            });
        }
        
        res.json({
            code: 0,
            data: alert
        });
    } catch (error) {
        res.status(500).json({
            code: 500,
            message: error.message
        });
    }
});

// 诊断告警问题
router.post('/alerts/:id/diagnose', adminAuth, async (req, res) => {
    try {
        const result = await AIOpsService.diagnoseProblem(req.params.id);
        res.json({
            code: 0,
            data: result
        });
    } catch (error) {
        console.error('[AI-Ops] 诊断失败:', error);
        res.status(500).json({
            code: 500,
            message: error.message
        });
    }
});

// 执行修复
router.post('/alerts/:id/fix', adminAuth, checkPermission('system'), async (req, res) => {
    try {
        const { option } = req.body;
        const adminId = req.user.id;
        
        const result = await AIOpsService.executeFix(req.params.id, option, adminId);
        
        res.json({
            code: 0,
            data: result,
            message: '修复执行成功'
        });
    } catch (error) {
        console.error('[AI-Ops] 修复执行失败:', error);
        res.status(500).json({
            code: 500,
            message: error.message
        });
    }
});

// 标记告警为已解决
router.put('/alerts/:id/resolve', adminAuth, async (req, res) => {
    try {
        const { resolution } = req.body;
        const adminId = req.user.id;
        
        await AIOpsService.resolveAlert(req.params.id, adminId, resolution);
        
        res.json({
            code: 0,
            message: '告警已标记为已解决'
        });
    } catch (error) {
        res.status(500).json({
            code: 500,
            message: error.message
        });
    }
});

// 忽略告警
router.put('/alerts/:id/ignore', adminAuth, async (req, res) => {
    try {
        const { reason } = req.body;
        const adminId = req.user.id;
        
        await AIOpsService.ignoreAlert(req.params.id, adminId, reason);
        
        res.json({
            code: 0,
            message: '告警已忽略'
        });
    } catch (error) {
        res.status(500).json({
            code: 500,
            message: error.message
        });
    }
});

// ========== 监控器控制 ==========

// 获取监控器状态
router.get('/monitors', adminAuth, async (req, res) => {
    try {
        const monitors = [];
        for (const [name, monitor] of AIOpsService.monitors) {
            monitors.push({
                name,
                interval: monitor.interval,
                isRunning: !!monitor.timer,
                lastRun: monitor.lastRun
            });
        }
        
        res.json({
            code: 0,
            data: {
                isRunning: AIOpsService.isRunning,
                monitors
            }
        });
    } catch (error) {
        res.status(500).json({
            code: 500,
            message: error.message
        });
    }
});

// 启动/停止监控器
router.post('/monitors/:name/toggle', adminAuth, checkPermission('system'), async (req, res) => {
    try {
        const { name } = req.params;
        const monitor = AIOpsService.monitors.get(name);
        
        if (!monitor) {
            return res.status(404).json({
                code: 404,
                message: '监控器不存在'
            });
        }
        
        if (monitor.timer) {
            // 停止
            clearInterval(monitor.timer);
            monitor.timer = null;
            res.json({
                code: 0,
                message: '监控器已停止',
                data: { isRunning: false }
            });
        } else {
            // 启动
            AIOpsService.startMonitor(name);
            res.json({
                code: 0,
                message: '监控器已启动',
                data: { isRunning: true }
            });
        }
    } catch (error) {
        res.status(500).json({
            code: 500,
            message: error.message
        });
    }
});

// 手动触发监控器
router.post('/monitors/:name/trigger', adminAuth, checkPermission('system'), async (req, res) => {
    try {
        const { name } = req.params;
        
        // 异步执行，不等待结果
        AIOpsService.runMonitor(name);
        
        res.json({
            code: 0,
            message: '监控器已手动触发'
        });
    } catch (error) {
        res.status(500).json({
            code: 500,
            message: error.message
        });
    }
});

// ========== 修复会话 ==========

// 获取修复会话列表
router.get('/fix-sessions', adminAuth, async (req, res) => {
    try {
        const { AIFixSession, AIAlert, Admin } = require('../../models');
        
        const sessions = await AIFixSession.findAll({
            include: [
                {
                    model: AIAlert,
                    as: 'alert',
                    attributes: ['id', 'title', 'alert_code']
                },
                {
                    model: Admin,
                    as: 'executor',
                    attributes: ['id', 'username']
                }
            ],
            order: [['started_at', 'DESC']],
            limit: 50
        });
        
        res.json({
            code: 0,
            data: sessions
        });
    } catch (error) {
        res.status(500).json({
            code: 500,
            message: error.message
        });
    }
});

// 获取单个会话详情
router.get('/fix-sessions/:id', adminAuth, async (req, res) => {
    try {
        const { AIFixSession, AIAlert, Admin } = require('../../models');
        
        const session = await AIFixSession.findByPk(req.params.id, {
            include: [
                {
                    model: AIAlert,
                    as: 'alert'
                },
                {
                    model: Admin,
                    as: 'executor',
                    attributes: ['id', 'username']
                }
            ]
        });
        
        if (!session) {
            return res.status(404).json({
                code: 404,
                message: '会话不存在'
            });
        }
        
        res.json({
            code: 0,
            data: session
        });
    } catch (error) {
        res.status(500).json({
            code: 500,
            message: error.message
        });
    }
});

module.exports = router;
