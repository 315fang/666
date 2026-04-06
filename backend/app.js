const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const path = require('path');
const fs = require('fs');

/** 管理端构建目录：默认 backend 上一级的 admin-ui/dist；可通过 ADMIN_UI_DIST 覆盖（绝对路径，或相对仓库根，如 admin-ui/dist） */
function resolveAdminUiDist() {
    const custom = process.env.ADMIN_UI_DIST;
    if (custom && String(custom).trim()) {
        const p = String(custom).trim();
        return path.isAbsolute(p) ? p : path.join(__dirname, '..', p);
    }
    return path.join(__dirname, '../admin-ui/dist');
}
const ADMIN_UI_DIST = resolveAdminUiDist();
if (process.env.NODE_ENV === 'production' && !fs.existsSync(path.join(ADMIN_UI_DIST, 'index.html'))) {
    console.warn(`[admin-ui] 未找到 ${path.join(ADMIN_UI_DIST, 'index.html')}，请部署完整 dist 或设置 ADMIN_UI_DIST。`);
}
const { errorHandler, notFound } = require('./middleware/errorHandler');
const { requestLogger, errorTracker } = require('./utils/logger');
const constants = require('./config/constants');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');

const SERVER_START_TIME = Date.now();
const WECHAT_PAY_NOTIFY_PATH = '/api/wechat/pay/notify';

function isWechatPayNotifyRequest(url = '') {
    return url === WECHAT_PAY_NOTIFY_PATH || url.startsWith(`${WECHAT_PAY_NOTIFY_PATH}?`);
}

// ★ 启动安全检查：生产环境禁止使用弱默认 JWT 密钥
if (process.env.NODE_ENV === 'production') {
    const weakSecrets = ['INSECURE-DEFAULT-user-secret-key', 'INSECURE-DEFAULT-admin-secret-key'];
    const portalInitPassword = process.env.PORTAL_INIT_PASSWORD;
    const corsOrigins = String(process.env.CORS_ORIGINS || '')
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);
    if (weakSecrets.includes(constants.SECURITY.JWT_SECRET)) {
        console.error('❌ 致命错误：JWT_SECRET 使用了不安全的默认值，生产环境必须在 .env 中设置强密钥');
        process.exit(1);
    }
    if (weakSecrets.includes(constants.SECURITY.ADMIN_JWT_SECRET)) {
        console.error('❌ 致命错误：ADMIN_JWT_SECRET 使用了不安全的默认值，生产环境必须在 .env 中设置强密钥');
        process.exit(1);
    }
    if (!corsOrigins.length || corsOrigins.includes('*')) {
        console.error('❌ 致命错误：生产环境必须为 CORS_ORIGINS 配置明确域名，不能使用 *');
        process.exit(1);
    }
    if (constants.DEBUG.ENABLE_DEBUG_ROUTES || constants.DEBUG.ENABLE_TEST_ROUTES) {
        console.error('❌ 致命错误：生产环境禁止开启调试路由或测试接口');
        process.exit(1);
    }
    if (!portalInitPassword || portalInitPassword === 'X123456') {
        console.error('❌ 致命错误：生产环境必须设置安全的 PORTAL_INIT_PASSWORD');
        process.exit(1);
    }
}

// 导入路由
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const orderRoutes = require('./routes/orders');
const addressRoutes = require('./routes/addresses');
const distributionRoutes = require('./routes/distribution');
const userRoutes = require('./routes/users');
const categoryRoutes = require('./routes/categories');
const cartRoutes = require('./routes/cart');
const materialRoutes = require('./routes/materials');
const contentRoutes = require('./routes/content');
const walletRoutes = require('./routes/wallet');
const refundRoutes = require('./routes/refunds');
const dealerRoutes = require('./routes/dealer');
const agentRoutes = require('./routes/agent');
const upgradeRoutes = require('./routes/upgrade');
const commissionRoutes = require('./routes/commissions');
const adminRoutes = require('./routes/admin');
const configRoutes = require('./routes/config');
const adminThemeRoutes = require('./routes/admin/themes');
const adminLogRoutes = require('./routes/admin/logs');
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
// Phase 6: 开屏动画
const splashRoutes = require('./routes/splash');
const boardRoutes = require('./routes/boards');
const pageContentRoutes = require('./routes/page-content');
const portalAuthRoutes = require('./routes/portal/auth');
const portalRoutes = require('./routes/portal');
// N 路径独立代理体系
const nSystemRoutes = require('./routes/n-system');

