const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const { requestLogger, errorTracker } = require('./utils/logger');
const constants = require('./config/constants');

// 导入路由
const authRoutes = require('./routes/auth');
const aiRoutes = require('./routes/ai');
const productRoutes = require('./routes/products');
const orderRoutes = require('./routes/orders');
const addressRoutes = require('./routes/addresses');
const distributionRoutes = require('./routes/distribution');
const partnerRoutes = require('./routes/partner');
const userRoutes = require('./routes/users');
const categoryRoutes = require('./routes/categories');
const cartRoutes = require('./routes/cart');
const materialRoutes = require('./routes/materials');
const contentRoutes = require('./routes/content');
const walletRoutes = require('./routes/wallet');
const refundRoutes = require('./routes/refunds');
const dealerRoutes = require('./routes/dealer');
const agentRoutes = require('./routes/agent');
const commissionRoutes = require('./routes/commissions');
const adminRoutes = require('./routes/admin');
const configRoutes = require('./routes/config');
const adminThemeRoutes = require('./routes/admin/themes');
const adminLogRoutes = require('./routes/admin/logs');

const app = express();

// 中间件
// CORS 配置 - 生产环境限制来源
const corsOptions = {
    origin: process.env.CORS_ORIGINS
        ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
        : '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-openid'],
    // 只有在配置了具体origin时才启用credentials
    credentials: process.env.CORS_ORIGINS ? true : false
};
app.use(cors(corsOptions));
app.use(bodyParser.json({ limit: constants.SECURITY.BODY_SIZE_LIMIT }));
app.use(bodyParser.urlencoded({ extended: true }));

// Request logging middleware
if (process.env.NODE_ENV !== 'test') {
    app.use(requestLogger);
}

// ★ 安全头中间件（防 XSS、点击劫持等）
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (process.env.NODE_ENV === 'production') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
});

// 接口请求频率限制 - 防止恶意刷接口
const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: constants.SECURITY.API_RATE_LIMIT,
    message: { code: -1, message: '请求过于频繁，请稍后再试' },
    standardHeaders: true,
    legacyHeaders: false
});
app.use('/api', apiLimiter);

// 登录接口更严格的频率限制
const loginLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: constants.SECURITY.LOGIN_RATE_LIMIT,
    message: { code: -1, message: '登录尝试过于频繁' }
});
app.use('/api/login', loginLimiter);

// CSP 中间件 - 仅管理后台页面需要宽松策略
app.use((req, res, next) => {
    if (req.path.startsWith('/admin') && !req.path.startsWith('/admin/api')) {
        res.setHeader("Content-Security-Policy",
            "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data: https:;");
    }
    next();
});

// 静态文件 - 管理后台 (Vite 构建版)
app.use('/admin', express.static(path.join(__dirname, 'admin-ui/dist')));

// ★ 静态文件 - 本地上传目录（图片等资源）
// 添加缓存控制和安全headers
app.use('/uploads', (req, res, next) => {
    // 设置缓存策略：公开缓存30天
    res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
    // 防止MIME类型嗅探
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
}, express.static(path.join(__dirname, 'uploads')));

// 根目录重定向到管理后台
app.get('/', (req, res) => {
    res.redirect('/admin/');
});

// 请求日志（开发环境）
if (process.env.NODE_ENV === 'development') {
    app.use((req, res, next) => {
        console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
        next();
    });
}

// API路由
app.use('/api', authRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api', productRoutes);
app.use('/api', orderRoutes);
app.use('/api', addressRoutes);
app.use('/api', distributionRoutes);
app.use('/api', partnerRoutes);
app.use('/api', userRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/materials', materialRoutes);
app.use('/api/content', contentRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/refunds', refundRoutes);
app.use('/api/dealer', dealerRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/commissions', commissionRoutes);
app.use('/api', configRoutes);

// 后台管理API (使用 /admin/api 避免与静态文件冲突)
app.use('/admin/api', adminRoutes);
app.use('/admin/api/themes', adminThemeRoutes);
app.use('/admin/api/logs', adminLogRoutes);

// ★ 调试接口 - 生产环境自动关闭，防止信息泄露
if (constants.DEBUG.ENABLE_DEBUG_ROUTES) {
    const debugRoutes = require('./routes/debug');
    app.use('/api/debug', debugRoutes);
    console.log('⚠️  调试路由已启用 (/api/debug)');
}

// 健康检查（不暴露内部信息）
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404处理
app.use(notFound);

// Error tracking middleware
app.use(errorTracker);

// 错误处理
app.use(errorHandler);

module.exports = app;
