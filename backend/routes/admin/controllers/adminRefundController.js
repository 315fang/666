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
        if (!order) {
            await t.rollback();
            return res.status(400).json({ code: -1, message: '关联订单不存在' });
        }

        const refundableStatuses = ['paid', 'agent_confirmed', 'shipping_requested', 'shipped', 'completed'];
        if (!refundableStatuses.includes(order.status)) {
            await t.rollback();
            return res.status(400).json({ code: -1, message: `当前订单状态(${order.status})不支持退款完成` });
        }

        /** 元 → 分，避免浮点误差导致「实付与累计退款」差 1 分而不视为全额退 */
        const yuanToCents = (v) => {
            const n = parseFloat(v);
            if (!Number.isFinite(n) || n <= 0) return 0;
            return Math.round(n * 100 + 1e-6);
        };
        const totalFee = yuanToCents(order.actual_price || order.total_amount);
        const refundFee = yuanToCents(refund.amount);
        if (!totalFee || !refundFee || refundFee > totalFee) {
            await t.rollback();
            return res.status(400).json({ code: -1, message: '退款金额不合法' });
        }

        // 根据支付方式分流退款
        if (order.payment_method === 'wallet') {
            // 货款余额支付 → 退回货款钱包
            const refundYuan = parseFloat((refundFee / 100).toFixed(2));
            await AgentWalletService.recharge({
                userId: order.buyer_id,
                amount: refundYuan,
                refType: 'order_refund',
                refId: order.order_no,
                remark: `订单退款 ${order.order_no} ¥${refundYuan}`,
                transaction: t
            });
        } else {
            // 微信支付 → 调用微信退款 API
            await refundOrder({
                orderNo: order.order_no,
                refundNo: refund.refund_no,
                totalFee,
                refundFee
            });
        }

        // ★ 是否已全额退款（按「历史已完成退款 + 本次退款」累计，避免多次部分退款永远不把订单标为 refunded）
        const orderPaidAmount = parseFloat(order.actual_price || order.total_amount);
        const paidCents = yuanToCents(orderPaidAmount);
        const prevCompletedYuan = parseFloat(
            (await Refund.sum('amount', {
                where: { order_id: refund.order_id, status: 'completed' },
                transaction: t
            })) || 0
        );
        const prevCompletedCents = yuanToCents(prevCompletedYuan);
        const totalRefundedCents = prevCompletedCents + refundFee;
        // 允许 1 分容差（各端四舍五入/ DECIMAL 串转数字）
        const isFullRefund = paidCents > 0 && totalRefundedCents + 1 >= paidCents;

        if (isFullRefund) {
            await Order.update(
                { status: 'refunded' },
                { where: { id: refund.order_id }, transaction: t }
            );

            // ★ 拆单（parent/child）：券与积分往往只在父单上；须整簇订单均已 refunded/cancelled 后再退券、退积分（与超时取消订单组一致）
            const pivotRow = await Order.findByPk(refund.order_id, {
                attributes: ['id', 'parent_order_id', 'buyer_id'],
                transaction: t,
                lock: t.LOCK.UPDATE
            });
            if (!pivotRow) {
                await t.rollback();
                return res.status(400).json({ code: -1, message: '关联订单不存在' });
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

        // ★★★ 库存恢复逻辑 ★★★
        // 规则 1: 仅退款 (refund_only) → 不退货 → 不恢复平台物理库存
        // 规则 2: 退货退款 (return_refund) → 按 refund_quantity 恢复平台物理库存
        // 注：代理商“云库存”体系已下线，发货改为扣货款，不再处理代理库存回滚
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
        }

        // ★★★ 修复漏洞: 佣金撤销逻辑 ★★★
        // 全额退款 → 撤销所有佣金
        // 部分退款 → 按退款比例撤销佣金（避免退1元就撤销全部佣金的漏洞）
        const orderBaseAmount = parseFloat(order.actual_price || order.total_amount);
        const refundRatio = orderBaseAmount > 0 ? parseFloat(refund.amount) / orderBaseAmount : 1;
        // 单笔接近全额，或「累计退款」刚达实付全额（与 isFullRefund 一致）时走全额佣金撤销
        const isFullRefundForCommission = isFullRefund || refundRatio >= 0.99;

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
