import axios from 'axios'
import { ElMessage } from 'element-plus'
import router from '@/router'

const localAdminProxyTarget = String(import.meta.env.VITE_ADMIN_DEV_PROXY_TARGET || 'http://127.0.0.1:3001').replace(/\/$/, '')
const localDirectAdminApiBaseURL = `${localAdminProxyTarget}/admin/api`

function isLocalRuntime() {
  if (typeof window === 'undefined') return false
  const { protocol, hostname } = window.location
  return protocol === 'file:' || ['localhost', '127.0.0.1', '::1'].includes(hostname)
}

function isLoginRequestUrl(url) {
  return typeof url === 'string' && url.includes('/login')
}

function getRequestDebugUrl(config = {}) {
  const baseURL = config.baseURL || ''
  const url = config.url || ''
  return `${baseURL}${url}`
}

function getCloudBaseHostedAdminApiBaseURL() {
  if (typeof window === 'undefined') return ''

  const cloudBaseHostingSuffix = '.tcloudbaseapp.com'
  const { hostname } = window.location
  if (!hostname.endsWith(cloudBaseHostingSuffix)) return ''

  const hostedSiteId = hostname.slice(0, -cloudBaseHostingSuffix.length)
  const envId = hostedSiteId.replace(/-\d+$/, '')
  if (!envId || envId === hostedSiteId) return ''

  return `https://${envId}.service.tcloudbase.com/admin/api`
}

const cloudBaseHostedAdminApiBaseURL = getCloudBaseHostedAdminApiBaseURL()
const resolvedAdminApiBaseURL =
  import.meta.env.VITE_ADMIN_API_BASE_URL ||
  cloudBaseHostedAdminApiBaseURL ||
  '/admin/api'

const request = axios.create({
  baseURL: resolvedAdminApiBaseURL,
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
      const isLoginRequest = isLoginRequestUrl(reqUrl)

      // 本地直接打开 dist 或使用无代理静态服务时，请求会落到错误服务并返回 404。
      // 登录接口在真实后端存在，此处仅对登录请求做一次本地直连回退。
      if (
        status === 404 &&
        isLoginRequest &&
        isLocalRuntime() &&
        !error.config?._retriedWithLocalAdminApi &&
        (error.config?.baseURL || request.defaults.baseURL) !== localDirectAdminApiBaseURL
      ) {
        const retryConfig = {
          ...error.config,
          baseURL: localDirectAdminApiBaseURL,
          _retriedWithLocalAdminApi: true
        }
        console.warn(
          `[admin-api] login 404 from ${getRequestDebugUrl(error.config)}; retrying ${getRequestDebugUrl(retryConfig)}`
        )
        return request.request(retryConfig)
      }
      
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
          if (isLoginRequest) {
            ElMessage.error(`登录接口不存在：${getRequestDebugUrl(error.config)}。请确认当前页面由后端服务托管，或将 VITE_ADMIN_API_BASE_URL 指向正确后端。`)
            console.error('[admin-api] login endpoint 404', {
              requestUrl: getRequestDebugUrl(error.config),
              fallbackTarget: localDirectAdminApiBaseURL,
              cloudbaseHostedTarget: cloudBaseHostedAdminApiBaseURL
            })
            break
          }
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
