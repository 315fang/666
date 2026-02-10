const express = require('express');
const router = express.Router();
const {
    getAddresses,
    createAddress,
    updateAddress,
    deleteAddress,
    setDefaultAddress
} = require('../controllers/addressController');
const { authenticate } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');

// GET /api/addresses - 获取地址列表
router.get('/addresses', authenticate, getAddresses);

// POST /api/addresses - 创建地址
router.post('/addresses', authenticate, validate(schemas.createAddress), createAddress);

// PUT /api/addresses/:id - 更新地址
router.put('/addresses/:id', authenticate, validate(schemas.createAddress), updateAddress);

// DELETE /api/addresses/:id - 删除地址
router.delete('/addresses/:id', authenticate, deleteAddress);

// POST /api/addresses/:id/default - 设置默认地址
router.post('/addresses/:id/default', authenticate, setDefaultAddress);

module.exports = router;
