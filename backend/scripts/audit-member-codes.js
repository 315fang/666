require('dotenv').config();

const { User, PortalAccount, sequelize } = require('../models');
const { buildRandomMemberNo, isValidMemberNo, normalizeMemberNo } = require('../utils/memberNo');

const dryRun = process.argv.includes('--dry-run') || process.argv.includes('--check-only');

async function generateUniqueMemberNo(reserved) {
    for (let i = 0; i < 100; i += 1) {
        const candidate = buildRandomMemberNo();
        if (reserved.has(candidate)) continue;
        const exists = await User.findOne({ where: { member_no: candidate }, attributes: ['id'] });
        if (!exists) {
            reserved.add(candidate);
            return candidate;
        }
    }
    throw new Error('无法生成唯一会员码，请稍后重试');
}

(async () => {
    try {
        const users = await User.findAll({
            attributes: ['id', 'nickname', 'member_no', 'invite_code'],
            order: [['id', 'ASC']]
        });

        const normalizedCounts = new Map();
        for (const user of users) {
            const normalized = normalizeMemberNo(user.member_no);
            if (!normalized) continue;
            normalizedCounts.set(normalized, (normalizedCounts.get(normalized) || 0) + 1);
        }

        const reserved = new Set();
        for (const user of users) {
            const normalized = normalizeMemberNo(user.member_no);
            if (isValidMemberNo(normalized) && normalizedCounts.get(normalized) === 1) {
                reserved.add(normalized);
            }
        }

        const fixes = [];
        const summary = {
            total: users.length,
            invalid: 0,
            duplicates: 0,
            normalizedCase: 0,
            portalMismatched: 0,
            repaired: 0
        };

        for (const user of users) {
            const current = String(user.member_no || '');
            const normalized = normalizeMemberNo(current);
            const isDuplicate = !!normalized && normalizedCounts.get(normalized) > 1;
            const isInvalid = !isValidMemberNo(normalized);
            const needsNormalize = !!normalized && normalized !== current;

            if (isInvalid) summary.invalid += 1;
            if (isDuplicate) summary.duplicates += 1;
            if (!isInvalid && !isDuplicate && needsNormalize) summary.normalizedCase += 1;

            let nextMemberNo = normalized;
            if (isInvalid || isDuplicate) {
                nextMemberNo = await generateUniqueMemberNo(reserved);
            } else if (needsNormalize) {
                nextMemberNo = normalized;
                reserved.add(nextMemberNo);
            }

            const portal = await PortalAccount.findOne({
                where: { user_id: user.id },
                attributes: ['id', 'login_id']
            });
            const portalMismatch = !!portal && portal.login_id !== nextMemberNo;
            if (portalMismatch) summary.portalMismatched += 1;

            if ((isInvalid || isDuplicate || needsNormalize || portalMismatch) && nextMemberNo) {
                fixes.push({
                    userId: user.id,
                    nickname: user.nickname || '',
                    oldMemberNo: current,
                    newMemberNo: nextMemberNo,
                    oldInviteCode: user.invite_code || '',
                    portalAccountId: portal?.id || null,
                    portalLoginId: portal?.login_id || ''
                });
            }
        }

        console.log(`[member-code] mode=${dryRun ? 'dry-run' : 'apply'}`);
        console.log(`[member-code] total=${summary.total} invalid=${summary.invalid} duplicates=${summary.duplicates} normalizeCase=${summary.normalizedCase} portalMismatch=${summary.portalMismatched}`);

        if (fixes.length === 0) {
            console.log('[member-code] 无需修复');
            await sequelize.close();
            process.exit(0);
        }

        for (const fix of fixes) {
            console.log(`[member-code] user#${fix.userId} "${fix.nickname}" member_no "${fix.oldMemberNo || '-'}" -> "${fix.newMemberNo}" portal "${fix.portalLoginId || '-'}"`);
            if (dryRun) continue;

            const t = await sequelize.transaction();
            try {
                await User.update(
                    { member_no: fix.newMemberNo },
                    { where: { id: fix.userId }, transaction: t }
                );
                if (fix.portalAccountId) {
                    await PortalAccount.update(
                        { login_id: fix.newMemberNo },
                        { where: { id: fix.portalAccountId }, transaction: t }
                    );
                }
                await t.commit();
                summary.repaired += 1;
            } catch (error) {
                await t.rollback();
                console.error(`[member-code] 修复 user#${fix.userId} 失败: ${error.message}`);
            }
        }

        if (!dryRun) {
            console.log(`[member-code] 完成，成功修复 ${summary.repaired}/${fixes.length}`);
        } else {
            console.log(`[member-code] 预检查结束，待修复 ${fixes.length} 条`);
        }

        await sequelize.close();
        process.exit(0);
    } catch (error) {
        console.error('[member-code] 执行失败:', error);
        process.exit(1);
    }
})();
