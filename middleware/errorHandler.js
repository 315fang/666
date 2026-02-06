/**
 * 全局错误处理中间件
 */
function errorHandler(err, req, res, next) {
    // 生产环境仅记录错误消息，开发环境记录完整错误
    if (process.env.NODE_ENV === 'production') {
        console.error('错误:', err.message);
    } else {
        console.error('错误详情:', err);
    }

    // Sequelize验证错误
    if (err.name === 'SequelizeValidationError') {
        return res.status(400).json({
            success: false,
            message: '数据验证失败',
            errors: err.errors.map(e => e.message)
        });
    }

    // Sequelize唯一约束错误
    if (err.name === 'SequelizeUniqueConstraintError') {
        return res.status(400).json({
            success: false,
            message: '数据已存在'
        });
    }

    // 默认错误 — 生产环境隐藏内部错误信息
    const statusCode = err.status || 500;
    const message = (statusCode === 500 && process.env.NODE_ENV === 'production')
        ? '服务器内部错误'
        : (err.message || '服务器内部错误');

    res.status(statusCode).json({
        success: false,
        message
    });
}

/**
 * 404处理
 */
function notFound(req, res) {
    res.status(404).json({
        success: false,
        message: '接口不存在'
    });
}

module.exports = {
    errorHandler,
    notFound
};
