<template>
  <div>
    <!-- Tabs -->
    <el-tabs v-model="activeTab" @tab-change="handleTabChange">
        <el-tab-pane label="全部订单" name="all" />
        <el-tab-pane label="待付款" name="pending" />
        <el-tab-pane label="待发货" name="paid" />
        <el-tab-pane label="待收货" name="shipped" />
        <el-tab-pane label="已完成" name="completed" />
        <el-tab-pane label="售后中" name="refunding" />
    </el-tabs>

    <!-- Filters -->
    <div style="margin-bottom: 20px;">
        <el-input v-model="query.keyword" placeholder="订单号/买家昵称" style="width: 250px; margin-right: 10px;" clearable />
        <el-button type="primary" @click="handleSearch">搜索</el-button>
    </div>

    <!-- Table -->
    <el-table :data="list" border v-loading="loading" stripe>
        <el-table-column prop="order_no" label="订单号" width="180" />
        <el-table-column label="商品" width="280">
             <template #default="{ row }">
                 <div style="display: flex; align-items: center;">
                     <el-image :src="getProductImage(row)" style="width: 50px; height: 50px; margin-right: 10px; border-radius: 6px; flex-shrink: 0;" fit="cover" />
                     <div style="overflow: hidden;">
                         <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{{ row.product?.name || '商品' }}</div>
                         <div style="font-size: 12px; color: #999;">×{{ row.quantity || 1 }}</div>
                     </div>
                 </div>
             </template>
        </el-table-column>
        <el-table-column label="金额" width="100">
            <template #default="{ row }">
                <span style="color: #E6A23C; font-weight: 600;">¥{{ row.total_amount }}</span>
            </template>
        </el-table-column>
        <el-table-column label="买家" width="120">
             <template #default="{ row }">
                 {{ row.buyer?.nickname || '未知' }}
             </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
             <template #default="{ row }">
                 <el-tag :type="getStatusType(row.status)" size="small">{{ getStatusText(row.status) }}</el-tag>
             </template>
        </el-table-column>
        <el-table-column label="发货方式" width="100">
             <template #default="{ row }">
                 <el-tag size="small" :type="row.fulfillment_type === 'Agent' ? 'warning' : 'info'">
                     {{ row.fulfillment_type === 'Agent' ? '代理发货' : '平台直发' }}
                 </el-tag>
             </template>
        </el-table-column>
        <el-table-column prop="created_at" label="下单时间" width="160">
            <template #default="{ row }">
                {{ formatTime(row.created_at || row.createdAt) }}
            </template>
        </el-table-column>
        <el-table-column label="操作" fixed="right" width="180">
             <template #default="{ row }">
                 <el-button link type="primary" size="small" @click="showDetail(row)">详情</el-button>
                 <el-button v-if="row.status === 'paid' || row.status === 'agent_confirmed' || row.status === 'shipping_requested'" type="success" size="small" @click="showShipDialog(row)">发货</el-button>
             </template>
        </el-table-column>
    </el-table>

    <!-- Pagination -->
    <div style="margin-top: 20px; text-align: right;">
        <el-pagination
            background
            layout="total, prev, pager, next"
            :total="total"
            :page-size="query.limit"
            @current-change="handlePageChange"
        />
    </div>

    <!-- Ship Dialog -->
    <el-dialog v-model="shipDialogVisible" title="填写物流信息" width="400px">
        <el-form :model="shipForm" label-width="80px">
            <el-form-item label="物流公司">
                <el-input v-model="shipForm.logistics_company" placeholder="如: 顺丰速运" />
            </el-form-item>
            <el-form-item label="物流单号">
                <el-input v-model="shipForm.tracking_number" placeholder="请输入物流单号" />
            </el-form-item>
        </el-form>
        <template #footer>
            <el-button @click="shipDialogVisible = false">取消</el-button>
            <el-button type="primary" @click="handleShip">确认发货</el-button>
        </template>
    </el-dialog>

    <!-- Order Detail Drawer -->
    <el-drawer v-model="detailDrawerVisible" title="订单详情" size="520px">
        <template v-if="detailOrder">
            <!-- 订单状态流程（完整版） -->
            <div style="margin-bottom: 24px;">
                <el-steps :active="getStepActive(detailOrder)" finish-status="success" align-center size="small">
                    <el-step title="下单" :description="formatTime(detailOrder.created_at || detailOrder.createdAt)" />
                    <el-step title="付款" :description="detailOrder.paid_at ? formatTime(detailOrder.paid_at) : ''" />
                    <el-step v-if="detailOrder.fulfillment_type === 'Agent'" title="代理确认" :description="detailOrder.agent_confirmed_at ? formatTime(detailOrder.agent_confirmed_at) : ''" />
                    <el-step title="发货" :description="detailOrder.shipped_at ? formatTime(detailOrder.shipped_at) : ''" />
                    <el-step title="收货" :description="detailOrder.completed_at ? formatTime(detailOrder.completed_at) : ''" />
                </el-steps>
            </div>

            <!-- 当前状态 -->
            <el-alert
                :title="'当前状态: ' + getStatusText(detailOrder.status)"
                :type="getAlertType(detailOrder.status)"
                :closable="false"
                style="margin-bottom: 16px;"
            />

            <!-- 售后标记 -->
            <el-alert
                v-if="detailOrder.status === 'refunding' || detailOrder.status === 'refunded'"
                :title="detailOrder.status === 'refunding' ? '该订单正在售后处理中' : '该订单已退款'"
                :type="detailOrder.status === 'refunding' ? 'warning' : 'error'"
                :closable="false"
                style="margin-bottom: 16px;"
            />

            <!-- 商品信息 -->
            <el-card shadow="never" style="margin-bottom: 16px;">
                <template #header><span style="font-weight: 600;">商品信息</span></template>
                <div style="display: flex; align-items: center;">
                    <el-image :src="getProductImage(detailOrder)" style="width: 80px; height: 80px; margin-right: 16px; border-radius: 8px;" fit="cover" />
                    <div>
                        <div style="font-weight: 500; margin-bottom: 4px;">{{ detailOrder.product?.name || '商品' }}</div>
                        <div style="color: #999; font-size: 13px;">数量: ×{{ detailOrder.quantity || 1 }}</div>
                        <div style="color: #E6A23C; font-weight: 600; margin-top: 4px;">¥{{ detailOrder.total_amount }}</div>
                    </div>
                </div>
            </el-card>

            <!-- 订单信息 -->
            <el-descriptions :column="1" border size="small" style="margin-bottom: 16px;">
                <el-descriptions-item label="订单编号">{{ detailOrder.order_no }}</el-descriptions-item>
                <el-descriptions-item label="买家">{{ detailOrder.buyer?.nickname || '未知' }} (ID: {{ detailOrder.buyer_id }})</el-descriptions-item>
                <el-descriptions-item label="发货方式">
                    <el-tag size="small" :type="detailOrder.fulfillment_type === 'Agent' ? 'warning' : 'info'">
                        {{ detailOrder.fulfillment_type === 'Agent' ? '代理发货' : '平台直发' }}
                    </el-tag>
                </el-descriptions-item>
                <el-descriptions-item label="下单时间">{{ formatTime(detailOrder.created_at || detailOrder.createdAt) }}</el-descriptions-item>
                <el-descriptions-item label="付款时间" v-if="detailOrder.paid_at">{{ formatTime(detailOrder.paid_at) }}</el-descriptions-item>
                <el-descriptions-item label="代理确认时间" v-if="detailOrder.agent_confirmed_at">{{ formatTime(detailOrder.agent_confirmed_at) }}</el-descriptions-item>
                <el-descriptions-item label="申请发货时间" v-if="detailOrder.shipping_requested_at">{{ formatTime(detailOrder.shipping_requested_at) }}</el-descriptions-item>
                <el-descriptions-item label="发货时间" v-if="detailOrder.shipped_at">{{ formatTime(detailOrder.shipped_at) }}</el-descriptions-item>
                <el-descriptions-item label="完成时间" v-if="detailOrder.completed_at">{{ formatTime(detailOrder.completed_at) }}</el-descriptions-item>
                <el-descriptions-item label="物流单号" v-if="detailOrder.tracking_no">
                    <span style="color: #409EFF; font-weight: 500;">{{ detailOrder.tracking_no }}</span>
                </el-descriptions-item>
                <el-descriptions-item label="推荐人" v-if="detailOrder.distributor">{{ detailOrder.distributor.nickname }} (ID: {{ detailOrder.distributor_id }})</el-descriptions-item>
                <el-descriptions-item label="佣金结算" v-if="detailOrder.status === 'completed'">
                    <el-tag :type="detailOrder.commission_settled ? 'success' : 'info'" size="small">
                        {{ detailOrder.commission_settled ? '已结算' : '待结算' }}
                    </el-tag>
                    <span v-if="detailOrder.settlement_at" style="margin-left: 8px; font-size: 12px; color: #999;">{{ formatTime(detailOrder.settlement_at) }}</span>
                </el-descriptions-item>
                <el-descriptions-item label="备注" v-if="detailOrder.remark">{{ detailOrder.remark }}</el-descriptions-item>
            </el-descriptions>

            <!-- 收货地址 -->
            <el-card shadow="never" v-if="detailOrder.address" style="margin-bottom: 16px;">
                <template #header>
                    <span style="font-weight: 600; display: flex; align-items: center; gap: 6px;">
                        <el-icon><Box /></el-icon> 收货地址
                    </span>
                </template>
                <div style="font-weight: 500;">{{ detailOrder.address.receiver_name }}  {{ detailOrder.address.phone }}</div>
                <div style="color: #666; margin-top: 4px;">{{ detailOrder.address.province }} {{ detailOrder.address.city }} {{ detailOrder.address.district }} {{ detailOrder.address.detail }}</div>
            </el-card>

            <!-- 订单时间线 -->
            <el-card shadow="never" style="margin-bottom: 16px;">
                <template #header>
                    <span style="font-weight: 600; display: flex; align-items: center; gap: 6px;">
                        <el-icon><List /></el-icon> 订单流程
                    </span>
                </template>
                <el-timeline>
                    <el-timeline-item v-if="detailOrder.completed_at" timestamp="" placement="top" type="success">
                        <span style="font-weight: 500;">买家确认收货</span>
                        <div style="font-size: 12px; color: #999;">{{ formatTime(detailOrder.completed_at) }}</div>
                    </el-timeline-item>
                    <el-timeline-item v-if="detailOrder.shipped_at" timestamp="" placement="top" type="primary">
                        <span style="font-weight: 500;">已发货</span>
                        <div style="font-size: 12px; color: #999;">{{ formatTime(detailOrder.shipped_at) }}</div>
                        <div v-if="detailOrder.tracking_no" style="font-size: 12px; color: #409EFF;">物流单号: {{ detailOrder.tracking_no }}</div>
                    </el-timeline-item>
                    <el-timeline-item v-if="detailOrder.shipping_requested_at" timestamp="" placement="top">
                        <span style="font-weight: 500;">代理申请平台发货</span>
                        <div style="font-size: 12px; color: #999;">{{ formatTime(detailOrder.shipping_requested_at) }}</div>
                    </el-timeline-item>
                    <el-timeline-item v-if="detailOrder.agent_confirmed_at" timestamp="" placement="top" type="warning">
                        <span style="font-weight: 500;">代理商已确认订单</span>
                        <div style="font-size: 12px; color: #999;">{{ formatTime(detailOrder.agent_confirmed_at) }}</div>
                    </el-timeline-item>
                    <el-timeline-item v-if="detailOrder.paid_at" timestamp="" placement="top" type="primary">
                        <span style="font-weight: 500;">买家已付款 ¥{{ detailOrder.total_amount }}</span>
                        <div style="font-size: 12px; color: #999;">{{ formatTime(detailOrder.paid_at) }}</div>
                    </el-timeline-item>
                    <el-timeline-item timestamp="" placement="top" type="info">
                        <span style="font-weight: 500;">创建订单</span>
                        <div style="font-size: 12px; color: #999;">{{ formatTime(detailOrder.created_at || detailOrder.createdAt) }}</div>
                        <div style="font-size: 12px; color: #999;">订单号: {{ detailOrder.order_no }}</div>
                    </el-timeline-item>
                </el-timeline>
            </el-card>

            <!-- 操作按钮 -->
            <div style="margin-top: 16px; display: flex; gap: 10px; flex-wrap: wrap;">
                <el-button v-if="['paid', 'agent_confirmed', 'shipping_requested'].includes(detailOrder.status)" type="success" @click="showShipDialog(detailOrder); detailDrawerVisible = false;">立即发货</el-button>
                <el-button v-if="detailOrder.status === 'shipped'" type="primary" @click="handleComplete(detailOrder)">确认收货</el-button>
            </div>
        </template>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { getOrders, getOrderById, shipOrder, updateOrderStatus } from '@/api/order'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Box, List } from '@element-plus/icons-vue'

