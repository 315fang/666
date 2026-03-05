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

      <!-- ===== 数据库索引管理 ===== -->
      <el-tab-pane label="数据库索引" name="db">
        <el-card style="margin-top: 16px;">
          <template #header>
            <div class="card-header">
              <span>数据库表 & 索引管理</span>
              <el-button
                type="primary"
                @click="showAddIndexDialog"
                :disabled="!selectedTable"
              >
                <el-icon><Plus /></el-icon>
                新增索引
              </el-button>
            </div>
          </template>

          <el-row :gutter="16">
            <!-- 左：表列表 -->
            <el-col :span="7">
              <div class="table-list-header">数据表列表</div>
              <el-input
                v-model="tableSearch"
                placeholder="搜索表名"
                clearable
                size="small"
                style="margin-bottom: 8px;"
              />
              <div class="table-list" v-loading="tablesLoading">
                <div
                  v-for="tbl in filteredTables"
                  :key="tbl.name"
                  class="table-item"
                  :class="{ 'is-selected': selectedTable === tbl.name }"
                  @click="selectTable(tbl.name)"
                >
                  <div class="table-name">{{ tbl.name }}</div>
                  <div class="table-meta">{{ tbl.rows }} 行</div>
                </div>
              </div>
            </el-col>

            <!-- 右：索引列表 -->
            <el-col :span="17">
              <div v-if="!selectedTable" class="no-table-selected">
                <el-icon :size="48" color="#ddd"><Grid /></el-icon>
                <div>请在左侧选择一张数据表</div>
              </div>
              <div v-else v-loading="indexLoading">
                <div class="index-header">
                  <strong>{{ selectedTable }}</strong>
                  <span class="index-count">{{ tableIndexes.length }} 个索引</span>
                </div>
                <el-table :data="tableIndexes" stripe size="small">
                  <el-table-column prop="name" label="索引名" width="200" />
                  <el-table-column label="列" min-width="150">
                    <template #default="{ row }">
                      <el-tag
                        v-for="col in row.columns"
                        :key="col"
                        size="small"
                        style="margin-right: 4px;"
                      >{{ col }}</el-tag>
                    </template>
                  </el-table-column>
                  <el-table-column label="类型" width="100">
                    <template #default="{ row }">
                      <el-tag :type="row.primary ? 'danger' : row.unique ? 'warning' : 'info'" size="small">
                        {{ row.primary ? 'PRIMARY' : row.unique ? 'UNIQUE' : 'INDEX' }}
                      </el-tag>
                    </template>
                  </el-table-column>
                  <el-table-column label="操作" width="80">
                    <template #default="{ row }">
                      <el-button
                        v-if="!row.primary"
                        text type="danger" size="small"
                        @click="handleDeleteIndex(row)"
                      >删除</el-button>
                    </template>
                  </el-table-column>
                </el-table>
              </div>
            </el-col>
          </el-row>
        </el-card>
      </el-tab-pane>
    </el-tabs>

    <!-- 配置历史对话框 -->
    <el-dialog v-model="historyDialogVisible" title="配置修改历史" width="600px">
      <el-timeline v-if="configHistory.length">
        <el-timeline-item
          v-for="h in configHistory"
          :key="h.id"
          :timestamp="formatDate(h.created_at)"
          placement="top"
        >
          <div><strong>{{ h.config_key }}</strong>: {{ h.old_value }} → {{ h.new_value }}</div>
          <div style="font-size:12px;color:#909399">操作人: {{ h.admin_id }}</div>
          <div v-if="h.reason" style="font-size:12px;color:#909399">原因: {{ h.reason }}</div>
        </el-timeline-item>
      </el-timeline>
      <el-empty v-else description="暂无修改记录" />
    </el-dialog>

    <!-- 新增索引对话框 -->
    <el-dialog v-model="addIndexDialogVisible" title="新增索引" width="460px">
      <el-form :model="indexForm" label-width="90px">
        <el-form-item label="数据表">
          <el-input :value="selectedTable" disabled />
        </el-form-item>
        <el-form-item label="索引名">
          <el-input v-model="indexForm.name" placeholder="可选，留空自动生成" />
        </el-form-item>
        <el-form-item label="索引字段">
          <el-select v-model="indexForm.columns" multiple placeholder="选择字段" style="width:100%">
            <el-option v-for="col in tableColumns" :key="col.name" :label="col.name" :value="col.name" />
          </el-select>
        </el-form-item>
        <el-form-item label="唯一索引">
          <el-switch v-model="indexForm.unique" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="addIndexDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleAddIndex" :loading="submitting">创建索引</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import request from '@/utils/request'
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

const groupedConfigs = computed(() => {
  const groups = {}
  for (const c of allConfigs.value) {
    const g = c.config_group || 'general'
    if (!groups[g]) groups[g] = []
    groups[g].push(c)
  }
  return groups
})

