export const ADMIN_ROLE_PRESETS = {
  admin: [
    'dashboard', 'products', 'orders', 'pickup_stations', 'users', 'distribution', 'content', 'materials',
    'dealers', 'commissions', 'statistics', 'logs',
    'settings_manage', 'notification',
    'order_amount_adjust', 'order_force_cancel', 'order_force_complete',
    'user_balance_adjust', 'user_role_manage', 'user_parent_manage', 'user_status_manage'
  ],
  operator: ['dashboard', 'products', 'orders', 'pickup_stations', 'content', 'materials', 'notification', 'statistics'],
  finance: ['dashboard', 'orders', 'pickup_stations', 'withdrawals', 'commissions', 'statistics'],
  customer_service: ['dashboard', 'orders', 'pickup_stations', 'refunds', 'users', 'notification'],
  warehouse: ['orders', 'pickup_stations'],
  designer: ['content', 'materials']
}

export function normalizeAdminPermission(perm) {
  return ({
    settlements: 'commissions',
    settings: 'settings_manage',
    system: 'settings_manage'
  }[perm] || perm)
}

export function getDefaultRolePermissions(role) {
  return (ADMIN_ROLE_PRESETS[role] || []).map(normalizeAdminPermission)
}
