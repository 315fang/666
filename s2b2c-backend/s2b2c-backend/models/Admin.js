const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const crypto = require('crypto');

const Admin = sequelize.define('Admin', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    username: {
        type: DataTypes.STRING(50),
        unique: true,
        allowNull: false,
        comment: '登录账号'
    },
    password_hash: {
        type: DataTypes.STRING(128),
        allowNull: false,
        comment: '密码哈希'
    },
    salt: {
        type: DataTypes.STRING(32),
        allowNull: false,
        comment: '密码盐值'
    },
    name: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '管理员姓名'
    },
    role: {
        type: DataTypes.STRING(30),
        defaultValue: 'operator',
        comment: '角色: super_admin/admin/operator/finance/customer_service'
    },
    permissions: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'JSON格式权限列表',
        get() {
            const rawValue = this.getDataValue('permissions');
            return rawValue ? JSON.parse(rawValue) : [];
        },
        set(value) {
            this.setDataValue('permissions', JSON.stringify(value));
        }
    },
    phone: {
        type: DataTypes.STRING(20),
        allowNull: true,
        comment: '手机号'
    },
    email: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: '邮箱'
    },
    last_login_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '最后登录时间'
    },
    last_login_ip: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '最后登录IP'
    },
    status: {
        type: DataTypes.TINYINT,
        defaultValue: 1,
        comment: '状态: 1-启用, 0-禁用'
    }
}, {
    tableName: 'admins',
    timestamps: true
});

// 密码加密方法
Admin.hashPassword = function (password, salt) {
    return crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
};

// 生成盐值
Admin.generateSalt = function () {
    return crypto.randomBytes(16).toString('hex');
};

// 验证密码
Admin.prototype.validatePassword = function (password) {
    const hash = Admin.hashPassword(password, this.salt);
    return this.password_hash === hash;
};

// 设置密码
Admin.prototype.setPassword = function (password) {
    this.salt = Admin.generateSalt();
    this.password_hash = Admin.hashPassword(password, this.salt);
};

module.exports = Admin;
