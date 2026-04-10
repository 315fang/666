/**
 * cloudfunctions/shared/validators.js
 * 
 * 统一的参数验证工具集
 * 避免在各个云函数中重复验证逻辑
 */

/**
 * 验证 action 参数
 * @param {string} action - 传入的 action 值
 * @param {Array<string>} allowed - 允许的 action 列表
 * @throws {Error} action 不在允许列表中
 */
function validateAction(action, allowed) {
    if (!action || typeof action !== 'string') {
        throw new Error('action parameter is required and must be string');
    }
    if (!allowed.includes(action)) {
        throw new Error(`Invalid action: ${action}. Must be one of: ${allowed.join(', ')}`);
    }
}

/**
 * 验证并转换金额（元 → 分）
 * @param {number|string} value - 金额值
 * @param {number} min - 最小值（元）
 * @param {number} max - 最大值（元）
 * @returns {number} 转换后的分数
 * @throws {Error} 金额无效或超出范围
 */
function validateAmount(value, min = 0.01, max = 999999) {
    const num = Number(value);
    if (!Number.isFinite(num)) {
        throw new Error(`Invalid amount: ${value}, must be a number`);
    }
    if (num < min || num > max) {
        throw new Error(`Amount out of range: ${num}, must be between ${min} and ${max}`);
    }
    // 四舍五入到分
    return Math.round(num * 100) / 100;
}

/**
 * 验证整数（如数量、库存）
 * @param {number|string} value - 整数值
 * @param {number} min - 最小值
 * @param {number} max - 最大值
 * @returns {number} 转换后的整数
 * @throws {Error} 不是有效的整数
 */
function validateInteger(value, min = 0, max = 999999) {
    const num = parseInt(value, 10);
    if (!Number.isFinite(num) || num !== Number(value)) {
        throw new Error(`Invalid integer: ${value}, must be an integer`);
    }
    if (num < min || num > max) {
        throw new Error(`Integer out of range: ${num}, must be between ${min} and ${max}`);
    }
    return num;
}

/**
 * 验证字符串长度和格式
 * @param {string} value - 字符串值
 * @param {number} maxLength - 最大长度
 * @param {RegExp} pattern - 可选的格式验证正则
 * @returns {string} 原始字符串
 * @throws {Error} 字符串无效
 */
function validateString(value, maxLength = 500, pattern = null) {
    if (typeof value !== 'string') {
        throw new Error(`Expected string, got ${typeof value}`);
    }
    if (value.length > maxLength) {
        throw new Error(`String exceeds max length: ${value.length} > ${maxLength}`);
    }
    if (pattern && !pattern.test(value)) {
        throw new Error(`String does not match required pattern: ${value}`);
    }
    return value;
}

/**
 * 验证数组格式
 * @param {Array} value - 数组值
 * @param {number} minItems - 最少项数
 * @param {number} maxItems - 最多项数
 * @returns {Array} 原始数组
 * @throws {Error} 数组无效
 */
function validateArray(value, minItems = 0, maxItems = 1000) {
    if (!Array.isArray(value)) {
        throw new Error(`Expected array, got ${typeof value}`);
    }
    if (value.length < minItems || value.length > maxItems) {
        throw new Error(`Array size out of range: ${value.length}, must be [${minItems}, ${maxItems}]`);
    }
    return value;
}

/**
 * 验证对象存在（非 null/undefined）
 * @param {*} value - 待检查的值
 * @param {string} fieldName - 字段名（用于错误消息）
 * @returns {boolean} 值存在
 * @throws {Error} 值不存在
 */
function validateExists(value, fieldName) {
    if (value == null) {
        throw new Error(`Required field missing: ${fieldName}`);
    }
    return true;
}

/**
 * 验证对象ID格式（CloudBase _id 或 openid）
 * @param {string} id - ID值
 * @returns {string} 原始 ID
 * @throws {Error} ID 格式无效
 */
function validateId(id) {
    if (typeof id !== 'string' || id.trim().length === 0) {
        throw new Error(`Invalid ID: ${id}, must be non-empty string`);
    }
    if (id.length > 256) {
        throw new Error(`ID too long: ${id.length} > 256`);
    }
    return id;
}

/**
 * 验证分页参数
 * @param {number|string} page - 页码
 * @param {number|string} limit - 每页数量
 * @returns {Object} {page, limit} 验证后的分页参数
 * @throws {Error} 分页参数无效
 */
function validatePagination(page, limit) {
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    
    if (pageNum < 1 || pageNum > 10000) {
        throw new Error(`Invalid page: ${pageNum}, must be [1, 10000]`);
    }
    if (limitNum < 1 || limitNum > 500) {
        throw new Error(`Invalid limit: ${limitNum}, must be [1, 500]`);
    }
    
    return { page: pageNum, limit: limitNum };
}

/**
 * 批量验证必需字段
 * @param {Object} data - 数据对象
 * @param {Array<string>} required - 必需字段列表
 * @throws {Error} 缺少必需字段
 */
function validateRequired(data, required) {
    const missing = required.filter(field => !data.hasOwnProperty(field) || data[field] == null);
    if (missing.length > 0) {
        throw new Error(`Missing required fields: ${missing.join(', ')}`);
    }
}

module.exports = {
    validateAction,
    validateAmount,
    validateInteger,
    validateString,
    validateArray,
    validateExists,
    validateId,
    validatePagination,
    validateRequired,
    validateRequiredFields: validateRequired  // 别名：兼容旧导入名
};
