/**
 * 统一 API 响应工具
 *
 * 提供统一的错误响应格式，确保生产环境不暴露内部错误详情。
 * 使用方式：
 *   const { serverError } = require('../utils/apiResponse');
 *   // 在 catch 块中:
 *   return serverError(res, err);
 */

const isProduction = process.env.NODE_ENV === 'production';

/**
 * 服务器内部错误响应（500）
 * 生产环境不暴露 err.message，防止内部路径、函数名泄露
 * @param {Response} res - Express Response 对象
 * @param {Error} err - 错误对象
 * @param {string} [customMessage] - 可选的的自定义消息（开发环境仍会追加 err.message）
 * @returns {Response}
 */
function serverError(res, err, customMessage = null) {
    const message = isProduction
        ? (customMessage || '服务器内部错误，请稍后重试')
        : `${customMessage || '服务器内部错误'}: ${err.message}`;

    return res.status(500).json({
        code: -1,
        message
    });
}

/**
 * 操作失败响应（通常用于业务逻辑错误）
 * @param {Response} res
 * @param {string} message - 错误消息
 * @param {number} [code=-1]
 * @returns {Response}
 */
function fail(res, message, code = -1) {
    return res.status(200).json({ code, message });
}

/**
 * 成功响应
 * @param {Response} res
 * @param {any} data - 返回数据
 * @param {string} [message='success']
 * @returns {Response}
 */
function success(res, data = null, message = 'success') {
    return res.status(200).json({ code: 0, message, data });
}

module.exports = {
    serverError,
    fail,
    success,
    isProduction
};