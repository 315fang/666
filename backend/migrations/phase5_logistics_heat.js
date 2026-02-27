// backend/migrations/phase5_logistics_heat.js
/**
 * Phase 5 数据库迁移（幂等）
 * 修改：orders 表新增 logistics_company 列
 * 修改：products 表新增 view_count/purchase_count/heat_score/manual_weight/heat_updated_at 列
 */
const { sequelize } = require('../config/database');
const { DataTypes } = require('sequelize');

async function runMigration() {
    const qi = sequelize.getQueryInterface();
    console.log('\n🚀 开始 Phase 5 数据库迁移...\n');

    try {
        await sequelize.authenticate();
        console.log('✅ 数据库连接成功');

        // ── 1. orders.logistics_company ──
        const orderCols = await qi.describeTable('orders');
        if (!orderCols['logistics_company']) {
            await qi.addColumn('orders', 'logistics_company', {
                type: DataTypes.STRING(20),
                allowNull: true,
                comment: '物流公司代码（SF/YTO/ZTO/YD/EMS等）',
                after: 'tracking_no'
            });
            console.log('✅ orders.logistics_company 列添加成功');
        } else {
            console.log('⏭️  orders.logistics_company 已存在，跳过');
        }

        // ── 2. products 热度字段 ──
        const productCols = await qi.describeTable('products');
        const heatCols = [
            { name: 'view_count', col: { type: DataTypes.INTEGER, defaultValue: 0, comment: '商品展示页访问次数' } },
            { name: 'purchase_count', col: { type: DataTypes.INTEGER, defaultValue: 0, comment: '近30天购买单数' } },
            { name: 'heat_score', col: { type: DataTypes.INTEGER, defaultValue: 0, comment: '热度分值' } },
            { name: 'manual_weight', col: { type: DataTypes.TINYINT, defaultValue: 0, comment: '后台手动权重(0-100)' } },
            { name: 'heat_updated_at', col: { type: DataTypes.DATE, allowNull: true, comment: '热度刷新时间' } }
        ];

        for (const { name, col } of heatCols) {
            if (!productCols[name]) {
                await qi.addColumn('products', name, col);
                console.log(`✅ products.${name} 列添加成功`);
            } else {
                console.log(`⏭️  products.${name} 已存在，跳过`);
            }
        }

        // ── 3. 创建物流缓存目录 ──
        const fs = require('fs');
        const path = require('path');
        const cacheDir = path.join(__dirname, '../cache/logistics');
        if (!fs.existsSync(cacheDir)) {
            fs.mkdirSync(cacheDir, { recursive: true });
            console.log('✅ 物流缓存目录创建成功:', cacheDir);
        } else {
            console.log('⏭️  物流缓存目录已存在，跳过');
        }

        console.log('\n🎉 Phase 5 数据库迁移完成！\n');
        console.log('📝 配置提醒：');
        console.log('   - 在 .env 中设置 LOGISTICS_API_KEY=<您的阿里云 AppCode>');
        console.log('   - 阿里云市场物流查询 API：https://market.aliyun.com/products/56928004');
        console.log('   - 未配置时自动使用 Mock 数据（开发模式）');
    } catch (err) {
        console.error('\n❌ 迁移失败:', err.message);
        process.exit(1);
    } finally {
        await sequelize.close();
    }
}

runMigration();
