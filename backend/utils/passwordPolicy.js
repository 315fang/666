/**
 * 密码策略工具
 * 
 * 规则：
 * - 最少 8 位
 * - 必须包含大写字母
 * - 必须包含小写字母
 * - 必须包含数字
 * - 可选：包含特殊字符（会增加强度评分）
 * - 不能是常见弱密码
 */

const WEAK_PASSWORDS = new Set([
    '12345678', '123456789', '1234567890', 'password', 'password1',
    'qwerty123', 'qwertyuiop', '11111111', '00000000', 'abcdefgh',
    'admin123', 'admin1234', 'iloveyou', 'welcome1', 'monkey123',
    'dragon12', 'master12', 'sunshine', 'princess', 'football'
]);

/**
 * 评估密码强度
 * @param {string} password
 * @returns {{ score: number, level: 'weak'|'fair'|'strong'|'very_strong', tips: string[] }}
 */
function evaluateStrength(password) {
    if (!password || typeof password !== 'string') {
        return { score: 0, level: 'weak', tips: ['密码不能为空'] };
    }

    let score = 0;
    const tips = [];

    // 长度评分
    if (password.length >= 8) score += 1;
    if (password.length >= 12) score += 1;
    if (password.length >= 16) score += 1;

    // 字符种类
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasDigit = /[0-9]/.test(password);
    const hasSpecial = /[^A-Za-z0-9]/.test(password);

    if (hasUpper) score += 1;
    if (hasLower) score += 1;
    if (hasDigit) score += 1;
    if (hasSpecial) score += 2;

    // 惩罚：连续重复字符
    if (/(.)\1{3,}/.test(password)) {
        score -= 1;
        tips.push('避免使用连续重复字符');
    }

    // 惩罚：连续键盘字符
    if (/qwert|asdfg|zxcvb|12345|98765/i.test(password)) {
        score -= 1;
        tips.push('避免使用键盘连续字符');
    }

    const level = score <= 2 ? 'weak' : score <= 4 ? 'fair' : score <= 6 ? 'strong' : 'very_strong';

    return { score: Math.max(0, score), level, tips };
}

/**
 * 校验密码是否符合策略要求
 * @param {string} password
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validatePassword(password) {
    const errors = [];

    if (!password || typeof password !== 'string') {
        return { valid: false, errors: ['密码不能为空'] };
    }

    if (password.length < 8) {
        errors.push('密码长度至少 8 位');
    }

    if (password.length > 72) {
        errors.push('密码长度不能超过 72 位');
    }

    if (!/[A-Z]/.test(password)) {
        errors.push('密码必须包含至少一个大写字母');
    }

    if (!/[a-z]/.test(password)) {
        errors.push('密码必须包含至少一个小写字母');
    }

    if (!/[0-9]/.test(password)) {
        errors.push('密码必须包含至少一个数字');
    }

    if (WEAK_PASSWORDS.has(password.toLowerCase())) {
        errors.push('密码过于常见，请使用更复杂的密码');
    }

    return {
        valid: errors.length === 0,
        errors,
        strength: evaluateStrength(password)
    };
}

/**
 * Express 中间件：校验请求体中的 password 字段
 * @param {string} [field='password'] - 要校验的字段名
 */
function passwordPolicyMiddleware(field = 'password') {
    return (req, res, next) => {
        const password = req.body[field];
        if (!password) return next(); // 允许字段缺失（由其他 required 校验处理）

        const result = validatePassword(password);
        if (!result.valid) {
            return res.status(400).json({
                code: -1,
                message: '密码不符合安全策略',
                errors: result.errors
            });
        }
        next();
    };
}

module.exports = {
    validatePassword,
    evaluateStrength,
    passwordPolicyMiddleware,
    WEAK_PASSWORDS
};