const list = ref([])
const total = ref(0)
const loading = ref(false)
const activeTab = ref('all')
const shipDialogVisible = ref(false)
const currentOrder = ref(null)
const detailDrawerVisible = ref(false)
const detailOrder = ref(null)

const query = reactive({
    page: 1,
    limit: 10,
    keyword: '',
    status: ''
})

const shipForm = reactive({
    logistics_company: '',
    tracking_number: ''
})

const statusMap = {
    pending: '待付款',
    paid: '待发货',
    agent_confirmed: '代理已确认',
    shipping_requested: '待平台发货',
    shipped: '已发货',
    completed: '已完成',
    cancelled: '已取消',
    refunding: '售后中',
    refunded: '已退款'
}

const statusTypeMap = {
    pending: 'info',
    paid: 'warning',
    agent_confirmed: '',
    shipping_requested: '',
    shipped: '',
    completed: 'success',
    cancelled: 'info',
    refunding: 'danger',
    refunded: 'danger'
}

const getStatusText = (status) => statusMap[status] || status
const getStatusType = (status) => statusTypeMap[status] || ''

const getAlertType = (status) => {
    if (['completed'].includes(status)) return 'success'
    if (['cancelled', 'refunding', 'refunded'].includes(status)) return 'error'
    if (['pending'].includes(status)) return 'info'
    return 'warning'
}

