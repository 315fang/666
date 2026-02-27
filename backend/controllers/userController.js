const { User, Notification } = require('../models');
const { sendNotification } = require('../models/notificationUtil');
const constants = require('../config/constants');

/**
 * 获取当前用户完整信息（小程序个人中心用）
 */
async function getUserProfile(req, res, next) {
    try {
        const user = req.user;

        // 获取上级信息
        let parent = null;
        if (user.parent_id) {
            const parentUser = await User.findByPk(user.parent_id, {
                attributes: ['id', 'nickname', 'avatar_url']
            });
            if (parentUser) {
                parent = { id: parentUser.id, nickname: parentUser.nickname };
            }
        }

        // 获取直推人数
        const directCount = await User.count({ where: { parent_id: user.id } });

        const roleNames = constants.ROLE_NAMES;

        res.json({
            code: 0,
            data: {
                id: user.id,
                openid: user.openid,
                nickname: user.nickname,
                avatar_url: user.avatar_url,
                role_level: user.role_level,
                role_name: roleNames[user.role_level] || '普通用户',
                balance: parseFloat(user.balance).toFixed(2),
                referee_count: user.referee_count || directCount,
                order_count: user.order_count,
                total_sales: parseFloat(user.total_sales).toFixed(2),
                invite_code: user.invite_code,
                stock_count: user.stock_count || 0,
                parent: parent,
                created_at: user.created_at,
                joined_team_at: user.joined_team_at
            }
        });
    } catch (error) {
        next(error);
    }
}

/**
 * 更新用户昵称/头像
 */
async function updateProfile(req, res, next) {
    try {
        const user = req.user;
        const { nickname, avatar_url } = req.body;

        const updateData = {};
        if (nickname && nickname.trim()) {
            updateData.nickname = nickname.trim().substring(0, 20); // 限制20字
        }
        if (avatar_url) {
            updateData.avatar_url = avatar_url;
        }

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ code: -1, message: '没有要更新的信息' });
        }

        await user.update(updateData);

        res.json({
            code: 0,
            data: {
                nickname: user.nickname,
                avatar_url: user.avatar_url
            },
            message: '更新成功'
        });
    } catch (error) {
        next(error);
    }
}

/**
 * 获取用户角色信息
 */
async function getUserRole(req, res, next) {
    try {
        const user = req.user;

        res.json({
            success: true,
            data: {
                id: user.id,
                openid: user.openid,
                nickname: user.nickname,
                avatar_url: user.avatar_url,
                role: user.role_level,
                stock: user.stock_count,
                balance: parseFloat(user.balance).toFixed(2),
                referee_count: user.referee_count,
                order_count: user.order_count,
                total_sales: parseFloat(user.total_sales).toFixed(2)
            }
        });
    } catch (error) {
        next(error);
    }
}

/**
 * 绑定上级
 */
async function bindParent(req, res, next) {
    try {
        const user = req.user;
        const { parent_id } = req.body;

        if (!parent_id) {
            return res.status(400).json({ code: -1, message: '无效的邀请码' });
        }

        if (user.parent_id) {
            return res.status(400).json({ code: -1, message: '已绑定上级，不可更改' });
        }

        // 支持通过邀请码、用户ID、openid 查找
        let parent = null;
        if (/^\d{6}$/.test(String(parent_id))) {
            parent = await User.findOne({ where: { invite_code: String(parent_id) } });
        }
        if (!parent) {
            const parsedId = parseInt(parent_id);
            if (!isNaN(parsedId) && parsedId > 0) {
                parent = await User.findByPk(parsedId);
            }
        }
        if (!parent) {
            parent = await User.findOne({ where: { openid: String(parent_id) } });
        }

        if (!parent) {
            return res.status(404).json({ code: -1, message: '上级用户不存在' });
        }

        if (parent.id === user.id) {
            return res.status(400).json({ code: -1, message: '不能绑定自己为上级' });
        }

        // ★ 递归检查是否存在循环绑定（向上遍历 parent 的上级链，如果出现 user.id 则形成环）
        let checkId = parent.parent_id;
        let depth = 0;
        const maxDepth = 50; // 防止数据异常时无限循环
        while (checkId && depth < maxDepth) {
            if (checkId === user.id) {
                return res.status(400).json({ code: -1, message: '不可绑定，会形成循环关系' });
            }
            const ancestor = await User.findByPk(checkId, { attributes: ['id', 'parent_id'] });
            if (!ancestor) break;
            checkId = ancestor.parent_id;
            depth++;
        }
        // 也检查 parent 是否是 user 的直接下级
        const isChild = await User.findOne({ where: { id: parent.id, parent_id: user.id } });
        if (isChild) {
            return res.status(400).json({ code: -1, message: '不可绑定自己的下级' });
        }

        // 更新绑定关系
        user.parent_id = parent.id;
        user.parent_openid = parent.openid;
        user.agent_id = parent.role_level >= 3 ? parent.id : parent.agent_id;
        // 设置加入团队时间
        user.joined_team_at = new Date();
        await user.save();

        // 更新上级推人人数
        await parent.increment('referee_count');

        // 通知上级有新成员加入
        await sendNotification(
            parent.id,
            '新成员加入',
            `${user.nickname || '新用户'} 已通过您的邀请码加入了您的团队！`,
            'commission',
            String(user.id)
        );

        // 通知当前用户绑定成功
        await sendNotification(
            user.id,
            '绑定上级成功',
            `您已成功加入 ${parent.nickname || '上级'} 的团队。`,
            'system',
            String(parent.id)
        );

        res.json({
            code: 0,
            message: '绑定上级成功'
        });
    } catch (error) {
        next(error);
    }
}

