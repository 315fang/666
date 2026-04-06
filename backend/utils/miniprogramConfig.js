const MINIPROGRAM_CONFIG_CATEGORY = 'mini_program';

// ★ 首页导航栏品牌 Logo 区（nav_brand_title / nav_brand_sub）当前已被"气泡足迹"替代，
//    暂不在首页展示 Logo / 品牌甄选文案。
//    若后续需要恢复，在小程序首页 index.wxml 中把 nav-bubble-bar 换回 nav-brand 即可。
const DEFAULT_MINIPROGRAM_CONFIG = {
    brand_config: {
        brand_name: '问兰',
        share_title: '问兰 · 品牌甄选',
        customer_service_wechat: 'wl_service',
        customer_service_hours: '9:00-21:00',
        nav_brand_title: '问兰镜像',   // 暂未在首页顶部展示，保留供其他页面复用
        nav_brand_sub: '品牌甄选',     // 同上
        about_summary: '品牌甄选，值得信赖。',
        app_version_text: 'v1.0.0',
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
        show_station_entry: false,
        show_pickup_entry: false,
        enable_logistics_entry: true,
        enable_lottery_entry: true
    },
    activity_page_config: {
        default_banners: [
            {
                id: 'b1',
                title: '品牌活动中心',
                subtitle: '精选活动，随时参与',
                tag: '',
                image: '',
                gradient: 'linear-gradient(135deg, #1E4A6D 0%, #155E63 100%)',
                link_type: 'none',
                link_value: ''
            }
        ],
        default_permanent_activities: [
            {
                id: 'p1',
                title: '拼团专区',
                subtitle: '多人拼团，价格更优',
                tag: '常驻',
                image: '',
                gradient: 'linear-gradient(135deg, #0F766E 0%, #0D9488 100%)',
                link_type: 'page',
                link_value: '/pages/group/list'
            },
            {
                id: 'p2',
                title: '砍价专区',
                subtitle: '邀请好友帮砍，全场通用',
                tag: '常驻',
                image: '',
                gradient: 'linear-gradient(135deg, #1E4A6D 0%, #2E6B94 100%)',
                link_type: 'page',
                link_value: '/pages/slash/list'
            },
            {
                id: 'p3',
                title: '积分抽奖',
                subtitle: '用积分赢取当前奖池好礼',
                tag: '常驻',
                image: '',
                gradient: 'linear-gradient(135deg, #155E63 0%, #14B8A6 100%)',
                link_type: 'page',
                link_value: '/pages/lottery/lottery'
            }
        ],
        permanent_section_title: '常驻活动',
        permanent_section_desc: '长期可参与，随时进入',
        limited_section_title: '限时活动',
        limited_section_desc: '抓紧时间，过期即止',
        empty_permanent_text: '暂无常驻活动',
        empty_limited_text: '暂无限时活动，敬请期待',
        pending_toast: '活动筹备中'
    },
    membership_config: {
        group_buy_start_requirement_text: '发起拼团需要会员身份，请先完成首单成为会员',
        slash_start_requirement_text: '发起砍价需满足当前活动规则',
        pickup_station_pending_text: '自提站点建设中，暂未开放',
        pickup_code_pending_text: '自提核销码功能建设中',
        login_agreement_hint: '登录后查看订单、积分、佣金等信息',
        // 小程序「我的」中「商务中心」入口最低 role_level（0游客 1初级代理/C1 2高级/C2 3推广合伙人…）；后台可覆盖 JSON
        business_center_min_role_level: 1,
        // 「我的」成长值进度条下方文案：占位符 {next}=下一档名称 {need}=还差成长值（整数）
        growth_bar_subtitle_template: '距离「{next}」还需 {need} 成长值',
        growth_bar_max_tier_text: '您已达到当前成长体系最高档位',
        growth_privileges_entry_text: '查看权益',
        growth_privileges_page_title: '成长值与权益说明'
    },
    lottery_config: {
        hero_title: '把积分换成一点仪式感',
        hero_subtitle: '奖池支持后台配置 emoji、配色和标签，小奖池也能做出活动感。',
        panel_title: '幸运转盘',
        panel_subtitle: '命中后会停在对应奖格，结果直接同步到记录里',
        result_win_title: '恭喜，手气不错',
        result_miss_title: '这次差一点点',
        empty_record_text: '暂无记录，快来抽奖吧'
    },
    group_buy_config: {
        share_title_template: '{brand_name} · {product_name} 拼团进行中',
        join_button_text: '去拼团',
        status_texts: {
            open: '拼团中',
            success: '已成团',
            failed: '拼团失败'
        }
    },
    slash_config: {
        share_title_template: '帮我砍一刀！{product_name} 只差一点就到底价了',
        buy_button_text: '立即购买',
        help_hint_text: '邀请好友帮你再砍一刀'
    },
    logistics_config: {
        shipping_mode: 'third_party',
        shipping_tracking_no_required: true,
        shipping_company_name_required: false,
        shipping_manual_tracking_page_enabled: true,
        manual_status_text: '商家已手工发货',
        manual_status_desc: '当前订单走手工发货模式，可查看单号和发货时间',
        manual_empty_traces_text: '当前为手工发货模式，暂不提供第三方物流轨迹',
        manual_refresh_toast: '手工发货模式无需刷新轨迹'
    },
    /** 小程序「我的 → 客服通道」：电话可点呼；二维码为 HTTPS 图片地址（须在小程序下载域名白名单内） */
    customer_service_channel: {
        channel_service_phone: '',
        product_service_phone: '',
        qr_code_url: ''
    },
    /**
     * 小程序轻度说明弹窗：后台可单独开关与改文案；前端按场景触发（结算页优惠券、积分签到、新人注册礼券）
     */
    light_prompt_modals: {
        coupon_usage: {
            enabled: true,
            title: '优惠券说明',
            body: '在结算页「礼遇与优惠」中选择可用券。请留意满减门槛与适用商品范围；每笔订单一般限用一张，以券面及结算页为准。'
        },
        points_checkin: {
            enabled: true,
            title: '签到与积分',
            body: '每日签到可获得积分，连续签到更有额外惊喜。积分可在下单结算时抵扣部分金额（规则以结算页为准），也可用于积分活动等。'
        },
        register_coupon: {
            enabled: true,
            /** 为 true 时，即使未自动发放到券包也弹出说明（仅新用户） */
            show_without_coupon: false,
            title: '新人礼券',
            body: '欢迎加入！新人礼券已发放至「我的 · 优惠券」，请在有效期内使用。面额、门槛以券面展示为准。',
            /** 当 register_coupons_issued > 0 时优先使用；支持占位符 {count} 表示发放张数 */
            body_when_issued: '欢迎加入！已为您发放 {count} 张优惠券，可前往「我的 · 优惠券」查看，请在有效期内于结算页使用。'
        }
    },
    common_copy: {
        load_failed_text: '加载失败',
        retry_text: '点击重试',
        no_logistics_text: '暂无物流信息',
        copy_success_text: '单号已复制'
    },
    asset_map: {
        default_avatar: '/assets/images/default-avatar.svg',
        default_product_image: '/assets/images/placeholder.svg',
        default_package_icon: '/assets/icons/package.svg'
    },
    /**
     * 提现手续费（小程序侧运营偏好）：显式保存后才覆盖 WITHDRAWAL 分类中的 FEE_RATE / FEE_CAP_MAX
     * fee_rate_percent: 0～100；fee_cap_max: 元/笔，0 表示不封顶
     */
    withdrawal_config: {},
    /**
     * 商品详情页服务承诺（标签 + 文案）：后台按项开关并自定义标题/说明
     */
    product_detail_pledges: {
        items: {
            seven_day: {
                enabled: true,
                title: '7天无理由退货',
                desc: '签收后 7 天内可申请售后（定制、鲜活易腐等依法不适用情形除外，以审核为准）。'
            },
            return_shipping: {
                enabled: true,
                title: '退货运费说明',
                desc: '因质量问题或发错货，退货运费由商家承担；无理由退货一般运费由买家承担，具体以售后审核为准。'
            },
            brand_guarantee: {
                enabled: true,
                title: '品牌保证',
                desc: '正规渠道供货，支持验货与平台/客服协助处理争议。'
            },
            authentic: {
                enabled: true,
                title: '官方正品',
                desc: '品牌授权或官方合作供应链，假劣投诉可联系客服处理。'
            },
            shipping_promise: {
                enabled: false,
                title: '发货时效',
                desc: '现货订单在付款后尽快发出；预售以商品页说明为准。'
            },
            after_sale: {
                enabled: true,
                title: '售后无忧',
                desc: '订单问题可联系在线客服，协助处理退换与物流咨询。'
            }
        }
    }
};

