/**
 * 年终分红服务 — 商业计划书4.0
 *
 * 规则：
 *   - B2(运营合伙人)及以上可参与年终分红
 *   - 分红比例：团队年度业绩的 1%-3%，按业绩名次分配
 *   - 分红池 = 平台年度总利润 × 分红比例（由管理员设定）
 *   - 按团队业绩排名分配：第1名得分红池的更高比例
 */
const { error: logError } = require('../utils/logger');
const { Op } = require('sequelize');

class DividendService {

    /**
     * 将某一块「子分红池」按档位配置分给业绩排名前若干名。
     * 子池 = dividendPool × (rankConfig.pool_pct / 100)。
     * 档位权重 = 各档 (count × pct) 之和；同一档内多人平分该档应得总额。
     * （修复：原先计算了 awardPool 却用整池 dividendPool×pct，导致 pool_pct 无效且总额失控。）
     *
     * @param {Array<{ dividendAmount?: number, sharePercent?: number, awardType?: string }>} result 已按 rank 排好序的候选人（会被原地修改）
     * @param {number} dividendPool 本次拟发放的整池金额（元）
     * @param {object} rankConfig { enabled, pool_pct, ranks: [{ count, pct, label }] }
     * @param {string} awardLabel 备注前缀，如 B波/B1
     */
    static _allocateByRanks(result, dividendPool, rankConfig, awardLabel) {
        if (!rankConfig?.enabled || !Array.isArray(rankConfig.ranks) || !result?.length) return;
        const poolPct = Number(rankConfig.pool_pct || 0);
        const awardPool = dividendPool * (poolPct / 100);
        if (!(awardPool > 0)) return;

        const totalWeight = rankConfig.ranks.reduce((s, rc) => {
            const c = Math.max(0, Number(rc.count) || 0);
            const p = Math.max(0, Number(rc.pct) || 0);
            return s + c * p;
        }, 0);
        if (!(totalWeight > 0)) return;

        let assigned = 0;
        for (const rc of rankConfig.ranks) {
            const count = Math.max(0, Number(rc.count) || 0);
            const w = Math.max(0, Number(rc.pct) || 0);
            const tierTotal = awardPool * ((count * w) / totalWeight);
            const perPerson = count > 0 ? tierTotal / count : 0;
            const amountEach = parseFloat(perPerson.toFixed(2));
            const label = rc.label != null ? String(rc.label) : '';
            for (let i = 0; i < count && assigned < result.length; i++) {
                const r = result[assigned];
                r.dividendAmount = (r.dividendAmount || 0) + amountEach;
                if (dividendPool > 0) {
                    r.sharePercent = (r.sharePercent || 0) + (amountEach / dividendPool) * 100;
                }
                r.awardType = [r.awardType, `${awardLabel}${label}`].filter(Boolean).join('+');
                assigned++;
            }
        }
    }

    /**
     * 计算指定年度的团队业绩排名
     * @param {number} year 年份
     * @returns {Array} 排名列表 [{ userId, teamSales, rank }]
     */
    static async calculateTeamRanking(year) {
        const { User, Order, sequelize } = require('../models');
        const ROLES = require('../config/constants').ROLES;

        const startDate = new Date(`${year}-01-01`);
        const endDate = new Date(`${year + 1}-01-01`);

        const partners = await User.findAll({
            where: { role_level: { [Op.gte]: ROLES.PARTNER || 4 } },
            attributes: ['id', 'nickname', 'role_level']
        });

        const rankings = [];

        for (const partner of partners) {
            const teamMembers = await User.findAll({
                where: {
                    [Op.or]: [
                        { id: partner.id },
                        { parent_id: partner.id },
                        { agent_id: partner.id }
                    ]
                },
                attributes: ['id']
            });

            const memberIds = teamMembers.map(m => m.id);
            if (memberIds.length === 0) {
                rankings.push({ userId: partner.id, nickname: partner.nickname, roleLevel: partner.role_level, teamSales: 0, memberCount: 0 });
                continue;
            }

            const result = await Order.findOne({
                where: {
                    buyer_id: { [Op.in]: memberIds },
                    status: { [Op.in]: ['paid', 'shipped', 'completed'] },
                    paid_at: { [Op.gte]: startDate, [Op.lt]: endDate }
                },
                attributes: [[sequelize.fn('SUM', sequelize.col('total_amount')), 'totalSales']],
                raw: true
            });

            rankings.push({
                userId: partner.id,
                nickname: partner.nickname,
                roleLevel: partner.role_level,
                teamSales: parseFloat(result?.totalSales || 0),
                memberCount: memberIds.length
            });
        }

        rankings.sort((a, b) => b.teamSales - a.teamSales);
        rankings.forEach((r, i) => { r.rank = i + 1; });
        return rankings;
    }

