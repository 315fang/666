const { AppConfig } = require('../models');

const MEMBER_LEVEL_KEY = 'member_level_config';
const GROWTH_TIER_KEY = 'growth_tier_config';
const GROWTH_RULE_KEY = 'growth_rule_config';
const COMMERCE_POLICY_KEY = 'commerce_policy_config';
const PURCHASE_LEVEL_KEY = 'purchase_level_config';
const POINT_LEVEL_KEY = 'point_level_config';
const POINT_RULE_KEY = 'point_rule_config';

// 小程序「积分中心 · 等级特权」阶梯：按用户成长值 users.growth_value 定档（与可消费积分分离）
const DEFAULT_POINT_LEVELS = [
    { level: 1, name: '体验官', min: 0, max: 100, perks: ['全场包邮'] },
    { level: 2, name: '品质会员', min: 101, max: 500, perks: ['敬请期待'] },
    { level: 3, name: '精选达人', min: 501, max: 2000, perks: ['敬请期待'] },
    { level: 4, name: '首席鉴赏家', min: 2001, max: null, perks: ['敬请期待'] }
];

// 积分行为规则（加减分时取 remark；checkin/share 等取 points；purchase 仅作文案说明，下单发分仍由订单金额 logic 决定时可保留 rate 供扩展）
const DEFAULT_POINT_RULES = {
    register: { points: 0, remark: '注册自动升级体验官，享全场包邮特权' },
    purchase: { rate: 1, remark: '消费积分（1元=1积分）' },
    share: { points: 5, remark: '分享商品获得积分' },
    review: { points: 10, remark: '写评价获得积分' },
    review_image: { points: 20, remark: '图文评价获得积分' },
    checkin: { points: 5, remark: '每日签到' },
    checkin_streak: { points: 50, remark: '连续签到7天奖励' },
    invite_success: { points: 50, remark: '成功邀请新用户加入团队' },
    group_start: { points: 10, remark: '发起拼团' },
    group_success: { points: 30, remark: '拼团成功奖励' }
};

// 会员等级 — 与商业计划书3.0对齐
// 复购折扣：C1=9折, C2=8.5折, B端自购按原价（不享受复购折扣，赚佣金）
// 6折拿货是代理商发货时成本价打6折，不在这里控制
const DEFAULT_MEMBER_LEVELS = [
    { level: 0, name: '普通用户', description: '注册用户', color: '#909399', price_tier: 'retail', commission_type: 'none', is_agent: false, growth_threshold: 0, discount_rate: 1.00 },
    { level: 1, name: '初级代理', description: 'C1 购买299元产品升级', color: '#409EFF', price_tier: 'member', commission_type: 'level1', is_agent: false, growth_threshold: 299, discount_rate: 0.90 },
    { level: 2, name: '高级代理', description: 'C2 直推2个C1+销售满580', color: '#67C23A', price_tier: 'leader', commission_type: 'level2', is_agent: false, growth_threshold: 580, discount_rate: 0.85 },
    { level: 3, name: '推广合伙人', description: 'B1 推荐10个C2或缴纳3000', color: '#E6A23C', price_tier: 'agent', commission_type: 'level3', is_agent: true, growth_threshold: 3000, discount_rate: 1.00 },
    { level: 4, name: '运营合伙人', description: 'B2 推荐10个B1或缴纳3万', color: '#F56C6C', price_tier: 'agent', commission_type: 'level3', is_agent: true, growth_threshold: 30000, discount_rate: 1.00 },
    { level: 5, name: '区域合伙人', description: 'B3 缴纳19.8万', color: '#9B59B6', price_tier: 'agent', commission_type: 'level3', is_agent: true, growth_threshold: 198000, discount_rate: 1.00 }
];

// 成长值阶梯折扣 — B端不享受复购折扣（赚佣金不赚折扣）
const DEFAULT_GROWTH_TIERS = [
    { min: 0, discount: 1.00, name: '普通用户', desc: '无折扣' },
    { min: 299, discount: 0.90, name: '初级代理', desc: '9折' },
    { min: 580, discount: 0.85, name: '高级代理', desc: '8.5折' },
    { min: 3000, discount: 1.00, name: '推广合伙人', desc: '原价（赚佣金）' },
    { min: 30000, discount: 1.00, name: '运营合伙人', desc: '原价（赚佣金）' },
    { min: 198000, discount: 1.00, name: '区域合伙人', desc: '原价（赚佣金）' }
];