// --- 通知相关 ---

/**
 * 获取用户通知
 */
async function getNotifications(req, res, next) {
    try {
        const userId = req.user.id;
        const { page = 1, limit = 20 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        const { count, rows } = await Notification.findAndCountAll({
            where: { user_id: userId },
            order: [['created_at', 'DESC']],
            offset,
            limit: parseInt(limit)
        });

        // ★ 计算未读通知数
        const unreadCount = await Notification.count({
            where: { user_id: userId, is_read: false }
        });

        res.json({
            code: 0,
            data: {
                list: rows,
                unread_count: unreadCount,
                pagination: { total: count, page: parseInt(page), limit: parseInt(limit) }
            }
        });
    } catch (error) {
        next(error);
    }
}

/**
 * 标记通知已读
 */
async function markNotificationRead(req, res, next) {
    try {
        const userId = req.user.id;
        const { id } = req.params;

        await Notification.update(
            { is_read: true },
            { where: { id, user_id: userId } }
        );

        res.json({ code: 0, message: '已设为已读' });
    } catch (error) {
        next(error);
    }
}

// --- 用户偏好设置与AI盲盒测算 ---

// 获取用户偏好
async function getPreferences(req, res, next) {
    try {
        const user = await User.findByPk(req.user.id, {
            attributes: ['preferences']
        });

        const prefs = user?.preferences || {};

        res.json({
            code: 0,
            data: prefs
        });
    } catch (error) {
        next(error);
    }
}

// 获取AI定制测算问题库
async function getPreferencesQuestions(req, res, next) {
    try {
        const { AppConfig } = require('../models');
        // 从配置表中读取，如果没有则返回一份默认的题目
        const config = await AppConfig.findOne({ where: { config_key: 'AI_QUESTIONNAIRE_CONFIG' } });

        let questions = [];
        if (config && config.config_value) {
            try {
                questions = JSON.parse(config.config_value);
            } catch (e) {
                console.error("解析问卷配置失败", e);
            }
        }

        // 默认备用题库
        if (questions.length === 0) {
            questions = [
                {
                    id: "q1",
                    title: "您平时的穿衣/生活风格是？",
                    subtitle: "AI将根据风格为您挑选合适的单品",
                    options: [
                        { label: "极简冷淡风", value: "minimalist" },
                        { label: "街头潮牌", value: "street" },
                        { label: "职场通勤", value: "office" },
                        { label: "甜美可爱", value: "sweet" }
                    ]
                },
                {
                    id: "q2",
                    title: "您对哪些品类的盲盒更感兴趣？",
                    subtitle: "多选题，AI会跨品类为您搭配",
                    options: [
                        { label: "美妆与护肤", value: "beauty" },
                        { label: "精致零食", value: "snack" },
                        { label: "居家生活好物", value: "home" },
                        { label: "减脂与健康", value: "health" }
                    ]
                },
                {
                    id: "q3",
                    title: "您目前的单月闲置消费预算是？",
                    subtitle: "为了给您控制合理的盲盒体积",
                    options: [
                        { label: "199元以内 (轻奢尝鲜)", value: "199" },
                        { label: "199-399元 (进阶品质)", value: "399" },
                        { label: "399元以上 (极致尊享)", value: "599" }
                    ]
                }
            ];
        }

        res.json({
            code: 0,
            data: questions
        });
    } catch (error) {
        next(error);
    }
}

// 保存用户偏好设置并触发AI大模型预选
async function savePreferences(req, res, next) {
    try {
        const { preferences } = req.body;

        await User.update(
            { preferences: preferences || {} },
            { where: { id: req.user.id } }
        );

        res.json({ code: 0, message: '偏好设置已保存，AI分析完成' });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    getUserProfile,
    updateProfile,
    getUserRole,
    bindParent,
    getNotifications,
    markNotificationRead,
    getPreferences,
    getPreferencesQuestions,
    savePreferences
};
