<template>
  <div class="dashboard">
    <div class="dashboard-toolbar">
      <div class="dashboard-toolbar__meta">
        <div class="dashboard-toolbar__title">经营看板</div>
        <div class="dashboard-toolbar__sub">
          最近成功刷新：{{ lastSuccessAt ? formatDateTime(lastSuccessAt) : '—' }}
        </div>
        <div v-if="dashboardError" class="dashboard-toolbar__sub dashboard-toolbar__sub--warn">
          {{ dashboardError }}
        </div>
      </div>
      <div class="dashboard-toolbar__actions">
        <span class="dashboard-toolbar__sub">最近探测：{{ lastAttemptAt ? formatDateTime(lastAttemptAt) : '—' }}</span>
        <el-tag :type="dashboardStatusTagType" size="small">{{ dashboardStatusText }}</el-tag>
        <el-button size="small" @click="refreshDashboard" :loading="refreshing">刷新</el-button>
      </div>
    </div>

    <!-- ===== Row 1: KPI 卡片 ===== -->
    <div class="kpi-grid">
      <div v-for="(card, index) in statsCards" :key="card.title" class="kpi-card" :class="`kpi-card--${index}`">
        <div class="kpi-top">
          <div class="kpi-icon" :style="{ background: card.iconBg }">
            <el-icon :size="20"><component :is="card.icon" /></el-icon>
          </div>
          <div class="kpi-trend" :class="card.trend >= 0 ? 'trend-up' : 'trend-down'">
            <svg v-if="card.trend >= 0" viewBox="0 0 12 12" fill="currentColor" width="10" height="10"><path d="M6 2l4 4H2z"/></svg>
            <svg v-else viewBox="0 0 12 12" fill="currentColor" width="10" height="10"><path d="M6 10L2 6h8z"/></svg>
            {{ Math.abs(card.trend) }}%
          </div>
        </div>
        <div class="kpi-value">{{ card.value }}</div>
        <div class="kpi-title">{{ card.title }}</div>
        <div class="kpi-sub" v-if="card.sub">{{ card.sub }}</div>
      </div>
    </div>

    <div class="focus-bar">
      <div class="focus-main">
        <div class="focus-label">今日经营重点</div>
        <div class="focus-title">{{ focusTitle }}</div>
      </div>
      <div class="focus-tags" role="group" aria-label="待处理快捷入口">
        <button
          v-for="item in focusBarItems"
          :key="item.key"
          type="button"
          class="focus-tag focus-tag--action"
          @click="router.push({ path: item.path, query: item.query })"
        >
          <span class="focus-tag-label">{{ item.label }}</span>
          <span class="focus-tag-count" :class="{ 'focus-tag-count--zero': item.count === 0 }">{{ item.count }}</span>
        </button>
      </div>
    </div>

    <!-- ===== Row 2: 主内容区 ===== -->
    <div class="main-grid">

      <!-- 左列：订单 + 库存预警 -->
      <div class="left-col">
        <!-- 近期订单 -->
        <div class="card orders-card">
          <div class="card-header">
            <div class="card-title">
              <span class="title-dot title-dot--purple"></span>
              <span>近期成交订单</span>
            </div>
            <button class="link-btn" @click="$router.push('/orders')">
              查看全部
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14"><path d="M3 8h10m-4-4l4 4-4 4"/></svg>
            </button>
          </div>
          <div class="table-wrapper" v-loading="ordersLoading">
            <table class="data-table">
              <thead>
                <tr>
                  <th>订单号</th>
                  <th>金额</th>
                  <th>状态</th>
                  <th>时间</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="order in recentOrders" :key="order.id" class="table-row" @click="$router.push('/orders')">
                  <td class="order-no">{{ order.order_no }}</td>
                  <td class="amount">¥{{ formatAmountYuan(order.actual_price ?? order.total_amount ?? 0) }}</td>
                  <td>
                    <span class="status-badge" :class="`status-${order.status}`">{{ getStatusText(order.status) }}</span>
                  </td>
                  <td class="time">{{ formatDate(order.created_at) }}</td>
                </tr>
                <tr v-if="recentOrders.length === 0 && !ordersLoading">
                  <td colspan="4" class="empty-row">暂无订单数据</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- 库存预警 -->
        <div class="card stock-card" v-if="lowStockList.length > 0">
          <div class="card-header">
            <div class="card-title">
              <span class="title-dot title-dot--red"></span>
              <span>⚠️ 库存预警</span>
              <el-badge :value="lowStockList.length" type="danger" style="margin-left:8px" />
            </div>
            <button class="link-btn" @click="$router.push('/products')">去补货</button>
          </div>
          <div class="stock-list">
            <div v-for="p in lowStockList" :key="p.id" class="stock-item">
              <img :src="getProductImage(p)" class="stock-thumb" />
              <div class="stock-info">
                <div class="stock-name">{{ p.name }}</div>
              </div>
              <div class="stock-count" :class="p.stock === 0 ? 'stock-zero' : 'stock-low'">
                {{ p.stock === 0 ? '已售罄' : `剩 ${p.stock}` }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 右列：热度榜 + 待处理 + 系统状态 -->
      <div class="right-col">

        <!-- 热度榜 -->
        <div class="card rank-card">
          <div class="card-header">
            <div class="card-title">
              <span class="title-dot title-dot--orange"></span>
              <span>🔥 商品热度榜</span>
            </div>
            <button class="link-btn" @click="$router.push('/products')">管理商品</button>
          </div>
          <div class="rank-list" v-loading="dashLoading">
            <div v-for="(p, idx) in hotProducts" :key="p.id" class="rank-item">
              <div class="rank-no" :class="idx < 3 ? `rank-top${idx+1}` : ''">{{ idx + 1 }}</div>
              <img :src="getProductImage(p)" class="rank-thumb" />
              <div class="rank-info">
                <div class="rank-name">{{ p.name }}</div>
                <div class="rank-meta">热度 {{ p.heat_score || 0 }} · 售出 {{ p.purchase_count || 0 }}</div>
              </div>
                <div class="rank-price">¥{{ formatAmountYuan(p.retail_price ?? p.min_price ?? p.price ?? 0) }}</div>
            </div>
            <div v-if="hotProducts.length === 0 && !dashLoading" class="empty-row">暂无商品数据</div>
          </div>
        </div>

        <!-- 待处理事项 -->
        <div class="card todos-card">
          <div class="card-header">
            <div class="card-title">
              <span class="title-dot title-dot--warn"></span>
              <span>今日待跟进</span>
            </div>
          </div>
          <div class="todo-list">
            <div class="todo-item" v-for="item in todoItems" :key="item.title" @click="$router.push({ path: item.path, query: item.query || {} })">
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

        <!-- 会员等级快照 -->
        <div class="card tiers-card">
          <div class="card-header">
            <div class="card-title">
              <span class="title-dot"></span>
              <span>会员成长门槛</span>
            </div>
            <button class="link-btn" @click="$router.push('/membership')">去配置</button>
          </div>
          <div class="tier-list">
            <div class="tier-item" v-for="tier in memberTierList.slice(0, 5)" :key="tier.level">
              <span class="tier-name">Lv{{ tier.level }} {{ tier.name }}</span>
              <span class="tier-threshold">成长值 {{ tier.growth_threshold || 0 }}</span>
            </div>
            <div v-if="memberTierList.length === 0" class="empty-row">暂无等级配置</div>
          </div>
        </div>

        <!-- 快捷操作 -->
        <div class="card quick-card">
          <div class="card-header">
            <div class="card-title">
              <span class="title-dot title-dot--purple"></span>
              <span>快捷操作</span>
            </div>
          </div>
          <div class="quick-list">
            <div class="quick-item" v-for="q in quickActions" :key="q.key" @click="router.push(q.to)">
              <div class="todo-icon" :style="{ background: q.iconBg }">
                <el-icon :size="14"><component :is="q.icon" /></el-icon>
              </div>
              <span class="quick-name">{{ q.label }}</span>
              <span class="menu-arrow">></span>
            </div>
          </div>
        </div>

        <!-- 系统状态 -->
        <div class="card status-card">
          <div class="card-header">
            <div class="card-title">
              <span class="title-dot title-dot--green"></span>
              <span>系统状态</span>
            </div>
          </div>
          <div class="status-list">
            <div class="status-item" v-for="s in systemStatus" :key="s.label">
              <div class="status-label">{{ s.label }}</div>
              <div class="status-right">
                <div v-if="s.type === 'progress'" class="status-bar"
                  :class="s.percent > 80 ? 'bar-danger' : s.percent > 60 ? 'bar-warn' : 'bar-good'">
                  <div class="bar-fill" :style="{ width: s.percent + '%' }"></div>
                </div>
                <span v-else class="status-dot-label" :class="s.ok ? 'ok' : 'err'">
                  {{ s.extra || (s.ok ? '正常' : '异常') }}
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
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/store/user'
import {
  getDashboardOverview, getSystemStatus,
  getOperationsDashboard, getMemberTierConfig
} from '@/api'
import { ElMessage } from 'element-plus'
import { formatDateShort as formatDate, formatDateTime } from '@/utils/format'
import { buildShortcutItems } from '@/config/adminNavigation'

const router = useRouter()
const userStore = useUserStore()
const refreshing = ref(false)
const lastAttemptAt = ref('')
const lastSuccessAt = ref('')
const dashboardState = ref('fresh')
const dashboardError = ref('')

// ───────────────── KPI 卡片 ─────────────────
const statsCards = ref([
  { title: '今日订单', value: '0', sub: '需要重点盯转化', icon: 'ShoppingCart', iconBg: 'rgba(99,102,241,0.12)', trend: 0 },
  { title: '今日销售额', value: '¥0.00', sub: '优先看活动拉动', icon: 'Money', iconBg: 'rgba(236,72,153,0.12)', trend: 0 },
  { title: '累计用户', value: '0', sub: '关注新增与留存', icon: 'User', iconBg: 'rgba(20,184,166,0.12)', trend: 0 },
  { title: '待发货', value: '0', sub: '先清履约积压', icon: 'Box', iconBg: 'rgba(245,158,11,0.12)', trend: 0 }
])

// ───────────────── 运营聚合数据 ─────────────────
const dashLoading = ref(false)
const recentOrders = ref([])
const ordersLoading = ref(false)
const lowStockList = ref([])
const hotProducts = ref([])
const todoItems = ref([
  { title: '待发货订单', count: 0, path: '/orders', query: { status_group: 'pending_ship' }, icon: 'Box', iconBg: 'rgba(245,158,11,0.12)' },
  { title: '待提现审核', count: 0, path: '/withdrawals', query: { status: 'pending' }, icon: 'Money', iconBg: 'rgba(239,68,68,0.12)' },
  { title: '待退款审核', count: 0, path: '/refunds', query: { status: 'pending' }, icon: 'RefreshLeft', iconBg: 'rgba(99,102,241,0.12)' },
  { title: '待审批佣金', count: 0, path: '/commissions', icon: 'Wallet', iconBg: 'rgba(20,184,166,0.12)' }
])
const memberTierList = ref([])
const quickActions = computed(() => (
  buildShortcutItems(
    (permission) => userStore.hasPermission(permission),
    { surface: 'dashboard', limit: 5 }
  )
))

const focusBarItems = computed(() => [
  {
    key: 'pendingShip',
    label: '待发货',
    count: Number(todoItems.value[0]?.count || 0),
    path: '/orders',
    query: { status_group: 'pending_ship' }
  },
  {
    key: 'pending_withdraw',
    label: '待提现',
    count: Number(todoItems.value[1]?.count || 0),
    path: '/withdrawals',
    query: { status: 'pending' }
  },
  {
    key: 'pending_refund',
    label: '待退款',
    count: Number(todoItems.value[2]?.count || 0),
    path: '/refunds',
    query: { status: 'pending' }
  }
])

const focusTitle = computed(() => {
  const items = focusBarItems.value
  const withCount = items.filter((i) => i.count > 0)
  const todayOrders = Number(statsCards.value[0]?.value || 0)
  const todaySales = statsCards.value[1]?.value || '¥0.00'
  const todaySummary = `今日 ${todayOrders} 单 · 销售额 ${todaySales}`
  if (withCount.length > 0) {
    return `${todaySummary}，优先处理 ${withCount.map((i) => `${i.label} ${i.count} 条`).join('，')}`
  }
  return `${todaySummary}，当前发货与资金类待办较少，可转向活动与用户运营`
})

const fetchOperationsDashboard = async () => {
  dashLoading.value = true
  ordersLoading.value = true
  try {
    const data = await getOperationsDashboard({ skipErrorMessage: true })
    const d = data
    const pendingShipCount = Number(d?.kpi?.pendingShip ?? d?.kpi?.paid ?? d?.kpi?.pending_ship ?? 0)

    statsCards.value[0].value = String(d?.kpi?.today_orders || 0)
    statsCards.value[1].value = '¥' + formatAmountYuan(d?.kpi?.today_sales ?? 0)
    statsCards.value[2].value = String(d?.kpi?.total_users || 0)
    statsCards.value[3].value = String(pendingShipCount)

    todoItems.value[0].count = pendingShipCount
    todoItems.value[1].count = d?.pending?.withdrawals || 0
    todoItems.value[2].count = d?.pending?.refunds || 0
    todoItems.value[3].count = d?.pending?.commissions || 0

    lowStockList.value = d?.low_stock || []
    hotProducts.value = d?.hot_products || []
    recentOrders.value = d?.recent_orders || []
    return true
  } catch (e) {
    console.error('运营数据加载失败:', e)
    // fallback：单独获取统计概况
    try {
      const ov = await getDashboardOverview({ skipErrorMessage: true })
      const pendingShipCount = Number(ov?.pending_ship || 0)

      statsCards.value[0].value = String(ov?.today_orders || 0)
      statsCards.value[1].value = '¥' + formatAmountYuan(ov?.today_sales ?? 0)
      statsCards.value[2].value = String(ov?.total_users || 0)
      statsCards.value[3].value = String(pendingShipCount)

      todoItems.value[0].count = pendingShipCount
      todoItems.value[2].count = Number(ov?.pending_refund || 0)
      return true
    } catch (fallbackErr) {
      if (!fallbackErr?.__handledByRequest) {
        ElMessage.error(fallbackErr?.message || '加载仪表盘失败')
      }
      return false
    }
  } finally {
    dashLoading.value = false
    ordersLoading.value = false
  }
}

const fetchMemberTierConfig = async () => {
  try {
    const res = await getMemberTierConfig({ skipErrorMessage: true })
    const d = res
    memberTierList.value = Array.isArray(d?.member_levels) ? d.member_levels : []
    return true
  } catch (e) {
    console.warn('获取会员等级配置失败:', e)
    return false
  }
}

// ───────────────── 系统状态 ─────────────────
const systemStatus = ref([
  { label: '数据库', type: 'dot', ok: true },
  { label: '内存使用', type: 'progress', percent: 0 },
  { label: 'API服务', type: 'dot', ok: true },
  { label: '运行时长', type: 'dot', ok: true, extra: '' }
])

const fetchSystemStatus = async () => {
  try {
    const data = await getSystemStatus({ skipErrorMessage: true })
    const d = data
    systemStatus.value = [
      { label: '数据库', type: 'dot', ok: d?.services?.database?.status === 'ok' },
      { label: '内存使用', type: 'progress', percent: d?.memory?.heap_percent || 0 },
      { label: 'API服务', type: 'dot', ok: (d?.status === 'online' || d?.status === 'ok') },
      { label: '运行时长', type: 'dot', ok: true, extra: d?.process?.uptime_human || '' }
    ]
    return true
  } catch (e) {
    console.warn('获取系统状态失败:', e)
    return false
  }
}

const dashboardStatusText = computed(() => ({
  fresh: '已同步',
  stale: '部分过期',
  failed: '探测失败'
}[dashboardState.value] || '待同步'))

const dashboardStatusTagType = computed(() => ({
  fresh: 'success',
  stale: 'warning',
  failed: 'danger'
}[dashboardState.value] || 'info'))

const refreshDashboard = async () => {
  refreshing.value = true
  const attemptAt = new Date().toISOString()
  lastAttemptAt.value = attemptAt
  const results = await Promise.all([
    fetchOperationsDashboard(),
    fetchSystemStatus(),
    fetchMemberTierConfig()
  ])
  const successCount = results.filter(Boolean).length
  if (successCount === results.length) {
    dashboardState.value = 'fresh'
    dashboardError.value = ''
    lastSuccessAt.value = attemptAt
  } else if (successCount > 0) {
    dashboardState.value = 'stale'
    dashboardError.value = '部分数据刷新失败，当前页面保留最近一次成功结果'
  } else {
    dashboardState.value = 'failed'
    dashboardError.value = '本次探测失败，当前页面显示的是旧数据'
  }
  refreshing.value = false
}

// ───────────────── Helpers ─────────────────
const getProductImage = (p) => {
  if (!p?.images) return ''
  try {
    const imgs = Array.isArray(p.images) ? p.images : (typeof p.images === 'string' ? JSON.parse(p.images || '[]') : [])
    return imgs[0] || ''
  } catch {
    return ''
  }
}

const normalizeDashboardAmount = (value) => {
  if (value === null || value === undefined || value === '') return 0
  const amount = Number(String(value).trim())
  if (!Number.isFinite(amount)) return 0
  if (Number.isInteger(amount) && Math.abs(amount) >= 1000) {
    return amount / 100
  }
  return amount
}

const formatAmountYuan = (value) => normalizeDashboardAmount(value).toFixed(2)

const getStatusText = (status) => {
  const map = {
    pending: '待支付', paid: '待发货', pickup_pending: '待核销', agent_confirmed: '待确认',
    shipping_requested: '发货中', shipped: '已发货',
    completed: '已完成', cancelled: '已取消'
  }
  return map[status] || status
}

let refreshTimer = null
onMounted(() => {
  refreshDashboard()
  refreshTimer = setInterval(() => {
    refreshDashboard()
  }, 60 * 1000)
})
onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
})
</script>

