<template>
  <div class="logistics-page">
    <el-card>
      <template #header>物流管理</template>

      <!-- 搜索表单 -->
      <el-form :inline="true" :model="searchForm" class="filter-container">
        <el-form-item label="运单/订单号">
          <el-input
            v-model="searchForm.keyword"
            placeholder="运单号 / 订单号"
            clearable
            style="width:200px"
          />
        </el-form-item>
        <el-form-item label="快递公司">
          <el-select v-model="searchForm.company" placeholder="全部" clearable style="width:130px">
            <el-option label="顺丰速运" value="SF" />
            <el-option label="韵达快递" value="YD" />
            <el-option label="中通快递" value="ZTO" />
            <el-option label="圆通速递" value="YTO" />
            <el-option label="申通快递" value="STO" />
            <el-option label="极兔速递" value="JTSD" />
            <el-option label="菜鸟速运" value="CNSD" />
            <el-option label="京东物流" value="JD" />
            <el-option label="邮政EMS" value="EMS" />
          </el-select>
        </el-form-item>
        <el-form-item label="物流状态">
          <el-select v-model="searchForm.logistics_status" placeholder="全部" clearable style="width:120px">
            <el-option label="运输中" value="in_transit" />
            <el-option label="派送中" value="dispatching" />
            <el-option label="已签收" value="delivered" />
            <el-option label="异常" value="problem" />
            <el-option label="未查到" value="unknown" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">搜索</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>

      <!-- 统计卡片 -->
      <el-row :gutter="16" style="margin-bottom:20px">
        <el-col :span="6">
          <el-statistic title="已发货总数" :value="stats.total" />
        </el-col>
        <el-col :span="6">
          <el-statistic title="运输中" :value="stats.in_transit">
            <template #suffix>
              <el-icon color="#409eff"><Van /></el-icon>
            </template>
          </el-statistic>
        </el-col>
        <el-col :span="6">
          <el-statistic title="派送中" :value="stats.dispatching">
            <template #suffix>
              <el-icon color="#e6a23c"><Location /></el-icon>
            </template>
          </el-statistic>
        </el-col>
        <el-col :span="6">
          <el-statistic title="已签收" :value="stats.delivered">
            <template #suffix>
              <el-icon color="#67c23a"><Check /></el-icon>
            </template>
          </el-statistic>
        </el-col>
      </el-row>

      <!-- 订单表格 -->
      <el-table :data="tableData" v-loading="loading" stripe>
        <el-table-column label="订单信息" min-width="200">
          <template #default="{ row }">
            <div style="font-size:13px; font-weight:500; color:#303133;">
              {{ row.product?.name || '-' }}
            </div>
            <div style="font-size:12px; color:#909399; margin-top:2px;">
              {{ row.order_no }}
            </div>
          </template>
        </el-table-column>
        <el-table-column label="收件人" width="110">
          <template #default="{ row }">
            <div>{{ getReceiverName(row) }}</div>
            <div style="font-size:12px; color:#909399;">{{ getReceiverPhone(row) }}</div>
          </template>
        </el-table-column>
        <el-table-column label="快递公司" width="110">
          <template #default="{ row }">
            {{ formatCompanyLabel(row.logistics_company) }}
          </template>
        </el-table-column>
        <el-table-column label="运单号" width="160">
          <template #default="{ row }">
            <span
              v-if="row.tracking_no"
              class="tracking-no"
              @click="handleCopyTrackingNo(row.tracking_no)"
            >{{ row.tracking_no }}</span>
            <span v-else style="color:#c0c4cc;">-</span>
          </template>
        </el-table-column>
        <el-table-column label="物流状态" width="110">
          <template #default="{ row }">
            <el-tag
              v-if="row._logistics"
              :type="getLogisticsTagType(row._logistics.status)"
              size="small"
            >{{ row._logistics.statusText }}</el-tag>
            <el-tag v-else size="small" type="info">未查询</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="最新轨迹" min-width="200">
          <template #default="{ row }">
            <div v-if="row._logistics?.traces?.length" style="font-size:12px; color:#606266;">
              <div>{{ row._logistics.traces[0].time }}</div>
              <div style="color:#909399; margin-top:1px;">{{ row._logistics.traces[0].desc }}</div>
            </div>
            <span v-else style="color:#c0c4cc; font-size:12px;">-</span>
          </template>
        </el-table-column>
        <el-table-column label="发货时间" width="160">
          <template #default="{ row }">
            {{ row.shipped_at ? formatDate(row.shipped_at) : '-' }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="row.tracking_no"
              size="small"
              type="primary"
              link
              @click="handleViewDetail(row)"
            >查看物流</el-button>
            <el-button
              v-if="row.tracking_no && row._logistics"
              size="small"
              link
              :loading="row._refreshing"
              @click="handleRefresh(row)"
            >刷新</el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="pagination-wrap">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :total="pagination.total"
          :page-sizes="[20, 50, 100]"
          layout="total, sizes, prev, pager, next"
          @size-change="handlePageSizeChange"
          @current-change="handlePageChange"
        />
      </div>
    </el-card>

    <!-- 物流详情抽屉 -->
    <el-drawer
      v-model="drawerVisible"
      :title="`物流详情 · ${currentOrder?.tracking_no}`"
      size="460px"
      destroy-on-close
    >
      <div v-if="currentOrder" class="drawer-content">
        <!-- 基本信息 -->
        <el-descriptions :column="1" border size="small" style="margin-bottom:20px">
          <el-descriptions-item label="订单号">{{ currentOrder.order_no }}</el-descriptions-item>
          <el-descriptions-item label="快递公司">{{ formatCompanyLabel(currentOrder.logistics_company) }}</el-descriptions-item>
          <el-descriptions-item label="运单号">{{ currentOrder.tracking_no }}</el-descriptions-item>
          <el-descriptions-item label="收件人">
            {{ getReceiverName(currentOrder) }} · {{ getReceiverPhone(currentOrder) }}
          </el-descriptions-item>
          <el-descriptions-item label="收货地址">
            {{ getReceiverAddress(currentOrder) }}
          </el-descriptions-item>
          <el-descriptions-item label="物流状态">
            <el-tag
              v-if="drawerLogistics"
              :type="getLogisticsTagType(drawerLogistics.status)"
              size="small"
            >{{ drawerLogistics.statusText }}</el-tag>
          </el-descriptions-item>
        </el-descriptions>

        <!-- 物流轨迹 -->
        <div v-if="drawerLoading" style="text-align:center;padding:40px;">
          <el-icon class="is-loading" size="28"><Loading /></el-icon>
          <div style="margin-top:8px;color:#909399;font-size:13px;">查询物流中...</div>
        </div>
        <div v-else-if="drawerLogistics?.traces?.length">
          <div style="font-size:13px;font-weight:600;color:#303133;margin-bottom:12px;">物流轨迹</div>
          <el-timeline>
            <el-timeline-item
              v-for="(trace, idx) in drawerLogistics.traces"
              :key="idx"
              :timestamp="trace.time"
              :type="idx === 0 ? 'primary' : ''"
              placement="top"
            >
              {{ trace.desc }}
            </el-timeline-item>
          </el-timeline>
        </div>
        <el-empty v-else description="暂无物流轨迹" :image-size="80" />

        <!-- 底部操作 -->
        <div style="margin-top:20px;display:flex;gap:10px;">
          <el-button
            type="primary"
            :loading="drawerLoading"
            @click="loadDrawerLogistics(currentOrder, true)"
          >强制刷新</el-button>
          <el-button @click="drawerVisible = false">关闭</el-button>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getOrders, getAdminOrderLogistics, refreshAdminLogistics } from '@/api/index'

