const { Refund, Order, User, Product, SKU, CommissionLog, sequelize } = require('../../../models');
const { Op } = require('sequelize');
const { sendNotification } = require('../../../models/notificationUtil');

// 获取售后列表
const getRefunds = async (req, res) => {
    try {
        const { status, type, page = 1, limit = 20 } = req.query;
        const where = {};

        if (status) where.status = status;
        if (type) where.type = type;

        const offset = (parseInt(page) - 1) * parseInt(limit);

        const { count, rows } = await Refund.findAndCountAll({
            where,
            include: [
                { model: User, as: 'user', attributes: ['id', 'nickname'] },
                {
                    model: Order,
                    as: 'order',
                    attributes: ['id', 'order_no', 'total_amount'],
                    include: [{ model: Product, as: 'product', attributes: ['id', 'name', 'images'] }]
                }
            ],
            order: [['created_at', 'DESC']],
            offset,
            limit: parseInt(limit)
        });

        res.json({
            code: 0,
            data: {
                list: rows,
                pagination: { total: count, page: parseInt(page), limit: parseInt(limit) }
            }
        });
    } catch (error) {
        console.error('获取售后列表失败:', error);
        res.status(500).json({ code: -1, message: '获取失败' });
    }
};

// 获取售后详情
const getRefundById = async (req, res) => {
    try {
        const { id } = req.params;
        const refund = await Refund.findByPk(id, {
            include: [
                { model: User, as: 'user' },
                { model: Order, as: 'order', include: [{ model: Product, as: 'product' }] }
            ]
        });

        if (!refund) {
            return res.status(404).json({ code: -1, message: '售后单不存在' });
        }

        res.json({ code: 0, data: refund });
    } catch (error) {
        console.error('获取售后详情失败:', error);
        res.status(500).json({ code: -1, message: '获取失败' });
    }
};

// 审核通过
const approveRefund = async (req, res) => {
    try {
        const { id } = req.params;
        const { remark } = req.body;
        const adminId = req.admin.id;

        const refund = await Refund.findByPk(id);
        if (!refund) {
            return res.status(404).json({ code: -1, message: '售后单不存在' });
        }

        if (refund.status !== 'pending') {
            return res.status(400).json({ code: -1, message: '状态不正确' });
        }

        refund.status = 'approved';
        refund.admin_id = adminId;
        refund.admin_remark = remark;
        refund.processed_at = new Date();
        await refund.save();

        // 通知用户
        await sendNotification(
            refund.user_id,
            '退款审核通过',
            `您的退款申请 ¥${parseFloat(refund.amount).toFixed(2)} 已审核通过${refund.type === 'return_refund' ? '，请尽快寄回商品' : '，即将为您退款'}。`,
            'refund',
            String(refund.id)
        );

        res.json({ code: 0, message: '审核通过' });
    } catch (error) {
        console.error('审核失败:', error);
        res.status(500).json({ code: -1, message: '审核失败' });
    }
};

// 拒绝售后
const rejectRefund = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        const adminId = req.admin.id;

        const refund = await Refund.findByPk(id);
        if (!refund) {
            return res.status(404).json({ code: -1, message: '售后单不存在' });
        }

        if (refund.status !== 'pending') {
            return res.status(400).json({ code: -1, message: '状态不正确' });
        }

        refund.status = 'rejected';
        refund.admin_id = adminId;
        refund.reject_reason = reason;
        refund.processed_at = new Date();
        await refund.save();

        // 通知用户
        await sendNotification(
            refund.user_id,
            '退款申请被拒绝',
            `您的退款申请 ¥${parseFloat(refund.amount).toFixed(2)} 已被拒绝${reason ? '，原因: ' + reason : ''}。`,
            'refund',
            String(refund.id)
        );

        res.json({ code: 0, message: '已拒绝' });
    } catch (error) {
        console.error('拒绝失败:', error);
        res.status(500).json({ code: -1, message: '操作失败' });
    }
};

