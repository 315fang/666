<template>
  <div>
    <h2 style="margin-bottom: 20px;">📊 经营概览</h2>

    <!-- 统计卡片 -->
    <el-row :gutter="20">
      <el-col :span="6" v-for="(card, index) in cards" :key="index" style="margin-bottom: 20px;">
        <el-card shadow="hover" :body-style="{ padding: '0px' }">
          <div class="dashboard-card">
            <div class="card-icon" :class="card.colorClass">
              <el-icon><component :is="card.icon" /></el-icon>
            </div>
            <div class="card-content">
              <div class="card-title">{{ card.title }}</div>
              <div class="card-number">{{ card.value }}</div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 待处理事项 -->
    <el-card shadow="never" style="margin-bottom: 20px;">
      <template #header>
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <span style="font-weight: 600;">⏳ 待处理事项</span>
        </div>
      </template>
      <el-row :gutter="20">
        <el-col :span="6">
          <div class="pending-item" @click="$router.push('/orders')">
            <div class="pending-count" style="color: #E6A23C;">{{ pendingCounts.pendingShip }}</div>
            <div class="pending-label">待发货订单</div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="pending-item" @click="$router.push('/withdrawals')">
            <div class="pending-count" style="color: #F56C6C;">{{ pendingCounts.withdrawals }}</div>
            <div class="pending-label">待审核提现</div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="pending-item" @click="$router.push('/refunds')">
            <div class="pending-count" style="color: #909399;">{{ pendingCounts.refunds }}</div>
            <div class="pending-label">待处理售后</div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="pending-item" @click="$router.push('/commissions')">
            <div class="pending-count" style="color: #67C23A;">{{ pendingCounts.commissions }}</div>
            <div class="pending-label">待审批佣金</div>
          </div>
        </el-col>
      </el-row>
    </el-card>

    <!-- 快捷操作 -->
     <el-card shadow="never" header="快捷操作">
        <el-space wrap>
            <el-button type="primary" plain icon="List" @click="$router.push('/orders')">处理订单</el-button>
            <el-button type="success" plain icon="Money" @click="$router.push('/withdrawals')">审核提现</el-button>
            <el-button type="warning" plain icon="Service" @click="$router.push('/refunds')">处理售后</el-button>
            <el-button type="info" plain icon="UserFilled" @click="$router.push('/distribution')">分销管理</el-button>
            <el-button type="danger" plain icon="Shop" @click="$router.push('/dealers')">经销商审核</el-button>
            <el-button type="primary" icon="Goods" @click="$router.push('/products')">商品管理</el-button>
        </el-space>
     </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import request from '@/utils/request'

const pendingCounts = ref({
  pendingShip: 0,
  withdrawals: 0,
  refunds: 0,
  commissions: 0
})

const cards = ref([
    { title: '今日订单', value: 0, icon: 'List', colorClass: 'bg-blue' },
    { title: '今日销售额', value: '¥0.00', icon: 'Money', colorClass: 'bg-green' },
    { title: '总用户数', value: 0, icon: 'User', colorClass: 'bg-purple' },
    { title: '总商品数', value: 0, icon: 'Goods', colorClass: 'bg-orange' }
])

const loadStats = async () => {
    try {
        // 并行请求统计数据和待处理事项
        const [statsRes, notifRes] = await Promise.all([
            request.get('/statistics/overview').catch(() => null),
            request.get('/dashboard/notifications').catch(() => null)
        ])

        // 使用统计接口数据
        if (statsRes && statsRes.data) {
            const s = statsRes.data
            cards.value[0].value = s.todayOrders || 0
            cards.value[1].value = `¥${Number(s.todaySales || 0).toFixed(2)}`
            cards.value[2].value = s.totalUsers || 0
            cards.value[3].value = s.totalProducts || 0
        } else {
            // 降级方案：单独查询
            const [ordersRes, usersRes, productsRes] = await Promise.all([
                request.get('/orders', { params: { limit: 1 } }).catch(() => ({})),
                request.get('/users', { params: { limit: 1 } }).catch(() => ({})),
                request.get('/products', { params: { limit: 1 } }).catch(() => ({}))
            ])
            cards.value[2].value = usersRes?.pagination?.total || 0
            cards.value[3].value = productsRes?.pagination?.total || 0
        }

        // 待处理事项
        if (notifRes && notifRes.data) {
            const pc = notifRes.data.pendingCounts || {}
            pendingCounts.value = {
                pendingShip: pc.pendingShip || 0,
                withdrawals: pc.withdrawals || 0,
                refunds: pc.refunds || 0,
                commissions: pc.commissions || 0
            }
        }
    } catch (error) {
        console.error('Failed to load stats', error)
    }
}

onMounted(() => {
    loadStats()
})
</script>

<style scoped>
.dashboard-card {
    display: flex;
    align-items: center;
    padding: 20px;
}
.card-icon {
    width: 48px;
    height: 48px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-right: 16px;
    font-size: 22px;
    color: #fff;
    flex-shrink: 0;
}
.card-icon.bg-blue { background: linear-gradient(135deg, #3B82F6, #2563EB); }
.card-icon.bg-green { background: linear-gradient(135deg, #10B981, #059669); }
.card-icon.bg-purple { background: linear-gradient(135deg, #8B5CF6, #7C3AED); }
.card-icon.bg-orange { background: linear-gradient(135deg, #F59E0B, #D97706); }
.card-content {
    flex: 1;
    min-width: 0;
}
.card-title {
    font-size: 13px;
    color: #909399;
    margin-bottom: 4px;
}
.card-number {
    font-size: 24px;
    font-weight: 700;
    color: #303133;
}
.pending-item {
    text-align: center;
    padding: 16px 0;
    cursor: pointer;
    border-radius: 8px;
    transition: background 0.2s;
}
.pending-item:hover {
    background: #f5f7fa;
}
.pending-count {
    font-size: 28px;
    font-weight: 700;
    line-height: 1;
    margin-bottom: 8px;
}
.pending-label {
    font-size: 13px;
    color: #909399;
}
</style>
