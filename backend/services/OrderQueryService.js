const { Order, Product, SKU, User, Address, Review, ServiceStation, sequelize } = require('../models');
const { Op } = require('sequelize');

function parsePagination(query) {
    const parsedPage = parseInt(query.page || 1, 10);
    const parsedLimit = parseInt(query.limit || 20, 10);

    return {
        page: parsedPage,
        limit: parsedLimit,
        offset: (parsedPage - 1) * parsedLimit
    };
}

class OrderQueryService {
    static async getAgentOrders(req) {
        const userId = req.user.id;
        const { status } = req.query;
        const { page, limit, offset } = parsePagination(req.query);

        const where = { agent_id: userId };
        if (status) where.status = status;

        const { count, rows } = await Order.findAndCountAll({
            where,
            include: [
                { model: Product, as: 'product', attributes: ['id', 'name', 'images'] },
                { model: User, as: 'buyer', attributes: ['id', 'nickname'] }
            ],
            order: [['created_at', 'DESC']],
            offset,
            limit
        });

        return {
            data: {
                list: rows,
                pagination: { total: count, page, limit }
            }
        };
    }

    static async getOrders(req) {
        const userId = req.user.id;
        const { status } = req.query;
        const { page, limit, offset } = parsePagination(req.query);

        const where = {
            buyer_id: userId,
            parent_order_id: null
        };

        if (status === 'paid' || status === 'pending_ship') {
            where.status = { [Op.in]: ['paid', 'agent_confirmed', 'shipping_requested'] };
        } else if (status === 'pending_review') {
            where.status = { [Op.in]: ['shipped', 'completed'] };
            where[Op.and] = [
                {
                    [Op.or]: [
                        { remark: { [Op.is]: null } },
                        { remark: { [Op.notLike]: '%[已评价]%' } }
                    ]
                },
                sequelize.literal(
                    `NOT EXISTS (SELECT 1 FROM reviews AS r WHERE r.order_id = \`Order\`.\`id\` AND r.user_id = ${sequelize.escape(userId)})`
                )
            ];
        } else if (status) {
            where.status = status;
        }

        const { count, rows } = await Order.findAndCountAll({
            where,
            include: [
                { model: Product, as: 'product', attributes: ['id', 'name', 'images'] },
                { model: SKU, as: 'sku', attributes: ['id', 'spec_name', 'spec_value'], required: false }
            ],
            order: [['created_at', 'DESC']],
            offset,
            limit
        });

        const ids = rows.map((row) => row.id);
        let reviewedSet = new Set();
        if (ids.length) {
            const reviewedRows = await Review.findAll({
                where: { user_id: userId, order_id: { [Op.in]: ids } },
                attributes: ['order_id']
            });
            reviewedSet = new Set(reviewedRows.map((row) => row.order_id));
        }

        const list = rows.map((row) => {
            const order = row.toJSON();
            order.reviewed = reviewedSet.has(order.id)
                || (typeof order.remark === 'string' && order.remark.includes('[已评价]'));
            return order;
        });

        return {
            data: {
                list,
                pagination: { total: count, page, limit }
            }
        };
    }

    static async getOrderById(req) {
        const userId = req.user.id;
        const raw = req.params.id;
        const isNumericId = /^\d+$/.test(String(raw));
        const identityClause = isNumericId
            ? { id: parseInt(raw, 10) }
            : { order_no: String(raw) };

        const order = await Order.findOne({
            where: {
                [Op.and]: [
                    identityClause,
                    { [Op.or]: [{ buyer_id: userId }, { agent_id: userId }] }
                ]
            },
            include: [
                { model: Product, as: 'product', attributes: ['id', 'name', 'images', 'retail_price'] },
                { model: User, as: 'distributor', attributes: ['id', 'nickname'] },
                { model: Address, as: 'address', attributes: ['id', 'receiver_name', 'phone', 'province', 'city', 'district', 'detail'] },
                { model: ServiceStation, as: 'pickupStation', attributes: ['id', 'name', 'city', 'district', 'address', 'contact_phone'], required: false },
                { model: SKU, as: 'sku', attributes: ['id', 'spec_name', 'spec_value'], required: false }
            ]
        });

        if (!order) {
            const error = new Error('订单不存在');
            error.statusCode = 404;
            throw error;
        }

        let agentInfo = null;
        if (order.agent_id) {
            const agent = await User.findByPk(order.agent_id, {
                attributes: ['id', 'nickname', 'invite_code', 'member_no']
            });
            if (agent) {
                agentInfo = {
                    id: agent.id,
                    nickname: agent.nickname,
                    invite_code: agent.member_no || agent.invite_code,
                    member_code: agent.member_no || ''
                };
            }
        }

        const result = order.toJSON();
        result.address = result.address || result.address_snapshot || null;
        const reviewRow = await Review.findOne({
            where: { order_id: order.id, user_id: userId },
            attributes: ['id']
        });
        result.reviewed = !!reviewRow
            || (typeof result.remark === 'string' && result.remark.includes('[已评价]'));
        result.agent_info = agentInfo;

        const childOrders = await Order.findAll({
            where: { parent_order_id: order.id },
            include: [{ model: Product, as: 'product', attributes: ['id', 'name', 'images'] }],
            order: [['created_at', 'ASC']]
        });
        if (childOrders.length > 0) {
            result.child_orders = childOrders;
            result.is_split_order = true;
        }

        return { data: result };
    }
}

module.exports = OrderQueryService;
