const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * StockReservation - 库存预留表
 *
 * 用途：防止多个代理商同时确认订单导致超售
 * 工作原理：
 * 1. 代理商确认订单前，先创建预留记录
 * 2. 预留成功后，才扣减库存
 * 3. 预留有效期5分钟，超时自动释放
 * 4. 支持手动释放（取消订单、支付失败等场景）
 */
const StockReservation = sequelize.define('StockReservation', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '代理商用户ID',
        index: true
    },
    order_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '订单ID',
        index: true,
        unique: true  // 一个订单只能有一条预留记录
    },
    product_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '商品ID',
        index: true
    },
    quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '预留数量'
    },
    status: {
        type: DataTypes.ENUM('active', 'consumed', 'released', 'expired'),
        defaultValue: 'active',
        comment: '状态: active=生效中, consumed=已消费, released=已释放, expired=已过期',
        index: true
    },
    expires_at: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: '过期时间（通常为创建后5分钟）',
        index: true
    },
    consumed_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '消费时间（确认订单时记录）'
    },
    released_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '释放时间（取消订单或超时时记录）'
    },
    remark: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '备注说明'
    }
}, {
    tableName: 'stock_reservations',
    timestamps: true,
    indexes: [
        { fields: ['user_id', 'status'] },
        { fields: ['order_id'] },
        { fields: ['status', 'expires_at'] },
        { fields: ['created_at'] }
    ]
});

/**
 * 静态方法：创建预留记录
 * @param {Object} params - 预留参数
 * @param {number} ttl - 有效期（秒），默认300秒（5分钟）
 * @returns {Promise<StockReservation>}
 */
StockReservation.createReservation = async function({ user_id, order_id, product_id, quantity, ttl = 300, transaction = null }) {
    const expires_at = new Date(Date.now() + ttl * 1000);

    return await StockReservation.create({
        user_id,
        order_id,
        product_id,
        quantity,
        expires_at
    }, { transaction });
};

/**
 * 静态方法：检查是否有足够的可用库存（扣除已预留）
 */
StockReservation.checkAvailableStock = async function(user_id, product_id, required_quantity, transaction = null) {
    const { User } = require('./index');

    // 获取用户当前库存
    const user = await User.findByPk(user_id, {
        attributes: ['stock_count'],
        transaction
    });

    if (!user) {
        throw new Error('用户不存在');
    }

    // 计算当前活跃预留总量
    const activeReservations = await StockReservation.sum('quantity', {
        where: {
            user_id,
            product_id,
            status: 'active',
            expires_at: { [sequelize.Sequelize.Op.gt]: new Date() }
        },
        transaction
    }) || 0;

    // 可用库存 = 当前库存 - 活跃预留
    const available = user.stock_count - activeReservations;

    return {
        current_stock: user.stock_count,
        active_reservations: activeReservations,
        available_stock: available,
        is_sufficient: available >= required_quantity
    };
};

/**
 * 实例方法：消费预留（确认订单后调用）
 */
StockReservation.prototype.consume = async function(transaction = null) {
    if (this.status !== 'active') {
        throw new Error(`预留状态不正确: ${this.status}`);
    }

    if (new Date() > this.expires_at) {
        this.status = 'expired';
        this.released_at = new Date();
        await this.save({ transaction });
        throw new Error('预留已过期');
    }

    this.status = 'consumed';
    this.consumed_at = new Date();
    return await this.save({ transaction });
};

/**
 * 实例方法：释放预留（取消订单或超时时调用）
 */
StockReservation.prototype.release = async function(transaction = null) {
    if (this.status === 'consumed') {
        throw new Error('已消费的预留无法释放');
    }

    this.status = 'released';
    this.released_at = new Date();
    return await this.save({ transaction });
};

/**
 * 静态方法：清理过期预留（定时任务调用）
 */
StockReservation.cleanupExpired = async function() {
    const expiredCount = await StockReservation.update(
        {
            status: 'expired',
            released_at: new Date()
        },
        {
            where: {
                status: 'active',
                expires_at: { [sequelize.Sequelize.Op.lte]: new Date() }
            }
        }
    );

    console.log(`[StockReservation] 清理过期预留: ${expiredCount[0]} 条`);
    return expiredCount[0];
};

module.exports = StockReservation;
