// backend/models/ServiceStation.js
/**
 * 服务站点模型
 *
 * 机制：
 * - 地区成交一单，对应的认领人（claimant）获得一笔利润分成
 * - 站点由用户申请认领，管理员审核通过后生效
 * - eCharts 地图使用经纬度数据
 */
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ServiceStation = sequelize.define('ServiceStation', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '站点名称（如：上海浦东服务站）'
    },
    province: { type: DataTypes.STRING(50), allowNull: false, comment: '省' },
    city: { type: DataTypes.STRING(50), allowNull: false, comment: '市' },
    district: { type: DataTypes.STRING(50), allowNull: true, comment: '区/县' },
    address: { type: DataTypes.STRING(200), allowNull: true, comment: '详细地址' },
    longitude: {
        type: DataTypes.DECIMAL(10, 6),
        allowNull: true,
        comment: '经度（eCharts地图用）'
    },
    latitude: {
        type: DataTypes.DECIMAL(10, 6),
        allowNull: true,
        comment: '纬度（eCharts地图用）'
    },
    // ── 认领人 ──
    claimant_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '认领用户ID（NULL=尚未有人认领）'
    },
    // ── 利润分配 ──
    commission_rate: {
        type: DataTypes.DECIMAL(4, 3),
        defaultValue: 0.05,
        comment: '该地区成交时，认领人获得的利润比例（如0.05=5%）'
    },
    // ── 自提服务 ──
    is_pickup_point: {
        type: DataTypes.TINYINT,
        defaultValue: 0,
        comment: '是否提供自提服务（1=是）'
    },
    pickup_contact: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: '自提联系人&电话'
    },
    // ── 运营数据 ──
    total_orders: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '该站点区域累计成交总单数'
    },
    total_commission: {
        type: DataTypes.DECIMAL(12, 2),
        defaultValue: 0,
        comment: '认领人累计获得佣金'
    },
    status: {
        type: DataTypes.ENUM('pending', 'active', 'inactive'),
        defaultValue: 'pending',
        comment: 'pending=待审核, active=运营中, inactive=已停用'
    },
    // ── 管理 ──
    remark: { type: DataTypes.TEXT, allowNull: true, comment: '管理员备注' }
}, {
    tableName: 'service_stations',
    timestamps: true
});

module.exports = ServiceStation;