const DEFAULT_GROWTH_RULES = {
    // purchase：基数默认为订单实付 total_amount 取整（见 OrderCoreService）；获得量 = floor(基数)×multiplier + fixed（每单）
    purchase: { enabled: true, multiplier: 1, fixed: 0, use_original_amount: false },
    checkin: { enabled: true, multiplier: 0, fixed: 2, use_original_amount: false },
    review: { enabled: true, multiplier: 0, fixed: 5, use_original_amount: false },
    slash_help: { enabled: true, multiplier: 0, fixed: 2, use_original_amount: false },
    slash_start: { enabled: true, multiplier: 0, fixed: 3, use_original_amount: false }
};

const DEFAULT_COMMERCE_POLICY = {
    global_discount: { enabled: false, rate: 1.00 },
    member_level_extra_discount: { enabled: true },
    portal_login: { min_role_level: 3 },
    platform_top_agent: {
        enabled: true,
        user_id: 0,
        name: '平台顶级代理'
    },
    shipping: {
        free_shipping_for_all_members: true,
        remote_region_extra_fee_enabled: true,
        remote_region_fee: 10,
        remote_regions: ['新疆', '西藏', '内蒙古', '青海', '宁夏', '海南']
    }
};

const DEFAULT_PURCHASE_LEVELS = [];

class MemberTierService {
    static cache = {
        memberLevels: null,
        growthTiers: null,
        growthRules: null,
        commercePolicy: null,
        purchaseLevels: null,
        pointLevels: null,
        pointRules: null,
        ts: 0
    };

    static cacheMs = 60 * 1000;

    static _withinCache() {
        return Date.now() - this.cache.ts < this.cacheMs;
    }

    static _normalizePurchaseLevels(raw) {
        const arr = Array.isArray(raw) ? raw : DEFAULT_PURCHASE_LEVELS;
        const allowedTiers = new Set(['retail', 'member', 'leader', 'agent']);
        const normalized = [];
        const usedCodes = new Set();

        for (const item of arr) {
            const code = String(item?.code || '').trim();
            if (!code || usedCodes.has(code)) continue;

            const tier = String(item?.price_tier || '').trim();
            if (!allowedTiers.has(tier)) continue;

            const discountRaw = Number(item?.discount ?? 1);
            const discount = Number.isFinite(discountRaw)
                ? Math.min(1, Math.max(0.01, Number(discountRaw.toFixed(4))))
                : 1;

            normalized.push({
                code,
                name: String(item?.name || code).trim(),
                description: String(item?.description || '').trim(),
                price_tier: tier,
                discount,
                enabled: item?.enabled !== false,
                sort: Number.isFinite(Number(item?.sort)) ? Number(item.sort) : 0
            });
            usedCodes.add(code);
        }

        return normalized.sort((a, b) => (a.sort - b.sort) || a.code.localeCompare(b.code));
    }

    static _safeParseJson(text, fallback) {
        if (!text) return fallback;
        try {
            return JSON.parse(text);
        } catch (_) {
            return fallback;
        }
    }

    static _normalizeMemberLevels(raw) {
        const arr = Array.isArray(raw) ? raw : DEFAULT_MEMBER_LEVELS;
        return arr
            .map(item => ({
                level: Number(item.level),
                name: item.name || `Lv${item.level}`,
                description: item.description || '',
                color: item.color || '#909399',
                price_tier: item.price_tier || 'retail',
                commission_type: item.commission_type || 'none',
                is_agent: !!item.is_agent,
                growth_threshold: Number(item.growth_threshold || 0)
                ,
                discount_rate: Number(item.discount_rate || 1)
            }))
            .filter(item => Number.isFinite(item.level))
            .sort((a, b) => a.level - b.level);
    }

