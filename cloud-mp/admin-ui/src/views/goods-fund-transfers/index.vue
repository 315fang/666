<template>
  <div class="goods-fund-transfers-page">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>货款划拨审核</span>
          <el-button size="small" @click="fetchList" :loading="loading">刷新</el-button>
        </div>
      </template>

      <el-alert
        title="该列表用于审核直属下级的货款划拨申请。审核通过后，将从上级货款余额划拨到下级货款余额。"
        type="warning"
        :closable="false"
        show-icon
        style="margin-bottom: 16px;"
      />

      <el-form :inline="true" :model="searchForm" class="search-form">
        <el-form-item label="关键字">
          <el-input v-model="searchForm.keyword" placeholder="单号 / 上级 / 下级 / 成员ID" clearable @keyup.enter="handleSearch" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="searchForm.status" clearable style="width: 130px">
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

      <el-table :data="tableData" v-loading="loading" stripe>
        <el-table-column label="申请单号" width="170">
          <template #default="{ row }">
            <CompactIdCell :value="row.application_no || row.id" :full-value="row.application_no || row.id" />
          </template>
        </el-table-column>
        <el-table-column label="上级" min-width="170">
          <template #default="{ row }">
            <div>{{ row.from_snapshot?.nickname || '—' }}</div>
            <div class="sub">{{ row.from_snapshot?.role_name || '—' }} / {{ row.from_snapshot?.invite_code || '暂无ID' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="下级" min-width="170">
          <template #default="{ row }">
            <div>{{ row.to_snapshot?.nickname || '—' }}</div>
            <div class="sub">{{ row.to_snapshot?.role_name || '—' }} / {{ row.to_snapshot?.invite_code || '暂无ID' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="来源" width="120">
          <template #default="{ row }">{{ row.relation_source_text || '普通邀请' }}</template>
        </el-table-column>
        <el-table-column label="金额" width="110">
          <template #default="{ row }">¥{{ Number(row.amount || 0).toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="上级余额" width="110">
          <template #default="{ row }">¥{{ Number(row.from_goods_fund_balance || 0).toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)">{{ row.status_text }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="170">
          <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button v-if="row.status === 'pending'" text type="success" size="small" @click="handleApprove(row)">通过</el-button>
            <el-button v-if="row.status === 'pending'" text type="danger" size="small" @click="openReject(row)">拒绝</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.limit"
        :total="pagination.total"
        :page-sizes="pagination.pageSizes"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="handleSearch"
        @current-change="fetchList"
        style="margin-top:20px; justify-content:flex-end;"
      />
    </el-card>

    <el-dialog v-model="rejectVisible" title="拒绝货款划拨申请" width="420px">
      <el-form label-width="80px">
        <el-form-item label="拒绝原因">
          <el-input v-model="rejectForm.reason" type="textarea" :rows="4" placeholder="请输入拒绝原因" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="rejectVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleReject">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import CompactIdCell from '@/components/CompactIdCell.vue'
import { usePagination } from '@/composables/usePagination'
import { formatDateTime } from '@/utils/format'
import { getGoodsFundTransfers, approveGoodsFundTransfer, rejectGoodsFundTransfer } from '@/api'

const loading = ref(false)
const submitting = ref(false)
const tableData = ref([])
const rejectVisible = ref(false)
const currentRow = ref(null)
const rejectForm = reactive({ reason: '' })
const searchForm = reactive({ keyword: '', status: '' })
const { pagination, resetPage, applyResponse } = usePagination()

const statusTagType = (status) => ({ pending: 'warning', approved: 'success', rejected: 'danger' }[status] || '')

const fetchList = async () => {
  loading.value = true
  try {
    const res = await getGoodsFundTransfers({
      ...searchForm,
      page: pagination.page,
      limit: pagination.limit
    })
    tableData.value = res?.list || []
    applyResponse(res)
  } catch (error) {
    ElMessage.error(error?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  resetPage()
  fetchList()
}

const handleReset = () => {
  searchForm.keyword = ''
  searchForm.status = ''
  handleSearch()
}

const handleApprove = async (row) => {
  try {
    await ElMessageBox.confirm(`确认审核通过该货款划拨申请？\n通过后将从上级货款账户划拨 ¥${Number(row.amount || 0).toFixed(2)} 给下级。`, '审核通过', {
      confirmButtonText: '确认通过',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await approveGoodsFundTransfer(row.id)
    ElMessage.success('已审核通过')
    fetchList()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error(error?.message || '审核失败')
    }
  }
}

const openReject = (row) => {
  currentRow.value = row
  rejectForm.reason = ''
  rejectVisible.value = true
}

const handleReject = async () => {
  if (!currentRow.value) return
  if (!rejectForm.reason.trim()) {
    ElMessage.warning('请输入拒绝原因')
    return
  }
  submitting.value = true
  try {
    await rejectGoodsFundTransfer(currentRow.value.id, { reason: rejectForm.reason.trim() })
    ElMessage.success('已拒绝')
    rejectVisible.value = false
    fetchList()
  } catch (error) {
    ElMessage.error(error?.message || '操作失败')
  } finally {
    submitting.value = false
  }
}

onMounted(() => {
  fetchList()
})
</script>

<style scoped>
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.search-form {
  margin-bottom: 16px;
}

.sub {
  margin-top: 4px;
  font-size: 12px;
  color: #909399;
}
</style>