const MINIPROGRAM_CONFIG_KEYS = Object.keys(DEFAULT_MINIPROGRAM_CONFIG);

/** 商品详情服务承诺展示顺序（与后台表单项一致） */
const PRODUCT_DETAIL_PLEDGE_ORDER = [
    'seven_day',
    'return_shipping',
    'brand_guarantee',
    'authentic',
    'shipping_promise',
    'after_sale'
];

function cloneDefaults() {
    return JSON.parse(JSON.stringify(DEFAULT_MINIPROGRAM_CONFIG));
}

function isPlainObject(value) {
    return Object.prototype.toString.call(value) === '[object Object]';
}

function mergeDeep(base, override) {
    if (Array.isArray(base)) {
        return Array.isArray(override) ? override : base;
    }
    if (!isPlainObject(base)) {
        return override === undefined ? base : override;
    }

    const result = { ...base };
    const source = isPlainObject(override) ? override : {};
    Object.keys(source).forEach((key) => {
        result[key] = mergeDeep(base[key], source[key]);
    });
    return result;
}

/** 与小程序 app.json 四个 Tab 顺序一致：index → category → activity → user */
function mergeTabBarWithDefaults(overrideTb) {
    const def = DEFAULT_MINIPROGRAM_CONFIG.brand_config.tab_bar;
    const ovr = overrideTb && typeof overrideTb === 'object' ? overrideTb : {};
    const defItems = Array.isArray(def.items) ? def.items : [];
    const ovrItems = Array.isArray(ovr.items) ? ovr.items : [];
    const byIndex = new Map(ovrItems.map((x) => [Number(x.index), x]));
    const items = defItems.map((d) => {
        const idx = Number(d.index);
        const o = byIndex.get(idx);
        const text =
            o && typeof o.text === 'string' && o.text.trim() !== ''
                ? o.text.trim()
                : d.text;
        return { index: idx, text };
    });
    const pickStr = (v, fallback) =>
        typeof v === 'string' && v.trim() !== '' ? v.trim() : fallback;
    return {
        color: pickStr(ovr.color, def.color),
        selectedColor: pickStr(ovr.selectedColor, def.selectedColor),
        backgroundColor: pickStr(ovr.backgroundColor, def.backgroundColor),
        borderStyle: ovr.borderStyle === 'black' || ovr.borderStyle === 'white' ? ovr.borderStyle : def.borderStyle,
        items
    };
}

