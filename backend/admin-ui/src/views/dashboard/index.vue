<template>
  <div class="dashboard">
    <!-- 统计卡片 -->
    <el-row :gutter="20">
      <el-col :xs="24" :sm="12" :lg="6" v-for="item in statsCards" :key="item.title">
        <el-card class="stats-card" shadow="hover">
          <div class="stats-card-content">
            <div class="stats-info">
              <div class="stats-title">{{ item.title }}</div>
              <div class="stats-value">{{ item.value }}</div>
              <div class="stats-sub" v-if="item.sub">{{ item.sub }}</div>
            </div>
            <div class="stats-icon" :style="{ background: item.color }">
              <el-icon :size="32"><component :is="item.icon" /></el-icon>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" style="margin-top: 20px;">
      <!-- 近期订单 -->
      <el-col :xs="24" :lg="16">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>近期订单</span>
              <el-button text type="primary" @click="$router.push('/orders')">
                查看更多
              </el-button>
            </div>
          </template>

          <el-table :data="recentOrders" v-loading="loading" stripe>
            <el-table-column prop="order_no" label="订单号" width="180" />
            <el-table-column label="用户" width="120">
              <template #default="{ row }">
                {{ row.User?.nickname || row.user_name || '-' }}
              </template>
            </el-table-column>
            <el-table-column label="金额" width="100">
              <template #default="{ row }">
                <span class="amount">¥{{ row.actual_price || row.total_amount || 0 }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="getStatusType(row.status)" size="small">
                  {{ getStatusText(row.status) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="created_at" label="创建时间">
              <template #default="{ row }">
                {{ formatDate(row.created_at) }}
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>

      <!-- 待处理事项 -->
      <el-col :xs="24" :lg="8">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>待处理事项</span>
            </div>
          </template>

          <div class="todo-list">
            <div class="todo-item" v-for="item in todoItems" :key="item.title" @click="handleTodoClick(item.path)">
              <div class="todo-left">
                <el-icon :size="18" :color="item.iconColor"><component :is="item.icon" /></el-icon>
                <span class="todo-title">{{ item.title }}</span>
              </div>
              <div class="todo-right">
                <el-badge :value="item.count" :type="item.type" :hidden="item.count === 0">
                  <el-button size="small" plain>处理</el-button>
                </el-badge>
              </div>
            </div>
          </div>
        </el-card>

        <!-- 系统通知 -->
        <el-card style="margin-top: 20px;" v-if="notifications.length > 0">
          <template #header>
            <div class="card-header">
              <span>系统通知</span>
            </div>
          </template>
          <div class="notification-list">
            <div class="notification-item" v-for="n in notifications" :key="n.id">
              <el-icon :size="14" color="#909399"><Bell /></el-icon>
              <span class="notification-content">{{ n.content || n.title }}</span>
              <span class="notification-time">{{ formatDate(n.created_at) }}</span>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>
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
  { title: '今日订单', value: '0', sub: '', icon: 'ShoppingCart', color: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
  { title: '今日销售额', value: '¥0', sub: '', icon: 'Money', color: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' },
  { title: '总用户数', value: '0', sub: '', icon: 'User', color: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' },
  { title: '待发货订单', value: '0', sub: '', icon: 'Box', color: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)' }
])

const recentOrders = ref([])
const notifications = ref([])

const todoItems = ref([
  { title: '待发货订单', count: 0, type: 'warning', path: '/orders', icon: 'Box', iconColor: '#E6A23C' },
  { title: '提现申请', count: 0, type: 'danger', path: '/withdrawals', icon: 'Money', iconColor: '#F56C6C' },
  { title: '售后申请', count: 0, type: 'info', path: '/refunds', icon: 'RefreshLeft', iconColor: '#909399' },
  { title: '待审批佣金', count: 0, type: 'warning', path: '/orders', icon: 'Wallet', iconColor: '#E6A23C' }
])

const fetchDashboard = async () => {
  try {
    const data = await getDashboardOverview()
    
    // 更新统计卡片
    statsCards.value[0].value = String(data.orders?.today || 0)
    statsCards.value[0].sub = `本月 ${data.orders?.month || 0} 单`
    statsCards.value[1].value = '¥' + Number(data.sales?.today || 0).toFixed(2)
    statsCards.value[1].sub = `本月 ¥${Number(data.sales?.month || 0).toFixed(2)}`
    statsCards.value[2].value = String(data.users?.total || 0)
    statsCards.value[2].sub = `今日新增 ${data.users?.todayNew || 0}`
    statsCards.value[3].value = String(data.pending?.orders || 0)
    statsCards.value[3].sub = `运送中 ${data.pending?.shipping || 0}`

    // 更新待处理事项
    todoItems.value[0].count = data.pending?.orders || 0
    todoItems.value[1].count = data.pending?.withdrawals || 0
    todoItems.value[2].count = data.pending?.refunds || 0
    todoItems.value[3].count = data.pending?.commissions || 0
  } catch (error) {
    console.error('获取统计数据失败:', error)
  }
}

const fetchNotifications = async () => {
  try {
    const data = await getDashboardNotifications()
    notifications.value = data.notifications || []
  } catch (error) {
    console.error('获取通知失败:', error)
  }
}

const fetchRecentOrders = async () => {
  loading.value = true
  try {
    const data = await getOrders({ page: 1, limit: 10 })
    recentOrders.value = data.list || []
  } catch (error) {
    console.error('获取订单列表失败:', error)
  } finally {
    loading.value = false
  }
}

const getStatusType = (status) => {
  const statusMap = {
    'pending': 'info',
    'paid': 'warning',
    'agent_confirmed': 'warning',
    'shipping_requested': 'warning',
    'shipped': 'primary',
    'completed': 'success',
    'cancelled': 'danger'
  }
  return statusMap[status] || 'info'
}

const getStatusText = (status) => {
  const statusMap = {
    'pending': '待支付',
    'paid': '待发货',
    'agent_confirmed': '代理已确认',
    'shipping_requested': '请求发货',
    'shipped': '已发货',
    'completed': '已完成',
    'cancelled': '已取消'
  }
  return statusMap[status] || status
}

const formatDate = (date) => {
  if (!date) return '-'
  return dayjs(date).format('MM-DD HH:mm')
}

const handleTodoClick = (path) => {
  router.push(path)
}

onMounted(() => {
  fetchDashboard()
  fetchNotifications()
  fetchRecentOrders()
})
</script>

<style scoped>
.dashboard {
  padding: 0;
}

.stats-card {
  margin-bottom: 20px;
  cursor: default;
}

.stats-card-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.stats-info {
  flex: 1;
}

.stats-title {
  font-size: 14px;
  color: #909399;
  margin-bottom: 8px;
}

.stats-value {
  font-size: 28px;
  font-weight: bold;
  color: #303133;
  margin-bottom: 4px;
}

.stats-sub {
  font-size: 12px;
  color: #c0c4cc;
}

.stats-icon {
  width: 64px;
  height: 64px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  flex-shrink: 0;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.amount {
  font-weight: 600;
  color: #f56c6c;
}

.todo-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.todo-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  background: #f5f7fa;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.todo-item:hover {
  background: #ecf5ff;
}

.todo-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.todo-title {
  font-size: 14px;
  color: #606266;
}

.notification-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.notification-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 13px;
  color: #606266;
  padding: 8px 0;
  border-bottom: 1px solid #f0f0f0;
}

.notification-item:last-child {
  border-bottom: none;
}

.notification-content {
  flex: 1;
  line-height: 1.4;
}

.notification-time {
  font-size: 11px;
  color: #c0c4cc;
  white-space: nowrap;
  flex-shrink: 0;
}
</style>