<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.dashboard-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.dashboard-toolbar__meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.dashboard-toolbar__title {
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}

.dashboard-toolbar__sub {
  font-size: 12px;
  color: #64748b;
}

.dashboard-toolbar__sub--warn {
  color: #b45309;
}

.dashboard-toolbar__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.focus-bar {
  background: linear-gradient(135deg, #111827 0%, #312E81 100%);
  border-radius: 16px;
  padding: 18px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  color: white;
}
.focus-main { display: flex; flex-direction: column; gap: 6px; }
.focus-label { font-size: 12px; color: rgba(255,255,255,0.65); }
.focus-title { font-size: 16px; font-weight: 700; line-height: 1.5; }
.focus-tags { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
.focus-tag {
  font-size: 12px;
  font-weight: 600;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(255,255,255,0.12);
}
button.focus-tag {
  border: none;
  font: inherit;
  color: inherit;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.focus-tag--action:hover {
  background: rgba(255,255,255,0.22);
}
.focus-tag--action:active {
  transform: scale(0.98);
}
.focus-tag-count {
  min-width: 1.25em;
  text-align: center;
  opacity: 1;
}
.focus-tag-count--zero {
  opacity: 0.55;
}

/* ===== KPI 卡片 ===== */
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
}
.kpi-card:hover { border-color: #C7D2FE; box-shadow: 0 4px 20px rgba(99,102,241,0.08); transform: translateY(-2px); }
.kpi-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.kpi-icon { width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: #6366F1; }
.kpi-card--1 .kpi-icon { color: #EC4899; }
.kpi-card--2 .kpi-icon { color: #14B8A6; }
.kpi-card--3 .kpi-icon { color: #F59E0B; }
.kpi-trend { display: flex; align-items: center; gap: 2px; font-size: 11px; font-weight: 600; padding: 3px 7px; border-radius: 20px; }
.trend-up { color: #16A34A; background: rgba(22,163,74,0.1); }
.trend-down { color: #DC2626; background: rgba(220,38,38,0.1); }
.kpi-value { font-size: 28px; font-weight: 800; color: #0F172A; letter-spacing: -0.03em; line-height: 1; margin-bottom: 6px; }
.kpi-title { font-size: 13px; font-weight: 500; color: #64748B; margin-bottom: 2px; }
.kpi-sub { font-size: 11.5px; color: #94A3B8; }

/* ===== 主网格 ===== */
.main-grid { display: grid; grid-template-columns: 1fr 360px; gap: 16px; }
@media (max-width: 1200px) { .main-grid { grid-template-columns: 1fr; } }
.left-col { display: flex; flex-direction: column; gap: 16px; }
.right-col { display: flex; flex-direction: column; gap: 16px; }

/* ===== 通用卡片 ===== */
.card { background: white; border: 1px solid #E2E8F0; border-radius: 14px; overflow: hidden; }
.card-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 20px; border-bottom: 1px solid #F1F5F9;
}
.card-title { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; color: #1E293B; }
.header-actions { display: flex; gap: 8px; }
.title-dot { width: 6px; height: 6px; border-radius: 50%; background: #6366F1; flex-shrink: 0; }
.title-dot--purple { background: #6366F1; }
.title-dot--warn { background: #F59E0B; }
.title-dot--green { background: #10B981; }
.title-dot--orange { background: #F97316; }
.title-dot--red { background: #EF4444; }

.link-btn {
  display: flex; align-items: center; gap: 4px;
  font-size: 12.5px; color: #6366F1; background: none; border: none;
  cursor: pointer; padding: 4px 0; font-weight: 500; transition: opacity 0.15s;
}
.link-btn:hover { opacity: 0.7; }

/* 订单表格 */
.table-wrapper { overflow-x: auto; }
.data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.data-table th {
  text-align: left; padding: 10px 16px;
  font-size: 11px; font-weight: 600; color: #94A3B8;
  text-transform: uppercase; letter-spacing: 0.05em;
  background: #F8FAFC; border-bottom: 1px solid #F1F5F9;
}
.data-table td { padding: 12px 16px; color: #374151; border-bottom: 1px solid #F8FAFC; }
.table-row { cursor: pointer; transition: background 0.1s; }
.table-row:hover td { background: #F8FAFC; }
.table-row:last-child td { border-bottom: none; }
.order-no { font-family: monospace; font-size: 12px; color: #64748B; }
.amount { font-weight: 700; color: #6366F1; }
.time { font-size: 12px; color: #94A3B8; white-space: nowrap; }
.empty-row { text-align: center; color: #94A3B8; padding: 24px 0; font-size: 13px; }

.status-badge { display: inline-block; padding: 3px 8px; border-radius: 20px; font-size: 11px; font-weight: 600; }
.status-pending { background: #EFF6FF; color: #3B82F6; }
.status-paid { background: #FEF3C7; color: #D97706; }
.status-agent_confirmed, .status-shipping_requested { background: #FEF3C7; color: #D97706; }
.status-shipped { background: #EDE9FE; color: #7C3AED; }
.status-completed { background: #ECFDF5; color: #059669; }
.status-cancelled { background: #FEF2F2; color: #DC2626; }

/* 库存预警 */
.stock-list { padding: 4px 0; }
.stock-item {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 20px; border-bottom: 1px solid #F8FAFC;
}
.stock-item:last-child { border-bottom: none; }
.stock-thumb { width: 36px; height: 36px; border-radius: 8px; object-fit: cover; background: #F1F5F9; flex-shrink: 0; }
.stock-info { flex: 1; min-width: 0; }
.stock-name { font-size: 13px; font-weight: 500; color: #1E293B; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.stock-count { font-size: 12px; font-weight: 700; padding: 3px 8px; border-radius: 20px; flex-shrink: 0; }
.stock-zero { background: #FEE2E2; color: #DC2626; }
.stock-low { background: #FEF3C7; color: #D97706; }

/* 热度榜 */
.rank-list { padding: 4px 0; }
.rank-item { display: flex; align-items: center; gap: 10px; padding: 10px 16px; transition: background 0.1s; }
.rank-item:hover { background: #F8FAFC; }
.rank-no {
  width: 22px; height: 22px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 700; color: #94A3B8; background: #F1F5F9; flex-shrink: 0;
}
.rank-top1 { background: #FDE68A; color: #B45309; }
.rank-top2 { background: #E2E8F0; color: #475569; }
.rank-top3 { background: #FED7AA; color: #C2410C; }
.rank-thumb { width: 36px; height: 36px; border-radius: 8px; object-fit: cover; background: #F1F5F9; flex-shrink: 0; }
.rank-info { flex: 1; min-width: 0; }
.rank-name { font-size: 13px; font-weight: 500; color: #1E293B; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rank-meta { font-size: 11px; color: #94A3B8; margin-top: 2px; }
.rank-price { font-size: 13px; font-weight: 700; color: #6366F1; flex-shrink: 0; }

/* 待办 */
.todo-list { padding: 4px 0; }
.todo-item { display: flex; align-items: center; justify-content: space-between; padding: 11px 20px; cursor: pointer; transition: background 0.15s; }
.todo-item:hover { background: #F8FAFC; }
.todo-left { display: flex; align-items: center; gap: 10px; }
.todo-icon { width: 30px; height: 30px; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #6366F1; flex-shrink: 0; }
.todo-label { font-size: 13px; font-weight: 500; color: #374151; }
.todo-badge { font-size: 11.5px; font-weight: 700; min-width: 24px; height: 24px; border-radius: 12px; display: flex; align-items: center; justify-content: center; padding: 0 6px; }
.badge-active { background: #FEE2E2; color: #DC2626; }
.badge-zero { background: #F1F5F9; color: #94A3B8; }

/* 系统状态 */
.status-list { padding: 4px 0 8px; }
.status-item { display: flex; align-items: center; justify-content: space-between; padding: 10px 20px; }
.status-label { font-size: 13px; color: #374151; }
.status-right { display: flex; align-items: center; }
.status-bar { width: 80px; height: 6px; background: #F1F5F9; border-radius: 3px; overflow: hidden; }
.bar-fill { height: 100%; border-radius: 3px; transition: width 0.6s ease; }
.bar-good .bar-fill { background: #10B981; }
.bar-warn .bar-fill { background: #F59E0B; }
.bar-danger .bar-fill { background: #EF4444; }
.status-dot-label { font-size: 11.5px; font-weight: 600; padding: 3px 8px; border-radius: 20px; }
.status-dot-label.ok { background: #ECFDF5; color: #059669; }
.status-dot-label.err { background: #FEF2F2; color: #DC2626; }

/* 会员等级快照 */
.tier-list { padding: 8px 20px 14px; }
.tier-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid #F8FAFC;
}
.tier-item:last-child { border-bottom: none; }
.tier-name { font-size: 13px; color: #1E293B; font-weight: 500; }
.tier-threshold { font-size: 12px; color: #64748B; }

/* 快捷操作 */
.quick-list { padding: 8px 0; }
.quick-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 20px;
  cursor: pointer;
}
.quick-item:hover { background: #F8FAFC; }
.quick-name { flex: 1; font-size: 13px; color: #374151; font-weight: 500; }

@media (max-width: 767px) {
  .focus-bar { flex-direction: column; align-items: flex-start; }
  .focus-tags { justify-content: flex-start; }
}
</style>
