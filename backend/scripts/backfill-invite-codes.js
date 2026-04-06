/**
 * 为 invite_code 缺失或非法的用户批量补 6 位数字邀请码（与登录时 ensureUserInviteCode 一致）。
 * 含：NULL、空串、'-'、非 6 位、非纯数字等。
 *
 *   cd backend && npm run invite:backfill
 */
require('dotenv').config();
const { Op } = require('sequelize');
const { User, sequelize } = require('../models');
const { ensureUserInviteCode } = require('../utils/inviteCode');

(async () => {
    try {
        const rows = await User.findAll({
            where: {
                [Op.or]: [
                    { invite_code: null },
                    { invite_code: '' },
                    sequelize.where(
                        sequelize.literal(
                            '(invite_code IS NOT NULL AND invite_code != \'\' AND invite_code NOT REGEXP \'^[0-9]{6}$\')'
                        )
                    )
                ]
            },
            order: [['id', 'ASC']]
        });
        console.log(`待补邀请码用户数: ${rows.length}`);
        let ok = 0;
        for (const u of rows) {
            try {
                await ensureUserInviteCode(u);
                ok++;
                if (ok % 200 === 0) console.log(`已处理 ${ok}...`);
            } catch (e) {
                console.error(`用户 id=${u.id} 失败:`, e.message);
            }
        }
        console.log(`完成: 成功 ${ok}/${rows.length}`);
        await sequelize.close();
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
})();