// 完成退款（★ 使用事务保证佣金扣回与退款状态的数据一致性）
const completeRefund = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { id } = req.params;

        const refund = await Refund.findByPk(id, {
            include: [{ model: Order, as: 'order' }],
            transaction: t,
            lock: t.LOCK.UPDATE
        });

        if (!refund) {
            await t.rollback();
            return res.status(404).json({ code: -1, message: '售后单不存在' });
        }

        if (refund.status !== 'approved') {
            await t.rollback();
            return res.status(400).json({ code: -1, message: '请先审核通过' });
        }

        // 更新订单状态
        const order = refund.order;
        // ★ 判断是否全额退款（退款金额 = 订单总额），全额退才改订单状态为 refunded
        const isFullRefund = parseFloat(refund.amount) >= parseFloat(order.total_amount);
        if (isFullRefund) {
            await Order.update(
                { status: 'refunded' },
                { where: { id: refund.order_id }, transaction: t }
            );
            // ★ 重新加载订单状态（后续逻辑需要用到最新状态判断）
            await order.reload({ transaction: t });
        }

        // ★★★ 修复漏洞: 库存恢复逻辑 ★★★
        // 规则 1: 仅退款 (refund_only) → 不退货 → 不恢复平台物理库存
        // 规则 2: 退货退款 (return_refund) → 按 refund_quantity 恢复平台物理库存
        // 规则 3: 代理商云库存恢复 → 看代理商是否实际扣过库存（已发货 或 已预扣）
        // 规则 4: 全额退款时，即使是仅退款，也要退还代理商已扣的云库存（代理商不应承担损失）
        if (order) {
            const shouldRestoreProductStock = refund.type === 'return_refund' && (refund.refund_quantity || 0) > 0;
            const restoreProductQty = shouldRestoreProductStock ? refund.refund_quantity : 0;

            // 恢复平台商品物理库存（仅退货退款场景）
            if (restoreProductQty > 0) {
                const product = await Product.findByPk(order.product_id, { transaction: t, lock: t.LOCK.UPDATE });
                if (product) {
                    await product.increment('stock', { by: restoreProductQty, transaction: t });
                }
                if (order.sku_id) {
                    const sku = await SKU.findByPk(order.sku_id, { transaction: t, lock: t.LOCK.UPDATE });
                    if (sku) {
                        await sku.increment('stock', { by: restoreProductQty, transaction: t });
                    }
                }
            }

            // ★★★ 代理商云库存恢复（核心修复）★★★
            // 判断代理商是否实际扣过库存：
            // 1. 已发货(shipped/completed) → shipped_at 存在，说明 shipOrder 扣过
            // 2. shipping_requested + 标记了[库存已预扣] → requestShipping 预扣过
            const agentDeductedStock = (
                order.fulfillment_type === 'Agent' &&
                order.fulfillment_partner_id &&
                (
                    order.shipped_at || // 已发货，shipOrder 扣过
                    (order.status === 'shipping_requested' && order.remark && order.remark.includes('[库存已预扣]')) // 预扣过
                )
            );

            if (agentDeductedStock && isFullRefund) {
                // ★★★ 修复：全额退款时，仅"退货退款"才退还代理商云库存
                // "仅退款"意味着货已发出且不退回，退还库存会导致云库存虚高
                if (refund.type === 'return_refund') {
                    const agent = await User.findByPk(order.fulfillment_partner_id, { transaction: t, lock: t.LOCK.UPDATE });
                    if (agent) {
                        await agent.increment('stock_count', { by: order.quantity, transaction: t });
                        console.log(`[退款] 代理商(ID:${agent.id})云库存退还 ${order.quantity} 件（全额退货退款）`);
                    }
                } else {
                    // 仅退款（不退货）：不退还代理商云库存，但记录日志
                    console.log(`[退款] 订单(ID:${order.id})为仅退款，不退还代理商(ID:${order.fulfillment_partner_id})云库存（货未退回）`);
                }
            } else if (agentDeductedStock && restoreProductQty > 0) {
                // 部分退货退款：按退货数量退还代理商云库存
                const agent = await User.findByPk(order.fulfillment_partner_id, { transaction: t, lock: t.LOCK.UPDATE });
                if (agent) {
                    await agent.increment('stock_count', { by: restoreProductQty, transaction: t });
                    console.log(`[退款] 代理商(ID:${agent.id})云库存退还 ${restoreProductQty} 件（部分退货）`);
                }
            }
        }

        // ★★★ 修复漏洞: 佣金撤销逻辑 ★★★
        // 全额退款 → 撤销所有佣金
        // 部分退款 → 按退款比例撤销佣金（避免退1元就撤销全部佣金的漏洞）
        const refundRatio = parseFloat(refund.amount) / parseFloat(order.total_amount);
        const isFullRefundForCommission = refundRatio >= 0.99; // 99%以上视为全额退款（防浮点误差）

        if (isFullRefundForCommission) {
            // 全额退款：撤销所有未结算的佣金（frozen/pending_approval/approved）
            await CommissionLog.update(
                { status: 'cancelled', remark: '订单全额退款，佣金已撤销' },
                { where: { order_id: refund.order_id, status: { [Op.in]: ['frozen', 'pending_approval', 'approved', 'pending'] } }, transaction: t }
            );

            // 已结算佣金全额扣回
            const settledLogs = await CommissionLog.findAll({
                where: { order_id: refund.order_id, status: 'settled' },
                transaction: t
            });
            for (const log of settledLogs) {
                const commUser = await User.findByPk(log.user_id, { transaction: t, lock: t.LOCK.UPDATE });
                if (commUser) {
                    const deductAmount = parseFloat(log.amount);
                    const currentBalance = parseFloat(commUser.balance) || 0;
                    if (currentBalance >= deductAmount) {
                        await commUser.decrement('balance', { by: deductAmount, transaction: t });
                        log.status = 'cancelled';
                        log.remark = (log.remark || '') + ' [全额退款扣回]';
                    } else if (currentBalance > 0) {
                        const shortfall = parseFloat((deductAmount - currentBalance).toFixed(2));
                        await commUser.update({ balance: 0 }, { transaction: t });
                        await commUser.increment('debt_amount', { by: shortfall, transaction: t });
                        log.status = 'cancelled';
                        log.remark = (log.remark || '') + ` [部分扣回¥${currentBalance.toFixed(2)}, 欠款¥${shortfall}]`;
                    } else {
                        await commUser.increment('debt_amount', { by: deductAmount, transaction: t });
                        log.status = 'cancelled';
                        log.remark = (log.remark || '') + ` [欠款¥${deductAmount.toFixed(2)}]`;
                    }
                    await log.save({ transaction: t });
                }
            }
        } else {
            // ★ 部分退款：按退款比例撤销佣金（不撤销全部，按比例扣减）
            // 未结算的佣金按比例扣减金额
            const frozenLogs = await CommissionLog.findAll({
                where: { order_id: refund.order_id, status: { [Op.in]: ['frozen', 'pending_approval', 'approved', 'pending'] } },
                transaction: t
            });
            for (const log of frozenLogs) {
                const reduceAmount = parseFloat((parseFloat(log.amount) * refundRatio).toFixed(2));
                if (reduceAmount > 0) {
                    const newAmount = parseFloat((parseFloat(log.amount) - reduceAmount).toFixed(2));
                    if (newAmount <= 0) {
                        log.status = 'cancelled';
                        log.remark = (log.remark || '') + ` [部分退款比例${(refundRatio * 100).toFixed(0)}%，已撤销]`;
                    } else {
                        log.amount = newAmount;
                        log.remark = (log.remark || '') + ` [部分退款扣减¥${reduceAmount}]`;
                    }
                    await log.save({ transaction: t });
                }
            }

            // 已结算佣金按比例扣回
            const settledLogs = await CommissionLog.findAll({
                where: { order_id: refund.order_id, status: 'settled' },
                transaction: t
            });
            for (const log of settledLogs) {
                const commUser = await User.findByPk(log.user_id, { transaction: t, lock: t.LOCK.UPDATE });
                if (commUser) {
                    const deductAmount = parseFloat((parseFloat(log.amount) * refundRatio).toFixed(2));
                    if (deductAmount <= 0) continue;
                    const currentBalance = parseFloat(commUser.balance) || 0;
                    if (currentBalance >= deductAmount) {
                        await commUser.decrement('balance', { by: deductAmount, transaction: t });
                        log.remark = (log.remark || '') + ` [部分退款扣回¥${deductAmount}]`;
                    } else if (currentBalance > 0) {
                        const shortfall = parseFloat((deductAmount - currentBalance).toFixed(2));
                        await commUser.update({ balance: 0 }, { transaction: t });
                        await commUser.increment('debt_amount', { by: shortfall, transaction: t });
                        log.remark = (log.remark || '') + ` [部分扣回¥${currentBalance.toFixed(2)}, 欠款¥${shortfall}]`;
                    } else {
                        await commUser.increment('debt_amount', { by: deductAmount, transaction: t });
                        log.remark = (log.remark || '') + ` [欠款¥${deductAmount.toFixed(2)}]`;
                    }
                    await log.save({ transaction: t });
                }
            }
        }

        refund.status = 'completed';
        refund.completed_at = new Date();
        await refund.save({ transaction: t });

        await t.commit();

        // 通知用户（在事务外发送，通知失败不影响退款）
        await sendNotification(
            refund.user_id,
            '退款已完成',
            `您的退款 ¥${parseFloat(refund.amount).toFixed(2)} 已完成退款处理。`,
            'refund',
            String(refund.id)
        );

        res.json({ code: 0, message: '退款完成' });
    } catch (error) {
        await t.rollback();
        console.error('完成退款失败:', error);
        res.status(500).json({ code: -1, message: '操作失败' });
    }
};

module.exports = {
    getRefunds,
    getRefundById,
    approveRefund,
    rejectRefund,
    completeRefund
};
