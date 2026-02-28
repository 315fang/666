<template>
  <div class="admin-layout">
    <!-- ===== 侧边栏 ===== -->
    <aside :class="['sidebar', { 'is-collapsed': isCollapse }]">
      <!-- Logo -->
      <div class="sidebar-logo">
        <div class="logo-icon">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <transition name="logo-text">
          <span v-if="!isCollapse" class="logo-text">S2B2C 管理台</span>
        </transition>
      </div>

      <!-- 导航菜单 -->
      <nav class="sidebar-nav">
        <template v-for="(group, groupName) in groupedMenuItems" :key="groupName">
          <!-- 分组标签 -->
          <div v-if="!isCollapse" class="nav-group-label">{{ groupName }}</div>

          <!-- 菜单项 -->
          <router-link
            v-for="item in group"
            :key="item.path"
            :to="item.path"
            custom
            v-slot="{ href, navigate, isActive }"
          >
            <a
              :href="href"
              @click="navigate"
              :class="['nav-item', { 'is-active': isActive }]"
              :title="isCollapse ? item.title : ''"
            >
              <el-icon class="nav-icon"><component :is="item.icon" /></el-icon>
              <transition name="nav-label">
                <span v-if="!isCollapse" class="nav-label">{{ item.title }}</span>
              </transition>
              <span v-if="isActive && !isCollapse" class="active-indicator" />
            </a>
          </router-link>
        </template>
      </nav>

      <!-- 底部折叠按钮 -->
      <button class="collapse-btn" @click="toggleCollapse" :title="isCollapse ? '展开菜单' : '收起菜单'">
        <el-icon>
          <component :is="isCollapse ? 'Expand' : 'Fold'" />
        </el-icon>
        <transition name="nav-label">
          <span v-if="!isCollapse">收起菜单</span>
        </transition>
      </button>
    </aside>

    <!-- ===== 主内容区 ===== -->
    <div class="main-wrapper">
      <!-- 顶部导航 -->
      <header class="topbar">
        <!-- 面包屑 -->
        <div class="topbar-left">
          <el-breadcrumb separator="/">
            <el-breadcrumb-item :to="{ path: '/' }">首页</el-breadcrumb-item>
            <el-breadcrumb-item v-if="currentTitle">{{ currentTitle }}</el-breadcrumb-item>
          </el-breadcrumb>
        </div>

        <!-- 右侧操作区 -->
        <div class="topbar-right">
          <!-- 通知 -->
          <button class="icon-btn" title="通知">
            <el-icon><Bell /></el-icon>
          </button>

          <!-- 用户信息 -->
          <el-dropdown @command="handleCommand" trigger="click">
            <div class="user-avatar">
              <div class="avatar-circle">
                {{ (userStore.username || 'A').charAt(0).toUpperCase() }}
              </div>
              <div class="user-meta">
                <span class="user-name">{{ userStore.username }}</span>
                <span class="user-role">管理员</span>
              </div>
              <el-icon class="chevron"><ArrowDown /></el-icon>
            </div>
            <template #dropdown>
              <el-dropdown-menu class="user-dropdown">
                <el-dropdown-item command="profile" disabled>
                  <el-icon><User /></el-icon>个人资料
                </el-dropdown-item>
                <el-dropdown-item command="password">
                  <el-icon><Lock /></el-icon>修改密码
                </el-dropdown-item>
                <el-dropdown-item command="logout" divided>
                  <el-icon><SwitchButton /></el-icon>退出登录
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </header>

      <!-- 页面内容 -->
      <main class="page-content">
        <router-view v-slot="{ Component }">
          <transition name="page" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>
    </div>

    <!-- ===== 修改密码对话框 ===== -->
    <el-dialog
      v-model="passwordDialogVisible"
      title="修改密码"
      width="480px"
      :close-on-click-modal="false"
    >
      <el-form
        :model="passwordForm"
        :rules="passwordRules"
        ref="passwordFormRef"
        label-width="90px"
        status-icon
      >
        <el-form-item label="原密码" prop="oldPassword">
          <el-input
            v-model="passwordForm.oldPassword"
            type="password"
            show-password
            placeholder="请输入原密码"
          />
        </el-form-item>
        <el-form-item label="新密码" prop="newPassword">
          <el-input
            v-model="passwordForm.newPassword"
            type="password"
            show-password
            placeholder="至少8位，包含大小写字母和数字"
          />
        </el-form-item>
        <el-form-item label="确认密码" prop="confirmPassword">
          <el-input
            v-model="passwordForm.confirmPassword"
            type="password"
            show-password
            placeholder="再次输入新密码"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="passwordDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handlePasswordSubmit" :loading="changingPwd">
          确认修改
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useUserStore } from '@/store/user'
import { ElMessage, ElMessageBox } from 'element-plus'
import { changePassword } from '@/api'
import request from '@/utils/request'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()

