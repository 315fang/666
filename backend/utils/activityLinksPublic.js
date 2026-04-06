/**
 * 活动页链接配置：面向小程序/公开接口的清洗（排序、下架隐藏项、整区关闭常驻等）
 */

function sortByOrder(arr) {
    return [...(arr || [])].sort(
        (a, b) => (parseInt(a.sort_order, 10) || 0) - (parseInt(b.sort_order, 10) || 0)
    );
}

function sanitizeBrandNewsForPublic(list = []) {
    return sortByOrder(list)
        .filter((n) => n.enabled !== false && String(n.title || '').trim())
        .map((n) => ({
            id: n.id,
            title: String(n.title || '').trim(),
            summary: String(n.summary || '').trim().slice(0, 500),
            cover_image: String(n.cover_image || n.image || '').trim(),
            sort_order: parseInt(n.sort_order, 10) || 0
        }));
}

/**
 * @param {object} raw - AppConfig 中 activity_links_config 解析后的对象
 * @returns {object} { permanent_section_enabled, activity_sections_order, banners, permanent, limited, brand_news, brand_news_section_title }
 */
function sanitizeActivityLinksForPublic(raw = {}) {
    const permanentEnabled = raw.permanent_section_enabled !== false;
    const order = raw.activity_sections_order === 'limited_first' ? 'limited_first' : 'permanent_first';
    let permanent = sortByOrder(raw.permanent || []).filter((p) => p.enabled !== false);
    if (!permanentEnabled) {
        permanent = [];
    }
    const now = Date.now();
    const limited = sortByOrder(raw.limited || []).filter((item) => {
        if (!item.end_time) return true;
        return new Date(item.end_time).getTime() > now;
    });
    const title = String(raw.brand_news_section_title || '品牌动态').trim().slice(0, 12) || '品牌动态';
    return {
        permanent_section_enabled: permanentEnabled,
        activity_sections_order: order,
        banners: sortByOrder(raw.banners || []),
        permanent,
        limited,
        brand_news: sanitizeBrandNewsForPublic(raw.brand_news || []),
        brand_news_section_title: title
    };
}

module.exports = {
    sanitizeActivityLinksForPublic,
    sanitizeBrandNewsForPublic,
    sortActivityLinksByOrder: sortByOrder
};
