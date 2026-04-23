const BRAND_NEWS_CATEGORY_DEFS = [
    {
        key: 'latest_activity',
        title: '最新活动',
        pagePath: '/pages/index/brand-news-list?category_key=latest_activity'
    },
    {
        key: 'industry_frontier',
        title: '行业前沿',
        pagePath: '/pages/index/brand-news-list?category_key=industry_frontier'
    },
    {
        key: 'mall_notice',
        title: '商城公告',
        pagePath: '/pages/index/brand-news-list?category_key=mall_notice'
    }
];

const BRAND_NEWS_CATEGORY_ALIAS_MAP = {
    latest_activity: 'latest_activity',
    '最新活动': 'latest_activity',
    latest: 'latest_activity',
    activity: 'latest_activity',
    activities: 'latest_activity',
    news: 'latest_activity',
    newest: 'latest_activity',
    industry_frontier: 'industry_frontier',
    '行业前沿': 'industry_frontier',
    industry: 'industry_frontier',
    frontier: 'industry_frontier',
    trend: 'industry_frontier',
    mall_notice: 'mall_notice',
    '商城公告': 'mall_notice',
    notice: 'mall_notice',
    notices: 'mall_notice',
    announcement: 'mall_notice',
    announcements: 'mall_notice'
};

function normalizeBrandNewsCategoryKey(value, fallback = 'latest_activity') {
    const raw = String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, '_');
    return BRAND_NEWS_CATEGORY_ALIAS_MAP[raw] || fallback;
}

function getBrandNewsCategoryDefs() {
    return BRAND_NEWS_CATEGORY_DEFS.slice();
}

function getBrandNewsCategoryDef(key) {
    const normalizedKey = normalizeBrandNewsCategoryKey(key);
    return BRAND_NEWS_CATEGORY_DEFS.find((item) => item.key === normalizedKey) || BRAND_NEWS_CATEGORY_DEFS[0];
}

function buildBrandNewsListPagePath(key) {
    return getBrandNewsCategoryDef(key).pagePath;
}

module.exports = {
    BRAND_NEWS_CATEGORY_DEFS,
    normalizeBrandNewsCategoryKey,
    getBrandNewsCategoryDefs,
    getBrandNewsCategoryDef,
    buildBrandNewsListPagePath
};
