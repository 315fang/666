import { defineStore } from 'pinia'
import { login as loginApi, getAdminInfo } from '@/api'

export const useUserStore = defineStore('user', {
  state: () => ({
    token: localStorage.getItem('admin_token') || '',
    userInfo: JSON.parse(localStorage.getItem('admin_info') || '{}')
  }),

  getters: {
    isLoggedIn: (state) => !!state.token,
    username: (state) => state.userInfo.username || '',
    role: (state) => state.userInfo.role || ''
  },

  actions: {
    async login(loginForm) {
      try {
        const data = await loginApi(loginForm)
        this.token = data.token
        this.userInfo = data.admin
        
        localStorage.setItem('admin_token', data.token)
        localStorage.setItem('admin_info', JSON.stringify(data.admin))
        
        return data
      } catch (error) {
        throw error
      }
    },

    async getUserInfo() {
      try {
        const data = await getAdminInfo()
        this.userInfo = data
        localStorage.setItem('admin_info', JSON.stringify(data))
        return data
      } catch (error) {
        throw error
      }
    },

    logout() {
      this.token = ''
      this.userInfo = {}
      localStorage.removeItem('admin_token')
      localStorage.removeItem('admin_info')
    }
  }
})
