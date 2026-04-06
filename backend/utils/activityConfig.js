const DEFAULT_POSTER_GRADIENT = 'linear-gradient(135deg, #2C231C 0%, #473326 100%)';

const normalizeActivityLink = ({ link_type, link_value, legacyLink, fallbackType = 'none' } = {}) => {
    const resolvedType = link_type || (legacyLink ? 'page' : fallbackType);
    const resolvedValue = link_value || legacyLink || '';

    return {
        link_type: resolvedType || 'none',
        link_value: resolvedValue
    };
};

const normalizeCardPoster = (item = {}, idx = 0) => {
    const link = normalizeActivityLink({
        link_type: item.link_type,
        link_value: item.link_value,
        legacyLink: item.link
    });

    return {
        id: item.id || idx + 1,
        title: item.title || '活动主题',
        subTitle: item.subTitle || item.subtitle || '',
        image: item.image || item.image_url || '',
        gradient: item.gradient || DEFAULT_POSTER_GRADIENT,
        source_type: item.source_type || '',
        source_id: item.source_id ?? null,
        link_type: link.link_type,
        link_value: link.link_value,
        link: link.link_type === 'page' ? link.link_value : ''
    };
};

const normalizeFestivalConfig = (raw = {}) => {
    const cta = normalizeActivityLink({
        link_type: raw.cta_link_type,
        link_value: raw.cta_link_value,
        legacyLink: raw.ctaPath
    });

    return {
        ...raw,
        cta_link_type: cta.link_type,
        cta_link_value: cta.link_value,
        ctaPath: cta.link_type === 'page' ? cta.link_value : '',
        card_posters: Array.isArray(raw.card_posters)
            ? raw.card_posters.map((item, idx) => normalizeCardPoster(item, idx))
            : []
    };
};

const getActivityOptionKey = (linkType, linkValue) => `${linkType || 'none'}:${linkValue || ''}`;

module.exports = {
    DEFAULT_POSTER_GRADIENT,
    normalizeActivityLink,
    normalizeCardPoster,
    normalizeFestivalConfig,
    getActivityOptionKey
};
