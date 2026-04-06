import axios from 'axios'
import { ElMessage } from 'element-plus'
import router from '@/router'

const request = axios.create({
  baseURL: '/admin/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
})

// 请求拦截器
request.interceptors.request.use(
  config => {
    const token = localStorage.getItem('admin_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  error => {
    console.error('请求错误:', error)
    return Promise.reject(error)
  }
)

// 响应拦截器
request.interceptors.response.use(
  response => {
    // 文件导出等二进制响应直接透传
    if (response.config?.responseType === 'blob') {
      return response.data
    }

    const { code, message, data, geocode_note: geocodeNote } = response.data

    // 后端返回的成功状态码为 0
    if (code === 0) {
      if (geocodeNote != null && data != null && typeof data === 'object' && !Array.isArray(data)) {
        return { ...data, geocode_note: geocodeNote }
      }
      return data
    } else {
      ElMessage.error(message || '请求失败')
      return Promise.reject(new Error(message || '请求失败'))
    }
  },
  error => {
    if (error.response) {
      const { status, data } = error.response
      const reqUrl = error.config?.url || ''
      const isLoginRequest = typeof reqUrl === 'string' && reqUrl.includes('/login')
      
      switch (status) {
        case 401:
          // 登录接口的 401 多为账号/密码错误，不应提示“登录已过期”
          if (isLoginRequest) {
            ElMessage.error(data?.message || '用户名或密码错误')
            break
          }
          ElMessage.error(data?.message || '登录已过期，请重新登录')
          localStorage.removeItem('admin_token')
          localStorage.removeItem('admin_info')
          router.push('/login')
          break
        case 403:
          ElMessage.error('没有权限访问')
          break
        case 404:
          ElMessage.error('请求的资源不存在')
          break
        case 500:
          ElMessage.error(data?.message || '服务器错误')
          break
        default:
          ElMessage.error(data?.message || '请求失败')
      }
    } else if (error.message.includes('timeout')) {
      ElMessage.error('请求超时，请稍后重试')
    } else if (error.message.includes('Network Error')) {
      ElMessage.error('网络错误，请检查网络连接')
    } else {
      ElMessage.error(error.message || '未知错误')
    }
    
    return Promise.reject(error)
  }
)

export default request
