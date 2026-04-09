/**
 * 后台操作日志控制器
 *
 * 记录管理员的操作行为，用于审计追溯
 */
const { Admin, AdminLog, sequelize } = require('../../../models');
const { Op } = require('sequelize');

/**
 * 记录操作日志（内部函数，供其他控制器调用）
 */
const logAction = async (adminId, adminName, action, module, targetId, targetType, content, beforeData = null, afterData = null, ip = '', userAgent = '', status = 'success', errorMessage = null) => {
    try {
        await AdminLog.create({
            admin_id: adminId,
            admin_name: adminName,
            action,
            module,
            target_id: targetId ? String(targetId) : null,
            target_type: targetType,
            content,
            before_data: beforeData ? JSON.stringify(beforeData) : null,
            after_data: afterData ? JSON.stringify(afterData) : null,
            ip,
            user_agent: userAgent,
            status,
            error_message: errorMessage
        });
    } catch (error) {
        console.error('记录操作日志失败:', error.message);
    }
};

/**
 * 创建记录日志中间件
 * 自动拦截响应，根据 code 判断成功/失败后写入 AdminLog
 */
const createLogMiddleware = (action, module, getTargetInfo) => {
    return async (req, res, next) => {
        const originalJson = res.json.bind(res);

        res.json = function (data) {
            const admin = req.admin || {};
            const targetInfo = getTargetInfo ? getTargetInfo(req, data) : {};
            const isSuccess = data && data.code === 0;
            const status = isSuccess ? 'success' : 'failed';
            const errorMessage = isSuccess ? null : (data && data.message) || null;

            logAction(
                admin.id || 0,
                admin.username || 'unknown',
                action,
                module,
                targetInfo.id || req.params?.id,
                targetInfo.type || module,
                targetInfo.content || `${action} ${module}`,
                targetInfo.before,
                targetInfo.after,
                req.ip || req.headers['x-forwarded-for'] || '',
                req.headers['user-agent'] || '',
                status,
                errorMessage
            );

            return originalJson(data);
        };

        next();
    };
};

/**
 * 获取操作日志列表
 */
const getLogs = async (req, res) => {
    try {
        const {
            admin_id,
            action,
            module,
            start_date,
            end_date,
            page = 1,
            limit = 20
        } = req.query;

        const where = {};

        if (admin_id) where.admin_id = parseInt(admin_id);
        if (action) where.action = action;
        if (module) where.module = module;
        if (start_date || end_date) {
            where.created_at = {};
            if (start_date) where.created_at[Op.gte] = new Date(start_date);
            if (end_date) where.created_at[Op.lte] = new Date(end_date + ' 23:59:59');
        }

        const offset = (parseInt(page) - 1) * parseInt(limit);

        const { count, rows } = await AdminLog.findAndCountAll({
            where,
            order: [['created_at', 'DESC']],
            offset,
            limit: parseInt(limit)
        });

        res.json({
            code: 0,
            data: {
                list: rows,
                pagination: {
                    total: count,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    totalPages: Math.ceil(count / parseInt(limit))
                }
            }
        });
    } catch (error) {
        console.error('获取操作日志失败:', error.message);
        res.status(500).json({ code: -1, message: '获取失败' });
    }
};

/**
 * 获取操作类型统计
 */
const getLogStats = async (req, res) => {
    try {
        const { days = 7 } = req.query;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - parseInt(days));

        // 按操作类型统计
        const actionStats = await AdminLog.findAll({
            where: { created_at: { [Op.gte]: startDate } },
            attributes: [
                'action',
                [sequelize.fn('COUNT', sequelize.col('id')), 'count']
            ],
            group: ['action'],
            order: [[sequelize.literal('count'), 'DESC']]
        });

        // 按模块统计
        const moduleStats = await AdminLog.findAll({
            where: { created_at: { [Op.gte]: startDate } },
            attributes: [
                'module',
                [sequelize.fn('COUNT', sequelize.col('id')), 'count']
            ],
            group: ['module'],
            order: [[sequelize.literal('count'), 'DESC']]
        });

        // 按管理员统计
        const adminStats = await AdminLog.findAll({
            where: { created_at: { [Op.gte]: startDate } },
            attributes: [
                'admin_id',
                'admin_name',
                [sequelize.fn('COUNT', sequelize.col('id')), 'count']
            ],
            group: ['admin_id', 'admin_name'],
            order: [[sequelize.literal('count'), 'DESC']],
            limit: 10
        });

        res.json({
            code: 0,
            data: {
                byAction: actionStats,
                byModule: moduleStats,
                byAdmin: adminStats
            }
        });
    } catch (error) {
        console.error('获取日志统计失败:', error.message);
        res.status(500).json({ code: -1, message: '获取失败' });
    }
};

/**
 * 导出操作日志
 */
const exportLogs = async (req, res) => {
    try {
        const { start_date, end_date } = req.query;

        if (!start_date || !end_date) {
            return res.status(400).json({ code: -1, message: '请指定日期范围' });
        }

        const logs = await AdminLog.findAll({
            where: {
                created_at: {
                    [Op.gte]: new Date(start_date),
                    [Op.lte]: new Date(end_date + ' 23:59:59')
                }
            },
            order: [['created_at', 'DESC']],
            limit: 10000  // 最多导出1万条
        });

        res.json({
            code: 0,
            data: logs,
            message: `导出 ${logs.length} 条日志`
        });
    } catch (error) {
        console.error('导出日志失败:', error.message);
        res.status(500).json({ code: -1, message: '导出失败' });
    }
};

module.exports = {
    AdminLog,
    logAction,
    createLogMiddleware,
    getLogs,
    getLogStats,
    exportLogs
};
