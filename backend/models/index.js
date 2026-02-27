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
const Notification = require('./Notification');
const AppConfig = require('./AppConfig');
const QuickEntry = require('./QuickEntry');
const HomeSection = require('./HomeSection');
const Theme = require('./Theme');
const ActivityLog = require('./ActivityLog');
const SystemConfig = require('./SystemConfig');
const SystemConfigHistory = require('./SystemConfigHistory');
const AIAlert = require('./AIAlert');
const AIFixSession = require('./AIFixSession');
const MassMessage = require('./MassMessage');
const UserMassMessage = require('./UserMassMessage');
const UserTag = require('./UserTag');
const UserTagRelation = require('./UserTagRelation');
const Questionnaire = require('./Questionnaire');
const QuestionnaireSubmission = require('./QuestionnaireSubmission');
// ★ 新增：积分体系 + 拼团系统
const PointAccount = require('./PointAccount');
const PointLog = require('./PointLog');
const GroupActivity = require('./GroupActivity');
const GroupOrder = require('./GroupOrder');
const GroupMember = require('./GroupMember');
// ★ Phase 2：抖奖系统 + 优惠券系统
const LotteryPrize = require('./LotteryPrize');
const LotteryRecord = require('./LotteryRecord');
const Coupon = require('./Coupon');
const UserCoupon = require('./UserCoupon');
// ★ Phase 3：砍价系统
const SlashActivity = require('./SlashActivity');
const SlashRecord = require('./SlashRecord');
const SlashHelper = require('./SlashHelper');
// ★ Phase 4：自提核销 + 服务站点
const ServiceStation = require('./ServiceStation');
const StationClaim = require('./StationClaim');

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

// 用户通知关联
User.hasMany(Notification, { foreignKey: 'user_id', as: 'notifications' });
Notification.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

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

// 订单收货地址
Order.belongsTo(Address, { foreignKey: 'address_id', as: 'address' });

// 订单SKU
Order.belongsTo(SKU, { foreignKey: 'sku_id', as: 'sku' });

// ========== 素材关联 ==========
Material.belongsTo(Product, { foreignKey: 'product_id', as: 'product' });
Product.hasMany(Material, { foreignKey: 'product_id', as: 'materials' });

// ========== 管理员关联 ==========
Refund.belongsTo(Admin, { foreignKey: 'admin_id', as: 'admin' });
Dealer.belongsTo(Admin, { foreignKey: 'approved_by', as: 'approver' });

// ========== 系统配置关联 ==========
SystemConfig.belongsTo(Admin, { foreignKey: 'updated_by', as: 'updater' });
SystemConfigHistory.belongsTo(Admin, { foreignKey: 'changed_by', as: 'admin' });

// ========== AI告警关联 ==========
AIAlert.belongsTo(Admin, { foreignKey: 'resolved_by', as: 'resolver' });
AIFixSession.belongsTo(AIAlert, { foreignKey: 'alert_id', as: 'alert' });
AIFixSession.belongsTo(Admin, { foreignKey: 'executed_by', as: 'executor' });

// ========== 群发消息关联 ==========
MassMessage.belongsTo(Admin, { foreignKey: 'created_by', as: 'creator' });
UserMassMessage.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
UserMassMessage.belongsTo(MassMessage, { foreignKey: 'mass_message_id', as: 'massMessage' });
UserTagRelation.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
UserTagRelation.belongsTo(UserTag, { foreignKey: 'tag_id', as: 'tag' });
UserTag.belongsTo(Admin, { foreignKey: 'created_by', as: 'creator' });

// ========== 问卷关联 ==========
Questionnaire.hasMany(QuestionnaireSubmission, { foreignKey: 'questionnaire_id', as: 'submissions' });
QuestionnaireSubmission.belongsTo(Questionnaire, { foreignKey: 'questionnaire_id', as: 'questionnaire' });
QuestionnaireSubmission.belongsTo(User, { foreignKey: 'inviter_id', as: 'inviter' });
QuestionnaireSubmission.belongsTo(User, { foreignKey: 'submitter_id', as: 'submitter' });

// ========== 积分体系关联 ==========
User.hasOne(PointAccount, { foreignKey: 'user_id', as: 'pointAccount' });
PointAccount.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
User.hasMany(PointLog, { foreignKey: 'user_id', as: 'pointLogs' });
PointLog.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// ========== 拼团系统关联 ==========
GroupActivity.belongsTo(Product, { foreignKey: 'product_id', as: 'product' });
Product.hasMany(GroupActivity, { foreignKey: 'product_id', as: 'groupActivities' });

