const { User } = require('../models');
const { code2Session } = require('../utils/wechat');
const { checkRoleUpgrade } = require('../utils/commission');

/**
 * 用户登录/注册
 */
async function login(req, res, next) {
    try {
        const { code, distributor_id, nickName, avatarUrl } = req.body;

        if (!code) {
            return res.status(400).json({
                success: false,
                message: '缺少code参数'
            });
        }

        // 使用code换取openid
        const { openid, session_key } = await code2Session(code);

        // 查询用户是否存在
        let user = await User.findOne({
            where: { openid },
            include: [
                { model: User, as: 'parent' }
            ]
        });

        if (user) {
            // 用户已存在，更新最后登录时间
            await user.update({ last_login: new Date() });
        } else {
            // 用户不存在，创建新用户
            let parentUser = null;
            if (distributor_id) {
                parentUser = await User.findOne({ where: { openid: distributor_id } });

                // 更新上级的推荐人数
                if (parentUser) {
                    await parentUser.increment('referee_count');

                    // 检查上级是否应该升级
                    await parentUser.reload();
                    const newRole = checkRoleUpgrade(parentUser);
                    if (newRole) {
                        await parentUser.update({ role_level: newRole });
                    }
                }
            }

            user = await User.create({
                openid,
                nickname: nickName || '微信用户',
                avatar_url: avatarUrl || '',
                role_level: 0, // 默认游客
                parent_id: parentUser ? parentUser.id : null,
                parent_openid: distributor_id || null,
                last_login: new Date()
            });

            // 重新加载以包含parent关系
            user = await User.findByPk(user.id, {
                include: [{ model: User, as: 'parent' }]
            });
        }

        res.json({
            success: true,
            openid,
            userInfo: {
                id: user.id,
                openid: user.openid,
                nickname: user.nickname,
                avatar_url: user.avatar_url,
                role: user.role_level,
                stock: user.stock_count,
                balance: user.balance
            }
        });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    login
};
