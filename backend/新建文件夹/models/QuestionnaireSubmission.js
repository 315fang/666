const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const QuestionnaireSubmission = sequelize.define('QuestionnaireSubmission', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    questionnaire_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '关联问卷模板ID'
    },
    questionnaire_version: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '提交时的问卷版本号（便于历史追溯）'
    },
    inviter_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '问卷发起者/分享者的 user_id'
    },
    submitter_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '填写者的 user_id（可为空，未登录时先记录）'
    },
    submitter_openid: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: '填写者的 openid（冗余，方便查询）'
    },
    answers: {
        type: DataTypes.TEXT,
        allowNull: false,
        defaultValue: '{}',
        comment: '填写的答案 JSON',
        get() {
            const raw = this.getDataValue('answers');
            try {
                return JSON.parse(raw || '{}');
            } catch {
                return {};
            }
        },
        set(val) {
            this.setDataValue('answers', typeof val === 'string' ? val : JSON.stringify(val));
        }
    },
    status: {
        type: DataTypes.ENUM('completed', 'pending'),
        defaultValue: 'completed',
        comment: '提交状态'
    },
    bound_team: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: '是否已成功绑定团队'
    }
}, {
    tableName: 'questionnaire_submissions',
    timestamps: true
});

module.exports = QuestionnaireSubmission;
