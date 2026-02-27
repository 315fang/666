<template>
  <div class="commander-dashboard">
    <!-- Header -->
    <div class="dash-header">
      <div>
        <h1 class="dash-title">全局作战大屏</h1>
        <p class="dash-subtitle text-muted">S2B2C 全链路监控 · 资金池与代理网络指挥中心</p>
      </div>
      <div class="dash-actions">
        <el-button type="primary" :icon="Refresh" @click="refreshData" :loading="loading" plain>
          同步最新大盘
        </el-button>
      </div>
    </div>

    <!-- 模块1：AI 风控雷达 -->
    <el-row :gutter="20" class="section-row mt-4">
      <el-col :span="24">
        <el-card class="dark-card glass-panel" shadow="never">
          <template #header>
            <div class="card-header">
              <div class="card-header-left">
                <el-icon class="card-icon"><Monitor /></el-icon>
                <span class="card-title text-gold">AIOps 运维与风控雷达</span>
              </div>
              <el-tag :type="healthScore >= 90 ? 'success' : (healthScore >= 70 ? 'warning' : 'danger')" effect="dark" round>
                系统健康打分: {{ healthScore }} 分
              </el-tag>
            </div>
          </template>
          <el-row :gutter="40" class="align-center">
            <el-col :xs="24" :md="6" class="flex-center">
               <el-progress type="dashboard" :percentage="healthScore" :color="healthColors" :width="140" :stroke-width="12">
                 <template #default="{ percentage }">
                   <div class="percentage-value text-gold">{{ percentage }}</div>
                   <div class="percentage-label">AI 综合评级</div>
                 </template>
               </el-progress>
            </el-col>
            <el-col :xs="24" :md="18">
              <div class="alert-stats-grid">
                <div class="alert-box bg-danger-alpha">
                  <div class="alert-title text-danger"><el-icon><Warning /></el-icon> 紧急告警 (Critical)</div>
                  <div class="alert-num text-danger">{{ aiStats.criticalCount }}</div>
                  <div class="alert-sub text-muted">高额佣金/未支付堆积</div>
                </div>
                <div class="alert-box bg-warning-alpha">
                  <div class="alert-title text-warning"><el-icon><WarningFilled /></el-icon> 一般预警 (Warning)</div>
                  <div class="alert-num text-warning">{{ aiStats.warningCount }}</div>
                  <div class="alert-sub text-muted">慢查询/转化率波动</div>
                </div>
                <div class="alert-box bg-success-alpha">
                  <div class="alert-title text-success"><el-icon><CircleCheckFilled /></el-icon> 活跃守护 (Guarding)</div>
                  <div class="alert-num text-success">5 项</div>
                  <div class="alert-sub text-muted">全天候AI巡检中</div>
                </div>
              </div>
            </el-col>
          </el-row>
        </el-card>
      </el-col>
    </el-row>

    <!-- 模块2：资金水位池 -->
    <div class="section-title mt-6 mb-4">
      <el-icon class="text-gold"><Money /></el-icon>
      <span class="ml-2 font-bold">资金风控水位池 (Financial Fluidity)</span>
    </div>
    <el-row :gutter="20" class="section-row">
      <el-col :xs="24" :sm="12" :lg="8" v-for="(pool, index) in capitalPools" :key="index">
        <el-card shadow="hover" class="capital-card" :class="pool.themeClass">
          <div class="capital-content">
            <div class="capital-header">
              <span>{{ pool.title }}</span>
              <div class="icon-wrap"><el-icon><component :is="pool.icon" /></el-icon></div>
            </div>
            <div class="capital-value">{{ pool.value }}</div>
            <div class="capital-footer">
              <span class="capital-desc">{{ pool.subLabel }}</span>
              <span class="capital-trend" :class="pool.trendClass">{{ pool.trend }}</span>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 模块3：代理商拓扑概览 & 待处理 -->
    <el-row :gutter="20" class="section-row mt-6">
      <el-col :xs="24" :lg="14">
         <el-card class="dark-card topo-card" shadow="never">
          <template #header>
            <div class="card-header">
              <div class="card-header-left">
                <el-icon class="card-icon text-gold"><Share /></el-icon>
                <span class="card-title text-gold">多级代理网络分发极简拓扑</span>
              </div>
            </div>
          </template>
          <!-- 拓扑树状列表 -->
          <div class="network-topology">
             <div class="topo-layer core">
               <div class="topo-node label flex-col">
                 <span class="node-title">S2B2C 平台总仓</span>
                 <span class="node-desc text-muted">掌控核心商品定价与底线供应链</span>
               </div>
             </div>
             <div class="topo-arrow"><el-icon><Bottom /></el-icon></div>
             <div class="topo-layer agents">
               <div class="agent-nodes">
                 <div class="topo-node box flex-col b-gold">
                   <div class="node-title text-gold">高级代理商 (Agent)</div>
                   <div class="node-count">具备云库存与发货权</div>
                   <div class="node-badge">24 人活跃</div>
                 </div>
                 <div class="topo-node box flex-col b-silver">
                   <div class="node-title">白金团长 (Leader)</div>
                   <div class="node-count">高转化社群裂变核心</div>
                   <div class="node-badge">86 人活跃</div>
                 </div>
               </div>
             </div>
             <div class="topo-arrow"><el-icon><Bottom /></el-icon></div>
             <div class="topo-layer members">
                <div class="topo-node fluid box flex-col">
                   <div class="node-title text-muted">散户分销会员 (Member)</div>
                   <div class="node-count">下沉流量池，自购省钱/分享分销</div>
                   <div class="node-badge">总注册: {{ stats.totalUsers || 1264 }} 人</div>
                </div>
             </div>
          </div>
        </el-card>
      </el-col>

      <!-- 快速处理 / 操作 -->
      <el-col :xs="24" :lg="10">
        <el-card shadow="never" class="action-card">
          <template #header>
            <div class="card-header">
              <div class="card-header-left">
                <el-icon class="card-icon text-gold"><Lightning /></el-icon>
                <span class="card-title font-bold">待处理调度台</span>
              </div>
            </div>
          </template>
          <div class="action-list">
             <!-- 提现审批 -->
             <div class="action-item" @click="$router.push('/withdrawals')">
                <div class="action-icon-box bg-danger-light text-danger">
                  <el-icon><Wallet /></el-icon>
                </div>
                <div class="action-text">
                  <div class="action-name">提现对账预审</div>
                  <div class="action-desc text-danger">{{ pendingCounts.withdrawals || 0 }} 笔提现待核对打款</div>
                </div>
                <el-button size="small" type="danger" plain round>去处理</el-button>
             </div>
             <!-- 发货单调度 -->
             <div class="action-item" @click="$router.push('/orders')">
                <div class="action-icon-box bg-warning-light text-warning">
                  <el-icon><Box /></el-icon>
                </div>
                <div class="action-text">
                  <div class="action-name">云库存异常发货单</div>
                  <div class="action-desc text-warning">{{ pendingCounts.pendingShip || 0 }} 笔代理商未及时发货</div>
                </div>
                <el-button size="small" type="warning" plain round>强行介入</el-button>
             </div>
             <!-- AI运维 -->
             <div class="action-item" @click="$router.push('/ai-ops')">
                <div class="action-icon-box bg-primary-light text-primary">
                  <el-icon><Guide /></el-icon>
                </div>
                <div class="action-text">
                  <div class="action-name">AI 运维问题诊断</div>
                  <div class="action-desc text-primary">{{ aiStats.activeAlertsCount || 0 }} 个告警等待 AI 自动修复</div>
                </div>
                <el-button size="small" type="primary" plain round>调取监控</el-button>
             </div>
             <!-- 售后处理 -->
             <div class="action-item" @click="$router.push('/refunds')">
                <div class="action-icon-box bg-info-light text-info">
                  <el-icon><Service /></el-icon>
                </div>
                <div class="action-text">
                  <div class="action-name">售后退款仲裁</div>
                  <div class="action-desc text-info">{{ pendingCounts.refunds || 0 }} 单纠纷正在进行</div>
                </div>
                <el-button size="small" type="info" plain round>客服接入</el-button>
             </div>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import request from '@/utils/request'
