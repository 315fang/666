'use strict';

const DEFAULT_MINI_PROGRAM_CONFIG = {
    brand_config: {
        brand_name: '问兰',
        share_title: '问兰 · 品牌甄选',
        customer_service_wechat: 'wl_service',
        customer_service_hours: '9:00-21:00',
        nav_brand_title: '问兰镜像',
        nav_brand_sub: '品牌甄选',
        coupon_zone_title: '惊喜礼遇',
        coupon_zone_subtitle: '领券后下单可用',
        police_registration_title: '公安备案',
        police_registration_number: '苏公网安备32050802012518号',
        about_summary: '品牌甄选，值得信赖。',
        activity_share_title: '问兰 · 当季品牌活动进行中',
        logistics_page_title: '物流跟踪',
        tab_bar: {
            color: '#64748B',
            selectedColor: '#C6A16E',
            backgroundColor: '#F8FCFD',
            borderStyle: 'white',
            items: [
                { index: 0, text: '商城首页' },
                { index: 1, text: '全部商品' },
                { index: 2, text: '热门活动' },
                { index: 3, text: '我的会员' }
            ]
        }
    },
    feature_flags: {
        show_station_entry: true,
        show_pickup_entry: false,
        enable_logistics_entry: true,
        enable_lottery_entry: true
    },
    activity_page_config: {
        permanent_section_title: '常驻活动',
        permanent_section_desc: '长期可参与，随时进入',
        limited_section_title: '限时活动',
        limited_section_desc: '抓紧时间，过期即止',
        pending_toast: '活动筹备中'
    },
    lottery_config: {
        hero_title: '把积分换成一点仪式感',
        hero_subtitle: '奖池支持后台配置 emoji、配色和标签，小奖池也能做出活动感。',
        result_win_title: '恭喜，手气不错',
        result_miss_title: '这次差一点点'
    },
    membership_config: {
        login_agreement_hint: '登录后查看订单、积分、佣金等信息'
    },
    logistics_config: {
        shipping_mode: 'third_party',
        shipping_tracking_no_required: true,
        shipping_company_name_required: false,
        shipping_manual_tracking_page_enabled: true,
        manual_status_text: '商家已手工发货',
        manual_status_desc: '当前订单走手工发货模式，可查看单号和发货时间',
        manual_empty_traces_text: '当前为手工发货模式，暂不提供第三方物流轨迹',
        manual_refresh_toast: '手工发货模式无需刷新轨迹',
        shipping_company_options: ['顺丰速运', '申通快递', '中通快递', '圆通速递', '韵达速递', '京东快递', '邮政EMS', '极兔速递', '德邦快递', '同城配送']
    },
    customer_service_channel: {
        channel_service_phone: '',
        product_service_phone: '',
        qr_code_url: ''
    },
    withdrawal_config: {
        fee_rate_percent: 0,
        fee_cap_max: 0
    },
    light_prompt_modals: {
        coupon_usage: {
            enabled: true,
            title: '优惠券说明',
            body: '在结算页「礼遇与优惠」中选择可用券。'
        }
    },
    product_detail_pledges: { items: {} },
    feature_toggles: {}
};

const FIXED_BRAND_CARD_PRESETS = [
    {
        slot_index: 0,
        category_key: 'latest_activity',
        title: '最新活动',
        link_type: 'page',
        link_value: '/pages/index/brand-news-list?category_key=latest_activity'
    },
    {
        slot_index: 1,
        category_key: 'industry_frontier',
        title: '行业前沿',
        link_type: 'page',
        link_value: '/pages/index/brand-news-list?category_key=industry_frontier'
    },
    {
        slot_index: 2,
        category_key: 'mall_notice',
        title: '商城公告',
        link_type: 'page',
        link_value: '/pages/index/brand-news-list?category_key=mall_notice'
    }
];

