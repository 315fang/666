const FALLBACK_SECTION_CONFIG = {
    flash_sale: {
        id: 'activity-section-flash-sale',
        key: 'flash_sale',
        title: '限时秒杀',
        subtitle: '限时专享，抢完即止',
        icon: '/assets/icons/clock.svg',
        pillText: '主推活动',
        tag: '',
        image: '',
        gradient: 'linear-gradient(135deg, #7C2D12 0%, #FB7185 100%)',
        moreLinkType: 'flash_sale',
        moreLinkValue: '__flash_sale__'
    },
    coupon_center: {
        id: 'activity-section-coupon-center',
        key: 'coupon_center',
        title: '优惠券中心',
        subtitle: '查看全部可用券',
        icon: '/assets/icons/credit-card.svg',
        pillText: '常驻入口',
        tag: '',
        image: '',
        gradient: 'linear-gradient(135deg, #1D4ED8 0%, #38BDF8 100%)',
        moreLinkType: 'coupon_center',
        moreLinkValue: '__coupon_center__'
    },
    lottery: {
        id: 'activity-section-lottery',
        key: 'lottery',
        title: '积分抽奖',
        subtitle: '消耗积分参与抽奖',
        icon: '/assets/icons/star.svg',
        pillText: '常驻入口',
        tag: '',
        image: '',
        gradient: 'linear-gradient(135deg, #0C2A1A 0%, #0E6D43 100%)',
        moreLinkType: 'lottery',
        moreLinkValue: ''
    },
    group: {
        id: 'activity-section-group',
        key: 'group',
        title: '拼团',
        subtitle: '查看当前拼团好物',
        icon: '/assets/icons/users.svg',
        pillText: '常驻入口',
        tag: '',
        image: '',
        gradient: 'linear-gradient(135deg, #1C3048 0%, #3C79B8 100%)',
        moreLinkType: 'group_buy',
        moreLinkValue: ''
    },
    slash: {
        id: 'activity-section-slash',
        key: 'slash',
        title: '砍价',
        subtitle: '继续发起或查看进度',
        icon: '/assets/icons/tag.svg',
        pillText: '常驻入口',
        tag: '',
        image: '',
        gradient: 'linear-gradient(135deg, #5A3207 0%, #D6A84E 100%)',
        moreLinkType: 'slash',
        moreLinkValue: ''
    }
};

const SECTION_ORDER = ['flash_sale', 'coupon_center', 'lottery', 'group', 'slash'];

function normalizeText(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeLinkType(item = {}) {
    return normalizeText(item.link_type || item.linkType || '');
}

function normalizeLinkValue(item = {}) {
    if (item.link_value != null) return String(item.link_value).trim();
    if (item.linkValue != null) return String(item.linkValue).trim();
    return '';
}

function detectSectionKey(item = {}) {
    const linkType = normalizeLinkType(item);
    const linkValue = normalizeLinkValue(item);
    const title = normalizeText(item.title);

    if (linkType === 'flash_sale') return 'flash_sale';
    if (linkType === 'coupon_center') return 'coupon_center';
    if (linkType === 'slash') return 'slash';
    if (linkType === 'group_buy') return 'group';
    if (linkType === 'lottery') return 'lottery';

    if (linkValue === '__flash_sale__' || linkValue.includes('/pages/activity/limited-spot')) return 'flash_sale';
    if (linkValue === '__coupon_center__' || linkValue.includes('/pages/coupon/list')) return 'coupon_center';
    if (linkValue.includes('/pages/slash/')) return 'slash';
    if (linkValue.includes('/pages/group/')) return 'group';
    if (linkValue.includes('/pages/lottery/')) return 'lottery';

    if (title.includes('秒杀') || title.includes('特惠')) return 'flash_sale';
    if (title.includes('优惠券')) return 'coupon_center';
    if (title.includes('砍价')) return 'slash';
    if (title.includes('拼团')) return 'group';
    if (title.includes('抽奖')) return 'lottery';

    return '';
}

function pickSectionSource(permanentActivities = []) {
    const map = {};
    (permanentActivities || []).forEach((item) => {
        const key = detectSectionKey(item);
        if (key && !map[key]) {
            map[key] = item;
        }
    });
    return map;
}

function buildSectionRow(key, sourceMap, overrides = {}) {
    const fallback = FALLBACK_SECTION_CONFIG[key];
    const source = sourceMap[key] || {};
    const styleKey = normalizeText(source.style_key || source.styleKey) || key;
    const stylePreset = FALLBACK_SECTION_CONFIG[styleKey] || fallback;
    return {
        id: source.id || fallback.id,
        key,
        styleKey,
        title: normalizeText(source.title) || fallback.title,
        subtitle: normalizeText(source.subtitle || source.subTitle) || fallback.subtitle,
        icon: normalizeText(source.icon) || stylePreset.icon,
        pillText: normalizeText(source.pill_text || source.pillText) || stylePreset.pillText || '',
        tag: normalizeText(source.tag),
        image: normalizeText(source.file_id || source.image || source.image_url || source.cover_image || source.coverImage),
        gradient: normalizeText(source.gradient) || stylePreset.gradient,
        moreLinkType: normalizeLinkType(source) || fallback.moreLinkType,
        moreLinkValue: normalizeLinkValue(source) || fallback.moreLinkValue,
        ...overrides
    };
}

function buildActivitySections({
    permanentActivities = [],
    limitedActivities = [],
    permanentSectionTitle = '',
    permanentSectionSubtitle = ''
}) {
    const sourceMap = pickSectionSource(permanentActivities);
    const defaultFlashSaleValue = Array.isArray(limitedActivities) && limitedActivities.length > 0
        ? String(limitedActivities[0].id || '').trim()
        : '__flash_sale__';

    const permanentSection = {
        id: 'activity-section-permanent',
        key: 'permanent',
        title: normalizeText(permanentSectionTitle) || '热门活动',
        subtitle: normalizeText(permanentSectionSubtitle) || '优先展示平台主推入口',
        subCards: SECTION_ORDER.map((key) => {
            if (key === 'flash_sale') {
                return buildSectionRow(key, sourceMap, {
                    moreLinkValue: normalizeLinkValue(sourceMap[key]) || defaultFlashSaleValue
                });
            }
            return buildSectionRow(key, sourceMap);
        })
    };

    return {
        sections: [permanentSection],
        previewMap: {}
    };
}

module.exports = {
    buildActivitySections
};
