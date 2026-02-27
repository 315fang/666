const express = require('express');
const router = express.Router();
const {
    getActiveQuestionnaire,
    submitQuestionnaire,
    checkShareEligibility
} = require('../controllers/questionnaireController');
const { authenticate } = require('../middleware/auth');

// GET /api/questionnaire/active - 获取当前启用的问卷模板（无需登录也可查看）
router.get('/questionnaire/active', getActiveQuestionnaire);

// POST /api/questionnaire/submit - 提交问卷（需要登录）
router.post('/questionnaire/submit', authenticate, submitQuestionnaire);

// GET /api/questionnaire/share-eligibility - 检查分享资格
router.get('/questionnaire/share-eligibility', authenticate, checkShareEligibility);

module.exports = router;
