<template>
  <div class="system-config-page">
    <el-tabs v-model="activeTab">

      <!-- ===== 系统配置（热更新） ===== -->
      <el-tab-pane label="系统配置" name="config">
        <el-card style="margin-top: 16px;">
          <template #header>
            <div class="card-header">
              <span>系统配置（数据库热更新，无需重启）</span>
              <div class="header-actions">
                <el-button @click="refreshCache" :loading="refreshing">
                  <el-icon><Refresh /></el-icon>
                  刷新缓存
                </el-button>
                <el-button type="primary" @click="handleBatchSave" :loading="batchSaving" :disabled="!pendingChanges.length">
                  批量保存 ({{ pendingChanges.length }})
                </el-button>
              </div>
            </div>
          </template>

          <!-- 按分组展示 -->
          <div v-loading="configLoading">
            <div v-for="(items, groupName) in groupedConfigs" :key="groupName" class="config-group">
              <div class="group-title">
                <el-icon><Setting /></el-icon>
                {{ groupLabel(groupName) }}
              </div>
              <el-table :data="items" stripe size="small" class="config-table">
                <el-table-column prop="config_key" label="配置键" width="220">
                  <template #default="{ row }">
                    <code class="config-key">{{ row.config_key }}</code>
                  </template>
                </el-table-column>
                <el-table-column prop="description" label="说明" min-width="180" />
                <el-table-column label="当前值" min-width="200">
                  <template #default="{ row }">
                    <el-input-number
                      v-if="row.config_type === 'number'"
                      v-model="row._editValue"
                      size="small"
                      @change="markPending(row)"
                      style="width: 120px;"
                    />
                    <el-switch
                      v-else-if="row.config_type === 'boolean'"
                      v-model="row._editValue"
                      :active-value="true"
                      :inactive-value="false"
                      @change="markPending(row)"
                    />
                    <el-input
                      v-else
                      v-model="row._editValue"
                      size="small"
                      @input="markPending(row)"
                      clearable
                    />
                  </template>
                </el-table-column>
                <el-table-column label="状态" width="90">
                  <template #default="{ row }">
                    <el-tag v-if="row._modified" type="warning" size="small">已修改</el-tag>
                    <el-tag v-else type="success" size="small">已保存</el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="历史" width="70">
                  <template #default="{ row }">
                    <el-button text type="info" size="small" @click="showHistory(row)">
                      <el-icon><Clock /></el-icon>
                    </el-button>
                  </template>
                </el-table-column>
              </el-table>
            </div>
          </div>
        </el-card>
      </el-tab-pane>
    </el-tabs>

    <!-- 配置历史对话框 -->
    <el-dialog v-model="historyDialogVisible" title="配置修改历史" width="640px">
      <el-timeline v-if="configHistory.length">
        <el-timeline-item
          v-for="h in configHistory"
          :key="h.id"
          :timestamp="formatDate(h.created_at)"
          placement="top"
        >
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">
            <div style="flex:1;min-width:0">
              <div><strong>{{ h.config_key }}</strong>: {{ h.old_value }} → {{ h.new_value }}</div>
              <div style="font-size:12px;color:#909399">操作人: {{ h.changed_by }}</div>
              <div v-if="h.change_reason" style="font-size:12px;color:#909399">原因: {{ h.change_reason }}</div>
            </div>
            <el-button
              size="small"
              type="warning"
              plain
              style="flex-shrink:0;margin-top:2px"
              :loading="rollingBack === h.id"
              @click="handleRollback(h)"
            >回滚到此版本</el-button>
          </div>
        </el-timeline-item>
      </el-timeline>
      <el-empty v-else description="暂无修改记录" />
    </el-dialog>

  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  getSystemConfigs,
  batchUpdateSystemConfigs,
  refreshSystemConfigCache,
  getSystemConfigHistory,
  rollbackSystemConfig
} from '@/api'
import dayjs from 'dayjs'

const activeTab = ref('config')

// ===== 系统配置 =====
const configLoading = ref(false)
const batchSaving = ref(false)
const refreshing = ref(false)
const historyDialogVisible = ref(false)
const configHistory = ref([])
const allConfigs = ref([])
const pendingChanges = ref([])
const rollingBack = ref(null)   // 正在回滚的 history id

