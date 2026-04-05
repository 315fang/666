<template>
  <div class="login-page">
    <!-- 左侧品牌区 -->
    <div class="brand-panel">
      <div class="brand-content">
        <div class="brand-logo">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <h1 class="brand-name">S2B2C 管理台</h1>
        <p class="brand-desc">数字化加盟系统后台管理平台</p>

        <div class="feature-list">
          <div class="feature-item">
            <div class="feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
            </div>
            <div>
              <div class="feature-title">企业级安全</div>
              <div class="feature-sub">JWT 认证 + Token 黑名单 + 操作日志</div>
            </div>
          </div>
          <div class="feature-item">
            <div class="feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
            </div>
            <div>
              <div class="feature-title">全面数据管理</div>
              <div class="feature-sub">77% 控制器 UI 覆盖，17 个管理模块</div>
            </div>
          </div>
          <div class="feature-item">
            <div class="feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
            </div>
            <div>
              <div class="feature-title">实时生效配置</div>
              <div class="feature-sub">数据库热更新，无需重启服务</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 装饰背景 -->
      <div class="orb orb-1"></div>
      <div class="orb orb-2"></div>
      <div class="grid-bg"></div>
    </div>

    <!-- 右侧登录表单 -->
    <div class="form-panel">
      <div class="form-card">
        <div class="form-header">
          <h2>欢迎回来</h2>
          <p>请使用管理员账号登录</p>
        </div>

        <el-form
          ref="loginFormRef"
          :model="loginForm"
          :rules="rules"
          class="login-form"
          @submit.prevent="handleLogin"
        >
          <el-form-item prop="username">
            <label class="field-label">用户名</label>
            <el-input
              v-model="loginForm.username"
              placeholder="请输入管理员用户名"
              size="large"
              :prefix-icon="userIcon"
              clearable
            />
          </el-form-item>

          <el-form-item prop="password">
            <label class="field-label">密码</label>
            <el-input
              v-model="loginForm.password"
              type="password"
              placeholder="请输入密码"
              size="large"
              :prefix-icon="lockIcon"
              show-password
              @keyup.enter="handleLogin"
            />
          </el-form-item>

          <button
            class="login-btn"
            @click="handleLogin"
            :disabled="loading"
            type="button"
          >
            <span v-if="!loading">登 录</span>
            <span v-else class="loading-dots">
              <span></span><span></span><span></span>
            </span>
          </button>
        </el-form>

        <div class="login-footer">
          <span>如需帮助，请联系系统管理员</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, h } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/store/user'
import { ElMessage } from 'element-plus'

// 内联 SVG 图标组件（避免引入 emoji 或 emits 问题）
const userIcon = () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, width: 16, height: 16 }, [
  h('path', { d: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2' }),
  h('circle', { cx: 12, cy: 7, r: 4 })
])

const lockIcon = () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, width: 16, height: 16 }, [
  h('rect', { x: 3, y: 11, width: 18, height: 11, rx: 2, ry: 2 }),
  h('path', { d: 'M7 11V7a5 5 0 0110 0v4' })
])

const router = useRouter()
const userStore = useUserStore()

const loginFormRef = ref()
const loading = ref(false)

const loginForm = reactive({ username: '', password: '' })

const rules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
}

const handleLogin = async () => {
  if (!loginFormRef.value) return
  await loginFormRef.value.validate(async (valid) => {
    if (!valid) return
    loading.value = true
    try {
      await userStore.login(loginForm)
      ElMessage.success('登录成功')
      router.push('/')
    } catch (error) {
      console.error('登录失败:', error)
    } finally {
      loading.value = false
    }
  })
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  font-family: 'Plus Jakarta Sans', 'PingFang SC', sans-serif;
  background: #0F172A;
}

/* ===== 左侧品牌区 ===== */
.brand-panel {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  padding: 60px;
}

.brand-content {
  position: relative;
  z-index: 2;
  max-width: 420px;
}

