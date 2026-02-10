const { Cart, Product, SKU, User } = require('../models');

/**
 * ★ 根据用户角色等级获取商品实际价格
 */
function getPriceByRole(product, sku, roleLevel) {
    if (sku) {
        let price = parseFloat(sku.retail_price);
        if (roleLevel >= 1 && sku.member_price) price = parseFloat(sku.member_price);
        if (roleLevel >= 2 && sku.wholesale_price) price = parseFloat(sku.wholesale_price);
        return price;
    }
    let price = parseFloat(product.retail_price);
    if (roleLevel === 1) price = parseFloat(product.price_member || product.retail_price);
    else if (roleLevel === 2) price = parseFloat(product.price_leader || product.price_member || product.retail_price);
    else if (roleLevel === 3) price = parseFloat(product.price_agent || product.price_leader || product.price_member || product.retail_price);
    return price;
}

// 获取购物车
const getCart = async (req, res) => {
    try {
        const userId = req.user.id;
        const roleLevel = req.user.role_level || 0;

        const cartItems = await Cart.findAll({
            where: { user_id: userId },
            include: [
                {
                    model: Product,
                    as: 'product',
                    attributes: ['id', 'name', 'images', 'retail_price', 'member_price', 'price_member', 'price_leader', 'price_agent', 'stock', 'status']
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

        // ★ 为每个 item 附加 effective_price（用户实际等级价格）
        const itemsWithPrice = cartItems.map(item => {
            const itemJson = item.toJSON();
            itemJson.effective_price = getPriceByRole(item.product, item.sku, roleLevel);
            return itemJson;
        });

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
        console.error('获取购物车失败:', error);
        res.status(500).json({ code: -1, message: '获取购物车失败' });
    }
};

// 添加商品到购物车
const addToCart = async (req, res) => {
    try {
        const userId = req.user.id;
        const { product_id, sku_id = null, quantity = 1 } = req.body;

        if (!product_id) {
            return res.status(400).json({ code: -1, message: '商品ID不能为空' });
        }

        // 检查商品是否存在
        const product = await Product.findByPk(product_id);
        if (!product || product.status !== 1) {
            return res.status(400).json({ code: -1, message: '商品不存在或已下架' });
        }

        // 检查SKU库存
        if (sku_id) {
            const sku = await SKU.findByPk(sku_id);
            if (!sku || sku.stock < quantity) {
                return res.status(400).json({ code: -1, message: 'SKU不存在或库存不足' });
            }
        }

        // 查找是否已存在相同商品
        const existingItem = await Cart.findOne({
            where: {
                user_id: userId,
                product_id,
                sku_id: sku_id || null
            }
        });

        if (existingItem) {
            // 更新数量
            existingItem.quantity += quantity;
            await existingItem.save();
            res.json({ code: 0, data: existingItem, message: '已更新购物车数量' });
        } else {
            // 新增购物车项
            const newItem = await Cart.create({
                user_id: userId,
                product_id,
                sku_id,
                quantity,
                selected: true
            });
            res.json({ code: 0, data: newItem, message: '已添加到购物车' });
        }
    } catch (error) {
        console.error('添加购物车失败:', error);
        res.status(500).json({ code: -1, message: '添加购物车失败' });
    }
};

// 更新购物车商品
const updateCartItem = async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;
        const { quantity, selected } = req.body;

        const cartItem = await Cart.findOne({
            where: { id, user_id: userId }
        });

        if (!cartItem) {
            return res.status(404).json({ code: -1, message: '购物车商品不存在' });
        }

        if (quantity !== undefined) {
            if (quantity <= 0) {
                await cartItem.destroy();
                return res.json({ code: 0, message: '已从购物车移除' });
            }
            cartItem.quantity = quantity;
        }

        if (selected !== undefined) {
            cartItem.selected = selected;
        }

        await cartItem.save();
        res.json({ code: 0, data: cartItem });
    } catch (error) {
        console.error('更新购物车失败:', error);
        res.status(500).json({ code: -1, message: '更新购物车失败' });
    }
};

// 删除购物车商品
const removeCartItem = async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;

        const deleted = await Cart.destroy({
            where: { id, user_id: userId }
        });

        if (!deleted) {
            return res.status(404).json({ code: -1, message: '购物车商品不存在' });
        }

        res.json({ code: 0, message: '已从购物车移除' });
    } catch (error) {
        console.error('删除购物车商品失败:', error);
        res.status(500).json({ code: -1, message: '删除失败' });
    }
};

// 清空购物车
const clearCart = async (req, res) => {
    try {
        const userId = req.user.id;
        const { selected_only } = req.query;

        const where = { user_id: userId };
        if (selected_only === 'true') {
            where.selected = true;
        }

        await Cart.destroy({ where });

        res.json({ code: 0, message: '购物车已清空' });
    } catch (error) {
        console.error('清空购物车失败:', error);
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
