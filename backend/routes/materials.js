const express = require('express');
const router = express.Router();
const {
    getMaterials,
    getMaterialById,
    getMaterialsByProduct
} = require('../controllers/materialController');
const { authenticate } = require('../middleware/auth');

// GET /api/materials - 获取素材列表
router.get('/', authenticate, getMaterials);

// GET /api/materials/product/:productId - 按商品获取素材
router.get('/product/:productId', authenticate, getMaterialsByProduct);

// GET /api/materials/:id - 获取素材详情
router.get('/:id', authenticate, getMaterialById);

module.exports = router;
