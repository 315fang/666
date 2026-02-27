/**
 * 种子脚本：创建默认邀请问卷模板
 * 运行方式: node seeds/seed_questionnaire.js
 */
const { sequelize } = require('../config/database');
const Questionnaire = require('../models/Questionnaire');

const defaultFields = [
    {
        key: 'name',
        label: '姓名',
        type: 'text',
        required: true,
        placeholder: '请输入您的真实姓名'
    },
    {
        key: 'phone',
        label: '手机号',
        type: 'phone',
        required: true,
        placeholder: '请输入您的手机号码'
    },
    {
        key: 'region',
        label: '所在地区',
        type: 'region',
        required: false,
        placeholder: '请选择您的所在地区'
    },
    {
        key: 'interest',
        label: '感兴趣的产品类型',
        type: 'checkbox',
        required: false,
        options: ['护肤品', '彩妆', '保健品', '日用品', '其他'],
        placeholder: ''
    },
    {
        key: 'remark',
        label: '备注',
        type: 'textarea',
        required: false,
        placeholder: '有什么想说的？（选填）'
    }
];

async function seed() {
    try {
        await sequelize.sync();

        // 检查是否已有问卷
        const existing = await Questionnaire.findOne();
        if (existing) {
            console.log('已存在问卷模板，跳过种子。');
            process.exit(0);
        }

        await Questionnaire.create({
            title: '加入团队邀请问卷',
            description: '填写以下信息，完成后即可加入邀请人的团队，一起赚取收益！',
            fields: defaultFields,
            is_active: true,
            version: 1
        });

        console.log('✅ 默认邀请问卷已创建');
        process.exit(0);
    } catch (err) {
        console.error('❌ 创建问卷失败:', err);
        process.exit(1);
    }
}

seed();
