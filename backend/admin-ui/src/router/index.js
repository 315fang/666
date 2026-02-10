import { createRouter, createWebHashHistory } from 'vue-router'
import Login from '../views/Login.vue'
import Layout from '../views/Layout.vue'

const routes = [
    {
        path: '/login',
        name: 'Login',
        component: Login
    },
    {
        path: '/',
        component: Layout,
        redirect: '/dashboard',
        children: [
            {
                path: 'dashboard',
                name: 'Dashboard',
                component: () => import('../views/Dashboard.vue'),
                meta: { title: '经营概览' }
            },
            {
                path: 'products',
                name: 'ProductList',
                component: () => import('../views/product/ProductList.vue'),
                meta: { title: '商品列表' }
            },
            {
                path: 'categories',
                name: 'CategoryList',
                component: () => import('../views/product/CategoryList.vue'),
                meta: { title: '类目管理' }
            },
            {
                path: 'orders',
                name: 'OrderList',
                component: () => import('../views/order/OrderList.vue'),
                meta: { title: '订单列表' }
            },
            {
                path: 'refunds',
                name: 'RefundList',
                component: () => import('../views/order/RefundList.vue'),
                meta: { title: '售后处理' }
            },
            {
                path: 'users',
                name: 'UserList',
                component: () => import('../views/member/UserList.vue'),
                meta: { title: '用户管理' }
            },
            {
                path: 'distribution',
                name: 'DistributorList',
                component: () => import('../views/member/DistributorList.vue'),
                meta: { title: '分销中心' }
            },
            {
                path: 'dealers',
                name: 'DealerList',
                component: () => import('../views/member/DealerList.vue'),
                meta: { title: '经销商中心' }
            },
            {
                path: 'banners',
                name: 'BannerList',
                component: () => import('../views/content/BannerList.vue'),
                meta: { title: '轮播图管理' }
            },
            {
                path: 'materials',
                name: 'MaterialList',
                component: () => import('../views/content/MaterialList.vue'),
                meta: { title: '素材库' }
            },
            {
                path: 'contents',
                name: 'ArticleList',
                component: () => import('../views/content/ArticleList.vue'),
                meta: { title: '图文管理' }
            },
            {
                path: 'withdrawals',
                name: 'WithdrawalList',
                component: () => import('../views/finance/WithdrawalList.vue'),
                meta: { title: '提现管理' }
            },
            {
                path: 'commissions',
                name: 'CommissionList',
                component: () => import('../views/finance/CommissionList.vue'),
                meta: { title: '佣金记录' }
            },
            {
                path: 'settings',
                name: 'Settings',
                component: () => import('../views/system/Settings.vue'),
                meta: { title: '系统设置' }
            },
            {
                path: 'admins',
                name: 'AdminList',
                component: () => import('../views/system/AdminList.vue'),
                meta: { title: '管理员管理' }
            }
        ]
    }
]

const router = createRouter({
    history: createWebHashHistory(), // Use Hash mode for simpler deployment relative to base
    routes
})

router.beforeEach((to, from, next) => {
    const token = localStorage.getItem('token')
    if (to.path !== '/login' && !token) {
        next('/login')
    } else {
        next()
    }
})

export default router
