/**
 * AppConfig 功能开关（category = feature_toggle，config_key = feature_${key}_enabled）
 *
 * - 默认未落库时 buildFeatureToggleMap 视为全部 true（前端/API 读到的也是开启）。
 * - 当前业务路由层基本不读取这些键：关切换肤/藏入口主要靠小程序；关券/积分等不会自动禁止后端发券或扣积分。
 * - 不要与 mini_program JSON 里的 feature_flags（如 enable_logistics_entry）混淆：后者管「入口展示」，本模块管「能力总开关」语义但多为展示层配合。
 */
const FEATURE_DEFS = [
    { key: 'logistics', label: '物流查询', icon: '🚚', desc: '订单物流轨迹追踪' },
    { key: 'activity', label: '活动中心', icon: '🎉', desc: '节日/砍价/抽奖/拼团' },
    { key: 'group_buy', label: '拼团', icon: '👥', desc: '拼团活动功能' },
    { key: 'slash', label: '砍价', icon: '✂️', desc: '好友砍价活动' },
    { key: 'lottery', label: '抽奖', icon: '🎰', desc: '积分/商品抽奖' },
    { key: 'coupon', label: '优惠券', icon: '🎫', desc: '满减/折扣券' },
    { key: 'points', label: '积分系统', icon: '⭐', desc: '签到/消费积分' },
    { key: 'agent', label: '代理商', icon: '🏢', desc: '三级代理分销' },
    { key: 'pickup', label: '自提核销', icon: '📍', desc: '门店自提二维码' },
    { key: 'invite', label: '邀请推广', icon: '📣', desc: '分享邀请裂变' },
    { key: 'splash', label: '开屏动画', icon: '✨', desc: '启动页品牌动画' },
    { key: 'review', label: '商品评价', icon: '💬', desc: '用户评论展示' },
    { key: 'price_preview', label: '到手价预估', icon: '💰', desc: '商品卡片显示积分+优惠券预估最低价' }
];

function getFeatureToggleKey(key) {
    return `feature_${key}_enabled`;
}

function buildFeatureToggleMap(configs = []) {
    return FEATURE_DEFS.reduce((result, feature) => {
        const configKey = getFeatureToggleKey(feature.key);
        const config = configs.find((item) => item.config_key === configKey);
        result[feature.key] = config ? (config.config_value !== 'false' && config.config_value !== '0') : true;
        return result;
    }, {});
}

function buildFeatureToggleList(configs = []) {
    const toggleMap = buildFeatureToggleMap(configs);
    return FEATURE_DEFS.map((feature) => ({
        ...feature,
        enabled: toggleMap[feature.key]
    }));
}

module.exports = {
    FEATURE_DEFS,
    getFeatureToggleKey,
    buildFeatureToggleMap,
    buildFeatureToggleList
};
