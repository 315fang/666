const {
    ContentBoard,
    ContentBoardItem,
    ContentBoardProduct,
    Product
} = require('../../../models');
const { ensureDefaultBoards } = require('../../../services/BoardService');
const { deleteAssetIfUnreferenced } = require('../../../services/AssetReferenceService');
const { ensureNoTemporaryAssetUrls } = require('../../../utils/assetUrlAudit');

function parseImages(images) {
    if (Array.isArray(images)) return images;
    if (typeof images !== 'string') return [];
    try {
        const parsed = JSON.parse(images);
        return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
        return [];
    }
}

function normalizeScene(scene) {
    const sceneList = ['home', 'activity', 'user'];
    return sceneList.includes(scene) ? scene : 'home';
}

const listBoards = async (req, res) => {
    try {
        await ensureDefaultBoards();
        const { scene, board_key } = req.query;
        const where = {};
        if (scene) where.scene = normalizeScene(scene);
        where.board_key = board_key || 'home.featuredProducts';
        const list = await ContentBoard.findAll({
            where,
            order: [['sort_order', 'DESC'], ['id', 'ASC']]
        });
        res.json({ code: 0, data: list });
    } catch (error) {
        console.error('读取榜单失败:', error);
        res.status(500).json({ code: -1, message: '读取榜单失败' });
    }
};

const getBoardDetail = async (req, res) => {
    try {
        const board = await ContentBoard.findByPk(req.params.id, {
            include: [
                {
                    model: ContentBoardItem,
                    as: 'items',
                    required: false
                },
                {
                    model: ContentBoardProduct,
                    as: 'products',
                    required: false,
                    include: [{ model: Product, as: 'product', required: false }]
                }
            ],
            order: [
                [{ model: ContentBoardItem, as: 'items' }, 'sort_order', 'DESC'],
                [{ model: ContentBoardProduct, as: 'products' }, 'sort_order', 'DESC']
            ]
        });
        if (!board) return res.status(404).json({ code: -1, message: '榜单不存在' });
        res.json({ code: 0, data: board });
    } catch (error) {
        console.error('读取榜单详情失败:', error);
        res.status(500).json({ code: -1, message: '读取榜单详情失败' });
    }
};

const createBoard = async (req, res) => {
    try {
        const body = req.body || {};
        if (!body.board_key || !body.board_name) {
            return res.status(400).json({ code: -1, message: 'board_key 与 board_name 必填' });
        }
        const created = await ContentBoard.create({
            board_key: body.board_key.trim(),
            board_name: body.board_name.trim(),
            scene: normalizeScene(body.scene),
            board_type: body.board_type || 'image',
            description: body.description || '',
            is_active: body.is_active !== false,
            sort_order: Number(body.sort_order || 0)
        });
        res.json({ code: 0, data: created, message: '创建成功' });
    } catch (error) {
        console.error('创建榜单失败:', error);
        res.status(500).json({ code: -1, message: '创建榜单失败' });
    }
};

const updateBoard = async (req, res) => {
    try {
        const board = await ContentBoard.findByPk(req.params.id);
        if (!board) return res.status(404).json({ code: -1, message: '榜单不存在' });
        const body = req.body || {};
        await board.update({
            board_name: body.board_name ?? board.board_name,
            scene: body.scene ? normalizeScene(body.scene) : board.scene,
            board_type: body.board_type || board.board_type,
            description: body.description ?? board.description,
            is_active: body.is_active ?? board.is_active,
            sort_order: body.sort_order === undefined ? board.sort_order : Number(body.sort_order)
        });
        res.json({ code: 0, data: board, message: '更新成功' });
    } catch (error) {
        console.error('更新榜单失败:', error);
        res.status(500).json({ code: -1, message: '更新榜单失败' });
    }
};

const deleteBoard = async (req, res) => {
    try {
        const board = await ContentBoard.findByPk(req.params.id);
        if (!board) return res.status(404).json({ code: -1, message: '榜单不存在' });
        await board.update({ is_active: false });
        res.json({ code: 0, message: '已停用' });
    } catch (error) {
        console.error('删除榜单失败:', error);
        res.status(500).json({ code: -1, message: '删除榜单失败' });
    }
};

