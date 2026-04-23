const { sequelize } = require('../config/database');
const { Product, SKU } = require('../models');
const { pickFallbackDefaultSku, normalizeSkuId } = require('../utils/productDefaultSku');

async function runBackfill() {
    console.log('\n🚀 backfill products.default_sku_id\n');
    try {
        await sequelize.authenticate();
        const products = await Product.findAll({
            where: { default_sku_id: null },
            include: [{
                model: SKU,
                as: 'skus',
                required: false,
                where: { status: 1 }
            }],
            order: [['id', 'ASC']]
        });

        let updated = 0;
        let skipped = 0;

        for (const product of products) {
            const plain = product.toJSON();
            const skus = Array.isArray(plain.skus) ? plain.skus : [];
            const selectedSku = skus.length === 1
                ? skus[0]
                : pickFallbackDefaultSku(plain, skus);
            const defaultSkuId = normalizeSkuId(selectedSku && selectedSku.id);
            if (!defaultSkuId) {
                skipped += 1;
                continue;
            }
            await product.update({ default_sku_id: defaultSkuId });
            updated += 1;
        }

        console.log(`  ✅ 已回填 ${updated} 个商品默认 SKU`);
        console.log(`  ⏭️  跳过 ${skipped} 个商品（无可用 SKU）`);
        console.log('\n🎉 backfill 完成\n');
    } catch (error) {
        console.error('❌ backfill 失败:', error.message);
        throw error;
    } finally {
        await sequelize.close();
    }
}

if (require.main === module) {
    runBackfill()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
}

module.exports = { runBackfill };
