<template>
  <div class="dashboard-container">
    <!-- Page Title -->
    <div class="page-header">
      <div>
        <h1 class="page-title">经营概览</h1>
        <p class="page-subtitle">实时监控您的业务数据和关键指标</p>
      </div>
      <div class="page-actions">
        <el-button type="primary" :icon="Refresh" @click="refreshData" :loading="loading">
          刷新数据
        </el-button>
      </div>
    </div>

    <!-- Statistics Cards -->
    <el-row :gutter="20" class="stats-row">
      <el-col :xs="24" :sm="12" :lg="6" v-for="(card, index) in cards" :key="index">
        <el-card shadow="hover" class="stat-card" :class="`stat-card-${card.type}`">
          <div class="stat-card-content">
            <div class="stat-icon-wrapper" :class="`bg-${card.type}`">
              <el-icon class="stat-icon">
                <component :is="card.icon" />
              </el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-label">{{ card.title }}</div>
              <div class="stat-value">{{ card.value }}</div>
              <div class="stat-trend" v-if="card.trend">
                <el-icon :class="card.trend > 0 ? 'trend-up' : 'trend-down'">
                  <component :is="card.trend > 0 ? 'ArrowUp' : 'ArrowDown'" />
                </el-icon>
                <span :class="card.trend > 0 ? 'trend-up' : 'trend-down'">
                  {{ Math.abs(card.trend) }}%
                </span>
                <span class="trend-label">较昨日</span>
              </div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- Pending Tasks & Quick Actions -->
    <el-row :gutter="20" class="section-row">
      <!-- Pending Tasks -->
      <el-col :xs="24" :lg="16">
        <el-card shadow="never" class="section-card">
          <template #header>
            <div class="card-header">
              <div class="card-header-left">
                <el-icon class="card-icon warning"><Clock /></el-icon>
                <span class="card-title">待处理事项</span>
              </div>
              <el-link type="primary" :underline="false">查看全部</el-link>
            </div>
          </template>
          
          <div class="pending-grid">
            <div 
              v-for="(item, index) in pendingItems" 
              :key="index"
              class="pending-item"
              @click="handlePendingClick(item.route)"
            >
              <div class="pending-icon-wrapper" :class="`bg-${item.type}-light`">
                <el-icon :size="24" :class="`text-${item.type}`">
                  <component :is="item.icon" />
                </el-icon>
              </div>
              <div class="pending-info">
                <div class="pending-count" :class="`text-${item.type}`">
                  {{ item.count }}
                </div>
                <div class="pending-label">{{ item.label }}</div>
              </div>
              <el-icon class="pending-arrow"><ArrowRight /></el-icon>
            </div>
          </div>
        </el-card>
      </el-col>

      <!-- Quick Actions -->
      <el-col :xs="24" :lg="8">
        <el-card shadow="never" class="section-card">
          <template #header>
            <div class="card-header">
              <div class="card-header-left">
                <el-icon class="card-icon primary"><Lightning /></el-icon>
                <span class="card-title">快捷操作</span>
              </div>
            </div>
          </template>
          
          <div class="quick-actions">
            <el-button 
              v-for="(action, index) in quickActions" 
              :key="index"
              :type="action.type"
              plain
              class="quick-action-btn"
              @click="$router.push(action.route)"
            >
              <el-icon class="action-icon"><component :is="action.icon" /></el-icon>
              <span>{{ action.label }}</span>
            </el-button>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- Recent Activity -->
    <el-row :gutter="20" class="section-row">
      <el-col :span="24">
        <el-card shadow="never" class="section-card">
          <template #header>
            <div class="card-header">
              <div class="card-header-left">
                <el-icon class="card-icon info"><Timer /></el-icon>
                <span class="card-title">最近动态</span>
              </div>
              <el-link type="primary" :underline="false">查看全部</el-link>
            </div>
          </template>
          
          <el-timeline>
            <el-timeline-item
              v-for="(activity, index) in recentActivities"
              :key="index"
              :type="activity.type"
              :icon="activity.icon"
              :timestamp="activity.time"
            >
              <div class="activity-content">
                <div class="activity-title">{{ activity.title }}</div>
                <div class="activity-desc">{{ activity.description }}</div>
              </div>
            </el-timeline-item>
          </el-timeline>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import request from '@/utils/request'
