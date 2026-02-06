const express = require('express');
const router = express.Router();
const {
    getBanners,
    getContents,
    getContentBySlug
} = require('../controllers/contentController');

// GET /api/content/banners - 获取轮播图列表
router.get('/banners', getBanners);

// GET /api/content/pages - 获取图文页列表
router.get('/pages', getContents);

// GET /api/content/page/:slug - 获取指定图文页
router.get('/page/:slug', getContentBySlug);

module.exports = router;
