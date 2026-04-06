const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const crypto = require('crypto');

const PortalAccount = sequelize.define('PortalAccount', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true,
        comment: '关联用户ID'
    },
    login_id: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
        comment: '登录账号（member_no）'
    },
    password_hash: {
        type: DataTypes.STRING(128),
        allowNull: false,
        comment: '密码哈希'
    },
    salt: {
        type: DataTypes.STRING(32),
        allowNull: false,
        comment: '密码盐'
    },
    must_change_password: {
        type: DataTypes.TINYINT,
        defaultValue: 1,
        comment: '是否首次登录强制改密: 1-是,0-否'
    },
    status: {
        type: DataTypes.TINYINT,
        defaultValue: 1,
        comment: '状态: 1-正常,0-禁用'
    },
    last_login_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
    last_login_ip: {
        type: DataTypes.STRING(64),
        allowNull: true
    },
    last_portal_init_issue_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '小程序申领门户初始密码时间（24h限流，需执行 scripts/add-portal-last-init-issue-at.js）'
    }
}, {
    tableName: 'portal_accounts',
    timestamps: true
});

PortalAccount.hashPassword = function (password, salt) {
    return crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
};

PortalAccount.generateSalt = function () {
    return crypto.randomBytes(16).toString('hex');
};

PortalAccount.prototype.setPassword = function (password) {
    this.salt = PortalAccount.generateSalt();
    this.password_hash = PortalAccount.hashPassword(password, this.salt);
};

PortalAccount.prototype.validatePassword = function (password) {
    const hash = PortalAccount.hashPassword(password, this.salt);
    return this.password_hash === hash;
};

module.exports = PortalAccount;