    /**
     * 计算分红分配方案（预览，不实际发放）
     * @param {number} year 年份
     * @param {number} dividendPool 分红池总金额（元）
     * @returns {Array} [{ userId, nickname, rank, teamSales, dividendAmount }]
     */
    static async previewDividend(year, dividendPool) {
        const rankings = await this.calculateTeamRanking(year);
        if (rankings.length === 0) return [];

        // 读取分红规则配置（冠亚季拆分）
        const { AppConfig } = require('../models');
        let rules = null;
        try {
            const cfg = await AppConfig.findOne({ where: { config_key: 'agent_system_dividend_rules', status: 1 } });
            if (cfg) rules = JSON.parse(cfg.config_value);
        } catch (e) {
            logError('DIVIDEND', '静默捕获异常', { error: e.message });
        }

        if (!rules || !rules.enabled) {
            return rankings.map(r => ({ ...r, dividendAmount: 0, sharePercent: 0, awardType: 'disabled' }));
        }

        const result = rankings.map(r => ({ ...r, dividendAmount: 0, sharePercent: 0, awardType: '' }));

        this._allocateByRanks(result, dividendPool, rules.b_team_award, 'B波');
        this._allocateByRanks(result, dividendPool, rules.b1_personal_award, 'B1');

        return result;
    }

    /**
     * 执行分红发放
     * @param {number} year 年份
     * @param {number} dividendPool 分红池总金额
     * @param {number} adminId 操作管理员ID
     * @returns {object} { totalDistributed, recipients }
     */
    static async executeDividend(year, dividendPool, adminId) {
        const { User, CommissionLog, AppConfig, sequelize } = require('../models');
        const allocations = await this.previewDividend(year, dividendPool);
        const t = await sequelize.transaction();

        try {
            // 校验分红池余额是否充足
            const poolCfg = await AppConfig.findOne({
                where: { config_key: 'dividend_pool_balance' },
                transaction: t, lock: t.LOCK.UPDATE
            });
            const poolBalance = poolCfg ? parseFloat(poolCfg.config_value || 0) : 0;
            if (poolBalance < dividendPool) {
                await t.rollback();
                throw new Error(`分红池余额不足：当前累积 ¥${poolBalance.toFixed(2)}，请求发放 ¥${dividendPool}。请先确认订单计提数据。`);
            }

            let totalDistributed = 0;
            const recipients = [];

            for (const alloc of allocations) {
                if (alloc.dividendAmount <= 0) continue;

                await User.increment('balance', {
                    by: alloc.dividendAmount,
                    where: { id: alloc.userId },
                    transaction: t
                });

                await CommissionLog.create({
                    user_id: alloc.userId,
                    order_id: null,
                    amount: alloc.dividendAmount,
                    type: 'Dividend',
                    status: 'settled',
                    settled_at: new Date(),
                    remark: `${year}年度分红：排名第${alloc.rank}，团队业绩¥${alloc.teamSales}，分红¥${alloc.dividendAmount}`
                }, { transaction: t });

                totalDistributed += alloc.dividendAmount;
                recipients.push({
                    userId: alloc.userId,
                    nickname: alloc.nickname,
                    rank: alloc.rank,
                    amount: alloc.dividendAmount
                });
            }

            // 扣减分红池已发放金额
            if (totalDistributed > 0 && poolCfg) {
                const newBalance = parseFloat((poolBalance - totalDistributed).toFixed(2));
                poolCfg.config_value = String(Math.max(0, newBalance));
                await poolCfg.save({ transaction: t });
            }

            await t.commit();
            return { year, dividendPool, totalDistributed, recipients, poolRemaining: parseFloat((poolBalance - totalDistributed).toFixed(2)) };
        } catch (err) {
            if (!t.finished) await t.rollback();
            throw err;
        }
    }
}

module.exports = DividendService;