const getStepActive = (order) => {
    const isAgent = order.fulfillment_type === 'Agent'
    if (order.completed_at) return isAgent ? 5 : 4
    if (order.shipped_at) return isAgent ? 4 : 3
    if (isAgent && (order.agent_confirmed_at || order.status === 'agent_confirmed' || order.status === 'shipping_requested')) return 3
    if (order.paid_at) return 2
    return 1
}

const getProductImage = (row) => {
    let images = row.product?.images
    if (typeof images === 'string') {
        try { images = JSON.parse(images) } catch(e) { images = [] }
    }
    return images?.[0] || ''
}

const formatTime = (t) => {
    if (!t) return ''
    return new Date(t).toLocaleString()
}

const loadData = async () => {
    loading.value = true
    try {
        const params = { ...query }
        if (activeTab.value !== 'all') {
            params.status = activeTab.value
        }
        const res = await getOrders(params)
        list.value = res.list
        total.value = res.pagination.total
    } catch (error) {
        console.error(error)
    } finally {
        loading.value = false
    }
}

const handleTabChange = () => {
    query.page = 1
    loadData()
}

const handleSearch = () => {
    query.page = 1
    loadData()
}

const handlePageChange = (val) => {
    query.page = val
    loadData()
}

const showDetail = async (row) => {
    try {
        const res = await getOrderById(row.id)
        detailOrder.value = res
        detailDrawerVisible.value = true
    } catch(e) {
        // fallback: 直接用列表数据
        detailOrder.value = row
        detailDrawerVisible.value = true
    }
}

const showShipDialog = (row) => {
    currentOrder.value = row
    shipForm.logistics_company = ''
    shipForm.tracking_number = ''
    shipDialogVisible.value = true
}

const handleShip = async () => {
    if (!shipForm.logistics_company || !shipForm.tracking_number) {
        return ElMessage.warning('请填写完整物流信息')
    }
    try {
        await shipOrder(currentOrder.value.id, {
            tracking_company: shipForm.logistics_company,
            tracking_number: shipForm.tracking_number
        })
        ElMessage.success('发货成功')
        shipDialogVisible.value = false
        loadData()
    } catch (error) {
        console.error(error)
    }
}

const handleComplete = async (order) => {
    try {
        await ElMessageBox.confirm('确认该订单已完成收货？', '确认收货')
        await updateOrderStatus(order.id, 'completed')
        ElMessage.success('已确认收货')
        detailDrawerVisible.value = false
        loadData()
    } catch (error) {
        if (error !== 'cancel') console.error(error)
    }
}

onMounted(() => {
    loadData()
})
</script>
