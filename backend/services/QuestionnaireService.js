const { User, Questionnaire, QuestionnaireSubmission } = require('../models');
const { sendNotification } = require('../models/notificationUtil');
const { checkRoleUpgrade } = require('../utils/commission');
const { Op } = require('sequelize');
const { logError } = require('../utils/logger');

/**
 * 获取当前启用的问卷模板
 * @returns {Promise<Object|null>} 问卷对象或 null
 */
async function getActiveQuestionnaire() {
    return await Questionnaire.findOne({
        where: { is_active: true },
        attributes: ['id', 'title', 'description', 'fields', 'version']
    });
}

/**
 * 提交问卷并自动绑定团队
 * @param {Object} body - 请求体 { questionnaire_id, inviter_id, answers }
 * @param {number} userId - 当前用户 ID
 * @param {Object} currentUser - 当前用户实例（含 parent_id, role_level, openid, nickname）
 * @returns {Promise<Object>} { submission_id, bound_team, already_has_team }
 */
async function submitQuestionnaire(body, userId, currentUser) {
    const { questionnaire_id, inviter_id, answers } = body;
    const user = currentUser;

    // 1. 验证问卷存在且启用
    const questionnaire = await Questionnaire.findByPk(questionnaire_id);
    if (!questionnaire || !questionnaire.is_active) {
        const err = new Error('问卷不存在或已停用');
        err.statusCode = 400;
        throw err;
    }

    // 2. 验证答案中的必填项
    const fields = questionnaire.fields;
    for (const field of fields) {
        if (field.required && (!answers || !answers[field.key] || String(answers[field.key]).trim() === '')) {
            const err = new Error(`请填写${field.label}`);
            err.statusCode = 400;
            throw err;
        }
    }

    // 3. 验证邀请人存在且有团队资格
    const inviter = await User.findByPk(inviter_id);
    if (!inviter) {
        const err = new Error('邀请人不存在');
        err.statusCode = 404;
        throw err;
    }
    if (!inviter.parent_id && inviter.role_level < 1) {
        const err = new Error('邀请人暂无团队资格');
        err.statusCode = 400;
        throw err;
    }

    // 4. 防止自己填自己的问卷
    if (user.id === inviter.id) {
        const err = new Error('不能填写自己的邀请问卷');
        err.statusCode = 400;
        throw err;
    }

    // 5. 检查是否重复提交
    const existing = await QuestionnaireSubmission.findOne({
        where: {
            inviter_id: inviter.id,
            submitter_id: user.id
        }
    });
    if (existing) {
        const err = new Error('您已填写过该邀请问卷');
        err.statusCode = 400;
        throw err;
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

    // 7. 尝试绑定团队关系
    if (!user.parent_id && user.role_level < 1) {
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
            user.parent_id = inviter.id;
            user.parent_openid = inviter.openid;
            user.agent_id = inviter.role_level >= 3 ? inviter.id : inviter.agent_id;
            user.joined_team_at = new Date();
            await user.save();

            await inviter.increment('referee_count');
            await inviter.reload();

            const newRole = checkRoleUpgrade(inviter);
            if (newRole) {
                await inviter.update({ role_level: newRole });
            }

            boundTeam = true;
            await submission.update({ bound_team: true });

            await sendNotification(
                inviter.id,
                '新成员加入',
                `${user.nickname || '新用户'} 通过您的邀请问卷加入了团队！`,
                'commission',
                String(user.id)
            );

            await sendNotification(
                user.id,
                '加入团队成功',
                `您已成功加入 ${inviter.nickname || '邀请人'} 的团队。`,
                'system',
                String(inviter.id)
            );
        }
    }

    return {
        submission_id: submission.id,
        bound_team: boundTeam,
        already_has_team: !!user.parent_id && !boundTeam,
        message: boundTeam ? '提交成功，已加入团队' : (user.parent_id ? '问卷已提交（您已在其他团队中）' : '问卷已提交')
    };
}

/**
 * 获取管理后台问卷列表（含提交计数）
 * @returns {Promise<Array>} 问卷列表，每项带 submission_count
 */
async function adminListQuestionnaires() {
    const questionnaires = await Questionnaire.findAll({
        order: [['created_at', 'DESC']],
        include: [{
            model: QuestionnaireSubmission,
            as: 'submissions',
            attributes: ['id']
        }]
    });

    return questionnaires.map(q => ({
        ...q.toJSON(),
        submission_count: q.submissions ? q.submissions.length : 0,
        submissions: undefined
    }));
}

/**
 * 创建或更新问卷模板
 * @param {Object} body - { title, description, fields, is_active }
 * @param {Object} params - { id? }
 * @returns {Promise<Object>} 创建/更新后的问卷对象
 */