GroupOrder.belongsTo(GroupActivity, { foreignKey: 'activity_id', as: 'activity' });
GroupActivity.hasMany(GroupOrder, { foreignKey: 'activity_id', as: 'groupOrders' });
GroupOrder.belongsTo(User, { foreignKey: 'leader_id', as: 'leader' });
GroupOrder.belongsTo(User, { foreignKey: 'inviter_id', as: 'inviter' });
GroupOrder.belongsTo(Product, { foreignKey: 'product_id', as: 'product' });
GroupOrder.hasMany(GroupMember, { foreignKey: 'group_order_id', as: 'members' });

GroupMember.belongsTo(GroupOrder, { foreignKey: 'group_order_id', as: 'groupOrder' });
GroupMember.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
GroupMember.belongsTo(User, { foreignKey: 'inviter_id', as: 'inviter' });
GroupMember.belongsTo(Order, { foreignKey: 'order_id', as: 'order' });

// ========== Phase 2: 抽奖系统关联 ==========
LotteryRecord.belongsTo(LotteryPrize, { foreignKey: 'prize_id', as: 'prize' });
LotteryPrize.hasMany(LotteryRecord, { foreignKey: 'prize_id', as: 'records' });
LotteryRecord.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
User.hasMany(LotteryRecord, { foreignKey: 'user_id', as: 'lotteryRecords' });

// ========== Phase 2: 优惠券系统关联 ==========
UserCoupon.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
User.hasMany(UserCoupon, { foreignKey: 'user_id', as: 'coupons' });
UserCoupon.belongsTo(Coupon, { foreignKey: 'coupon_id', as: 'couponTemplate' });
Coupon.hasMany(UserCoupon, { foreignKey: 'coupon_id', as: 'issuedCoupons' });
Order.belongsTo(UserCoupon, { foreignKey: 'coupon_id', as: 'coupon' });

// ========== Phase 3: 砍价系统关联 ==========
SlashRecord.belongsTo(SlashActivity, { foreignKey: 'activity_id', as: 'activity' });
SlashActivity.hasMany(SlashRecord, { foreignKey: 'activity_id', as: 'records' });
SlashRecord.belongsTo(User, { foreignKey: 'user_id', as: 'initiator' });
User.hasMany(SlashRecord, { foreignKey: 'user_id', as: 'slashRecords' });
SlashRecord.belongsTo(Product, { foreignKey: 'product_id', as: 'product' });
SlashHelper.belongsTo(SlashRecord, { foreignKey: 'slash_record_id', as: 'slashRecord' });
SlashRecord.hasMany(SlashHelper, { foreignKey: 'slash_record_id', as: 'helpers' });
SlashHelper.belongsTo(User, { foreignKey: 'helper_user_id', as: 'helper' });
SlashActivity.belongsTo(Product, { foreignKey: 'product_id', as: 'product' });

// ========== Phase 4: 自提 + 服务站点关联 ==========
ServiceStation.belongsTo(User, { foreignKey: 'claimant_id', as: 'claimant' });
User.hasMany(ServiceStation, { foreignKey: 'claimant_id', as: 'claimedStations' });
StationClaim.belongsTo(ServiceStation, { foreignKey: 'station_id', as: 'station' });
StationClaim.belongsTo(User, { foreignKey: 'applicant_id', as: 'applicant' });
ServiceStation.hasMany(StationClaim, { foreignKey: 'station_id', as: 'claims' });
User.hasMany(StationClaim, { foreignKey: 'applicant_id', as: 'stationClaims' });
Order.belongsTo(ServiceStation, { foreignKey: 'pickup_station_id', as: 'pickupStation' });
ServiceStation.hasMany(Order, { foreignKey: 'pickup_station_id', as: 'pickupOrders' });

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
    Dealer,
    Notification,
    AppConfig,
    QuickEntry,
    HomeSection,
    Theme,
    ActivityLog,
    SystemConfig,
    SystemConfigHistory,
    AIAlert,
    AIFixSession,
    MassMessage,
    UserMassMessage,
    UserTag,
    UserTagRelation,
    Questionnaire,
    QuestionnaireSubmission,
    // 积分体系
    PointAccount,
    PointLog,
    // 拼团系统
    GroupActivity,
    GroupOrder,
    GroupMember,
    // Phase 2: 抽奖系统
    LotteryPrize,
    LotteryRecord,
    // Phase 2: 优惠券系统
    Coupon,
    UserCoupon,
    // Phase 3: 砍价系统
    SlashActivity,
    SlashRecord,
    SlashHelper,
    // Phase 4: 自提核销 + 服务站点
    ServiceStation,
    StationClaim
};
