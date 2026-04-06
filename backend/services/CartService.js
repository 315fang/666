/**
 * 购物袋(Cart)服务层
 * 封装所有购物袋相关的业务逻辑与数据库操作
 */

const { Op } = require('sequelize');
const { Cart, Product, SKU } = require('../models');
const constants = require('../config/constants');
const PricingService = require('./PricingService');
const MemberTierService = require('./MemberTierService');
const { normalizeSkuIdForFk } = require('../utils/skuId');
const { BusinessError } = require('../utils/errors');
const logger = require('../utils/logger');

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

/**
 * 获取商品有效单价（根据用户角色/等级）
 */
async function getEffectiveUnitPrice(product, sku, roleLevel, purchaseLevel) {
    return PricingService.calculatePayableUnitPrice(product, sku, roleLevel, purchaseLevel);
}

/**
 * 获取购物袋
 */
async function getCart(userId, roleLevel, purchaseLevelCode) {
    const purchaseLevel = await MemberTierService.getPurchaseLevelByCode(purchaseLevelCode);

    const cartItems = await Cart.findAll({
        where: { user_id: userId },
        include: [
            {
                model: Product,
                as: 'product',
                attributes: ['id', 'name', 'images', 'retail_price', 'member_price', 'price_member', 'price_leader', 'price_agent', 'stock', 'status', 'category_id', 'discount_exempt', 'supports_pickup']
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

    return {
        items: itemsWithPrice,
        summary: {
            totalCount,
            selectedCount,
            totalAmount: totalAmount.toFixed(2)
        }
    };
}

/**
 * 合并已有购物袋项（增加数量）
 */
async function mergeExistingCartItem(userId, existingItem, qty) {
    const MAX_QTY = constants.CART.MAX_ITEM_QUANTITY;
    const newQty = existingItem.quantity + qty;
    if (newQty > MAX_QTY) {
        throw new BusinessError(`单个商品最多购买 ${MAX_QTY} 件`, 400);
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
    return { data: updated, message: '已更新购物袋数量' };
}

/**
 * 添加商品到购物袋
 */
async function addToCart(userId, body) {
    const MAX_QTY = constants.CART.MAX_ITEM_QUANTITY;

    const product_id = parseProductIdFromBody(body.product_id);
    if (!Number.isInteger(product_id) || product_id < 1) {
        throw new BusinessError('商品ID无效', 400);
    }

    /** 无规格商品必须为 null，以便与 cart_items.sku_id 外键（指向 product_skus）一致 */
    let sku_id = normalizeSkuIdForFk(body.sku_id);
    if (body.sku_id !== undefined && body.sku_id !== null && String(body.sku_id).trim() !== '' && sku_id == null) {
        throw new BusinessError('规格参数无效', 400);
    }

    const qty = parseInt(body.quantity, 10);
    if (!Number.isInteger(qty) || qty < 1) {
        throw new BusinessError('数量必须为正整数', 400);
    }

    const product = await Product.findByPk(product_id);
    if (!product || product.status !== 1) {
        throw new BusinessError('商品不存在或已下架', 400);
    }

    const skuCount = await SKU.count({ where: { product_id } });
    if (skuCount > 0 && sku_id == null) {
        throw new BusinessError('请选择商品规格', 400);
    }

    if (sku_id != null) {
        const sku = await SKU.findOne({ where: { id: sku_id, product_id } });
        if (!sku || sku.stock < qty) {
            throw new BusinessError('规格不存在或库存不足', 400);
        }
    } else if (qty > (product.stock || 0)) {
        throw new BusinessError('商品库存不足', 400);
    }

    const existingItem = await Cart.findOne({
        where: {
            user_id: userId,
            product_id,
            sku_id
        }
    });

    if (existingItem) {
        return mergeExistingCartItem(userId, existingItem, qty);
    }

    if (qty > MAX_QTY) {
        throw new BusinessError(`单个商品最多购买 ${MAX_QTY} 件`, 400);
    }

    try {
        const newItem = await Cart.create({
            user_id: userId,
            product_id,
            sku_id,
            quantity: qty,
            selected: true
        });
        return { data: newItem, message: '已添加到购物袋' };
    } catch (createErr) {
        if (createErr.name === 'SequelizeUniqueConstraintError') {
            const again = await Cart.findOne({
                where: {
                    user_id: userId,
                    product_id,
                    sku_id
                }
            });
            if (again) {
                return mergeExistingCartItem(userId, again, qty);
            }
        }
        throw createErr;
    }
}

/**
 * 更新购物袋商品
 */
async function updateCartItem(userId, itemId, body) {
    const { quantity, selected } = body;
    const MAX_QTY = constants.CART.MAX_ITEM_QUANTITY;

    const cartItem = await Cart.findOne({
        where: { id: itemId, user_id: userId }
    });

    if (!cartItem) {
        throw new BusinessError('购物袋商品不存在', 404);
    }

    if (quantity !== undefined) {
        if (quantity <= 0) {
            await cartItem.destroy();
            return { message: '已从购物袋移除' };
        }
        const qty = parseInt(quantity);
        if (!Number.isInteger(qty) || qty < 1) {
            throw new BusinessError('数量必须为正整数', 400);
        }
        if (qty > MAX_QTY) {
            throw new BusinessError(`单个商品最多购买 ${MAX_QTY} 件`, 400);
        }

        const product = await Product.findByPk(cartItem.product_id);
        if (!product || product.status !== 1) {
            throw new BusinessError('商品不存在或已下架', 400);
        }

        if (cartItem.sku_id) {
            const sku = await SKU.findByPk(cartItem.sku_id);
            if (!sku || (sku.status !== undefined && sku.status !== 1)) {
                throw new BusinessError('规格不存在或已失效', 400);
            }
            if (qty > (sku.stock || 0)) {
                throw new BusinessError('当前规格库存不足', 400);
            }
        } else if (qty > (product.stock || 0)) {
            throw new BusinessError('商品库存不足', 400);
        }

        cartItem.quantity = qty;
    }

    if (selected !== undefined) {
        cartItem.selected = selected;
    }

    await cartItem.save();
    return { data: cartItem };
}

/**
 * 删除购物袋商品
 */
async function removeCartItem(userId, itemId) {
    const deleted = await Cart.destroy({
        where: { id: itemId, user_id: userId }
    });

    if (!deleted) {
        throw new BusinessError('购物袋商品不存在', 404);
    }

    return { message: '已从购物袋移除' };
}

/**
 * 清空购物袋
 */
async function clearCart(userId, selectedOnly) {
    const where = { user_id: userId };
    if (selectedOnly) {
        where.selected = true;
    }

    await Cart.destroy({ where });

    return { message: '购物袋已清空' };
}

/**
 * 批量选中/取消选中
 */
async function selectCartItems(userId, ids, selected) {
    if (!Array.isArray(ids) || selected === undefined) {
        throw new BusinessError('参数错误', 400);
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

    return { message: '更新成功' };
}

module.exports = {
    getCart,
    addToCart,
    updateCartItem,
    removeCartItem,
    clearCart,
    selectCartItems
};
