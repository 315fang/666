/**
 * 商品级佣金「比例」字段与 CommissionService 对齐：
 * 计算时使用 actualPrice * rate，其中 rate 为 0～1 的小数（如 0.2 表示 20%）。
 *
 * 管理端表单可能以「百分数」输入（如 20），提交前应在网关或此处归一化。
 * 若传入值 > 1，视为百分数并除以 100；否则视为已是小数。
 */
function normalizeProductCommissionRate(val) {
    if (val === undefined || val === null || val === '') return 0;
    const n = parseFloat(val);
    if (!Number.isFinite(n) || n < 0) return 0;
    if (n > 1) return Math.min(n / 100, 1);
    return n;
}

module.exports = { normalizeProductCommissionRate };