const COMPANY_LABELS = {
  SF: '顺丰速运',
  STO: '申通快递',
  ZTO: '中通快递',
  YTO: '圆通速递',
  YD: '韵达快递',
  EMS: '邮政 EMS',
  CHINAPOST: '中国邮政',
  JD: '京东物流',
  HTKY: '百世快递',
  JTSD: '极兔速递',
  CNSD: '菜鸟速运',
  DEPPON: '德邦物流'
}

const FETCH_LIMIT = 100

const formatCompanyLabel = (company) => {
  if (!company) return '-'
  return COMPANY_LABELS[company] || company
}

// ── 搜索表单 ──────────────────────────────────────
const searchForm = reactive({
  keyword: '',
  company: '',
  logistics_status: ''
})

// ── 分页 ──────────────────────────────────────────
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })
const rawTotal = ref(0)

// ── 表格数据 ──────────────────────────────────────
const rawTableData = ref([])
const loading = ref(false)
const tableData = ref([])

// ── 统计 ──────────────────────────────────────────
const stats = reactive({ total: 0, in_transit: 0, dispatching: 0, delivered: 0 })

// ── 抽屉 ──────────────────────────────────────────
const drawerVisible = ref(false)
const drawerLoading = ref(false)
const drawerLogistics = ref(null)
const currentOrder = ref(null)

