const { sequelize } = require('../config/database');
const { ContentBoard, ContentBoardItem, ContentBoardProduct } = require('../models');
const { migrateLegacyDataToBoards } = require('../services/BoardService');

async function run() {
    try {
        console.log('\n🚀 开始迁移：榜单化图文管理\n');
        await sequelize.authenticate();
        console.log('✅ 数据库连接成功');

        await ContentBoard.sync();
        await ContentBoardItem.sync();
        await ContentBoardProduct.sync();
        console.log('✅ content_boards / content_board_items / content_board_products 已就绪');

        await migrateLegacyDataToBoards();
        console.log('✅ 旧配置迁移完成（activity_links_config / feature_cards / banners）');

        console.log('\n🎉 榜单迁移完成\n');
    } catch (error) {
        console.error('\n❌ 榜单迁移失败:', error);
        process.exitCode = 1;
    } finally {
        await sequelize.close();
    }
}

run();