.brand-logo {
  width: 56px;
  height: 56px;
  background: linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%);
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  margin-bottom: 24px;
  box-shadow: 0 0 32px rgba(99, 102, 241, 0.5);
}

.brand-logo svg {
  width: 28px;
  height: 28px;
}

.brand-name {
  font-size: 36px;
  font-weight: 800;
  color: #F1F5F9;
  letter-spacing: -0.02em;
  margin: 0 0 10px;
  line-height: 1.2;
}

.brand-desc {
  font-size: 15px;
  color: #64748B;
  margin: 0 0 48px;
}

.feature-list {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.feature-item {
  display: flex;
  align-items: center;
  gap: 16px;
}

.feature-icon {
  width: 40px;
  height: 40px;
  background: rgba(99, 102, 241, 0.12);
  border: 1px solid rgba(99, 102, 241, 0.2);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #818CF8;
  flex-shrink: 0;
}

.feature-icon svg {
  width: 18px;
  height: 18px;
}

.feature-title {
  font-size: 14px;
  font-weight: 600;
  color: #CBD5E1;
  margin-bottom: 2px;
}

.feature-sub {
  font-size: 12px;
  color: #475569;
}

/* 装饰 orb */
.orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(60px);
  pointer-events: none;
}

.orb-1 {
  width: 350px;
  height: 350px;
  background: rgba(99, 102, 241, 0.2);
  top: -80px;
  right: -80px;
}

.orb-2 {
  width: 250px;
  height: 250px;
  background: rgba(139, 92, 246, 0.15);
  bottom: 0;
  left: 40px;
}

.grid-bg {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(148, 163, 184, 0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(148, 163, 184, 0.04) 1px, transparent 1px);
  background-size: 48px 48px;
  pointer-events: none;
}

/* ===== 右侧表单区 ===== */
.form-panel {
  width: 460px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #F8FAFC;
  padding: 40px;
}

.form-card {
  width: 100%;
  max-width: 380px;
}

.form-header {
  margin-bottom: 36px;
}

.form-header h2 {
  font-size: 26px;
  font-weight: 700;
  color: #0F172A;
  letter-spacing: -0.02em;
  margin: 0 0 8px;
}

.form-header p {
  font-size: 14px;
  color: #64748B;
  margin: 0;
}

.field-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: #374151;
  margin-bottom: 6px;
}

:deep(.el-form-item) {
  margin-bottom: 20px;
}

:deep(.el-input__wrapper) {
  border-radius: 10px;
  box-shadow: 0 0 0 1px #E2E8F0 inset;
  padding: 4px 12px;
}

:deep(.el-input__wrapper:hover),
:deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 2px #6366F1 inset !important;
}

.login-btn {
  width: 100%;
  height: 46px;
  margin-top: 12px;
  background: linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%);
  color: white;
  border: none;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
  letter-spacing: 0.02em;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 20px rgba(99, 102, 241, 0.4);
}

.login-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 8px 28px rgba(99, 102, 241, 0.5);
}

.login-btn:active:not(:disabled) {
  transform: translateY(0);
}

.login-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

/* 加载动画 */
.loading-dots {
  display: flex;
  gap: 4px;
  align-items: center;
}

.loading-dots span {
  width: 6px;
  height: 6px;
  background: white;
  border-radius: 50%;
  animation: dot-bounce 1.2s infinite;
}

.loading-dots span:nth-child(2) { animation-delay: 0.2s; }
.loading-dots span:nth-child(3) { animation-delay: 0.4s; }

@keyframes dot-bounce {
  0%, 60%, 100% { transform: translateY(0); }
  30% { transform: translateY(-6px); }
}

.login-footer {
  margin-top: 24px;
  text-align: center;
  font-size: 12px;
  color: #94A3B8;
}

/* 响应式 */
@media (max-width: 768px) {
  .brand-panel { display: none; }
  .form-panel { width: 100%; }
}
</style>
