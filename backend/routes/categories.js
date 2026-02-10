const express = require('express');
const router = express.Router();
const {
    getCategories,
    getCategoryTree,
    getCategoryById
} = require('../controllers/categoryController');

// GET /api/categories - 获取类目列表
router.get('/', getCategories);

// GET /api/categories/tree - 获取树形类目结构
router.get('/tree', getCategoryTree);

// GET /api/categories/:id - 获取单个类目详情
router.get('/:id', getCategoryById);

module.exports = router;
