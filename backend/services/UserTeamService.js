/**
 * 推荐关系子树：按 parent_id 链 BFS 收集后代（不含负责人本人）
 */
const { Op } = require('sequelize');
const { User, Order, sequelize } = require('../models');

const MAX_DEPTH = 30;
const MAX_DESCENDANTS = 50000;

/**
 * @param {number|string} leaderId
 * @param {object} [opts]
 * @param {import('sequelize').Transaction} [opts.transaction]
 * @returns {Promise<{ ok: boolean, ids?: number[], code?: string, message?: string }>}
 */
async function collectDescendantIds(leaderId, opts = {}) {
    const L = parseInt(leaderId, 10);
    if (!Number.isFinite(L) || L <= 0) {
        return { ok: false, code: 'invalid_leader', message: '无效的团队负责人 ID' };
    }

    const leader = await User.findByPk(L, { attributes: ['id'], transaction: opts.transaction });
    if (!leader) {
        return { ok: false, code: 'not_found', message: '团队负责人不存在' };
    }

    const descendants = new Set();
    let frontier = [L];
    let depth = 0;

    while (frontier.length > 0 && depth < MAX_DEPTH) {
        const children = await User.findAll({
            where: { parent_id: { [Op.in]: frontier } },
            attributes: ['id'],
            raw: true,
            transaction: opts.transaction
        });

        const next = [];
        for (const row of children) {
            const id = row.id;
            if (id === L) continue;
            if (!descendants.has(id)) {
                descendants.add(id);
                next.push(id);
                if (descendants.size > MAX_DESCENDANTS) {
                    return {
                        ok: false,
                        code: 'too_many',
                        message: `团队人数超过上限 ${MAX_DESCENDANTS}，请联系技术处理`
                    };
                }
            }
        }

        frontier = next;
        depth += 1;
    }

    if (frontier.length > 0) {
        return {
            ok: false,
            code: 'depth_exceeded',
            message: `推荐链超过 ${MAX_DEPTH} 层或数据异常，已中止；请联系技术核对 parent_id`
        };
    }

    return { ok: true, ids: Array.from(descendants) };
}

const PAID_LIKE_STATUSES = ['paid', 'agent_confirmed', 'shipping_requested', 'shipped', 'completed'];

/**
 * @param {number|string} leaderId
 * @param {object} [opts]
 * @param {'all'|'30d'} [opts.range] 订单统计时间范围：全部 / 近30天（按订单 created_at）
 */
async function getTeamSummary(leaderId, opts = {}) {
    const range = opts.range === '30d' ? '30d' : 'all';
    const collected = await collectDescendantIds(leaderId, { transaction: opts.transaction });
    if (!collected.ok) {
        return { ok: false, code: collected.code, message: collected.message };
    }

    const ids = collected.ids;
    if (ids.length === 0) {
        return {
            ok: true,
            data: {
                leader_id: parseInt(leaderId, 10),
                descendant_count: 0,
                user_total_sales_sum: 0,
                user_order_count_sum: 0,
                order_row_count: 0,
                order_actual_price_sum: 0,
                order_paid_row_count: 0,
                order_paid_actual_sum: 0,
                range
            }
        };
    }

    const userAgg = await User.findOne({
        attributes: [
            [sequelize.fn('COUNT', sequelize.col('User.id')), 'cnt'],
            [sequelize.fn('SUM', sequelize.col('total_sales')), 'sum_sales'],
            [sequelize.fn('SUM', sequelize.col('order_count')), 'sum_order_count']
        ],
        where: { id: { [Op.in]: ids } },
        raw: true,
        transaction: opts.transaction
    });

    const dateFilter =
        range === '30d'
            ? { created_at: { [Op.gte]: new Date(Date.now() - 30 * 86400000) } }
            : {};

    const baseOrderWhere = {
        buyer_id: { [Op.in]: ids },
        ...dateFilter
    };

    const [allOrders, paidOrders] = await Promise.all([
        Order.findOne({
            attributes: [
                [sequelize.fn('COUNT', sequelize.col('Order.id')), 'order_rows'],
                [sequelize.fn('SUM', sequelize.col('actual_price')), 'sum_actual']
            ],
            where: {
                ...baseOrderWhere,
                status: { [Op.notIn]: ['cancelled', 'refunded'] }
            },
            raw: true,
            transaction: opts.transaction
        }),
        Order.findOne({
            attributes: [
                [sequelize.fn('COUNT', sequelize.col('Order.id')), 'order_rows'],
                [sequelize.fn('SUM', sequelize.col('actual_price')), 'sum_actual']
            ],
            where: {
                ...baseOrderWhere,
                status: { [Op.in]: PAID_LIKE_STATUSES }
            },
            raw: true,
            transaction: opts.transaction
        })
    ]);

    const num = (v) => {
        const n = parseFloat(v);
        return Number.isFinite(n) ? n : 0;
    };
    const intn = (v) => {
        const n = parseInt(v, 10);
        return Number.isFinite(n) ? n : 0;
    };

    return {
        ok: true,
        data: {
            leader_id: parseInt(leaderId, 10),
            descendant_count: intn(userAgg?.cnt),
            user_total_sales_sum: num(userAgg?.sum_sales),
            user_order_count_sum: intn(userAgg?.sum_order_count),
            order_row_count: intn(allOrders?.order_rows),
            order_actual_price_sum: num(allOrders?.sum_actual),
            order_paid_row_count: intn(paidOrders?.order_rows),
            order_paid_actual_sum: num(paidOrders?.sum_actual),
            range
        }
    };
}

module.exports = {
    MAX_DEPTH,
    MAX_DESCENDANTS,
    collectDescendantIds,
    getTeamSummary
};
