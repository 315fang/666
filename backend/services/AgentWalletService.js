const { AgentWalletAccount, AgentWalletLog, sequelize } = require('../models');
const { toMoney, addMoney, subMoney } = require('../utils/money');

class AgentWalletService {
    static async ensureAccount(userId, transaction = null) {
        const [account] = await AgentWalletAccount.findOrCreate({
            where: { user_id: userId },
            defaults: { user_id: userId, balance: 0, frozen_balance: 0, total_recharge: 0, total_deduct: 0, status: 1 },
            transaction
        });
        return account;
    }

    static async recharge({ userId, amount, refType = 'manual_recharge', refId = null, remark = '货款充值', transaction = null }, extTransaction = null) {
        const externalTx = extTransaction || transaction || null;
        if (externalTx) {
            return this._doRecharge(externalTx, { userId, amount, refType, refId, remark });
        }
        return sequelize.transaction(tx =>
            this._doRecharge(tx, { userId, amount, refType, refId, remark })
        );
    }

    static async _doRecharge(tx, { userId, amount, refType, refId, remark }) {
        const account = await this.ensureAccount(userId, tx);
        const locked = await AgentWalletAccount.findByPk(account.id, { transaction: tx, lock: tx.LOCK.UPDATE });
        if (refType && refId) {
            const existingLog = await AgentWalletLog.findOne({
                where: {
                    user_id: userId,
                    change_type: 'recharge',
                    ref_type: refType,
                    ref_id: String(refId)
                },
                transaction: tx,
                lock: tx.LOCK.UPDATE
            });
            if (existingLog) {
                return {
                    before: toMoney(existingLog.balance_before),
                    after: toMoney(existingLog.balance_after),
                    duplicated: true
                };
            }
        }
        const before = toMoney(locked.balance);
        const change = toMoney(amount);
        const after = addMoney(before, change);

        await locked.update({
            balance: after,
            total_recharge: addMoney(locked.total_recharge, change)
        }, { transaction: tx });

        await AgentWalletLog.create({
            user_id: userId,
            account_id: locked.id,
            change_type: 'recharge',
            amount: change,
            balance_before: before,
            balance_after: after,
            ref_type: refType,
            ref_id: refId ? String(refId) : null,
            remark
        }, { transaction: tx });

        return { before, after };
    }

    static async deduct({ userId, amount, refType = 'order_ship', refId = null, remark = '发货扣货款', transaction = null }, extTransaction = null) {
        const externalTx = extTransaction || transaction || null;
        if (externalTx) {
            return this._doDeduct(externalTx, { userId, amount, refType, refId, remark });
        }
        return sequelize.transaction(tx =>
            this._doDeduct(tx, { userId, amount, refType, refId, remark })
        );
    }

    static async _doDeduct(tx, { userId, amount, refType, refId, remark }) {
        const account = await this.ensureAccount(userId, tx);
        const locked = await AgentWalletAccount.findByPk(account.id, { transaction: tx, lock: tx.LOCK.UPDATE });
        const before = toMoney(locked.balance);
        const change = toMoney(amount);
        if (before < change) {
            throw new Error(`货款余额不足，当前 ¥${before.toFixed(2)}，需扣除 ¥${change.toFixed(2)}`);
        }
        const after = subMoney(before, change);

        await locked.update({
            balance: after,
            total_deduct: addMoney(locked.total_deduct, change)
        }, { transaction: tx });

        await AgentWalletLog.create({
            user_id: userId,
            account_id: locked.id,
            change_type: 'deduct',
            amount: change,
            balance_before: before,
            balance_after: after,
            ref_type: refType,
            ref_id: refId ? String(refId) : null,
            remark
        }, { transaction: tx });

        return { before, after };
    }

    static async getAccount(userId) {
        return this.ensureAccount(userId);
    }

