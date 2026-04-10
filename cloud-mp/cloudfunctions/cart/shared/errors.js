/**
 * cloudfunctions/shared/errors.js
 * 
 * 统一的错误处理类和工具
 * 所有云函数使用统一的错误格式
 */

/**
 * CloudBase 标准错误类
 */
class CloudBaseError extends Error {
    constructor(code, message, data = null) {
        super(message);
        this.code = code;
        this.data = data;
        this.name = 'CloudBaseError';
        this.timestamp = new Date().toISOString();
    }

    /**
     * 转换为标准响应格式
     */
    toResponse() {
        return {
            code: this.code,
            success: false,
            message: this.message,
            data: this.data,
            timestamp: this.timestamp
        };
    }

    /**
     * 转换为日志格式
     */
    toLog() {
        return {
            error: this.name,
            code: this.code,
            message: this.message,
            data: this.data,
            timestamp: this.timestamp,
            stack: this.stack
        };
    }
}

/**
 * 常见错误实例
 */
const ERRORS = {
    // 4xx 客户端错误
    BAD_REQUEST: (msg = 'Invalid request') => new CloudBaseError(400, msg),
    UNAUTHORIZED: (msg = 'Unauthorized') => new CloudBaseError(401, msg),
    FORBIDDEN: (msg = 'Permission denied') => new CloudBaseError(403, msg),
    NOT_FOUND: (msg = 'Resource not found') => new CloudBaseError(404, msg),
    CONFLICT: (msg = 'Resource conflict') => new CloudBaseError(409, msg),

    // 5xx 服务端错误
    INTERNAL_ERROR: (msg = 'Internal server error') => new CloudBaseError(500, msg),
    SERVICE_UNAVAILABLE: (msg = 'Service unavailable') => new CloudBaseError(503, msg),

    // 业务错误
    INVALID_PARAM: (msg, data) => new CloudBaseError(400, `Invalid parameter: ${msg}`, data),
    INVALID_ACTION: (action) => new CloudBaseError(400, `Invalid action: ${action}`),
    MISSING_FIELD: (field) => new CloudBaseError(400, `Missing required field: ${field}`),
    INSUFFICIENT_BALANCE: () => new CloudBaseError(402, 'Insufficient balance'),
    ITEM_OUT_OF_STOCK: () => new CloudBaseError(409, 'Item out of stock'),
    COUPON_EXPIRED: () => new CloudBaseError(409, 'Coupon has expired'),
    ORDER_NOT_FOUND: () => new CloudBaseError(404, 'Order not found'),
    USER_NOT_FOUND: () => new CloudBaseError(404, 'User not found')
};

/**
 * 错误处理中间件（用于云函数包装）
 */
function handleError(error) {
    // 已经是 CloudBaseError
    if (error instanceof CloudBaseError) {
        return error.toResponse();
    }

    // 已经是标准响应对象（例如 throw badRequest(...)）
    if (error && typeof error === 'object' && 'code' in error && 'success' in error && 'message' in error) {
        return error;
    }

    // 标准 Error 对象
    if (error instanceof Error) {
        console.error('[CloudFunction Error]', error.message, error.stack);
        return new CloudBaseError(500, error.message || 'Internal error').toResponse();
    }

    // 其他类型
    console.error('[CloudFunction Unknown Error]', error);
    return new CloudBaseError(500, 'Unknown error').toResponse();
}

/**
 * 云函数执行包装（用于统一错误处理）
 * @param {Function} handler - 云函数处理函数
 * @returns {Function} 包装后的函数
 */
function wrapCloudFunction(handler) {
    return async function (event) {
        try {
            const result = await handler(event);
            // 确保返回标准格式
            if (result && typeof result === 'object' && 'code' in result) {
                return result;
            }
            return { code: 0, success: true, data: result };
        } catch (error) {
            return handleError(error);
        }
    };
}

/**
 * 错误码常量集（兼容旧导入）
 */
const ERROR_CODES = {
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    INTERNAL_ERROR: 500,
    SERVICE_UNAVAILABLE: 503
};

module.exports = {
    CloudBaseError,
    ERRORS,
    ERROR_CODES,
    handleError,
    errorHandler: handleError,  // 别名
    wrapCloudFunction,
    cloudFunctionWrapper: wrapCloudFunction  // 别名：兼容所有云函数的导入名
};
