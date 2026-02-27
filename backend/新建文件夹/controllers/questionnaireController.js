const { User, Questionnaire, QuestionnaireSubmission } = require('../models');
const { sendNotification } = require('../models/notificationUtil');
const { checkRoleUpgrade } = require('../utils/commission');
const { Op } = require('sequelize');

// ===========================
// 用户端接口
// ===========================

/**
 * 获取当前启用的问卷模板（供小程序前端渲染）
 * GET /api/questionnaire/active
 */
async function getActiveQuestionnaire(req, res, next) {
    try {
        const questionnaire = await Questionnaire.findOne({
            where: { is_active: true },
            attributes: ['id', 'title', 'description', 'fields', 'version']
        });

        if (!questionnaire) {
            return res.status(404).json({ code: -1, message: '暂无启用的问卷' });
        }

        res.json({
            code: 0,
            data: questionnaire
        });
    } catch (error) {
        next(error);
    }
}

/**
 * 提交问卷并自动绑定团队
 * POST /api/questionnaire/submit
 * body: { questionnaire_id, inviter_id, answers }
 */
async function submitQuestionnaire(req, res, next) {
    try {
        const user = req.user;
        const { questionnaire_id, inviter_id, answers } = req.body;

        // 1. 验证问卷存在且启用
        const questionnaire = await Questionnaire.findByPk(questionnaire_id);
        if (!questionnaire || !questionnaire.is_active) {
            return res.status(400).json({ code: -1, message: '问卷不存在或已停用' });
        }

        // 2. 验证答案中的必填项
        const fields = questionnaire.fields;
        for (const field of fields) {
            if (field.required && (!answers || !answers[field.key] || String(answers[field.key]).trim() === '')) {
                return res.status(400).json({
                    code: -1,
                    message: `请填写${field.label}`
                });
            }
        }

        // 3. 验证邀请人存在且有团队资格
        const inviter = await User.findByPk(inviter_id);
        if (!inviter) {
            return res.status(404).json({ code: -1, message: '邀请人不存在' });
        }
        // 邀请人必须有团队（有上级或角色>=1）
        if (!inviter.parent_id && inviter.role_level < 1) {
            return res.status(400).json({ code: -1, message: '邀请人暂无团队资格' });
        }

        // 4. 防止自己填自己的问卷
        if (user.id === inviter.id) {
            return res.status(400).json({ code: -1, message: '不能填写自己的邀请问卷' });
        }

        // 5. 检查是否重复提交
        const existing = await QuestionnaireSubmission.findOne({
            where: {
                inviter_id: inviter.id,
                submitter_id: user.id
            }
        });
        if (existing) {
            return res.status(400).json({ code: -1, message: '您已填写过该邀请问卷' });
        }

        // 6. 创建提交记录
        let boundTeam = false;
        const submission = await QuestionnaireSubmission.create({
            questionnaire_id: questionnaire.id,
            questionnaire_version: questionnaire.version,
            inviter_id: inviter.id,
            submitter_id: user.id,
            submitter_openid: user.openid,
            answers: answers,
            status: 'completed',
            bound_team: false
        });

        // 7. 尝试绑定团队关系（如果用户还没有上级）
        if (!user.parent_id) {
            // 递归检查循环绑定
            let checkId = inviter.parent_id;
            let depth = 0;
            let hasCycle = false;
            while (checkId && depth < 50) {
                if (checkId === user.id) {
                    hasCycle = true;
                    break;
                }
                const ancestor = await User.findByPk(checkId, { attributes: ['id', 'parent_id'] });
                if (!ancestor) break;
                checkId = ancestor.parent_id;
                depth++;
            }

            if (!hasCycle) {
                // 绑定上下级
                user.parent_id = inviter.id;
                user.parent_openid = inviter.openid;
                user.agent_id = inviter.role_level >= 3 ? inviter.id : inviter.agent_id;
                user.joined_team_at = new Date();
                await user.save();

                // 更新上级推荐人数
                await inviter.increment('referee_count');
                await inviter.reload();

                // 检查上级是否应该升级
                const newRole = checkRoleUpgrade(inviter);
                if (newRole) {
                    await inviter.update({ role_level: newRole });
                }

                boundTeam = true;
                await submission.update({ bound_team: true });

                // 通知邀请人
                await sendNotification(
                    inviter.id,
                    '新成员加入',
                    `${user.nickname || '新用户'} 通过您的邀请问卷加入了团队！`,
                    'commission',
                    String(user.id)
                );

                // 通知填写者
                await sendNotification(
                    user.id,
                    '加入团队成功',
                    `您已成功加入 ${inviter.nickname || '邀请人'} 的团队。`,
                    'system',
                    String(inviter.id)
                );
            }
        }

        res.json({
            code: 0,
            data: {
                submission_id: submission.id,
                bound_team: boundTeam,
                already_has_team: !!user.parent_id && !boundTeam
            },
            message: boundTeam ? '提交成功，已加入团队' : (user.parent_id ? '问卷已提交（您已在其他团队中）' : '问卷已提交')
        });
    } catch (error) {
        next(error);
    }
}

/**
 * 检查用户是否有分享问卷的资格
 * GET /api/questionnaire/share-eligibility
 */
