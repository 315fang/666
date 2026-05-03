export const ADMIN_GROUP_ORDER = [
  '今日处理',
  '商品货架',
  '营销活动',
  '会员渠道',
  '页面与内容',
  '平台运维',
  '其他入口'
]

export const ADMIN_SHORTCUTS = [
  {
    key: 'pending-ship',
    label: '待发货',
    path: '/orders',
    query: { status_group: 'pending_ship' },
    permission: 'orders',
    priority: 10,
    surface: 'topbar'
  },
  {
    key: 'pending-refunds',
    label: '待退款',
    path: '/refunds',
    query: { status: 'pending' },
    permission: 'refunds',
    priority: 20,
    surface: 'topbar'
  },
  {
    key: 'pending-withdrawals',
    label: '待提现',
    path: '/withdrawals',
    query: { status: 'pending' },
    permission: 'withdrawals',
    priority: 30,
    surface: 'topbar'
  },
  {
    key: 'goods-fund-topbar',
    label: '货款审核',
    path: '/goods-fund-transfers',
    query: { status: 'pending' },
    permission: 'commissions',
    priority: 40,
    surface: 'topbar'
  },
  {
    key: 'coupons-topbar',
    label: '今日领券',
    path: '/coupons',
    permission: 'products',
    priority: 50,
    surface: 'topbar'
  },
  {
    key: 'orders-dashboard',
    label: '待发货处理',
    path: '/orders',
    query: { status_group: 'pending_ship' },
    permission: 'orders',
    priority: 10,
    surface: 'dashboard',
    icon: 'Van',
    iconBg: 'rgba(197,154,69,0.14)'
  },
  {
    key: 'refunds-dashboard',
    label: '退款审核',
    path: '/refunds',
    query: { status: 'pending' },
    permission: 'refunds',
    priority: 20,
    surface: 'dashboard',
    icon: 'RefreshLeft',
    iconBg: 'rgba(216,52,58,0.12)'
  },
  {
    key: 'withdrawals-dashboard',
    label: '提现审核',
    path: '/withdrawals',
    query: { status: 'pending' },
    permission: 'withdrawals',
    priority: 30,
    surface: 'dashboard',
    icon: 'Money',
    iconBg: 'rgba(197,154,69,0.14)'
  },
  {
    key: 'goods-fund-dashboard',
    label: '货款审核',
    path: '/goods-fund-transfers',
    query: { status: 'pending' },
    permission: 'commissions',
    priority: 40,
    surface: 'dashboard',
    icon: 'Wallet',
    iconBg: 'rgba(216,52,58,0.10)'
  },
  {
    key: 'coupons-dashboard',
    label: '今日领券',
    path: '/coupons',
    permission: 'products',
    priority: 50,
    surface: 'dashboard',
    icon: 'Ticket',
    iconBg: 'rgba(216,52,58,0.12)'
  },
  {
    key: 'activity-dashboard',
    label: '活动效果',
    path: '/activities',
    permission: 'products',
    priority: 60,
    surface: 'dashboard',
    icon: 'Promotion',
    iconBg: 'rgba(31,41,55,0.08)'
  },
  {
    key: 'page-design-dashboard',
    label: '页面装修',
    path: '/home-sections',
    permission: 'content',
    priority: 70,
    surface: 'dashboard',
    icon: 'Notification',
    iconBg: 'rgba(197,154,69,0.14)'
  },
  {
    key: 'membership-dashboard',
    label: '会员策略',
    path: '/membership',
    permission: 'settings_manage',
    priority: 80,
    surface: 'dashboard',
    icon: 'UserFilled',
    iconBg: 'rgba(31,41,55,0.08)'
  }
]

const DEFAULT_GROUP = '其他入口'
const DEFAULT_SECTION = '未分组'
const GROUP_ORDER_MAP = ADMIN_GROUP_ORDER.reduce((acc, name, index) => {
  acc[name] = index
  return acc
}, {})

