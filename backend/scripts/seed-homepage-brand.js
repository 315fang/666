// 种入首页品牌气泡配置项（如已存在则跳过）
const { AppConfig } = require('../models');

async function run() {
    const seeds = [
        {
            config_key: 'nav_brand_title',
            config_value: '问兰镜像',
            config_type: 'string',
            category: 'homepage',
            is_public: true,
            status: 1,
            description: '导航栏品牌名称（气泡LOGO旁的主标题）'
        },
        {
            config_key: 'nav_brand_sub',
            config_value: '品牌甄选',
            config_type: 'string',
            category: 'homepage',
            is_public: true,
            status: 1,
            description: '导航栏品牌副标题（主标题下方小字）'
        }
    ];

    for (const seed of seeds) {
        const [, created] = await AppConfig.findOrCreate({
            where: { config_key: seed.config_key },
            defaults: seed
        });
        console.log(created ? `✅ 已创建: ${seed.config_key}` : `⏭️  已存在: ${seed.config_key}`);
    }

    console.log('\n配置完成，在后台「系统配置」页面可修改这两个值。');
    process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
