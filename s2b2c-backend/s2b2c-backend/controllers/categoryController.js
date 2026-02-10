const { Category, Product } = require('../models');
const { Op } = require('sequelize');

// 获取类目列表
const getCategories = async (req, res) => {
    try {
        const { parent_id, status = 1 } = req.query;

        const where = { status };
        if (parent_id !== undefined) {
            where.parent_id = parent_id === 'null' ? null : parseInt(parent_id);
        }

        const categories = await Category.findAll({
            where,
            order: [['sort_order', 'DESC'], ['id', 'ASC']],
            include: [{
                model: Category,
                as: 'children',
                where: { status: 1 },
                required: false,
                order: [['sort_order', 'DESC']]
            }]
        });

        res.json({
            code: 0,
            data: categories
        });
    } catch (error) {
        console.error('获取类目列表失败:', error);
        res.status(500).json({ code: -1, message: '获取类目列表失败' });
    }
};

// 获取树形类目结构
const getCategoryTree = async (req, res) => {
    try {
        // 获取所有启用的类目
        const allCategories = await Category.findAll({
            where: { status: 1 },
            order: [['sort_order', 'DESC'], ['id', 'ASC']],
            raw: true
        });

        // 构建树形结构
        const buildTree = (items, parentId = null) => {
            return items
                .filter(item => item.parent_id === parentId)
                .map(item => ({
                    ...item,
                    children: buildTree(items, item.id)
                }));
        };

        const tree = buildTree(allCategories);

        res.json({
            code: 0,
            data: tree
        });
    } catch (error) {
        console.error('获取类目树失败:', error);
        res.status(500).json({ code: -1, message: '获取类目树失败' });
    }
};

// 获取单个类目详情
const getCategoryById = async (req, res) => {
    try {
        const { id } = req.params;

        const category = await Category.findByPk(id, {
            include: [
                {
                    model: Category,
                    as: 'parent'
                },
                {
                    model: Category,
                    as: 'children',
                    where: { status: 1 },
                    required: false
                },
                {
                    model: Product,
                    as: 'products',
                    where: { status: 1 },
                    required: false,
                    limit: 10
                }
            ]
        });

        if (!category) {
            return res.status(404).json({ code: -1, message: '类目不存在' });
        }

        res.json({
            code: 0,
            data: category
        });
    } catch (error) {
        console.error('获取类目详情失败:', error);
        res.status(500).json({ code: -1, message: '获取类目详情失败' });
    }
};

module.exports = {
    getCategories,
    getCategoryTree,
    getCategoryById
};
