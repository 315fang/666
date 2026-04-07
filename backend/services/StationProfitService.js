/**
 * StationProfitService — 区域成交利润归因服务
 *
 * 从 stationController 提取 attributeRegionalProfit，
 * 解除 Service → Controller 的反向依赖。
 */
const { Op } = require('sequelize');
const { ServiceStation, User, CommissionLog, sequelize } = require('../models');
const { getBranchAgentPolicy } = require('../utils/branchAgentPolicy');
const { logError } = require('../utils/logger');

// ── 内部辅助（本文件专用副本） ──
function parseStationMeta(station) {
    const raw = station?.remark;
    if (!raw) return {};
    try {
        return typeof raw === 'string' ? (JSON.parse(raw) || {}) : (raw || {});
    } catch (_) {
        return {};
    }
}

/**
 * ★ 内部方法：区域成交利润归因
 * 由 OrderCoreService._markOrderAsPaid 调用
 * 根据买家所在城市，查找对应 active 站点，发放认领人利润分成
 */
const attributeRegionalProfit = async (orderId, buyerCity, orderAmount) => {
    try {
        const policy = await getBranchAgentPolicy();
        if (!policy.enabled) return;

        const location = typeof buyerCity === 'object'
            ? buyerCity
            : { city: buyerCity };
        const province = String(location?.province || '');
        const city = String(location?.city || '');
        const district = String(location?.district || '');
        if (!province && !city && !district) return;

        const rateCfg = policy.type_commission_rate || {};

        const stations = await ServiceStation.findAll({
            where: { status: 'active', claimant_id: { [Op.not]: null } }
        });
        if (!stations.length) return;

        const matched = [];
        for (const station of stations) {
            const meta = parseStationMeta(station);
            const branchType = meta.branch_type || 'city';
            const regionName = String(meta.region_name || station.district || station.city || station.province || '');
            let hit = false;
            if (branchType === 'school' || branchType === 'area') {
                hit = !!district && !!regionName && district.includes(regionName);
            } else if (branchType === 'city') {
                hit = !!city && !!regionName && city.includes(regionName);
            } else if (branchType === 'province') {
                hit = !!province && !!regionName && province.includes(regionName);
            }
            if (hit) matched.push({ station, branchType, regionName });
        }
        if (!matched.length) return;

        const existedRegionalCount = await CommissionLog.count({
            where: {
                order_id: orderId,
                type: { [Op.like]: 'Regional_%' }
            }
        });
        if (existedRegionalCount > 0) return;

        const baseAmount = Number(orderAmount || 0);
        if (!Number.isFinite(baseAmount) || baseAmount <= 0) return;

        // TODO: 当前区域分成在支付后立即 settled 入账，退款/取消时尚未走统一冲回链路。
        // 已知存在账务口径风险，本轮先保留现状，后续需改为可撤销/可审批的结算流程。
        let distributed = 0;
        for (const item of matched) {
            const station = item.station;
            const rate = Number(station.commission_rate || rateCfg[item.branchType] || 0);
            const rawCommission = parseFloat((baseAmount * rate).toFixed(2));
            const remain = Math.max(0, baseAmount - distributed);
            const commission = parseFloat(Math.min(rawCommission, remain).toFixed(2));
            if (commission <= 0) continue;
            const t = await sequelize.transaction();
            try {
                await User.increment('balance', { by: commission, where: { id: station.claimant_id }, transaction: t });
                await CommissionLog.create({
                    user_id: station.claimant_id,
                    order_id: orderId,
                    amount: commission,
                    type: `Regional_${item.branchType}`,
                    status: 'settled',
                    settled_at: new Date(),
                    remark: `区域代理分成：${item.regionName}(${item.branchType}) ${(rate * 100).toFixed(2)}%`
                }, { transaction: t });
                await ServiceStation.increment(
                    { total_orders: 1, total_commission: commission },
                    { where: { id: station.id }, transaction: t }
                );
                await t.commit();
                distributed += commission;
            } catch (e) {
                await t.rollback();
                logError('STATION', `区域分成发放失败: ${e.message}`);
            }
        }
    } catch (err) {
        logError('STATION', `attributeRegionalProfit error: ${err.message}`);
    }
};

module.exports = { attributeRegionalProfit };
