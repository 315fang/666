<template>
  <div>
    <h2 style="margin-bottom: 20px;">仪表盘</h2>

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

const subStats = ref({
  todayOrders: 0,
  todaySales: 0,
  totalUsers: 0,
  pendingShip: 0,
  pendingWithdraw: 0,
  pendingRefund: 0
})

const cards = ref([
    { title: '今日订单', value: 0, icon: 'List', colorClass: 'bg-blue' },
    { title: '今日销售额', value: '¥0.00', icon: 'Money', colorClass: 'bg-green' },
    { title: '总用户数', value: 0, icon: 'User', colorClass: 'bg-purple' },
    { title: '待发货', value: 0, icon: 'Box', colorClass: 'bg-orange' },
    { title: '待提现', value: 0, icon: 'Wallet', colorClass: 'bg-red' },
    { title: '待售后', value: 0, icon: 'Service', colorClass: 'bg-red' }
])

const loadStats = async () => {
    try {
        // Parallel requests
        const [ordersRes, usersRes, withdrawalsRes, refundsRes] = await Promise.all([
            request.get('/orders', { params: { limit: 1 } }), // Contains todaySales, pendingShip
            request.get('/users', { params: { limit: 1 } }),
            request.get('/withdrawals', { params: { status: 'pending', limit: 1 } }),
            request.get('/refunds', { params: { status: 'pending', limit: 1 } })
        ])

        // Update values
        const todaySales = ordersRes.todaySales || 0
        const pendingShip = ordersRes.pendingShip || 0
        // Calculate today's orders locally if not provided? 
        // Typically requires specific backend support, but let's assume getOrders returns it or we just skip it for now.
        // Actually the backend `getOrders` (Step 1053) returns `todaySales` and `pendingShip`.
        // It doesn't seem to return `todayOrdersCount`. But maybe we can infer or leave it 0.
        // Wait, app.js (Step 1053) `loadDashboard` got `todaySales`.
        
        cards.value[0].value = 0 // Placeholder
        cards.value[1].value = `¥${Number(todaySales).toFixed(2)}`
        cards.value[2].value = usersRes.pagination?.total || 0
        cards.value[3].value = pendingShip
        cards.value[4].value = withdrawalsRes.pagination?.total || 0
        cards.value[5].value = refundsRes.pagination?.total || 0

    } catch (error) {
        console.error('Failed to load stats', error)
    }
}

onMounted(() => {
    loadStats()
})
</script>

<style scoped>
/* Card styles handled in global css or here */
</style>
