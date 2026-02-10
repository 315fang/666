import axios from 'axios'
import { ElMessage } from 'element-plus'

const instance = axios.create({
    baseURL: '/admin/api', // Proxied by Vite to http://localhost:3000/admin/api
    timeout: 5000
})

// Request Interceptor
instance.interceptors.request.use(
    config => {
        const token = localStorage.getItem('token')
        if (token) {
            config.headers['Authorization'] = `Bearer ${token}`
        }
        return config
    },
    error => {
        return Promise.reject(error)
    }
)

// Response Interceptor
instance.interceptors.response.use(
    response => {
        const res = response.data
        if (res.code !== 0) {
            ElMessage.error(res.message || 'Error')

            // Handle token expiration
            if (res.code === 401) {
                localStorage.removeItem('token')
                localStorage.removeItem('user')
                window.location.href = '/admin/#/login'
            }
            return Promise.reject(new Error(res.message || 'Error'))
        }
        return res.data
    },
    error => {
        ElMessage.error(error.message || 'Request Failed')
        return Promise.reject(error)
    }
)

export default instance
