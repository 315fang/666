'use strict';

const DEFAULT_MINI_PROGRAM_CONFIG = {
    brand_config: {
        brand_name: '问兰',
        share_title: '问兰 · 品牌甄选',
        customer_service_wechat: 'wl_service',
        customer_service_hours: '9:00-21:00',
        nav_brand_title: '问兰镜像',
        nav_brand_sub: '品牌甄选',
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
                { index: 3, text: '我的' }
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
        login_agreement_hint: '登录后查看订单、积分、佣金等信息',
        growth_privileges_entry_text: '查看权益',
        growth_privileges_page_title: '权益中心',
        membership_center_page_title: '权益中心'
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
        shipping_company_options: ['顺丰速运', '申通快递', '中通快递', '圆通速递', '韵达速递', '京东快递', '邮政EMS', '极兔速递', '德邦快递', '同城配送'],
        return_address: {
            receiver_name: '',
            receiver_phone: '',
            province: '',
            city: '',
            district: '',
            detail: '',
            postal_code: '',
            note: ''
        }
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
    return pickString(source.file_id || source.image_url || source.image || source.url || source.cover_image || source.coverImage);
}

function normalizeTabBarConfig(tabBar = {}) {
    const rawMerged = mergeDeep(DEFAULT_MINI_PROGRAM_CONFIG.brand_config.tab_bar, isPlainObject(tabBar) ? tabBar : {});
    const merged = isPlainObject(rawMerged)
        ? rawMerged
        : clone(DEFAULT_MINI_PROGRAM_CONFIG.brand_config.tab_bar);
    const rawItems = Array.isArray(merged.items) ? merged.items.filter((item) => item && typeof item === 'object') : [];
    if (rawItems.length < 4) {
        merged.items = clone(DEFAULT_MINI_PROGRAM_CONFIG.brand_config.tab_bar.items);
    } else {
        merged.items = rawItems;
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
    merged.brand_config = isPlainObject(merged.brand_config)
        ? merged.brand_config
        : clone(DEFAULT_MINI_PROGRAM_CONFIG.brand_config);
    merged.brand_config.tab_bar = normalizeTabBarConfig(merged.brand_config.tab_bar);
    merged.logistics_config = isPlainObject(merged.logistics_config)
        ? merged.logistics_config
        : clone(DEFAULT_MINI_PROGRAM_CONFIG.logistics_config);
    if (!Array.isArray(merged.logistics_config.shipping_company_options)) {
        merged.logistics_config.shipping_company_options = clone(DEFAULT_MINI_PROGRAM_CONFIG.logistics_config.shipping_company_options);
    }
    merged.logistics_config.shipping_company_options = [...new Set(
        merged.logistics_config.shipping_company_options
            .map((item) => pickString(item))
            .filter(Boolean)
    )];
    merged.logistics_config.return_address = isPlainObject(merged.logistics_config.return_address)
        ? mergeDeep(clone(DEFAULT_MINI_PROGRAM_CONFIG.logistics_config.return_address), merged.logistics_config.return_address)
        : clone(DEFAULT_MINI_PROGRAM_CONFIG.logistics_config.return_address);
    merged.product_detail_pledges = isPlainObject(merged.product_detail_pledges)
        ? merged.product_detail_pledges
        : clone(DEFAULT_MINI_PROGRAM_CONFIG.product_detail_pledges);
    if (!isPlainObject(merged.product_detail_pledges.items)) {
        merged.product_detail_pledges.items = clone(DEFAULT_MINI_PROGRAM_CONFIG.product_detail_pledges.items);
    }
    if (!isPlainObject(merged.feature_toggles)) merged.feature_toggles = {};
    return merged;
}

function normalizePopupAdConfig(config = {}) {
    return {
        enabled: !!config.enabled,
        title: pickString(config.title),
        file_id: pickString(config.file_id),
        image_url: pickAssetRef(config),
        link_type: pickString(config.link_type, 'none'),
        link_value: pickString(config.link_value),
        button_text: pickString(config.button_text),
        frequency: pickString(config.frequency, 'once_daily')
    };
}

function normalizeHomeSectionRecord(section = {}) {
    return {
        ...section,
        id: section.id || section._legacy_id || section._id,
        section_key: pickString(section.section_key || section.board_key || section.key || ''),
        section_name: pickString(section.section_name || section.board_name || section.name || section.title || ''),
        section_type: pickString(section.section_type || section.board_type || 'product_board'),
        title: pickString(section.title),
        subtitle: pickString(section.subtitle),
        is_visible: section.is_visible === undefined ? 1 : (section.is_visible ? 1 : 0),
        sort_order: Number(section.sort_order || 0),
        config: section.config && typeof section.config === 'object' ? section.config : {}
    };
}

module.exports = {
    normalizeMiniProgramConfig,
    normalizePopupAdConfig,
    normalizeHomeSectionRecord
};
