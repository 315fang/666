/**
 * Request validation middleware
 * Provides schema-based validation without external dependencies
 */

/**
 * Validation error class
 */
class ValidationError extends Error {
    constructor(message, field) {
        super(message);
        this.name = 'ValidationError';
        this.field = field;
        this.statusCode = 400;
    }
}

/**
 * Validate a value against rules
 * @param {*} value - Value to validate
 * @param {Object} rules - Validation rules
 * @param {string} fieldName - Field name for error messages
 * @returns {Object} { valid: boolean, error: string|null }
 */
function validateField(value, rules, fieldName) {
    // Required check
    if (rules.required && (value === undefined || value === null || value === '')) {
        return { valid: false, error: `${fieldName} 是必填项` };
    }

    // If not required and value is empty, skip other validations
    if (!rules.required && (value === undefined || value === null || value === '')) {
        return { valid: true, error: null };
    }

    // Type check
    if (rules.type) {
        const actualType = Array.isArray(value) ? 'array' : typeof value;
        if (actualType !== rules.type) {
            return { valid: false, error: `${fieldName} 必须是 ${rules.type} 类型` };
        }
    }

    // String validations
    if (rules.type === 'string') {
        if (rules.minLength && value.length < rules.minLength) {
            return { valid: false, error: `${fieldName} 长度至少为 ${rules.minLength}` };
        }
        if (rules.maxLength && value.length > rules.maxLength) {
            return { valid: false, error: `${fieldName} 长度不能超过 ${rules.maxLength}` };
        }
        if (rules.pattern && !rules.pattern.test(value)) {
            return { valid: false, error: `${fieldName} 格式不正确` };
        }
        if (rules.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
            return { valid: false, error: `${fieldName} 必须是有效的邮箱地址` };
        }
    }

    // Number validations
    if (rules.type === 'number') {
        if (rules.min !== undefined && value < rules.min) {
            return { valid: false, error: `${fieldName} 不能小于 ${rules.min}` };
        }
        if (rules.max !== undefined && value > rules.max) {
            return { valid: false, error: `${fieldName} 不能大于 ${rules.max}` };
        }
        if (rules.integer && !Number.isInteger(value)) {
            return { valid: false, error: `${fieldName} 必须是整数` };
        }
    }

    // Array validations
    if (rules.type === 'array') {
        if (rules.minItems && value.length < rules.minItems) {
            return { valid: false, error: `${fieldName} 至少需要 ${rules.minItems} 个元素` };
        }
        if (rules.maxItems && value.length > rules.maxItems) {
            return { valid: false, error: `${fieldName} 最多允许 ${rules.maxItems} 个元素` };
        }
    }

    // Enum check
    if (rules.enum && !rules.enum.includes(value)) {
        return { valid: false, error: `${fieldName} 必须是以下值之一: ${rules.enum.join(', ')}` };
    }

    // Custom validation function
    if (rules.custom && typeof rules.custom === 'function') {
        const customResult = rules.custom(value);
        if (customResult !== true) {
            return { valid: false, error: customResult || `${fieldName} 验证失败` };
        }
    }

    return { valid: true, error: null };
}

/**
 * Create validation middleware from schema
 * @param {Object} schema - Validation schema
 * @returns {Function} Express middleware
 */
function validate(schema) {
    return (req, res, next) => {
        const errors = [];
        const data = req.body;

        // Validate each field in schema
        for (const [fieldName, rules] of Object.entries(schema)) {
            const value = data[fieldName];
            const result = validateField(value, rules, fieldName);

            if (!result.valid) {
                errors.push({
                    field: fieldName,
                    message: result.error
                });
            }
        }

        // If validation failed, return error response
        if (errors.length > 0) {
            return res.status(400).json({
                code: -1,
                success: false,
                message: '请求参数验证失败',
                errors: errors
            });
        }

        // Validation passed, continue to next middleware
        next();
    };
}

/**
 * Common validation schemas
 */
const schemas = {
    // Auth schemas
    login: {
        code: {
            required: true,
            type: 'string',
            minLength: 1,
            maxLength: 100
        },
        distributor_id: {
            required: false,
            type: 'string',
            maxLength: 50
        }
    },

    // Order schemas
    createOrder: {
        items: {
            required: true,
            type: 'array',
            minItems: 1
        },
        address_id: {
            required: true,
            type: 'number',
            integer: true,
            min: 1
        },
        remark: {
            required: false,
            type: 'string',
            maxLength: 500
        }
    },

    // Address schemas
    createAddress: {
        name: {
            required: true,
            type: 'string',
            minLength: 1,
            maxLength: 50
        },
        phone: {
            required: true,
            type: 'string',
            pattern: /^1[3-9]\d{9}$/
        },
        province: {
            required: true,
            type: 'string',
            minLength: 1,
            maxLength: 50
        },
        city: {
            required: true,
            type: 'string',
            minLength: 1,
            maxLength: 50
        },
        district: {
            required: true,
            type: 'string',
            minLength: 1,
            maxLength: 50
        },
        detail: {
            required: true,
            type: 'string',
            minLength: 1,
            maxLength: 200
        }
    }
};

module.exports = {
    validate,
    validateField,
    ValidationError,
    schemas
};