const updateBoardSort = async (req, res) => {
    try {
        const orders = Array.isArray(req.body?.orders) ? req.body.orders : [];
        await Promise.all(
            orders.map((item) =>
                ContentBoard.update(
                    { sort_order: Number(item.sort_order || 0) },
                    { where: { id: item.id } }
                )
            )
        );
        res.json({ code: 0, message: '排序更新成功' });
    } catch (error) {
        console.error('榜单排序更新失败:', error);
        res.status(500).json({ code: -1, message: '榜单排序更新失败' });
    }
};

const listBoardItems = async (req, res) => {
    try {
        const items = await ContentBoardItem.findAll({
            where: { board_id: req.params.id },
            order: [['sort_order', 'DESC'], ['id', 'ASC']]
        });
        res.json({ code: 0, data: items });
    } catch (error) {
        console.error('读取榜单图片项失败:', error);
        res.status(500).json({ code: -1, message: '读取榜单图片项失败' });
    }
};

const createBoardItem = async (req, res) => {
    try {
        const body = req.body || {};
        if (body.image_url) {
            ensureNoTemporaryAssetUrls([body.image_url], '榜单图片');
        }
        const row = await ContentBoardItem.create({
            board_id: Number(req.params.id),
            image_url: body.image_url || '',
            link_type: body.link_type || 'none',
            link_value: body.link_value || '',
            extra_data: body.extra_data || null,
            start_time: body.start_time || null,
            end_time: body.end_time || null,
            is_active: body.is_active !== false,
            sort_order: Number(body.sort_order || 0)
        });
        res.json({ code: 0, data: row, message: '新增成功' });
    } catch (error) {
        console.error('新增榜单图片项失败:', error);
        res.status(500).json({ code: -1, message: '新增榜单图片项失败' });
    }
};

const updateBoardItem = async (req, res) => {
    try {
        const row = await ContentBoardItem.findOne({
            where: { id: req.params.itemId, board_id: req.params.id }
        });
        if (!row) return res.status(404).json({ code: -1, message: '榜单图片项不存在' });
        const body = req.body || {};
        if (body.image_url !== undefined && body.image_url) {
            ensureNoTemporaryAssetUrls([body.image_url], '榜单图片');
        }
        await row.update({
            image_url: body.image_url ?? row.image_url,
            link_type: body.link_type || row.link_type,
            link_value: body.link_value ?? row.link_value,
            extra_data: body.extra_data ?? row.extra_data,
            start_time: body.start_time === undefined ? row.start_time : (body.start_time || null),
            end_time: body.end_time === undefined ? row.end_time : (body.end_time || null),
            is_active: body.is_active ?? row.is_active,
            sort_order: body.sort_order === undefined ? row.sort_order : Number(body.sort_order)
        });
        res.json({ code: 0, data: row, message: '更新成功' });
    } catch (error) {
        console.error('更新榜单图片项失败:', error);
        res.status(500).json({ code: -1, message: '更新榜单图片项失败' });
    }
};

const deleteBoardItem = async (req, res) => {
    try {
        const item = await ContentBoardItem.findOne({
            where: { id: req.params.itemId, board_id: req.params.id }
        });
        if (item) {
            const imageUrl = item.image_url;
            await item.destroy();
            if (imageUrl) await deleteAssetIfUnreferenced(imageUrl);
        }
        res.json({ code: 0, message: '删除成功' });
    } catch (error) {
        console.error('删除榜单图片项失败:', error);
        res.status(500).json({ code: -1, message: '删除榜单图片项失败' });
    }
};

const updateBoardItemSort = async (req, res) => {
    try {
        const orders = Array.isArray(req.body?.orders) ? req.body.orders : [];
        await Promise.all(
            orders.map((item) =>
                ContentBoardItem.update(
                    { sort_order: Number(item.sort_order || 0) },
                    { where: { id: item.id, board_id: req.params.id } }
                )
            )
        );
        res.json({ code: 0, message: '排序更新成功' });
    } catch (error) {
        console.error('榜单图片项排序更新失败:', error);
        res.status(500).json({ code: -1, message: '榜单图片项排序更新失败' });
    }
};