const isCollapse = ref(false)
const passwordDialogVisible = ref(false)
const passwordFormRef = ref()
const changingPwd = ref(false)

const passwordForm = ref({ oldPassword: '', newPassword: '', confirmPassword: '' })

const passwordRules = {
  oldPassword: [{ required: true, message: '请输入原密码', trigger: 'blur' }],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 8, message: '密码长度不能小于8位', trigger: 'blur' },
    {
      pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/,
      message: '密码必须包含大小写字母和数字',
      trigger: 'blur'
    }
  ],
  confirmPassword: [
    { required: true, message: '请确认新密码', trigger: 'blur' },
    {
      validator: (rule, value, callback) => {
        if (value !== passwordForm.value.newPassword) {
          callback(new Error('两次输入的密码不一致'))
        } else {
          callback()
        }
      },
      trigger: 'blur'
    }
  ]
}

const menuItems = computed(() => {
  const children = router.options.routes.find(r => r.path === '/')?.children || []
  return children
    .filter(item => item.meta?.title)
    .map(item => ({
      path: '/' + item.path,
      title: item.meta.title,
      icon: item.meta.icon,
      group: item.meta.group || '其他'
    }))
})

const groupedMenuItems = computed(() => {
  const groups = {}
  for (const item of menuItems.value) {
    if (!groups[item.group]) groups[item.group] = []
    groups[item.group].push(item)
  }
  return groups
})

const currentTitle = computed(() => route.meta?.title || '')

const toggleCollapse = () => { isCollapse.value = !isCollapse.value }

const handleCommand = async (command) => {
  if (command === 'logout') {
    try {
      await ElMessageBox.confirm('确认退出登录？', '退出确认', {
        confirmButtonText: '确认退出',
        cancelButtonText: '取消',
        type: 'warning'
      })
      // 调用注销接口
      try {
        await request({ url: '/logout', method: 'post', baseURL: '/admin/api' })
      } catch (e) { /* 忽略注销接口错误，继续清除本地状态 */ }
      userStore.logout()
      router.push('/login')
      ElMessage.success('已安全退出')
    } catch (e) { /* 取消操作 */ }
  } else if (command === 'password') {
    passwordForm.value = { oldPassword: '', newPassword: '', confirmPassword: '' }
    passwordDialogVisible.value = true
  }
}

const handlePasswordSubmit = async () => {
  if (!passwordFormRef.value) return
  await passwordFormRef.value.validate(async (valid) => {
    if (!valid) return
    changingPwd.value = true
    try {
      await changePassword({
        old_password: passwordForm.value.oldPassword,
        new_password: passwordForm.value.newPassword
      })
      ElMessage.success('密码修改成功，请使用新密码重新登录')
      passwordDialogVisible.value = false
      userStore.logout()
      router.push('/login')
    } catch (e) {
      console.error('修改密码失败:', e)
    } finally {
      changingPwd.value = false
    }
  })
}
</script>

<style scoped>
/* ============================================================
   CSS 设计令牌（Enterprise Gateway 暗色主题）
   参考: ui-ux-pro-max 设计系统推荐
============================================================ */
.admin-layout {
  --sidebar-bg: #0F172A;
  --sidebar-border: rgba(148, 163, 184, 0.08);
  --sidebar-w: 228px;
  --sidebar-w-collapsed: 64px;
  --topbar-h: 56px;
  --nav-item-active-bg: rgba(99, 102, 241, 0.15);
  --nav-item-active-color: #818CF8;
  --nav-item-hover-bg: rgba(148, 163, 184, 0.08);
  --nav-text: #94A3B8;
  --nav-text-hover: #E2E8F0;
  --accent: #6366F1;
  --accent-glow: rgba(99, 102, 241, 0.4);
  --page-bg: #F8FAFC;

  display: flex;
  height: 100vh;
  overflow: hidden;
  font-family: 'Plus Jakarta Sans', 'PingFang SC', sans-serif;
}

/* ===== 侧边栏 ===== */
.sidebar {
  width: var(--sidebar-w);
  min-height: 100vh;
  background: var(--sidebar-bg);
  border-right: 1px solid var(--sidebar-border);
  display: flex;
  flex-direction: column;
  transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  flex-shrink: 0;
  position: relative;
  z-index: 10;
}

.sidebar.is-collapsed {
  width: var(--sidebar-w-collapsed);
}

/* Logo */
.sidebar-logo {
  height: var(--topbar-h);
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 16px;
  border-bottom: 1px solid var(--sidebar-border);
  overflow: hidden;
  flex-shrink: 0;
}

