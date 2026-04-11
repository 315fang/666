const { Refund, Order, User, Product, SKU, CommissionLog, UserCoupon, sequelize } = require('../../../models');
const { Op } = require('sequelize');
const { sendNotification } = require('../../../models/notificationUtil');
const { refundOrder } = require('../../../utils/wechat');
const PointService = require('../../../services/PointService');
const AgentWalletService = require('../../../services/AgentWalletService');
const { getSafeRestoreQuantity, shouldRestoreCoupon } = require('../../../utils/orderGuards');

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
    const t = await sequelize.transaction();
    try {
        const { id } = req.params;
        const { remark } = req.body;
        const adminId = req.admin.id;

        const refund = await Refund.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
        if (!refund) {
            await t.rollback();
            return res.status(404).json({ code: -1, message: '售后单不存在' });
        }

        if (refund.status !== 'pending') {
            await t.rollback();
            return res.status(400).json({ code: -1, message: '状态不正确，仅待审核订单可操作' });
        }

        refund.status = 'approved';
        refund.admin_id = adminId;
        refund.admin_remark = remark;
        refund.processed_at = new Date();
        await refund.save({ transaction: t });
        await t.commit();

        // 通知用户（事务外，通知失败不影响审核结果）
        await sendNotification(
            refund.user_id,
            '退款审核通过',
            `您的退款申请 ¥${parseFloat(refund.amount).toFixed(2)} 已审核通过${refund.type === 'return_refund' ? '，请尽快寄回商品' : '，即将为您退款'}。`,
            'refund',
            String(refund.id)
        );

        res.json({ code: 0, message: '审核通过' });
    } catch (error) {
        await t.rollback();
        console.error('审核失败:', error.message);
        res.status(500).json({ code: -1, message: '审核失败' });
    }
};

// 拒绝售后
const rejectRefund = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { id } = req.params;
        const { reason } = req.body;
        const adminId = req.admin.id;

        const refund = await Refund.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
        if (!refund) {
            await t.rollback();
            return res.status(404).json({ code: -1, message: '售后单不存在' });
        }

        if (refund.status !== 'pending') {
            await t.rollback();
            return res.status(400).json({ code: -1, message: '状态不正确，仅待审核订单可操作' });
        }

        refund.status = 'rejected';
        refund.admin_id = adminId;
        refund.reject_reason = reason;
        refund.processed_at = new Date();
        await refund.save({ transaction: t });
        await t.commit();

        // 通知用户（事务外）
        await sendNotification(
            refund.user_id,
            '退款申请被拒绝',
            `您的退款申请 ¥${parseFloat(refund.amount).toFixed(2)} 已被拒绝${reason ? '，原因: ' + reason : ''}。`,
            'refund',
            String(refund.id)
        );

        res.json({ code: 0, message: '已拒绝' });
    } catch (error) {
        await t.rollback();
        console.error('拒绝失败:', error.message);
        res.status(500).json({ code: -1, message: '操作失败' });
    }
};

const yuanToCents = (v) => {
    const n = parseFloat(v);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.round(n * 100 + 1e-6);
};

function appendRemark(base, extra) {
    return [base, extra].filter(Boolean).join(' | ').slice(0, 255);
}

