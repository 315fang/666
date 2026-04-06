const { User } = require('../models');

function isValidSixDigitInviteCode(code) {
    return /^\d{6}$/.test(String(code == null ? '' : code).trim());
}

/**
 * 为用户分配 6 位数字邀请码（全库唯一）。
 * 仅当 invite_code 已是合法 6 位数字时跳过；空、'-'、长度不对等均会重新分配。
 * @param {import('sequelize').Model} userInstance User 模型实例
 */
async function ensureUserInviteCode(userInstance) {
    if (!userInstance) return userInstance;
    if (isValidSixDigitInviteCode(userInstance.invite_code)) return userInstance;

    for (let attempt = 0; attempt < 100; attempt++) {
        const code = String(Math.floor(100000 + Math.random() * 900000));
        const dup = await User.findOne({ where: { invite_code: code } });
        if (!dup) {
            userInstance.invite_code = code;
            await userInstance.save();
            return userInstance;
        }
    }
    throw new Error('无法生成唯一邀请码，请稍后重试或联系管理员');
}

module.exports = {
    ensureUserInviteCode,
    isValidSixDigitInviteCode
};