async function adminSaveQuestionnaire(body, params) {
    const { id } = params || {};
    const { title, description, fields, is_active } = body;

    if (!title) {
        const err = new Error('问卷标题不能为空');
        err.statusCode = 400;
        throw err;
    }
    if (!fields || !Array.isArray(fields) || fields.length === 0) {
        const err = new Error('至少需要一个问卷字段');
        err.statusCode = 400;
        throw err;
    }

    for (const f of fields) {
        if (!f.key || !f.label || !f.type) {
            const err = new Error(`字段 "${f.label || f.key || '未知'}" 缺少必要属性（key, label, type）`);
            err.statusCode = 400;
            throw err;
        }
    }

    let questionnaire;

    if (id) {
        questionnaire = await Questionnaire.findByPk(id);
        if (!questionnaire) {
            const err = new Error('问卷不存在');
            err.statusCode = 404;
            throw err;
        }
        await questionnaire.update({
            title,
            description: description || '',
            fields,
            is_active: is_active !== undefined ? is_active : questionnaire.is_active,
            version: questionnaire.version + 1
        });
    } else {
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

    return questionnaire;
}

/**
 * 删除问卷模板
 * @param {number|string} id - 问卷 ID
 * @returns {Promise<string>} 删除结果消息
 */
async function adminDeleteQuestionnaire(id) {
    const questionnaire = await Questionnaire.findByPk(id);
    if (!questionnaire) {
        const err = new Error('问卷不存在');
        err.statusCode = 404;
        throw err;
    }

    const count = await QuestionnaireSubmission.count({ where: { questionnaire_id: id } });
    if (count > 0) {
        const err = new Error(`该问卷已有 ${count} 条提交记录，不能删除。建议停用。`);
        err.statusCode = 400;
        throw err;
    }

    await questionnaire.destroy();
    return '删除成功';
}

/**
 * 启用指定问卷（停用其他所有问卷）
 * @param {number|string} id - 问卷 ID
 * @returns {Promise<string>} 结果消息
 */
async function adminActivateQuestionnaire(id) {
    const questionnaire = await Questionnaire.findByPk(id);
    if (!questionnaire) {
        const err = new Error('问卷不存在');
        err.statusCode = 404;
        throw err;
    }

    await Questionnaire.update({ is_active: false }, { where: {} });
    await questionnaire.update({ is_active: true });

    return '已设为当前启用问卷';
}

/**
 * 分页获取问卷提交记录列表
 * @param {Object} query - 查询参数 { page, limit, inviter_id, questionnaire_id, keyword }
 * @returns {Promise<{list:Array, pagination:Object}>}
 */
async function adminListSubmissions(query) {
    const { page = 1, limit = 20, inviter_id, questionnaire_id } = query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const where = {};
    if (inviter_id) where.inviter_id = inviter_id;
    if (questionnaire_id) where.questionnaire_id = questionnaire_id;

    const { count, rows } = await QuestionnaireSubmission.findAndCountAll({
        where,
        include: [
            { model: User, as: 'inviter', attributes: ['id', 'nickname', 'avatar_url'] },
            { model: User, as: 'submitter', attributes: ['id', 'nickname', 'avatar_url', 'phone'] },
            { model: Questionnaire, as: 'questionnaire', attributes: ['id', 'title', 'version'] }
        ],
        order: [['created_at', 'DESC']],
        offset,
        limit: parseInt(limit)
    });

    return {
        list: rows,
        pagination: {
            total: count,
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: Math.ceil(count / parseInt(limit))
        }
    };
}

/**
 * 获取单条提交详情
 * @param {number|string} id - 提交记录 ID
 * @returns {Promise<Object>} 提交详情
 */
async function adminGetSubmissionDetail(id) {
    const submission = await QuestionnaireSubmission.findByPk(id, {
        include: [
            { model: User, as: 'inviter', attributes: ['id', 'nickname', 'avatar_url'] },
            { model: User, as: 'submitter', attributes: ['id', 'nickname', 'avatar_url'] },
            { model: Questionnaire, as: 'questionnaire' }
        ]
    });

    if (!submission) {
        const err = new Error('提交记录不存在');
        err.statusCode = 404;
        throw err;
    }

    return submission;
}

module.exports = {
    getActiveQuestionnaire,
    submitQuestionnaire,
    adminListQuestionnaires,
    adminSaveQuestionnaire,
    adminDeleteQuestionnaire,
    adminActivateQuestionnaire,
    adminListSubmissions,
    adminGetSubmissionDetail
};
