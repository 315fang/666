const { AppConfig } = require('../models');

const RULE_KEYS = [
    'RULES_TITLE',
    'RULES_SUMMARY',
    'RULES_DETAILS'
];

const ensureDefaultConfig = async () => {
    const defaults = {
        RULES_TITLE: '发货与佣金规则说明',
        RULES_SUMMARY: '平台发货无佣金；代理商发货按差级利润计算，结算需售后期结束并管理员审批。',
        RULES_DETAILS: [
            '订单可能拆为代理商发货与平台发货两部分，平台发货不产生团队佣金。',
            '代理商发货时按差级利润计算：从代理商到出单人之间的价格阶梯差价。',
            '佣金先冻结，售后期结束且无退款后进入审批，管理员确认后到账。'
        ]
    };

    for (const [key, value] of Object.entries(defaults)) {
        const existing = await AppConfig.findOne({ where: { config_key: key } });
        if (!existing) {
            await AppConfig.create({
                config_key: key,
                config_value: Array.isArray(value) ? JSON.stringify(value) : String(value),
                config_type: Array.isArray(value) ? 'json' : 'string',
                category: 'notice',
                description: '发货与佣金规则说明',
                is_public: true,
                status: 1
            });
        }
    }
};

const getRules = async (req, res) => {
    try {
        await ensureDefaultConfig();

        const configs = await AppConfig.findAll({
            where: { config_key: RULE_KEYS, status: 1 },
            attributes: ['config_key', 'config_value', 'config_type']
        });

        const result = {
            title: '',
            summary: '',
            details: []
        };

        for (const config of configs) {
            let value = config.config_value;
            if (config.config_type === 'json') {
                try {
                    value = JSON.parse(value);
                } catch (e) {}
            }

            if (config.config_key === 'RULES_TITLE') result.title = value || '';
            if (config.config_key === 'RULES_SUMMARY') result.summary = value || '';
            if (config.config_key === 'RULES_DETAILS') result.details = Array.isArray(value) ? value : [];
        }

        res.json({
            code: 0,
            data: result
        });
    } catch (error) {
        console.error('获取规则说明失败:', error);
        res.status(500).json({ code: -1, message: '获取规则说明失败' });
    }
};

module.exports = {
    getRules
};
