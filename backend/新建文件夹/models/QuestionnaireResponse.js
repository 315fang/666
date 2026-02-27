const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const QuestionnaireResponse = sequelize.define('QuestionnaireResponse', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    questionnaire_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '问卷ID'
    },
    respondent_user_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '填写用户ID'
    },
    answers: {
        type: DataTypes.JSON,
        allowNull: false,
        comment: '填写答案'
    }
}, {
    tableName: 'questionnaire_responses',
    timestamps: true
});

module.exports = QuestionnaireResponse;
