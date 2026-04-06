const FALLBACK_SECTION_CONFIG = {
    special: {
        id: 'activity-section-special',
        key: 'special',
        title: '特惠专区',
        subtitle: '进入全部商品查看拼团与砍价好物',
        tag: '',
        image: '',
        gradient: 'linear-gradient(135deg, #7C2D12 0%, #FB7185 100%)',
        moreLinkType: 'category',
        moreLinkValue: '__marketing__',
        fallbackPreviewTitle: '进入特惠专区',
        fallbackPreviewSubtitle: '集中查看拼团、砍价与多重优惠商品'
    },
    slash: {
        id: 'activity-section-slash',
        key: 'slash',
        title: '砍价专区',
        subtitle: '进入砍价列表页发起或查看活动',
        tag: '',
        image: '',
        gradient: 'linear-gradient(135deg, #5A3207 0%, #D6A84E 100%)',
        moreLinkType: 'page',
        moreLinkValue: '/pages/slash/list',
        fallbackPreviewTitle: '进入砍价专区',
        fallbackPreviewSubtitle: '查看当前可参与的砍价活动'
    },
    group: {
        id: 'activity-section-group',
        key: 'group',
        title: '拼团活动',
        subtitle: '进入拼团列表页后选择商品',
        tag: '',
        image: '',
        gradient: 'linear-gradient(135deg, #1C3048 0%, #3C79B8 100%)',
        moreLinkType: 'page',
        moreLinkValue: '/pages/group/list',
        fallbackPreviewTitle: '进入拼团活动',
        fallbackPreviewSubtitle: '查看当前可参与的拼团内容'
    },
    lottery: {
        id: 'activity-section-lottery',
        key: 'lottery',
        title: '积分抽奖',
        subtitle: '进入抽奖页面参与当前奖池',
        tag: '',
        image: '',
        gradient: 'linear-gradient(135deg, #0C2A1A 0%, #0E6D43 100%)',
        moreLinkType: 'page',
        moreLinkValue: '/pages/lottery/lottery',
        fallbackPreviewTitle: '进入积分抽奖',
        fallbackPreviewSubtitle: '查看当前奖池与抽奖入口'
    }
};

const SECTION_ORDER = ['slash', 'group', 'lottery'];

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

    if (linkType === 'category' && linkValue === '__marketing__') return 'special';
    if (linkType === 'slash') return 'slash';
    if (linkType === 'group_buy') return 'group';
    if (linkType === 'lottery') return 'lottery';

    if (linkValue === '__marketing__') return 'special';
    if (linkValue.includes('/pages/slash/')) return 'slash';
    if (linkValue.includes('/pages/group/')) return 'group';
    if (linkValue.includes('/pages/lottery/')) return 'lottery';

    if (title.includes('特惠')) return 'special';
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

function buildSectionRow(key, sourceMap) {
    const fallback = FALLBACK_SECTION_CONFIG[key];
    const source = sourceMap[key] || {};
    return {
        id: source.id || fallback.id,
        key,
        title: normalizeText(source.title) || fallback.title,
        subtitle: normalizeText(source.subtitle || source.subTitle) || fallback.subtitle,
        tag: normalizeText(source.tag),
        image: normalizeText(source.image || source.image_url || source.cover_image || source.coverImage),
        gradient: normalizeText(source.gradient) || fallback.gradient,
        moreLinkType: normalizeLinkType(source) || fallback.moreLinkType,
        moreLinkValue: normalizeLinkValue(source) || fallback.moreLinkValue
    };
}

function toPreviewItem(raw = {}, section, index = 0) {
    const base = {
        id: raw.id || `${section}-preview-${index}`,
        title: '',
        subtitle: '',
        linkType: FALLBACK_SECTION_CONFIG[section].moreLinkType,
        linkValue: FALLBACK_SECTION_CONFIG[section].moreLinkValue
    };

    if (section === 'slash') {
        return {
            ...base,
            id: raw.id || `slash-preview-${index}`,
            title: normalizeText(raw.product && raw.product.name) || normalizeText(raw.title) || '砍价活动',
            subtitle: normalizeText(raw._summary) || (raw.expire_hours ? `${raw.expire_hours}小时内有效` : ''),
            linkType: 'page',
            linkValue: raw.id ? `/pages/slash/list?activity_id=${encodeURIComponent(String(raw.id))}` : base.linkValue
        };
    }

    if (section === 'group') {
        return {
            ...base,
            id: raw.id || `group-preview-${index}`,
            title: normalizeText(raw.product && raw.product.name) || normalizeText(raw.title) || '拼团活动',
            subtitle: normalizeText(raw._summary) || (raw.min_members ? `${raw.min_members}人成团` : ''),
            linkType: 'page',
            linkValue: raw.id ? `/pages/group/list?activity_id=${encodeURIComponent(String(raw.id))}` : base.linkValue
        };
    }

    if (section === 'special') {
        return {
            ...base,
            id: raw.id || `special-preview-${index}`,
            title: normalizeText(raw.title) || '进入特惠专区',
            subtitle: normalizeText(raw.subtitle) || '',
            linkType: 'category',
            linkValue: '__marketing__'
        };
    }

    return {
        ...base,
        id: raw.id != null && String(raw.id).trim() !== ''
            ? String(raw.id).trim()
            : (normalizeText(raw.name) ? `${normalizeText(raw.name)}#${index}` : `lottery-preview-${index}`),
        title: normalizeText(raw.name) || '积分抽奖',
        subtitle: normalizeText(raw.display_value),
        linkType: 'page',
        linkValue: base.linkValue
    };
}

function buildFallbackPreview(section) {
    const fallback = FALLBACK_SECTION_CONFIG[section];
    return [{
        id: `fallback-${section}`,
        title: fallback.fallbackPreviewTitle,
        subtitle: fallback.fallbackPreviewSubtitle,
        linkType: fallback.moreLinkType,
        linkValue: fallback.moreLinkValue
    }];
}

function buildPreviewList(section, items) {
    const normalized = (items || [])
        .map((item, index) => toPreviewItem(item, section, index))
        .filter((item) => item.title && item.linkType && item.linkValue)
        .slice(0, 3)
        .map((item) => ({
            ...item,
            subtitle: normalizeText(item.subtitle)
        }));

    return normalized.length ? normalized : buildFallbackPreview(section);
}

function buildActivitySections({
    permanentActivities = [],
    slashActivities = [],
    groupActivities = [],
    lotteryPrizes = []
}) {
    const sourceMap = pickSectionSource(permanentActivities);
    const sections = [];
    if (sourceMap.special) {
        sections.push(buildSectionRow('special', sourceMap));
    }
    sections.push(...SECTION_ORDER.map((key) => buildSectionRow(key, sourceMap)));

    const previewMap = {
        slash: buildPreviewList('slash', slashActivities),
        group: buildPreviewList('group', groupActivities),
        lottery: buildPreviewList('lottery', lotteryPrizes)
    };
    if (sourceMap.special) {
        previewMap.special = buildFallbackPreview('special');
    }

    return {
        sections,
        previewMap
    };
}

module.exports = {
    buildActivitySections
};
