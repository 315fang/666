// backend/controllers/lotteryController.js
/**
 * 抽奖系统控制器
 * 支持转盘/盲盒两种模式，后台切换
 */
const { LotteryPrize, LotteryRecord, sequelize } = require('../models');
const PointService = require('../services/PointService');

/**
 * GET /api/lottery/prizes
 * 获取当前奖品池（前端展示用）
 */
exports.getPrizes = async (req, res, next) => {
    try {
        const prizes = await LotteryPrize.findAll({
            where: { is_active: 1 },
            order: [['sort_order', 'ASC']],
            attributes: ['id', 'name', 'image_url', 'cost_points', 'type', 'prize_value', 'sort_order']
            // 注意：probability 不传给前端，防止作弊
        });
        res.json({ code: 0, data: prizes });
    } catch (err) {
        next(err);
    }
};

/**
 * POST /api/lottery/draw
 * 执行抽奖：扣积分 → 随机选奖 → 写记录
 */
exports.draw = async (req, res, next) => {
    const t = await sequelize.transaction();
    try {
        const userId = req.user.id;

        // 1. 获取启用奖品池
        const prizes = await LotteryPrize.findAll({
            where: { is_active: 1 },
            transaction: t
        });

        if (!prizes || prizes.length === 0) {
            await t.rollback();
            return res.json({ code: 1, message: '奖品池未配置，请联系管理员' });
        }

        const costPoints = prizes[0].cost_points; // 所有奖品消耗积分相同

        // 2. 扣除积分
        try {
            await PointService.addPoints(userId, -costPoints, 'lottery', null, '抽奖消耗', t);
        } catch (e) {
            await t.rollback();
            return res.json({ code: 1, message: e.message || '积分不足，无法抽奖' });
        }

        // 3. 概率轮盘算法
        const winner = spinWheel(prizes);

        // 4. 检查库存
        if (winner.stock !== -1) {
            if (winner.stock <= 0) {
                // 库存不足降级为"感谢参与"（安全处理）
                const missprize = prizes.find(p => p.type === 'miss') || prizes[prizes.length - 1];
                // 回滚不处理，直接降级
                const record = await LotteryRecord.create({
                    user_id: userId,
                    prize_id: missprintf.id,
                    prize_name: '感谢参与',
                    prize_type: 'miss',
                    cost_points: costPoints,
                    status: 'claimed'
                }, { transaction: t });
                await t.commit();
                return res.json({ code: 0, data: { prize: { name: '感谢参与', type: 'miss' }, record_id: record.id } });
            }
            // 扣库存  
            await winner.decrement('stock', { by: 1, transaction: t });
        }

        // 5. 写中奖记录
        const record = await LotteryRecord.create({
            user_id: userId,
            prize_id: winner.id,
            prize_name: winner.name,
            prize_type: winner.type,
            cost_points: costPoints,
            status: winner.type === 'miss' ? 'claimed' : 'pending'
        }, { transaction: t });

        // 6. 积分奖品：立即发放
        if (winner.type === 'points' && winner.prize_value > 0) {
            await PointService.addPoints(
                userId, Math.floor(winner.prize_value), 'lottery_prize',
                record.id, `抽奖获得${winner.prize_value}积分`, t
            );
            await record.update({ status: 'claimed', claimed_at: new Date() }, { transaction: t });
        }

        await t.commit();

        res.json({
            code: 0,
            data: {
                prize: {
                    id: winner.id,
                    name: winner.name,
                    type: winner.type,
                    prize_value: winner.prize_value,
                    image_url: winner.image_url
                },
                record_id: record.id
            },
            message: winner.type === 'miss' ? '感谢参与，下次再来！' : `恭喜获得：${winner.name}！`
        });
    } catch (err) {
        await t.rollback();
        next(err);
    }
};

/**
 * GET /api/lottery/records
 * 我的中奖记录
 */
exports.getRecords = async (req, res, next) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        const { count, rows } = await LotteryRecord.findAndCountAll({
            where: { user_id: req.user.id },
            order: [['created_at', 'DESC']],
            limit: parseInt(limit),
            offset
        });
        res.json({
            code: 0,
            data: {
                list: rows,
                pagination: { total: count, page: parseInt(page), limit: parseInt(limit) }
            }
        });
    } catch (err) {
        next(err);
    }
};

/**
 * 权重轮盘算法
 * 按 probability 字段进行加权随机
 */
function spinWheel(prizes) {
    const total = prizes.reduce((sum, p) => sum + parseFloat(p.probability), 0);
    let rand = Math.random() * total;
    for (const prize of prizes) {
        rand -= parseFloat(prize.probability);
        if (rand <= 0) return prize;
    }
    return prizes[prizes.length - 1];
}