const LOGISTICS_STATUS_TEXT = {
  collecting: '待揽件',
  in_transit: '运输中',
  dispatching: '派送中',
  delivered: '已签收',
  failed: '派送失败',
  problem: '物流异常',
  returned: '已退回',
  unknown: '未查到'
}

const normalizeLogistics = (logistics = {}) => {
  const status = logistics.status || 'unknown'
  return {
    ...logistics,
    status,
    statusText: logistics.statusText || logistics.status_text || LOGISTICS_STATUS_TEXT[status] || status,
    traces: logistics.traces || []
  }
}

function getReceiverName(order) {
  return order?.address_snapshot?.receiver_name || order?.address?.receiver_name || order?.buyer?.nickname || '-'
}

function getReceiverPhone(order) {
  return order?.address_snapshot?.phone || order?.address?.phone || '-'
}

function getReceiverAddress(order) {
  const address = order?.address_snapshot || order?.address || {}
  return [address.province, address.city, address.district, address.detail].filter(Boolean).join('')
}

function syncTableData() {
  const logisticsStatus = searchForm.logistics_status
  const filteredData = rawTableData.value.filter(order => {
    if (!logisticsStatus) return true
    return order._logistics?.status === logisticsStatus
  })
  const maxPage = Math.max(1, Math.ceil(filteredData.length / pagination.pageSize))
  if (pagination.page > maxPage) {
    pagination.page = maxPage
  }
  const start = (pagination.page - 1) * pagination.pageSize
  tableData.value = filteredData.slice(start, start + pagination.pageSize)
  pagination.total = filteredData.length
  updateStats()
}

function buildQueryParams(page, limit = FETCH_LIMIT) {
  const params = {
    status: 'shipped',
    page,
    limit
  }
  if (searchForm.keyword) params.keyword = searchForm.keyword
  if (searchForm.company) params.company = searchForm.company
  return params
}

async function fetchAllOrdersByQuery() {
  const firstRes = await getOrders(buildQueryParams(1))
  if (firstRes.code !== 0) {
    throw new Error(firstRes.message || '获取订单列表失败')
  }

  const firstList = firstRes.data.list || []
  const total = firstRes.data.pagination?.total || firstList.length
  const totalPages = Math.ceil(total / FETCH_LIMIT)
  const allOrders = [...firstList]

  for (let page = 2; page <= totalPages; page += 1) {
    const pageRes = await getOrders(buildQueryParams(page))
    if (pageRes.code !== 0) {
      throw new Error(pageRes.message || '获取订单列表失败')
    }
    allOrders.push(...(pageRes.data.list || []))
  }

  return { list: allOrders, total }
}

// ── 获取已发货订单列表 ─────────────────────────────
async function fetchOrders() {
  loading.value = true
  try {
    const { list, total } = await fetchAllOrdersByQuery()
    rawTableData.value = list.map(order => ({ ...order, _logistics: null, _refreshing: false }))
    rawTotal.value = total

    // 拉全量订单后本地分页，保证物流状态筛选和分页一致
    await batchQueryLogistics()
    syncTableData()
  } catch (e) {
    rawTableData.value = []
    tableData.value = []
    rawTotal.value = 0
    pagination.total = 0
    stats.total = 0
    stats.in_transit = 0
    stats.dispatching = 0
    stats.delivered = 0
    ElMessage.error('获取订单列表失败')
  } finally {
    loading.value = false
  }
}

