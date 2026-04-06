const questionnaireService = require('../services/QuestionnaireService');

// ===========================
// 用户端接口
// ===========================

/**
 * 获取当前启用的问卷模板（供小程序前端渲染）
 * GET /api/questionnaire/active
 */
async function getActiveQuestionnaire(req, res, next) {
    try {
        const data = await questionnaireService.getActiveQuestionnaire();
        if (!data) {
            return res.status(404).json({ code: -1, message: '暂无启用的问卷' });
        }
        res.json({ code: 0, data });
    } catch (err) {
        next(err);
    }
}

/**
 * 提交问卷并自动绑定团队
 * POST /api/questionnaire/submit
 * body: { questionnaire_id, inviter_id, answers }
 */
async function submitQuestionnaire(req, res, next) {
    try {
        const data = await questionnaireService.submitQuestionnaire(req.body, req.user.id, req.user);
        res.json({
            code: 0,
            data: {
                submission_id: data.submission_id,
                bound_team: data.bound_team,
                already_has_team: data.already_has_team
            },
            message: data.message
        });
    } catch (err) {
        if (err.statusCode) {
            return res.status(err.statusCode).json({ code: -1, message: err.message });
        }
        next(err);
    }
}

/**
 * 检查用户是否有分享问卷的资格
 * GET /api/questionnaire/share-eligibility
 */
async function checkShareEligibility(req, res, next) {
    try {
        const user = req.user;
        const eligible = !!(user.parent_id || user.role_level >= 1);
        res.json({
            code: 0,
            data: {
                eligible,
                user_id: user.id,
                message: eligible ? '您可以分享邀请问卷' : '您尚未加入任何团队，暂时无法分享邀请问卷'
            }
        });
    } catch (err) {
        next(err);
    }
}

// ===========================
// 管理后台接口
// ===========================

/**
 * 获取所有问卷模板列表
 * GET /admin/api/questionnaires
 */
async function adminListQuestionnaires(req, res, next) {
    try {
        const data = await questionnaireService.adminListQuestionnaires();
        res.json({ code: 0, data });
    } catch (err) {
        next(err);
    }
}

/**
 * 创建/更新问卷模板
 * POST /admin/api/questionnaires
 * PUT  /admin/api/questionnaires/:id
 */
async function adminSaveQuestionnaire(req, res, next) {
    try {
        const data = await questionnaireService.adminSaveQuestionnaire(req.body, req.params || {});
        res.json({
            code: 0,
            data,
            message: req.params && req.params.id ? '更新成功' : '创建成功'
        });
    } catch (err) {
        if (err.statusCode) {
            return res.status(err.statusCode).json({ code: -1, message: err.message });
        }
        next(err);
    }
}

/**
 * 删除问卷模板
 * DELETE /admin/api/questionnaires/:id
 */
async function adminDeleteQuestionnaire(req, res, next) {
    try {
        await questionnaireService.adminDeleteQuestionnaire(req.params.id);
        res.json({ code: 0, message: '删除成功' });
    } catch (err) {
        if (err.statusCode) {
            return res.status(err.statusCode).json({ code: -1, message: err.message });
        }
        next(err);
    }
}

/**
 * 设为启用
 * PUT /admin/api/questionnaires/:id/activate
 */
async function adminActivateQuestionnaire(req, res, next) {
    try {
        const message = await questionnaireService.adminActivateQuestionnaire(req.params.id);
        res.json({ code: 0, message });
    } catch (err) {
        if (err.statusCode) {
            return res.status(err.statusCode).json({ code: -1, message: err.message });
        }
        next(err);
    }
}

/**
 * 获取所有问卷提交记录
 * GET /admin/api/questionnaire-submissions
 */
async function adminListSubmissions(req, res, next) {
    try {
        const data = await questionnaireService.adminListSubmissions(req.query);
        res.json({ code: 0, data });
    } catch (err) {
        next(err);
    }
}

/**
 * 获取单条提交详情
 * GET /admin/api/questionnaire-submissions/:id
 */
async function adminGetSubmissionDetail(req, res, next) {
    try {
        const data = await questionnaireService.adminGetSubmissionDetail(req.params.id);
        res.json({ code: 0, data });
    } catch (err) {
        if (err.statusCode) {
            return res.status(err.statusCode).json({ code: -1, message: err.message });
        }
        next(err);
    }
}

module.exports = {
    // 用户端
    getActiveQuestionnaire,
    submitQuestionnaire,
    checkShareEligibility,
    // 管理后台
    adminListQuestionnaires,
    adminSaveQuestionnaire,
    adminDeleteQuestionnaire,
    adminActivateQuestionnaire,
    adminListSubmissions,
    adminGetSubmissionDetail
};
