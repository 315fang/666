<template>
  <div class="env-config-page">
    <!-- 页面标题 -->
    <div class="page-header">
      <h2>
        <el-icon><Setting /></el-icon>
        环境配置检查中心
      </h2>
      <div class="header-actions">
        <el-button @click="refreshData" :loading="loading">
          <el-icon><Refresh /></el-icon> 刷新
        </el-button>
        <el-button type="primary" @click="downloadTemplate">
          <el-icon><Download /></el-icon> 下载模板
        </el-button>
      </div>
    </div>

    <!-- 健康度总览 -->
    <el-row :gutter="20" class="health-overview">
      <el-col :span="8">
        <el-card class="health-card" :class="healthStatusClass">
          <div class="health-score">
            <el-progress 
              type="dashboard" 
              :percentage="healthScore"
              :color="healthColors"
              :stroke-width="12"
            />
            <div class="health-label">{{ healthLabel }}</div>
          </div>
        </el-card>
      </el-col>

      <el-col :span="16">
        <el-card class="summary-card">
          <template #header>
            <span>配置统计</span>
          </template>
          <el-row :gutter="20">
            <el-col :span="6">
              <div class="stat-item">
                <div class="stat-value success">{{ summary.configured }}</div>
                <div class="stat-label">已配置</div>
              </div>
            </el-col>
            <el-col :span="6">
              <div class="stat-item">
                <div class="stat-value warning">{{ summary.warning }}</div>
                <div class="stat-label">警告</div>
              </div>
            </el-col>
            <el-col :span="6">
              <div class="stat-item">
                <div class="stat-value danger">{{ summary.missing + summary.error }}</div>
                <div class="stat-label">错误/缺失</div>
              </div>
            </el-col>
            <el-col :span="6">
              <div class="stat-item">
                <div class="stat-value info">{{ summary.total }}</div>
                <div class="stat-label">总计</div>
              </div>
            </el-col>
          </el-row>
        </el-card>
      </el-col>
    </el-row>

    <!-- 配置分组卡片 -->
    <el-row :gutter="20" class="group-cards">
      <el-col 
        :span="8" 
        v-for="group in configGroups" 
        :key="group.key"
      >
        <el-card 
          :class="['group-card', getGroupStatusClass(group.health)]"
          @click="selectGroup(group)"
        >
          <div class="group-header">
            <el-icon :size="24">
              <component :is="getGroupIcon(group.key)" />
            </el-icon>
            <span class="group-name">{{ group.label }}</span>
          </div>
          <div class="group-stats">
            <div class="group-health">
              <el-progress 
                :percentage="group.health" 
                :color="healthColors"
                :show-text="false"
                style="width: 100px"
              />
              <span>{{ group.health }}%</span>
            </div>
            <div class="group-count">
              {{ group.configs.filter(c => c.status === 'ok').length }}/{{ group.configs.length }} 项正常
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 详细配置列表 -->
    <el-card class="config-detail-card" v-if="selectedGroup">
      <template #header>
        <div class="detail-header">
          <span>{{ selectedGroup.label }} - 详细配置</span>
          <el-button link @click="selectedGroup = null">
            <el-icon><Close /></el-icon> 关闭
          </el-button>
        </div>
      </template>

      <el-table :data="selectedGroup.configs" style="width: 100%">
        <el-table-column prop="label" label="配置项" width="200" />
        <el-table-column prop="key" label="变量名" width="250">
          <template #default="{ row }">
            <code class="config-key">{{ row.key }}</code>
          </template>
        </el-table-column>
        <el-table-column prop="value" label="当前值" min-width="200">
          <template #default="{ row }">
            <div class="config-value">
              <span v-if="row.value" :class="{ 'sensitive': row.isSensitive }">
                {{ row.value }}
              </span>
              <el-tag v-else type="info" size="small">未配置</el-tag>
              <el-tag 
                v-if="row.value && row.value === row.defaultValue" 
                type="warning" 
                size="small"
                class="default-tag"
              >
                默认值
              </el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="120">
          <template #default="{ row }">
            <status-badge :status="row.status" :message="row.description" />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button 
              v-if="row.status !== 'ok'" 
              link 
              type="primary"
              @click="showFixGuide(row)"
            >
              查看建议
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 原始.env文件查看 -->
    <el-card class="raw-file-card">
      <template #header>
        <div class="card-header">
          <span>.env 文件内容（脱敏显示）</span>
          <div class="header-info">
            <el-tag type="info" v-if="envLastModified">
              最后更新: {{ formatTime(envLastModified) }}
            </el-tag>
            <el-tag type="warning" v-if="envSize">
              大小: {{ formatSize(envSize) }}
            </el-tag>
          </div>
        </div>
      </template>
      <pre class="env-content">{{ rawEnvContent }}</pre>
    </el-card>

    <!-- 修复建议弹窗 -->
    <el-dialog v-model="fixDialogVisible" title="配置修复建议" width="600px">
      <div v-if="selectedConfig">
        <h4>{{ selectedConfig.label }} ({{ selectedConfig.key }})</h4>
        <p class="description">{{ selectedConfig.description }}</p>

        <el-alert
          :title="getStatusMessage(selectedConfig.status)"
          :type="getAlertType(selectedConfig.status)"
          show-icon
          :closable="false"
          class="status-alert"
        />

        <div class="fix-guide">
          <h5>修复步骤：</h5>
          <ol>
            <li>登录服务器，找到项目根目录</li>
            <li>编辑 <code>.env</code> 文件</li>
            <li>找到或添加配置项: <code>{{ selectedConfig.key }}</code></li>
            <li>
              设置为合适的值
              <ul v-if="selectedConfig.defaultValue">
                <li>示例值: <code>{{ selectedConfig.key }}={{ selectedConfig.defaultValue }}</code></li>
              </ul>
            </li>
            <li>保存文件</li>
            <li>重启后端服务使配置生效</li>
          </ol>
        </div>

        <div class="important-notes">
          <h5>注意事项：</h5>
          <ul>
            <li>修改.env文件后需要重启服务才能生效</li>
            <li>生产环境修改前建议备份原文件</li>
            <li>敏感信息（如密钥）请妥善保管</li>
          </ul>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { Setting, Refresh, Download, Close, Cpu, Lock, Message, Folder, Collection, Warning } from '@element-plus/icons-vue'
