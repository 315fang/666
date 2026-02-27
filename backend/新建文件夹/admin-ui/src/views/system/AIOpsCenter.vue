<template>
  <div class="ai-ops-center">
    <!-- 页面标题 -->
    <div class="page-header">
      <h2>
        <el-icon><Monitor /></el-icon>
        AI运维监控中心
      </h2>
      <div class="header-actions">
        <el-button @click="refreshData" :loading="loading">
          <el-icon><Refresh /></el-icon> 刷新
        </el-button>
        <el-button type="primary" @click="showAIAssistant">
          <el-icon><ChatDotRound /></el-icon> AI助手
        </el-button>
      </div>
    </div>

    <!-- 健康度总览 -->
    <el-row :gutter="20" class="stats-row">
      <el-col :span="6">
        <el-card class="stat-card" :class="healthStatus">
          <div class="stat-icon">
            <el-icon :size="40"><Monitor /></el-icon>
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ dashboard.healthScore }}%</div>
            <div class="stat-label">系统健康度</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card warning">
          <div class="stat-icon">
            <el-icon :size="40"><Warning /></el-icon>
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ dashboard.activeAlertsCount || 0 }}</div>
            <div class="stat-label">活跃告警</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card danger">
          <div class="stat-icon">
            <el-icon :size="40"><CircleClose /></el-icon>
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ dashboard.criticalCount || 0 }}</div>
            <div class="stat-label">紧急告警</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card info">
          <div class="stat-icon">
            <el-icon :size="40"><Clock /></el-icon>
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ monitorStatus }}</div>
            <div class="stat-label">监控状态</div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 主内容区 -->
    <el-row :gutter="20" class="main-content">
      <!-- 左侧：告警列表 -->
      <el-col :span="16">
        <el-card class="alert-card">
          <template #header>
            <div class="card-header">
              <span>实时告警</span>
              <div class="header-filters">
                <el-radio-group v-model="alertFilter" size="small">
                  <el-radio-button label="all">全部</el-radio-button>
                  <el-radio-button label="CRITICAL">紧急</el-radio-button>
                  <el-radio-button label="WARNING">重要</el-radio-button>
                  <el-radio-button label="INFO">提示</el-radio-button>
                </el-radio-group>
                <el-select v-model="statusFilter" size="small" style="width: 100px; margin-left: 10px;">
                  <el-option label="全部状态" value="all" />
                  <el-option label="未处理" value="ACTIVE" />
                  <el-option label="已解决" value="RESOLVED" />
                </el-select>
              </div>
            </div>
          </template>

          <div class="alert-list" v-if="filteredAlerts.length > 0">
            <div
              v-for="alert in filteredAlerts"
              :key="alert.id"
              :class="['alert-item', alert.level.toLowerCase(), { active: selectedAlert?.id === alert.id }]"
              @click="selectAlert(alert)"
            >
              <div class="alert-level">
                <el-tag :type="getAlertType(alert.level)" effect="dark" size="small">
                  {{ alert.level }}
                </el-tag>
              </div>
              <div class="alert-content">
                <div class="alert-title">{{ alert.title }}</div>
                <div class="alert-meta">
                  <span class="alert-code">{{ alert.alert_code }}</span>
                  <span class="alert-time">{{ formatTime(alert.created_at) }}</span>
                </div>
              </div>
              <div class="alert-status">
                <el-tag v-if="alert.status === 'ACTIVE'" type="danger" size="small">未处理</el-tag>
                <el-tag v-else-if="alert.status === 'FIXING'" type="warning" size="small">修复中</el-tag>
                <el-tag v-else type="success" size="small">已解决</el-tag>
              </div>
            </div>
          </div>
          <el-empty v-else description="暂无告警" />
        </el-card>

        <!-- 修复会话历史 -->
        <el-card class="session-card" style="margin-top: 20px;">
          <template #header>
            <span>修复会话历史</span>
          </template>
          <el-table :data="fixSessions" size="small">
            <el-table-column prop="alert.alert_code" label="告警编号" width="120" />
            <el-table-column prop="status" label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="getSessionStatusType(row.status)" size="small">
                  {{ row.status }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="executor.username" label="执行人" width="100" />
            <el-table-column prop="started_at" label="开始时间">
              <template #default="{ row }">
                {{ formatTime(row.started_at) }}
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>

      <!-- 右侧：告警详情和操作 -->
      <el-col :span="8">
        <el-card v-if="selectedAlert" class="detail-card">
          <template #header>
            <div class="detail-header">
              <span>告警详情</span>
              <el-tag :type="getAlertType(selectedAlert.level)" size="small">
                {{ selectedAlert.level }}
              </el-tag>
            </div>
          </template>

          <div class="detail-content">
            <h4>{{ selectedAlert.title }}</h4>
            <p class="description">{{ selectedAlert.description }}</p>

            <!-- AI分析 -->
            <div v-if="selectedAlert.ai_cause" class="ai-analysis">
              <el-divider>AI 分析</el-divider>
              <div class="analysis-item">
                <label>可能原因：</label>
                <p>{{ selectedAlert.ai_cause }}</p>
              </div>
              <div class="analysis-item" v-if="selectedAlert.ai_impact">
                <label>影响范围：</label>
                <p>{{ selectedAlert.ai_impact }}</p>
              </div>
              <div class="analysis-item" v-if="selectedAlert.ai_confidence">
                <label>AI置信度：</label>
                <el-progress :percentage="selectedAlert.ai_confidence * 100" :color="confidenceColors" />
              </div>
              <div class="analysis-item" v-if="selectedAlert.ai_suggestion">
                <label>修复建议：</label>
                <p class="suggestion">{{ selectedAlert.ai_suggestion }}</p>
              </div>
            </div>

            <!-- 操作按钮 -->
            <div class="action-buttons" v-if="selectedAlert.status === 'ACTIVE'">
              <el-button
                v-if="selectedAlert.auto_fixable"
                type="primary"
                @click="showFixDialog('auto')"
              >
                <el-icon><MagicStick /></el-icon>
                AI自动修复
              </el-button>
              <el-button type="warning" @click="showFixDialog('manual')">
                <el-icon><Tools /></el-icon>
                查看修复指引
              </el-button>
              <el-button @click="ignoreAlert">
                <el-icon><CircleClose /></el-icon>
                忽略告警
              </el-button>
            </div>
          </div>
        </el-card>

        <el-card v-else class="detail-card empty">
          <el-empty description="选择左侧告警查看详情" />
        </el-card>

        <!-- AI助手面板 -->
        <el-card class="ai-assistant-card" style="margin-top: 20px;">
          <template #header>
            <span><el-icon><ChatDotRound /></el-icon> AI运维助手</span>
          </template>
          <div class="quick-actions">
            <el-button size="small" @click="askAI('检查系统健康')">
              检查系统健康
            </el-button>
            <el-button size="small" @click="askAI('分析最近的错误')">
              分析错误日志
            </el-button>
            <el-button size="small" @click="askAI('查看监控器状态')">
              监控器状态
            </el-button>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 修复对话框 -->
    <el-dialog v-model="fixDialogVisible" :title="fixDialogTitle" width="700px">
      <div v-if="diagnosisData" class="fix-dialog-content">
        <div v-if="fixMode === 'auto'">
          <el-alert
            title="AI将自动执行以下修复步骤"
            type="warning"
            show-icon
            :closable="false"
          />
          <div class="fix-steps">
            <div
              v-for="(step, index) in diagnosisData.fixOptions[0]?.steps"
              :key="index"
              class="fix-step"
            >
              <div class="step-number">{{ index + 1 }}</div>
              <div class="step-content">
                <div class="step-action">{{ step.action }}</div>
                <div v-if="step.command" class="step-command">
                  <code>{{ step.command }}</code>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div v-else>
          <h4>修复指引</h4>
          <div class="fix-guide" v-if="diagnosisData.diagnosis?.fixSteps">
            <div
              v-for="(step, index) in diagnosisData.diagnosis.fixSteps"
              :key="index"
              class="guide-step"
            >
              <h5>步骤 {{ step.step }}</h5>
              <p>{{ step.action }}</p>
              <div v-if="step.command" class="code-block">
                <code>{{ step.command }}</code>
              </div>
              <div v-if="step.risk" class="risk-tag">
                风险等级: {{ step.risk }}
              </div>
            </div>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="fixDialogVisible = false">取消</el-button>
        <el-button v-if="fixMode === 'auto'" type="primary" @click="executeFix" :loading="fixing">
          确认执行修复
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { Monitor, Refresh, ChatDotRound, Warning, CircleClose, Clock, MagicStick, Tools } from '@element-plus/icons-vue'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'

const API_BASE = '/api/admin/ai-ops'

// 状态
const loading = ref(false)
const dashboard = ref({})
const alerts = ref([])
const fixSessions = ref([])
const selectedAlert = ref(null)
const alertFilter = ref('all')
const statusFilter = ref('all')
const diagnosisData = ref(null)
const fixDialogVisible = ref(false)
const fixMode = ref('auto')
const fixing = ref(false)

// 轮询定时器
let pollTimer = null

// 计算属性
const healthStatus = computed(() => {
  const score = dashboard.value.healthScore || 100
  if (score >= 90) return 'healthy'
  if (score >= 70) return 'warning'
  return 'danger'
})

const monitorStatus = computed(() => {
  return '运行中'
})

const filteredAlerts = computed(() => {
  let result = alerts.value
  
  if (alertFilter.value !== 'all') {
    result = result.filter(a => a.level === alertFilter.value)
  }
  
  if (statusFilter.value !== 'all') {
    result = result.filter(a => a.status === statusFilter.value)
  }
  
  return result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
})

const fixDialogTitle = computed(() => {
  return fixMode.value === 'auto' ? 'AI自动修复' : '修复指引'
})

const confidenceColors = [
  { color: '#f56c6c', percentage: 50 },
  { color: '#e6a23c', percentage: 70 },
  { color: '#67c23a', percentage: 90 }
]

// 方法
const fetchDashboard = async () => {
  try {
    const res = await axios.get(`${API_BASE}/dashboard`)
    if (res.data.code === 0) {
      dashboard.value = res.data.data
    }
  } catch (error) {
    console.error('获取仪表盘失败:', error)
  }
}

const fetchAlerts = async () => {
  try {
    const res = await axios.get(`${API_BASE}/alerts`, {
      params: { limit: 50 }
    })
    if (res.data.code === 0) {
      alerts.value = res.data.data
    }
  } catch (error) {
    console.error('获取告警失败:', error)
  }
}

const fetchFixSessions = async () => {
  try {
    const res = await axios.get(`${API_BASE}/fix-sessions`)
    if (res.data.code === 0) {
      fixSessions.value = res.data.data
    }
  } catch (error) {
    console.error('获取修复会话失败:', error)
  }
}

const refreshData = async () => {
  loading.value = true
  await Promise.all([
    fetchDashboard(),
    fetchAlerts(),
    fetchFixSessions()
  ])
  loading.value = false
}

const selectAlert = (alert) => {
  selectedAlert.value = alert
}

const diagnoseAlert = async () => {
  if (!selectedAlert.value) return
  
  try {
    const res = await axios.post(`${API_BASE}/alerts/${selectedAlert.value.id}/diagnose`)
    if (res.data.code === 0) {
      diagnosisData.value = res.data.data
    }
  } catch (error) {
    ElMessage.error('诊断失败: ' + error.message)
  }
}

const showFixDialog = async (mode) => {
  fixMode.value = mode
  await diagnoseAlert()
  fixDialogVisible.value = true
}

const executeFix = async () => {
  if (!selectedAlert.value || !diagnosisData.value) return
  
  fixing.value = true
  try {
    const option = diagnosisData.value.fixOptions.find(o => o.type === 'AUTO')
    const res = await axios.post(`${API_BASE}/alerts/${selectedAlert.value.id}/fix`, {
      option
    })
    
    if (res.data.code === 0) {
      ElMessage.success('修复执行成功')
      fixDialogVisible.value = false
      refreshData()
    }
  } catch (error) {
    ElMessage.error('修复失败: ' + error.message)
  } finally {
    fixing.value = false
  }
}

const ignoreAlert = async () => {
  if (!selectedAlert.value) return
  
  try {
    await ElMessageBox.confirm('确定要忽略此告警吗？', '提示', {
      type: 'warning'
    })
    
    const res = await axios.put(`${API_BASE}/alerts/${selectedAlert.value.id}/ignore`, {
      reason: '管理员手动忽略'
    })
    
    if (res.data.code === 0) {
      ElMessage.success('已忽略告警')
      refreshData()
      selectedAlert.value = null
    }
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('操作失败: ' + error.message)
    }
  }
}

