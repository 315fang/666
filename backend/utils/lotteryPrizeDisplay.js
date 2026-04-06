const LOTTERY_PRIZE_STYLE_KEY = 'lottery_prize_style_config';
const LOTTERY_PRIZE_STYLE_CATEGORY = 'lottery';

const DEFAULT_PRIZE_STYLE_MAP = {
    physical: {
        display_emoji: '🎁',
        theme_color: '#F59E0B',
        accent_color: '#FDE68A',
        badge_text: '实物奖'
    },
    points: {
        display_emoji: '⭐',
        theme_color: '#2563EB',
        accent_color: '#93C5FD',
        badge_text: '积分奖'
    },
    coupon: {
        display_emoji: '🎫',
        theme_color: '#10B981',
        accent_color: '#6EE7B7',
        badge_text: '优惠券'
    },
    miss: {
        display_emoji: '🍀',
        theme_color: '#6B7280',
        accent_color: '#D1D5DB',
        badge_text: '好运签'
    }
};

function cleanString(value, fallback, maxLength) {
    const normalized = typeof value === 'string' ? value.trim() : '';
    return normalized ? normalized.slice(0, maxLength) : fallback;
}

function normalizeHexColor(value, fallback) {
    const normalized = typeof value === 'string' ? value.trim() : '';
    return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(normalized) ? normalized : fallback;
}

function getDefaultPrizeStyle(type = 'miss') {
    return {
        ...(DEFAULT_PRIZE_STYLE_MAP[type] || DEFAULT_PRIZE_STYLE_MAP.miss)
    };
}

function sanitizePrizeStyle(payload = {}, type = 'miss') {
    const defaults = getDefaultPrizeStyle(type);
    return {
        display_emoji: cleanString(payload.display_emoji, defaults.display_emoji, 8),
        theme_color: normalizeHexColor(payload.theme_color, defaults.theme_color),
        accent_color: normalizeHexColor(payload.accent_color, defaults.accent_color),
        badge_text: cleanString(payload.badge_text, defaults.badge_text, 12)
    };
}

async function loadLotteryPrizeStyleConfig(AppConfig) {
    const row = await AppConfig.findOne({
        where: {
            category: LOTTERY_PRIZE_STYLE_CATEGORY,
            config_key: LOTTERY_PRIZE_STYLE_KEY,
            status: 1
        }
    });

    if (!row?.config_value) {
        return { prize_styles: {} };
    }

    try {
        const parsed = JSON.parse(row.config_value);
        return {
            prize_styles: parsed?.prize_styles && typeof parsed.prize_styles === 'object'
                ? parsed.prize_styles
                : {}
        };
    } catch (_) {
        return { prize_styles: {} };
    }
}

async function saveLotteryPrizeStyleConfig(AppConfig, styleConfig = {}) {
    const payload = {
        prize_styles: styleConfig?.prize_styles && typeof styleConfig.prize_styles === 'object'
            ? styleConfig.prize_styles
            : {}
    };

    await AppConfig.upsert({
        config_key: LOTTERY_PRIZE_STYLE_KEY,
        config_value: JSON.stringify(payload),
        config_type: 'json',
        category: LOTTERY_PRIZE_STYLE_CATEGORY,
        description: '积分抽奖奖品展示样式配置',
        is_public: true,
        status: 1
    });
}

function applyLotteryPrizeStyle(prize, styleConfig = {}) {
    const plainPrize = typeof prize?.toJSON === 'function'
        ? prize.toJSON()
        : { ...(prize || {}) };
    const prizeStyles = styleConfig?.prize_styles || {};
    const style = sanitizePrizeStyle(
        prizeStyles[String(plainPrize.id)] || prizeStyles[plainPrize.id] || {},
        plainPrize.type
    );

    return {
        ...plainPrize,
        ...style
    };
}

function upsertLotteryPrizeStyle(styleConfig = {}, prizeId, prizeType, payload = {}) {
    const nextConfig = {
        prize_styles: {
            ...(styleConfig?.prize_styles || {})
        }
    };

    nextConfig.prize_styles[String(prizeId)] = sanitizePrizeStyle(payload, prizeType);
    return nextConfig;
}

function removeLotteryPrizeStyle(styleConfig = {}, prizeId) {
    const nextConfig = {
        prize_styles: {
            ...(styleConfig?.prize_styles || {})
        }
    };

    delete nextConfig.prize_styles[String(prizeId)];
    return nextConfig;
}

module.exports = {
    getDefaultPrizeStyle,
    loadLotteryPrizeStyleConfig,
    saveLotteryPrizeStyleConfig,
    applyLotteryPrizeStyle,
    upsertLotteryPrizeStyle,
    removeLotteryPrizeStyle
};
