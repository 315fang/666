const { Op } = require('sequelize');
const { UserFavorite, Product } = require('../models');

function firstImage(images) {
    if (!images || !Array.isArray(images) || images.length === 0) return '';
    return String(images[0] || '');
}

function mapRowToClient(row) {
    const p = row.product;
    const pid = row.product_id;
    if (p) {
        const imgs = p.images || [];
        return {
            id: p.id,
            name: p.name || '商品',
            image: firstImage(imgs),
            price:
                p.retail_price != null
                    ? String(parseFloat(p.retail_price).toFixed(2))
                    : '',
            saved_at: row.created_at,
            unavailable: Number(p.status) !== 1
        };
    }
    return {
        id: pid,
        name: '商品已删除',
        image: '',
        price: '',
        saved_at: row.created_at,
        unavailable: true
    };
}

/**
 * GET /api/user/favorites
 */
exports.list = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const rows = await UserFavorite.findAll({
            where: { user_id: userId },
            include: [
                {
                    model: Product,
                    as: 'product',
                    attributes: ['id', 'name', 'images', 'retail_price', 'status'],
                    required: false
                }
            ],
            order: [['created_at', 'DESC']]
        });
        res.json({ code: 0, data: rows.map(mapRowToClient) });
    } catch (err) {
        next(err);
    }
};

/**
 * GET /api/user/favorites/status?product_id=
 */
exports.status = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const productId = parseInt(req.query.product_id, 10);
        if (!Number.isFinite(productId) || productId <= 0) {
            return res.json({ code: 0, data: { favorited: false } });
        }
        const row = await UserFavorite.findOne({
            where: { user_id: userId, product_id: productId }
        });
        res.json({ code: 0, data: { favorited: !!row } });
    } catch (err) {
        next(err);
    }
};

/**
 * POST /api/user/favorites  body: { product_id }
 */
exports.add = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const productId = parseInt(req.body.product_id, 10);
        if (!Number.isFinite(productId) || productId <= 0) {
            return res.status(400).json({ code: 1, message: '无效的商品' });
        }
        const product = await Product.findByPk(productId, { attributes: ['id', 'status'] });
        if (!product || Number(product.status) !== 1) {
            return res.status(400).json({ code: 1, message: '商品不存在或已下架' });
        }
        await UserFavorite.findOrCreate({
            where: { user_id: userId, product_id: productId },
            defaults: { user_id: userId, product_id: productId }
        });
        res.json({ code: 0, message: 'ok' });
    } catch (err) {
        next(err);
    }
};

/**
 * DELETE /api/user/favorites/:productId
 */
exports.remove = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const productId = parseInt(req.params.productId, 10);
        if (!Number.isFinite(productId) || productId <= 0) {
            return res.status(400).json({ code: 1, message: '无效的商品' });
        }
        await UserFavorite.destroy({
            where: { user_id: userId, product_id: productId }
        });
        res.json({ code: 0, message: 'ok' });
    } catch (err) {
        next(err);
    }
};

/**
 * POST /api/user/favorites/sync  body: { product_ids: number[] }  登录后合并本地收藏
 */
/**
 * POST /api/user/favorites/clear-all
 */
exports.clearAll = async (req, res, next) => {
    try {
        const userId = req.user.id;
        await UserFavorite.destroy({ where: { user_id: userId } });
        res.json({ code: 0, message: 'ok' });
    } catch (err) {
        next(err);
    }
};

exports.sync = async (req, res, next) => {
    try {
        const userId = req.user.id;
        let ids = req.body.product_ids;
        if (!Array.isArray(ids)) ids = [];
        ids = [...new Set(ids.map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n) && n > 0))].slice(
            0,
            500
        );
        if (ids.length === 0) {
            return res.json({ code: 0, data: { merged: 0 } });
        }
        const products = await Product.findAll({
            where: { id: { [Op.in]: ids }, status: 1 },
            attributes: ['id']
        });
        const valid = new Set(products.map((p) => p.id));
        let merged = 0;
        for (const pid of ids) {
            if (!valid.has(pid)) continue;
            const [, created] = await UserFavorite.findOrCreate({
                where: { user_id: userId, product_id: pid },
                defaults: { user_id: userId, product_id: pid }
            });
            if (created) merged += 1;
        }
        res.json({ code: 0, data: { merged } });
    } catch (err) {
        next(err);
    }
};
