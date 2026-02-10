/**
 * 佣金相关路由
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const CommissionService = require('../services/CommissionService');

/**
 * 获取佣金预览
 * GET /api/commissions/preview?product_id=1&sku_id=1&quantity=1
 */
router.get('/preview', authenticate, async (req, res, next) => {
    try {
        const { product_id, sku_id, quantity = 1 } = req.query;

        if (!product_id) {
            return res.status(400).json({
                code: -1,
                message: '缺少商品ID'
            });
        }

        const result = await CommissionService.previewCommission({
            productId: parseInt(product_id),
            skuId: sku_id ? parseInt(sku_id) : null,
            quantity: parseInt(quantity),
            userId: req.user.id,
            mode: 'auto'
        });

        if (result.success) {
            res.json({
                code: 0,
                data: result.data
            });
        } else {
            res.status(400).json({
                code: -1,
                message: result.error
            });
        }
    } catch (error) {
        next(error);
    }
});

/**
 * 获取我的佣金统计
 * GET /api/commissions/my-stats
 */
router.get('/my-stats', authenticate, async (req, res, next) => {
    try {
        const stats = await CommissionService.getUserCommissionStats(req.user.id);

        res.json({
            code: 0,
            data: stats
        });
    } catch (error) {
        next(error);
    }
});

/**
 * 获取佣金配置
 * GET /api/commissions/config
 */
router.get('/config', authenticate, async (req, res, next) => {
    try {
        const config = CommissionService.getConfig();

        res.json({
            code: 0,
            data: config
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