function parseConfigValue(config) {
    if (!config) return null;
    const rawValue = config.config_value;
    if (config.config_type === 'json' || config.config_type === 'array') {
        try {
            return rawValue ? JSON.parse(rawValue) : null;
        } catch (_) {
            return null;
        }
    }
    if (config.config_type === 'boolean') {
        return rawValue === 'true' || rawValue === '1';
    }
    if (config.config_type === 'number') {
        return Number(rawValue || 0);
    }
    return rawValue;
}

async function loadMiniProgramConfig(AppConfig) {
    const configs = await AppConfig.findAll({
        where: {
            category: MINIPROGRAM_CONFIG_CATEGORY,
            status: 1,
            config_key: MINIPROGRAM_CONFIG_KEYS
        },
        attributes: ['config_key', 'config_value', 'config_type']
    });

    const result = cloneDefaults();
    configs.forEach((config) => {
        const parsed = parseConfigValue(config);
        const key = config.config_key;
        if (parsed === null || parsed === undefined) return;
        result[key] = mergeDeep(result[key], parsed);
    });
    if (result.brand_config && result.brand_config.tab_bar) {
        result.brand_config.tab_bar = mergeTabBarWithDefaults(result.brand_config.tab_bar);
    }
    return result;
}

async function saveMiniProgramConfig(AppConfig, payload = {}) {
    const merged = mergeDeep(cloneDefaults(), payload || {});
    if (merged.brand_config && merged.brand_config.tab_bar) {
        merged.brand_config.tab_bar = mergeTabBarWithDefaults(merged.brand_config.tab_bar);
    }
    await Promise.all(
        MINIPROGRAM_CONFIG_KEYS.map((configKey) => AppConfig.upsert({
            config_key: configKey,
            config_value: JSON.stringify(merged[configKey]),
            config_type: 'json',
            category: MINIPROGRAM_CONFIG_CATEGORY,
            description: `小程序配置：${configKey}`,
            is_public: true,
            status: 1
        }))
    );
    return merged;
}

/**
 * 解析为小程序商品详情可用的承诺列表（仅 enabled 项，含 tagClass）
 * @param {object|null} pledgesConfig product_detail_pledges 原始配置
 */
function buildProductDetailPledgesList(pledgesConfig) {
    const defs = DEFAULT_MINIPROGRAM_CONFIG.product_detail_pledges;
    const merged = mergeDeep(defs, isPlainObject(pledgesConfig) ? pledgesConfig : {});
    const items = merged.items || {};
    const tagClasses = ['tag-blue', 'tag-green', 'tag-orange'];
    const list = [];
    PRODUCT_DETAIL_PLEDGE_ORDER.forEach((id, idx) => {
        const row = items[id];
        if (!row || !row.enabled) return;
        const defRow = defs.items[id] || {};
        const title =
            typeof row.title === 'string' && row.title.trim() !== ''
                ? row.title.trim()
                : (defRow.title || '');
        let desc = typeof row.desc === 'string' ? row.desc.trim() : '';
        if (!desc && defRow.desc) desc = String(defRow.desc);
        if (!title) return;
        list.push({
            id,
            title,
            desc: desc || '',
            tagClass: tagClasses[idx % tagClasses.length]
        });
    });
    return list;
}

/** 读库构建列表（不写入商品缓存，每次详情接口现打） */
async function loadProductDetailPledgesList(AppConfig) {
    const row = await AppConfig.findOne({
        where: {
            category: MINIPROGRAM_CONFIG_CATEGORY,
            config_key: 'product_detail_pledges',
            status: 1
        },
        attributes: ['config_value', 'config_type']
    });
    const parsed = row ? parseConfigValue(row) : null;
    return buildProductDetailPledgesList(parsed);
}

module.exports = {
    MINIPROGRAM_CONFIG_CATEGORY,
    MINIPROGRAM_CONFIG_KEYS,
    PRODUCT_DETAIL_PLEDGE_ORDER,
    DEFAULT_MINIPROGRAM_CONFIG,
    loadMiniProgramConfig,
    saveMiniProgramConfig,
    mergeDeep,
    mergeTabBarWithDefaults,
    buildProductDetailPledgesList,
    loadProductDetailPledgesList
};
