<template>
  <div class="refunds-page">
    <el-card>
      <template #header>
        售后管理
      </template>
      
      <!-- 搜索栏 -->
      <el-form :inline="true" :model="searchForm" class="search-form">
        <el-form-item label="状态">
          <el-select v-model="searchForm.status" placeholder="请选择状态" clearable>
            <el-option label="待审核" value="pending" />
            <el-option label="已通过" value="approved" />
            <el-option label="已拒绝" value="rejected" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">搜索</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
      
      <!-- 表格 -->
      <el-table :data="tableData" v-loading="loading">
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="order_no" label="订单号" width="200" />
        <el-table-column prop="user_name" label="用户" width="150" />
        <el-table-column prop="refund_amount" label="退款金额" width="120">
          <template #default="{ row }">
            ¥{{ row.refund_amount }}
          </template>
        </el-table-column>
        <el-table-column prop="reason" label="退款原因" min-width="200" show-overflow-tooltip />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)">
              {{ getStatusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="申请时间" width="180" />
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="row.status === 'pending'"
              text
              type="success"
              @click="handleApprove(row)"
            >
              通过
            </el-button>
            <el-button
              v-if="row.status === 'pending'"
              text
              type="danger"
              @click="handleReject(row)"
            >
              拒绝
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      
      <!-- 分页 -->
      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.limit"
        :total="pagination.total"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="handleSearch"
        @current-change="handleSearch"
        style="margin-top: 20px; justify-content: flex-end;"
      />
    </el-card>
    
    <!-- 拒绝对话框 -->
    <el-dialog v-model="rejectDialogVisible" title="拒绝售后" width="500px">
      <el-form :model="rejectForm" label-width="100px">
        <el-form-item label="拒绝原因">
          <el-input
            v-model="rejectForm.reason"
            type="textarea"
            :rows="4"
            placeholder="请输入拒绝原因"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="rejectDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleRejectSubmit">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getRefunds, approveRefund, rejectRefund } from '@/api'

const loading = ref(false)
const rejectDialogVisible = ref(false)

const searchForm = reactive({
  status: ''
})

const pagination = reactive({
  page: 1,
  limit: 10,
  total: 0
})

const tableData = ref([])

const rejectForm = reactive({
  id: null,
  reason: ''
})

const fetchRefunds = async () => {
  loading.value = true
  try {
    const params = {
      ...searchForm,
      page: pagination.page,
      limit: pagination.limit
    }
    const data = await getRefunds(params)
    tableData.value = data.list || []
    pagination.total = data.total || 0
  } catch (error) {
    console.error('获取售后列表失败:', error)
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  pagination.page = 1
  fetchRefunds()
}

const handleReset = () => {
  searchForm.status = ''
  handleSearch()
}

const handleApprove = async (row) => {
  try {
    await ElMessageBox.confirm('确认通过该售后申请？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
    
    await approveRefund(row.id)
    ElMessage.success('审核通过')
    fetchRefunds()
  } catch (error) {
    if (error !== 'cancel') {
      console.error('审核失败:', error)
    }
  }
}

const handleReject = (row) => {
  rejectForm.id = row.id
  rejectForm.reason = ''
  rejectDialogVisible.value = true
}

const handleRejectSubmit = async () => {
  if (!rejectForm.reason) {
    ElMessage.warning('请输入拒绝原因')
    return
  }
  
  try {
    await rejectRefund(rejectForm.id, { reason: rejectForm.reason })
    ElMessage.success('已拒绝')
    rejectDialogVisible.value = false
    fetchRefunds()
  } catch (error) {
    console.error('拒绝失败:', error)
  }
}

const getStatusType = (status) => {
  const map = {
    pending: 'warning',
    approved: 'success',
    rejected: 'danger'
  }
  return map[status] || 'info'
}

const getStatusText = (status) => {
  const map = {
    pending: '待审核',
    approved: '已通过',
    rejected: '已拒绝'
  }
  return map[status] || status
}

onMounted(() => {
  fetchRefunds()
})
</script>

<style scoped>
.refunds-page {
  padding: 0;
}

.search-form {
  margin-bottom: 20px;
}
</style>
