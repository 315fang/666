const { Product } = require('../../../models');
const { Op } = require('sequelize');

/**
 * 批量设置商品佣金 (支持比例和固定金额)
 * POST /admin/api/products/batch-commission
 * body: { product_ids: [1,2], commission_rate_1, commission_amount_1, ... }
 */
const batchSetCommission = async (req, res) => {
    try {
        const {
            product_ids,
            commission_rate_1,
            commission_rate_2,
            commission_amount_1,
            commission_amount_2
        } = req.body;

        if (!product_ids || !Array.isArray(product_ids) || product_ids.length === 0) {
            return res.status(400).json({ code: -1, message: '请选择要操作的商品' });
        }

        const updateData = {};

        // 允许设置为空（清除配置），或者设置为具体数值
        if (commission_rate_1 !== undefined) updateData.commission_rate_1 = commission_rate_1 === '' ? null : parseFloat(commission_rate_1);
        if (commission_rate_2 !== undefined) updateData.commission_rate_2 = commission_rate_2 === '' ? null : parseFloat(commission_rate_2);

        if (commission_amount_1 !== undefined) updateData.commission_amount_1 = commission_amount_1 === '' ? null : parseFloat(commission_amount_1);
        if (commission_amount_2 !== undefined) updateData.commission_amount_2 = commission_amount_2 === '' ? null : parseFloat(commission_amount_2);

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ code: -1, message: '请至少输入一项配置' });
        }

        const [updated] = await Product.update(
            updateData,
            { where: { id: { [Op.in]: product_ids } } }
        );

        res.json({
            code: 0,
            message: `成功更新 ${updated} 个商品的佣金设置`,
            data: { updated_count: updated }
        });
    } catch (error) {
        console.error('批量设置佣金失败:', error);
        res.status(500).json({ code: -1, message: '批量设置失败' });
    }
};

module.exports = {
    batchSetCommission
};
