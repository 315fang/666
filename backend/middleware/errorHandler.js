/**
 * 全局错误处理中间件（增强版）
 * 
 * 处理所有类型的错误，包括：
 * - Sequelize ORM 错误（验证、唯一约束、外键约束、连接失败）
 * - JWT 认证错误
 * - 自定义业务错误（ValidationError, AppError）
 * - Multer 文件上传错误
 * - 通用服务器错误
 */
const logger = require('../utils/logger');

const isProduction = process.env.NODE_ENV === 'production';

/**
 * 统一错误响应格式
 */
function sendError(res, statusCode, code, message, details = null) {
    const body = { code, message };
    if (details && !isProduction) body.details = details;
    return res.status(statusCode).json(body);
}

/**
 * 全局错误处理中间件
 */
function errorHandler(err, req, res, next) {
    // ===== 已发送响应，不再处理 =====
    if (res.headersSent) return next(err);

    // ===== Sequelize：字段验证失败 =====
    if (err.name === 'SequelizeValidationError') {
        return sendError(res, 400, -1, '数据验证失败',
            err.errors?.map(e => ({ field: e.path, message: e.message }))
        );
    }

    // ===== Sequelize：唯一约束冲突 =====
    if (err.name === 'SequelizeUniqueConstraintError') {
        const field = err.errors?.[0]?.path || '字段';
        return sendError(res, 409, -1, `${field} 已存在，请勿重复提交`);
    }

    // ===== Sequelize：外键约束 =====
    if (err.name === 'SequelizeForeignKeyConstraintError') {
        return sendError(res, 400, -1, '关联数据不存在或已被删除');
    }

    // ===== Sequelize：数据库连接失败 =====
    if (err.name === 'SequelizeConnectionError' || err.name === 'SequelizeConnectionRefusedError') {
        logger.error('DB', '数据库连接失败', { message: err.message });
        return sendError(res, 503, -1, '数据库服务暂时不可用，请稍后重试');
    }

    // ===== Sequelize：事务错误 =====
    if (err.name === 'SequelizeDatabaseError') {
        logger.error('DB', '数据库查询错误', { message: err.message, sql: err.sql });
        return sendError(res, 500, -1,
            isProduction ? '数据库操作失败' : err.message
        );
    }

    // ===== JWT：Token 过期 =====
    if (err.name === 'TokenExpiredError') {
        return sendError(res, 401, 401, 'Token 已过期，请重新登录');
    }

    // ===== JWT：Token 格式错误 =====
    if (err.name === 'JsonWebTokenError') {
        return sendError(res, 401, 401, '无效的 Token，请重新登录');
    }

    // ===== Multer：文件大小超限 =====
    if (err.code === 'LIMIT_FILE_SIZE') {
        return sendError(res, 413, -1, `文件大小超出限制（最大 ${Math.round(err.limit / 1024 / 1024)}MB）`);
    }

    // ===== Multer：文件数量超限 =====
    if (err.code === 'LIMIT_FILE_COUNT') {
        return sendError(res, 400, -1, '上传文件数量超出限制');
    }

    // ===== Multer：字段名错误 =====
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return sendError(res, 400, -1, `无效的上传字段: ${err.field}`);
    }

    // ===== 业务错误：自定义 AppError =====
    if (err.statusCode && err.statusCode < 500) {
        return sendError(res, err.statusCode, err.code || -1, err.message);
    }

    // ===== 业务错误：参数校验失败（ValidationError）=====
    if (err.name === 'ValidationError') {
        return sendError(res, 400, -1, err.message);
    }

    // ===== SyntaxError：JSON 解析失败 =====
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        return sendError(res, 400, -1, '请求体 JSON 格式错误');
    }

    // ===== 未知服务器错误 =====
    logger.error('SERVER', '未捕获的服务器错误', {
        message: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method,
        userId: req.user?.id
    });

    return sendError(res, 500, -1,
        isProduction ? '服务器内部错误，请稍后重试' : err.message
    );
}

/**
 * 404 处理
 */
function notFound(req, res) {
    res.status(404).json({
        code: -1,
        message: `接口不存在: ${req.method} ${req.path}`
    });
}

/**
 * 创建业务错误的工厂函数
 * @param {string} message
 * @param {number} [statusCode=400]
 * @param {number|string} [code=-1]
 */
function createAppError(message, statusCode = 400, code = -1) {
    const err = new Error(message);
    err.statusCode = statusCode;
    err.code = code;
    return err;
}

module.exports = {
    errorHandler,
    notFound,
    createAppError
};
