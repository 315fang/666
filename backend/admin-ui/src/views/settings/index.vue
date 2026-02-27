<template>
  <div class="settings-page">
    <el-card>
      <template #header>
        系统设置
      </template>

      <el-tabs v-model="activeTab">
        <!-- 基本信息 -->
        <el-tab-pane label="基本信息" name="basic">
          <el-descriptions :column="2" border>
            <el-descriptions-item label="系统名称">
              S2B2C 数字加盟系统
            </el-descriptions-item>
            <el-descriptions-item label="系统版本">
              v1.0.0
            </el-descriptions-item>
            <el-descriptions-item label="运行环境">
              Node.js + MySQL
            </el-descriptions-item>
            <el-descriptions-item label="服务状态">
              <el-tag type="success" v-if="systemStatus.status === 'ok'">运行中</el-tag>
              <el-tag type="danger" v-else>异常</el-tag>
            </el-descriptions-item>
          </el-descriptions>
        </el-tab-pane>

        <!-- 系统配置 -->
        <el-tab-pane label="系统配置" name="config">
          <el-form
            :model="settingsForm"
            label-width="160px"
            style="max-width: 700px;"
            v-loading="settingsLoading"
          >
            <el-divider content-position="left">分销设置</el-divider>
            <el-form-item label="分销佣金比例 (%)">
              <el-input-number v-model="settingsForm.commission_rate" :min="0" :max="100" :step="0.5" :precision="1" />
            </el-form-item>
            <el-form-item label="提现最低金额 (元)">
              <el-input-number v-model="settingsForm.min_withdrawal" :min="1" :step="10" />
            </el-form-item>
            <el-form-item label="提现手续费 (%)">
              <el-input-number v-model="settingsForm.withdrawal_fee_rate" :min="0" :max="100" :step="0.5" :precision="1" />
            </el-form-item>

            <el-divider content-position="left">订单设置</el-divider>
            <el-form-item label="自动取消时间 (分钟)">
              <el-input-number v-model="settingsForm.auto_cancel_minutes" :min="5" :max="1440" :step="5" />
            </el-form-item>
            <el-form-item label="自动确认时间 (天)">
              <el-input-number v-model="settingsForm.auto_confirm_days" :min="1" :max="30" />
            </el-form-item>

            <el-form-item>
              <el-button type="primary" @click="handleSaveSettings" :loading="saving">
                保存配置
              </el-button>
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <!-- 账号管理 -->
        <el-tab-pane label="账号管理" name="account">
          <el-form :model="accountForm" label-width="120px" style="max-width: 600px;">
            <el-form-item label="当前用户名">
              <el-input v-model="accountForm.username" disabled />
            </el-form-item>
            <el-form-item label="角色">
              <el-input v-model="accountForm.role" disabled />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="handleChangePassword">
                修改密码
              </el-button>
            </el-form-item>
          </el-form>
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useUserStore } from '@/store/user'
import { getSettings, updateSettings, getSystemStatus } from '@/api'

const userStore = useUserStore()
const activeTab = ref('basic')
const settingsLoading = ref(false)
const saving = ref(false)

const systemStatus = ref({ status: 'ok' })

const settingsForm = reactive({
  commission_rate: 10,
  min_withdrawal: 100,
  withdrawal_fee_rate: 0,
  auto_cancel_minutes: 30,
  auto_confirm_days: 7
})

const accountForm = reactive({
  username: '',
  role: ''
})

const fetchSettings = async () => {
  settingsLoading.value = true
  try {
    const data = await getSettings()
    if (data) {
      Object.keys(settingsForm).forEach(key => {
        if (data[key] !== undefined) {
          settingsForm[key] = data[key]
        }
      })
    }
  } catch (error) {
    console.error('获取设置失败:', error)
  } finally {
    settingsLoading.value = false
  }
}

const fetchSystemStatus = async () => {
  try {
    const data = await getSystemStatus()
    systemStatus.value = data || { status: 'ok' }
  } catch (error) {
    systemStatus.value = { status: 'error' }
  }
}

const handleSaveSettings = async () => {
  saving.value = true
  try {
    await updateSettings(settingsForm)
    ElMessage.success('配置保存成功')
  } catch (error) {
    console.error('保存配置失败:', error)
  } finally {
    saving.value = false
  }
}

const handleChangePassword = () => {
  // 触发父组件 layout 中的修改密码对话框
  // 通过事件总线或直接操作
  ElMessage.info('请点击右上角用户菜单中的"修改密码"')
}

onMounted(() => {
  accountForm.username = userStore.username
  accountForm.role = userStore.role === 'super_admin' ? '超级管理员' : '管理员'
  fetchSettings()
  fetchSystemStatus()
})
</script>

<style scoped>
.settings-page {
  padding: 0;
}
</style>
