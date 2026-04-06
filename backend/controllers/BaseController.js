/**
 * Controller 基类
 *
 * 提供统一的成功/失败响应方法，消除各 Controller 中重复的 res.json 样板代码。
 * 所有 Controller 继承此类后使用 this.success() / this.fail() 响应。
 *
 * 使用方式：
 *   class MyController extends BaseController {
 *       async action(req, res) {
 *           const data = await SomeService.findById(id);
 *           if (!data) return this.fail(res, 404, '不存在');
 *           return this.success(res, data);
 *       }
 *   }
 *
 *   // 或者用静态方法（不实例化）：
 *   const ctrl = new MyController();
 *   router.get('/', (req, res, next) => ctrl.action(req, res).catch(next));
 */
const { BusinessError } = require('../utils/errors');
const { logError } = require('../utils/logger');

class BaseController {
    /**
     * 统一成功响应
     * @param {import('express').Response} res
     * @param {*} [data=null]
     * @param {string} [message='ok']
     * @returns {object}
     */
    success(res, data = null, message = 'ok') {
        const body = { code: 0, message };
        if (data !== null && data !== undefined) body.data = data;
        return res.json(body);
    }

    /**
     * 统一失败响应（直接返回 JSON，不经过 next）
     * 用于已知的、不需要记录堆栈的业务逻辑错误
     *
     * @param {import('express').Response} res
     * @param {number} [statusCode=400]
     * @param {string} [message='操作失败']
     * @param {number|string} [code=-1]
     * @param {*} [data=null]
     * @returns {object}
     */
    fail(res, statusCode = 400, message = '操作失败', code = -1, data = null) {
        const body = { code, message };
        if (data !== null) body.data = data;
        return res.status(statusCode).json(body);
    }

    /**
     * 抛出业务错误（会被 errorHandler 中间件捕获并格式化响应）
     *
     * @param {string} message
     * @param {number} [statusCode=400]
     * @param {number|string} [code=-1]
     * @param {*} [data=null]
     * @throws {BusinessError}
     */
    throwError(message, statusCode = 400, code = -1, data = null) {
        throw new BusinessError(message, statusCode, code, data);
    }

    /**
     * 异步路由包装器 — 将异步函数的错误自动传递给 next(err)
     * 替代每个 handler 中手写的 try/catch(next)
     *
     * 用法：router.get('/list', ctrl.asyncHandler(ctrl.getList))
     *
     * @param {Function} fn - async (req, res, next) => {}
     * @returns {Function}
     */
    asyncHandler(fn) {
        return (req, res, next) => {
            Promise.resolve(fn.call(this, req, res, next)).catch(next);
        };
    }
}

module.exports = { BaseController, BusinessError };
