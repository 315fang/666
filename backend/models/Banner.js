const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Banner = sequelize.define('Banner', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    title: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: '标题/备注'
    },
    subtitle: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: '副标题/描述文字'
    },
    kicker: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: '顶部小标（如 NEW / 限时活动）'
    },
    // ── 商品关联 ─────────────────────────────────────────────────────────────
    // 设置 product_id 后，后台自动带入 product.images[0] 作为封面图，
    // 并将 link_type 固定为 'product'、link_value 固定为 product_id。
    // 管理员仍可手动填写 image_url 来覆盖商品图。
    product_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '关联商品ID（设置后自动带入商品首图和跳转目标）'
    },
    image_url: {
        type: DataTypes.STRING(500),
        allowNull: true,        // 改为 allowNull:true，商品关联模式下可不填（取商品首图）
        comment: '图片URL（优先于商品首图）'
    },
    link_type: {
        type: DataTypes.STRING(20),
        defaultValue: 'none',
        comment: '链接类型: none/product/activity/group_buy/slash/lottery/page/url'
    },
    link_value: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: '链接值: 商品ID/页面路径/外部URL'
    },
    position: {
        type: DataTypes.STRING(50),
        defaultValue: 'home',
        comment: '展示位置: home/category/activity'
    },
    sort_order: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '排序权重'
    },
    start_time: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '开始展示时间'
    },
    end_time: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '结束展示时间'
    },
    status: {
        type: DataTypes.TINYINT,
        defaultValue: 1,
        comment: '状态: 1-启用, 0-禁用'
    }
}, {
    tableName: 'banners',
    timestamps: true
});

module.exports = Banner;

// 关联关系（避免循环依赖，在 models/index.js 中统一注册）
// Banner.belongsTo(Product, { foreignKey: 'product_id', as: 'product' })


