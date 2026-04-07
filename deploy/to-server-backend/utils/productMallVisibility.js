/**
 * 商城货架可见性：与 Product.visible_in_mall 一致
 * - 列表/搜索/热门/分类内嵌列表等用 MALL_LIST_WHERE
 * - 详情、限时专享、订单等不按此字段拦截（仍要求 status 上架）
 */

const MALL_LIST_WHERE = { visible_in_mall: true };

/** 嵌套 product 对象（榜单等）是否应对 C 端展示 */
function isMallVisibleProductRow(p) {
    if (!p) return false;
    const v = p.visible_in_mall;
    if (v === undefined || v === null) return true;
    return v === true || v === 1 || v === '1';
}

module.exports = { MALL_LIST_WHERE, isMallVisibleProductRow };