import axios from 'axios'
import StatusBadge from './components/StatusBadge.vue'

const API_BASE = '/api/admin'

// 状态
const loading = ref(false)
const healthScore = ref(100)
const summary = ref({
  total: 0,
  configured: 0,
  missing: 0,
  warning: 0,
  error: 0
})
const configGroups = ref([])
const rawEnvContent = ref('')
const envLastModified = ref(null)
const envSize = ref(0)
const selectedGroup = ref(null)
const selectedConfig = ref(null)
const fixDialogVisible = ref(false)

const healthColors = [
  { color: '#f56c6c', percentage: 50 },
  { color: '#e6a23c', percentage: 70 },
  { color: '#67c23a', percentage: 90 },
  { color: '#409EFF', percentage: 100 }
]

const healthStatusClass = computed(() => {
  if (healthScore.value >= 90) return 'healthy'
  if (healthScore.value >= 70) return 'warning'
  return 'critical'
})

const healthLabel = computed(() => {
  if (healthScore.value >= 90) return '配置健康'
  if (healthScore.value >= 70) return '需要关注'
  return '存在严重问题'
})

// 方法
const fetchConfigReport = async () => {
  try {
    const res = await axios.get(`${API_BASE}/env-report`)
    if (res.data.code === 0) {
      const report = res.data.data
      healthScore.value = report.overallHealth
      summary.value = report.summary
      configGroups.value = report.groups
    }
  } catch (error) {
    console.error('获取配置报告失败:', error)
  }
}

const fetchEnvContent = async () => {
  try {
    const res = await axios.get(`${API_BASE}/env-content`)
    if (res.data.code === 0) {
      rawEnvContent.value = res.data.data.content
      envLastModified.value = res.data.data.lastModified
      envSize.value = res.data.data.size
    }
  } catch (error) {
    console.error('获取.env内容失败:', error)
  }
}

const refreshData = async () => {
  loading.value = true
  await Promise.all([
    fetchConfigReport(),
    fetchEnvContent()
  ])
  loading.value = false
}

const downloadTemplate = async () => {
  try {
    const res = await axios.get(`${API_BASE}/env-template/download`, {
      responseType: 'blob'
    })
    const blob = new Blob([res.data])
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = '.env.template'
    a.click()
    window.URL.revokeObjectURL(url)
  } catch (error) {
    console.error('下载模板失败:', error)
  }
}

const selectGroup = (group) => {
  selectedGroup.value = group
}

const showFixGuide = (config) => {
  selectedConfig.value = config
  fixDialogVisible.value = true
}

