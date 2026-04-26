const DEFAULT_CONFIG = {
  brand_config: {
    brand_name: '问兰',
    share_title: '问兰 · 品牌甄选',
    share_poster_file_id: '',
    share_poster_url: '',
    share_poster_cover_file_id: '',
    share_poster_cover_url: '',
    share_poster_intro: '专注于大学生（产教融合）实战落地',
    share_poster_code_prefix: '我的ID：',
    share_poster_qr_hint: '长按识别小程序码',
    customer_service_wechat: 'wl_service',
    customer_service_hours: '9:00-21:00',
    nav_brand_title: '问兰镜像',
    nav_brand_sub: '品牌甄选',
    coupon_zone_title: '优惠券中心',
    coupon_zone_subtitle: '领券后下单可用',
    police_registration_title: '公安备案',
    police_registration_number: '苏公网安备32050802012518号',
    official_promo_title: '专业皮肤修护 始于1974',
    official_promo_subtitle: '',
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
    show_station_entry: true,
    show_pickup_entry: true,
    show_agent_service_entry: false,
    enable_logistics_entry: true,
    enable_lottery_entry: true
  },
  activity_page_config: {
    default_banners: [],
    default_permanent_activities: [],
    permanent_section_title: '常驻活动',
    permanent_section_desc: '长期可参与，随时进入',
    limited_section_title: '限时活动',
    limited_section_desc: '抓紧时间，过期即止',
    empty_permanent_text: '暂无常驻活动',
    empty_limited_text: '暂无限时活动，敬请期待',
    pending_toast: '活动筹备中'
  },
  membership_config: {
    group_buy_start_requirement_text: '登录后即可发起拼团，支付成功后可在订单或“我的拼团”继续查看进度',
    slash_start_requirement_text: '发起砍价需满足当前活动规则',
    login_agreement_hint: '登录后查看订单、积分、佣金等信息',
    business_center_min_role_level: 1,
    growth_bar_subtitle_template: '距离「{next}」还需 {need} 成长值',
    growth_bar_max_tier_text: '您已达到当前成长体系最高档位',
    growth_privileges_entry_text: '查看说明',
    growth_privileges_page_title: '成长会员与权益说明'
  },
  lottery_config: {
    hero_title: '把积分换成一点仪式感',
    hero_subtitle: '把账户里的积分换成一次轻量抽奖，命中结果后会同步进入中奖记录。',
    panel_title: '幸运转盘',
    panel_subtitle: '命中后会停在对应奖格，结果直接同步到记录里',
    result_win_title: '恭喜，手气不错',
    result_miss_title: '这次差一点点',
    empty_record_text: '暂无记录，快来抽奖吧'
  },
  group_buy_config: {
    share_title_template: '{brand_name} · {product_name} 拼团进行中',
    join_button_text: '去拼团',
    status_texts: { open: '拼团中', success: '已成团', failed: '拼团失败' }
  },
  point_rule_config: {
    deduction: {
      yuan_per_point: 0.1,
      max_order_ratio: 0.7
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
  customer_service_channel: {
    channel_service_phone: '',
    product_service_phone: '',
    qr_code_url: ''
  },
  common_copy: {
    load_failed_text: '加载失败',
    retry_text: '点击重试',
    no_logistics_text: '暂无物流信息',
    copy_success_text: '单号已复制'
  },
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
      show_without_coupon: false,
      title: '新人礼券',
      body: '欢迎加入！新人礼券已发放至「我的 · 优惠券」，请在有效期内使用。面额、门槛以券面展示为准。',
      body_when_issued: '欢迎加入！已为您发放 {count} 张优惠券，可前往「我的 · 优惠券」查看，请在有效期内于结算页使用。'
    }
  },
  asset_map: {
    default_avatar: '/assets/images/default-avatar.svg',
    default_product_image: '/assets/images/placeholder.svg',
    default_package_icon: '/assets/icons/package.svg'
  },
  feature_toggles: {}
};

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}
function cloneDefaults() {
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}
function normalizeTabBarConfig(overrideTb) {
  const def = DEFAULT_CONFIG.brand_config.tab_bar;
  const ovr = overrideTb && typeof overrideTb === 'object' ? overrideTb : {};
  const defItems = Array.isArray(def.items) ? def.items : [];
  const ovrItems = Array.isArray(ovr.items) ? ovr.items : [];
  const byIndex = new Map(ovrItems.map(x => [Number(x.index), x]));
  const items = defItems.map(d => {
    const idx = Number(d.index);
    const o = byIndex.get(idx);
    const text = o && typeof o.text === 'string' && o.text.trim() !== '' ? o.text.trim() : d.text;
    return { index: idx, text };
  });
  const pickStr = (v, fallback) => typeof v === 'string' && v.trim() !== '' ? v.trim() : fallback;
  return {
    color: pickStr(ovr.color, def.color),
    selectedColor: pickStr(ovr.selectedColor, def.selectedColor),
    backgroundColor: pickStr(ovr.backgroundColor, def.backgroundColor),
    borderStyle: ovr.borderStyle === 'black' || ovr.borderStyle === 'white' ? ovr.borderStyle : def.borderStyle,
    items
  };
}
function mergeDeep(base, override) {
  if (Array.isArray(base)) return Array.isArray(override) ? override : base;
  if (!isPlainObject(base)) return override === undefined ? base : override;
  const result = { ...base };
  const source = isPlainObject(override) ? override : {};
  Object.keys(source).forEach(key => { result[key] = mergeDeep(base[key], source[key]); });
  return result;
}
function getMiniProgramConfig() {
  const app = getApp();
  const config = app && app.globalData && app.globalData.miniProgramConfig || {};
  return mergeDeep(cloneDefaults(), config);
}
function getConfigSection(sectionName) {
  const config = getMiniProgramConfig();
  return config[sectionName] || cloneDefaults()[sectionName] || {};
}
function getFeatureFlags() { return getConfigSection('feature_flags'); }
function getFeatureToggles() { return getMiniProgramConfig().feature_toggles || {}; }
function getLightPromptModals() { return getConfigSection('light_prompt_modals'); }
function isActivityCenterEnabled() {
  const config = getMiniProgramConfig();
  const ff = config.feature_flags || {};
  const ft = config.feature_toggles || {};
  if (ff.enable_activity_entry === false) return false;
  if (ft.activity_center_enabled === false) return false;
  if (ft.hide_activity_tab === true) return false;
  return true;
}
function syncCustomTabBar(page) {
  if (!page || typeof page.getTabBar !== 'function') return;
  const tabBar = page.getTabBar();
  if (tabBar && typeof tabBar.refresh === 'function') {
    tabBar.refresh();
    if (typeof tabBar.setHidden === 'function' && page._nativeTabBarHidden != null) {
      tabBar.setHidden(!!page._nativeTabBarHidden);
    }
  }
}

module.exports = {
  DEFAULT_CONFIG, cloneDefaults, mergeDeep, normalizeTabBarConfig,
  getMiniProgramConfig, getConfigSection, getFeatureFlags,
  getFeatureToggles, getLightPromptModals, isActivityCenterEnabled, syncCustomTabBar
};