    /**
     * N路径专用：大N 划拨货款给 小n（原子事务，两个账户同时变动）
     * @param {number} fromId  - 大N user_id（出账方）
     * @param {number} toId    - 小n user_id（入账方）
     * @param {number} amount  - 划拨金额（元）
     * @param {object} [opts]  - { refId, remark }
     * @returns {{ from: { before, after }, to: { before, after } }}
     */
    static async transfer(fromId, toId, amount, opts = {}) {
        const { refId = null, remark = 'N路径货款划拨' } = opts;
        return sequelize.transaction(async tx => {
            // 出账（大N）
            const fromAccount = await this.ensureAccount(fromId, tx);
            const fromLocked = await AgentWalletAccount.findByPk(fromAccount.id, { transaction: tx, lock: tx.LOCK.UPDATE });
            const fromBefore = toMoney(fromLocked.balance);
            const change = toMoney(amount);
            if (fromBefore < change) {
                throw new Error(`大N货款余额不足，当前 ¥${fromBefore.toFixed(2)}，需划拨 ¥${change.toFixed(2)}`);
            }
            const fromAfter = subMoney(fromBefore, change);
            await fromLocked.update({
                balance: fromAfter,
                total_deduct: addMoney(fromLocked.total_deduct, change)
            }, { transaction: tx });
            await AgentWalletLog.create({
                user_id: fromId,
                account_id: fromLocked.id,
                change_type: 'n_allocate_out',
                amount: change,
                balance_before: fromBefore,
                balance_after: fromAfter,
                ref_type: 'n_fund_request',
                ref_id: refId ? String(refId) : null,
                remark: `${remark}（划出）→ 小n #${toId}`
            }, { transaction: tx });

            // 入账（小n）
            const toAccount = await this.ensureAccount(toId, tx);
            const toLocked = await AgentWalletAccount.findByPk(toAccount.id, { transaction: tx, lock: tx.LOCK.UPDATE });
            const toBefore = toMoney(toLocked.balance);
            const toAfter = addMoney(toBefore, change);
            await toLocked.update({
                balance: toAfter,
                total_recharge: addMoney(toLocked.total_recharge, change)
            }, { transaction: tx });
            await AgentWalletLog.create({
                user_id: toId,
                account_id: toLocked.id,
                change_type: 'n_allocate_in',
                amount: change,
                balance_before: toBefore,
                balance_after: toAfter,
                ref_type: 'n_fund_request',
                ref_id: refId ? String(refId) : null,
                remark: `${remark}（收入）← 大N #${fromId}`
            }, { transaction: tx });

            return {
                from: { before: fromBefore, after: fromAfter },
                to: { before: toBefore, after: toAfter }
            };
        });
    }

    /**
     * 合伙人退出退款 — 商业计划书4.0权益保障
     * 规则：
     *   - 只退本人后台账户余额（AgentWalletAccount.balance + User.balance）
     *   - 退款周期不含利息及其他费用
     *   - 退出后降级为普通用户，清除所有代理权益
     *   - 退款记录写入流水日志
     *
     * @param {number} userId 退出的用户ID
     * @param {number} adminId 操作的管理员ID
     * @param {string} reason 退出原因
     * @returns {object} { refundAmount, walletRefund, balanceRefund }
     */
    static async processPartnerExit(userId, adminId, reason = '') {
        const { User, AgentWalletAccount, AgentWalletLog, sequelize } = require('../models');
        const t = await sequelize.transaction();
        try {
            const user = await User.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });
            if (!user || user.role_level < 3) {
                await t.rollback();
                throw new Error('该用户不是合伙人，无法执行退出');
            }

            let walletRefund = 0;
            const account = await AgentWalletAccount.findOne({
                where: { user_id: userId },
                transaction: t, lock: t.LOCK.UPDATE
            });
            if (account && parseFloat(account.balance) > 0) {
                walletRefund = parseFloat(account.balance);
                await AgentWalletLog.create({
                    account_id: account.id,
                    change_type: 'refund',
                    amount: -walletRefund,
                    balance_before: walletRefund,
                    balance_after: 0,
                    ref_type: 'partner_exit',
                    remark: `合伙人退出退款（货款余额）- ${reason}`
                }, { transaction: t });
                account.balance = 0;
                await account.save({ transaction: t });
            }

            const balanceRefund = parseFloat(user.balance || 0);
            if (balanceRefund > 0) {
                user.balance = 0;
            }

            // 降级为普通用户
            user.role_level = 0;
            user.agent_level = null;
            user.remark = [user.remark, `[合伙人退出] ${new Date().toISOString().slice(0, 10)} 退款¥${(walletRefund + balanceRefund).toFixed(2)} 操作人:${adminId} ${reason}`].filter(Boolean).join(' | ');
            await user.save({ transaction: t });

            await t.commit();
            return {
                refundAmount: parseFloat((walletRefund + balanceRefund).toFixed(2)),
                walletRefund,
                balanceRefund
            };
        } catch (err) {
            if (!t.finished) await t.rollback();
            throw err;
        }
    }
}

module.exports = AgentWalletService;
