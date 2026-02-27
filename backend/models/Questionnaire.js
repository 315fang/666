const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Questionnaire = sequelize.define('Questionnaire', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    title: {
        type: DataTypes.STRING(100),
        allowNull: false,
        defaultValue: '邀请问卷',
        comment: '问卷标题'
    },
    description: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '问卷描述'
    },
    fields: {
        type: DataTypes.TEXT,
        allowNull: false,
        defaultValue: '[]',
        comment: '问卷字段定义 JSON 数组',
        get() {
            const raw = this.getDataValue('fields');
            try {
                return JSON.parse(raw || '[]');
            } catch {
                return [];
            }
        },
        set(val) {
            this.setDataValue('fields', typeof val === 'string' ? val : JSON.stringify(val));
        }
    },
    is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: '是否启用（只有一个可以启用）'
    },
    version: {
        type: DataTypes.INTEGER,
        defaultValue: 1,
        comment: '版本号，每次编辑+1'
    }
}, {
    tableName: 'questionnaires',
    timestamps: true
});

module.exports = Questionnaire;