import {
  Refresh, Odometer, Goods, List, User, Money,
  Clock, ArrowRight, Lightning, Timer, ArrowUp, ArrowDown,
  Box, Wallet, Service, UserFilled, Shop, DocumentChecked,
  CircleCheck, Warning, InfoFilled
} from '@element-plus/icons-vue'

const router = useRouter()
const loading = ref(false)

const cards = ref([
  { 
    title: '今日订单', 
    value: '0', 
    icon: 'List', 
    type: 'primary',
    trend: 12.5
  },
  { 
    title: '今日销售额', 
    value: '¥0.00', 
    icon: 'Money', 
    type: 'success',
    trend: 8.2
  },
  { 
    title: '总用户数', 
    value: '0', 
    icon: 'User', 
    type: 'warning',
    trend: -2.1
  },
  { 
    title: '总商品数', 
    value: '0', 
    icon: 'Goods', 
    type: 'info',
    trend: 5.7
  }
])

const pendingItems = ref([
  { count: 0, label: '待发货订单', icon: 'Box', type: 'warning', route: '/orders' },
  { count: 0, label: '待审核提现', icon: 'Wallet', type: 'danger', route: '/withdrawals' },
  { count: 0, label: '待处理售后', icon: 'Service', type: 'info', route: '/refunds' },
  { count: 0, label: '待审批佣金', icon: 'DocumentChecked', type: 'success', route: '/commissions' }
])

const quickActions = ref([
  { label: '处理订单', icon: 'List', type: 'primary', route: '/orders' },
  { label: '审核提现', icon: 'Wallet', type: 'success', route: '/withdrawals' },
  { label: '处理售后', icon: 'Service', type: 'warning', route: '/refunds' },
  { label: '分销管理', icon: 'UserFilled', type: 'info', route: '/distribution' },
  { label: '经销商审核', icon: 'Shop', type: 'danger', route: '/dealers' },
  { label: '商品管理', icon: 'Goods', type: 'primary', route: '/products' }
])

const recentActivities = ref([
  {
    title: '新订单创建',
    description: '用户 张三 创建了订单 #20250212001',
    time: '10分钟前',
    type: 'primary',
    icon: 'CircleCheck'
  },
  {
    title: '提现申请',
    description: '分销员 李四 申请提现 ¥500.00',
    time: '30分钟前',
    type: 'warning',
    icon: 'Wallet'
  },
  {
    title: '售后处理',
    description: '订单 #20250211089 售后已处理完成',
    time: '1小时前',
    type: 'success',
    icon: 'Service'
  },
  {
    title: '系统通知',
    description: '今日数据备份已完成',
    time: '2小时前',
    type: 'info',
    icon: 'InfoFilled'
  }
])

const loadStats = async () => {
  try {
    const [statsRes, notifRes] = await Promise.all([
      request.get('/statistics/overview').catch(() => null),
      request.get('/dashboard/notifications').catch(() => null)
    ])

    if (statsRes?.data) {
      const s = statsRes.data
      cards.value[0].value = s.todayOrders?.toString() || '0'
      cards.value[1].value = `¥${Number(s.todaySales || 0).toFixed(2)}`
      cards.value[2].value = s.totalUsers?.toString() || '0'
      cards.value[3].value = s.totalProducts?.toString() || '0'
    }

    if (notifRes?.data?.pendingCounts) {
      const pc = notifRes.data.pendingCounts
      pendingItems.value[0].count = pc.pendingShip || 0
      pendingItems.value[1].count = pc.withdrawals || 0
      pendingItems.value[2].count = pc.refunds || 0
      pendingItems.value[3].count = pc.commissions || 0
    }
  } catch (error) {
    console.error('Failed to load stats', error)
  }
}

const refreshData = async () => {
  loading.value = true
  await loadStats()
  loading.value = false
  ElMessage.success('数据已刷新')
}

const handlePendingClick = (route) => {
  router.push(route)
}

onMounted(() => {
  loadStats()
})
</script>

<style scoped>
.dashboard-container {
  padding-bottom: 24px;
}

