/**
 * 购物袋(Cart)控制器 - 薄包装层
 * 职责：提取参数 → 调用 CartService → res.json() / next(err)
 */

const CartService = require('../services/CartService');

// 获取购物袋
const getCart = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const roleLevel = req.user.role_level || 0;
        const purchaseLevelCode = req.user.purchase_level_code;

        const result = await CartService.getCart(userId, roleLevel, purchaseLevelCode);
        res.json({ code: 0, data: result });
    } catch (error) {
        next(error);
    }
};

// 添加商品到购物袋
const addToCart = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const result = await CartService.addToCart(userId, req.body);

        res.json({ code: 0, ...result });
    } catch (error) {
        next(error);
    }
};

// 更新购物袋商品
const updateCartItem = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;
        const result = await CartService.updateCartItem(userId, id, req.body);

        res.json({ code: 0, ...result });
    } catch (error) {
        next(error);
    }
};

// 删除购物袋商品
const removeCartItem = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;
        const result = await CartService.removeCartItem(userId, id);

        res.json({ code: 0, ...result });
    } catch (error) {
        next(error);
    }
};

// 清空购物袋
const clearCart = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const selectedOnly = req.query.selected_only === 'true';
        const result = await CartService.clearCart(userId, selectedOnly);

        res.json({ code: 0, ...result });
    } catch (error) {
        next(error);
    }
};

// 批量选中/取消选中
const selectCartItems = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { ids, selected } = req.body;
        const result = await CartService.selectCartItems(userId, ids, selected);

        res.json({ code: 0, ...result });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getCart,
    addToCart,
    updateCartItem,
    removeCartItem,
    clearCart,
    selectCartItems
};
