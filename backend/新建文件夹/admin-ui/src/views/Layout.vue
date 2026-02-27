<template>
  <el-container class="layout-container">
    <!-- Sidebar -->
    <el-aside width="260px" class="sidebar">
      <div class="logo-container">
        <div class="logo-icon">
          <el-icon :size="28"><Shop /></el-icon>
        </div>
        <div class="logo-text">臻选 S2B2C</div>
      </div>
      
      <el-menu
        :default-active="activeMenu"
        router
        class="sidebar-menu"
        background-color="transparent"
      >
        <el-menu-item index="/dashboard">
          <el-icon><Odometer /></el-icon>
          <span>全局数据大屏</span>
        </el-menu-item>

        <el-sub-menu index="finance">
          <template #title>
            <el-icon><Money /></el-icon>
            <span>佣金与财务中心</span>
          </template>
          <el-menu-item index="/commissions">
            <span>分销风控概览</span>
          </el-menu-item>
          <el-menu-item index="/withdrawals">
            <span>提现审批风控台</span>
          </el-menu-item>
        </el-sub-menu>

        <el-sub-menu index="ai-ops">
          <template #title>
            <el-icon><Warning /></el-icon>
            <span>AI 自动化运维</span>
          </template>
          <el-menu-item index="/ai-ops">
            <span>AIOps 巡检控制台</span>
          </el-menu-item>
          <el-menu-item index="/ai-console">
            <span>超管智能助手</span>
          </el-menu-item>
        </el-sub-menu>

        <el-sub-menu index="inventory">
          <template #title>
            <el-icon><Goods /></el-icon>
            <span>云库存与供应链</span>
          </template>
          <el-menu-item index="/products">
            <span>三维库存看板</span>
          </el-menu-item>
          <el-menu-item index="/orders">
            <span>订单智能调度</span>
          </el-menu-item>
          <el-menu-item index="/refunds">
            <span>售后处理</span>
          </el-menu-item>
        </el-sub-menu>
        
        <el-sub-menu index="system">
          <template #title>
            <el-icon><Setting /></el-icon>
            <span>系统与用户网</span>
          </template>
          <el-menu-item index="/users">
            <span>会员与代理网络</span>
          </el-menu-item>
          <el-menu-item index="/dealers">
            <span>经销商管理</span>
          </el-menu-item>
          <el-menu-item index="/db-indexes">
            <span>数据库索引</span>
          </el-menu-item>
        </el-sub-menu>
      </el-menu>
    </el-aside>

    <!-- Main Content -->
    <el-container class="main-wrapper">
      <!-- Header -->
      <el-header class="main-header">
        <div class="header-left">
          <el-breadcrumb separator="/">
            <el-breadcrumb-item :to="{ path: '/dashboard' }">首页</el-breadcrumb-item>
            <el-breadcrumb-item v-if="currentRoute.meta?.title">{{ currentRoute.meta.title }}</el-breadcrumb-item>
          </el-breadcrumb>
        </div>
        
        <div class="header-right">
          <el-tooltip content="全屏" placement="bottom">
            <el-button text circle @click="toggleFullscreen">
              <el-icon><FullScreen /></el-icon>
            </el-button>
          </el-tooltip>
          
          <el-dropdown trigger="click" @command="handleCommand">
            <div class="user-info">
              <el-avatar :size="36" :icon="UserFilled" class="user-avatar" />
              <span class="user-name">{{ username }}</span>
              <el-icon class="dropdown-icon"><ArrowDown /></el-icon>
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="profile">
                  <el-icon><User /></el-icon>
                  <span>个人中心</span>
                </el-dropdown-item>
                <el-dropdown-item command="settings">
                  <el-icon><Setting /></el-icon>
                  <span>系统设置</span>
                </el-dropdown-item>
                <el-dropdown-item divided command="logout">
                  <el-icon><SwitchButton /></el-icon>
                  <span>退出登录</span>
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>

      <!-- Page Content -->
      <el-main class="page-content">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { 
  Odometer, Goods, List, User, Picture, Money, Setting, 
  Monitor, Warning, InfoFilled, UserFilled, Shop, DataAnalysis,
  FullScreen, ArrowDown, SwitchButton 
} from '@element-plus/icons-vue'

const route = useRoute()
const router = useRouter()

const username = ref('Admin')
const currentRoute = computed(() => route)

// Get user info from localStorage
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

const toggleFullscreen = () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen()
  } else {
    document.exitFullscreen()
  }
}

const handleCommand = (command) => {
  switch (command) {
    case 'profile':
      ElMessage.info('个人中心功能开发中')
      break
    case 'settings':
      router.push('/settings')
      break
    case 'logout':
      ElMessageBox.confirm('确定要退出登录吗？', '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }).then(() => {
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        ElMessage.success('已退出登录')
        router.push('/login')
      }).catch(() => {})
      break
  }
}
</script>

<style scoped>
.layout-container {
  height: 100vh;
  background-color: var(--slate-50);
}

/* Sidebar Styling */
.sidebar {
  background-color: var(--slate-900);
  border-right: 1px solid var(--slate-800);
  display: flex;
  flex-direction: column;
  overflow-x: hidden;
  transition: width 0.3s ease;
}

.logo-container {
  height: 64px;
  display: flex;
  align-items: center;
  padding: 0 20px;
  border-bottom: 1px solid var(--slate-800);
  gap: 12px;
}

.logo-icon {
  width: 40px;
  height: 40px;
  background: linear-gradient(135deg, var(--primary-500) 0%, var(--primary-600) 100%);
  border-radius: var(--radius-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  box-shadow: var(--shadow-md);
}

.logo-text {
  font-size: 18px;
  font-weight: 700;
  background: linear-gradient(135deg, var(--primary-600) 0%, var(--primary-500) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  letter-spacing: 0.5px;
}

.sidebar-menu {
  flex: 1;
  padding: 12px 0;
  overflow-y: auto;
}

/* Main Wrapper */
.main-wrapper {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Header Styling */
.main-header {
  background-color: var(--slate-0);
  border-bottom: 1px solid var(--slate-200);
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
}

.header-left :deep(.el-breadcrumb__item) {
  font-size: 14px;
}

.header-left :deep(.el-breadcrumb__inner) {
  color: var(--slate-500);
  font-weight: 500;
}

.header-left :deep(.el-breadcrumb__item:last-child .el-breadcrumb__inner) {
  color: var(--slate-800);
  font-weight: 600;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 12px;
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: background-color var(--transition-fast);
}

.user-info:hover {
  background-color: var(--slate-100);
}

.user-avatar {
  background: linear-gradient(135deg, var(--primary-500) 0%, var(--primary-600) 100%);
  color: white;
  font-weight: 600;
}

.user-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--slate-700);
}

.dropdown-icon {
  color: var(--slate-400);
  font-size: 12px;
}

/* Page Content */
.page-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  background-color: var(--slate-50);
}

/* Page Transition */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Responsive */
@media (max-width: 768px) {
  .sidebar {
    width: 64px !important;
  }
  
  .logo-text,
  .user-name,
  .dropdown-icon {
    display: none;
  }
  
  .logo-container {
    justify-content: center;
    padding: 0;
  }
  
  .sidebar-menu :deep(.el-menu-item span),
  .sidebar-menu :deep(.el-sub-menu__title span) {
    display: none;
  }
  
  .sidebar-menu :deep(.el-sub-menu__icon-arrow) {
    display: none;
  }
}
</style>