/* Page Header */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
}

.page-title {
  font-size: 28px;
  font-weight: 700;
  color: var(--slate-800);
  margin: 0 0 8px 0;
  line-height: 1.2;
}

.page-subtitle {
  font-size: 14px;
  color: var(--slate-500);
  margin: 0;
}

.page-actions {
  display: flex;
  gap: 12px;
}

/* Stats Cards */
.stats-row {
  margin-bottom: 20px;
}

.stat-card {
  border: none;
  transition: all 0.3s ease;
}

.stat-card:hover {
  transform: translateY(-2px);
}

.stat-card-content {
  display: flex;
  align-items: center;
  gap: 16px;
}

.stat-icon-wrapper {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.stat-icon {
  font-size: 28px;
  color: white;
}

.stat-info {
  flex: 1;
  min-width: 0;
}

.stat-label {
  font-size: 13px;
  color: var(--slate-500);
  margin-bottom: 4px;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: var(--slate-800);
  margin-bottom: 4px;
}

.stat-trend {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
}

.trend-up {
  color: var(--success-500);
}

.trend-down {
  color: var(--danger-500);
}

.trend-label {
  color: var(--slate-400);
}

/* Background Colors */
.bg-primary {
  background: linear-gradient(135deg, var(--primary-500) 0%, var(--primary-600) 100%);
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
}

.bg-success {
  background: linear-gradient(135deg, var(--success-500) 0%, var(--success-600) 100%);
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
}

.bg-warning {
  background: linear-gradient(135deg, var(--warning-500) 0%, var(--warning-600) 100%);
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.4);
}

.bg-info {
  background: linear-gradient(135deg, var(--info-500) 0%, var(--info-600) 100%);
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
}

.bg-danger-light {
  background-color: var(--danger-50);
}

.bg-warning-light {
  background-color: var(--warning-50);
}

.bg-success-light {
  background-color: var(--success-50);
}

.bg-info-light {
  background-color: var(--info-50);
}

.bg-primary-light {
  background-color: var(--primary-50);
}

/* Text Colors */
.text-primary { color: var(--primary-600); }
.text-success { color: var(--success-600); }
.text-warning { color: var(--warning-600); }
.text-danger { color: var(--danger-600); }
.text-info { color: var(--info-600); }

/* Section Cards */
.section-row {
  margin-bottom: 20px;
}

.section-card {
  border: none;
  height: 100%;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.card-icon {
  font-size: 18px;
}

.card-icon.primary { color: var(--primary-500); }
.card-icon.success { color: var(--success-500); }
.card-icon.warning { color: var(--warning-500); }
.card-icon.danger { color: var(--danger-500); }
.card-icon.info { color: var(--info-500); }

.card-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--slate-800);
}

/* Pending Grid */
.pending-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.pending-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background-color: var(--slate-50);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: all 0.2s ease;
  border: 1px solid transparent;
}

.pending-item:hover {
  background-color: white;
  border-color: var(--slate-200);
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);
}

.pending-icon-wrapper {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.pending-info {
  flex: 1;
  min-width: 0;
}

.pending-count {
  font-size: 24px;
  font-weight: 700;
  line-height: 1;
  margin-bottom: 4px;
}

.pending-label {
  font-size: 13px;
  color: var(--slate-500);
}

.pending-arrow {
  color: var(--slate-400);
  font-size: 16px;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.pending-item:hover .pending-arrow {
  opacity: 1;
}

/* Quick Actions */
.quick-actions {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.quick-action-btn {
  height: 48px;
  justify-content: flex-start;
  padding: 0 16px;
  border-radius: var(--radius-lg);
}

.action-icon {
  margin-right: 8px;
}

/* Activity Timeline */
.activity-content {
  padding: 8px 0;
}

.activity-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--slate-800);
  margin-bottom: 4px;
}

.activity-desc {
  font-size: 13px;
  color: var(--slate-500);
  line-height: 1.5;
}

/* Responsive */
@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    gap: 16px;
  }
  
  .page-title {
    font-size: 24px;
  }
  
  .pending-grid {
    grid-template-columns: 1fr;
  }
  
  .quick-actions {
    grid-template-columns: 1fr;
  }
}
</style>