const ADMIN_NAV_OVERRIDES = {
  '/dashboard': { group: '今日处理', section: '经营总览', sectionOrder: 1, order: 1 },
  '/orders': { group: '今日处理', section: '订单履约', sectionOrder: 2, order: 1 },
  '/refunds': { group: '今日处理', section: '售后资金', sectionOrder: 3, order: 1 },
  '/withdrawals': { group: '今日处理', section: '售后资金', sectionOrder: 3, order: 2 },
  '/goods-fund-transfers': { group: '今日处理', section: '售后资金', sectionOrder: 3, order: 3 },
  '/commissions': { group: '今日处理', section: '售后资金', sectionOrder: 3, order: 4 },
  '/deposit-orders': { group: '今日处理', section: '售后资金', sectionOrder: 3, order: 5 },
  '/finance': { group: '今日处理', section: '资金看板', sectionOrder: 4, order: 1 },
  '/pickup-stations': { group: '今日处理', section: '门店履约', sectionOrder: 5, order: 1 },
  '/pickup-procurements': { group: '今日处理', section: '门店履约', sectionOrder: 5, order: 2 },
  '/pickup-inventory': { group: '今日处理', section: '门店履约', sectionOrder: 5, order: 3 },
  '/warehouse-overview': { group: '今日处理', section: '门店履约', sectionOrder: 5, order: 4 },

  '/products': { group: '商品货架', section: '商品基础', sectionOrder: 1, order: 1 },
  '/categories': { group: '商品货架', section: '商品基础', sectionOrder: 1, order: 2 },
  '/product-bundles': { group: '商品货架', section: '自由选套餐', sectionOrder: 2, order: 1 },
  '/limited-sales': { group: '商品货架', section: '限时货架', sectionOrder: 3, order: 1 },

  '/coupons': { group: '营销活动', section: '优惠与券', sectionOrder: 1, order: 1 },
  '/activities': { group: '营销活动', section: '活动玩法', sectionOrder: 2, order: 1 },
  '/group-buys': { group: '营销活动', section: '活动玩法', sectionOrder: 2, order: 2 },

  '/users': { group: '会员渠道', section: '用户运营', sectionOrder: 1, order: 1 },
  '/membership': { group: '会员渠道', section: '会员策略', sectionOrder: 1, order: 2 },
  '/dealers': { group: '会员渠道', section: '渠道管理', sectionOrder: 2, order: 1 },
  '/branch-agents': { group: '会员渠道', section: '渠道管理', sectionOrder: 2, order: 2 },
  '/directed-invites': { group: '会员渠道', section: '渠道管理', sectionOrder: 2, order: 3 },

  '/home-sections': { group: '页面与内容', section: '页面装修', sectionOrder: 1, order: 1 },
  '/content': { group: '页面与内容', section: '内容资源', sectionOrder: 2, order: 1 },
  '/materials': { group: '页面与内容', section: '内容资源', sectionOrder: 2, order: 2 },
  '/reviews': { group: '页面与内容', section: '内容资源', sectionOrder: 2, order: 3 },
  '/mass-message': { group: '页面与内容', section: '消息触达', sectionOrder: 3, order: 1 },

  '/settings': { group: '平台运维', section: '运营配置', sectionOrder: 1, order: 1 },
  '/admins': { group: '平台运维', section: '权限治理', sectionOrder: 2, order: 1 },
  '/ops-monitor': { group: '平台运维', section: '运维排障', sectionOrder: 3, order: 1 },
  '/logs': { group: '平台运维', section: '运维排障', sectionOrder: 3, order: 2 }
}

function getRootChildren(routes = []) {
  return routes.find((item) => item.path === '/')?.children || []
}

function normalizePath(path = '') {
  const raw = String(path || '').trim()
  if (!raw) return '/'
  return raw.startsWith('/') ? raw : `/${raw}`
}

function compareLabel(a = '', b = '') {
  return String(a).localeCompare(String(b), 'zh-CN')
}

export function getAdminRouteEntries(routes = [], { includeHidden = false } = {}) {
  return getRootChildren(routes)
    .filter((item) => {
      if (!item.meta?.title) return false
      if (!includeHidden && item.meta?.nav === false) return false
      return true
    })
    .map((item) => {
      const path = normalizePath(item.path)
      const override = ADMIN_NAV_OVERRIDES[path] || {}
      return {
        key: item.name || item.path,
        path,
        title: item.meta?.title,
        icon: item.meta?.icon,
        group: override.group || item.meta?.group || DEFAULT_GROUP,
        section: override.section || item.meta?.section || DEFAULT_SECTION,
        sectionOrder: Number(override.sectionOrder ?? item.meta?.sectionOrder ?? 999),
        order: Number(override.order ?? item.meta?.order ?? 999),
        permission: override.permission || item.meta?.permission || '',
        navHidden: item.meta?.nav === false
      }
    })
}

export function buildAdminNavigationTree(routes = [], hasPermission = () => true) {
  const groups = new Map()
  const entries = getAdminRouteEntries(routes)
    .filter((item) => !item.permission || hasPermission(item.permission))

  entries.forEach((item) => {
    if (!groups.has(item.group)) {
      groups.set(item.group, {
        name: item.group,
        order: GROUP_ORDER_MAP[item.group] ?? 999,
        sections: new Map()
      })
    }
    const currentGroup = groups.get(item.group)
    if (!currentGroup.sections.has(item.section)) {
      currentGroup.sections.set(item.section, {
        name: item.section,
        order: item.sectionOrder,
        items: []
      })
    }
    currentGroup.sections.get(item.section).items.push(item)
  })

  return [...groups.values()]
    .sort((a, b) => a.order - b.order || compareLabel(a.name, b.name))
    .map((group) => ({
      name: group.name,
      sections: [...group.sections.values()]
        .map((section) => ({
          ...section,
          items: section.items.sort((a, b) => a.order - b.order || compareLabel(a.title, b.title))
        }))
        .sort((a, b) => a.order - b.order || compareLabel(a.name, b.name))
    }))
}

export function buildAdminBreadcrumbs(route) {
  const path = normalizePath(route?.path || '')
  const override = ADMIN_NAV_OVERRIDES[path] || {}
  return [
    override.group || route?.meta?.group,
    override.section || route?.meta?.section,
    route?.meta?.title
  ]
    .filter((item, index, list) => item && list.indexOf(item) === index)
}

export function buildShortcutItems(hasPermission = () => true, { surface, limit = Infinity } = {}) {
  return ADMIN_SHORTCUTS
    .filter((item) => item.surface === surface)
    .filter((item) => !item.permission || hasPermission(item.permission))
    .sort((a, b) => a.priority - b.priority || compareLabel(a.label, b.label))
    .slice(0, limit)
    .map((item) => ({
      ...item,
      to: item.query ? { path: item.path, query: item.query } : { path: item.path }
    }))
}