async function checkShareEligibility(req, res, next) {
    try {
        const user = req.user;
        // 有上级 或 角色>=1 才能分享
        const eligible = !!(user.parent_id || user.role_level >= 1);

        res.json({
            code: 0,
            data: {
                eligible,
                user_id: user.id,
                message: eligible ? '您可以分享邀请问卷' : '您尚未加入任何团队，暂时无法分享邀请问卷'
            }
        });
    } catch (error) {
        next(error);
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
        const questionnaires = await Questionnaire.findAll({
            order: [['created_at', 'DESC']],
            include: [{
                model: QuestionnaireSubmission,
                as: 'submissions',
                attributes: ['id']
            }]
        });

        const list = questionnaires.map(q => ({
            ...q.toJSON(),
            submission_count: q.submissions ? q.submissions.length : 0,
            submissions: undefined // 不返回完整列表
        }));

        res.json({ code: 0, data: list });
    } catch (error) {
        next(error);
    }
}

/**
 * 创建/更新问卷模板
 * POST /admin/api/questionnaires
 * PUT  /admin/api/questionnaires/:id
 */
async function adminSaveQuestionnaire(req, res, next) {
    try {
        const { id } = req.params || {};
        const { title, description, fields, is_active } = req.body;

        if (!title) {
            return res.status(400).json({ code: -1, message: '问卷标题不能为空' });
        }
        if (!fields || !Array.isArray(fields) || fields.length === 0) {
            return res.status(400).json({ code: -1, message: '至少需要一个问卷字段' });
        }

        // 验证字段格式
        for (const f of fields) {
            if (!f.key || !f.label || !f.type) {
                return res.status(400).json({ code: -1, message: `字段 "${f.label || f.key || '未知'}" 缺少必要属性（key, label, type）` });
            }
        }

        let questionnaire;

        if (id) {
            // 更新
            questionnaire = await Questionnaire.findByPk(id);
            if (!questionnaire) {
                return res.status(404).json({ code: -1, message: '问卷不存在' });
            }
            await questionnaire.update({
                title,
                description: description || '',
                fields,
                is_active: is_active !== undefined ? is_active : questionnaire.is_active,
                version: questionnaire.version + 1
            });
        } else {
            // 创建
            questionnaire = await Questionnaire.create({
                title,
                description: description || '',
                fields,
                is_active: is_active !== undefined ? is_active : true,
                version: 1
            });
        }

        // 如果设为启用，则停用其他问卷
        if (questionnaire.is_active) {
            await Questionnaire.update(
                { is_active: false },
                { where: { id: { [Op.ne]: questionnaire.id } } }
            );
        }

        res.json({
            code: 0,
            data: questionnaire,
            message: id ? '更新成功' : '创建成功'
        });
    } catch (error) {
        next(error);
    }
}

/**
 * 删除问卷模板
 * DELETE /admin/api/questionnaires/:id
 */
async function adminDeleteQuestionnaire(req, res, next) {
    try {
        const { id } = req.params;
        const questionnaire = await Questionnaire.findByPk(id);
        if (!questionnaire) {
            return res.status(404).json({ code: -1, message: '问卷不存在' });
        }

        // 检查是否有提交记录
        const count = await QuestionnaireSubmission.count({ where: { questionnaire_id: id } });
        if (count > 0) {
            return res.status(400).json({ code: -1, message: `该问卷已有 ${count} 条提交记录，不能删除。建议停用。` });
        }

        await questionnaire.destroy();
        res.json({ code: 0, message: '删除成功' });
    } catch (error) {
        next(error);
    }
}

/**
 * 设为启用
 * PUT /admin/api/questionnaires/:id/activate
 */
async function adminActivateQuestionnaire(req, res, next) {
    try {
        const { id } = req.params;
        const questionnaire = await Questionnaire.findByPk(id);
        if (!questionnaire) {
            return res.status(404).json({ code: -1, message: '问卷不存在' });
        }

        // 停用所有，然后启用当前
        await Questionnaire.update({ is_active: false }, { where: {} });
        await questionnaire.update({ is_active: true });

        res.json({ code: 0, message: '已设为当前启用问卷' });
    } catch (error) {
        next(error);
    }
}

/**
 * 获取所有问卷提交记录
 * GET /admin/api/questionnaire-submissions
 */
async function adminListSubmissions(req, res, next) {
    try {
        const { page = 1, limit = 20, inviter_id, questionnaire_id, keyword } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        const where = {};
        if (inviter_id) where.inviter_id = inviter_id;
        if (questionnaire_id) where.questionnaire_id = questionnaire_id;

        const { count, rows } = await QuestionnaireSubmission.findAndCountAll({
            where,
            include: [
                {
                    model: User,
                    as: 'inviter',
                    attributes: ['id', 'nickname', 'avatar_url']
                },
                {
                    model: User,
                    as: 'submitter',
                    attributes: ['id', 'nickname', 'avatar_url', 'phone']
                },
                {
                    model: Questionnaire,
                    as: 'questionnaire',
                    attributes: ['id', 'title', 'version']
                }
            ],
            order: [['created_at', 'DESC']],
            offset,
            limit: parseInt(limit)
        });

        res.json({
            code: 0,
            data: {
                list: rows,
                pagination: {
                    total: count,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    totalPages: Math.ceil(count / parseInt(limit))
                }
            }
        });
    } catch (error) {
        next(error);
    }
}

/**
 * 获取单条提交详情
 * GET /admin/api/questionnaire-submissions/:id
 */
async function adminGetSubmissionDetail(req, res, next) {
    try {
        const { id } = req.params;
        const submission = await QuestionnaireSubmission.findByPk(id, {
            include: [
                { model: User, as: 'inviter', attributes: ['id', 'nickname', 'avatar_url'] },
                { model: User, as: 'submitter', attributes: ['id', 'nickname', 'avatar_url'] },
                { model: Questionnaire, as: 'questionnaire' }
            ]
        });

        if (!submission) {
            return res.status(404).json({ code: -1, message: '提交记录不存在' });
        }

        res.json({ code: 0, data: submission });
    } catch (error) {
        next(error);
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
