<template>
  <div class="dashboard">
    <!-- ===== KPI 卡片 ===== -->
    <div class="kpi-grid">
      <div
        v-for="(card, index) in statsCards"
        :key="card.title"
        class="kpi-card"
        :class="`kpi-card--${index}`"
      >
        <div class="kpi-top">
          <div class="kpi-icon" :style="{ background: card.iconBg }">
            <el-icon :size="20"><component :is="card.icon" /></el-icon>
          </div>
          <div class="kpi-trend" :class="card.trend >= 0 ? 'trend-up' : 'trend-down'">
            <svg v-if="card.trend >= 0" viewBox="0 0 12 12" fill="currentColor" width="10" height="10">
              <path d="M6 2l4 4H2z"/>
            </svg>
            <svg v-else viewBox="0 0 12 12" fill="currentColor" width="10" height="10">
              <path d="M6 10L2 6h8z"/>
            </svg>
            {{ Math.abs(card.trend) }}%
          </div>
        </div>
        <div class="kpi-value">{{ card.value }}</div>
        <div class="kpi-title">{{ card.title }}</div>
        <div class="kpi-sub" v-if="card.sub">{{ card.sub }}</div>
      </div>
    </div>

    <!-- ===== 主内容区 ===== -->
    <div class="main-grid">
      <!-- 近期订单 -->
      <div class="card orders-card">
        <div class="card-header">
          <div class="card-title">
            <div class="title-dot"></div>
            <span>近期订单</span>
          </div>
          <button class="link-btn" @click="$router.push('/orders')">
            查看全部
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14">
              <path d="M3 8h10m-4-4l4 4-4 4"/>
            </svg>
          </button>
        </div>

        <div class="table-wrapper" v-loading="loading">
          <table class="data-table">
            <thead>
              <tr>
                <th>订单号</th>
                <th>用户</th>
                <th>金额</th>
                <th>状态</th>
                <th>时间</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="order in recentOrders"
                :key="order.id"
                class="table-row"
                @click="$router.push('/orders')"
              >
                <td class="order-no">{{ order.order_no }}</td>
                <td>{{ order.User?.nickname || order.user_name || '-' }}</td>
                <td class="amount">¥{{ order.actual_price || order.total_amount || 0 }}</td>
                <td>
                  <span class="status-badge" :class="`status-${order.status}`">
                    {{ getStatusText(order.status) }}
                  </span>
                </td>
                <td class="time">{{ formatDate(order.created_at) }}</td>
              </tr>
              <tr v-if="recentOrders.length === 0 && !loading">
                <td colspan="5" class="empty-row">暂无订单数据</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 侧边面板 -->
      <div class="side-panel">
        <!-- 待处理事项 -->
        <div class="card todos-card">
          <div class="card-header">
            <div class="card-title">
              <div class="title-dot title-dot--warn"></div>
              <span>待处理事项</span>
            </div>
          </div>
          <div class="todo-list">
            <div
              class="todo-item"
              v-for="item in todoItems"
              :key="item.title"
              @click="$router.push(item.path)"
            >
              <div class="todo-left">
                <div class="todo-icon" :style="{ background: item.iconBg }">
                  <el-icon :size="14"><component :is="item.icon" /></el-icon>
                </div>
                <span class="todo-label">{{ item.title }}</span>
              </div>
              <div class="todo-badge" :class="item.count > 0 ? 'badge-active' : 'badge-zero'">
                {{ item.count }}
              </div>
            </div>
          </div>
        </div>

        <!-- 系统状态 -->
        <div class="card status-card">
          <div class="card-header">
            <div class="card-title">
              <div class="title-dot title-dot--green"></div>
              <span>系统状态</span>
            </div>
          </div>
          <div class="status-list">
            <div class="status-item" v-for="s in systemStatus" :key="s.label">
              <div class="status-label">{{ s.label }}</div>
              <div class="status-right">
                <div
                  v-if="s.type === 'progress'"
                  class="status-bar"
                  :class="s.percent > 80 ? 'bar-danger' : s.percent > 60 ? 'bar-warn' : 'bar-good'"
                >
                  <div class="bar-fill" :style="{ width: s.percent + '%' }"></div>
                </div>
                <span
                  v-else
                  class="status-dot-label"
                  :class="s.ok ? 'ok' : 'err'"
                >
                  {{ s.ok ? '正常' : '异常' }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { getDashboardOverview, getDashboardNotifications, getOrders } from '@/api'
import dayjs from 'dayjs'

const router = useRouter()
const loading = ref(false)

const statsCards = ref([
  {
    title: '今日订单',
    value: '0',
    sub: '本月 0 单',
    icon: 'ShoppingCart',
    iconBg: 'rgba(99,102,241,0.12)',
    trend: 0
  },
  {
    title: '今日销售额',
    value: '¥0',
    sub: '本月 ¥0',
    icon: 'Money',
    iconBg: 'rgba(236,72,153,0.12)',
    trend: 0
  },
  {
    title: '总用户数',
    value: '0',
    sub: '今日新增 0',
    icon: 'User',
    iconBg: 'rgba(20,184,166,0.12)',
    trend: 0
  },
  {
    title: '待发货订单',
    value: '0',
    sub: '运送中 0',
    icon: 'Box',
    iconBg: 'rgba(245,158,11,0.12)',
    trend: 0
  }
])

// KPI 颜色 mapping
const kpiColors = [
  { iconColor: '#818CF8' },
  { iconColor: '#F472B6' },
  { iconColor: '#2DD4BF' },
  { iconColor: '#FCD34D' }
]

const recentOrders = ref([])

const todoItems = ref([
  { title: '待发货订单', count: 0, path: '/orders', icon: 'Box', iconBg: 'rgba(245,158,11,0.12)' },
  { title: '提现申请', count: 0, path: '/withdrawals', icon: 'Money', iconBg: 'rgba(239,68,68,0.12)' },
  { title: '售后申请', count: 0, path: '/refunds', icon: 'RefreshLeft', iconBg: 'rgba(99,102,241,0.12)' },
  { title: '待审批佣金', count: 0, path: '/commissions', icon: 'Wallet', iconBg: 'rgba(20,184,166,0.12)' }
])

const systemStatus = ref([
  { label: '数据库连接', type: 'dot', ok: true },
  { label: 'CPU 使用率', type: 'progress', percent: 35 },
  { label: '内存使用率', type: 'progress', percent: 52 },
  { label: 'API 服务', type: 'dot', ok: true }
])

const fetchDashboard = async () => {
  try {
    const data = await getDashboardOverview()
    statsCards.value[0].value = String(data.orders?.today || 0)
    statsCards.value[0].sub = `本月 ${data.orders?.month || 0} 单`
    statsCards.value[0].trend = data.trends?.orders || 0
    statsCards.value[1].value = '¥' + Number(data.sales?.today || 0).toFixed(2)
    statsCards.value[1].sub = `本月 ¥${Number(data.sales?.month || 0).toFixed(2)}`
    statsCards.value[1].trend = data.trends?.sales || 0
    statsCards.value[2].value = String(data.users?.total || 0)
    statsCards.value[2].sub = `今日新增 ${data.users?.todayNew || 0}`
    statsCards.value[2].trend = data.trends?.users || 0
    statsCards.value[3].value = String(data.pending?.orders || 0)
    statsCards.value[3].sub = `运送中 ${data.pending?.shipping || 0}`

    todoItems.value[0].count = data.pending?.orders || 0
    todoItems.value[1].count = data.pending?.withdrawals || 0
    todoItems.value[2].count = data.pending?.refunds || 0
    todoItems.value[3].count = data.pending?.commissions || 0
  } catch (e) {
    console.error('获取统计数据失败:', e)
  }
}

const fetchRecentOrders = async () => {
  loading.value = true
  try {
    const data = await getOrders({ page: 1, limit: 8 })
    recentOrders.value = data.list || []
  } catch (e) {
    console.error('获取订单列表失败:', e)
  } finally {
    loading.value = false
  }
}

const getStatusText = (status) => {
  const map = {
    pending: '待支付', paid: '待发货', agent_confirmed: '已确认',
    shipping_requested: '发货中', shipped: '已发货',
    completed: '已完成', cancelled: '已取消'
  }
  return map[status] || status
}

const formatDate = (date) => {
  if (!date) return '-'
  return dayjs(date).format('MM-DD HH:mm')
}

onMounted(() => {
  fetchDashboard()
  fetchRecentOrders()
})
</script>

<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* ===== KPI 卡片网格 ===== */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

@media (max-width: 1200px) { .kpi-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 640px) { .kpi-grid { grid-template-columns: 1fr; } }

.kpi-card {
  background: white;
  border: 1px solid #E2E8F0;
  border-radius: 14px;
  padding: 20px;
  transition: all 0.2s;
  cursor: default;
}

.kpi-card:hover {
  border-color: #C7D2FE;
  box-shadow: 0 4px 20px rgba(99,102,241,0.08);
  transform: translateY(-2px);
}

.kpi-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.kpi-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6366F1;
}