const showAIAssistant = () => {
  // 打开AI助手对话框或跳转到AI控制台
  window.open('/admin/ai-console', '_blank')
}

const askAI = (question) => {
  // 可以打开AI控制台并预填充问题
  console.log('问AI:', question)
}

const getAlertType = (level) => {
  const map = {
    'CRITICAL': 'danger',
    'WARNING': 'warning',
    'INFO': 'info'
  }
  return map[level] || 'info'
}

const getSessionStatusType = (status) => {
  const map = {
    'RUNNING': 'warning',
    'SUCCESS': 'success',
    'FAILED': 'danger',
    'ROLLED_BACK': 'info'
  }
  return map[status] || 'info'
}

const formatTime = (time) => {
  if (!time) return ''
  return new Date(time).toLocaleString()
}

// 生命周期
onMounted(() => {
  refreshData()
  // 每30秒自动刷新
  pollTimer = setInterval(refreshData, 30000)
})

onUnmounted(() => {
  if (pollTimer) {
    clearInterval(pollTimer)
  }
})
</script>

<style scoped>
.ai-ops-center {
  padding: 20px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.page-header h2 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
}

.stats-row {
  margin-bottom: 20px;
}

.stat-card {
  display: flex;
  align-items: center;
  padding: 15px;
}

.stat-card.healthy {
  border-left: 4px solid #67c23a;
}