.logo-icon {
  width: 32px;
  height: 32px;
  background: linear-gradient(135deg, var(--accent) 0%, #8B5CF6 100%);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  flex-shrink: 0;
  box-shadow: 0 0 16px var(--accent-glow);
}

.logo-icon svg {
  width: 18px;
  height: 18px;
}

.logo-text {
  font-size: 15px;
  font-weight: 700;
  color: #E2E8F0;
  white-space: nowrap;
  letter-spacing: -0.01em;
}

/* 导航 */
.sidebar-nav {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 12px 8px;
  scrollbar-width: thin;
  scrollbar-color: rgba(148,163,184,0.1) transparent;
}

.nav-group-label {
  padding: 10px 10px 4px;
  font-size: 10.5px;
  font-weight: 600;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  white-space: nowrap;
  overflow: hidden;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: 8px;
  color: var(--nav-text);
  text-decoration: none;
  font-size: 13.5px;
  font-weight: 500;
  margin-bottom: 2px;
  transition: all 0.15s ease;
  position: relative;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
}

.nav-item:hover {
  background: var(--nav-item-hover-bg);
  color: var(--nav-text-hover);
}

.nav-item.is-active {
  background: var(--nav-item-active-bg);
  color: var(--nav-item-active-color);
}

.nav-item.is-active .nav-icon {
  color: var(--nav-item-active-color);
}

.nav-icon {
  font-size: 17px;
  flex-shrink: 0;
  transition: color 0.15s;
}

.nav-label {
  white-space: nowrap;
}

.active-indicator {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 60%;
  background: var(--accent);
  border-radius: 3px 0 0 3px;
  box-shadow: 0 0 8px var(--accent);
}

/* 折叠按钮 */
.collapse-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 20px;
  color: #475569;
  font-size: 13px;
  border: none;
  background: transparent;
  border-top: 1px solid var(--sidebar-border);
  cursor: pointer;
  transition: all 0.15s;
  text-align: left;
  width: 100%;
  overflow: hidden;
  white-space: nowrap;
}

.collapse-btn:hover {
  color: var(--nav-text);
  background: var(--nav-item-hover-bg);
}

.collapse-btn .el-icon {
  font-size: 17px;
  flex-shrink: 0;
}

/* ===== 主内容区 ===== */
.main-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--page-bg);
}

/* Topbar */
.topbar {
  height: var(--topbar-h);
  background: white;
  border-bottom: 1px solid #E2E8F0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  flex-shrink: 0;
  gap: 16px;
}

.topbar-left {
  flex: 1;
  min-width: 0;
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.icon-btn {
  width: 36px;
  height: 36px;
  border: none;
  background: transparent;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #64748B;
  font-size: 18px;
  cursor: pointer;
  transition: all 0.15s;
}

.icon-btn:hover {
  background: #F1F5F9;
  color: #1E293B;
}

.user-avatar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 12px 6px 6px;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s;
  border: 1px solid transparent;
}

.user-avatar:hover {
  background: #F8FAFC;
  border-color: #E2E8F0;
}

.avatar-circle {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--accent) 0%, #8B5CF6 100%);
  color: white;
  font-size: 14px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 2px 8px var(--accent-glow);
}

.user-meta {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.user-name {
  font-size: 13px;
  font-weight: 600;
  color: #1E293B;
  line-height: 1.3;
}

.user-role {
  font-size: 11px;
  color: #94A3B8;
  line-height: 1.2;
}

.chevron {
  font-size: 13px;
  color: #94A3B8;
  transition: transform 0.2s;
}

/* 页面内容 */
.page-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

/* ===== 动画 ===== */
.logo-text-enter-active,
.logo-text-leave-active,
.nav-label-enter-active,
.nav-label-leave-active {
  transition: opacity 0.15s, width 0.25s;
  overflow: hidden;
}

.logo-text-enter-from,
.logo-text-leave-to,
.nav-label-enter-from,
.nav-label-leave-to {
  opacity: 0;
  width: 0;
}

.page-enter-active,
.page-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}

.page-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.page-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

/* ===== 用户下拉样式覆盖 ===== */
:deep(.user-dropdown .el-dropdown-menu__item) {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

/* ===== 滚动条美化 ===== */
.sidebar-nav::-webkit-scrollbar {
  width: 4px;
}
.sidebar-nav::-webkit-scrollbar-track {
  background: transparent;
}
.sidebar-nav::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.12);
  border-radius: 4px;
}
.sidebar-nav::-webkit-scrollbar-thumb:hover {
  background: rgba(148, 163, 184, 0.25);
}
</style>
