const { Material, MaterialGroup } = require('../../../models');
const { Op } = require('sequelize');

// ==================== 素材分组管理 ====================

// 获取所有分组（含每组素材数量）
const getGroups = async (req, res) => {
    try {
        const groups = await MaterialGroup.findAll({
            where: { status: 1 },
            order: [['sort_order', 'DESC'], ['created_at', 'ASC']],
            include: [{
                model: Material,
                as: 'materials',
                attributes: ['id'],
                where: { status: 1 },
                required: false
            }]
        });

        const result = groups.map(g => ({
            id: g.id,
            name: g.name,
            description: g.description,
            cover_url: g.cover_url,
            sort_order: g.sort_order,
            count: g.materials?.length || 0,
            // "临时素材"为系统内置分组，前端据此禁止删除/重命名
            is_system: g.name === '临时素材'
        }));

        // 在最前面插入"全部素材"虚拟分组
        const totalCount = await Material.count({ where: { status: 1 } });
        result.unshift({ id: null, name: '全部素材', count: totalCount, _virtual: true });

        res.json({ code: 0, data: result });
    } catch (error) {
        console.error('获取素材分组失败:', error);
        res.status(500).json({ code: -1, message: '获取分组失败' });
    }
};

// 创建分组
const createGroup = async (req, res) => {
    try {
        const { name, description, cover_url, sort_order } = req.body;
        if (!name) return res.status(400).json({ code: -1, message: '分组名称必填' });

        // 检查同名
        const exists = await MaterialGroup.findOne({ where: { name } });
        if (exists) return res.status(400).json({ code: -1, message: '已有同名分组' });

        const group = await MaterialGroup.create({ name, description, cover_url, sort_order: sort_order || 0, status: 1 });
        res.json({ code: 0, data: group, message: '创建成功' });
    } catch (error) {
        console.error('创建分组失败:', error);
        res.status(500).json({ code: -1, message: '创建失败' });
    }
};

// 更新分组
const updateGroup = async (req, res) => {
    try {
        const { id } = req.params;
        const group = await MaterialGroup.findByPk(id);
        if (!group) return res.status(404).json({ code: -1, message: '分组不存在' });

        // 系统内置分组不允许重命名
        if (group.name === '临时素材' && req.body.name && req.body.name !== '临时素材') {
            return res.status(403).json({ code: -1, message: '系统内置分组名称不可修改' });
        }

        await group.update(req.body);
        res.json({ code: 0, data: group, message: '更新成功' });
    } catch (error) {
        console.error('更新分组失败:', error);
        res.status(500).json({ code: -1, message: '更新失败' });
    }
};

// 删除分组（组内素材移到未分组）
const deleteGroup = async (req, res) => {
    try {
        const { id } = req.params;
        const group = await MaterialGroup.findByPk(id);
        if (!group) return res.status(404).json({ code: -1, message: '分组不存在' });

        // 系统内置分组不允许删除
        if (group.name === '临时素材') {
            return res.status(403).json({ code: -1, message: '系统内置分组不可删除' });
        }

        // 组内素材移到未分组
        await Material.update({ group_id: null }, { where: { group_id: id } });
        await group.destroy();

        res.json({ code: 0, message: '已删除，组内素材已移至未分组' });
    } catch (error) {
        console.error('删除分组失败:', error);
        res.status(500).json({ code: -1, message: '删除失败' });
    }
};

// 批量移动素材到指定分组
const moveMaterials = async (req, res) => {
    try {
        const { ids, group_id } = req.body; // group_id 为 null 表示移到未分组
        if (!ids || !Array.isArray(ids)) return res.status(400).json({ code: -1, message: 'ids 必须为数组' });

        // 如果指定了 group_id，检查它确实存在
        if (group_id) {
            const group = await MaterialGroup.findByPk(group_id);
            if (!group) return res.status(404).json({ code: -1, message: '目标分组不存在' });
        }

        const [affected] = await Material.update({ group_id: group_id || null }, { where: { id: { [Op.in]: ids } } });
        res.json({ code: 0, message: `已移动 ${affected} 个素材`, data: { affected } });
    } catch (error) {
        console.error('移动素材失败:', error);
        res.status(500).json({ code: -1, message: '移动失败' });
    }
};

