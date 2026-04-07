const express = require('express');
const router = express.Router();
const {
    getCart,
    addToCart,
    updateCartItem,
    removeCartItem,
    clearCart,
    selectCartItems
} = require('../controllers/cartController');
const { authenticate } = require('../middleware/auth');

// 所有购物袋接口需要登录
router.use(authenticate);

// GET /api/cart - 获取购物袋
router.get('/', getCart);

// POST /api/cart - 添加商品到购物袋
router.post('/', addToCart);

// PUT /api/cart/:id - 更新购物袋商品（数量）
router.put('/:id', updateCartItem);

// DELETE /api/cart/:id - 删除购物袋商品
router.delete('/:id', removeCartItem);

// DELETE /api/cart - 清空购物袋
router.delete('/', clearCart);

// PUT /api/cart/select - 批量选中/取消选中
router.put('/select/batch', selectCartItems);

module.exports = router;
