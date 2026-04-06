<template>
  <div class="logs-page">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>操作日志</span>
          <el-button type="success" plain @click="handleExport" :loading="exporting">
            <el-icon><Download /></el-icon>
            导出日志
          </el-button>
        </div>
      </template>

      <!-- 搜索栏 -->
      <el-form :inline="true" :model="searchForm" class="search-form">
        <el-form-item label="操作类型">
          <el-select v-model="searchForm.action" placeholder="全部" clearable style="width:130px">
            <el-option label="登录" value="login" />
            <el-option label="创建" value="create" />
            <el-option label="更新" value="update" />
            <el-option label="删除" value="delete" />
            <el-option label="审批" value="approve" />
            <el-option label="发货" value="ship" />
          </el-select>
        </el-form-item>
        <el-form-item label="资源类型">
          <el-select v-model="searchForm.resource" placeholder="全部" clearable style="width:130px">
            <el-option label="订单" value="order" />
            <el-option label="用户" value="user" />
            <el-option label="商品" value="product" />
            <el-option label="提现" value="withdrawal" />
            <el-option label="佣金" value="commission" />
          </el-select>
        </el-form-item>
        <el-form-item label="时间范围">
          <el-date-picker
            v-model="searchForm.dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            style="width: 220px"
            value-format="YYYY-MM-DD"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">搜索</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>

      <!-- 表格 -->
      <el-table :data="tableData" v-loading="loading" stripe>
        <el-table-column prop="id" label="ID" width="70" class-name="hide-mobile" />
        <el-table-column label="操作人" width="130" class-name="hide-mobile">
          <template #default="{ row }">
            <div>
              <div>{{ row.admin_username || row.admin_id || '-' }}</div>
              <div style="font-size:11px;color:#909399">{{ row.ip_address || '' }}</div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="操作类型" width="100">
          <template #default="{ row }">
            <el-tag :type="actionTagType(row.action)" size="small">{{ row.action }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="资源" width="100">
          <template #default="{ row }">
            <el-tag type="info" size="small">{{ row.resource_type }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="resource_id" label="资源ID" width="90" class-name="hide-mobile" />
        <el-table-column prop="description" label="操作描述" min-width="200" show-overflow-tooltip />
        <el-table-column label="结果" width="80">
          <template #default="{ row }">
            <el-tag :type="row.status === 'success' ? 'success' : 'danger'" size="small">
              {{ row.status === 'success' ? '成功' : '失败' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="时间" width="160" class-name="hide-mobile">
          <template #default="{ row }">{{ formatDate(row.created_at) }}</template>
        </el-table-column>
        <el-table-column label="详情" width="80">
          <template #default="{ row }">
            <el-button v-if="row.changes" text type="primary" size="small" @click="showDetail(row)">查看</el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.limit"
        :total="pagination.total"
        :page-sizes="[20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="fetchData"
        @current-change="fetchData"
        style="margin-top: 20px; justify-content: flex-end;"
      />
    </el-card>

    <!-- 变更详情对话框 -->
    <el-dialog v-model="detailDialogVisible" title="变更详情" width="600px">
      <pre class="changes-pre">{{ currentChanges }}</pre>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getLogs, exportLogs } from '@/api'
import { usePagination } from '@/composables/usePagination'
import { formatDate } from '@/utils/format'
import dayjs from 'dayjs'

const loading = ref(false)
const exporting = ref(false)
const detailDialogVisible = ref(false)
const currentChanges = ref('')

const searchForm = reactive({ action: '', resource: '', dateRange: [] })
const { pagination, resetPage, applyResponse } = usePagination()
const tableData = ref([])

const fetchData = async () => {
  loading.value = true
  try {
    const params = {
      action: searchForm.action,
      resource: searchForm.resource,
      page: pagination.page,
      limit: pagination.limit
    }
    if (searchForm.dateRange?.length === 2) {
      params.start_date = searchForm.dateRange[0]
      params.end_date = searchForm.dateRange[1]
    }
    const res = await getLogs(params)
    tableData.value = res?.list || []
    applyResponse(res)
  } catch (e) {
    console.error('获取日志失败:', e)
  } finally {
    loading.value = false
  }
}

const handleSearch = () => { resetPage(); fetchData() }
const handleReset = () => {
  searchForm.action = ''
  searchForm.resource = ''
  searchForm.dateRange = []
  handleSearch()
}

const handleExport = async () => {
  exporting.value = true
  try {
    const res = await exportLogs(searchForm)
    const url = URL.createObjectURL(res)
    const a = document.createElement('a')
    a.href = url
    a.download = `操作日志_${dayjs().format('YYYYMMDD')}.csv`
    a.click()
    URL.revokeObjectURL(url)
    ElMessage.success('导出成功')
  } catch (e) {
    console.error('导出失败:', e)
  } finally {
    exporting.value = false
  }
}

const showDetail = (row) => {
  try {
    currentChanges.value = JSON.stringify(
      typeof row.changes === 'string' ? JSON.parse(row.changes) : row.changes,
      null, 2
    )
  } catch {
    currentChanges.value = row.changes || ''
  }
  detailDialogVisible.value = true
}

const actionTagType = (a) => ({
  login: 'primary', create: 'success', update: 'warning', delete: 'danger', approve: 'success', ship: 'info'
}[a] || '')

onMounted(fetchData)
</script>

<style scoped>
.logs-page { padding: 0; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.search-form { margin-bottom: 20px; }
.changes-pre { background: #f5f7fa; padding: 16px; border-radius: 4px; font-size: 13px; max-height: 400px; overflow-y: auto; white-space: pre-wrap; word-break: break-all; margin: 0; }
</style>
