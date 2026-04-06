/**
 * 佣金/提成口径（与产品确认用）
 * 发货分润主路径：CommissionService.calculateGapAndFulfillmentCommissions
 * 说明文档：仓库 docs/业务规则.md
 */

/** 提成基数字段：以订单上该字段为准（已扣券、会员折、积分抵现、砍价等应在落库时反映到此字段） */
const COMMISSION_BASE_FIELD = 'actual_price';

/**
 * 是否允许商品级固定佣金（commission_amount_1/2/3）
 * 环境变量 COMMISSION_ALLOW_PRODUCT_FIXED=0 时关闭，统一走比例（commission_rate_* 或全局比例）
 */
function allowProductFixedCommission() {
    const v = process.env.COMMISSION_ALLOW_PRODUCT_FIXED;
    if (v === undefined || v === '') return true;
    return v === '1' || v === 'true' || v === 'yes';
}

module.exports = {
    COMMISSION_BASE_FIELD,
    allowProductFixedCommission
};
