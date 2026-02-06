const { sequelize } = require('../config/database');
const User = require('./User');
const Product = require('./Product');
const Order = require('./Order');
const Address = require('./Address');
const CommissionLog = require('./CommissionLog');
const Category = require('./Category');
const SKU = require('./SKU');
const Cart = require('./Cart');
const Banner = require('./Banner');
const Content = require('./Content');
const Material = require('./Material');
const Withdrawal = require('./Withdrawal');
const Admin = require('./Admin');
const Refund = require('./Refund');
const Dealer = require('./Dealer');

// ========== 用户相关关联 ==========
User.hasMany(Order, { foreignKey: 'buyer_id', as: 'orders' });
Order.belongsTo(User, { foreignKey: 'buyer_id', as: 'buyer' });

User.hasMany(Order, { foreignKey: 'distributor_id', as: 'distributedOrders' });
Order.belongsTo(User, { foreignKey: 'distributor_id', as: 'distributor' });

User.hasMany(Address, { foreignKey: 'user_id', as: 'addresses' });
Address.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

User.hasMany(CommissionLog, { foreignKey: 'user_id', as: 'commissions' });
CommissionLog.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// 用户上下级关系（自关联）
User.belongsTo(User, { foreignKey: 'parent_id', as: 'parent' });
User.hasMany(User, { foreignKey: 'parent_id', as: 'children' });

// 用户购物车
User.hasMany(Cart, { foreignKey: 'user_id', as: 'cartItems' });
Cart.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// 用户提现记录
User.hasMany(Withdrawal, { foreignKey: 'user_id', as: 'withdrawals' });
Withdrawal.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// 用户退款记录
User.hasMany(Refund, { foreignKey: 'user_id', as: 'refunds' });
Refund.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// 用户经销商信息
User.hasOne(Dealer, { foreignKey: 'user_id', as: 'dealer' });
Dealer.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// ========== 商品相关关联 ==========
Product.hasMany(Order, { foreignKey: 'product_id', as: 'orders' });
Order.belongsTo(Product, { foreignKey: 'product_id', as: 'product' });

// 商品类目
Product.belongsTo(Category, { foreignKey: 'category_id', as: 'category' });
Category.hasMany(Product, { foreignKey: 'category_id', as: 'products' });

// 商品SKU
Product.hasMany(SKU, { foreignKey: 'product_id', as: 'skus' });
SKU.belongsTo(Product, { foreignKey: 'product_id', as: 'product' });

// 购物车商品
Cart.belongsTo(Product, { foreignKey: 'product_id', as: 'product' });
Product.hasMany(Cart, { foreignKey: 'product_id', as: 'cartItems' });

Cart.belongsTo(SKU, { foreignKey: 'sku_id', as: 'sku' });
SKU.hasMany(Cart, { foreignKey: 'sku_id', as: 'cartItems' });

// ========== 订单相关关联 ==========
Order.hasMany(CommissionLog, { foreignKey: 'order_id', as: 'commissions' });
CommissionLog.belongsTo(Order, { foreignKey: 'order_id', as: 'order' });

// 订单退款
Order.hasMany(Refund, { foreignKey: 'order_id', as: 'refunds' });
Refund.belongsTo(Order, { foreignKey: 'order_id', as: 'order' });

// ========== 素材关联 ==========
Material.belongsTo(Product, { foreignKey: 'product_id', as: 'product' });
Product.hasMany(Material, { foreignKey: 'product_id', as: 'materials' });

// ========== 管理员关联 ==========
Refund.belongsTo(Admin, { foreignKey: 'admin_id', as: 'admin' });
Dealer.belongsTo(Admin, { foreignKey: 'approved_by', as: 'approver' });

module.exports = {
    sequelize,
    User,
    Product,
    Order,
    Address,
    CommissionLog,
    Category,
    SKU,
    Cart,
    Banner,
    Content,
    Material,
    Withdrawal,
    Admin,
    Refund,
    Dealer
};