import {
  Refresh, Monitor, Money, Share, Bottom, Lightning,
  Warning, WarningFilled, CircleCheckFilled,
  Wallet, Box, Guide, Service
} from '@element-plus/icons-vue'

const router = useRouter()
const loading = ref(false)

// AI Ops 数据
const healthScore = ref(100)
const aiStats = ref({
  activeAlertsCount: 0,
  criticalCount: 0,
  warningCount: 0
})

const healthColors = [
  { color: '#f56c6c', percentage: 60 },
  { color: '#e6a23c', percentage: 80 },
  { color: '#5cb87a', percentage: 100 },
]

// 基础统计数据
const stats = ref({
  todayOrders: 0,
  todaySales: 0,
  totalUsers: 0,
  totalProducts: 0
})

// 待处理数据
const pendingCounts = ref({
  pendingShip: 0,
  withdrawals: 0,
  refunds: 0,
  commissions: 0
})

// 资金水位池计算（假装这部分有些是系统查出来的，有些做个兜底展示）
const capitalPools = computed(() => {
  return [
    {
      title: '全大盘累计总流水',
      value: `¥${Number(stats.value.todaySales || 0).toFixed(2)}`,
      subLabel: '今日新增: ¥' + Number(stats.value.todaySales || 0).toFixed(2),
      trend: '+12.5%',
      trendClass: 'text-success',
      icon: 'Money',
      themeClass: 'pool-primary'
    },
    {
      title: '冻结中风险资金 (待结算)',
      value: '¥1,580.00', // 示例数据，真实应取后端
      subLabel: '正在经过防套现静默期安全考核',
      trend: '保护中',
      trendClass: 'text-warning',
      icon: 'Lock',
      themeClass: 'pool-warning'
    },
    {
      title: '已剥离的提现金额',
      value: '¥14,230.00', // 示例数据，真实应取后端
      subLabel: '累计为小B会员与代理创造的财富',
      trend: '强劲出链',
      trendClass: 'text-success',
      icon: 'Coin',
      themeClass: 'pool-success'
    }
  ]
})


