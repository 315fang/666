import { createRouter, createWebHistory } from 'vue-router'
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
        meta: { title: '数据概览', icon: 'DataAnalysis', group: '核心运营' }
      },
      {
        path: 'products',
        name: 'Products',
        component: () => import('@/views/products/index.vue'),
        meta: { title: '商品管理', icon: 'Goods', group: '核心运营' }
      },
      {
        path: 'orders',
        name: 'Orders',
        component: () => import('@/views/orders/index.vue'),
        meta: { title: '订单管理', icon: 'ShoppingCart', group: '核心运营' }
      },
      {
        path: 'users',
        name: 'Users',
        component: () => import('@/views/users/index.vue'),
        meta: { title: '用户管理', icon: 'User', group: '核心运营' }
      },
      // ===== 审核管理 =====
      {
        path: 'withdrawals',
        name: 'Withdrawals',
        component: () => import('@/views/withdrawals/index.vue'),
        meta: { title: '提现审核', icon: 'Money', group: '审核管理' }
      },
      {
        path: 'refunds',
        name: 'Refunds',
        component: () => import('@/views/refunds/index.vue'),
        meta: { title: '售后管理', icon: 'RefreshLeft', group: '审核管理' }
      },
      {
        path: 'commissions',
        name: 'Commissions',
        component: () => import('@/views/commissions/index.vue'),
        meta: { title: '佣金管理', icon: 'Wallet', group: '审核管理' }
      },
      {
        path: 'dealers',
        name: 'Dealers',
        component: () => import('@/views/dealers/index.vue'),
        meta: { title: '经销商管理', icon: 'OfficeBuilding', group: '审核管理' }
      },
      // ===== 内容运营 =====
      {
        path: 'content',
        name: 'Content',
        component: () => import('@/views/content/index.vue'),
        meta: { title: '内容管理', icon: 'Picture', group: '内容运营' }
      },
      {
        path: 'home-sections',
        name: 'HomeSections',
        component: () => import('@/views/home-sections/index.vue'),
        meta: { title: '首页装修', icon: 'Grid', group: '内容运营' }
      },
      {
        path: 'materials',
        name: 'Materials',
        component: () => import('@/views/materials/index.vue'),
        meta: { title: '素材管理', icon: 'Collection', group: '内容运营' }
      },
      {
        path: 'mass-message',
        name: 'MassMessage',
        component: () => import('@/views/mass-message/index.vue'),
        meta: { title: '群发消息', icon: 'Message', group: '内容运营' }
      },
      // ===== 系统管理 =====
      {
        path: 'admins',
        name: 'Admins',
        component: () => import('@/views/admins/index.vue'),
        meta: { title: '账号管理', icon: 'Avatar', group: '系统管理' }
      },
      {
        path: 'logs',
        name: 'Logs',
        component: () => import('@/views/logs/index.vue'),
        meta: { title: '操作日志', icon: 'List', group: '系统管理' }
      },
      {
        path: 'system-config',
        name: 'SystemConfig',
        component: () => import('@/views/system-config/index.vue'),
        meta: { title: '系统配置', icon: 'Tools', group: '系统管理' }
      },
      {
        path: 'settings',
        name: 'Settings',
        component: () => import('@/views/settings/index.vue'),
        meta: { title: '账户设置', icon: 'Setting', group: '系统管理' }
      }
    ]
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/dashboard'
  }
]

const router = createRouter({
  history: createWebHistory('/admin/'),
  routes
})

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
      next()
    } else {
      next('/login')
    }
  }
})

export default router