const app = express();

// 反代（Nginx/Caddy）会在请求头带 X-Forwarded-For；不信任时 express-rate-limit 会抛 ERR_ERL_UNEXPECTED_X_FORWARDED_FOR
// TRUST_PROXY_HOPS=0 或 false：显式关闭；未设置且 NODE_ENV=production 时默认信任 1 层反代
{
    const raw = process.env.TRUST_PROXY_HOPS;
    if (raw === '0' || raw === 'false') {
        app.set('trust proxy', false);
    } else {
        const n = Number(raw);
        if (Number.isFinite(n) && n >= 0) {
            app.set('trust proxy', n);
        } else if (process.env.NODE_ENV === 'production') {
            app.set('trust proxy', 1);
        }
    }
}

// 中间件
// CORS 配置 - 生产环境限制来源
const configuredCorsOrigins = String(process.env.CORS_ORIGINS || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
const allowAllOrigins = configuredCorsOrigins.length === 0 || (configuredCorsOrigins.length === 1 && configuredCorsOrigins[0] === '*');
const corsOptions = {
    origin: allowAllOrigins ? '*' : configuredCorsOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-openid'],
    // 只有在配置了具体origin时才启用credentials
    credentials: !allowAllOrigins
};
app.use(cors(corsOptions));

// gzip 压缩（跳过小于 1KB 的响应和图片请求）
app.use(compression({
    filter: (req, res) => {
        const type = res.getHeader('Content-Type') || '';
        if (/image\//.test(type)) return false; // 图片已经压缩过，无需重复压缩
        return compression.filter(req, res);
    },
    threshold: 1024 // 小于 1KB 不压缩
}));

app.use(bodyParser.json({
    limit: constants.SECURITY.BODY_SIZE_LIMIT,
    verify: (req, res, buf) => {
        if (isWechatPayNotifyRequest(req.originalUrl)) {
            req.rawBody = buf.toString('utf8');
        }
    }
}));
app.use(bodyParser.urlencoded({ extended: true }));

// Request logging middleware
if (process.env.NODE_ENV !== 'test') {
    app.use(requestLogger);
}

// ★ 安全头中间件（防 XSS、点击劫持、跨站等）
const helmet = require('helmet');
const xssClean = require('xss-clean');
const hpp = require('hpp'); // 防 HTTP 参数污染

// 配置 helmet，放行跨域资源（主要是图片静态资源）
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false // 若后续前端有限制，可以按需开启
}));

// 对 req.body, req.query, req.params 进行 XSS 净化
app.use(xssClean());

// 防御 HTTP 参数污染（放在 urlencoded 之后）
app.use(hpp());

// 接口请求频率限制 - 防止恶意刷接口
// 微信支付 V3 回调由签名校验保障安全，不参与全局限流，避免微信侧集中 IP 触发 429
const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: constants.SECURITY.API_RATE_LIMIT,
    message: { code: -1, message: '请求过于频繁，请稍后再试' },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => isWechatPayNotifyRequest(req.originalUrl)
});
app.use('/api', apiLimiter);

// 登录接口更严格的频率限制
const loginLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: constants.SECURITY.LOGIN_RATE_LIMIT,
    message: { code: -1, message: '登录尝试过于频繁' }
});
app.use('/api/login', loginLimiter);
app.use('/admin/api/login', loginLimiter);
app.use('/api/portal/auth/login', loginLimiter);

// 静态文件 - 管理后台 (Vite 构建版)；须与当前 index.html 为同一次 build，否则 assets 带 hash 会 404
app.use('/admin', express.static(ADMIN_UI_DIST));