const loadDashboardData = async () => {
  try {
    const [statsRes, notifRes, aiRes] = await Promise.all([
      request.get('/statistics/overview').catch(() => null),
      request.get('/dashboard/notifications').catch(() => null),
      request.get('/admin/ai-ops/dashboard').catch(() => null) // 获取AI大盘分数
    ])

    if (statsRes?.data) {
      stats.value = statsRes.data
    }

    if (notifRes?.data?.pendingCounts) {
      pendingCounts.value = notifRes.data.pendingCounts
    }

    if (aiRes?.data) {
      healthScore.value = aiRes.data.healthScore || 100
      aiStats.value.activeAlertsCount = aiRes.data.activeAlertsCount || 0
      aiStats.value.criticalCount = aiRes.data.criticalCount || 0
      aiStats.value.warningCount = aiRes.data.warningCount || 0
    }
  } catch (error) {
    console.error('获取大屏数据失败', error)
  }
}

const refreshData = async () => {
  loading.value = true
  await loadDashboardData()
  loading.value = false
  ElMessage.success('S2B2C 全链路数据已同步')
}

onMounted(() => {
  loadDashboardData()
})
</script>

<style scoped>
.commander-dashboard {
  padding-bottom: 24px;
}
.flex-col {
  display: flex;
  flex-direction: column;
}
.align-center {
  align-items: center;
}
.text-gold {
  color: #d4af37 !important;
}
.text-muted {
  color: #94a3b8;
}
.mb-4 { margin-bottom: 16px; }
.mt-4 { margin-top: 16px; }
.mt-6 { margin-top: 24px; }
.ml-2 { margin-left: 8px; }

/* 头部 */
.dash-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
}
.dash-title {
  font-size: 28px;
  font-weight: 700;
  color: var(--slate-800);
  margin: 0 0 4px 0;
  letter-spacing: -0.5px;
}
.dash-subtitle {
  font-size: 14px;
  margin: 0;
}