const listBoardProducts = async (req, res) => {
    try {
        const rows = await ContentBoardProduct.findAll({
            where: { board_id: req.params.id },
            include: [{ model: Product, as: 'product', required: false }],
            order: [['sort_order', 'DESC'], ['id', 'ASC']]
        });
        const data = rows.map((row) => {
            const plain = row.get({ plain: true });
            const imgs = parseImages(plain.product?.images);
            return {
                ...plain,
                product: plain.product ? { ...plain.product, images: imgs, cover_image: imgs[0] || '' } : null
            };
        });
        res.json({ code: 0, data });
    } catch (error) {
        console.error('读取上榜商品失败:', error);
        res.status(500).json({ code: -1, message: '读取上榜商品失败' });
    }
};

const addBoardProducts = async (req, res) => {
    try {
        const productIds = Array.isArray(req.body?.product_ids)
            ? req.body.product_ids.map((id) => Number(id)).filter(Boolean)
            : [];
        if (!productIds.length) {
            return res.status(400).json({ code: -1, message: 'product_ids 不能为空' });
        }
        const count = await ContentBoardProduct.count({ where: { board_id: req.params.id } });
        let sort = count + productIds.length;
        for (const productId of productIds) {
            await ContentBoardProduct.findOrCreate({
                where: { board_id: req.params.id, product_id: productId },
                defaults: {
                    board_id: Number(req.params.id),
                    product_id: productId,
                    sort_order: sort--,
                    is_active: true
                }
            });
        }
        res.json({ code: 0, message: '添加成功' });
    } catch (error) {
        console.error('添加上榜商品失败:', error);
        res.status(500).json({ code: -1, message: '添加上榜商品失败' });
    }
};

const updateBoardProduct = async (req, res) => {
    try {
        const row = await ContentBoardProduct.findOne({
            where: { id: req.params.relationId, board_id: req.params.id }
        });
        if (!row) return res.status(404).json({ code: -1, message: '记录不存在' });
        await row.update({
            is_active: req.body?.is_active ?? row.is_active,
            sort_order: req.body?.sort_order === undefined ? row.sort_order : Number(req.body.sort_order)
        });
        res.json({ code: 0, data: row, message: '更新成功' });
    } catch (error) {
        console.error('更新上榜商品失败:', error);
        res.status(500).json({ code: -1, message: '更新上榜商品失败' });
    }
};

const deleteBoardProduct = async (req, res) => {
    try {
        await ContentBoardProduct.destroy({
            where: { id: req.params.relationId, board_id: req.params.id }
        });
        res.json({ code: 0, message: '删除成功' });
    } catch (error) {
        console.error('删除上榜商品失败:', error);
        res.status(500).json({ code: -1, message: '删除上榜商品失败' });
    }
};

const updateBoardProductSort = async (req, res) => {
    try {
        const orders = Array.isArray(req.body?.orders) ? req.body.orders : [];
        await Promise.all(
            orders.map((item) =>
                ContentBoardProduct.update(
                    { sort_order: Number(item.sort_order || 0) },
                    { where: { id: item.id, board_id: req.params.id } }
                )
            )
        );
        res.json({ code: 0, message: '排序更新成功' });
    } catch (error) {
        console.error('上榜商品排序更新失败:', error);
        res.status(500).json({ code: -1, message: '上榜商品排序更新失败' });
    }
};

module.exports = {
    listBoards,
    getBoardDetail,
    createBoard,
    updateBoard,
    deleteBoard,
    updateBoardSort,
    listBoardItems,
    createBoardItem,
    updateBoardItem,
    deleteBoardItem,
    updateBoardItemSort,
    listBoardProducts,
    addBoardProducts,
    updateBoardProduct,
    deleteBoardProduct,
    updateBoardProductSort
};
