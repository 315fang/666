const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { errorHandler, notFound } = require('./middleware/errorHandler');

// 导入路由
const authRoutes = require('./routes/auth');
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
const adminRoutes = require('./routes/admin');

const app = express();

// 中间件
const corsOptions = {
    origin: process.env.CORS_ORIGINS
        ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
        : (process.env.NODE_ENV === 'production' ? [] : '*'),
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
};
app.use(cors(corsOptions)); // 跨域支持
app.use(bodyParser.json()); // 解析JSON请求体
app.use(bodyParser.urlencoded({ extended: true }));

// 请求日志（开发环境）
if (process.env.NODE_ENV === 'development') {
    app.use((req, res, next) => {
        console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
        next();
    });
}

// API路由
app.use('/api', authRoutes);
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

// 后台管理API
app.use('/admin', adminRoutes);

// 健康检查
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404处理
app.use(notFound);

// 错误处理
app.use(errorHandler);

module.exports = app;
