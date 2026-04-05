const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * 开屏动画配置模型
 * 全局只有一条配置记录（id=1）
 */
const SplashScreen = sequelize.define('SplashScreen', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: '是否启用开屏动画'
    },
    show_mode: {
        type: DataTypes.ENUM('always', 'daily', 'once', 'disabled'),
        defaultValue: 'always',
        comment: '展示模式: always=每次启动, daily=每天一次, once=仅一次, disabled=关闭'
    },
    image_url: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '背景图片URL，为空时用渐变动画'
    },
    title: {
        type: DataTypes.STRING(100),
        defaultValue: '盒美美',
        comment: '主品牌名称（Reveal层大字）'
    },
    subtitle: {
        type: DataTypes.STRING(200),
        defaultValue: '做大学生的第一款护肤品',
        comment: '副标题'
    },
    credit: {
        type: DataTypes.STRING(200),
        defaultValue: '问兰药业 × 镜像案例库 · 联合出品',
        comment: 'Reveal层 credit 文字'
    },
    en_title: {
        type: DataTypes.STRING(100),
        defaultValue: 'HEMEIMEI',
        comment: 'Reveal层英文大字'
    },
    bg_color_start: {
        type: DataTypes.STRING(20),
        defaultValue: '#26064F',
        comment: '背景渐变起始色（深紫）'
    },
    bg_color_end: {
        type: DataTypes.STRING(20),
        defaultValue: '#F7F4EF',
        comment: '背景渐变结束色（米白）'
    },
    duration: {
        type: DataTypes.INTEGER,
        defaultValue: 5000,
        comment: '自动跳过毫秒数（0=不自动跳过）'
    },
    skip_text: {
        type: DataTypes.STRING(20),
        defaultValue: '跳过',
        comment: '跳过按钮文字'
    },
    layers: {
        type: DataTypes.JSON,
        defaultValue: [
            {
                type: 'single',
                title: '问兰药业',
                tag: '苏州河海大学企业',
                lines: ['50年药研传承', '美容院原料供应商'],
                en: 'WENLAN PHARMACEUTICAL'
            },
            {
                type: 'single',
                title: '镜像案例库',
                tag: '大学生成长平台',
                lines: ['社会第一课', '学校最后一堂课'],
                en: 'JINGXIANG CASE LIBRARY'
            }
        ],
        comment: '前两层（single类型）内容，JSON数组'
    }
}, {
    tableName: 'splash_screens',
    timestamps: true,
    underscored: true
});

module.exports = SplashScreen;
