const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const User = sequelize.define('User', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    openid: {
        type: DataTypes.STRING(100),
        unique: true,
        allowNull: false,
        comment: '微信openid'
    },
    member_no: {
        type: DataTypes.STRING(20),
        unique: true,
        allowNull: true,
        comment: '会员编号，格式 M+年月+流水号，如 M202600001，注册时自动生成'
    },
    nickname: {
        type: DataTypes.STRING(100),
        comment: '昵称'
    },
    avatar_url: {
        type: DataTypes.STRING(255),
        field: 'avatar_url',
        comment: '头像URL'
    },
    phone: {
        type: DataTypes.STRING(20),
        allowNull: true,
        comment: '手机号码'
    },
    role_level: {
        type: DataTypes.TINYINT,
        defaultValue: 0,
        comment: '角色等级: 0-普通用户, 1-C1初级代理, 2-C2高级代理, 3-B1推广合伙人(¥3000), 4-B2运营合伙人(¥30000), 5-B3区域合伙人(¥198000), 6-小n(N路径代理¥3000), 7-大N(N路径独立代理¥30000)'
    },
    purchase_level_code: {
        type: DataTypes.STRING(32),
        allowNull: true,
        comment: '拿货等级编码（仅影响价格）'
    },
    agent_level: {
        type: DataTypes.TINYINT,
        defaultValue: 1,
        allowNull: true,
        comment: '标准路径子等级（role_level 3~5 时有效）: 升级时由 upgradeController 写入 target_level-2，仅用于部分佣金分层计算'
    },
    parent_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '上级用户ID'
    },
    parent_openid: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: '上级openid（冗余字段）'
    },
    agent_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '所属代理商ID'
    },
    stock_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '云仓库存（仅代理商有效）'
    },
    invite_code: {
        type: DataTypes.STRING(6),
        unique: true,
        allowNull: true,
        comment: '6位数字唯一邀请码'
    },
    balance: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0.00,
        comment: '可提现余额'
    },
    referee_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '直推人数'
    },
    order_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '累计订单数'
    },
    total_sales: {
        type: DataTypes.DECIMAL(12, 2),
        defaultValue: 0.00,
        comment: '累计销售额'
    },
    last_login: {
        type: DataTypes.DATE,
        comment: '最后登录时间'
    },
    joined_team_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '加入团队时间（绑定上级时设置）'
    },
    // ★ 用户偏好设置（风格、品类等）
    preferences: {
        type: DataTypes.JSON,
        defaultValue: null,
        comment: '用户偏好设置 JSON { style, categories }'
    },
    // ★ 欠款金额：退款时佣金追回余额不足产生的待追回金额
    debt_amount: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0.00,
        comment: '欠款金额（佣金追回余额不足时的待还金额）'
    },
    // ★ 成长值：消费打款累计（只增不减），用于计算会员折扣
    growth_value: {
        type: DataTypes.DECIMAL(12, 2),
        defaultValue: 0.00,
        comment: '消费成长值（累计消费金额，不减不清零）'
    },
    // ★ 折扣比例：由成长值阶梯自动计算（1.00=无折扣，0.85=8.5折）
    discount_rate: {
        type: DataTypes.DECIMAL(4, 2),
        defaultValue: 1.00,
        comment: '当前会员折扣比例，由成长值阶梯自动更新'
    },
    status: {
        type: DataTypes.TINYINT,
        defaultValue: 1,
        comment: '账号状态: 1-正常 0-封禁'
    },
    remark: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '内部备注（管理员可编辑）'
    },
    tags: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: '内部标签 JSON数组字符串，如 ["VIP","高活跃"]'
    },
    participate_distribution: {
        type: DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 0,
        comment: '是否参与分销(C端商务中心): 0-否 1-是'
    },
    // ── N 路径专用字段（role_level 6/7 时生效）──
    n_leader_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'N路径上级大N的user_id（role_level=6时指向大N，role_level=7时为null）'
    }
}, {
    tableName: 'users',
    timestamps: true
});

module.exports = User;