    static _normalizeGrowthTiers(raw) {
        const arr = Array.isArray(raw) ? raw : DEFAULT_GROWTH_TIERS;
        return arr
            .map(item => ({
                min: Number(item.min || 0),
                discount: Number(item.discount || 1),
                name: item.name || '',
                desc: item.desc || ''
            }))
            .filter(item => Number.isFinite(item.min) && Number.isFinite(item.discount))
            .sort((a, b) => a.min - b.min);
    }

    /**
     * 成长值特权档位：min 为成长值下限；max 为 null 表示该档无上限（展示为「xxx+ 成长值」）
     */
    static _normalizePointLevels(raw) {
        const arr = Array.isArray(raw) ? raw : DEFAULT_POINT_LEVELS;
        const rows = arr
            .map(item => {
                const level = Number(item.level);
                const min = Math.max(0, Math.floor(Number(item.min ?? 0)));
                let max = item.max;
                if (max === '' || max === undefined || max === null || max === 'Infinity') {
                    max = null;
                } else {
                    max = Math.floor(Number(max));
                    if (!Number.isFinite(max)) max = null;
                }
                const perks = Array.isArray(item.perks)
                    ? item.perks.map(p => String(p || '').trim()).filter(Boolean)
                    : [];
                return { level, name: String(item.name || `等级${level}`).trim(), min, max, perks };
            })
            .filter(item => Number.isFinite(item.level) && item.level >= 1 && Number.isFinite(item.min));

        rows.sort((a, b) => a.min - b.min || a.level - b.level);
        if (!rows.length) {
            return this._normalizePointLevels(DEFAULT_POINT_LEVELS);
        }
        return rows;
    }

    static _normalizePointRules(raw) {
        const parsed = raw && typeof raw === 'object' ? raw : {};
        const out = {};
        for (const key of Object.keys(DEFAULT_POINT_RULES)) {
            const def = DEFAULT_POINT_RULES[key];
            const cur = parsed[key] && typeof parsed[key] === 'object' ? parsed[key] : {};
            if (Object.prototype.hasOwnProperty.call(def, 'rate')) {
                out[key] = {
                    rate: Math.max(0, Number(cur.rate ?? def.rate)),
                    remark: String(cur.remark ?? def.remark)
                };
            } else {
                out[key] = {
                    points: Math.max(0, Math.floor(Number(cur.points ?? def.points))),
                    remark: String(cur.remark ?? def.remark)
                };
            }
        }
        return out;
    }

    static async _loadConfigs() {
        if (
            this._withinCache()
            && this.cache.memberLevels
            && this.cache.growthTiers
            && this.cache.growthRules
            && this.cache.commercePolicy
            && this.cache.purchaseLevels
            && this.cache.pointLevels
            && this.cache.pointRules
        ) {
            return this.cache;
        }

        const configs = await AppConfig.findAll({
            where: {
                config_key: [
                    MEMBER_LEVEL_KEY,
                    GROWTH_TIER_KEY,
                    GROWTH_RULE_KEY,
                    COMMERCE_POLICY_KEY,
                    PURCHASE_LEVEL_KEY,
                    POINT_LEVEL_KEY,
                    POINT_RULE_KEY
                ],
                status: 1
            }
        });

        const memberCfg = configs.find(c => c.config_key === MEMBER_LEVEL_KEY);
        const growthCfg = configs.find(c => c.config_key === GROWTH_TIER_KEY);
        const growthRuleCfg = configs.find(c => c.config_key === GROWTH_RULE_KEY);
        const commercePolicyCfg = configs.find(c => c.config_key === COMMERCE_POLICY_KEY);
        const purchaseLevelCfg = configs.find(c => c.config_key === PURCHASE_LEVEL_KEY);
        const pointLevelCfg = configs.find(c => c.config_key === POINT_LEVEL_KEY);
        const pointRuleCfg = configs.find(c => c.config_key === POINT_RULE_KEY);

        const memberLevels = this._normalizeMemberLevels(
            this._safeParseJson(memberCfg?.config_value, DEFAULT_MEMBER_LEVELS)
        );
        const growthTiers = this._normalizeGrowthTiers(
            this._safeParseJson(growthCfg?.config_value, DEFAULT_GROWTH_TIERS)
        );
        const growthRules = {
            ...DEFAULT_GROWTH_RULES,
            ...(this._safeParseJson(growthRuleCfg?.config_value, DEFAULT_GROWTH_RULES) || {})
        };
        const commercePolicy = {
            ...DEFAULT_COMMERCE_POLICY,
            ...(this._safeParseJson(commercePolicyCfg?.config_value, DEFAULT_COMMERCE_POLICY) || {})
        };
        const purchaseLevels = this._normalizePurchaseLevels(
            this._safeParseJson(purchaseLevelCfg?.config_value, DEFAULT_PURCHASE_LEVELS)
        );
        const pointLevels = this._normalizePointLevels(
            this._safeParseJson(pointLevelCfg?.config_value, DEFAULT_POINT_LEVELS)
        );
        const pointRules = this._normalizePointRules(
            this._safeParseJson(pointRuleCfg?.config_value, DEFAULT_POINT_RULES)
        );
        commercePolicy.portal_login = {
            min_role_level: Number(commercePolicy.portal_login?.min_role_level ?? 3)
        };
        commercePolicy.platform_top_agent = {
            enabled: commercePolicy.platform_top_agent?.enabled !== false,
            user_id: Number(commercePolicy.platform_top_agent?.user_id || 0),
            name: commercePolicy.platform_top_agent?.name || '平台顶级代理'
        };

        this.cache = {
            memberLevels,
            growthTiers,
            growthRules,
            commercePolicy,
            purchaseLevels,
            pointLevels,
            pointRules,
            ts: Date.now()
        };
        return this.cache;
    }