async function finalizeRefundLocally(refundId) {
    const t = await sequelize.transaction();
    try {
        const refund = await Refund.findByPk(refundId, {
            include: [{ model: Order, as: 'order' }],
            transaction: t,
            lock: t.LOCK.UPDATE
        });

        if (!refund) {
            throw new Error('售后单不存在');
        }
        if (refund.status !== 'processing') {
            throw new Error(`退款状态异常(${refund.status})，无法完成本地收口`);
        }

        const order = refund.order;
        if (!order) {
            throw new Error('关联订单不存在');
        }

        const orderPaidAmount = parseFloat(order.actual_price || order.total_amount);
        const paidCents = yuanToCents(orderPaidAmount);
        const refundFee = yuanToCents(refund.amount);
        const prevCompletedYuan = parseFloat(
            (await Refund.sum('amount', {
                where: { order_id: refund.order_id, status: 'completed', id: { [Op.ne]: refund.id } },
                transaction: t
            })) || 0
        );
        const prevCompletedCents = yuanToCents(prevCompletedYuan);
        const totalRefundedCents = prevCompletedCents + refundFee;
        const isFullRefund = paidCents > 0 && totalRefundedCents + 1 >= paidCents;

        if (isFullRefund) {
            await Order.update(
                { status: 'refunded' },
                { where: { id: refund.order_id }, transaction: t }
            );

            const pivotRow = await Order.findByPk(refund.order_id, {
                attributes: ['id', 'parent_order_id', 'buyer_id'],
                transaction: t,
                lock: t.LOCK.UPDATE
            });
            if (!pivotRow) {
                throw new Error('关联订单不存在');
            }
            const rootId = pivotRow.parent_order_id || pivotRow.id;
            const cluster = await Order.findAll({
                where: { [Op.or]: [{ id: rootId }, { parent_order_id: rootId }] },
                transaction: t,
                lock: t.LOCK.UPDATE
            });
            const terminalStatuses = ['refunded', 'cancelled'];
            const clusterReadyForAssetRestore =
                cluster.length > 0 && cluster.every(o => terminalStatuses.includes(o.status));

            if (clusterReadyForAssetRestore) {
                const ucPk = cluster.map(o => o.coupon_id).find(Boolean);
                if (ucPk) {
                    const uc = await UserCoupon.findOne({
                        where: { id: ucPk, user_id: pivotRow.buyer_id || order.buyer_id },
                        transaction: t,
                        lock: t.LOCK.UPDATE
                    });
                    const usedOnCluster =
                        !uc?.used_order_id
                        || cluster.some(c => Number(c.id) === Number(uc.used_order_id));
                    const otherActiveOrderCount = await Order.count({
                        where: {
                            buyer_id: pivotRow.buyer_id || order.buyer_id,
                            coupon_id: ucPk,
                            id: { [Op.notIn]: cluster.map(c => c.id) },
                            status: { [Op.notIn]: ['cancelled', 'refunded'] }
                        },
                        transaction: t
                    });

                    if (uc && uc.status === 'used' && usedOnCluster && shouldRestoreCoupon({ otherActiveOrderCount })) {
                        uc.status = 'unused';
                        uc.used_at = null;
                        uc.used_order_id = null;
                        await uc.save({ transaction: t });
                    }
                }
                const pointsToRestore = cluster.reduce(
                    (s, o) => s + (parseInt(o.points_used, 10) || 0),
                    0
                );
                if (pointsToRestore > 0) {
                    await PointService.addPoints(
                        pivotRow.buyer_id || order.buyer_id,
                        pointsToRestore,
                        'refund',
                        `order_refund_cluster_${rootId}`,
                        '订单退款退回积分',
                        t
                    );
                }
            }

            await order.reload({ transaction: t });
        }

        if (order) {
            const shouldRestoreProductStock = refund.type === 'return_refund' && (refund.refund_quantity || 0) > 0;
            let restoreProductQty = 0;

            if (shouldRestoreProductStock) {
                const completedReturnedQty = await Refund.sum('refund_quantity', {
                    where: {
                        order_id: order.id,
                        status: 'completed',
                        type: 'return_refund',
                        id: { [Op.ne]: refund.id }
                    },
                    transaction: t
                }) || 0;

                restoreProductQty = getSafeRestoreQuantity({
                    orderQuantity: order.quantity,
                    requestedQuantity: refund.refund_quantity,
                    completedReturnRefundQuantity: completedReturnedQty
                });
            }

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
        }

        const refundRatio = orderPaidAmount > 0 ? parseFloat(refund.amount) / orderPaidAmount : 1;
        const isFullRefundForCommission = isFullRefund || refundRatio >= 0.99;

        if (isFullRefundForCommission) {
            await CommissionLog.update(
                { status: 'cancelled', remark: '订单全额退款，佣金已撤销' },
                { where: { order_id: refund.order_id, status: { [Op.in]: ['frozen', 'pending_approval', 'approved', 'pending'] } }, transaction: t }
            );

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
        return refund;
    } catch (error) {
        if (!t.finished) await t.rollback();
        throw error;
    }
}

// 完成退款（先落 processing，再执行外部退款，再做本地收口）
const completeRefund = async (req, res) => {
    const { id } = req.params;
    let refundContext = null;

    const prepareTx = await sequelize.transaction();
    try {
        const refund = await Refund.findByPk(id, {
            include: [{ model: Order, as: 'order' }],
            transaction: prepareTx,
            lock: prepareTx.LOCK.UPDATE
        });

        if (!refund) {
            await prepareTx.rollback();
            return res.status(404).json({ code: -1, message: '售后单不存在' });
        }

        if (!['approved', 'processing'].includes(refund.status)) {
            await prepareTx.rollback();
            return res.status(400).json({ code: -1, message: refund.status === 'completed' ? '退款已完成' : '请先审核通过' });
        }

        const order = refund.order;
        if (!order) {
            await prepareTx.rollback();
            return res.status(400).json({ code: -1, message: '关联订单不存在' });
        }

        const refundableStatuses = ['paid', 'agent_confirmed', 'shipping_requested', 'shipped', 'completed'];
        if (!refundableStatuses.includes(order.status)) {
            await prepareTx.rollback();
            return res.status(400).json({ code: -1, message: `当前订单状态(${order.status})不支持退款完成` });
        }

        const totalFee = yuanToCents(order.actual_price || order.total_amount);
        const refundFee = yuanToCents(refund.amount);
        if (!totalFee || !refundFee || refundFee > totalFee) {
            await prepareTx.rollback();
            return res.status(400).json({ code: -1, message: '退款金额不合法' });
        }

        const prevCompletedYuan = parseFloat(
            (await Refund.sum('amount', {
                where: {
                    order_id: refund.order_id,
                    status: 'completed',
                    id: { [Op.ne]: refund.id }
                },
                transaction: prepareTx
            })) || 0
        );
        const prevCompletedCents = yuanToCents(prevCompletedYuan);
        if (prevCompletedCents + refundFee > totalFee + 1) {
            await prepareTx.rollback();
            return res.status(400).json({ code: -1, message: '累计退款金额不能超过订单实付金额' });
        }

        if (refund.status === 'approved') {
            refund.status = 'processing';
            refund.processed_at = refund.processed_at || new Date();
            refund.admin_remark = appendRemark(refund.admin_remark, '退款处理中');
            await refund.save({ transaction: prepareTx });
        }
        await prepareTx.commit();

        refundContext = {
          refundId: refund.id,
          refundNo: refund.refund_no,
          refundAmount: parseFloat(refund.amount),
          refundFee,
          totalFee,
          userId: refund.user_id,
          orderId: order.id,
          orderNo: order.order_no,
          orderPaymentMethod: order.payment_method,
          buyerId: order.buyer_id
        };
    } catch (error) {
        if (!prepareTx.finished) await prepareTx.rollback();
        console.error('退款预处理失败:', error);
        return res.status(500).json({ code: -1, message: '退款预处理失败' });
    }

    try {
        if (refundContext.orderPaymentMethod === 'wallet') {
            await AgentWalletService.recharge({
                userId: refundContext.buyerId,
                amount: refundContext.refundAmount,
                refType: 'order_refund',
                refId: refundContext.refundNo,
                remark: `订单退款 ${refundContext.orderNo} ¥${refundContext.refundAmount}`
            });
        } else {
            await refundOrder({
                orderNo: refundContext.orderNo,
                refundNo: refundContext.refundNo,
                totalFee: refundContext.totalFee,
                refundFee: refundContext.refundFee
            });
        }
    } catch (error) {
        const failTx = await sequelize.transaction();
        try {
            const refund = await Refund.findByPk(refundContext.refundId, {
                transaction: failTx,
                lock: failTx.LOCK.UPDATE
            });
            if (refund) {
                refund.admin_remark = appendRemark(refund.admin_remark, `外部退款调用失败：${error.message}`);
                await refund.save({ transaction: failTx });
            }
            await failTx.commit();
        } catch (remarkError) {
            if (!failTx.finished) await failTx.rollback();
            console.error('记录退款失败备注失败:', remarkError);
        }
        console.error('调用外部退款失败:', error);
        return res.status(500).json({ code: -1, message: '退款处理中，请核对外部退款结果后再继续' });
    }

    try {
        const finalizedRefund = await finalizeRefundLocally(refundContext.refundId);
        await sendNotification(
            finalizedRefund.user_id,
            '退款已完成',
            `您的退款 ¥${parseFloat(finalizedRefund.amount).toFixed(2)} 已完成退款处理。`,
            'refund',
            String(finalizedRefund.id)
        );
        return res.json({ code: 0, message: '退款完成' });
    } catch (error) {
        const failTx = await sequelize.transaction();
        try {
            const refund = await Refund.findByPk(refundContext.refundId, {
                transaction: failTx,
                lock: failTx.LOCK.UPDATE
            });
            if (refund) {
                refund.admin_remark = appendRemark(refund.admin_remark, `外部退款成功，但本地收口失败：${error.message}`);
                await refund.save({ transaction: failTx });
            }
            await failTx.commit();
        } catch (remarkError) {
            if (!failTx.finished) await failTx.rollback();
            console.error('记录本地收口失败备注失败:', remarkError);
        }
        console.error('完成退款本地收口失败:', error);
        return res.status(500).json({ code: -1, message: '外部退款已执行，本地收口失败，请人工核对' });
    }
};

module.exports = {
    getRefunds,
    getRefundById,
    approveRefund,
    rejectRefund,
    completeRefund
};
