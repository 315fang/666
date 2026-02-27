/**
 * 积分控制器（用户端）
 */
const { PointLog } = require('../models');
const PointService = require('../services/PointService');

/**
 * GET /api/points/account
 * 获取我的积分账户 + 等级特权
 */
async function getAccount(req, res, next) {
    try {
        const info = await PointService.getAccountInfo(req.user.id);
        res.json({ code: 0, data: info });
    } catch (err) {
        next(err);
    }
}

/**
 * GET /api/points/logs
 * 积分流水列表（分页）
 */
async function getLogs(req, res, next) {
    try {
        const { page = 1, limit = 20 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        const { count, rows } = await PointLog.findAndCountAll({
            where: { user_id: req.user.id },
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
    } catch (err) {
        next(err);
    }
}

/**
 * POST /api/points/checkin
 * 每日签到
 */
async function checkin(req, res, next) {
    try {
        const result = await PointService.doCheckin(req.user.id);
        res.json({
            code: result.success ? 0 : 1,
            message: result.message,
            data: result.success ? {
                points_earned: result.points_earned,
                streak: result.streak,
                bonus: result.bonus,
                balance_points: result.account.balance_points,
                total_points: result.account.total_points,
                level: result.account.level
            } : null
        });
    } catch (err) {
        next(err);
    }
}

/**
 * GET /api/points/tasks
 * 今日可获得积分的任务列表及完成情况
 */
async function getTasks(req, res, next) {
    try {
        const today = new Date().toISOString().split('T')[0];
        const userId = req.user.id;

        // 查今日签到状态
        const { PointAccount } = require('../models');
        const account = await PointAccount.findOne({ where: { user_id: userId } });
        const checkedIn = account?.last_checkin === today;

        // 查今日分享记录
        const sharedToday = await PointLog.count({
            where: {
                user_id: userId,
                type: 'share',
                created_at: {
                    [require('sequelize').Op.gte]: new Date(today)
                }
            }
        });

        const tasks = [
            {
                id: 'checkin',
                title: '每日签到',
                desc: `连续签到7天额外奖励${PointService.POINT_RULES.checkin_streak.points}分`,
                points: PointService.POINT_RULES.checkin.points,
                done: checkedIn,
                streak: account?.checkin_streak || 0
            },
            {
                id: 'share',
                title: '分享商品',
                desc: '每次分享商品给好友',
                points: PointService.POINT_RULES.share.points,
                done: sharedToday >= 3,
                current: Math.min(sharedToday, 3),
                total: 3
            },
            {
                id: 'review',
                title: '写商品评价',
                desc: '图文评价额外获得20分',
                points: PointService.POINT_RULES.review.points,
                done: false  // 通过评价完成后触发
            }
        ];

        res.json({ code: 0, data: { tasks, level_config: PointService.LEVEL_CONFIG } });
    } catch (err) {
        next(err);
    }
}

/**
 * GET /api/points/levels
 * 获取等级特权说明（用于展示页面）
 */
async function getLevels(req, res, next) {
    try {
        res.json({
            code: 0,
            data: PointService.LEVEL_CONFIG.map(lv => ({
                level: lv.level,
                name: lv.name,
                min_points: lv.min,
                perks: lv.perks
            }))
        });
    } catch (err) {
        next(err);
    }
}

/**
 * GET /api/points/sign-in/status
 * 查询今日是否已签到
 */
async function getCheckinStatus(req, res, next) {
    try {
        const { PointAccount } = require('../models');
        const today = new Date().toISOString().split('T')[0];
        const account = await PointAccount.findOne({ where: { user_id: req.user.id } });
        const signed = account?.last_checkin === today;
        res.json({ code: 0, data: { signed, streak: account?.checkin_streak || 0 } });
    } catch (err) {
        next(err);
    }
}

module.exports = { getAccount, getLogs, checkin, getCheckinStatus, getTasks, getLevels };

