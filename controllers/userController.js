const { User } = require('../models');

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

module.exports = {
    getUserRole
};
