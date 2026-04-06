const { Op } = require('sequelize');
const { ContentBoard, ContentBoardItem, ContentBoardProduct, Product } = require('../models');
const { isMallVisibleProductRow } = require('../utils/productMallVisibility');

const DEFAULT_BOARDS = [
    {
        board_key: 'home.featuredProducts',
        board_name: '首页精选商品榜',
        scene: 'home',
        board_type: 'product',
        sort_order: 100
    }
];

function safeParseImages(images) {
    if (Array.isArray(images)) return images;
    if (typeof images !== 'string') return [];
    try {
        const parsed = JSON.parse(images);
        return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
        return [];
    }
}

function isInTimeWindow(item, nowTs) {
    const startTs = item.start_time ? new Date(item.start_time).getTime() : null;
    const endTs = item.end_time ? new Date(item.end_time).getTime() : null;
    if (startTs && nowTs < startTs) return false;
    if (endTs && nowTs > endTs) return false;
    return true;
}

async function ensureDefaultBoards() {
    for (const item of DEFAULT_BOARDS) {
        await ContentBoard.findOrCreate({
            where: { board_key: item.board_key },
            defaults: { ...item, description: '', is_active: true }
        });
    }
}

async function getBoardWithRelations(where = {}) {
    return ContentBoard.findAll({
        where,
        include: [
            { model: ContentBoardItem, as: 'items', required: false },
            {
                model: ContentBoardProduct,
                as: 'products',
                required: false,
                include: [
                    {
                        model: Product,
                        as: 'product',
                        required: false,
                        attributes: ['id', 'name', 'images', 'retail_price', 'market_price', 'status', 'stock', 'visible_in_mall']
                    }
                ]
            }
        ],
        order: [
            ['sort_order', 'DESC'],
            ['id', 'ASC'],
            [{ model: ContentBoardItem, as: 'items' }, 'sort_order', 'DESC'],
            [{ model: ContentBoardItem, as: 'items' }, 'id', 'ASC'],
            [{ model: ContentBoardProduct, as: 'products' }, 'sort_order', 'DESC'],
            [{ model: ContentBoardProduct, as: 'products' }, 'id', 'ASC']
        ]
    });
}

function toPublicBoard(board) {
    const plain = board.get ? board.get({ plain: true }) : board;
    const nowTs = Date.now();
    const items = (plain.items || [])
        .filter((item) => item.is_active !== false && isInTimeWindow(item, nowTs))
        .map((item) => ({
            id: item.id,
            image_url: item.image_url || '',
            link_type: item.link_type || 'none',
            link_value: item.link_value || '',
            start_time: item.start_time || null,
            end_time: item.end_time || null,
            extra_data: item.extra_data || {}
        }));

    const products = (plain.products || [])
        .filter(
            (item) =>
                item.is_active !== false &&
                item.product &&
                item.product.status === 1 &&
                isMallVisibleProductRow(item.product)
        )
        .map((item) => {
            const images = safeParseImages(item.product.images);
            return {
                id: item.product.id,
                name: item.product.name,
                image_url: images[0] || '',
                images,
                retail_price: item.product.retail_price,
                market_price: item.product.market_price,
                stock: item.product.stock
            };
        });

    return {
        id: plain.id,
        board_key: plain.board_key,
        board_name: plain.board_name,
        scene: plain.scene,
        board_type: plain.board_type,
        items,
        products
    };
}

async function getPublicBoards({ scene, keys } = {}) {
    const where = { is_active: true };
    if (scene) where.scene = scene;
    if (Array.isArray(keys) && keys.length > 0) {
        where.board_key = { [Op.in]: keys };
    }
    const boards = await getBoardWithRelations(where);
    return boards.map(toPublicBoard);
}

async function getPublicBoardMap({ scene, keys } = {}) {
    const list = await getPublicBoards({ scene, keys });
    const map = {};
    list.forEach((item) => {
        map[item.board_key] = item;
    });
    return map;
}

async function migrateLegacyDataToBoards() {
    // 本期只启用首页精选商品榜：仅确保榜单存在，不迁移其它图文位历史数据
    await ensureDefaultBoards();
}

module.exports = {
    DEFAULT_BOARDS,
    ensureDefaultBoards,
    getPublicBoards,
    getPublicBoardMap,
    migrateLegacyDataToBoards
};
