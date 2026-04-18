<template>
  <div class="deposit-orders-page">
    <el-card>
      <template #header>押金订单</template>

      <el-form :inline="true" :model="searchForm" class="filter-container">
        <el-form-item label="关键字">
          <el-input v-model="searchForm.keyword" placeholder="押金单号 / OPENID" clearable @keyup.enter="handleSearch" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="searchForm.status" placeholder="全部" clearable style="width: 180px;">
            <el-option label="待支付" value="pending_payment" />
            <el-option label="已支付" value="paid" />
            <el-option label="退款锁定" value="refund_locked" />
            <el-option label="部分退款" value="partially_refunded" />
            <el-option label="已退款" value="refunded" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">搜索</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>

      <el-table :data="tableData" v-loading="loading" stripe>
        <el-table-column prop="deposit_no" label="押金单号" min-width="180" />
        <el-table-column prop="openid" label="OPENID" min-width="180" show-overflow-tooltip />
        <el-table-column label="金额" width="180">
          <template #default="{ row }">
            <div>实付：¥{{ row.amount_paid }}</div>
            <div>已退：¥{{ row.refunded_total }}</div>
            <div>剩余：¥{{ row.refundable_balance }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="coupon_claim_state" label="兑换码状态" width="140" />
        <el-table-column prop="refund_count" label="退款次数" width="100" />
        <el-table-column prop="status" label="订单状态" width="140" />
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button text type="primary" size="small" @click="openDetail(row)">查看</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.limit"
        :total="pagination.total"
        :page-sizes="[20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        style="margin-top: 20px; justify-content: flex-end;"
        @size-change="fetchData"
        @current-change="fetchData"
      />
    </el-card>

    <el-dialog v-model="detailVisible" title="押金订单详情" width="760px">
      <div v-loading="detailLoading">
        <div v-if="detail">
          <div class="detail-grid">
            <div>押金单号：{{ detail.deposit_no }}</div>
            <div>OPENID：{{ detail.openid }}</div>
            <div>实付金额：¥{{ detail.amount_paid }}</div>
            <div>已退金额：¥{{ detail.refunded_total }}</div>
            <div>剩余可退：¥{{ detail.refundable_balance }}</div>
            <div>退款次数：{{ detail.refund_count }}</div>
            <div>订单状态：{{ detail.status }}</div>
            <div>兑换码状态：{{ detail.coupon_claim_state }}</div>
          </div>

          <el-divider content-position="left">当前兑换码</el-divider>
          <div v-if="detail.active_ticket" class="ticket-wrap">
            <div class="ticket-meta">
              <div>票据 ID：{{ detail.active_ticket.ticket_id }}</div>
              <div>状态：{{ detail.active_ticket.status }}</div>
              <div class="ticket-path-row">
                <span class="ticket-path">{{ detail.active_ticket.mp_path }}</span>
                <el-button size="small" type="primary" plain @click="copyTicketPath">复制路径</el-button>
              </div>
            </div>
            <div v-if="detail.ticket_wxacode?.wxacode_base64" class="ticket-image">
              <img :src="`data:image/png;base64,${detail.ticket_wxacode.wxacode_base64}`" alt="ticket-wxacode" />
            </div>
          </div>
          <el-empty v-else description="当前无可用兑换码" />

          <el-divider content-position="left">退款记录</el-divider>
          <el-table :data="detail.refunds || []" size="small" stripe>
            <el-table-column prop="refund_no" label="退款单号" min-width="180" />
            <el-table-column prop="refund_amount" label="金额" width="100" />
            <el-table-column prop="status" label="状态" width="120" />
            <el-table-column prop="wx_refund_status" label="微信状态" width="120" />
            <el-table-column prop="failed_reason" label="失败原因" min-width="180" show-overflow-tooltip />
          </el-table>

          <el-divider content-position="left">发起退款</el-divider>
          <div class="refund-actions">
            <el-button
              v-for="amount in [10, 20, 30]"
              :key="amount"
              type="danger"
              plain
              :disabled="!canRefund(amount)"
              :loading="refundLoading === amount"
              @click="submitRefund(amount)"
            >
              退 {{ amount }} 元
            </el-button>
          </div>
          <div class="refund-tip">规则：一旦开始退押金，未领取的一次性兑换码立即永久失效；已领取则不可退款。</div>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getDepositOrders, getDepositOrderDetail, createDepositRefund } from '@/api'
import { usePagination } from '@/composables/usePagination'

const loading = ref(false)
const detailLoading = ref(false)
const detailVisible = ref(false)
const refundLoading = ref(0)
const tableData = ref([])
const detail = ref(null)
const searchForm = reactive({ keyword: '', status: '' })
const { pagination, resetPage, applyResponse } = usePagination()

const fetchData = async () => {
  loading.value = true
  try {
    const res = await getDepositOrders({
      keyword: searchForm.keyword || undefined,
      status: searchForm.status || undefined,
      page: pagination.page,
      limit: pagination.limit
    })
    tableData.value = res?.list || []
    applyResponse(res)
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  resetPage()
  fetchData()
}

const handleReset = () => {
  searchForm.keyword = ''
  searchForm.status = ''
  handleSearch()
}

const openDetail = async (row) => {
  detailVisible.value = true
  detailLoading.value = true
  detail.value = null
  try {
    detail.value = await getDepositOrderDetail(row.id, { env: 'release' })
  } finally {
    detailLoading.value = false
  }
}

const canRefund = (amount) => {
  if (!detail.value) return false
  if (!['paid', 'refund_locked', 'partially_refunded'].includes(detail.value.status)) return false
  if (detail.value.coupon_claim_state === 'claimed') return false
  return Number(detail.value.refundable_balance || 0) >= amount
}

const submitRefund = async (amount) => {
  if (!detail.value) return
  refundLoading.value = amount
  try {
    const res = await createDepositRefund(detail.value.id, { amount })
    ElMessage.success(res?.message || `已发起 ${amount} 元退款`)
    detail.value = await getDepositOrderDetail(detail.value.id, { env: 'release' })
    fetchData()
  } finally {
    refundLoading.value = 0
  }
}

const copyTicketPath = async () => {
  const path = detail.value?.active_ticket?.mp_path
  if (!path) return
  try {
    await navigator.clipboard.writeText(path)
    ElMessage.success('路径已复制')
  } catch {
    ElMessage.info(path)
  }
}

onMounted(fetchData)
</script>

<style scoped>
.filter-container {
  margin-bottom: 20px;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 20px;
  color: #334155;
}

.ticket-wrap {
  display: flex;
  gap: 20px;
  align-items: flex-start;
}

.ticket-meta {
  flex: 1;
}

.ticket-path-row {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-top: 12px;
}

.ticket-path {
  flex: 1;
  font-size: 12px;
  color: #64748b;
  word-break: break-all;
}

.ticket-image img {
  width: 180px;
  height: 180px;
  border-radius: 12px;
  box-shadow: 0 4px 18px rgba(15, 23, 42, 0.12);
}

.refund-actions {
  display: flex;
  gap: 12px;
}

.refund-tip {
  margin-top: 12px;
  color: #64748b;
  font-size: 12px;
}
</style>