const getGroupIcon = (key) => {
  const icons = {
    database: 'Cpu',
    wechat: 'Message',
    ai: 'Cpu',
    security: 'Lock',
    other: 'Setting',
    storage: 'Folder',
    notification: 'Message',
    system: 'Collection',
    monitor: 'Warning'
  }
  return icons[key] || 'Setting'
}

const getGroupStatusClass = (health) => {
  if (health >= 90) return 'healthy'
  if (health >= 70) return 'warning'
  return 'critical'
}

const getStatusMessage = (status) => {
  const messages = {
    ok: '配置正常',
    missing: '配置项缺失',
    error: '配置错误',
    warning: '配置警告',
    optional: '可选配置'
  }
  return messages[status] || '未知状态'
}

const getAlertType = (status) => {
  const map = {
    ok: 'success',
    missing: 'error',
    error: 'error',
    warning: 'warning',
    optional: 'info'
  }
  return map[status] || 'info'
}

const formatTime = (time) => {
  if (!time) return ''
  return new Date(time).toLocaleString()
}

const formatSize = (bytes) => {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
}

onMounted(() => {
  refreshData()
})
</script>

<style scoped>
.env-config-page {
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

.health-overview {
  margin-bottom: 20px;
}

.health-card {
  text-align: center;
  padding: 20px;
}

.health-card.healthy {
  border-left: 4px solid #67c23a;
}

.health-card.warning {
  border-left: 4px solid #e6a23c;
}

.health-card.critical {
  border-left: 4px solid #f56c6c;
}

.health-score {
  position: relative;
}

.health-label {
  margin-top: 10px;
  font-size: 16px;
  font-weight: bold;
  color: #606266;
}

.summary-card .stat-item {
  text-align: center;
  padding: 15px;
}

.stat-value {
  font-size: 32px;
  font-weight: bold;
  margin-bottom: 5px;
}

.stat-value.success { color: #67c23a; }
.stat-value.warning { color: #e6a23c; }
.stat-value.danger { color: #f56c6c; }
.stat-value.info { color: #409EFF; }

.group-cards {
  margin-bottom: 20px;
}

.group-card {
  cursor: pointer;
  transition: all 0.3s;
  margin-bottom: 20px;
}

.group-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}

.group-card.healthy {
  border-top: 3px solid #67c23a;
}

.group-card.warning {
  border-top: 3px solid #e6a23c;
}

.group-card.critical {
  border-top: 3px solid #f56c6c;
}

.group-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 15px;
}

.group-name {
  font-size: 16px;
  font-weight: 500;
}

.group-stats {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.group-health {
  display: flex;
  align-items: center;
  gap: 10px;
}

.group-count {
  font-size: 14px;
  color: #909399;
}

.config-detail-card {
  margin-bottom: 20px;
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.config-key {
  background: #f5f7fa;
  padding: 2px 8px;
  border-radius: 3px;
  font-family: monospace;
  font-size: 13px;
}

.config-value {
  display: flex;
  align-items: center;
  gap: 10px;
}

.config-value .sensitive {
  font-family: monospace;
  background: #f5f7fa;
  padding: 2px 8px;
  border-radius: 4px;
}

.default-tag {
  margin-left: 8px;
}

.raw-file-card {
  margin-top: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-info {
  display: flex;
  gap: 10px;
}

.env-content {
  background: #1e1e1e;
  color: #d4d4d4;
  padding: 20px;
  border-radius: 4px;
  overflow-x: auto;
  font-family: 'Courier New', monospace;
  line-height: 1.6;
  font-size: 13px;
  max-height: 400px;
  overflow-y: auto;
}

.status-alert {
  margin: 15px 0;
}

.fix-guide {
  background: #f5f7fa;
  padding: 15px;
  border-radius: 4px;
  margin-top: 15px;
}

.fix-guide h5 {
  margin-top: 0;
  color: #606266;
}

.fix-guide ol, .fix-guide ul {
  padding-left: 20px;
}

.fix-guide li {
  margin-bottom: 8px;
  line-height: 1.6;
}

.important-notes {
  margin-top: 20px;
  padding: 15px;
  background: #fdf6ec;
  border: 1px solid #f0c78a;
  border-radius: 4px;
}

.important-notes h5 {
  margin-top: 0;
  color: #e6a23c;
}

.important-notes ul {
  padding-left: 20px;
}

.important-notes li {
  margin-bottom: 5px;
  color: #606266;
}

code {
  background: #f5f7fa;
  padding: 2px 6px;
  border-radius: 3px;
  font-family: 'Courier New', monospace;
  font-size: 0.9em;
}

.description {
  color: #606266;
  margin: 10px 0;
}
</style>
