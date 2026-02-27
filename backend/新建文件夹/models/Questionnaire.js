const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Questionnaire = sequelize.define('Questionnaire', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    template_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '问卷模板ID'
    },
    creator_user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '发起人用户ID'
    },
    status: {
        type: DataTypes.STRING(20),
        defaultValue: 'active',
        comment: '状态：active/closed'
    },
    content: {
        type: DataTypes.JSON,
        allowNull: false,
        comment: '问卷内容快照'
    }
}, {
    tableName: 'questionnaires',
    timestamps: true
});

module.exports = Questionnaire;
