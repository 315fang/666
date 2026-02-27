<template>
  <div class="login-page">
    <div class="login-wrapper">
      <!-- Left Side - Branding -->
      <div class="login-branding">
        <div class="branding-content">
          <div class="logo-section">
            <div class="logo-icon">
              <el-icon :size="48"><Shop /></el-icon>
            </div>
            <h1 class="brand-title">臻选 S2B2C</h1>
          </div>
          <p class="brand-desc">智能化的供应链管理平台<br>助力您的业务高效运营</p>
          
          <div class="feature-list">
            <div class="feature-item">
              <el-icon class="feature-icon"><CircleCheck /></el-icon>
              <span>全渠道订单管理</span>
            </div>
            <div class="feature-item">
              <el-icon class="feature-icon"><CircleCheck /></el-icon>
              <span>智能分销系统</span>
            </div>
            <div class="feature-item">
              <el-icon class="feature-icon"><CircleCheck /></el-icon>
              <span>实时数据分析</span>
            </div>
          </div>
        </div>
        
        <div class="branding-footer">
          <p>&copy; 2025 臻选科技. All rights reserved.</p>
        </div>
      </div>
      
      <!-- Right Side - Login Form -->
      <div class="login-form-section">
        <div class="form-wrapper">
          <div class="form-header">
            <h2 class="form-title">欢迎回来</h2>
            <p class="form-subtitle">请登录您的管理账号</p>
          </div>
          
          <el-form 
            :model="loginForm" 
            :rules="rules" 
            ref="loginFormRef" 
            class="login-form"
            @keyup.enter="handleLogin"
          >
            <el-form-item prop="username">
              <el-input 
                v-model="loginForm.username" 
                placeholder="请输入用户名"
                size="large"
                :prefix-icon="User"
                class="login-input"
              />
            </el-form-item>
            
            <el-form-item prop="password">
              <el-input 
                v-model="loginForm.password" 
                type="password" 
                placeholder="请输入密码"
                size="large"
                :prefix-icon="Lock"
                show-password
                class="login-input"
              />
            </el-form-item>
            
            <el-form-item>
              <el-button 
                type="primary" 
                :loading="loading" 
                class="login-button"
                size="large"
                @click="handleLogin"
              >
                登录
              </el-button>
            </el-form-item>
          </el-form>
          
          <div class="form-footer">
            <el-checkbox v-model="rememberMe">记住我</el-checkbox>
            <el-link type="primary" :underline="false">忘记密码？</el-link>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { login } from '@/api/auth'
import { User, Lock, Shop, CircleCheck } from '@element-plus/icons-vue'

const router = useRouter()
const loginFormRef = ref(null)
const loading = ref(false)
const rememberMe = ref(false)

const loginForm = reactive({
  username: '',
  password: ''
})

const rules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '密码长度不能少于6位', trigger: 'blur' }
  ]
}

const handleLogin = () => {
  loginFormRef.value.validate(async (valid) => {
    if (valid) {
      loading.value = true
      try {
        const res = await login(loginForm)
        localStorage.setItem('token', res.token)
        localStorage.setItem('user', JSON.stringify(res.user))
        
        if (rememberMe.value) {
          localStorage.setItem('remember_username', loginForm.username)
        } else {
          localStorage.removeItem('remember_username')
        }
        
        ElMessage.success('登录成功')
        router.push('/')
      } catch (error) {
        console.error(error)
      } finally {
        loading.value = false
      }
    }
  })
}

onMounted(() => {
  const rememberedUsername = localStorage.getItem('remember_username')
  if (rememberedUsername) {
    loginForm.username = rememberedUsername
    rememberMe.value = true
  }
})
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  background-color: var(--slate-50);
}

.login-wrapper {
  display: flex;
  width: 100%;
  min-height: 100vh;
}

/* Left Side - Branding */
.login-branding {
  flex: 1;
  background: linear-gradient(135deg, var(--primary-600) 0%, var(--primary-700) 50%, #3730a3 100%);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 60px;
  color: white;
  position: relative;
  overflow: hidden;
}

.login-branding::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.03'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E");
  opacity: 0.1;
}

.branding-content {
  position: relative;
  z-index: 1;
}

.logo-section {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 40px;
}

.logo-icon {
  width: 64px;
  height: 64px;
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(10px);
  border-radius: var(--radius-xl);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.brand-title {
  font-size: 36px;
  font-weight: 700;
  margin: 0;
  letter-spacing: 1px;
}

.brand-desc {
  font-size: 18px;
  line-height: 1.6;
  margin-bottom: 48px;
  opacity: 0.9;
}

.feature-list {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.feature-item {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 16px;
  opacity: 0.9;
}

.feature-icon {
  font-size: 20px;
  color: #34d399;
}

.branding-footer {
  position: relative;
  z-index: 1;
  font-size: 13px;
  opacity: 0.6;
}

.branding-footer p {
  margin: 0;
}

/* Right Side - Login Form */
.login-form-section {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
  background-color: white;
}

.form-wrapper {
  width: 100%;
  max-width: 420px;
}

.form-header {
  text-align: center;
  margin-bottom: 40px;
}

.form-title {
  font-size: 28px;
  font-weight: 700;
  color: var(--slate-800);
  margin: 0 0 8px 0;
}

.form-subtitle {
  font-size: 15px;
  color: var(--slate-500);
  margin: 0;
}

.login-form {
  margin-bottom: 24px;
}

.login-form :deep(.el-form-item) {
  margin-bottom: 20px;
}

.login-form :deep(.el-form-item:last-child) {
  margin-bottom: 0;
  margin-top: 28px;
}

.login-input :deep(.el-input__wrapper) {
  border-radius: var(--radius-lg);
  padding: 8px 16px;
  box-shadow: 0 0 0 1px var(--slate-200) inset;
}

.login-input :deep(.el-input__wrapper:hover) {
  box-shadow: 0 0 0 1px var(--slate-300) inset;
}

.login-input :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px var(--primary-500) inset;
}

.login-input :deep(.el-input__inner) {
  font-size: 15px;
  height: 24px;
}

.login-button {
  width: 100%;
  height: 48px;
  font-size: 16px;
  font-weight: 600;
  border-radius: var(--radius-lg);
  background: linear-gradient(135deg, var(--primary-600) 0%, var(--primary-700) 100%);
  border: none;
  box-shadow: 0 4px 12px rgba(79, 70, 229, 0.4);
  transition: all 0.3s ease;
}

.login-button:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(79, 70, 229, 0.5);
}

.login-button:active {
  transform: translateY(0);
}

.form-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.form-footer :deep(.el-checkbox__label) {
  font-size: 14px;
  color: var(--slate-600);
}

/* Responsive */
@media (max-width: 992px) {
  .login-branding {
    display: none;
  }
  
  .login-form-section {
    padding: 24px;
  }
  
  .form-wrapper {
    max-width: 100%;
  }
}

@media (max-width: 480px) {
  .login-form-section {
    padding: 20px;
  }
  
  .form-title {
    font-size: 24px;
  }
}
</style>