// SPA 兜底 - 管理后台所有非 API、非静态资源路由都返回 index.html
app.get('/admin/*', (req, res, next) => {
    // 跳过 API 请求
    if (req.path.startsWith('/admin/api')) return next();
    // 跳过有扩展名的静态资源请求（.js, .css, .png 等）
    if (path.extname(req.path)) return next();
    res.sendFile(path.join(ADMIN_UI_DIST, 'index.html'));
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

// API 文档（/api/docs - 生产环境隐藏或见 SWAGGER_ENABLED 配置）
const swaggerEnabled = process.env.SWAGGER_ENABLED === 'true' || process.env.NODE_ENV !== 'production';
if (swaggerEnabled) {
    // Swagger JSON 端点（供自定义工具集成）
    app.get('/api/docs/swagger.json', (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.send(swaggerSpec);
    });
    // Swagger UI
    app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
        customSiteTitle: 'S2B2C API 文档',
        swaggerOptions: {
            persistAuthorization: true,   // 刺测 token 不丢失
            docExpansion: 'list',         // 默认展开所有 tag
            filter: true,                 // 支持搜索配置项
            tagsSorter: 'alpha'
        }
    }));
    console.info(`📖 Swagger API 文档地址: http://localhost:${process.env.PORT || 3001}/api/docs`);
}

// API路由
app.use('/api', authRoutes);
app.use('/api', productRoutes);
app.use('/api', orderRoutes);
app.use('/api', addressRoutes);
app.use('/api', distributionRoutes);
app.use('/api', userRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/materials', materialRoutes);
app.use('/api/content', contentRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/refunds', refundRoutes);
app.use('/api/dealer', dealerRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/upgrade', upgradeRoutes);
app.use('/api/n', nSystemRoutes);
app.use('/api/commissions', commissionRoutes);
app.use('/api', configRoutes);
app.use('/api/themes', adminThemeRoutes);      // 主题公开查询（active）+ 管理接口复用
app.use('/api/points', pointRoutes);      // 积分体系
app.use('/api/group', groupRoutes);       // 拼团系统
app.use('/api/activity', activityRoutes); // 活动系统（气泡通告等）
app.use('/api/lottery', lotteryRoutes);   // Phase 2: 抽奖系统
app.use('/api/coupons', couponRoutes);    // Phase 2: 优惠券系统
app.use('/api/slash', slashRoutes);       // Phase 3: 砍价系统
app.use('/api/pickup', pickupRoutes);     // Phase 4: 自提核销
app.use('/api/stations', stationRoutes);  // Phase 4: 服务站点地图
app.use('/api/logistics', logisticsRoutes); // Phase 5: 物流查询
app.use('/admin/api/heat', heatRoutes);     // Phase 5: 商品热度管理（仅后台）
app.use('/api/splash', splashRoutes);       // Phase 6: 开屏动画（小程序端公开接口）
app.use('/api/boards', boardRoutes);        // 榜单化图文管理（公开）
app.use('/api/page-content', pageContentRoutes); // 页面编排聚合读口
app.use('/api/portal/auth', portalAuthRoutes);
app.use('/api/portal', portalRoutes);

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

// 健康检查（增强版 — 包含版本、运行时长、内存）
app.get('/health', async (req, res) => {
    const uptime = Math.floor((Date.now() - SERVER_START_TIME) / 1000);
    const memMB = Math.round(process.memoryUsage().rss / 1024 / 1024);
    const heapUsedMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);

    // 快速检测数据库连接状态
    let dbStatus = 'ok';
    try {
        const { sequelize } = require('./config/database');
        await sequelize.authenticate();
    } catch {
        dbStatus = 'error';
    }

    res.json({
        status: dbStatus === 'ok' ? 'ok' : 'degraded',
        timestamp: new Date().toISOString(),
        uptime: `${uptime}s`,
        version: process.env.npm_package_version || '1.0.0',
        node: process.version,
        memory: { rss: `${memMB}MB`, heapUsed: `${heapUsedMB}MB` },
        services: { database: dbStatus }
    });
});

// 404处理
app.use(notFound);

// Error tracking middleware
app.use(errorTracker);

// 错误处理
app.use(errorHandler);

module.exports = app;
