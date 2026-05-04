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
            <el-option label="派送中" value="delivering" />
            <el-option label="已签收" value="delivered" />
            <el-option label="异常" value="exception" />
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
          <el-statistic :title="logisticsMode === 'manual' ? '手工发货' : '运输中'" :value="stats.in_transit">
            <template #suffix>
              <el-icon color="#409eff"><Van /></el-icon>
            </template>
          </el-statistic>
        </el-col>
        <el-col :span="6">
          <el-statistic title="派送中" :value="stats.delivering">
            <template #suffix>
              <el-icon color="#f59e0b"><Location /></el-icon>
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
            <div>{{ row.address?.receiver_name || row.address?.name || displayUserName(row.buyer) }}</div>
            <div style="font-size:12px; color:#909399;">{{ row.address?.phone }}</div>
          </template>
        </el-table-column>
        <el-table-column label="快递公司" width="110">
          <template #default="{ row }">
            {{ row.logistics_company || '-' }}
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
              v-if="row.tracking_no && row._logistics && logisticsMode !== 'manual'"
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
          v-model:page-size="pagination.limit"
          :total="pagination.total"
          :page-sizes="[20, 50, 100]"
          layout="total, sizes, prev, pager, next"
          @size-change="fetchOrders"
          @current-change="fetchOrders"
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
          <el-descriptions-item label="快递公司">{{ currentOrder.logistics_company || '-' }}</el-descriptions-item>
          <el-descriptions-item label="运单号">{{ currentOrder.tracking_no }}</el-descriptions-item>
          <el-descriptions-item label="收件人">
            {{ currentOrder.address?.name }} · {{ currentOrder.address?.phone }}
          </el-descriptions-item>
          <el-descriptions-item label="收货地址">
            {{ currentOrder.address?.province }}{{ currentOrder.address?.city }}{{ currentOrder.address?.district }}{{ currentOrder.address?.detail }}
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
import { getOrders, getAdminOrderLogistics, refreshAdminLogistics, getMiniProgramConfig } from '@/api'
import { usePagination } from '@/composables/usePagination'
import { getUserNickname } from '@/utils/userDisplay'

// ── 搜索表单 ──────────────────────────────────────
const searchForm = reactive({
  keyword: '',
  company: '',
  logistics_status: ''
})

// ── 分页 ──────────────────────────────────────────
const { pagination, resetPage, applyResponse } = usePagination({ defaultLimit: 20 })

// ── 表格数据 ──────────────────────────────────────
const loading = ref(false)
const tableData = ref([])
const logisticsMode = ref('third_party')

// ── 统计 ──────────────────────────────────────────
const stats = reactive({ total: 0, in_transit: 0, delivering: 0, delivered: 0 })

// ── 抽屉 ──────────────────────────────────────────
const drawerVisible = ref(false)
const drawerLoading = ref(false)
const drawerLogistics = ref(null)
const currentOrder = ref(null)
const displayUserName = (user, fallback = '-') => getUserNickname(user || {}, fallback)

// ── 获取已发货订单列表 ─────────────────────────────
async function fetchOrders() {
  loading.value = true
  try {
    const params = {
      status: 'shipped',
      page: pagination.page,
      limit: pagination.limit
    }
    if (searchForm.keyword) params.keyword = searchForm.keyword
    if (searchForm.company) params.company = searchForm.company

    const res = await getOrders(params)
    tableData.value = (res.list || []).map(o => ({ ...o, _logistics: null, _refreshing: false }))
    applyResponse(res)
    stats.total = pagination.total

    // 后台批量查一下物流状态（只查运单号存在的）
    if (logisticsMode.value === 'manual') {
      tableData.value.forEach((order) => {
        if (order.tracking_no) {
          order._logistics = {
            status: 'manual',
            statusText: '手工发货',
            traces: order.shipped_at ? [{ time: formatDate(order.shipped_at), desc: '当前订单走手工发货模式' }] : []
          }
        }
      })
      updateStats()
    } else {
      await batchQueryLogistics()
    }
  } catch (e) {
    ElMessage.error('获取订单列表失败')
  } finally {
    loading.value = false
  }
}

// ── 批量查物流（并发，最多10个） ───────────────────
async function batchQueryLogistics() {
  if (logisticsMode.value === 'manual') return
  const withTracking = tableData.value.filter(o => o.tracking_no)
  if (!withTracking.length) return

  const chunk = withTracking.slice(0, 10) // 避免并发过多
  const results = await Promise.allSettled(
    chunk.map(order => getAdminOrderLogistics(order.id))
  )

  results.forEach((result, idx) => {
    const order = chunk[idx]
    if (result.status === 'fulfilled') {
      const logistics = result.value?.data || result.value
      if (!logistics) return
      // 找到 tableData 中的对应项更新
      const found = tableData.value.find(o => o.id === order.id)
      if (found) {
        found._logistics = {
          status: logistics.status,
          statusText: logistics.statusText,
          traces: logistics.traces || []
        }
      }
    }
  })

  // 更新统计
  updateStats()
}

function updateStats() {
  const withLogistics = tableData.value.filter(o => o._logistics)
  stats.in_transit = withLogistics.filter(o => ['in_transit', 'manual'].includes(o._logistics.status)).length
  stats.delivering = withLogistics.filter(o => o._logistics.status === 'delivering').length
  stats.delivered = withLogistics.filter(o => o._logistics.status === 'delivered').length
}

async function fetchMiniProgramConfigData() {
  try {
    const data = await getMiniProgramConfig()
    logisticsMode.value = data?.logistics_config?.shipping_mode || 'third_party'
  } catch (e) {
    logisticsMode.value = 'third_party'
  }
}

// ── 搜索 / 重置 ────────────────────────────────────
function handleSearch() {
  resetPage()
  fetchOrders()
}

function handleReset() {
  searchForm.keyword = ''
  searchForm.company = ''
  searchForm.logistics_status = ''
  resetPage()
  fetchOrders()
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
    if (logisticsMode.value === 'manual') {
      drawerLogistics.value = {
        status: 'manual',
        statusText: '手工发货',
        traces: order.shipped_at ? [{ time: formatDate(order.shipped_at), desc: '当前订单走手工发货模式，可查看单号和发货时间' }] : []
      }
      return
    }
    let res
    if (forceRefresh) {
      res = await refreshAdminLogistics(order.id)
    } else {
      res = await getAdminOrderLogistics(order.id)
    }
    const data = res
    if (!data) {
      ElMessage.warning('物流查询失败')
      return
    }
    drawerLogistics.value = data
    // 同步到表格行
    const found = tableData.value.find(o => o.id === order.id)
    if (found) found._logistics = data
    if (forceRefresh) ElMessage.success('物流信息已刷新')
  } catch (e) {
    ElMessage.error('物流查询异常')
  } finally {
    drawerLoading.value = false
  }
}

// ── 表格行刷新 ─────────────────────────────────────
async function handleRefresh(row) {
  if (logisticsMode.value === 'manual') {
    return ElMessage.info('手工发货模式无需刷新轨迹')
  }
  row._refreshing = true
  try {
    const res = await refreshAdminLogistics(row.id)
    const data = res
    if (!data) return ElMessage.warning('刷新失败')
    row._logistics = data
    ElMessage.success('已刷新')
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
    delivering: 'warning',
    delivered: 'success',
    exception: 'danger',
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

onMounted(async () => {
  await fetchMiniProgramConfigData()
  fetchOrders()
})
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
