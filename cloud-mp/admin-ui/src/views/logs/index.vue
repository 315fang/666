<template>
  <div class="logs-page">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>操作日志</span>
          <el-button type="success" plain @click="handleExport" :loading="exporting">
            <el-icon><Download /></el-icon>
            导出日志
          </el-button>
        </div>
      </template>

      <!-- 搜索栏 -->
      <el-form :inline="true" :model="searchForm" class="search-form">
        <el-form-item label="操作类型">
          <el-select v-model="searchForm.action" placeholder="全部" clearable style="width:130px">
            <el-option label="创建" value="create" />
            <el-option label="更新" value="update" />
            <el-option label="删除" value="delete" />
            <el-option label="审批" value="approve" />
            <el-option label="拒绝" value="reject" />
            <el-option label="发放" value="issue" />
            <el-option label="调整" value="adjust" />
            <el-option label="完成" value="complete" />
            <el-option label="重置" value="reset" />
          </el-select>
        </el-form-item>
        <el-form-item label="资源类型">
          <!-- 后端存 target 字段，值如 users/products/coupons/refunds 等 -->
          <el-select v-model="searchForm.resource" placeholder="全部" clearable style="width:130px">
            <el-option label="商品" value="products" />
            <el-option label="用户" value="users" />
            <el-option label="订单" value="orders" />
            <el-option label="退款" value="refunds" />
            <el-option label="优惠券" value="coupons" />
            <el-option label="佣金" value="commissions" />
            <el-option label="管理员" value="admins" />
            <el-option label="分销商" value="dealers" />
            <el-option label="配置" value="configs" />
          </el-select>
        </el-form-item>
        <el-form-item label="时间范围">
          <el-date-picker
            v-model="searchForm.dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            style="width: 220px"
            value-format="YYYY-MM-DD"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">搜索</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>

      <!-- 表格 -->
      <el-table :data="tableData" v-loading="loading" stripe>
        <el-table-column prop="id" label="ID" width="70" class-name="hide-mobile" />
        <el-table-column label="操作人" width="130" class-name="hide-mobile">
          <template #default="{ row }">
            <div>
              <div>{{ row.operatorName || '-' }}</div>
              <div style="font-size:11px;color:#909399">{{ row.operatorIp || '' }}</div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="操作类型" min-width="130">
          <template #default="{ row }">
            <el-tag :type="actionTagType(row.action)" size="small" style="max-width:120px;overflow:hidden;text-overflow:ellipsis" :title="formatActionLabel(row.action)">
              {{ formatActionLabel(row.action) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="资源" width="90">
          <template #default="{ row }">
            <el-tag type="info" size="small">{{ formatResourceLabel(row.resourceType) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="resourceId" label="资源ID" width="90" class-name="hide-mobile" />
        <el-table-column prop="descriptionText" label="操作描述" min-width="200" show-overflow-tooltip />
        <el-table-column label="结果" width="80">
          <template #default="{ row }">
            <el-tag :type="row.resultType" size="small">
              {{ row.resultText }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="时间" width="160" class-name="hide-mobile">
          <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="详情" width="80">
          <template #default="{ row }">
            <el-button v-if="row.detailPayload" text type="primary" size="small" @click="showDetail(row)">查看</el-button>
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
        @size-change="fetchData"
        @current-change="fetchData"
        style="margin-top: 20px; justify-content: flex-end;"
      />
    </el-card>

    <!-- 变更详情对话框 -->
    <el-dialog v-model="detailDialogVisible" title="变更详情" width="600px">
      <pre class="changes-pre">{{ currentChanges }}</pre>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getLogs, exportLogs } from '@/api'
import { usePagination } from '@/composables/usePagination'
import { formatDate } from '@/utils/format'
import dayjs from 'dayjs'

const loading = ref(false)
const exporting = ref(false)
const detailDialogVisible = ref(false)
const currentChanges = ref('')

const searchForm = reactive({ action: '', resource: '', dateRange: [] })
const { pagination, resetPage, applyResponse } = usePagination()
const tableData = ref([])

// 资源模块映射：后端 target 字段 → 中文
const TARGET_LABEL = {
  products: '商品', product: '商品',
  users: '用户', user: '用户',
  orders: '订单', order: '订单',
  refunds: '退款', refund: '退款',
  coupons: '优惠券', coupon: '优惠券',
  coupon_auto_rules: '优惠券自动规则',
  commissions: '佣金', commission: '佣金',
  admins: '管理员', admin: '管理员',
  withdrawals: '提现', withdrawal: '提现',
  configs: '配置', config: '配置',
  group_activities: '团购活动', group_buy: '团购活动',
  lottery_prizes: '抽奖奖品',
  branch_agent_stations: '分仓站点',
  'branch-agent-policy': '分销商政策',
  branch_agent_claims: '分销申请',
  upgrade_applications: '升级申请',
  'upgrade-application': '升级申请',
  slash_activities: '砍价活动',
  banners: 'Banner',
  contents: '内容',
  categories: '分类',
  pickup_stations: '自提点'
}

// 操作全称映射（优先使用完整 action key）
const ACTION_LABEL_FULL = {
  'product.create': '创建商品', 'product.update': '编辑商品', 'product.delete': '删除商品',
  'product.skus.update': '更新商品SKU', 'product.sku.create': '添加SKU', 'product.sku.delete': '删除SKU',
  'user.role.update': '修改用户等级', 'user.role.batch-update': '批量修改等级',
  'user.balance.adjust': '调整用户余额', 'user.status.update': '修改用户状态',
  'user.parent.update': '修改上级关系',
  'dealer.approve': '审批通过分销商', 'dealer.reject': '拒绝分销商', 'dealer.level.update': '修改分销商等级', 'dealer.profile.update': '编辑分销商信息',
  'admin.create': '创建管理员', 'admin.update': '编辑管理员', 'admin.delete': '删除管理员',
  'admin.password.update': '修改密码', 'admin.password.reset': '重置密码',
  'coupon.create': '创建优惠券', 'coupon.update': '编辑优惠券', 'coupon.delete': '删除优惠券',
  'coupon.issue': '发放优惠券', 'coupon.status': '变更优惠券状态', 'coupon.auto_rules.update': '更新自动发券规则',
  'refund.approve': '审批退款', 'refund.reject': '拒绝退款',
  'refund.complete': '完成退款', 'refund.processing': '退款处理中',
  'commission.approve_settle': '佣金结算审批', 'commission.reject_cancel': '佣金取消',
  'commission.batch_approve_settle': '批量结算佣金', 'commission.batch_reject_cancel': '批量取消佣金',
  'group_buy.create': '创建团购', 'group_buy.update': '编辑团购', 'group_buy.delete': '删除团购',
  'branch-agent.policy.update': '更新分销商政策',
  'branch-agent.station.create': '创建分仓站点', 'branch-agent.station.update': '编辑分仓站点',
  'member-tier-config.update': '更新会员等级配置'
}

// 从复合 action 推断动词标签（用于 el-tag 颜色）
function extractVerb(action) {
  const parts = String(action || '').split(/[._-]/)
  return parts[parts.length - 1] || action
}

const formatActionLabel = (action) => {
  if (!action) return '-'
  return ACTION_LABEL_FULL[action] || action
}

const formatResourceLabel = (target) => {
  if (!target) return '-'
  return TARGET_LABEL[target] || target
}

const normalizeLogRow = (row = {}) => {
  const status = String(row.status || '').toLowerCase()
  // 已记录的操作默认成功，除非明确标记为 failed/error
  const isFail = ['fail', 'failed', 'error'].includes(status)
  const isSuccess = !isFail && (status === '' || ['success', 'succeeded', 'ok'].includes(status))
  const detailPayload = row.detail ?? row.changes ?? row.details ?? null

  // 后端 target 字段存资源类型
  const resourceTarget = row.target || row.resource || row.resource_type || row.target_type || row.module || ''
  const resourceId = row.resource_id || row.target_id || (row.detail?.product_id) || (row.detail?.coupon_id) || (row.detail?.user_id) || (row.detail?.admin_id) || (row.detail?.refund_id) || ''

  const descriptionText = row.description || row.content
    || ACTION_LABEL_FULL[row.action]
    || `${formatResourceLabel(resourceTarget)} · ${row.action || ''}`

  return {
    ...row,
    operatorName: row.admin_name || row.username || row.admin_username || row.admin_id || '-',
    operatorIp: row.ip_address || row.ip || '',
    resourceType: resourceTarget,
    resourceId: String(resourceId || ''),
    descriptionText,
    createdAt: row.created_at || row.createdAt,
    detailPayload,
    resultType: isSuccess ? 'success' : 'danger',
    resultText: isSuccess ? '成功' : '失败'
  }
}

const fetchData = async () => {
  loading.value = true
  try {
    const params = {
      action: searchForm.action,
      resource: searchForm.resource,
      page: pagination.page,
      limit: pagination.limit
    }
    if (searchForm.dateRange?.length === 2) {
      params.start_date = searchForm.dateRange[0]
      params.end_date = searchForm.dateRange[1]
    }
    const res = await getLogs(params)
    tableData.value = (res?.list || []).map(normalizeLogRow)
    applyResponse(res)
  } catch (e) {
    console.error('获取日志失败:', e)
  } finally {
    loading.value = false
  }
}

const handleSearch = () => { resetPage(); fetchData() }
const handleReset = () => {
  searchForm.action = ''
  searchForm.resource = ''
  searchForm.dateRange = []
  handleSearch()
}

const handleExport = async () => {
  exporting.value = true
  try {
    const params = {
      action: searchForm.action,
      resource: searchForm.resource,
      format: 'csv'
    }
    if (searchForm.dateRange?.length === 2) {
      params.start_date = searchForm.dateRange[0]
      params.end_date = searchForm.dateRange[1]
    }
    const res = await exportLogs(params)
    const url = URL.createObjectURL(res)
    const a = document.createElement('a')
    a.href = url
    a.download = `操作日志_${dayjs().format('YYYYMMDD')}.csv`
    a.click()
    URL.revokeObjectURL(url)
    ElMessage.success('导出成功')
  } catch (e) {
    console.error('导出失败:', e)
  } finally {
    exporting.value = false
  }
}

const showDetail = (row) => {
  try {
    currentChanges.value = JSON.stringify(
      typeof row.detailPayload === 'string' ? JSON.parse(row.detailPayload) : row.detailPayload,
      null, 2
    )
  } catch {
    currentChanges.value = typeof row.detailPayload === 'string' ? row.detailPayload : JSON.stringify(row.detailPayload || {}, null, 2)
  }
  detailDialogVisible.value = true
}

const ACTION_VERB_TAG = {
  create: 'success', update: 'warning', delete: 'danger',
  approve: 'success', approve_settle: 'success', batch_approve_settle: 'success',
  reject: 'danger', reject_cancel: 'danger', batch_reject_cancel: 'danger',
  issue: 'primary', adjust: 'warning', complete: 'success',
  reset: 'warning', login: 'primary', logout: 'info',
  export: 'info', ship: 'info', status: 'warning', processing: 'warning'
}

const actionTagType = (action) => {
  if (!action) return ''
  if (ACTION_VERB_TAG[action]) return ACTION_VERB_TAG[action]
  const verb = extractVerb(action)
  return ACTION_VERB_TAG[verb] || ''
}

onMounted(fetchData)
</script>

<style scoped>
.logs-page { padding: 0; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.search-form { margin-bottom: 20px; }
.changes-pre { background: #f5f7fa; padding: 16px; border-radius: 4px; font-size: 13px; max-height: 400px; overflow-y: auto; white-space: pre-wrap; word-break: break-all; margin: 0; }
</style>
