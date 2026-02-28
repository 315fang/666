<template>
  <div class="dealers-page">
    <el-card>
      <template #header>
        <span>经销商管理</span>
      </template>

      <!-- 搜索栏 -->
      <el-form :inline="true" :model="searchForm" class="search-form">
        <el-form-item label="状态">
          <el-select v-model="searchForm.status" placeholder="全部状态" clearable style="width:130px">
            <el-option label="待审批" value="pending" />
            <el-option label="已激活" value="active" />
            <el-option label="已拒绝" value="rejected" />
            <el-option label="已暂停" value="suspended" />
          </el-select>
        </el-form-item>
        <el-form-item label="关键词">
          <el-input v-model="searchForm.keyword" placeholder="名称/编号" clearable style="width:150px" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">搜索</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>

      <!-- 表格 -->
      <el-table :data="tableData" v-loading="loading" stripe>
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column label="经销商信息" min-width="180">
          <template #default="{ row }">
            <div class="dealer-info">
              <div class="dealer-name">{{ row.dealer_name || row.User?.nickname || '-' }}</div>
              <div class="dealer-code">编号: {{ row.dealer_no || '-' }}</div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="所属用户" width="130">
          <template #default="{ row }">
            {{ row.User?.nickname || row.user_id }}
          </template>
        </el-table-column>
        <el-table-column label="等级" width="100">
          <template #default="{ row }">
            <el-tag :type="levelTagType(row.level)" size="small">
              {{ levelText(row.level) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)" size="small">
              {{ statusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="申请时间" width="160">
          <template #default="{ row }">{{ formatDate(row.created_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <el-button text type="primary" size="small" @click="handleViewDetail(row)">详情</el-button>
            <template v-if="row.status === 'pending'">
              <el-button text type="success" size="small" @click="handleApprove(row)">审批</el-button>
              <el-button text type="danger" size="small" @click="handleReject(row)">拒绝</el-button>
            </template>
            <el-button v-if="row.status === 'active'" text type="warning" size="small" @click="handleSetLevel(row)">
              调整等级
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.limit"
        :total="pagination.total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="fetchData"
        @current-change="fetchData"
        style="margin-top: 20px; justify-content: flex-end;"
      />
    </el-card>

    <!-- 详情对话框 -->
    <el-dialog v-model="detailDialogVisible" title="经销商详情" width="600px">
      <el-descriptions :column="2" border v-if="currentDealer">
        <el-descriptions-item label="经销商名称">{{ currentDealer.dealer_name || '-' }}</el-descriptions-item>
        <el-descriptions-item label="经销商编号">{{ currentDealer.dealer_no || '-' }}</el-descriptions-item>
        <el-descriptions-item label="所属用户">{{ currentDealer.User?.nickname || currentDealer.user_id }}</el-descriptions-item>
        <el-descriptions-item label="等级">{{ levelText(currentDealer.level) }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="statusTagType(currentDealer.status)">{{ statusText(currentDealer.status) }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="申请时间">{{ formatDate(currentDealer.created_at) }}</el-descriptions-item>
        <el-descriptions-item label="审批时间">{{ formatDate(currentDealer.approved_at) }}</el-descriptions-item>
        <el-descriptions-item label="联系方式">{{ currentDealer.contact_info || '-' }}</el-descriptions-item>
        <el-descriptions-item label="申请说明" :span="2">{{ currentDealer.apply_reason || '-' }}</el-descriptions-item>
      </el-descriptions>
    </el-dialog>

    <!-- 调整等级对话框 -->
    <el-dialog v-model="levelDialogVisible" title="调整经销商等级" width="400px">
      <el-form label-width="80px">
        <el-form-item label="当前等级">
          <el-tag>{{ levelText(currentDealer?.level) }}</el-tag>
        </el-form-item>
        <el-form-item label="新等级">
          <el-select v-model="newLevel" style="width:100%">
            <el-option label="普通经销商 (L1)" :value="1" />
            <el-option label="高级经销商 (L2)" :value="2" />
            <el-option label="白金经销商 (L3)" :value="3" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="levelDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitLevelChange" :loading="submitting">确认调整</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import request from '@/utils/request'
import dayjs from 'dayjs'

const loading = ref(false)
const submitting = ref(false)
const detailDialogVisible = ref(false)
const levelDialogVisible = ref(false)
const currentDealer = ref(null)
const newLevel = ref(1)

const searchForm = reactive({ status: '', keyword: '' })
const pagination = reactive({ page: 1, limit: 10, total: 0 })
const tableData = ref([])

const fetchData = async () => {
  loading.value = true
  try {
    const res = await request({
      url: '/dealers',
      method: 'get',
      params: { ...searchForm, page: pagination.page, limit: pagination.limit }
    })
    tableData.value = res.list || res.data?.list || []
    pagination.total = res.total || res.data?.total || 0
  } catch (e) {
    console.error('获取经销商列表失败:', e)
  } finally {
    loading.value = false
  }
}

const handleSearch = () => { pagination.page = 1; fetchData() }
const handleReset = () => { searchForm.status = ''; searchForm.keyword = ''; handleSearch() }

const handleViewDetail = (row) => {
  currentDealer.value = row
  detailDialogVisible.value = true
}

const handleApprove = async (row) => {
  try {
    await ElMessageBox.confirm(`确认审批通过 "${row.dealer_name || row.User?.nickname}" 的经销商申请？`, '审批确认', {
      confirmButtonText: '确认审批',
      cancelButtonText: '取消',
      type: 'success'
    })
    await request({ url: `/dealers/${row.id}/approve`, method: 'put' })
    ElMessage.success('已审批通过')
    fetchData()
  } catch (e) {
    if (e !== 'cancel') console.error('审批失败:', e)
  }
}

const handleReject = async (row) => {
  try {
    const { value: reason } = await ElMessageBox.prompt('请输入拒绝原因', '拒绝申请', {
      confirmButtonText: '确认拒绝',
      cancelButtonText: '取消',
      inputPlaceholder: '请填写拒绝原因...',
      type: 'warning'
    })
    await request({ url: `/dealers/${row.id}/reject`, method: 'put', data: { reason } })
    ElMessage.success('已拒绝申请')
    fetchData()
  } catch (e) {
    if (e !== 'cancel') console.error('拒绝失败:', e)
  }
}

const handleSetLevel = (row) => {
  currentDealer.value = row
  newLevel.value = row.level || 1
  levelDialogVisible.value = true
}

const submitLevelChange = async () => {
  submitting.value = true
  try {
    await request({ url: `/dealers/${currentDealer.value.id}/level`, method: 'put', data: { level: newLevel.value } })
    ElMessage.success('等级调整成功')
    levelDialogVisible.value = false
    fetchData()
  } catch (e) {
    console.error('调整失败:', e)
  } finally {
    submitting.value = false
  }
}

const levelText = (l) => ({ 1: 'L1 普通', 2: 'L2 高级', 3: 'L3 白金' }[l] || `L${l}`)
const levelTagType = (l) => ({ 1: '', 2: 'warning', 3: 'danger' }[l] || '')
const statusText = (s) => ({ pending: '待审批', active: '已激活', rejected: '已拒绝', suspended: '已暂停' }[s] || s)
const statusTagType = (s) => ({ pending: 'warning', active: 'success', rejected: 'danger', suspended: 'info' }[s] || '')
const formatDate = (d) => d ? dayjs(d).format('YYYY-MM-DD HH:mm') : '-'

onMounted(fetchData)
</script>

<style scoped>
.dealers-page { padding: 0; }
.search-form { margin-bottom: 20px; }
.dealer-info { line-height: 1.4; }
.dealer-name { font-weight: 500; }
.dealer-code { font-size: 12px; color: #909399; }
</style>
