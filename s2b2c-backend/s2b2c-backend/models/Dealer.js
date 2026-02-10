const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Dealer = sequelize.define('Dealer', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    user_id: {
        type: DataTypes.INTEGER,
        unique: true,
        allowNull: false,
        comment: '关联用户ID'
    },
    dealer_no: {
        type: DataTypes.STRING(50),
        unique: true,
        allowNull: false,
        comment: '经销商编号'
    },
    company_name: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: '公司名称'
    },
    license_no: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: '营业执照号'
    },
    license_image: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '营业执照图片'
    },
    contact_name: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '联系人姓名'
    },
    contact_phone: {
        type: DataTypes.STRING(20),
        allowNull: false,
        comment: '联系电话'
    },
    contact_email: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: '联系邮箱'
    },
    address: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '地址'
    },
    level: {
        type: DataTypes.TINYINT,
        defaultValue: 1,
        comment: '经销商等级: 1/2/3'
    },
    settlement_type: {
        type: DataTypes.STRING(20),
        defaultValue: 'monthly',
        comment: '结算方式: monthly/weekly/realtime'
    },
    settlement_rate: {
        type: DataTypes.DECIMAL(5, 4),
        defaultValue: 0.1000,
        comment: '分成比例'
    },
    bank_name: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: '开户银行'
    },
    bank_account: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '银行账号'
    },
    bank_holder: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '开户人姓名'
    },
    contract_start: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '合同开始日期'
    },
    contract_end: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '合同结束日期'
    },
    total_sales: {
        type: DataTypes.DECIMAL(12, 2),
        defaultValue: 0.00,
        comment: '累计销售额'
    },
    total_commission: {
        type: DataTypes.DECIMAL(12, 2),
        defaultValue: 0.00,
        comment: '累计佣金'
    },
    team_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '团队人数'
    },
    status: {
        type: DataTypes.STRING(20),
        defaultValue: 'pending',
        comment: '状态: pending/approved/rejected/suspended'
    },
    approved_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '审核通过时间'
    },
    approved_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '审核人ID'
    }
}, {
    tableName: 'dealers',
    timestamps: true
});

module.exports = Dealer;
