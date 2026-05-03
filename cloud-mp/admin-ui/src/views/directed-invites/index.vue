<template>
  <div class="page">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>B1 定向邀约审核</span>
          <el-button size="small" @click="fetchList" :loading="loading">刷新</el-button>
        </div>
      </template>

      <el-alert
        title="该列表仅审核已接受的 B1 定向邀约。审核通过即会升级对方为 B1，并从发起人货款余额划拨指定货款。"
        type="warning"
        :closable="false"
        show-icon
        style="margin-bottom: 16px;"
      />

      <el-form :inline="true" :model="searchForm" class="search-form">
        <el-form-item label="关键字">
          <el-input v-model="searchForm.keyword" placeholder="发起人/被邀人/票据ID" clearable @keyup.enter="handleSearch" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="searchForm.status" clearable style="width: 130px">
            <el-option label="邀约中" value="sent" />
            <el-option label="待审核" value="accepted" />
            <el-option label="已激活" value="activated" />
            <el-option label="已失效" value="expired" />
            <el-option label="已撤销" value="revoked" />
            <el-option label="已拒绝" value="rejected" />
          </el-select>
        </el-form-item>
        <el-form-item label="审核状态">
          <el-select v-model="searchForm.review_status" clearable style="width: 130px">
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
        <el-table-column label="邀约ID" width="110">
          <template #default="{ row }">
            <CompactIdCell :value="row.invite_id" :full-value="row.invite_id" />
          </template>
        </el-table-column>
        <el-table-column label="发起人" min-width="170">
          <template #default="{ row }">
            <div>{{ row.inviter_snapshot?.nickname || '—' }}</div>
            <div class="sub">{{ row.inviter_snapshot?.role_name || '—' }} / {{ row.inviter_snapshot?.invite_code || '暂无ID' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="被邀用户" min-width="170">
          <template #default="{ row }">
            <div>{{ row.accepted_user_snapshot?.nickname || '未接受' }}</div>
            <div class="sub">{{ row.accepted_user_snapshot?.invite_code || '暂无ID' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="货款金额" width="110">
          <template #default="{ row }">¥{{ Number(row.transfer_amount || 0).toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="发起人余额" width="110">
          <template #default="{ row }">¥{{ Number(row.inviter_goods_fund_balance || 0).toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="余额状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.inviter_balance_sufficient ? 'success' : 'danger'">{{ row.inviter_balance_sufficient ? '足额' : '不足' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag>{{ row.status_text }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="审核状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.review_status === 'approved' ? 'success' : row.review_status === 'rejected' ? 'danger' : 'warning'">
              {{ reviewStatusText(row.review_status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="时间" width="190">
          <template #default="{ row }">
            <div>创建：{{ formatDateTime(row.created_at) }}</div>
            <div>接受：{{ formatDateTime(row.accepted_at) || '—' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button v-if="canApprove(row)" text type="success" size="small" @click="handleApprove(row)">通过</el-button>
            <el-button v-if="canApprove(row)" text type="danger" size="small" @click="openReject(row)">拒绝</el-button>
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

    <el-dialog v-model="rejectVisible" title="拒绝定向邀约" width="420px">
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
import { getDirectedInvites, approveDirectedInvite, rejectDirectedInvite } from '@/api'

const loading = ref(false)
const submitting = ref(false)
const tableData = ref([])
const rejectVisible = ref(false)
const currentRow = ref(null)
const rejectForm = reactive({ reason: '' })
const searchForm = reactive({ keyword: '', status: '', review_status: '' })
const { pagination, resetPage, applyResponse } = usePagination()

const reviewStatusText = (status) => {
  const map = { pending: '待审核', approved: '已通过', rejected: '已拒绝' }
  return map[status] || '未进入审核'
}

const canApprove = (row) => row.status === 'accepted' && row.review_status === 'pending'

const fetchList = async () => {
  loading.value = true
  try {
    const res = await getDirectedInvites({
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
  searchForm.review_status = ''
  handleSearch()
}

const handleApprove = async (row) => {
  try {
    await ElMessageBox.confirm(`确认审核通过该定向邀约？\n通过后将为被邀用户激活 B1，并划拨 ¥${Number(row.transfer_amount || 0).toFixed(2)} 货款。`, '审核通过', {
      confirmButtonText: '确认通过',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await approveDirectedInvite(row.invite_id)
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
    await rejectDirectedInvite(currentRow.value.invite_id, { reason: rejectForm.reason.trim() })
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
