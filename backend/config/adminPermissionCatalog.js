/**
 * 管理端权限目录（与 admin-ui 路由 meta.permission 对齐）
 * 后端校验：middleware/adminAuth.js
 */

const ADMIN_ROLE_PRESETS = {
    admin: {
        name: '管理员',
        description: '商品、订单、用户、分销、内容管理',
        permissions: [
            'dashboard', 'products', 'orders', 'logistics', 'pickup_stations', 'users', 'distribution', 'content', 'materials',
            'dealers', 'commissions', 'statistics', 'logs',
            'settings_manage', 'notification',
            'order_amount_adjust', 'order_force_cancel', 'order_force_complete',
            'user_balance_adjust', 'user_role_manage', 'user_parent_manage', 'user_status_manage'
        ]
    },
    operator: {
        name: '运营',
        description: '商品、订单、内容、群发',
        permissions: ['dashboard', 'products', 'orders', 'logistics', 'pickup_stations', 'content', 'materials', 'notification', 'statistics']
    },
    finance: {
        name: '财务',
        description: '订单、提现、结算',
        permissions: ['dashboard', 'orders', 'logistics', 'pickup_stations', 'withdrawals', 'commissions', 'statistics']
    },
    customer_service: {
        name: '客服',
        description: '订单、售后、用户、群发通知',
        permissions: ['dashboard', 'orders', 'logistics', 'pickup_stations', 'refunds', 'users', 'notification']
    },
    warehouse: {
        name: '库房',
        description: '订单与物流发货（无经营看板）',
        permissions: ['orders', 'logistics', 'pickup_stations']
    },
    designer: {
        name: '美工',
        description: '图文与素材',
        permissions: ['content', 'materials']
    }
};

/** 权限键 → 说明（用于管理端勾选与 API 返回） */
const PERMISSION_CATALOG = [
    { key: 'dashboard', name: '经营看板' },
    { key: 'products', name: '商品管理' },
    { key: 'orders', name: '订单管理' },
    { key: 'logistics', name: '发货/物流查询' },
    { key: 'pickup_stations', name: '自提门店' },
    { key: 'users', name: '用户管理' },
    { key: 'distribution', name: '分销管理' },
    { key: 'content', name: '内容管理' },
    { key: 'notification', name: '群发消息' },
    { key: 'materials', name: '素材管理' },
    { key: 'withdrawals', name: '提现管理' },
    { key: 'refunds', name: '售后管理' },
    { key: 'commissions', name: '佣金管理' },
    { key: 'dealers', name: '经销商管理' },
    { key: 'statistics', name: '数据统计' },
    { key: 'settings_manage', name: '系统配置修改' },
    { key: 'logs', name: '操作日志' },
    { key: 'admins', name: '账号管理' },
    { key: 'order_amount_adjust', name: '订单改价' },
    { key: 'order_force_cancel', name: '订单强制取消' },
    { key: 'order_force_complete', name: '订单强制完成' },
    { key: 'user_balance_adjust', name: '用户余额调整' },
    { key: 'user_role_manage', name: '用户角色修改' },
    { key: 'user_parent_manage', name: '用户上级修改' },
    { key: 'user_status_manage', name: '用户封禁解封' }
];

module.exports = {
    ADMIN_ROLE_PRESETS,
    PERMISSION_CATALOG
};
