// backend/controllers/adminHeatController.js
/**
 * 后台热度管理控制器
 *
 * 功能：
 * 1. 商品自动热度更新（购买量/浏览量/榜单权重综合算法）
 * 2. 后台手动覆盖商品 heat_score（让运营可以人工干预榜单）
 * 3. 热门商品榜单接口（按 heat_score 排序）
 * 4. 批量刷新热度（定期任务调用）
 */
const { Op } = require('sequelize');
const { Product, Order, sequelize } = require('../models');

/**
 * 热度算法：
 * heat_score = purchase_count × 40 + view_count × 10 + manual_weight × 50
 * 后台可以通过修改 manual_weight (0-100) 干预商品在榜单中的位置
 */
function calcHeatScore(purchaseCount, viewCount, manualWeight = 0) {
    return Math.round(purchaseCount * 40 + viewCount * 10 + manualWeight * 50);
}

/**
 * POST /admin/api/heat/product/:id
 * 后台手动设置商品热度权重（运营干预）
 * body: { manual_weight, reason }  // manual_weight: 0-100
 */
exports.setManualWeight = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { manual_weight, reason } = req.body;

        if (manual_weight === undefined || manual_weight < 0 || manual_weight > 100) {
            return res.json({ code: -1, message: '热度权重须为 0-100 之间的整数' });
        }

        const product = await Product.findByPk(id);
        if (!product) return res.status(404).json({ code: -1, message: '商品不存在' });

        const newHeat = calcHeatScore(
            product.purchase_count || 0,
            product.view_count || 0,
            parseInt(manual_weight)
        );

        await product.update({
            manual_weight: parseInt(manual_weight),
            heat_score: newHeat,
            heat_updated_at: new Date()
        });

        console.log(`[AdminHeat] 商品${id} 热度权重设为 ${manual_weight}，热度分=${newHeat}，原因：${reason || '无'}`);

        res.json({
            code: 0,
            message: '热度权重更新成功',
            data: { id, manual_weight, heat_score: newHeat }
        });
    } catch (err) { next(err); }
};

/**
 * POST /admin/api/heat/refresh
 * 批量刷新所有商品热度（定时任务调用，OR 后台手动触发）
 */
exports.refreshAllHeat = async (req, res, next) => {
    try {
        // 统计近30天每个商品的购买量
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000);

        const salesData = await Order.findAll({
            where: {
                status: { [Op.in]: ['completed', 'shipped'] },
                paid_at: { [Op.gte]: thirtyDaysAgo }
            },
            attributes: [
                'product_id',
                [sequelize.fn('COUNT', sequelize.col('id')), 'order_count']
            ],
            group: ['product_id'],
            raw: true
        });

        const salesMap = {};
        salesData.forEach(row => { salesMap[row.product_id] = parseInt(row.order_count); });

        // 批量更新热度
        const products = await Product.findAll({
            attributes: ['id', 'view_count', 'manual_weight']
        });

        let updated = 0;
        for (const p of products) {
            const purchaseCount = salesMap[p.id] || 0;
            const viewCount = p.view_count || 0;
            const manualWeight = p.manual_weight || 0;
            const heat_score = calcHeatScore(purchaseCount, viewCount, manualWeight);

            await p.update({
                purchase_count: purchaseCount,
                heat_score,
                heat_updated_at: new Date()
            });
            updated++;
        }

        res.json({
            code: 0,
            message: `批量刷新完成：${updated} 个商品热度已更新`,
            data: { updated, refreshed_at: new Date() }
        });
    } catch (err) { next(err); }
};

/**
 * GET /admin/api/heat/products
 * 后台热度榜单（支持筛选和分页）
 * query: { page, limit, sort, category_id }
 */
exports.getHeatRanking = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 20, 100);
        const offset = (page - 1) * limit;
        const categoryId = req.query.category_id;

        const where = {};
        if (categoryId) where.category_id = categoryId;

        const { count, rows } = await Product.findAndCountAll({
            where,
            attributes: ['id', 'name', 'images', 'retail_price', 'view_count', 'purchase_count', 'heat_score', 'manual_weight', 'heat_updated_at'],
            order: [['heat_score', 'DESC']],
            limit,
            offset
        });

        res.json({
            code: 0,
            data: {
                list: rows,
                total: count,
                page,
                limit,
                pages: Math.ceil(count / limit)
            }
        });
    } catch (err) { next(err); }
};

/**
 * GET /api/products/hot
 * 前台热门商品（供首页调用）
 * query: { limit=10 }
 */
exports.getHotProducts = async (req, res, next) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 10, 20);
        const products = await Product.findAll({
            where: { status: 1 },
            attributes: ['id', 'name', 'images', 'retail_price', 'heat_score', 'purchase_count'],
            order: [['heat_score', 'DESC']],
            limit
        });
        res.json({ code: 0, data: products });
    } catch (err) { next(err); }
};
