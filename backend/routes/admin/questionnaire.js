const express = require('express');
const router = express.Router();
const { adminAuth } = require('../../middleware/adminAuth');
const {
    adminListQuestionnaires,
    adminSaveQuestionnaire,
    adminDeleteQuestionnaire,
    adminActivateQuestionnaire,
    adminListSubmissions,
    adminGetSubmissionDetail
} = require('../../controllers/questionnaireController');

// 所有管理端问卷接口均需管理员登录
router.use(adminAuth);

// 问卷模板管理
router.get('/questionnaires', adminListQuestionnaires);
router.post('/questionnaires', adminSaveQuestionnaire);
router.put('/questionnaires/:id', adminSaveQuestionnaire);
router.delete('/questionnaires/:id', adminDeleteQuestionnaire);
router.put('/questionnaires/:id/activate', adminActivateQuestionnaire);

// 问卷提交记录
router.get('/questionnaire-submissions', adminListSubmissions);
router.get('/questionnaire-submissions/:id', adminGetSubmissionDetail);

module.exports = router;
