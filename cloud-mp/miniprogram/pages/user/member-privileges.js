// pages/user/member-privileges.js - 会员等级权益说明
const { get } = require('../../utils/request');
const { getConfigSection } = require('../../utils/miniProgramConfig');
const { ROLE_NAMES } = require('../../config/constants');

const DEFAULT_LEVELS = [0, 1, 2, 3, 4, 5, 6].map((level) => ({
    level,
    name: ROLE_NAMES[level] || `等级${level}`,
    description: ''
}));

const LEVEL_PRIVILEGES = {
    0: ['新客基础权益', '签到与任务积分', '优惠券领取', '成长值累计'],
    1: ['复购成长权益', '积分任务进阶', '团队中心入口', '专属活动资格'],
    2: ['高级成长权益', '更多积分激励', '邀新进阶权益', '升级路径加速'],
    3: ['经营身份开启', '团队中心入口', '邀请权益概览', '经营数据查看'],
    4: ['运营合伙身份', '团队经营权限', '渠道活动资格', '经营中心能力'],
    5: ['区域合伙身份', '区域经营权限', '高级渠道权益', '经营中心能力'],
    6: ['门店身份认证', '线下履约权限', '门店经营资料', '平台人工维护']
};

const LEVEL_BRIEFS = {
    0: '适合刚加入的用户，重点是熟悉商城、累积成长值和积分。',
    1: '适合完成首轮消费后的复购用户，开始拥有更明确的成长路径。',
    2: '适合持续复购和活跃邀新的用户，权益向进阶成长倾斜。',
    3: '从这里开始偏经营身份，团队、佣金、货款等细节请进入团队中心。',
    4: '面向更稳定的渠道经营用户，页面只展示身份概览和可享权益。',
    5: '面向区域级经营用户，具体团队和资金动作在团队中心完成。',
    6: '线下门店身份由平台认定，主要用于门店履约和线下经营。'
};

function toNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function normalizeLevel(raw = {}) {
    const level = toNumber(raw.level, 0);
    const name = ROLE_NAMES[level] || raw.name || `等级${level}`;
    const rawPerks = Array.isArray(raw.perks) ? raw.perks : [];
    const configPerks = rawPerks
        .map((item) => String(item || '').trim())
        .filter(Boolean);
    const fallbackPerks = LEVEL_PRIVILEGES[level] || ['等级权益'];
    return {
        ...raw,
        level,
        name,
        description: String(raw.description || raw.desc || LEVEL_BRIEFS[level] || '').trim(),
        brief: String(raw.description || raw.desc || LEVEL_BRIEFS[level] || '').trim(),
        privileges: configPerks.length ? configPerks : fallbackPerks
    };
}

function buildLevelViewModel(rawLevel, currentRoleLevel) {
    const level = normalizeLevel(rawLevel);
    const isCurrent = level.level === currentRoleLevel;
    const isPassed = level.level < currentRoleLevel;
    const isNext = level.level === currentRoleLevel + 1;
    return {
        ...level,
        statusText: isCurrent ? '当前' : (isPassed ? '已达成' : (isNext ? '下一等级' : '未解锁')),
        statusClass: isCurrent ? 'status-current' : (isPassed ? 'status-passed' : (isNext ? 'status-next' : 'status-locked')),
        isCurrent,
        isPassed,
        isNext,
        isAgentLevel: level.level >= 3
    };
}

function findSelectedIndex(levels, currentRoleLevel, queryLevel) {
    const target = Number.isFinite(queryLevel) ? queryLevel : currentRoleLevel;
    const index = levels.findIndex((item) => item.level === target);
    return index >= 0 ? index : 0;
}

function buildNextSummary(levels, currentRoleLevel) {
    const next = levels.find((item) => item.level === currentRoleLevel + 1);
    if (!next) return '已达到当前最高身份，保持活跃即可持续享受权益。';
    return `下一等级是「${next.name}」，本页先展示身份特权和权益范围。`;
}

Page({
    data: {
        loading: true,
        loadError: false,
        currentRoleLevel: 0,
        currentRoleName: 'VIP用户',
        growthValue: 0,
        levels: [],
        selectedIndex: 0,
        selectedLevel: {},
        nextSummary: '',
        faqList: [
            {
                title: '成长值和会员身份是什么关系？',
                body: '会员身份以当前等级为准，成长值主要用于系统判断成长进度，不再作为第二套会员身份。'
            },
            {
                title: '代理等级的团队和佣金在哪里看？',
                body: '推广合伙人及以上的经营数据、团队、佣金和货款操作，统一到团队中心查看。'
            },
            {
                title: '等级会在哪里更新？',
                body: '支持自动更新的等级会在系统核算后变化；需要人工认定的身份，以平台审核结果为准。'
            }
        ]
    },

    onLoad(options = {}) {
        const mc = getConfigSection('membership_config') || {};
        wx.setNavigationBarTitle({ title: mc.growth_privileges_page_title || '等级权益' });
        const queryLevel = Number(options.level);
        this.queryLevel = Number.isFinite(queryLevel) ? queryLevel : null;
    },

    onShow() {
        this.loadData();
    },

    async loadData() {
        this.setData({ loading: true, loadError: false });
        try {
            const [profileRes, metaRes] = await Promise.all([
                get('/user/profile', {}, { showError: false }).catch(() => ({ code: -1, data: {} })),
                get('/user/member-tier-meta', {}, { showError: false }).catch(() => ({ code: -1, data: {} }))
            ]);
            const profile = profileRes.code === 0 && profileRes.data ? profileRes.data : {};
            const meta = metaRes.code === 0 && metaRes.data ? metaRes.data : {};
            const currentRoleLevel = toNumber(
                profile.role_level != null ? profile.role_level : meta.current_level,
                0
            );
            const currentRoleName = ROLE_NAMES[currentRoleLevel]
                || profile.role_name
                || meta.current_name
                || 'VIP用户';
            const rawLevels = Array.isArray(meta.member_levels) && meta.member_levels.length
                ? meta.member_levels
                : DEFAULT_LEVELS;
            const levels = rawLevels
                .map((item) => buildLevelViewModel(item, currentRoleLevel))
                .sort((a, b) => a.level - b.level);
            const selectedIndex = findSelectedIndex(levels, currentRoleLevel, this.queryLevel);
            this.setData({
                loading: false,
                currentRoleLevel,
                currentRoleName,
                growthValue: Math.floor(toNumber(profile.growth_value != null ? profile.growth_value : meta.growth_value, 0)),
                levels,
                selectedIndex,
                selectedLevel: levels[selectedIndex] || {},
                nextSummary: buildNextSummary(levels, currentRoleLevel)
            });
        } catch (e) {
            console.error('[member-privileges] 加载失败:', e);
            this.setData({ loading: false, loadError: true });
        }
    },

    onLevelTap(e) {
        const index = toNumber(e.currentTarget.dataset.index, 0);
        const selectedLevel = this.data.levels[index] || {};
        this.setData({ selectedIndex: index, selectedLevel });
    },

    onSwiperChange(e) {
        const index = toNumber(e.detail.current, 0);
        const selectedLevel = this.data.levels[index] || {};
        this.setData({ selectedIndex: index, selectedLevel });
    },

    goTeamCenter() {
        wx.navigateTo({ url: '/pages/distribution/business-center' });
    },

    onRetry() {
        this.loadData();
    }
});