    static async getMemberLevels() {
        const { memberLevels } = await this._loadConfigs();
        return memberLevels;
    }

    static async getGrowthTiers() {
        const { growthTiers } = await this._loadConfigs();
        return growthTiers;
    }

    static async getGrowthRules() {
        const { growthRules } = await this._loadConfigs();
        return growthRules;
    }

    static async getCommercePolicy() {
        const { commercePolicy } = await this._loadConfigs();
        return commercePolicy;
    }

    static async getPurchaseLevels() {
        const { purchaseLevels } = await this._loadConfigs();
        return purchaseLevels;
    }

    /** 积分中心「等级特权」阶梯（按成长值定档，配置仍存 point_level_config） */
    static async getPointLevels() {
        const { pointLevels } = await this._loadConfigs();
        return pointLevels;
    }

    /** 签到/任务/拼团等积分数值与文案 */
    static async getPointRules() {
        const { pointRules } = await this._loadConfigs();
        return pointRules;
    }

    static async getPurchaseLevelByCode(code) {
        const normalizedCode = String(code || '').trim();
        if (!normalizedCode) return null;
        const levels = await this.getPurchaseLevels();
        const hit = levels.find(item => item.code === normalizedCode && item.enabled !== false);
        return hit || null;
    }

    static async getRoleName(roleLevel) {
        const levels = await this.getMemberLevels();
        const hit = levels.find(l => l.level === Number(roleLevel));
        return hit?.name || `Lv${roleLevel}`;
    }

    static async calcDiscountRate(growthValue) {
        const tiers = await this.getGrowthTiers();
        const growth = Number(growthValue || 0);
        let rate = 1.00;
        for (const tier of tiers) {
            if (growth >= tier.min) rate = tier.discount;
            else break;
        }
        return Number(rate.toFixed(2));
    }

    static async getLevelDiscountRate(roleLevel) {
        const levels = await this.getMemberLevels();
        const hit = levels.find(l => l.level === Number(roleLevel));
        return Number((hit?.discount_rate || 1).toFixed(2));
    }

    /**
     * 与 OrderCoreService 下单口径一致：全场折 × 等级额外折（可配置关闭任一侧）
     * @returns {number} 乘数，如 0.98（与 1 相乘为原价）
     */
    static async getCommerceDiscountMultiplier(roleLevel) {
        const commercePolicy = await this.getCommercePolicy();
        const globalRate = commercePolicy?.global_discount?.enabled
            ? Number(commercePolicy?.global_discount?.rate || 1)
            : 1;
        const levelRate = commercePolicy?.member_level_extra_discount?.enabled
            ? await this.getLevelDiscountRate(roleLevel)
            : 1;
        return Number((globalRate * levelRate).toFixed(4));
    }