// ==================== 素材管理 ====================

// 获取素材列表（支持按分组过滤）
const getMaterials = async (req, res) => {
    try {
        const { type, group_id, keyword, page = 1, limit = 24 } = req.query;
        const where = { status: 1 };

        if (type) where.type = type;
        // group_id='none' 表示查未分组素材
        if (group_id === 'none') {
            where.group_id = null;
        } else if (group_id) {
            where.group_id = parseInt(group_id);
        }
        if (keyword) {
            where.title = { [Op.like]: `%${keyword}%` };
        }

        const offset = (parseInt(page) - 1) * parseInt(limit);

        const { count, rows } = await Material.findAndCountAll({
            where,
            include: [{
                model: MaterialGroup,
                as: 'group',
                attributes: ['id', 'name'],
                required: false
            }],
            order: [['sort_order', 'DESC'], ['created_at', 'DESC']],
            offset,
            limit: parseInt(limit)
        });

        res.json({
            code: 0,
            data: {
                list: rows,
                pagination: { total: count, page: parseInt(page), limit: parseInt(limit) }
            }
        });
    } catch (error) {
        console.error('获取素材列表失败:', error);
        res.status(500).json({ code: -1, message: '获取素材列表失败' });
    }
};

// 获取素材详情
const getMaterialById = async (req, res) => {
    try {
        const { id } = req.params;
        const material = await Material.findByPk(id, {
            include: [{ model: MaterialGroup, as: 'group', attributes: ['id', 'name'], required: false }]
        });
        if (!material) return res.status(404).json({ code: -1, message: '素材不存在' });
        res.json({ code: 0, data: material });
    } catch (error) {
        res.status(500).json({ code: -1, message: '获取素材详情失败' });
    }
};

// 创建素材
const createMaterial = async (req, res) => {
    try {
        const { type, title, description, url, thumbnail_url, product_id, group_id, category, tags, sort_order } = req.body;
        if (!type || !title) return res.status(400).json({ code: -1, message: '类型和标题必填' });

        const material = await Material.create({
            type, title, description, url, thumbnail_url,
            product_id, group_id: group_id || null, category, tags,
            sort_order: sort_order || 0, status: 1
        });
        res.json({ code: 0, data: material, message: '创建成功' });
    } catch (error) {
        console.error('创建素材失败:', error);
        res.status(500).json({ code: -1, message: '创建素材失败' });
    }
};

// 更新素材
const updateMaterial = async (req, res) => {
    try {
        const { id } = req.params;
        const material = await Material.findByPk(id);
        if (!material) return res.status(404).json({ code: -1, message: '素材不存在' });

        await material.update(req.body);
        res.json({ code: 0, data: material, message: '更新成功' });
    } catch (error) {
        console.error('更新素材失败:', error);
        res.status(500).json({ code: -1, message: '更新素材失败' });
    }
};

// 删除素材
const deleteMaterial = async (req, res) => {
    try {
        const { id } = req.params;
        const material = await Material.findByPk(id);
        if (!material) return res.status(404).json({ code: -1, message: '素材不存在' });
        await material.destroy();
        res.json({ code: 0, message: '删除成功' });
    } catch (error) {
        console.error('删除素材失败:', error);
        res.status(500).json({ code: -1, message: '删除素材失败' });
    }
};

module.exports = {
    // 分组
    getGroups,
    createGroup,
    updateGroup,
    deleteGroup,
    moveMaterials,
    // 素材
    getMaterials,
    getMaterialById,
    createMaterial,
    updateMaterial,
    deleteMaterial
};
