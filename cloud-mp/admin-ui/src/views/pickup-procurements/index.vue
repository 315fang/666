<template>
  <div class="pickup-procurements-page">
    <el-card>
      <template #header>
        <div class="header-row">
          <span>门店采购审批 / 备货管理</span>
          <el-button size="small" @click="fetchList" :loading="loading">刷新</el-button>
        </div>
      </template>

      <el-alert
        title="店长在小程序提交采购申请；后台审批通过后扣减店长货款，并进入待入库。"
        type="warning"
        :closable="false"
        show-icon
        style="margin-bottom: 16px;"
      />

      <el-form :inline="true" :model="filters" class="filter-row">
        <el-form-item label="门店">
          <el-select v-model="filters.station_id" clearable placeholder="全部门店" style="width: 220px">
            <el-option v-for="item in stationOptions" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="filters.status" clearable placeholder="全部状态" style="width: 180px">
            <el-option label="待审批" value="pending_approval" />
            <el-option label="待入库" value="pending_receive" />
            <el-option label="已入库" value="received" />
            <el-option label="已拒绝" value="rejected" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="fetchList">搜索</el-button>
        </el-form-item>
      </el-form>

      <el-table :data="list" v-loading="loading" stripe>
        <el-table-column prop="procurement_no" label="采购单号" width="180" />
        <el-table-column label="门店" min-width="180">
          <template #default="{ row }">
            <div>{{ row.station?.name || row.station_snapshot?.name || '-' }}</div>
            <div class="sub">{{ row.station?.city || row.station_snapshot?.city || '' }} {{ row.station?.district || row.station_snapshot?.district || '' }}</div>
            <div class="sub" v-if="row.receive_snapshot?.full_address || row.receive_address">收货：{{ row.receive_snapshot?.full_address || row.receive_address }}</div>
            <div class="sub" v-if="row.receive_snapshot?.contact_name || row.receive_contact_name || row.receive_snapshot?.contact_phone || row.receive_contact_phone">
              联系人：{{ row.receive_snapshot?.contact_name || row.receive_contact_name || '-' }} {{ row.receive_snapshot?.contact_phone || row.receive_contact_phone || '' }}
            </div>
          </template>
        </el-table-column>
        <el-table-column label="店长" min-width="150">
          <template #default="{ row }">
            <div>{{ row.claimant?.nickname || row.claimant?.nickName || row.claimant_openid || '-' }}</div>
            <div class="sub" v-if="row.claimant?.invite_code">{{ row.claimant.invite_code }}</div>
          </template>
        </el-table-column>
        <el-table-column label="商品" min-width="220">
          <template #default="{ row }">
            <div>{{ row.product?.name || row.product_snapshot?.name || '-' }}</div>
            <div class="sub" v-if="row.sku?.name || row.product_snapshot?.sku_name">{{ row.sku?.name || row.product_snapshot?.sku_name || '' }} {{ row.sku?.spec || row.product_snapshot?.sku_spec || '' }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="quantity" label="数量" width="90" />
        <el-table-column label="成本价" width="110">
          <template #default="{ row }">¥{{ Number(row.cost_price || 0).toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="总成本" width="110">
          <template #default="{ row }">¥{{ Number(row.total_cost || 0).toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="供应商/经办人" min-width="180">
          <template #default="{ row }">
            <div>{{ row.supplier_name || '-' }}</div>
            <div class="sub">{{ row.operator_name || '-' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="预计到货" width="120">
          <template #default="{ row }">{{ row.expected_arrival_date || '-' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)">{{ statusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="备注/审核" min-width="180">
          <template #default="{ row }">
            <div>{{ row.remark || '-' }}</div>
            <div class="sub" v-if="row.review_reason">审核：{{ row.review_reason }}</div>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="190" fixed="right">
          <template #default="{ row }">
            <template v-if="row.status === 'pending_approval'">
              <el-button text type="success" size="small" @click="handleApprove(row)">通过</el-button>
              <el-button text type="danger" size="small" @click="openReject(row)">拒绝</el-button>
            </template>
            <el-button v-else-if="row.status === 'pending_receive'" text type="primary" size="small" @click="handleReceive(row)">确认入库</el-button>
            <span v-else class="sub">无操作</span>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="rejectVisible" title="拒绝采购申请" width="420px">
      <el-form label-width="80px">
        <el-form-item label="拒绝原因" required>
          <el-input v-model="rejectForm.reason" type="textarea" :rows="4" maxlength="120" show-word-limit placeholder="请输入拒绝原因" />
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
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  approvePickupProcurement,
  getPickupProcurements,
  getPickupStations,
  receivePickupProcurement,
  rejectPickupProcurement
} from '@/api'

const loading = ref(false)
const submitting = ref(false)
const rejectVisible = ref(false)
const currentRow = ref(null)
const list = ref([])
const stationOptions = ref([])

const filters = reactive({
  station_id: '',
  status: ''
})

const rejectForm = reactive({
  reason: ''
})

const statusText = (status) => ({
  pending_approval: '待审批',
  pending_receive: '待入库',
  received: '已入库',
  rejected: '已拒绝'
}[status] || status || '-')

const statusTagType = (status) => ({
  pending_approval: 'warning',
  pending_receive: 'info',
  received: 'success',
  rejected: 'danger'
}[status] || '')

async function fetchBaseOptions() {
  const stationsRes = await getPickupStations({ limit: 200 })
  stationOptions.value = stationsRes?.data?.list || stationsRes?.list || []
}

async function fetchList() {
  loading.value = true
  try {
    const res = await getPickupProcurements({
      station_id: filters.station_id || undefined,
      status: filters.status || undefined,
      limit: 200
    })
    list.value = res?.data?.list || res?.list || []
  } finally {
    loading.value = false
  }
}

async function handleApprove(row) {
  try {
    await ElMessageBox.confirm(`确认通过采购申请 ${row.procurement_no}？\n通过后将扣减店长货款 ¥${Number(row.total_cost || 0).toFixed(2)}，并进入待入库。`, '审核通过', {
      confirmButtonText: '确认通过',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await approvePickupProcurement(row.id)
    ElMessage.success('已审核通过')
    fetchList()
  } catch (error) {
    if (error !== 'cancel') ElMessage.error(error?.message || '审核失败')
  }
}

function openReject(row) {
  currentRow.value = row
  rejectForm.reason = ''
  rejectVisible.value = true
}

async function handleReject() {
  if (!currentRow.value) return
  const reason = rejectForm.reason.trim()
  if (!reason) {
    ElMessage.warning('请输入拒绝原因')
    return
  }
  submitting.value = true
  try {
    await rejectPickupProcurement(currentRow.value.id, { reason })
    ElMessage.success('已拒绝')
    rejectVisible.value = false
    fetchList()
  } catch (error) {
    ElMessage.error(error?.message || '操作失败')
  } finally {
    submitting.value = false
  }
}

async function handleReceive(row) {
  try {
    await ElMessageBox.confirm(`确认将采购单 ${row.procurement_no} 入库到门店库存？`, '确认入库', {
      type: 'warning'
    })
    await receivePickupProcurement(row.id)
    ElMessage.success('已完成门店入库')
    fetchList()
  } catch (error) {
    if (error !== 'cancel') ElMessage.error(error?.message || '入库失败')
  }
}

onMounted(async () => {
  await Promise.all([fetchBaseOptions(), fetchList()])
})
</script>

<style scoped>
.header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.filter-row {
  margin-bottom: 12px;
}

.sub {
  color: #909399;
  font-size: 12px;
}
</style>
