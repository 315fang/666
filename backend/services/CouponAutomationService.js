const { AppConfig, Coupon, UserCoupon } = require('../models');
const { Op } = require('sequelize');
const { buildRecordsForUsers } = require('./UserCouponIssueService');

const RULES_KEY = 'coupon_auto_rules';

const DEFAULT_RULES = [
  {
    id: 'register_welcome',
    name: '新用户注册发券',
    enabled: false,
    trigger_event: 'register',
    coupon_id: null,
    target_levels: []
  }
];

class CouponAutomationService {
  static async getRules() {
    const cfg = await AppConfig.findOne({ where: { config_key: RULES_KEY, status: 1 } });
    if (!cfg?.config_value) return DEFAULT_RULES;
    try {
      const parsed = JSON.parse(cfg.config_value);
      return Array.isArray(parsed) ? parsed : DEFAULT_RULES;
    } catch (_) {
      return DEFAULT_RULES;
    }
  }

  static async saveRules(rules) {
    const normalized = Array.isArray(rules) ? rules : DEFAULT_RULES;
    await AppConfig.upsert({
      config_key: RULES_KEY,
      config_value: JSON.stringify(normalized),
      config_type: 'json',
      category: 'COUPON',
      description: '优惠券自动化发放规则',
      is_public: false,
      status: 1
    });
  }

  static async issueToUsers({ couponId, userIds, reason = 'auto' }) {
    const ids = [...new Set((userIds || []).map(Number).filter(Boolean))];
    if (!ids.length) return { issued: 0, skipped: 0 };

    const coupon = await Coupon.findByPk(couponId);
    if (!coupon || !coupon.is_active) return { issued: 0, skipped: ids.length };

    const existing = await UserCoupon.findAll({
      where: {
        coupon_id: coupon.id,
        user_id: { [Op.in]: ids },
        status: 'unused',
        expire_at: { [Op.gte]: new Date() }
      },
      attributes: ['user_id']
    });
    const existingSet = new Set(existing.map(e => e.user_id));
    const targetIds = ids.filter(id => !existingSet.has(id));

    if (!targetIds.length) return { issued: 0, skipped: ids.length };

    const records = buildRecordsForUsers(coupon, targetIds);

    await UserCoupon.bulkCreate(records);
    return { issued: records.length, skipped: ids.length - records.length, reason };
  }

  static async trigger(eventName, payload = {}) {
    const rules = await this.getRules();
    const hitRules = rules.filter(r => r.enabled && r.trigger_event === eventName && r.coupon_id);

    let issued = 0;
    let skipped = 0;

    for (const rule of hitRules) {
      const targetLevels = Array.isArray(rule.target_levels) ? rule.target_levels.map(Number) : [];
      if (targetLevels.length && !targetLevels.includes(Number(payload.roleLevel || 0))) {
        skipped += 1;
        continue;
      }
      const result = await this.issueToUsers({
        couponId: rule.coupon_id,
        userIds: [payload.userId],
        reason: `auto:${eventName}:${rule.id || 'rule'}`
      });
      issued += result.issued;
      skipped += result.skipped;
    }

    return { issued, skipped, matchedRules: hitRules.length };
  }
}

module.exports = CouponAutomationService;