    static async calcGrowthGain(source, baseAmount = 0) {
        const rules = await this.getGrowthRules();
        const rule = rules[source];
        if (!rule || !rule.enabled) return 0;
        const base = Number(baseAmount || 0);
        const gain = base * Number(rule.multiplier || 0) + Number(rule.fixed || 0);
        return Math.max(0, Number(gain.toFixed(2)));
    }

    static async getGrowthProgress(growthValue) {
        const tiers = await this.getGrowthTiers();
        const growth = Number(growthValue || 0);
        let current = tiers[0];
        let next = null;

        for (let i = 0; i < tiers.length; i++) {
            if (growth >= tiers[i].min) {
                current = tiers[i];
                next = tiers[i + 1] || null;
            } else {
                break;
            }
        }

        const percent = next
            ? Math.min(100, Math.round(((growth - current.min) / Math.max(1, next.min - current.min)) * 100))
            : 100;

        return {
            current,
            next,
            growth_value: growth,
            percent,
            next_threshold: next?.min || null
        };
    }

    static async saveTierConfigs({ memberLevels, growthTiers, growthRules, commercePolicy, purchaseLevels, pointLevels, pointRules }) {
        const operations = [];
        if (memberLevels) {
            operations.push(AppConfig.upsert({
                config_key: MEMBER_LEVEL_KEY,
                config_value: JSON.stringify(this._normalizeMemberLevels(memberLevels)),
                config_type: 'json',
                category: 'MEMBER',
                description: '会员等级配置',
                is_public: true,
                status: 1
            }));
        }
        if (growthTiers) {
            operations.push(AppConfig.upsert({
                config_key: GROWTH_TIER_KEY,
                config_value: JSON.stringify(this._normalizeGrowthTiers(growthTiers)),
                config_type: 'json',
                category: 'MEMBER',
                description: '成长值折扣阶梯配置',
                is_public: true,
                status: 1
            }));
        }
        if (growthRules) {
            operations.push(AppConfig.upsert({
                config_key: GROWTH_RULE_KEY,
                config_value: JSON.stringify({ ...DEFAULT_GROWTH_RULES, ...growthRules }),
                config_type: 'json',
                category: 'MEMBER',
                description: '成长值来源规则配置',
                is_public: false,
                status: 1
            }));
        }
        if (commercePolicy) {
            operations.push(AppConfig.upsert({
                config_key: COMMERCE_POLICY_KEY,
                config_value: JSON.stringify({ ...DEFAULT_COMMERCE_POLICY, ...commercePolicy }),
                config_type: 'json',
                category: 'MEMBER',
                description: '全场折扣与会员权益策略配置',
                is_public: false,
                status: 1
            }));
        }
        if (purchaseLevels) {
            operations.push(AppConfig.upsert({
                config_key: PURCHASE_LEVEL_KEY,
                config_value: JSON.stringify(this._normalizePurchaseLevels(purchaseLevels)),
                config_type: 'json',
                category: 'MEMBER',
                description: '拿货等级配置（仅价格权益）',
                is_public: false,
                status: 1
            }));
        }
        if (pointLevels) {
            const normalized = this._normalizePointLevels(pointLevels);
            if (!normalized.length) {
                throw new Error('成长值特权档位至少保留一档');
            }
            operations.push(AppConfig.upsert({
                config_key: POINT_LEVEL_KEY,
                config_value: JSON.stringify(normalized),
                config_type: 'json',
                category: 'POINTS',
                description: '小程序积分中心·等级特权（按成长值定档）',
                is_public: true,
                status: 1
            }));
        }
        if (pointRules) {
            operations.push(AppConfig.upsert({
                config_key: POINT_RULE_KEY,
                config_value: JSON.stringify(this._normalizePointRules(pointRules)),
                config_type: 'json',
                category: 'POINTS',
                description: '积分行为奖励数值与说明',
                is_public: false,
                status: 1
            }));
        }
        await Promise.all(operations);
        this.cache.ts = 0;
    }
}

module.exports = MemberTierService;
