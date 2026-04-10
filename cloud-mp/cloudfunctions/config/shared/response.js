/**
 * cloudfunctions/shared/response.js
 * 
 * 统一的响应格式生成器
 * 所有云函数返回统一的结构
 */

/**
 * 成功响应
 * @param {*} data - 响应数据
 * @param {string} message - 可选的成功消息
 * @returns {Object} 标准响应对象
 */
function success(data = null, message = null) {
    return {
        code: 0,
        success: true,
        message: message || 'ok',
        data: data,
        timestamp: new Date().toISOString()
    };
}

/**
 * 错误响应
 * @param {number} code - 错误码
 * @param {string} message - 错误消息
 * @param {*} data - 可选的错误数据
 * @returns {Object} 标准响应对象
 */
function error(code = 500, message = 'Internal server error', data = null) {
    return {
        code: code || 500,
        success: false,
        message: message,
        data: data,
        timestamp: new Date().toISOString()
    };
}

/**
 * 分页响应
 * @param {Array} list - 数据列表
 * @param {number} page - 当前页码
 * @param {number} limit - 每页数量
 * @param {number} total - 总条数
 * @returns {Object} 标准分页响应
 */
function paginated(list = [], page = 1, limit = 20, total = 0) {
    return success(
        {
            list: list,
            pagination: {
                page: Math.max(1, parseInt(page) || 1),
                limit: Math.max(1, parseInt(limit) || 20),
                total: Math.max(0, parseInt(total) || list.length),
                pages: Math.ceil((total || list.length) / (limit || 20))
            }
        },
        'paginated data'
    );
}

/**
 * 列表响应（无分页）
 * @param {Array} list - 数据列表
 * @param {number} count - 总条数
 * @returns {Object} 标准列表响应
 */
function list(list = [], count = null) {
    return success(
        {
            list: list,
            count: count !== null ? count : list.length
        },
        'list data'
    );
}

/**
 * 创建成功响应
 * @param {*} data - 创建后的数据
 * @param {string} message - 可选消息
 * @returns {Object} 标准响应
 */
function created(data, message = 'Resource created successfully') {
    return success(data, message);
}

/**
 * 更新成功响应
 * @param {*} data - 更新后的数据
 * @param {string} message - 可选消息
 * @returns {Object} 标准响应
 */
function updated(data, message = 'Resource updated successfully') {
    return success(data, message);
}

/**
 * 删除成功响应
 * @param {string} message - 可选消息
 * @returns {Object} 标准响应
 */
function deleted(message = 'Resource deleted successfully') {
    return success(null, message);
}

/**
 * 常见错误响应集
 */
const RESPONSES = {
    // 400 Bad Request
    INVALID_REQUEST: (msg = 'Invalid request') => error(400, msg),
    MISSING_FIELD: (field) => error(400, `Missing required field: ${field}`),
    INVALID_PARAM: (msg) => error(400, `Invalid parameter: ${msg}`),
    INVALID_ACTION: (action) => error(400, `Invalid action: ${action}`),

    // 401 Unauthorized
    UNAUTHORIZED: () => error(401, 'Unauthorized access'),
    LOGIN_REQUIRED: () => error(401, 'Login required'),

    // 403 Forbidden
    FORBIDDEN: (msg = 'Access forbidden') => error(403, msg),
    PERMISSION_DENIED: () => error(403, 'Permission denied'),

    // 404 Not Found
    NOT_FOUND: (resource = 'Resource') => error(404, `${resource} not found`),

    // 409 Conflict
    ALREADY_EXISTS: (resource = 'Resource') => error(409, `${resource} already exists`),
    OUT_OF_STOCK: () => error(409, 'Item out of stock'),

    // 500 Internal Server Error
    INTERNAL_ERROR: (msg = 'Internal server error') => error(500, msg),
    SERVICE_ERROR: (service) => error(500, `${service} service error`)
};

/**
 * 便捷错误响应函数（兼容旧导入）
 */
function badRequest(message = 'Bad request') {
    return error(400, message);
}

function unauthorized(message = 'Unauthorized') {
    return error(401, message);
}

function forbidden(message = 'Forbidden') {
    return error(403, message);
}

function notFound(message = 'Not found') {
    return error(404, message);
}

function conflict(message = 'Conflict') {
    return error(409, message);
}

function serverError(message = 'Internal server error') {
    return error(500, message);
}

module.exports = {
    success,
    error,
    paginated,
    list,
    created,
    updated,
    deleted,
    RESPONSES,
    // 便捷错误函数
    badRequest,
    unauthorized,
    forbidden,
    notFound,
    conflict,
    serverError
};
