<template>
  <div class="log-list">
    <div class="header-actions">
      <h2>操作日志</h2>
      <div class="actions">
        <el-button type="primary" icon="Download" @click="handleExport">导出日志</el-button>
        <el-popconfirm title="确定清理30天前的日志吗？" @confirm="handleCleanup">
          <template #reference>
            <el-button type="danger" icon="Delete">清理旧日志</el-button>
          </template>
        </el-popconfirm>
      </div>
    </div>

    <!-- 搜索栏 -->
    <el-card shadow="never" class="search-card">
      <el-form :inline="true" :model="queryParams" class="demo-form-inline">
        <el-form-item label="操作人">
          <el-input v-model="queryParams.username" placeholder="用户名" clearable></el-input>
        </el-form-item>
        <el-form-item label="操作类型">
          <el-select v-model="queryParams.action" placeholder="全部" clearable>
            <el-option label="全部" value=""></el-option>
            <el-option label="登录" value="login"></el-option>
            <el-option label="创建" value="create"></el-option>
            <el-option label="更新" value="update"></el-option>
            <el-option label="删除" value="delete"></el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="日期范围">
          <el-date-picker
            v-model="dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD"
            @change="handleDateChange"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">查询</el-button>
          <el-button @click="resetSearch">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 日志列表 -->
    <el-card shadow="never" class="table-card">
      <el-table :data="logs" v-loading="loading" style="width: 100%">
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="username" label="操作人" width="120" />
        <el-table-column prop="action" label="操作" width="100">
          <template #default="scope">
            <el-tag :type="getActionType(scope.row.action)">{{ scope.row.action }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="resource" label="资源" width="120" />
        <el-table-column prop="details" label="详情" min-width="200" show-overflow-tooltip />
        <el-table-column prop="ip_address" label="IP地址" width="140" />
        <el-table-column prop="created_at" label="操作时间" width="180">
          <template #default="scope">
            {{ formatDate(scope.row.created_at) }}
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-container">
        <el-pagination
          v-model:current-page="queryParams.page"
          v-model:page-size="queryParams.limit"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          :total="total"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { getLogs, exportLogs, cleanupLogs } from '@/api/log'
import { ElMessage } from 'element-plus'

const loading = ref(false)
const logs = ref([])
const total = ref(0)
const dateRange = ref([])

const queryParams = reactive({
  page: 1,
  limit: 20,
  username: '',
  action: '',
  start_date: '',
  end_date: ''
})

onMounted(() => {
  loadLogs()
})

async function loadLogs() {
  loading.value = true
  try {
    const res = await getLogs(queryParams)
    if (res.code === 0) {
      logs.value = res.data.list
      total.value = res.data.pagination.total
    }
  } catch (err) {
    console.error(err)
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  queryParams.page = 1
  loadLogs()
}

function resetSearch() {
  queryParams.username = ''
  queryParams.action = ''
  queryParams.start_date = ''
  queryParams.end_date = ''
  dateRange.value = []
  handleSearch()
}

function handleDateChange(val) {
  if (val) {
    queryParams.start_date = val[0]
    queryParams.end_date = val[1]
  } else {
    queryParams.start_date = ''
    queryParams.end_date = ''
  }
}

function handleSizeChange(val) {
  queryParams.limit = val
  loadLogs()
}

function handleCurrentChange(val) {
  queryParams.page = val
  loadLogs()
}

async function handleExport() {
  try {
    const res = await exportLogs(queryParams)
    // 处理文件下载
    const blob = new Blob([res], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `activity_logs_${new Date().getTime()}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  } catch (err) {
    ElMessage.error('导出失败')
  }
}

async function handleCleanup() {
  try {
    const res = await cleanupLogs(30)
    if (res.code === 0) {
      ElMessage.success(`清理成功，共删除 ${res.data.deletedCount} 条日志`)
      loadLogs()
    }
  } catch (err) {
    ElMessage.error('清理失败')
  }
}

function getActionType(action) {
  const map = {
    'login': 'success',
    'create': 'primary',
    'update': 'warning',
    'delete': 'danger'
  }
  return map[action] || 'info'
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleString()
}
</script>

<style scoped>
.header-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.search-card {
  margin-bottom: 20px;
}

.pagination-container {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}
</style>
