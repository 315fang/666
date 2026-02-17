<template>
  <div class="db-index-page">
    <div class="page-header">
      <h2>
        <el-icon><DataAnalysis /></el-icon>
        索引管理
      </h2>
      <div class="header-actions">
        <el-button @click="refreshAll" :loading="loading">
          <el-icon><Refresh /></el-icon> 刷新
        </el-button>
      </div>
    </div>

    <el-card class="table-selector">
      <div class="selector-row">
        <div class="selector-label">选择数据表</div>
        <el-select v-model="selectedTable" filterable placeholder="请选择表" @change="loadTableDetails">
          <el-option
            v-for="table in tables"
            :key="table.name"
            :label="table.name"
            :value="table.name"
          />
        </el-select>
        <el-tag v-if="tableMeta" type="info">
          行数 {{ tableMeta.rows }}，数据 {{ formatSize(tableMeta.dataLength) }}，索引 {{ formatSize(tableMeta.indexLength) }}
        </el-tag>
      </div>
    </el-card>

    <el-row :gutter="20">
      <el-col :span="12">
        <el-card>
          <template #header>
            <span>字段列表</span>
          </template>
          <el-table :data="columns" style="width: 100%" v-loading="detailLoading">
            <el-table-column prop="name" label="字段名" width="160" />
            <el-table-column prop="type" label="类型" width="160" />
            <el-table-column prop="nullable" label="可空" width="90" />
            <el-table-column prop="defaultValue" label="默认值" min-width="120" />
            <el-table-column prop="comment" label="说明" min-width="160" />
          </el-table>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card>
          <template #header>
            <span>索引列表</span>
          </template>
          <el-table :data="indexes" style="width: 100%" v-loading="detailLoading">
            <el-table-column prop="name" label="索引名" min-width="160" />
            <el-table-column prop="unique" label="唯一" width="80">
              <template #default="{ row }">
                <el-tag :type="row.unique ? 'success' : 'info'">{{ row.unique ? '是' : '否' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="type" label="类型" width="100" />
            <el-table-column prop="columns" label="字段" min-width="180">
              <template #default="{ row }">
                <el-tag v-for="col in row.columns" :key="col" class="column-tag">
                  {{ col }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="120">
              <template #default="{ row }">
                <el-button
                  link
                  type="danger"
                  :disabled="row.primary"
                  @click="confirmDrop(row)"
                >
                  删除
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>

    <el-card class="create-card">
      <template #header>
        <span>新建索引</span>
      </template>
      <el-form :model="createForm" label-width="100px">
        <el-form-item label="索引名称">
          <el-input v-model="createForm.name" placeholder="可留空自动生成" />
        </el-form-item>
        <el-form-item label="字段选择">
          <el-select v-model="createForm.columns" multiple filterable placeholder="请选择字段">
            <el-option
              v-for="col in columns"
              :key="col.name"
              :label="col.name"
              :value="col.name"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="唯一索引">
          <el-switch v-model="createForm.unique" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="createLoading" @click="submitCreate">
            创建索引
          </el-button>
          <el-button @click="resetCreate">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { DataAnalysis, Refresh } from '@element-plus/icons-vue'
import { getDbTables, getDbTableColumns, getDbTableIndexes, createDbIndex, dropDbIndex } from '@/api/dbIndexes'

const tables = ref([])
const selectedTable = ref('')
const tableMeta = ref(null)
const columns = ref([])
const indexes = ref([])
const loading = ref(false)
const detailLoading = ref(false)
const createLoading = ref(false)

const createForm = reactive({
  name: '',
  columns: [],
  unique: false
})

const formatSize = (bytes) => {
  if (bytes == null) return '-'
  const units = ['B', 'KB', 'MB', 'GB']
  let size = Number(bytes)
  let unitIndex = 0
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`
}

const refreshAll = async () => {
  loading.value = true
  try {
    const data = await getDbTables()
    tables.value = data
    if (!selectedTable.value && tables.value.length > 0) {
      selectedTable.value = tables.value[0].name
    }
    if (selectedTable.value) {
      await loadTableDetails()
    }
  } finally {
    loading.value = false
  }
}

const loadTableDetails = async () => {
  if (!selectedTable.value) return
  detailLoading.value = true
  try {
    const [columnData, indexData] = await Promise.all([
      getDbTableColumns(selectedTable.value),
      getDbTableIndexes(selectedTable.value)
    ])
    columns.value = columnData
    indexes.value = indexData
    tableMeta.value = tables.value.find(t => t.name === selectedTable.value) || null
  } finally {
    detailLoading.value = false
  }
}

const resetCreate = () => {
  createForm.name = ''
  createForm.columns = []
  createForm.unique = false
}

const submitCreate = async () => {
  if (!selectedTable.value) {
    ElMessage.error('请先选择数据表')
    return
  }
  if (!createForm.columns.length) {
    ElMessage.error('请选择索引字段')
    return
  }
  createLoading.value = true
  try {
    await createDbIndex({
      table: selectedTable.value,
      name: createForm.name || undefined,
      columns: createForm.columns,
      unique: createForm.unique
    })
    ElMessage.success('索引创建成功')
    resetCreate()
    await loadTableDetails()
  } finally {
    createLoading.value = false
  }
}

const confirmDrop = (row) => {
  if (row.primary) return
  ElMessageBox.confirm(`确定删除索引 ${row.name} 吗？`, '提示', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(async () => {
    await dropDbIndex(selectedTable.value, row.name)
    ElMessage.success('索引已删除')
    await loadTableDetails()
  }).catch(() => {})
}

onMounted(refreshAll)
</script>

<style scoped>
.db-index-page {
  padding: 20px;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.page-header h2 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
}

.table-selector {
  margin-bottom: 20px;
}

.selector-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.selector-label {
  font-weight: 500;
  color: var(--el-text-color-primary);
}

.column-tag {
  margin-right: 6px;
}

.create-card {
  margin-top: 20px;
}
</style>
