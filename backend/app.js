const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const { requestLogger, errorTracker } = require('./utils/logger');
const constants = require('./config/constants');

// ★ 启动安全检查：生产环境禁止使用弱默认 JWT 密钥
if (process.env.NODE_ENV === 'production') {
    const weakSecrets = ['INSECURE-DEFAULT-user-secret-key', 'INSECURE-DEFAULT-admin-secret-key'];
    if (weakSecrets.includes(constants.SECURITY.JWT_SECRET)) {
        console.error('❌ 致命错误：JWT_SECRET 使用了不安全的默认值，生产环境必须在 .env 中设置强密钥');
        process.exit(1);
    }
    if (weakSecrets.includes(constants.SECURITY.ADMIN_JWT_SECRET)) {
        console.error('❌ 致命错误：ADMIN_JWT_SECRET 使用了不安全的默认值，生产环境必须在 .env 中设置强密钥');
        process.exit(1);
    }
}

// 导入路由
const authRoutes = require('./routes/auth');
const aiRoutes = require('./routes/ai');
const aiV2Routes = require('./routes/ai-v2');  // ★ 新版AI路由
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
const questionnaireRoutes = require('./routes/questionnaire');
const adminQuestionnaireRoutes = require('./routes/admin/questionnaire');
// 新增：积分体系 + 拼团系统 + 活动系统
const pointRoutes = require('./routes/points');
const groupRoutes = require('./routes/group');
const activityRoutes = require('./routes/activity');
// Phase 2: 抽奖 + 优惠券
const lotteryRoutes = require('./routes/lottery');
const couponRoutes = require('./routes/coupon');
// Phase 3: 砍价
const slashRoutes = require('./routes/slash');
// Phase 4: 自提核销 + 服务站点
const pickupRoutes = require('./routes/pickup');
const stationRoutes = require('./routes/station');
// Phase 5: 物流查询
const logisticsRoutes = require('./routes/logistics');
// Phase 5: 热度管理
const heatRoutes = require('./routes/heat');

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

// 静态文件 - 管理后台 (Vite 构建版)
app.use('/admin', express.static(path.join(__dirname, 'admin-ui/dist')));

// SPA 兜底 - 管理后台所有非 API、非静态资源路由都返回 index.html
app.get('/admin/*', (req, res, next) => {
    // 跳过 API 请求
    if (req.path.startsWith('/admin/api')) return next();
    // 跳过有扩展名的静态资源请求（.js, .css, .png 等）
    if (path.extname(req.path)) return next();
    res.sendFile(path.join(__dirname, 'admin-ui/dist/index.html'));
});

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
app.use('/api/ai', aiRoutes);                    // 旧版AI接口（保持兼容）
app.use('/api/v2/ai', aiV2Routes);               // ★ 新版AI接口（推荐）
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
app.use('/api', questionnaireRoutes);
app.use('/api/points', pointRoutes);      // 积分体系
app.use('/api/group', groupRoutes);       // 拼团系统
app.use('/api/activity', activityRoutes); // 活动系统（气泡通告等）
app.use('/api/lottery', lotteryRoutes);   // Phase 2: 抽奖系统
app.use('/api/coupons', couponRoutes);    // Phase 2: 优惠券系统
app.use('/api/slash', slashRoutes);       // Phase 3: 砍价系统
app.use('/api/pickup', pickupRoutes);     // Phase 4: 自提核销
app.use('/api/stations', stationRoutes);  // Phase 4: 服务站点地图
app.use('/api/logistics', logisticsRoutes); // Phase 5: 物流查询
app.use('/api/products/hot', heatRoutes);   // Phase 5: 热门商品列表
// 后台热度管理（在 /admin/api 后挂载）
app.use('/admin/api/heat', heatRoutes);     // Phase 5: 商品热度管理

// 后台管理API (使用 /admin/api 避免与静态文件冲突)
app.use('/admin/api', adminRoutes);
app.use('/admin/api/themes', adminThemeRoutes);
app.use('/admin/api/logs', adminLogRoutes);
app.use('/admin/api', adminQuestionnaireRoutes);

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