const fetchConfigs = async () => {
  configLoading.value = true
  try {
    const res = await request({ url: '/system-configs', method: 'get' })
    const data = res.data || res.list || []
    allConfigs.value = data.map(c => ({
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
    await request({ url: '/system-configs/batch', method: 'post', data: { updates, reason: '管理后台批量更新' } })
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
    await request({ url: '/system-configs/refresh-cache', method: 'post' })
    ElMessage.success('缓存已刷新')
  } catch (e) {
    console.error('刷新缓存失败:', e)
  } finally {
    refreshing.value = false
  }
}

const showHistory = async (row) => {
  try {
    const res = await request({ url: `/system-configs/${row.config_key}/history`, method: 'get' })
    configHistory.value = res.data || []
    historyDialogVisible.value = true
  } catch (e) {
    console.error('获取历史失败:', e)
  }
}

const groupLabel = (g) => ({
  general: '基础设置', commission: '佣金分销', order: '订单配置',
  security: '安全配置', notification: '通知设置', ai: 'AI 配置'
}[g] || g)

// ===== 数据库索引 =====
const tablesLoading = ref(false)
const indexLoading = ref(false)
const submitting = ref(false)
const addIndexDialogVisible = ref(false)
const selectedTable = ref('')
const tableSearch = ref('')
const dbTables = ref([])
const tableIndexes = ref([])
const tableColumns = ref([])
const indexForm = reactive({ name: '', columns: [], unique: false })

const filteredTables = computed(() =>
  tableSearch.value
    ? dbTables.value.filter(t => t.name.includes(tableSearch.value))
    : dbTables.value
)

const fetchTables = async () => {
  tablesLoading.value = true
  try {
    const res = await request({ url: '/db-indexes/tables', method: 'get' })
    dbTables.value = res.data || []
  } catch (e) {
    console.error('获取表列表失败:', e)
  } finally {
    tablesLoading.value = false
  }
}

const selectTable = async (tableName) => {
  selectedTable.value = tableName
  indexLoading.value = true
  try {
    const [idxRes, colRes] = await Promise.all([
      request({ url: `/db-indexes/${tableName}`, method: 'get' }),
      request({ url: `/db-indexes/${tableName}/columns`, method: 'get' })
    ])
    tableIndexes.value = idxRes.data || []
    tableColumns.value = colRes.data || []
  } catch (e) {
    console.error('获取索引/列信息失败:', e)
  } finally {
    indexLoading.value = false
  }
}

const showAddIndexDialog = () => {
  Object.assign(indexForm, { name: '', columns: [], unique: false })
  addIndexDialogVisible.value = true
}

const handleAddIndex = async () => {
  if (!indexForm.columns.length) { ElMessage.warning('请选择至少一个字段'); return }
  submitting.value = true
  try {
    await request({ url: '/db-indexes', method: 'post', data: { table: selectedTable.value, ...indexForm } })
    ElMessage.success('索引创建成功')
    addIndexDialogVisible.value = false
    selectTable(selectedTable.value)
  } catch (e) {
    console.error('创建索引失败:', e)
  } finally {
    submitting.value = false
  }
}

const handleDeleteIndex = async (row) => {
  try {
    await ElMessageBox.confirm(`确认删除索引 "${row.name}"？删除后不可撤销。`, '删除索引', { type: 'warning' })
    await request({ url: `/db-indexes/${selectedTable.value}/${row.name}`, method: 'delete' })
    ElMessage.success('索引已删除')
    selectTable(selectedTable.value)
  } catch (e) {
    if (e !== 'cancel') console.error('删除索引失败:', e)
  }
}

const formatDate = (d) => d ? dayjs(d).format('YYYY-MM-DD HH:mm') : '-'

onMounted(() => {
  fetchConfigs()
  fetchTables()
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
.table-list-header { font-size: 13px; font-weight: 600; color: #303133; margin-bottom: 8px; }
.table-list { max-height: 480px; overflow-y: auto; border: 1px solid #ebeef5; border-radius: 6px; }
.table-item { padding: 10px 14px; cursor: pointer; border-bottom: 1px solid #f5f7fa; display: flex; justify-content: space-between; align-items: center; transition: background 0.15s; }
.table-item:hover { background: #f0f7ff; }
.table-item.is-selected { background: #ecf5ff; border-left: 3px solid #409eff; }
.table-name { font-size: 13px; font-family: monospace; }
.table-meta { font-size: 11px; color: #909399; }
.no-table-selected { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 300px; gap: 12px; color: #c0c4cc; font-size: 14px; }
.index-header { display: flex; align-items: center; gap: 10px; padding: 8px 0 12px; }
.index-count { font-size: 12px; color: #909399; background: #f5f7fa; padding: 2px 8px; border-radius: 10px; }
</style>
