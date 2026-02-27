const express = require('express');
const router = express.Router();
const { sequelize, User } = require('../models');
const axios = require('axios');
const { authenticate } = require('../middleware/auth');

/**
 * 深度诊断接口 - 检查后端健康状况
 * 访问路径: /api/debug/diagnostic
 * ★ 已加管理员鉴权：仅限登录用户且 role_level >= 3（管理员）可访问
 */
router.get('/diagnostic', authenticate, async (req, res) => {
    // 仅允许管理员访问（role_level >= 3 或 admin 标记）
    if (!req.user || req.user.role_level < 3) {
        return res.status(403).json({ code: -1, message: '无权访问' });
    }

    const report = {
        timestamp: new Date().toISOString(),
        env: {
            node_env: process.env.NODE_ENV,
            has_appid: !!process.env.WECHAT_APPID,
            has_secret: !!process.env.WECHAT_SECRET && process.env.WECHAT_SECRET !== '请填入你的AppSecret',
            db_host: process.env.DB_HOST,
            db_name: process.env.DB_NAME,
            db_user: process.env.DB_USER
        },
        checks: {}
    };

    // 1. 检查数据库连接
    try {
        await sequelize.authenticate();
        report.checks.database_connection = "OK";

        // 尝试查询用户表计数
        const userCount = await User.count();
        report.checks.user_table_query = `OK (Count: ${userCount})`;
    } catch (err) {
        report.checks.database_error = err.message;
    }

    // 2. 检查微信代码握手能力 (尝试访问微信API，查看是否能通，但不传真正code)
    try {
        const wechatTest = await axios.get('https://api.weixin.qq.com/sns/jscode2session', {
            params: {
                appid: process.env.WECHAT_APPID,
                secret: process.env.WECHAT_SECRET,
                js_code: 'DEBUG_TEST_CODE',
                grant_type: 'authorization_code'
            }
        });
        // 预期会报错 40029 (invalid code)，但只要能拿到微信返回的 JSON，说明握手通了
        report.checks.wechat_api_reachability = "OK";
        report.checks.wechat_response = wechatTest.data;
    } catch (err) {
        report.checks.wechat_network_error = err.message;
    }

    res.json(report);
});

module.exports = router;
