/**
 * 业务错误类
 *
 * 用途：Service/Controller 层抛出可被 errorHandler 捕获的结构化业务错误。
 * 替代直接 res.json({ code: -1, message: 'xxx' }) 的反模式。
 *
 * 使用方式：
 *   // Service 层
 *   if (!user) throw new BusinessError('用户不存在', 404);
 *   throw new BusinessError('余额不足', 400, 'INSUFFICIENT_BALANCE');
 *
 *   // Controller 层
 *   try { ... } catch (err) { next(err); }  // errorHandler 自动处理
 *
 * 兼容性：
 *   - err.statusCode  < 500 → 被 errorHandler 视为"已知业务错误"，返回 err.message
 *   - err.code        → 可自定义前端错误码（默认 -1）
 */
class BusinessError extends Error {
    /**
     * @param {string}  message     错误信息（会透传给客户端）
     * @param {number}  [statusCode=400] HTTP 状态码
     * @param {number|string} [code=-1]      业务错误码（前端用于 switch 分支）
     * @param {object}  [data=null]          附加数据（如校验详情等）
     */
    constructor(message, statusCode = 400, code = -1, data = null) {
        super(message);
        this.name = 'BusinessError';
        this.statusCode = statusCode;
        this.code = code;
        this.data = data;

        // 保持堆栈追踪（V8 需要）
        Error.captureStackTrace(this, this.constructor);
    }
}

module.exports = { BusinessError };
