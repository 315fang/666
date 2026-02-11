const { ActivityLog } = require('../models');

/**
 * 活动日志中间件
 * 自动记录管理员在后台的操作
 */

/**
 * 活动日志记录中间件
 * 使用方式：router.post('/resource', authenticateAdmin, logActivity('create', 'resource'), controller)
 */
const logActivity = (action, resource) => {
    return async (req, res, next) => {
        // 保存原始的 res.json 方法
        const originalJson = res.json.bind(res);

        // 重写 res.json 方法以在响应后记录日志
        res.json = function (data) {
            // 先发送响应
            originalJson(data);

            // 异步记录日志（不阻塞响应）
            setImmediate(async () => {
                try {
                    const user = req.user || req.admin;
                    const status = data.code === 0 ? 'success' : 'failed';
                    const error_message = status === 'failed' ? data.message : null;

                    // 构建描述
                    let description = `${getActionText(action)}${getResourceText(resource)}`;

                    // 从请求体、参数或响应中获取资源ID
                    let resource_id = req.params.id || req.body.id || req.query.id;
                    if (!resource_id && data.data && data.data.id) {
                        resource_id = String(data.data.id);
                    }

                    // 记录日志
                    await ActivityLog.create({
                        user_id: user ? user.id : null,
                        user_type: user ? (user.role === 'admin' ? 'admin' : 'user') : 'guest',
                        username: user ? (user.nickname || user.username || user.phone) : '未知用户',
                        action,
                        resource,
                        resource_id,
                        description,
                        details: {
                            method: req.method,
                            path: req.originalUrl,
                            body: sanitizeRequestBody(req.body),
                            params: req.params,
                            query: req.query,
                            response_code: data.code
                        },
                        ip_address: getClientIP(req),
                        user_agent: req.headers['user-agent'],
                        platform: 'web',
                        status,
                        error_message
                    });
                } catch (error) {
                    console.error('记录活动日志失败:', error);
                }
            });
        };

        next();
    };
};

/**
 * 简化的日志记录函数（用于小程序端和其他需要手动记录的场景）
 */
const logSimple = async (data) => {
    try {
        await ActivityLog.create({
            user_id: data.user_id || null,
            user_type: data.user_type || 'guest',
            username: data.username || '未知用户',
            action: data.action,
            resource: data.resource,
            resource_id: data.resource_id || null,
            description: data.description || `${getActionText(data.action)}${getResourceText(data.resource)}`,
            details: data.details || null,
            ip_address: data.ip_address || null,
            user_agent: data.user_agent || null,
            platform: data.platform || 'miniprogram',
            status: data.status || 'success',
            error_message: data.error_message || null
        });
    } catch (error) {
        console.error('记录活动日志失败:', error);
    }
};

/**
 * 辅助函数：获取客户端真实IP
 */
function getClientIP(req) {
    return req.headers['x-forwarded-for']?.split(',')[0] ||
           req.headers['x-real-ip'] ||
           req.connection?.remoteAddress ||
           req.socket?.remoteAddress ||
           req.connection?.socket?.remoteAddress ||
           null;
}

/**
 * 辅助函数：清理敏感信息
 */
function sanitizeRequestBody(body) {
    if (!body) return null;

    const sanitized = { ...body };
    const sensitiveFields = ['password', 'token', 'secret', 'api_key', 'private_key'];

    sensitiveFields.forEach(field => {
        if (sanitized[field]) {
            sanitized[field] = '***';
        }
    });

    return sanitized;
}

/**
 * 辅助函数：获取操作文本
 */
function getActionText(action) {
    const actionMap = {
        create: '创建',
        update: '更新',
        delete: '删除',
        view: '查看',
        login: '登录',
        logout: '登出',
        switch: '切换',
        upload: '上传',
        download: '下载',
        export: '导出',
        import: '导入',
        purchase: '购买',
        refund: '退款',
        withdraw: '提现',
        approve: '审核通过',
        reject: '审核拒绝'
    };
    return actionMap[action] || action;
}

/**
 * 辅助函数：获取资源文本
 */
function getResourceText(resource) {
    const resourceMap = {
        theme: '主题',
        banner: '轮播图',
        product: '商品',
        category: '分类',
        order: '订单',
        user: '用户',
        admin: '管理员',
        quick_entry: '快捷入口',
        config: '配置',
        commission: '佣金',
        withdrawal: '提现',
        activity_log: '活动日志'
    };
    return resourceMap[resource] || resource;
}

module.exports = {
    logActivity,
    logSimple
};
