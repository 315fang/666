export const ADMIN_GROUP_ORDER = [
  '经营与策略',
  '交易与履约',
  '商品与营销',
  '用户与渠道',
  '页面与内容',
  '平台与运维',
  '其他'
]

export const ADMIN_SHORTCUTS = [
  {
    key: 'pending-ship',
    label: '待发货订单',
    path: '/orders',
    query: { status_group: 'pending_ship' },
    permission: 'orders',
    priority: 10,
    surface: 'topbar'
  },
  {
    key: 'pending-refunds',
    label: '待退款审核',
    path: '/refunds',
    query: { status: 'pending' },
    permission: 'refunds',
    priority: 20,
    surface: 'topbar'
  },
  {
    key: 'page-design-topbar',
    label: '页面装修',
    path: '/home-sections',
    permission: 'content',
    priority: 30,
    surface: 'topbar'
  },
  {
    key: 'activity-resources-topbar',
    label: '活动资源',
    path: '/activities',
    permission: 'products',
    priority: 40,
    surface: 'topbar'
  },
  {
    key: 'settings-topbar',
    label: '运营参数',
    path: '/settings',
    permission: 'settings_manage',
    priority: 50,
    surface: 'topbar'
  },
  {
    key: 'finance-dashboard',
    label: '财务看板',
    path: '/finance',
    permission: 'statistics',
    priority: 10,
    surface: 'dashboard',
    icon: 'Money',
    iconBg: 'rgba(16,185,129,0.12)'
  },
  {
    key: 'orders-dashboard',
    label: '订单履约',
    path: '/orders',
    permission: 'orders',
    priority: 20,
    surface: 'dashboard',
    icon: 'Van',
    iconBg: 'rgba(20,184,166,0.12)'
  },
  {
    key: 'refunds-dashboard',
    label: '退款审核',
    path: '/refunds',
    permission: 'refunds',
    priority: 30,
    surface: 'dashboard',
    icon: 'RefreshLeft',
    iconBg: 'rgba(99,102,241,0.12)'
  },
  {
    key: 'page-design-dashboard',
    label: '页面装修',
    path: '/home-sections',
    permission: 'content',
    priority: 40,
    surface: 'dashboard',
    icon: 'Notification',
    iconBg: 'rgba(245,158,11,0.12)'
  },
  {
    key: 'activity-resources-dashboard',
    label: '活动资源',
    path: '/activities',
    permission: 'products',
    priority: 50,
    surface: 'dashboard',
    icon: 'MagicStick',
    iconBg: 'rgba(236,72,153,0.12)'
  },
  {
    key: 'settings-dashboard',
    label: '运营参数',
    path: '/settings',
    permission: 'settings_manage',
    priority: 60,
    surface: 'dashboard',
    icon: 'Setting',
    iconBg: 'rgba(59,130,246,0.12)'
  },
  {
    key: 'membership-dashboard',
    label: '会员策略',
    path: '/membership',
    permission: 'statistics',
    priority: 70,
    surface: 'dashboard',
    icon: 'UserFilled',
    iconBg: 'rgba(99,102,241,0.12)'
  }
]

const DEFAULT_GROUP = '其他'
const DEFAULT_SECTION = '未分组'
const GROUP_ORDER_MAP = ADMIN_GROUP_ORDER.reduce((acc, name, index) => {
  acc[name] = index
  return acc
}, {})

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
    .map((item) => ({
      key: item.name || item.path,
      path: normalizePath(item.path),
      title: item.meta?.title,
      icon: item.meta?.icon,
      group: item.meta?.group || DEFAULT_GROUP,
      section: item.meta?.section || DEFAULT_SECTION,
      sectionOrder: Number(item.meta?.sectionOrder || 999),
      order: Number(item.meta?.order || 999),
      permission: item.meta?.permission || '',
      navHidden: item.meta?.nav === false
    }))
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
  return [route?.meta?.group, route?.meta?.section, route?.meta?.title]
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
