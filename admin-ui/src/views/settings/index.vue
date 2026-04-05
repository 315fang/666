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

        <!-- 告警通知 -->
        <el-tab-pane label="告警通知" name="alert">
          <el-form
            :model="alertForm"
            label-width="180px"
            style="max-width: 700px;"
            v-loading="alertLoading"
          >
            <el-divider content-position="left">告警总开关</el-divider>
            <el-form-item label="启用告警推送">
              <el-switch v-model="alertForm.alert_enabled" />
              <span style="margin-left:12px;font-size:12px;color:#909399">
                关闭后所有渠道均停止推送
              </span>
            </el-form-item>

            <el-divider content-position="left">推送渠道</el-divider>
            <el-form-item label="推送渠道">
              <el-radio-group v-model="alertForm.alert_webhook_type">
                <el-radio value="dingtalk">仅钉钉</el-radio>
                <el-radio value="wecom">仅企业微信</el-radio>
                <el-radio value="both">两者都推</el-radio>
              </el-radio-group>
            </el-form-item>

            <el-form-item
              label="钉钉 Webhook 地址"
              v-if="alertForm.alert_webhook_type === 'dingtalk' || alertForm.alert_webhook_type === 'both'"
            >
              <el-input
                v-model="alertForm.alert_dingtalk_webhook"
                placeholder="https://oapi.dingtalk.com/robot/send?access_token=..."
                clearable
                style="width:420px"
              />
              <el-button
                style="margin-left:8px"
                :loading="testingDing"
                @click="handleTestWebhook('dingtalk')"
              >测试</el-button>
            </el-form-item>

            <el-form-item
              label="企业微信 Webhook 地址"
              v-if="alertForm.alert_webhook_type === 'wecom' || alertForm.alert_webhook_type === 'both'"
            >
              <el-input
                v-model="alertForm.alert_wecom_webhook"
                placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..."
                clearable
                style="width:420px"
              />
              <el-button
                style="margin-left:8px"
                :loading="testingWecom"
                @click="handleTestWebhook('wecom')"
              >测试</el-button>
            </el-form-item>

            <el-divider content-position="left">推送策略</el-divider>
            <el-form-item label="同类告警最小间隔 (分钟)">
              <el-input-number
                v-model="alertForm.alert_min_interval_minutes"
                :min="1"
                :max="1440"
                :step="5"
              />
              <span style="margin-left:10px;font-size:12px;color:#909399">
                相同类型告警在此时间内不重复推送
              </span>
            </el-form-item>

            <el-form-item>
              <el-button type="primary" @click="handleSaveAlert" :loading="alertSaving">
                保存告警配置
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
import request from '@/utils/request'

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

// ========== 告警配置 ==========
const alertLoading = ref(false)
const alertSaving  = ref(false)
const testingDing  = ref(false)
const testingWecom = ref(false)

const alertForm = reactive({
  alert_enabled: false,
  alert_webhook_type: 'dingtalk',
  alert_dingtalk_webhook: '',
  alert_wecom_webhook: '',
  alert_min_interval_minutes: 10
})

const fetchAlertConfig = async () => {
  alertLoading.value = true
  try {
    const res = await request({ url: '/alert-config', method: 'get' })
    const d = res.data || res
    if (d.alert_enabled !== undefined) alertForm.alert_enabled = !!d.alert_enabled
    if (d.alert_webhook_type)          alertForm.alert_webhook_type = d.alert_webhook_type
    if (d.alert_dingtalk_webhook)      alertForm.alert_dingtalk_webhook = d.alert_dingtalk_webhook
    if (d.alert_wecom_webhook)         alertForm.alert_wecom_webhook = d.alert_wecom_webhook
    if (d.alert_min_interval_minutes)  alertForm.alert_min_interval_minutes = Number(d.alert_min_interval_minutes)
  } catch (e) {
    console.error('获取告警配置失败:', e)
  } finally {
    alertLoading.value = false
  }
}

const handleSaveAlert = async () => {
  alertSaving.value = true
  try {
    await request({ url: '/alert-config', method: 'put', data: { ...alertForm } })
    ElMessage.success('告警配置已保存')
  } catch (e) {
    console.error('保存告警配置失败:', e)
  } finally {
    alertSaving.value = false
  }
}

const handleTestWebhook = async (type) => {
  const url = type === 'dingtalk' ? alertForm.alert_dingtalk_webhook : alertForm.alert_wecom_webhook
  if (!url) { ElMessage.warning('请先填写 Webhook 地址'); return }
  if (type === 'dingtalk') testingDing.value = true
  else testingWecom.value = true
  try {
    const res = await request({ url: '/alert-config/test', method: 'post', data: { type, url } })
    const d = res.data || res
    if (d.ok || res.code === 0) ElMessage.success('测试消息发送成功，请检查对应群')
    else ElMessage.error(`发送失败：${d.message || '未知错误'}`)
  } catch (e) {
    ElMessage.error('发送失败：' + (e.message || '请求错误'))
  } finally {
    testingDing.value = false
    testingWecom.value = false
  }
}

// ========== 其余逻辑 ==========
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
  ElMessage.info('请点击右上角用户菜单中的"修改密码"')
}

onMounted(() => {
  accountForm.username = userStore.username
  accountForm.role = userStore.role === 'super_admin' ? '超级管理员' : '管理员'
  fetchSettings()
  fetchSystemStatus()
  fetchAlertConfig()
})
</script>

<style scoped>
.settings-page {
  padding: 0;
}
</style>