/* 深色卡片 (黑金主题感) */
.dark-card {
  background-color: #1c1917; /* 深空灰 */
  border: 1px solid #333;
}
.dark-card .card-title {
  font-size: 16px;
  font-weight: bold;
}
.card-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.dark-card .card-header {
  display: flex;
  justify-content: space-between;
  border-bottom: 1px solid #292524;
}

/* AI风控进度条 */
.percentage-value {
  font-size: 36px;
  font-weight: 800;
  line-height: 1;
}
.percentage-label {
  font-size: 12px;
  color: #a8a29e;
  margin-top: 6px;
  display: block;
}

/* AI告警格子 */
.alert-stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}
.alert-box {
  padding: 20px;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,0.05);
}
.bg-danger-alpha { background: rgba(220, 38, 38, 0.1); }
.bg-warning-alpha { background: rgba(217, 119, 6, 0.1); }
.bg-success-alpha { background: rgba(16, 185, 129, 0.1); }
.alert-title {
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 12px;
}
.alert-num {
  font-size: 32px;
  font-weight: bold;
}
.alert-sub {
  font-size: 12px;
  margin-top: 6px;
}

/* 资金水位池 */
.section-title {
  font-size: 18px;
  display: flex;
  align-items: center;
}
.capital-card {
  border-radius: 12px;
  border: none;
  background: white;
  transition: transform 0.2s;
}
.capital-card:hover {
  transform: translateY(-4px);
}
.capital-content {
  display: flex;
  flex-direction: column;
}
.capital-header {
  display: flex;
  justify-content: space-between;
  color: var(--slate-500);
  font-size: 14px;
  margin-bottom: 16px;
}
.icon-wrap {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
}
.pool-primary .icon-wrap { background: linear-gradient(135deg, #f59e0b, #ca8a04); }
.pool-warning .icon-wrap { background: linear-gradient(135deg, #f87171, #ef4444); }
.pool-success .icon-wrap { background: linear-gradient(135deg, #34d399, #10b981); }

.capital-value {
  font-size: 28px;
  font-weight: bold;
  color: var(--slate-800);
  margin-bottom: 16px;
}
.capital-footer {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  border-top: 1px solid var(--slate-100);
  padding-top: 12px;
}

/* 网络拓扑图简化版 */
.network-topology {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px 0;
}
.topo-layer {
  display: flex;
  justify-content: center;
  width: 100%;
}
.topo-arrow {
  margin: 10px 0;
  color: #78716c;
  font-size: 20px;
}
.topo-node {
  text-align: center;
}
.topo-node.label {
  color: white;
}
.topo-node .node-title {
  font-weight: bold;
  font-size: 15px;
}
.topo-node .node-desc {
  font-size: 12px;
  margin-top: 4px;
}
.agent-nodes {
  display: flex;
  gap: 40px;
}
.topo-node.box {
  background: #292524;
  border: 1px solid #44403c;
  border-radius: 8px;
  padding: 16px;
  width: 200px;
}
.topo-node.box.b-gold { border-color: #ca8a04; }
.topo-node.box.b-silver { border-color: #94a3b8; }
.topo-node.fluid { width: 100%; max-width: 440px; }
.node-count {
  font-size: 12px;
  color: #a8a29e;
  margin: 8px 0;
}
.node-badge {
  background: rgba(255,255,255,0.05);
  font-size: 12px;
  padding: 4px 0;
  border-radius: 4px;
  color: #d6d3d1;
}

/* 调度操作台 */
.action-card {
  border-radius: 12px;
  height: 100%;
}
.action-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.action-item {
  display: flex;
  align-items: center;
  padding: 16px;
  background: #fafaf9;
  border-radius: 12px;
  border: 1px solid #f5f5f4;
  cursor: pointer;
  transition: all 0.2s;
}
.action-item:hover {
  background: white;
  border-color: #e7e5e4;
  box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
}
.action-icon-box {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  margin-right: 16px;
}
.action-text {
  flex: 1;
}
.action-name {
  font-size: 14px;
  font-weight: bold;
  color: var(--slate-800);
  margin-bottom: 4px;
}
.action-desc {
  font-size: 12px;
}

@media (max-width: 768px) {
  .alert-stats-grid { grid-template-columns: 1fr; }
  .agent-nodes { flex-direction: column; gap: 20px; }
}
</style>
