<template>
  <div class="orders-page">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>订单管理</span>
          <el-button type="success" plain @click="handleExport" :loading="exporting">
            <el-icon><Download /></el-icon>
            导出订单
          </el-button>
        </div>
      </template>

      <!-- 搜索栏 -->
      <el-form :inline="true" :model="searchForm" class="search-form">
        <el-form-item label="订单号">
          <el-input v-model="searchForm.order_no" placeholder="请输入订单号" clearable />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="searchForm.status" placeholder="请选择状态" clearable>
            <el-option label="待支付" value="pending" />
            <el-option label="已支付/待发货" value="paid" />
            <el-option label="已发货" value="shipped" />
            <el-option label="已完成" value="completed" />
            <el-option label="已取消" value="cancelled" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">搜索</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>

      <!-- 表格 -->
      <el-table :data="tableData" v-loading="loading" stripe>
        <el-table-column prop="order_no" label="订单号" width="200" />
        <el-table-column label="用户" width="120">
          <template #default="{ row }">
            {{ row.User?.nickname || '-' }}
          </template>
        </el-table-column>
        <el-table-column label="商品" min-width="180">
          <template #default="{ row }">
            {{ row.Product?.name || row.product_name || '-' }}
          </template>
        </el-table-column>
        <el-table-column label="金额" width="120">
          <template #default="{ row }">
            <span class="amount">¥{{ row.actual_price || row.total_amount || 0 }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="120">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)" size="small">
              {{ getStatusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="下单时间" width="160">
          <template #default="{ row }">
            {{ formatDate(row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="240" fixed="right">
          <template #default="{ row }">
            <el-button text type="primary" size="small" @click="handleView(row)">详情</el-button>
            <el-button
              v-if="['paid', 'agent_confirmed', 'shipping_requested'].includes(row.status)"
              text
              type="success"
              size="small"
              @click="handleShip(row)"
            >
              发货
            </el-button>
            <el-button
              v-if="row.status === 'shipped'"
              text
              type="warning"
              size="small"
              @click="handleForceComplete(row)"
            >
              强制完成
            </el-button>
            <el-button
              v-if="['pending', 'paid'].includes(row.status)"
              text
              type="danger"
              size="small"
              @click="handleForceCancel(row)"
            >
              取消
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.limit"
        :total="pagination.total"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="fetchOrders"
        @current-change="fetchOrders"
        style="margin-top: 20px; justify-content: flex-end;"
      />
    </el-card>

    <!-- 发货对话框 -->
    <el-dialog v-model="shipDialogVisible" title="订单发货" width="500px">
      <el-form :model="shipForm" label-width="100px">
        <el-form-item label="物流公司">
          <el-select v-model="shipForm.express_company" placeholder="请选择物流公司" filterable allow-create>
            <el-option label="顺丰速运" value="SF" />
            <el-option label="圆通快递" value="YTO" />
            <el-option label="中通快递" value="ZTO" />
            <el-option label="韵达快递" value="YD" />
            <el-option label="申通快递" value="STO" />
            <el-option label="极兔速递" value="JTSD" />
            <el-option label="京东物流" value="JD" />
            <el-option label="邮政EMS" value="EMS" />
          </el-select>
        </el-form-item>
        <el-form-item label="物流单号">
          <el-input v-model="shipForm.express_no" placeholder="请输入物流单号" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="shipDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleShipSubmit" :loading="submitting">确定</el-button>
      </template>
    </el-dialog>

    <!-- 订单详情对话框 -->
    <el-dialog v-model="detailDialogVisible" title="订单详情" width="700px">
      <el-descriptions :column="2" border v-if="orderDetail">
        <el-descriptions-item label="订单号">{{ orderDetail.order_no }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="getStatusType(orderDetail.status)">{{ getStatusText(orderDetail.status) }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="用户">{{ orderDetail.User?.nickname || '-' }}</el-descriptions-item>
        <el-descriptions-item label="手机号">{{ orderDetail.User?.phone || '-' }}</el-descriptions-item>
        <el-descriptions-item label="商品">{{ orderDetail.Product?.name || '-' }}</el-descriptions-item>
        <el-descriptions-item label="数量">{{ orderDetail.quantity }}</el-descriptions-item>
        <el-descriptions-item label="商品金额">¥{{ orderDetail.total_price || 0 }}</el-descriptions-item>
        <el-descriptions-item label="实付金额">
          <span class="amount">¥{{ orderDetail.actual_price || 0 }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="收货地址" :span="2">
          {{ orderDetail.address_detail || '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="物流公司">{{ orderDetail.express_company || '-' }}</el-descriptions-item>
        <el-descriptions-item label="物流单号">{{ orderDetail.express_no || '-' }}</el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ formatDate(orderDetail.created_at) }}</el-descriptions-item>
        <el-descriptions-item label="支付时间">{{ formatDate(orderDetail.paid_at) }}</el-descriptions-item>
        <el-descriptions-item label="备注" :span="2">{{ orderDetail.remark || orderDetail.admin_remark || '-' }}</el-descriptions-item>
      </el-descriptions>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getOrders, getOrderDetail, shipOrder, forceCompleteOrder, forceCancelOrder, exportOrders } from '@/api'
import dayjs from 'dayjs'

const loading = ref(false)
const submitting = ref(false)
const exporting = ref(false)
const shipDialogVisible = ref(false)
const detailDialogVisible = ref(false)
const orderDetail = ref(null)

const searchForm = reactive({
  order_no: '',
  status: ''
})

const pagination = reactive({
  page: 1,
  limit: 10,
  total: 0
})

const tableData = ref([])

const shipForm = reactive({
  orderId: null,
  express_company: '',
  express_no: ''
})

const fetchOrders = async () => {
  loading.value = true
  try {
    const params = {
      ...searchForm,
      page: pagination.page,
      limit: pagination.limit
    }
    const data = await getOrders(params)
    tableData.value = data.list || []
    pagination.total = data.total || data.pagination?.total || 0
  } catch (error) {
    console.error('获取订单列表失败:', error)
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  pagination.page = 1
  fetchOrders()
}

const handleReset = () => {
  searchForm.order_no = ''
  searchForm.status = ''
  handleSearch()
}

const handleView = async (row) => {
  try {
    const data = await getOrderDetail(row.id)
    orderDetail.value = data
    detailDialogVisible.value = true
  } catch (error) {
    console.error('获取订单详情失败:', error)
  }
}

const handleShip = (row) => {
  shipForm.orderId = row.id
  shipForm.express_company = ''
  shipForm.express_no = ''
  shipDialogVisible.value = true
}

const handleShipSubmit = async () => {
  if (!shipForm.express_company || !shipForm.express_no) {
    ElMessage.warning('请填写物流信息')
    return
  }
  
  submitting.value = true
  try {
    await shipOrder(shipForm.orderId, {
      express_company: shipForm.express_company,
      express_no: shipForm.express_no
    })
    ElMessage.success('发货成功')
    shipDialogVisible.value = false
    fetchOrders()
  } catch (error) {
    console.error('发货失败:', error)
  } finally {
    submitting.value = false
  }
}

const handleForceComplete = async (row) => {
  try {
    await ElMessageBox.confirm('确认强制完成该订单？此操作将直接将订单标记为已完成。', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await forceCompleteOrder(row.id)
    ElMessage.success('订单已完成')
    fetchOrders()
  } catch (error) {
    if (error !== 'cancel') {
      console.error('操作失败:', error)
    }
  }
}

const handleForceCancel = async (row) => {
  try {
    await ElMessageBox.confirm('确认取消该订单？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'danger'
    })
    await forceCancelOrder(row.id)
    ElMessage.success('订单已取消')
    fetchOrders()
  } catch (error) {
    if (error !== 'cancel') {
      console.error('操作失败:', error)
    }
  }
}

const handleExport = async () => {
  exporting.value = true
  try {
    await exportOrders(searchForm)
    ElMessage.success('导出成功')
  } catch (error) {
    console.error('导出失败:', error)
  } finally {
    exporting.value = false
  }
}

const getStatusType = (status) => {
  const map = {
    pending: 'info',
    paid: 'warning',
    agent_confirmed: 'warning',
    shipping_requested: 'warning',
    shipped: 'primary',
    completed: 'success',
    cancelled: 'danger'
  }
  return map[status] || 'info'
}

const getStatusText = (status) => {
  const map = {
    pending: '待支付',
    paid: '待发货',
    agent_confirmed: '代理已确认',
    shipping_requested: '请求发货',
    shipped: '已发货',
    completed: '已完成',
    cancelled: '已取消'
  }
  return map[status] || status
}

const formatDate = (date) => {
  if (!date) return '-'
  return dayjs(date).format('YYYY-MM-DD HH:mm')
}

onMounted(() => {
  fetchOrders()
})
</script>

<style scoped>
.orders-page {
  padding: 0;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.search-form {
  margin-bottom: 20px;
}

.amount {
  font-weight: 600;
  color: #f56c6c;
}
</style>
