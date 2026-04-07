const { Op } = require('sequelize');
const { Cart, Product, SKU, User } = require('../models');
const constants = require('../config/constants');
const PricingService = require('../services/PricingService');
const MemberTierService = require('../services/MemberTierService');

/**
 * 与小程序 normalizeProductId 对齐：支持纯数字、p123
 */
function parseProductIdFromBody(raw) {
    if (raw === null || raw === undefined || raw === '') return NaN;
    if (typeof raw === 'string') {
        const m = raw.trim().match(/^p(\d+)$/i);
        if (m) return parseInt(m[1], 10);
    }
    const n = parseInt(String(raw), 10);
    return Number.isNaN(n) ? NaN : n;
}

async function getEffectiveUnitPrice(product, sku, roleLevel, purchaseLevel) {
    return PricingService.calculatePayableUnitPrice(product, sku, roleLevel, purchaseLevel);
}

// 获取购物袋
const getCart = async (req, res) => {
    try {
        const userId = req.user.id;
        const roleLevel = req.user.role_level || 0;
        const purchaseLevel = await MemberTierService.getPurchaseLevelByCode(req.user.purchase_level_code);

        const cartItems = await Cart.findAll({
            where: { user_id: userId },
            include: [
                {
                    model: Product,
                    as: 'product',
                    attributes: ['id', 'name', 'images', 'retail_price', 'member_price', 'price_member', 'price_leader', 'price_agent', 'stock', 'status', 'category_id', 'discount_exempt']
                },
                {
                    model: SKU,
                    as: 'sku',
                    attributes: ['id', 'spec_name', 'spec_value', 'retail_price', 'member_price', 'wholesale_price', 'stock', 'image']
                }
            ],
            order: [['created_at', 'DESC']]
        });

        // 计算汇总信息（★ 根据用户角色等级计算价格）
        let totalCount = 0;
        let selectedCount = 0;
        let totalAmount = 0;

        const itemsWithPrice = await Promise.all(
            cartItems.map(async (item) => {
                const itemJson = item.toJSON();
                itemJson.effective_price = await getEffectiveUnitPrice(
                    item.product,
                    item.sku,
                    roleLevel,
                    purchaseLevel
                );
                return itemJson;
            })
        );

        itemsWithPrice.forEach(item => {
            totalCount += item.quantity;
            if (item.selected) {
                selectedCount += item.quantity;
                totalAmount += item.effective_price * item.quantity;
            }
        });

        res.json({
            code: 0,
            data: {
                items: itemsWithPrice,
                summary: {
                    totalCount,
                    selectedCount,
                    totalAmount: totalAmount.toFixed(2)
                }
            }
        });
    } catch (error) {
        console.error('获取购物袋失败:', error);
        res.status(500).json({ code: -1, message: '获取购物袋失败' });
    }
};

// 添加商品到购物袋
const addToCart = async (req, res) => {
    const userId = req.user.id;
    const MAX_QTY = constants.CART.MAX_ITEM_QUANTITY;

    const product_id = parseProductIdFromBody(req.body.product_id);
    if (!Number.isInteger(product_id) || product_id < 1) {
        return res.status(400).json({ code: -1, message: '商品ID无效' });
    }

    let sku_id = 0;
    const rawSku = req.body.sku_id;
    if (rawSku !== undefined && rawSku !== null && String(rawSku).trim() !== '') {
        const sid = parseInt(rawSku, 10);
        if (!Number.isInteger(sid) || sid < 0) {
            return res.status(400).json({ code: -1, message: '规格参数无效' });
        }
        sku_id = sid;
    }

    const qty = parseInt(req.body.quantity, 10);
    if (!Number.isInteger(qty) || qty < 1) {
        return res.status(400).json({ code: -1, message: '数量必须为正整数' });
    }

    const respondMerge = async (existingItem) => {
        const newQty = existingItem.quantity + qty;
        if (newQty > MAX_QTY) {
            return res.status(400).json({ code: -1, message: `单个商品最多购买 ${MAX_QTY} 件` });
        }
        await Cart.increment('quantity', {
            by: qty,
            where: {
                id: existingItem.id,
                user_id: userId,
                quantity: { [Op.lte]: MAX_QTY - qty }
            }
        });
        const updated = await Cart.findByPk(existingItem.id);
        return res.json({ code: 0, data: updated, message: '已更新购物袋数量' });
    };

    try {
        const product = await Product.findByPk(product_id);
        if (!product || product.status !== 1) {
            return res.status(400).json({ code: -1, message: '商品不存在或已下架' });
        }

        const skuCount = await SKU.count({ where: { product_id } });
        if (skuCount > 0 && !sku_id) {
            return res.status(400).json({ code: -1, message: '请选择商品规格' });
        }

        if (sku_id) {
            const sku = await SKU.findOne({ where: { id: sku_id, product_id } });
            if (!sku || sku.stock < qty) {
                return res.status(400).json({ code: -1, message: '规格不存在或库存不足' });
            }
        } else if (qty > (product.stock || 0)) {
            return res.status(400).json({ code: -1, message: '商品库存不足' });
        }

        const existingItem = await Cart.findOne({
            where: {
                user_id: userId,
                product_id,
                sku_id: sku_id || 0
            }
        });

        if (existingItem) {
            return await respondMerge(existingItem);
        }

        if (qty > MAX_QTY) {
            return res.status(400).json({ code: -1, message: `单个商品最多购买 ${MAX_QTY} 件` });
        }

        try {
            const newItem = await Cart.create({
                user_id: userId,
                product_id,
                sku_id: sku_id || 0,
                quantity: qty,
                selected: true
            });
            return res.json({ code: 0, data: newItem, message: '已添加到购物袋' });
        } catch (createErr) {
            if (createErr.name === 'SequelizeUniqueConstraintError') {
                const again = await Cart.findOne({
                    where: {
                        user_id: userId,
                        product_id,
                        sku_id: sku_id || 0
                    }
                });
                if (again) {
                    return await respondMerge(again);
                }
            }
            throw createErr;
        }
    } catch (error) {
        console.error('添加购物袋失败:', error);
        res.status(500).json({ code: -1, message: '添加购物袋失败' });
    }
};