const groupedConfigs = computed(() => {
  const groups = {}
  for (const c of allConfigs.value) {
    const g = c.config_group || c.category || 'general'
    if (!groups[g]) groups[g] = []
    groups[g].push(c)
  }
  return groups
})

const fetchConfigs = async () => {
  configLoading.value = true
  try {
    const res = await getSystemConfigs()
    allConfigs.value = res.list.map(c => ({
      ...c,
      _editValue: parseConfigValue(c.config_value, c.config_type),
      _originalValue: c.config_value,
      _modified: false
    }))
    pendingChanges.value = []
  } catch (e) {
    console.error('获取配置失败:', e)
  } finally {
    configLoading.value = false
  }
}


const parseConfigValue = (val, type) => {
  if (type === 'number') return Number(val) || 0
  if (type === 'boolean') return val === 'true' || val === true
  return val
}

const markPending = (row) => {
  row._modified = String(row._editValue) !== String(row._originalValue)
  if (row._modified && !pendingChanges.value.includes(row.config_key)) {
    pendingChanges.value.push(row.config_key)
  } else if (!row._modified) {
    pendingChanges.value = pendingChanges.value.filter(k => k !== row.config_key)
  }
}

const handleBatchSave = async () => {
  batchSaving.value = true
  try {
    const updates = allConfigs.value
      .filter(c => c._modified)
      .map(c => ({ key: c.config_key, value: String(c._editValue) }))
    await batchUpdateSystemConfigs({ updates, reason: '管理后台批量更新' })
    ElMessage.success(`已保存 ${updates.length} 项配置，即时生效`)
    allConfigs.value.forEach(c => { c._modified = false; c._originalValue = String(c._editValue) })
    pendingChanges.value = []
  } catch (e) {
    console.error('批量保存失败:', e)
  } finally {
    batchSaving.value = false
  }
}

const refreshCache = async () => {
  refreshing.value = true
  try {
    await refreshSystemConfigCache()
    ElMessage.success('缓存已刷新')
  } catch (e) {
    console.error('刷新缓存失败:', e)
  } finally {
    refreshing.value = false
  }
}

const showHistory = async (row) => {
  try {
    const res = await getSystemConfigHistory(row.config_key)
    configHistory.value = res.list
    historyDialogVisible.value = true
  } catch (e) {
    console.error('获取历史失败:', e)
  }
}


const handleRollback = async (h) => {
  try {
    await ElMessageBox.confirm(
      `确认将 <strong>${h.config_key}</strong> 回滚到：<br><code>${h.old_value}</code>？`,
      '回滚配置',
      { type: 'warning', dangerouslyUseHTMLString: true, confirmButtonText: '确认回滚', cancelButtonText: '取消' }
    )
  } catch {
    return  // 用户取消
  }
  rollingBack.value = h.id
  try {
    await rollbackSystemConfig(h.config_key, { history_id: h.id })
    ElMessage.success('回滚成功，配置已即时生效')
    historyDialogVisible.value = false
    await fetchConfigs()
  } catch (e) {
    console.error('回滚失败:', e)
  } finally {
    rollingBack.value = null
  }
}


const groupLabel = (g) => ({
  general: '基础设置', commission: '佣金分销', order: '订单配置',
  security: '安全配置', notification: '通知设置', ai: 'AI 配置'
}[g] || g)

const formatDate = (d) => d ? dayjs(d).format('YYYY-MM-DD HH:mm') : '-'

onMounted(() => {
  fetchConfigs()
})
</script>

<style scoped>
.system-config-page { padding: 0; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.header-actions { display: flex; gap: 8px; }
.config-group { margin-bottom: 24px; }
.group-title { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: #303133; padding: 10px 0 8px; border-bottom: 1px solid #ebeef5; margin-bottom: 10px; }
.config-table { border-radius: 4px; }
.config-key { font-family: monospace; font-size: 12px; background: #f5f7fa; padding: 2px 6px; border-radius: 3px; color: #476582; }
</style>