function isPlainObject(value) {
    return Object.prototype.toString.call(value) === '[object Object]';
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function mergeDeep(base, override) {
    if (Array.isArray(base)) return Array.isArray(override) ? override : base;
    if (!isPlainObject(base)) return override === undefined ? base : override;
    const result = { ...base };
    const source = isPlainObject(override) ? override : {};
    Object.keys(source).forEach((key) => {
        result[key] = mergeDeep(base[key], source[key]);
    });
    return result;
}

function pickString(value, fallback = '') {
    if (value == null) return fallback;
    const text = String(value).trim();
    return text || fallback;
}

function pickAssetRef(source = {}) {
    const fileId = pickString(source.file_id || source.fileId);
    const direct = pickString(source.image_url || source.image || source.url || source.cover_image || source.coverImage);
    if (fileId) return fileId;
    return direct;
}

function isTemporarySignedAssetUrl(value = '') {
    const text = pickString(value).toLowerCase();
    if (!text || !/^https?:\/\//i.test(text)) return false;
    if (!text.includes('tcb.qcloud.la')) return false;
    return /[?&]sign=/.test(text) && /[?&]t=/.test(text);
}

function toBoolean(value) {
    if (value === true || value === 1 || value === '1') return true;
    const normalized = pickString(value).toLowerCase();
    if (!normalized) return false;
    return ['true', 'yes', 'y', 'on', 'enabled', 'active', 'show', 'visible', 'display'].includes(normalized);
}

function hasBrandZoneLegacyContent(homepageSettings = {}) {
    const endorsements = Array.isArray(homepageSettings.brand_endorsements) ? homepageSettings.brand_endorsements : [];
    const certifications = Array.isArray(homepageSettings.brand_certifications) ? homepageSettings.brand_certifications : [];
    return endorsements.length > 0 || certifications.length > 0 || !!pickString(homepageSettings.brand_story_body);
}

function getBrandCardPreset(input, index = 0) {
    const rawSlotIndex = input && input.slot_index;
    const slotIndex = rawSlotIndex === '' || rawSlotIndex === null || rawSlotIndex === undefined
        ? NaN
        : Number(rawSlotIndex);
    if (Number.isInteger(slotIndex) && FIXED_BRAND_CARD_PRESETS[slotIndex]) {
        return FIXED_BRAND_CARD_PRESETS[slotIndex];
    }
    const categoryKey = pickString(input && input.category_key);
    if (categoryKey) {
        const matched = FIXED_BRAND_CARD_PRESETS.find((item) => item.category_key === categoryKey);
        if (matched) return matched;
    }
    return FIXED_BRAND_CARD_PRESETS[index] || FIXED_BRAND_CARD_PRESETS[0];
}

function normalizeBrandConfigList(list = [], options = {}) {
    const withLink = !!options.withLink;
    return (Array.isArray(list) ? list : [])
        .map((item, index) => {
            if (typeof item === 'string') {
                const title = pickString(item);
                if (!title) return null;
                const preset = withLink ? getBrandCardPreset(null, index) : null;
                return {
                    title: withLink ? preset.title : title,
                    subtitle: '',
                    image: '',
                    file_id: '',
                    ...(withLink
                        ? {
                            slot_index: preset.slot_index,
                            category_key: preset.category_key,
                            link_type: preset.link_type,
                            link_value: preset.link_value
                        }
                        : {})
                };
            }
            if (!item || typeof item !== 'object') return null;
            const preset = withLink ? getBrandCardPreset(item, index) : null;
            const title = pickString(item.title || item.name || item.label);
            const subtitle = pickString(item.subtitle || item.desc || item.description);
            const fileId = pickString(item.file_id);
            const image = fileId || pickString(item.image || item.image_url || item.url);
            const linkType = withLink ? preset.link_type : 'none';
            const linkValue = withLink ? preset.link_value : '';
            if (!(title || subtitle || image || fileId || linkValue)) return null;
            return {
                title: withLink ? preset.title : (title || subtitle || '未命名内容'),
                subtitle,
                image,
                file_id: fileId,
                ...(withLink
                    ? {
                        slot_index: preset.slot_index,
                        category_key: preset.category_key,
                        link_type: linkType,
                        link_value: linkValue
                    }
                    : {})
            };
        })
        .filter(Boolean);
}

function normalizeTabBarConfig(tabBar = {}) {
    const merged = mergeDeep(DEFAULT_MINI_PROGRAM_CONFIG.brand_config.tab_bar, tabBar);
    if (!Array.isArray(merged.items) || merged.items.length < 4) {
        merged.items = clone(DEFAULT_MINI_PROGRAM_CONFIG.brand_config.tab_bar.items);
    }
    merged.items = merged.items.slice(0, 4).map((item, index) => ({
        index,
        text: pickString(item && item.text, DEFAULT_MINI_PROGRAM_CONFIG.brand_config.tab_bar.items[index].text)
    }));
    if (merged.borderStyle !== 'black' && merged.borderStyle !== 'white') {
        merged.borderStyle = DEFAULT_MINI_PROGRAM_CONFIG.brand_config.tab_bar.borderStyle;
    }
    return merged;
}

function normalizeMiniProgramConfig(rawConfig = {}) {
    const merged = mergeDeep(clone(DEFAULT_MINI_PROGRAM_CONFIG), rawConfig || {});
    merged.brand_config.tab_bar = normalizeTabBarConfig(merged.brand_config.tab_bar || {});
    if (!Array.isArray(merged.logistics_config.shipping_company_options)) {
        merged.logistics_config.shipping_company_options = clone(DEFAULT_MINI_PROGRAM_CONFIG.logistics_config.shipping_company_options);
    }
    merged.logistics_config.shipping_company_options = [...new Set(
        merged.logistics_config.shipping_company_options
            .map((item) => pickString(item))
            .filter(Boolean)
    )];
    if (!isPlainObject(merged.feature_toggles)) merged.feature_toggles = {};
    return merged;
}

function flattenHomeConfigs(miniProgramConfig = {}, homepageSettings = {}) {
    const brandConfig = miniProgramConfig.brand_config || {};
    const brandZoneEnabled = homepageSettings.brand_zone_enabled !== undefined
        ? toBoolean(homepageSettings.brand_zone_enabled)
        : hasBrandZoneLegacyContent(homepageSettings);
    return {
        brand_name: pickString(brandConfig.brand_name, DEFAULT_MINI_PROGRAM_CONFIG.brand_config.brand_name),
        share_title: pickString(brandConfig.share_title, DEFAULT_MINI_PROGRAM_CONFIG.brand_config.share_title),
        customer_service_wechat: pickString(brandConfig.customer_service_wechat, DEFAULT_MINI_PROGRAM_CONFIG.brand_config.customer_service_wechat),
        customer_service_hours: pickString(brandConfig.customer_service_hours, DEFAULT_MINI_PROGRAM_CONFIG.brand_config.customer_service_hours),
        nav_brand_title: pickString(homepageSettings.nav_brand_title || brandConfig.nav_brand_title, DEFAULT_MINI_PROGRAM_CONFIG.brand_config.nav_brand_title),
        nav_brand_sub: pickString(homepageSettings.nav_brand_sub || brandConfig.nav_brand_sub, DEFAULT_MINI_PROGRAM_CONFIG.brand_config.nav_brand_sub),
        coupon_zone_title: pickString(homepageSettings.coupon_zone_title || brandConfig.coupon_zone_title, DEFAULT_MINI_PROGRAM_CONFIG.brand_config.coupon_zone_title),
        coupon_zone_subtitle: pickString(homepageSettings.coupon_zone_subtitle || brandConfig.coupon_zone_subtitle, DEFAULT_MINI_PROGRAM_CONFIG.brand_config.coupon_zone_subtitle),
        police_registration_title: pickString(homepageSettings.police_registration_title || brandConfig.police_registration_title, DEFAULT_MINI_PROGRAM_CONFIG.brand_config.police_registration_title),
        police_registration_number: pickString(homepageSettings.police_registration_number || brandConfig.police_registration_number, DEFAULT_MINI_PROGRAM_CONFIG.brand_config.police_registration_number),
        show_brand_logo: homepageSettings.show_brand_logo !== undefined ? homepageSettings.show_brand_logo : true,
        brand_logo: pickString(homepageSettings.brand_logo),
        brand_zone_enabled: brandZoneEnabled,
        brand_zone_title: pickString(homepageSettings.brand_zone_title, '品牌专区'),
        brand_zone_cover: pickString(homepageSettings.brand_zone_cover),
        brand_zone_cover_file_id: pickString(homepageSettings.brand_zone_cover_file_id),
        brand_zone_welcome_title: pickString(homepageSettings.brand_zone_welcome_title, 'Welcome'),
        brand_zone_welcome_subtitle: pickString(homepageSettings.brand_zone_welcome_subtitle),
        bubble_enabled: homepageSettings.bubble_enabled !== undefined ? homepageSettings.bubble_enabled : true,
        bubble_limit: Number(homepageSettings.bubble_limit || 10),
        bubble_copy_order: pickString(homepageSettings.bubble_copy_order),
        bubble_copy_group_buy: pickString(homepageSettings.bubble_copy_group_buy),
        bubble_copy_slash: pickString(homepageSettings.bubble_copy_slash),
        official_promo_title: pickString(homepageSettings.official_promo_title),
        official_promo_subtitle: pickString(homepageSettings.official_promo_subtitle),
        official_promo_badge: pickString(homepageSettings.official_promo_badge, '官方宣传'),
        official_promo_cover: pickString(homepageSettings.official_promo_cover),
        brand_story_title: pickString(homepageSettings.brand_story_title, '企业介绍'),
        brand_story_body: pickString(homepageSettings.brand_story_body),
        brand_endorsements: normalizeBrandConfigList(homepageSettings.brand_endorsements, { withLink: true }).slice(0, 3),
        brand_certifications: normalizeBrandConfigList(homepageSettings.brand_certifications)
    };
}

function normalizeBannerList(list = []) {
    return (Array.isArray(list) ? list : []).map((item) => ({
        id: item.id || item._legacy_id || item._id || '',
        title: pickString(item.title),
        subtitle: pickString(item.subtitle),
        file_id: pickString(item.file_id),
        image_url: pickAssetRef(item),
        link_type: pickString(item.link_type, 'none'),
        link_value: pickString(item.link_value),
        position: pickString(item.position, 'home'),
        sort_order: Number(item.sort_order || 0),
        status: toBoolean(item.status ?? item.is_active ?? true)
    }));
}

function normalizePopupAdConfig(config = {}) {
    return {
        enabled: toBoolean(config.enabled),
        title: pickString(config.title),
        file_id: pickString(config.file_id),
        image_url: pickAssetRef(config),
        link_type: pickString(config.link_type, 'none'),
        link_value: pickString(config.link_value),
        button_text: pickString(config.button_text),
        frequency: pickString(config.frequency, 'once_daily')
    };
}

function normalizeSplashConfig(config = {}) {
    return {
        enabled: toBoolean(config.enabled ?? config.is_active ?? false),
        title: pickString(config.title),
        file_id: pickString(config.file_id),
        image_url: pickAssetRef(config),
        link_type: pickString(config.link_type, 'none'),
        link_value: pickString(config.link_value)
    };
}

function normalizeHomeContentPayload({ miniProgramConfig, homepageSettings, bannersByPosition, hotProducts, popupAd, layout, latestActivity, boards }) {
    const configs = flattenHomeConfigs(miniProgramConfig, homepageSettings);
    const banners = {
        home: normalizeBannerList(bannersByPosition.home || []),
        home_mid: normalizeBannerList(bannersByPosition.home_mid || []),
        home_bottom: normalizeBannerList(bannersByPosition.home_bottom || [])
    };
    const legacyPayload = {
        configs,
        banners,
        hot_products: Array.isArray(hotProducts) ? hotProducts : [],
        latestActivity: latestActivity || {},
        popupAd: normalizePopupAdConfig(popupAd),
        layout: layout || null,
        boards: boards || {}
    };
    return {
        ...legacyPayload,
        resources: {
            mini_program_config: miniProgramConfig,
            configs,
            banners,
            hot_products: Array.isArray(hotProducts) ? hotProducts : [],
            popup_ad: normalizePopupAdConfig(popupAd),
            layout: layout || null,
            latest_activity: latestActivity || {},
            boards: boards || {},
            legacy_payload: legacyPayload
        }
    };
}

module.exports = {
    DEFAULT_MINI_PROGRAM_CONFIG,
    normalizeMiniProgramConfig,
    normalizePopupAdConfig,
    normalizeSplashConfig,
    normalizeHomeContentPayload,
    flattenHomeConfigs
};
