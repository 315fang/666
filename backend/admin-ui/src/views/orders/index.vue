<template>
  <div class="orders-page">
    <el-card>
      <template #header>订单管理</template>

      <!-- 搜索表单 -->
      <el-form :inline="true" :model="searchForm" class="filter-container">
        <el-form-item label="单号/用户">
          <el-input v-model="searchForm.keyword" placeholder="订单号 / 用户昵称" clearable style="width:180px" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="searchForm.status" placeholder="全部状态" clearable style="width:120px">
            <el-option label="待支付" value="pending" />
            <el-option label="待发货" value="paid" />
            <el-option label="已发货" value="shipped" />
            <el-option label="已完成" value="completed" />
            <el-option label="已取消" value="cancelled" />
            <el-option label="已退款" value="refunded" />
          </el-select>
        </el-form-item>
        <el-form-item label="时间">
          <el-date-picker
            v-model="dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD"
            style="width:240px"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">搜索</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>

      <!-- 订单表格 -->
      <el-table :data="tableData" v-loading="loading" stripe>
        <el-table-column label="商品信息" min-width="260">
          <template #default="{ row }">
            <div style="display: flex; align-items: stretch; gap:10px;">
              <el-image 
                :src="row.product?.images?.[0]" 
                style="width: 50px; height: 50px; border-radius:4px" 
                fit="cover" 
              />
              <div style="display: flex; flex-direction: column; justify-content: space-around;">
                <div style="font-size:13px; font-weight:500; color:#303133; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden">
                  {{ row.product?.name }}
                </div>
                <div style="font-size:12px; color:#909399;">
                  订单号: {{ row.order_no }}
                </div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="买家 / 层级" width="130">
          <template #default="{ row }">
            <div>{{ row.buyer?.nickname || '-' }}</div>
            <div style="margin-top:2px">
              <el-tag size="small" :type="roleTagType(row.buyer?.role_level)">
                {{ roleText(row.buyer?.role_level) }}
              </el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="金额" width="100">
          <template #default="{ row }">
            <div style="color: #f56c6c; font-weight: 600;">¥{{ Number(row.actual_price||0).toFixed(2) }}</div>
            <div v-if="row.shipping_fee > 0" style="font-size:11px; color:#909399">含运费 ¥{{ row.shipping_fee }}</div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)">{{ getStatusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="下单时间" width="160">
          <template #default="{ row }">
            {{ formatDateTime(row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button text type="primary" size="small" @click="handleDetail(row)">详情</el-button>
            <el-button text type="success" size="small" v-if="['paid', 'agent_confirmed', 'shipping_requested'].includes(row.status)" @click="handleShip(row)">发货</el-button>
            
            <el-dropdown size="small" @command="(cmd) => handleDropdown(cmd, row)">
              <el-button text size="small">更多<el-icon><ArrowDown /></el-icon></el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="amount" :disabled="['completed', 'cancelled', 'refunded'].includes(row.status)">改价</el-dropdown-item>
                  <el-dropdown-item command="remark">备注</el-dropdown-item>
                  <el-dropdown-item command="force_complete" v-if="row.status === 'shipped'" class="warning-text">强制完成</el-dropdown-item>
                  <el-dropdown-item command="force_cancel" :disabled="['completed', 'cancelled', 'refunded'].includes(row.status)" class="danger-text">强制取消</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.limit"
        :total="pagination.total"
        :page-sizes="[20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="fetchOrders"
        @current-change="fetchOrders"
        style="margin-top: 20px; justify-content: flex-end;"
      />
    </el-card>

    <!-- ===== 订单详情抽屉 ===== -->
    <el-drawer v-model="detailVisible" title="订单详情" size="600px">
      <template v-if="detailData">
        <el-descriptions :column="2" border size="small" style="margin-bottom:20px">
          <el-descriptions-item label="订单号" :span="2">{{ detailData.order_no }}</el-descriptions-item>
          <el-descriptions-item label="订单状态">
            <el-tag :type="getStatusType(detailData.status)">{{ getStatusText(detailData.status) }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="发货类型">
            {{ detailData.fulfillment_type === 'Company' ? '云仓发货' : (detailData.fulfillment_type === 'Agent' ? '代理商发货' : '自提/其他') }}
          </el-descriptions-item>
          <el-descriptions-item label="买家昵称">{{ detailData.buyer?.nickname }}</el-descriptions-item>
          <el-descriptions-item label="买家层级">
            <el-tag size="small" :type="roleTagType(detailData.buyer?.role_level)">{{ roleText(detailData.buyer?.role_level) }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="商品总价">¥{{ detailData.total_amount }}</el-descriptions-item>
          <el-descriptions-item label="实际支付">
            <span style="color:#f56c6c;font-weight:bold">¥{{ detailData.actual_price }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="下单时间">{{ formatDateTime(detailData.created_at) }}</el-descriptions-item>
          <el-descriptions-item label="支付时间">{{ formatDateTime(detailData.paid_at) }}</el-descriptions-item>
        </el-descriptions>

        <!-- 收货信息 -->
        <el-divider content-position="left">收货信息</el-divider>
        <div v-if="detailData.address" style="background:#f8f9fa; padding:12px; border-radius:6px; margin-bottom:20px">
          <div style="font-weight:bold; margin-bottom:6px">{{ detailData.address.name }} - {{ detailData.address.phone }}</div>
          <div style="color:#606266; font-size:13px">
            {{ detailData.address.province }} {{ detailData.address.city }} {{ detailData.address.district }}
            <br />
            {{ detailData.address.detail }}
          </div>
        </div>

        <!-- 物流信息 -->
        <el-divider content-position="left" v-if="detailData.tracking_no">物流信息</el-divider>
        <div v-if="detailData.tracking_no" style="margin-bottom:20px">
          单号: {{ detailData.tracking_no }}
        </div>

        <!-- 内部备注 -->
        <el-divider content-position="left">内部备注</el-divider>
        <div style="color:#e6a23c; font-size:13px; background:#fdf6ec; padding:10px; border-radius:4px">
          {{ detailData.remark || '无备注' }}
        </div>
      </template>
    </el-drawer>

    <!-- ===== 发货弹窗 ===== -->
    <el-dialog v-model="shipDialogVisible" title="订单发货" width="400px">
      <el-form :model="shipForm" label-width="80px">
        <el-form-item label="发货方式">
          <el-radio-group v-model="shipForm.type">
            <el-radio label="Company">云仓直发</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="快递公司">
          <el-input v-model="shipForm.tracking_company" placeholder="如：顺丰速运" />
        </el-form-item>
        <el-form-item label="快递单号">
          <el-input v-model="shipForm.tracking_no" placeholder="输入快递单号" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="shipDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitShip" :loading="submitting">确认发货</el-button>
      </template>
    </el-dialog>

    <!-- ===== 修改金额弹窗 ===== -->
    <el-dialog v-model="amountVisible" title="修改订单金额" width="400px">
      <el-form :model="amountForm" label-width="90px">
        <el-form-item label="当前金额">
          <span style="color:#f56c6c; font-weight:bold; font-size:16px">¥{{ Number(currentOrder?.actual_price||0).toFixed(2) }}</span>
        </el-form-item>
        <el-form-item label="新金额">
          <el-input-number v-model="amountForm.new_amount" :min="0" :precision="2" style="width:100%" />
        </el-form-item>
        <el-form-item label="调整原因">
          <el-input v-model="amountForm.reason" placeholder="如：客服协商改价" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="amountVisible = false">取消</el-button>
        <el-button type="primary" @click="submitAmount" :loading="submitting">确认修改</el-button>
      </template>
    </el-dialog>

    <!-- ===== 添加备注弹窗 ===== -->
    <el-dialog v-model="remarkVisible" title="添加内部备注" width="400px">
      <el-form>
        <el-input v-model="remarkText" type="textarea" :rows="4" placeholder="备注内容仅管理员可见，会追加到历史备注末尾" />
      </el-form>
      <template #footer>
        <el-button @click="remarkVisible = false">取消</el-button>
        <el-button type="primary" @click="submitRemark" :loading="submitting">保存</el-button>
      </template>
    </el-dialog>

    <!-- ===== 强制动作弹窗 ===== -->
    <el-dialog v-model="forceVisible" :title="forceType === 'complete' ? '强制完成订单' : '强制取消订单'" width="400px">
      <el-alert v-if="forceType === 'cancel'" title="取消订单将自动发起退款，不可逆操作！" type="error" :closable="false" style="margin-bottom:15px" />
      <el-form :model="forceForm" label-width="90px">
        <el-form-item label="操作原因" required>
          <el-input v-model="forceForm.reason" placeholder="必填项" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="forceVisible = false">取消</el-button>
        <el-button :type="forceType === 'cancel' ? 'danger' : 'warning'" @click="submitForce" :loading="submitting">确认</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowDown } from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import { 
  getOrders, getOrderDetail, shipOrder, adjustOrderAmount, addOrderRemark,
  forceCompleteOrder, forceCancelOrder
} from '@/api'

// ===== 列表 =====
const loading = ref(false)
const tableData = ref([])
const pagination = reactive({ page: 1, limit: 20, total: 0 })
const searchForm = reactive({ keyword: '', status: '' })
const dateRange = ref([])
const submitting = ref(false)

const fetchOrders = async () => {
  loading.value = true
  try {
    const params = {
      keyword: searchForm.keyword || undefined,
      status: searchForm.status || undefined,
      page: pagination.page,
      limit: pagination.limit
    }
    if (dateRange.value && dateRange.value.length === 2) {
      params.start_date = dateRange.value[0]
      params.end_date = dateRange.value[1]
    }
    const res = await getOrders(params)
    tableData.value = res.data?.list || res.list || []
    pagination.total = res.data?.pagination?.total || res.total || 0
  } catch (error) {
    console.error(error)
  } finally {
    loading.value = false
  }
}

const handleSearch = () => { pagination.page = 1; fetchOrders() }
const handleReset = () => {
  searchForm.keyword = ''
  searchForm.status = ''
  dateRange.value = []
  handleSearch()
}

// ===== 详情 =====
const detailVisible = ref(false)
const detailData = ref(null)
const handleDetail = async (row) => {
  try {
    const res = await getOrderDetail(row.id)
    detailData.value = res.data || res
    detailVisible.value = true
  } catch(e) {}
}

// ===== 发货 =====
const shipDialogVisible = ref(false)
const currentOrder = ref(null)
const shipForm = reactive({ type: 'Company', tracking_no: '', tracking_company: '' })

const handleShip = (row) => {
  currentOrder.value = row
  shipForm.tracking_no = ''
  shipForm.tracking_company = ''
  shipDialogVisible.value = true
}
const submitShip = async () => {
  if (shipForm.type !== 'Agent' && !shipForm.tracking_no) {
    return ElMessage.warning('请输入快递单号')
  }
  submitting.value = true
  try {
    await shipOrder(currentOrder.value.id, shipForm)
    ElMessage.success('发货成功')
    shipDialogVisible.value = false
    fetchOrders()
  } finally { submitting.value = false }
}

// ===== 改价 =====
const amountVisible = ref(false)
const amountForm = reactive({ new_amount: 0, reason: '' })

const handleAmount = (row) => {
  currentOrder.value = row
  amountForm.new_amount = row.actual_price
  amountForm.reason = ''
  amountVisible.value = true
}
const submitAmount = async () => {
  if (!amountForm.reason.trim()) return ElMessage.warning('请填写调整原因')
  submitting.value = true
  try {
    await adjustOrderAmount(currentOrder.value.id, amountForm)
    ElMessage.success('金额修改成功')
    amountVisible.value = false
    fetchOrders()
  } finally { submitting.value = false }
}

// ===== 备注 =====
const remarkVisible = ref(false)
const remarkText = ref('')

const handleRemarkItem = (row) => {
  currentOrder.value = row
  remarkText.value = ''
  remarkVisible.value = true
}
const submitRemark = async () => {
  if (!remarkText.value.trim()) return ElMessage.warning('请填写备注')
  submitting.value = true
  try {
    await addOrderRemark(currentOrder.value.id, { remark: remarkText.value })
    ElMessage.success('备注添加成功')
    remarkVisible.value = false
    fetchOrders()
  } finally { submitting.value = false }
}

// ===== 强制操作 =====
const forceVisible = ref(false)
const forceType = ref('') // 'complete' | 'cancel'
const forceForm = reactive({ reason: '' })

const handleForce = (row, type) => {
  currentOrder.value = row
  forceType.value = type
  forceForm.reason = ''
  forceVisible.value = true
}
const submitForce = async () => {
  if (!forceForm.reason.trim()) return ElMessage.warning('必填原因')
  submitting.value = true
  try {
    if (forceType.value === 'complete') {
      await forceCompleteOrder(currentOrder.value.id, forceForm)
      ElMessage.success('订单已强制完成')
    } else {
      await forceCancelOrder(currentOrder.value.id, forceForm)
      ElMessage.success('订单已强制取消并退款')
    }
    forceVisible.value = false
    fetchOrders()
  } finally { submitting.value = false }
}

// Dropdown dispatch
const handleDropdown = (cmd, row) => {
  if (cmd === 'amount') handleAmount(row)
  else if (cmd === 'remark') handleRemarkItem(row)
  else if (cmd === 'force_complete') handleForce(row, 'complete')
  else if (cmd === 'force_cancel') handleForce(row, 'cancel')
}

// ===== 工具 =====
const roleText = (r) => (['普通用户', '会员', '团长', '代理商'][r] ?? '未知')
const roleTagType = (r) => (['', 'success', 'warning', 'danger'][r] ?? '')
const getStatusType = (s) => (['pending'].includes(s) ? 'warning' : ['paid','shipped'].includes(s) ? 'primary' : ['completed'].includes(s) ? 'success' : 'info')
const getStatusText = (s) => ({
  pending: '待付款', paid: '待发货', shipping_requested: '请求发货', shipped: '已发货', completed: '已完成', cancelled: '已取消', refunded: '已退款'
}[s] || s)
const formatDateTime = (d) => d ? dayjs(d).format('YYYY-MM-DD HH:mm:ss') : '-'

onMounted(() => {
  fetchOrders()
})
</script>

<style scoped>
.filter-container { margin-bottom: 20px; }
.danger-text { color: var(--el-color-danger) !important; }
.warning-text { color: var(--el-color-warning) !important; }
</style>