// 更新购物袋商品
const updateCartItem = async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;
        const { quantity, selected } = req.body;
        const MAX_QTY = constants.CART.MAX_ITEM_QUANTITY;

        const cartItem = await Cart.findOne({
            where: { id, user_id: userId }
        });

        if (!cartItem) {
            return res.status(404).json({ code: -1, message: '购物袋商品不存在' });
        }

        if (quantity !== undefined) {
            if (quantity <= 0) {
                await cartItem.destroy();
                return res.json({ code: 0, message: '已从购物袋移除' });
            }
            const qty = parseInt(quantity);
            if (!Number.isInteger(qty) || qty < 1) {
                return res.status(400).json({ code: -1, message: '数量必须为正整数' });
            }
            if (qty > MAX_QTY) {
                return res.status(400).json({ code: -1, message: `单个商品最多购买 ${MAX_QTY} 件` });
            }

            const product = await Product.findByPk(cartItem.product_id);
            if (!product || product.status !== 1) {
                return res.status(400).json({ code: -1, message: '商品不存在或已下架' });
            }

            if (cartItem.sku_id) {
                const sku = await SKU.findByPk(cartItem.sku_id);
                if (!sku || (sku.status !== undefined && sku.status !== 1)) {
                    return res.status(400).json({ code: -1, message: '规格不存在或已失效' });
                }
                if (qty > (sku.stock || 0)) {
                    return res.status(400).json({ code: -1, message: '当前规格库存不足' });
                }
            } else if (qty > (product.stock || 0)) {
                return res.status(400).json({ code: -1, message: '商品库存不足' });
            }

            cartItem.quantity = qty;
        }

        if (selected !== undefined) {
            cartItem.selected = selected;
        }

        await cartItem.save();
        res.json({ code: 0, data: cartItem });
    } catch (error) {
        console.error('更新购物袋失败:', error);
        res.status(500).json({ code: -1, message: '更新购物袋失败' });
    }
};

// 删除购物袋商品
const removeCartItem = async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;

        const deleted = await Cart.destroy({
            where: { id, user_id: userId }
        });

        if (!deleted) {
            return res.status(404).json({ code: -1, message: '购物袋商品不存在' });
        }

        res.json({ code: 0, message: '已从购物袋移除' });
    } catch (error) {
        console.error('删除购物袋商品失败:', error);
        res.status(500).json({ code: -1, message: '删除失败' });
    }
};

// 清空购物袋
const clearCart = async (req, res) => {
    try {
        const userId = req.user.id;
        const { selected_only } = req.query;

        const where = { user_id: userId };
        if (selected_only === 'true') {
            where.selected = true;
        }

        await Cart.destroy({ where });

        res.json({ code: 0, message: '购物袋已清空' });
    } catch (error) {
        console.error('清空购物袋失败:', error);
        res.status(500).json({ code: -1, message: '清空失败' });
    }
};

// 批量选中/取消选中
const selectCartItems = async (req, res) => {
    try {
        const userId = req.user.id;
        const { ids, selected } = req.body;

        if (!Array.isArray(ids) || selected === undefined) {
            return res.status(400).json({ code: -1, message: '参数错误' });
        }

        await Cart.update(
            { selected },
            {
                where: {
                    id: ids,
                    user_id: userId
                }
            }
        );

        res.json({ code: 0, message: '更新成功' });
    } catch (error) {
        console.error('批量选中失败:', error);
        res.status(500).json({ code: -1, message: '操作失败' });
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