.stat-card.warning {
  border-left: 4px solid #e6a23c;
}

.stat-card.danger {
  border-left: 4px solid #f56c6c;
}

.stat-card.info {
  border-left: 4px solid #409EFF;
}

.stat-icon {
  margin-right: 15px;
}

.stat-content {
  flex: 1;
}

.stat-value {
  font-size: 28px;
  font-weight: bold;
  color: #303133;
}

.stat-label {
  font-size: 14px;
  color: #909399;
  margin-top: 5px;
}

.main-content {
  margin-top: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-filters {
  display: flex;
  align-items: center;
}

.alert-list {
  max-height: 500px;
  overflow-y: auto;
}

.alert-item {
  display: flex;
  align-items: center;
  padding: 12px;
  border-bottom: 1px solid #ebeef5;
  cursor: pointer;
  transition: background-color 0.3s;
}

.alert-item:hover {
  background-color: #f5f7fa;
}

.alert-item.active {
  background-color: #ecf5ff;
  border-left: 3px solid #409EFF;
}

.alert-item.critical {
  border-left: 3px solid #f56c6c;
}

.alert-item.warning {
  border-left: 3px solid #e6a23c;
}

.alert-item.info {
  border-left: 3px solid #909399;
}

.alert-level {
  margin-right: 12px;
}

.alert-content {
  flex: 1;
  min-width: 0;
}

.alert-title {
  font-size: 14px;
  font-weight: 500;
  color: #303133;
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.alert-meta {
  font-size: 12px;
  color: #909399;
}

.alert-code {
  margin-right: 10px;
}

.detail-card {
  height: 100%;
}

.detail-card.empty {
  display: flex;
  align-items: center;
  justify-content: center;
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.detail-content h4 {
  margin-top: 0;
  color: #303133;
}

.description {
  color: #606266;
  line-height: 1.6;
}

.ai-analysis {
  margin-top: 20px;
}

.analysis-item {
  margin-bottom: 15px;
}

.analysis-item label {
  font-weight: 500;
  color: #606266;
}

.analysis-item p {
  margin: 5px 0 0;
  color: #303133;
  line-height: 1.5;
}

.suggestion {
  background: #f0f9ff;
  padding: 10px;
  border-radius: 4px;
  border-left: 3px solid #409EFF;
}

.action-buttons {
  margin-top: 20px;
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.ai-assistant-card .quick-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.fix-dialog-content {
  max-height: 500px;
  overflow-y: auto;
}

.fix-steps {
  margin-top: 20px;
}

.fix-step {
  display: flex;
  margin-bottom: 15px;
}

.step-number {
  width: 28px;
  height: 28px;
  background: #409EFF;
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 12px;
  flex-shrink: 0;
}

.step-content {
  flex: 1;
}

.step-action {
  font-weight: 500;
  margin-bottom: 5px;
}

.step-command {
  background: #f5f7fa;
  padding: 8px;
  border-radius: 4px;
  font-family: monospace;
  font-size: 13px;
}

.guide-step {
  margin-bottom: 20px;
  padding: 15px;
  background: #f5f7fa;
  border-radius: 4px;
}

.guide-step h5 {
  margin-top: 0;
  color: #409EFF;
}

.code-block {
  background: #2d2d2d;
  color: #ccc;
  padding: 10px;
  border-radius: 4px;
  margin-top: 10px;
  font-family: monospace;
  font-size: 13px;
}

.risk-tag {
  margin-top: 10px;
  color: #e6a23c;
  font-size: 12px;
}
</style>
