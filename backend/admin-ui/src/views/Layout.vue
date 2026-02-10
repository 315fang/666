<template>
  <el-container class="layout-container">
    <el-aside width="220px" class="sidebar">
      <div class="logo">臻选 S2B2C 后台</div>
      <el-menu
        :default-active="activeMenu"
        background-color="#304156"
        text-color="#bfcbd9"
        active-text-color="#409EFF"
        router
        class="el-menu-vertical"
      >
        <el-menu-item index="/dashboard">
          <el-icon><Odometer /></el-icon>
          <span>经营概览</span>
        </el-menu-item>

        <el-sub-menu index="product">
            <template #title>
                <el-icon><Goods /></el-icon>
                <span>商品管理</span>
            </template>
            <el-menu-item index="/products">商品列表</el-menu-item>
            <el-menu-item index="/categories">类目管理</el-menu-item>
        </el-sub-menu>

        <el-sub-menu index="order">
            <template #title>
                <el-icon><List /></el-icon>
                <span>订单管理</span>
            </template>
            <el-menu-item index="/orders">订单列表</el-menu-item>
            <el-menu-item index="/refunds">售后处理</el-menu-item>
        </el-sub-menu>

        <el-sub-menu index="member">
            <template #title>
                <el-icon><User /></el-icon>
                <span>会员中心</span>
            </template>
            <el-menu-item index="/users">用户管理</el-menu-item>
            <el-menu-item index="/distribution">分销中心</el-menu-item>
            <el-menu-item index="/dealers">经销商中心</el-menu-item>
        </el-sub-menu>

        <el-sub-menu index="content">
            <template #title>
                <el-icon><Picture /></el-icon>
                <span>内容管理</span>
            </template>
            <el-menu-item index="/banners">轮播图</el-menu-item>
            <el-menu-item index="/materials">素材库</el-menu-item>
            <el-menu-item index="/contents">图文管理</el-menu-item>
        </el-sub-menu>

        <el-sub-menu index="finance">
            <template #title>
                <el-icon><Money /></el-icon>
                <span>财务管理</span>
            </template>
            <el-menu-item index="/withdrawals">提现审核</el-menu-item>
            <el-menu-item index="/commissions">佣金记录</el-menu-item>
        </el-sub-menu>

        <el-sub-menu index="system">
            <template #title>
                <el-icon><Setting /></el-icon>
                <span>系统管理</span>
            </template>
            <el-menu-item index="/settings">系统设置</el-menu-item>
            <el-menu-item index="/admins">管理员列表</el-menu-item>
        </el-sub-menu>
      </el-menu>
    </el-aside>

    <el-container>
      <el-header>
        <div class="breadcrumb">
            <!-- Add Breadcrumb here if needed -->
        </div>
        <div class="right-menu">
            <span style="margin-right: 15px; color: #666;">
                <el-icon style="vertical-align: middle; margin-right: 5px;"><UserFilled /></el-icon>
                {{ username }}
            </span>
            <el-button type="text" @click="handleLogout">退出登录</el-button>
        </div>
      </el-header>
      <el-main>
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const username = ref('Admin') // Get from store/localStorage

const userStr = localStorage.getItem('user')
if (userStr) {
    try {
        const user = JSON.parse(userStr)
        username.value = user.username || user.nickname || 'Admin'
    } catch(e) {}
}

const activeMenu = computed(() => {
    return route.path
})

const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    router.push('/login')
}
</script>

<style scoped>
.layout-container {
    height: 100vh;
}
.sidebar {
    background-color: #304156;
    overflow-x: hidden;
}
.el-menu-vertical {
    border-right: none;
}
.logo {
    height: 60px;
    line-height: 60px;
    text-align: center;
    color: #fff;
    background-color: #2b2f3a;
    font-weight: bold;
    font-size: 16px;
    letter-spacing: 2px;
}
.right-menu {
    display: flex;
    align-items: center;
}
</style>