// ── 批量查物流（并发，最多10个） ───────────────────
async function batchQueryLogistics() {
  const withTracking = rawTableData.value.filter(o => o.tracking_no)
  if (!withTracking.length) return

  for (let start = 0; start < withTracking.length; start += 10) {
    const chunk = withTracking.slice(start, start + 10)
    const results = await Promise.allSettled(
      chunk.map(order => getAdminOrderLogistics(order.id))
    )

    results.forEach((result, idx) => {
      const order = chunk[idx]
      if (result.status === 'fulfilled' && result.value?.code === 0) {
        const logistics = normalizeLogistics(result.value.data)
        const found = rawTableData.value.find(o => o.id === order.id)
        if (found) {
          found._logistics = logistics
        }
      }
    })
  }
}

function updateStats() {
  const withLogistics = rawTableData.value.filter(o => o._logistics)
  stats.total = rawTotal.value || rawTableData.value.length
  stats.in_transit = withLogistics.filter(o => o._logistics.status === 'in_transit').length
  stats.dispatching = withLogistics.filter(o => o._logistics.status === 'dispatching').length
  stats.delivered = withLogistics.filter(o => o._logistics.status === 'delivered').length
}

// ── 搜索 / 重置 ────────────────────────────────────
function handleSearch() {
  pagination.page = 1
  fetchOrders()
}

function handleReset() {
  searchForm.keyword = ''
  searchForm.company = ''
  searchForm.logistics_status = ''
  pagination.page = 1
  fetchOrders()
}

function handlePageChange(page) {
  pagination.page = page
  syncTableData()
}

function handlePageSizeChange(size) {
  pagination.pageSize = size
  pagination.page = 1
  syncTableData()
}

// ── 复制运单号 ─────────────────────────────────────
function handleCopyTrackingNo(no) {
  navigator.clipboard?.writeText(no).then(() => {
    ElMessage.success(`运单号 ${no} 已复制`)
  }).catch(() => {
    ElMessage.info(`运单号：${no}`)
  })
}

// ── 查看物流详情 ───────────────────────────────────
async function handleViewDetail(row) {
  currentOrder.value = row
  drawerLogistics.value = row._logistics || null
  drawerVisible.value = true
  if (!row._logistics) {
    await loadDrawerLogistics(row, false)
  }
}

async function loadDrawerLogistics(order, forceRefresh = false) {
  drawerLoading.value = true
  try {
    let res
    if (forceRefresh) {
      res = await refreshAdminLogistics(order.id)
    } else {
      res = await getAdminOrderLogistics(order.id)
    }
    if (res.code === 0) {
      drawerLogistics.value = normalizeLogistics(res.data)
      // 同步到表格行
      const found = rawTableData.value.find(o => o.id === order.id)
      if (found) found._logistics = normalizeLogistics(res.data)
      syncTableData()
      if (forceRefresh) ElMessage.success('物流信息已刷新')
    } else {
      ElMessage.warning(res.message || '物流查询失败')
    }
  } catch (e) {
    ElMessage.error('物流查询异常')
  } finally {
    drawerLoading.value = false
  }
}

// ── 表格行刷新 ─────────────────────────────────────
async function handleRefresh(row) {
  row._refreshing = true
  try {
    const res = await refreshAdminLogistics(row.id)
    if (res.code === 0) {
      row._logistics = normalizeLogistics(res.data)
      syncTableData()
      ElMessage.success('已刷新')
    } else {
      ElMessage.warning(res.message || '刷新失败')
    }
  } catch (e) {
    ElMessage.error('刷新异常')
  } finally {
    row._refreshing = false
  }
}

// ── 辅助函数 ───────────────────────────────────────
function getLogisticsTagType(status) {
  const map = {
    in_transit: 'primary',
    dispatching: 'warning',
    delivered: 'success',
    problem: 'danger',
    failed: 'danger',
    returned: 'info',
    unknown: 'info'
  }
  return map[status] || 'info'
}

function formatDate(dateStr) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  })
}

onMounted(() => { fetchOrders() })
</script>

<style scoped>
.logistics-page {
  padding: 0;
}

.filter-container {
  margin-bottom: 16px;
}

.pagination-wrap {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}

.tracking-no {
  font-family: monospace;
  font-size: 13px;
  color: #409eff;
  cursor: pointer;
  text-decoration: underline dotted;
}

.tracking-no:hover {
  color: #66b1ff;
}

.drawer-content {
  padding: 0 4px;
}
</style>
