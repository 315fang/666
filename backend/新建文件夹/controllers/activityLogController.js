const { ActivityLog, sequelize } = require('../models');
const { Op } = require('sequelize');

/**
 * 记录活动日志的通用函数
 */
const logActivity = async (logData) => {
    try {
        await ActivityLog.create(logData);
    } catch (error) {
        console.error('记录活动日志失败:', error);
    }
};

/**
 * 获取活动日志列表
 */
const getActivityLogs = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 50,
            user_type,
            action,
            resource,
            platform,
            status,
            start_date,
            end_date,
            keyword
        } = req.query;

        const where = {};

        if (user_type) where.user_type = user_type;
        if (action) where.action = action;
        if (resource) where.resource = resource;
        if (platform) where.platform = platform;
        if (status) where.status = status;

        if (start_date && end_date) {
            where.createdAt = {
                [Op.between]: [new Date(start_date), new Date(end_date)]
            };
        }

        if (keyword) {
            where[Op.or] = [
                { username: { [Op.like]: `%${keyword}%` } },
                { description: { [Op.like]: `%${keyword}%` } },
                { resource_id: { [Op.like]: `%${keyword}%` } }
            ];
        }

        const { count, rows } = await ActivityLog.findAndCountAll({
            where,
            order: [['createdAt', 'DESC']],
            limit: parseInt(limit),
            offset: (parseInt(page) - 1) * parseInt(limit)
        });

        res.json({
            code: 0,
            data: {
                list: rows,
                total: count,
                page: parseInt(page),
                limit: parseInt(limit)
            }
        });
    } catch (error) {
        console.error('获取活动日志失败:', error);
        res.status(500).json({ code: -1, message: '获取活动日志失败' });
    }
};

/**
 * 获取日志统计
 */
const getLogStatistics = async (req, res) => {
    try {
        const { days = 7 } = req.query;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - parseInt(days));

        // 按日期统计
        const dailyStats = await ActivityLog.findAll({
            attributes: [
                [sequelize.fn('DATE', sequelize.col('createdAt')), 'date'],
                [sequelize.fn('COUNT', sequelize.col('id')), 'count']
            ],
            where: {
                createdAt: {
                    [Op.gte]: startDate
                }
            },
            group: [sequelize.fn('DATE', sequelize.col('createdAt'))],
            order: [[sequelize.fn('DATE', sequelize.col('createdAt')), 'ASC']],
            raw: true
        });

        // 按操作类型统计
        const actionStats = await ActivityLog.findAll({
            attributes: [
                'action',
                [sequelize.fn('COUNT', sequelize.col('id')), 'count']
            ],
            where: {
                createdAt: {
                    [Op.gte]: startDate
                }
            },
            group: ['action'],
            order: [[sequelize.fn('COUNT', sequelize.col('id')), 'DESC']],
            limit: 10,
            raw: true
        });

        // 按资源类型统计
        const resourceStats = await ActivityLog.findAll({
            attributes: [
                'resource',
                [sequelize.fn('COUNT', sequelize.col('id')), 'count']
            ],
            where: {
                createdAt: {
                    [Op.gte]: startDate
                }
            },
            group: ['resource'],
            order: [[sequelize.fn('COUNT', sequelize.col('id')), 'DESC']],
            limit: 10,
            raw: true
        });

        // 按平台统计
        const platformStats = await ActivityLog.findAll({
            attributes: [
                'platform',
                [sequelize.fn('COUNT', sequelize.col('id')), 'count']
            ],
            where: {
                createdAt: {
                    [Op.gte]: startDate
                }
            },
            group: ['platform'],
            raw: true
        });

        res.json({
            code: 0,
            data: {
                dailyStats,
                actionStats,
                resourceStats,
                platformStats
            }
        });
    } catch (error) {
        console.error('获取日志统计失败:', error);
        res.status(500).json({ code: -1, message: '获取日志统计失败' });
    }
};

/**
 * 清理旧日志
 */
const cleanOldLogs = async (req, res) => {
    try {
        const { days = 90 } = req.body;
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - parseInt(days));

        const result = await ActivityLog.destroy({
            where: {
                createdAt: {
                    [Op.lt]: cutoffDate
                }
            }
        });

        res.json({
            code: 0,
            message: `已清理 ${result} 条旧日志`,
            data: { deleted: result }
        });
    } catch (error) {
        console.error('清理旧日志失败:', error);
        res.status(500).json({ code: -1, message: '清理旧日志失败' });
    }
};

/**
 * 导出日志
 */
const exportLogs = async (req, res) => {
    try {
        const { start_date, end_date, format = 'json' } = req.query;

        const where = {};
        if (start_date && end_date) {
            where.createdAt = {
                [Op.between]: [new Date(start_date), new Date(end_date)]
            };
        }

        const logs = await ActivityLog.findAll({
            where,
            order: [['createdAt', 'DESC']],
            limit: 10000 // 限制导出数量
        });

        if (format === 'csv') {
            // CSV格式
            const csv = [
                'ID,用户类型,用户名,操作,资源,资源ID,描述,平台,状态,IP地址,时间'
            ];

            logs.forEach(log => {
                csv.push([
                    log.id,
                    log.user_type,
                    log.username || '',
                    log.action,
                    log.resource,
                    log.resource_id || '',
                    log.description || '',
                    log.platform,
                    log.status,
                    log.ip_address || '',
                    log.createdAt
                ].join(','));
            });

            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename=activity_logs_${Date.now()}.csv`);
            res.send('\uFEFF' + csv.join('\n')); // BOM for UTF-8
        } else {
            // JSON格式
            res.json({
                code: 0,
                data: logs
            });
        }
    } catch (error) {
        console.error('导出日志失败:', error);
        res.status(500).json({ code: -1, message: '导出日志失败' });
    }
};

module.exports = {
    logActivity,
    getActivityLogs,
    getLogStatistics,
    cleanOldLogs,
    exportLogs
};
