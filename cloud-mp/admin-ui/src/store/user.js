import { defineStore } from 'pinia'
import { login as loginApi, getAdminInfo, logout as logoutApi } from '@/api'
import { ADMIN_ROLE_PRESETS, normalizeAdminPermission } from '@/config/adminRolePresets'
import {
  clearStoredAdminSession,
  readStoredAdminInfo,
  readStoredAdminToken,
  writeStoredAdminInfo,
  writeStoredAdminSession
} from '@/utils/adminSession'

export const useUserStore = defineStore('user', {
  state: () => ({
    token: readStoredAdminToken(),
    userInfo: readStoredAdminInfo()
  }),

  getters: {
    isLoggedIn: (state) => !!state.token,
    username: (state) => state.userInfo.username || '',
    role: (state) => state.userInfo.role || '',
    isSuperAdmin: (state) => state.userInfo.role === 'super_admin',
    permissions(state) {
      if (state.userInfo.role === 'super_admin') return ['*']
      const roleBased = ADMIN_ROLE_PRESETS[state.userInfo.role] || []
      const custom = state.userInfo.permissions || []
      return [...new Set([...roleBased, ...custom].map(normalizeAdminPermission))]
    }
  },

  actions: {
    hasPermission(perm) {
      if (!perm) return true
      if (perm === 'super_admin') return this.isSuperAdmin
      if (this.permissions.includes('*')) return true
      return this.permissions.includes(perm)
    },

    clearSession() {
      this.token = ''
      this.userInfo = {}
      clearStoredAdminSession()
    },

    async login(loginForm) {
      const data = await loginApi(loginForm)
      this.token = data.token
      this.userInfo = data.admin

      writeStoredAdminSession(data.token, data.admin)

      return data
    },

    async getUserInfo() {
      const data = await getAdminInfo()
      this.userInfo = data
      writeStoredAdminInfo(data)
      return data
    },

    async logout() {
      try {
        await logoutApi()
      } catch (e) {
        // 即使后端注销失败，也继续清除本地状态
      }
      this.clearSession()
    }
  }
})
