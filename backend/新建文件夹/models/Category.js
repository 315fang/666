const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Category = sequelize.define('Category', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '类目名称'
    },
    parent_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null,
        comment: '父级类目ID，null为顶级类目'
    },
    icon: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: '类目图标URL'
    },
    sort_order: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '排序权重，数字越大越靠前'
    },
    status: {
        type: DataTypes.TINYINT,
        defaultValue: 1,
        comment: '状态: 1-启用, 0-禁用'
    }
}, {
    tableName: 'categories',
    timestamps: true
});

// 自关联：父子类目
Category.belongsTo(Category, { foreignKey: 'parent_id', as: 'parent' });
Category.hasMany(Category, { foreignKey: 'parent_id', as: 'children' });

module.exports = Category;
