const jwt = require('jsonwebtoken');
const constants = require('../config/constants');
const { User, PortalAccount } = require('../models');

function generatePortalToken(user, account) {
    return jwt.sign(
        {
            id: user.id,
            openid: user.openid,
            member_no: user.member_no,
            portal_account_id: account.id,
            type: 'portal'
        },
        constants.SECURITY.JWT_SECRET,
        { expiresIn: '12h' }
    );
}

async function authenticatePortal(req, res, next) {
    try {
        const auth = req.headers.authorization || '';
        if (!auth.startsWith('Bearer ')) {
            return res.status(401).json({ code: -1, message: '未登录或令牌缺失' });
        }
        const token = auth.slice(7);
        const decoded = jwt.verify(token, constants.SECURITY.JWT_SECRET);
        if (decoded.type !== 'portal') {
            return res.status(401).json({ code: -1, message: '令牌类型无效' });
        }

        const [user, account] = await Promise.all([
            User.findByPk(decoded.id),
            PortalAccount.findByPk(decoded.portal_account_id)
        ]);

        if (!user || user.status !== 1 || !account || account.user_id !== user.id || account.status !== 1) {
            return res.status(401).json({ code: -1, message: '登录状态已失效' });
        }

        req.portalUser = user;
        req.portalAccount = account;
        next();
    } catch (error) {
        return res.status(401).json({ code: -1, message: '登录已过期，请重新登录' });
    }
}

module.exports = {
    generatePortalToken,
    authenticatePortal
};
