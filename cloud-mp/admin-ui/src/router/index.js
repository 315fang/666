import { createRouter, createWebHashHistory } from 'vue-router'
import { useUserStore } from '@/store/user'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/login/index.vue'),
    meta: { title: '登录' }
  },
  {
    path: '/',
    component: () => import('@/layout/index.vue'),
    redirect: '/dashboard',
    children: [
      // ===== 核心运营 =====
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: () => import('@/views/dashboard/index.vue'),
        meta: { title: '经营看板', icon: 'DataAnalysis', group: '经营概览', order: 1, permission: 'dashboard' }
      },
      {
        path: 'finance',
        name: 'Finance',
        component: () => import('@/views/finance/index.vue'),
        meta: { title: '财务看板', icon: 'Money', group: '经营概览', order: 2, permission: 'statistics' }
      },
      {
        path: 'settings',
        name: 'Settings',
        component: () => import('@/views/settings/index.vue'),
        meta: { title: '运营参数', icon: 'Setting', group: '经营概览', order: 2, permission: 'settings_manage' }
      },
      {
        path: 'products',
        name: 'Products',
        component: () => import('@/views/products/index.vue'),
        meta: { title: '商品管理', icon: 'Goods', group: '商品与营销', order: 1, permission: 'products' }
      },
      {
        path: 'categories',
        name: 'Categories',
        component: () => import('@/views/categories/index.vue'),
        meta: { title: '商品分类', icon: 'Menu', group: '商品与营销', order: 2, permission: 'products' }
      },
      {
        path: 'orders',
        name: 'Orders',
        component: () => import('@/views/orders/index.vue'),
        meta: { title: '订单管理', icon: 'ShoppingCart', group: '订单与资金', order: 1, permission: 'orders' }
      },
      {
        path: 'pickup-stations',
        name: 'PickupStations',
        component: () => import('@/views/pickup-stations/index.vue'),
        meta: { title: '自提门店', icon: 'MapLocation', group: '订单与资金', order: 2.5, permission: 'pickup_stations' }
      },
      {
        path: 'group-buys',
        name: 'GroupBuys',
        component: () => import('@/views/group-buy/index.vue'),
        meta: { title: '拼团活动', icon: 'Present', group: '商品与营销', order: 1, permission: 'products' }
      },
      {
        path: 'activities',
        name: 'Activities',
        component: () => import('@/views/activities/index.vue'),
        meta: { title: '营销资源', icon: 'Promotion', group: '商品与营销', order: 2, permission: 'products' }
      },
      {
        path: 'users',
        name: 'Users',
        component: () => import('@/views/users/index.vue'),
        meta: { title: '用户管理', icon: 'User', group: '用户与渠道', order: 1, permission: 'users' }
      },
      {
        path: 'coupons',
        name: 'Coupons',
        component: () => import('@/views/coupons/index.vue'),
        meta: { title: '优惠券管理', icon: 'Ticket', group: '商品与营销', order: 3, permission: 'products' }
      },
      // ===== 审核管理 =====
      {
        path: 'withdrawals',
        name: 'Withdrawals',
        component: () => import('@/views/withdrawals/index.vue'),
        meta: { title: '提现审核', icon: 'Money', group: '订单与资金', order: 4, permission: 'withdrawals' }
      },
      {
        path: 'refunds',
        name: 'Refunds',
        component: () => import('@/views/refunds/index.vue'),
        meta: { title: '售后退款', icon: 'RefreshLeft', group: '订单与资金', order: 3, permission: 'refunds' }
      },
      {
        path: 'deposit-orders',
        name: 'DepositOrders',
        component: () => import('@/views/deposit-orders/index.vue'),
        meta: { title: '押金订单', icon: 'Ticket', group: '订单与资金', order: 3.2, permission: 'refunds' }
      },
      {
        path: 'commissions',
        name: 'Commissions',
        component: () => import('@/views/commissions/index.vue'),
        meta: { title: '佣金结算', icon: 'Wallet', group: '订单与资金', order: 5, permission: 'commissions' }
      },
      {
        path: 'dealers',
        name: 'Dealers',
        component: () => import('@/views/dealers/index.vue'),
        meta: { title: '经销商管理', icon: 'OfficeBuilding', group: '用户与渠道', order: 2, permission: 'dealers' }
      },
      {
        path: 'branch-agents',
        name: 'BranchAgents',
        component: () => import('@/views/branch-agents/index.vue'),
        meta: { title: '分支代理', icon: 'Location', group: '用户与渠道', order: 3, permission: 'dealers' }
      },
      {
        path: 'n-system',
        name: 'NSystem',
        component: () => import('@/views/n-system/index.vue'),
        meta: { title: 'N路径代理', icon: 'Connection', group: '用户与渠道', order: 4, permission: 'dealers' }
      },
      // ===== 内容运营 =====
      {
        path: 'content',
        name: 'Content',
        component: () => import('@/views/content/index.vue'),
        meta: { title: '轮播与图文', icon: 'Picture', group: '内容与设计', order: 1, permission: 'content' }
      },
      {
        path: 'home-sections',
        name: 'HomeSections',
        component: () => import('@/views/home-sections/index.vue'),
        meta: { title: '首页内容位', icon: 'Notification', group: '内容与设计', order: 6, permission: 'content' }
      },
      {
        path: 'materials',
        name: 'Materials',
        component: () => import('@/views/materials/index.vue'),
        meta: { title: '素材管理', icon: 'Collection', group: '内容与设计', order: 2, permission: 'materials' }
      },
      {
        path: 'reviews',
        name: 'Reviews',
        component: () => import('@/views/reviews/index.vue'),
        meta: { title: '评论管理', icon: 'ChatDotRound', group: '内容与设计', order: 3, permission: 'content' }
      },
      {
        path: 'mass-message',
        name: 'MassMessage',
        component: () => import('@/views/mass-message/index.vue'),
        meta: { title: '群发消息', icon: 'Message', group: '内容与设计', order: 4, permission: 'notification' }
      },
      // ===== 会员体系 =====
      {
        path: 'membership',
        name: 'Membership',
        component: () => import('@/views/membership/index.vue'),
        meta: { title: '会员与成长值', icon: 'UserFilled', group: '业务策略', order: 1, permission: 'statistics' }
      },
      // ===== 系统管理 =====
      {
        path: 'admins',
        name: 'Admins',
        component: () => import('@/views/admins/index.vue'),
        meta: { title: '管理员与权限', icon: 'Avatar', group: '平台与运维', order: 1, permission: 'admins' }
      },
      {
        path: 'ops-monitor',
        name: 'OpsMonitor',
        component: () => import('@/views/ops-monitor/index.vue'),
        meta: { title: '运维监控', icon: 'Monitor', group: '平台与运维', order: 2, permission: 'super_admin' }
      },
      {
        path: 'logs',
        name: 'Logs',
        component: () => import('@/views/logs/index.vue'),
        meta: { title: '操作日志', icon: 'List', group: '平台与运维', order: 3, permission: 'logs' }
      },
    ]
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/dashboard'
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

function firstNavigablePath(userStore) {
  const children = routes.find((r) => r.path === '/')?.children || []
  const items = children.filter((c) => c.meta?.title && c.meta?.nav !== false)
  for (const c of items) {
    const p = c.meta?.permission
    if (!p || userStore.hasPermission(p)) {
      return `/${c.path}`
    }
  }
  return '/login'
}

// 路由守卫
router.beforeEach((to, from, next) => {
  const userStore = useUserStore()

  // 设置页面标题
  document.title = to.meta.title ? `${to.meta.title} - 管理后台` : '管理后台'

  if (to.path === '/login') {
    if (userStore.isLoggedIn) {
      next('/')
    } else {
      next()
    }
  } else {
    if (userStore.isLoggedIn) {
      const permission = to.meta?.permission
      if (permission && !userStore.hasPermission(permission)) {
        const fallback = firstNavigablePath(userStore)
        if (fallback !== '/login' && fallback !== to.path) {
          next(fallback)
        } else {
          next('/login')
        }
        return
      }
      next()
    } else {
      next('/login')
    }
  }
})

export default router