.kpi-card--1 .kpi-icon { color: #EC4899; }
.kpi-card--2 .kpi-icon { color: #14B8A6; }
.kpi-card--3 .kpi-icon { color: #F59E0B; }

.kpi-trend {
  display: flex;
  align-items: center;
  gap: 2px;
  font-size: 11px;
  font-weight: 600;
  padding: 3px 7px;
  border-radius: 20px;
}

.trend-up {
  color: #16A34A;
  background: rgba(22, 163, 74, 0.1);
}

.trend-down {
  color: #DC2626;
  background: rgba(220, 38, 38, 0.1);
}

.kpi-value {
  font-size: 28px;
  font-weight: 800;
  color: #0F172A;
  letter-spacing: -0.03em;
  line-height: 1;
  margin-bottom: 6px;
}

.kpi-title {
  font-size: 13px;
  font-weight: 500;
  color: #64748B;
  margin-bottom: 2px;
}

.kpi-sub {
  font-size: 11.5px;
  color: #94A3B8;
}

/* ===== 主网格 ===== */
.main-grid {
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 16px;
}

@media (max-width: 1024px) { .main-grid { grid-template-columns: 1fr; } }

/* ===== 通用卡片 ===== */
.card {
  background: white;
  border: 1px solid #E2E8F0;
  border-radius: 14px;
  overflow: hidden;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #F1F5F9;
}

.card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: #1E293B;
}

.title-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #6366F1;
}

.title-dot--warn { background: #F59E0B; }
.title-dot--green { background: #10B981; }

.link-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12.5px;
  color: #6366F1;
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 0;
  font-weight: 500;
  transition: opacity 0.15s;
}

.link-btn:hover { opacity: 0.7; }

/* ===== 数据表格 ===== */
.table-wrapper {
  overflow-x: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.data-table th {
  text-align: left;
  padding: 10px 16px;
  font-size: 11px;
  font-weight: 600;
  color: #94A3B8;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: #F8FAFC;
  border-bottom: 1px solid #F1F5F9;
}

.data-table td {
  padding: 12px 16px;
  color: #374151;
  border-bottom: 1px solid #F8FAFC;
}

.table-row {
  cursor: pointer;
  transition: background 0.1s;
}

.table-row:hover td {
  background: #F8FAFC;
}

.table-row:last-child td {
  border-bottom: none;
}

.order-no {
  font-family: monospace;
  font-size: 12px;
  color: #64748B;
}

.amount {
  font-weight: 700;
  color: #6366F1;
}

.time {
  font-size: 12px;
  color: #94A3B8;
  white-space: nowrap;
}

.empty-row {
  text-align: center;
  color: #94A3B8;
  padding: 32px 0;
}

/* 状态标签 */
.status-badge {
  display: inline-block;
  padding: 3px 8px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 600;
}

.status-pending { background: #EFF6FF; color: #3B82F6; }
.status-paid { background: #FEF3C7; color: #D97706; }
.status-agent_confirmed,
.status-shipping_requested { background: #FEF3C7; color: #D97706; }
.status-shipped { background: #EDE9FE; color: #7C3AED; }
.status-completed { background: #ECFDF5; color: #059669; }
.status-cancelled { background: #FEF2F2; color: #DC2626; }

/* ===== 侧边面板 ===== */
.side-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 待办 */
.todo-list { padding: 4px 0; }

.todo-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  cursor: pointer;
  transition: background 0.15s;
}

.todo-item:hover { background: #F8FAFC; }

.todo-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.todo-icon {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6366F1;
  flex-shrink: 0;
}

.todo-label {
  font-size: 13px;
  font-weight: 500;
  color: #374151;
}

.todo-badge {
  font-size: 11.5px;
  font-weight: 700;
  min-width: 24px;
  height: 24px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 6px;
}

.badge-active {
  background: #FEE2E2;
  color: #DC2626;
}

.badge-zero {
  background: #F1F5F9;
  color: #94A3B8;
}

/* 系统状态 */
.status-list { padding: 4px 0 8px; }

.status-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 20px;
}

.status-label {
  font-size: 13px;
  color: #374151;
}

.status-right {
  display: flex;
  align-items: center;
}

.status-bar {
  width: 80px;
  height: 6px;
  background: #F1F5F9;
  border-radius: 3px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.6s ease;
}

.bar-good .bar-fill { background: #10B981; }
.bar-warn .bar-fill { background: #F59E0B; }
.bar-danger .bar-fill { background: #EF4444; }

.status-dot-label {
  font-size: 11.5px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 20px;
}

.status-dot-label.ok { background: #ECFDF5; color: #059669; }
.status-dot-label.err { background: #FEF2F2; color: #DC2626; }
</style>
