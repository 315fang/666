const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const QuestionnaireTemplate = sequelize.define('QuestionnaireTemplate', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    title: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '问卷标题'
    },
    description: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '问卷描述'
    },
    fields: {
        type: DataTypes.JSON,
        allowNull: false,
        comment: '问卷字段配置'
    },
    is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: '是否启用'
    },
    updated_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '后台更新管理员ID'
    }
}, {
    tableName: 'questionnaire_templates',
    timestamps: true
});

module.exports = QuestionnaireTemplate;
