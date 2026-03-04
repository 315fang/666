const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * 素材分组（素材库的文件夹）
 * 通过 group_id 外键与 Material 关联
 */
const MaterialGroup = sequelize.define('MaterialGroup', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '分组名称，如"素材1组"'
    },
    description: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: '分组说明'
    },
    cover_url: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '分组封面图'
    },
    sort_order: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '排序权重，越大越靠前'
    },
    status: {
        type: DataTypes.TINYINT,
        defaultValue: 1,
        comment: '1-启用 0-禁用'
    }
}, {
    tableName: 'material_groups',
    timestamps: true
});

module.exports = MaterialGroup;
