const express = require('express');
const router = express.Router();
const pageContentController = require('../controllers/pageContentController');

router.get('/brand-news', pageContentController.getBrandNewsDetail);
router.get('/', pageContentController.getPageContent);
router.get('/:pageKey', pageContentController.getPageContent);

module.exports = router;
