const { body, param, query, validationResult } = require('express-validator');

/**
 * 通用校验结果处理中间件
 * 放在校验规则之后，处理校验错误
 */
const handleValidation = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            code: -1,
            message: '参数校验失败',
            errors: errors.array().map(e => ({ field: e.path, message: e.msg }))
        });
    }
    next();
};

/**
 * 用户登录校验
 */
const validateLogin = [
    body('code')
        .notEmpty().withMessage('缺少code参数')
        .isString().withMessage('code必须为字符串'),
    body('distributor_id')
        .optional()
        .isString().withMessage('distributor_id必须为字符串'),
    body('nickName')
        .optional()
        .isString().withMessage('昵称必须为字符串')
        .isLength({ max: 100 }).withMessage('昵称最长100个字符'),
    body('avatarUrl')
        .optional()
        .isString().withMessage('头像URL必须为字符串')
        .isLength({ max: 255 }).withMessage('头像URL最长255个字符'),
    handleValidation
];

/**
 * 创建订单校验
 */
const validateCreateOrder = [
    body('product_id')
        .optional()
        .isInt({ min: 1 }).withMessage('商品ID必须为正整数'),
    body('sku_id')
        .optional()
        .isInt({ min: 1 }).withMessage('SKU ID必须为正整数'),
    body('quantity')
        .optional()
        .isInt({ min: 1 }).withMessage('数量必须为正整数'),
    body('address_id')
        .optional()
        .isInt({ min: 1 }).withMessage('地址ID必须为正整数'),
    body('from_cart')
        .optional()
        .isBoolean().withMessage('from_cart必须为布尔值'),
    body('cart_ids')
        .optional()
        .isArray().withMessage('cart_ids必须为数组'),
    body('cart_ids.*')
        .optional()
        .isInt({ min: 1 }).withMessage('购物车ID必须为正整数'),
    handleValidation
];

/**
 * 提现申请校验
 */
const validateWithdrawal = [
    body('amount')
        .notEmpty().withMessage('提现金额不能为空')
        .isFloat({ gt: 0 }).withMessage('提现金额必须大于0'),
    body('method')
        .optional()
        .isIn(['wechat', 'bank']).withMessage('提现方式必须为wechat或bank'),
    body('account_name')
        .optional()
        .isString().withMessage('账户名必须为字符串')
        .isLength({ max: 100 }).withMessage('账户名最长100个字符'),
    body('account_no')
        .optional()
        .isString().withMessage('账号必须为字符串'),
    body('bank_name')
        .optional()
        .isString().withMessage('银行名称必须为字符串'),
    handleValidation
];

/**
 * 分页参数校验（通用）
 */
const validatePagination = [
    query('page')
        .optional()
        .isInt({ min: 1 }).withMessage('页码必须为正整数'),
    query('limit')
        .optional()
        .isInt({ min: 1, max: 100 }).withMessage('每页数量必须为1-100之间的整数'),
    handleValidation
];

/**
 * ID路径参数校验
 */
const validateIdParam = [
    param('id')
        .isInt({ min: 1 }).withMessage('ID必须为正整数'),
    handleValidation
];

module.exports = {
    handleValidation,
    validateLogin,
    validateCreateOrder,
    validateWithdrawal,
    validatePagination,
    validateIdParam
};
