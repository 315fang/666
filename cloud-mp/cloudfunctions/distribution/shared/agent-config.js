'use strict';

const DEFAULT_ROLE_NAMES = {
    0: 'VIP用户',
    1: '初级会员',
    2: '高级会员',
    3: '推广合伙人',
    4: '运营合伙人',
    5: '区域合伙人',
    6: '店长'
};

const DEFAULT_AGENT_UPGRADE_RULES = {
    enabled: true,
    c1_min_purchase: 299,
    c2_referee_count: 2,
    c2_min_sales: 580,
    c2_growth_value: 999,
    b1_referee_count: 10,
    b1_recharge: 3000,
    b1_growth_value: 3000,
    b2_referee_count: 10,
    b2_recharge: 30000,
    b3_referee_b2_count: 3,
    b3_referee_b1_count: 30,
    b3_recharge: 198000,
    effective_order_days: 7
};

const DEFAULT_COMMISSION_MATRIX = {
    1: { 0: 20 },
    2: { 0: 30, 1: 5 },
    3: { 1: 20, 2: 10 },
    4: { 1: 30, 2: 20, 3: 10 },
    5: { 1: 35, 2: 25, 3: 15, 4: 5 }
};

const DEFAULT_BUNDLE_COMMISSION_MATRIX = {
    1: { 0: 20 },
    2: { 0: 30, 1: 5 },
    3: { 1: 20, 2: 10 },
    4: { 1: 30, 2: 20, 3: 10 },
    5: { 1: 35, 2: 25, 3: 15, 4: 5 }
};

const DEFAULT_AGENT_COMMISSION_CONFIG = {
    direct_pct_by_role: { 1: 20, 2: 30, 3: 40, 4: 40, 5: 40 },
    indirect_pct_by_role: { 2: 0, 3: 0, 4: 10, 5: 10 },
    commission_matrix: DEFAULT_COMMISSION_MATRIX,
    bundle_commission_matrix: DEFAULT_BUNDLE_COMMISSION_MATRIX
};

const DEFAULT_COST_SPLIT = {
    enabled: true,
    direct_sales_pct: 40,
    operations_pct: 25,
    mirror_operations_pct: 5,
    profit_pct: 30
};

const DEFAULT_PEER_BONUS_CONFIG = {
    enabled: false,
    bonus_pct: 0
};

const DEFAULT_POINT_RULES = {
    enable: true,
    points_per_yuan: 1,
    max_order_ratio: 0.7,
    yuan_per_point: 0.1
};

module.exports = {
    DEFAULT_ROLE_NAMES,
    DEFAULT_AGENT_UPGRADE_RULES,
    DEFAULT_COMMISSION_MATRIX,
    DEFAULT_BUNDLE_COMMISSION_MATRIX,
    DEFAULT_AGENT_COMMISSION_CONFIG,
    DEFAULT_COST_SPLIT,
    DEFAULT_PEER_BONUS_CONFIG,
    DEFAULT_POINT_RULES
};