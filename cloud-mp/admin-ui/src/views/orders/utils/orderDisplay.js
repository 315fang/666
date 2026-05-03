/**
 * 订单页纯展示/格式化辅助函数集合。
 *
 * 这里的函数都是无状态、纯函数，不依赖 Vue reactivity，也不持有任何响应式状态。
 * 从原 `orders/index.vue` 的 script 中抽出，用于列表、详情、物流、操作等模块共享。
 *
 * 抽离依据：原文件 944 行 script 中约 200 行是此类展示/判定函数，长期散落在
 * `// ===== 工具 =====` 之前之后，阅读体验差、互相穿插状态逻辑。集中到此便于复用。
 */

import { getCommissionTypeLabel } from '@/utils/commission'
import { formatDateTime } from '@/utils/format'
import { getUserAvatar, getUserNickname, normalizeUserDisplay } from '@/utils/userDisplay'

// ---------- 金额 ----------

export const money = (value) => {
  const n = Number(value || 0)
  return Number.isFinite(n) ? n.toFixed(2) : '0.00'
}

export const moneyNumber = (value) => Number(money(value))

export const normalizeAmount = (value) => {
  const n = Number(value || 0)
  if (!Number.isFinite(n)) return 0
  return Math.round((n + Number.EPSILON) * 100) / 100
}

// ---------- 时间 ----------

export const fmtDateTime = (value) => (value ? formatDateTime(value) : '-')

// ---------- 佣金 ----------

export const activeCommissionRows = (order = {}) => {
  const rows = Array.isArray(order?.commissions) ? order.commissions : []
  return rows.filter((item) => !['cancelled', 'void', 'revoked'].includes(String(item?.status || '').trim().toLowerCase()))
}

export const commissionAmountByTypes = (order = {}, types = []) => {
  const typeSet = new Set(types.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean))
  return normalizeAmount(
    activeCommissionRows(order)
      .filter((item) => typeSet.has(String(item?.type || '').trim().toLowerCase()))
      .reduce((sum, item) => sum + Number(item?.amount || 0), 0)
  )
}

export const referralCommissionTotal = (order = {}) => commissionAmountByTypes(order, ['direct', 'indirect'])

export const agentFulfillmentProfit = (order = {}) => {
  const fromCommissions = commissionAmountByTypes(order, ['agent_fulfillment'])
  if (fromCommissions > 0) return fromCommissions
  return normalizeAmount(order?.middle_commission_total)
}

export const fulfillmentProfitNote = (order = {}) => {
  const hasFulfillmentPartner = !!String(order?.fulfillment_partner_id || order?.fulfillment_partner_openid || '').trim()
  const referralTotal = referralCommissionTotal(order)
  const fulfillmentTotal = agentFulfillmentProfit(order)
  if (!hasFulfillmentPartner && referralTotal > 0) {
    return '当前订单是平台履约，所以代理发货利润为 0；上级收益走的是推荐佣金，金额已计入“推荐佣金合计”和下方佣金记录。'
  }
  if (hasFulfillmentPartner && fulfillmentTotal <= 0) {
    return '当前订单已锁定代理履约，但还没有生成代理发货利润，请核对发货动作、锁定进货价和佣金记录。'
  }
  return ''
}

export const commissionTypeText = (type) => getCommissionTypeLabel(type)

export const commissionStatusText = (status) => ({
  pending: '预计入账',
  frozen: '冻结中',
  pending_approval: '待审批',
  approved: '已审批',
  settled: '已结算',
  cancelled: '已取消'
}[status] || status || '-')

// ---------- 支付方式 / 退款 ----------

export const detailPaymentMethod = (row = {}) => {
  const raw = String(row.payment_method || '').trim().toLowerCase()
  if (['wechat', 'wx', 'jsapi', 'miniapp', 'wechatpay', 'weixin'].includes(raw)) return 'wechat'
  if (['goods_fund'].includes(raw)) return 'goods_fund'
  if (['wallet', 'balance', 'credit', 'debt'].includes(raw)) return 'wallet'
  if (row.goods_fund_paid === true) return 'goods_fund'
  if (row.paid_at) return 'wechat'
  return raw || ''
}

export const paymentMethodText = (method) => ({
  wechat: '微信支付',
  goods_fund: '货款支付',
  wallet: '余额支付'
}[method] || (method || '-'))

export const paymentMethodTagType = (method) => ({
  wechat: 'success',
  goods_fund: 'warning',
  wallet: 'info'
}[method] || 'info')

export const refundStatusTagType = (status) => ({
  pending: 'info',
  approved: 'warning',
  processing: 'warning',
  completed: 'success',
  failed: 'danger',
  rejected: 'info',
  cancelled: 'info'
}[String(status || '').trim().toLowerCase()] || 'info')

export const refundDestinationText = (method) => ({
  wechat: '原路退回微信支付',
  goods_fund: '退回货款余额',
  wallet: '退回账户余额'
}[method] || '-')

// ---------- 配送 / 订单类型 ----------

export const deliveryTypeText = (type) => ({
  express: '快递配送',
  pickup: '到店自提'
}[type] || '-')

export const orderTypeText = (row) => {
  const type = String(row?.type || row?.order_type || '').trim().toLowerCase()
  if (type === 'bundle' || row?.bundle_id || row?.bundle_meta) return '组合订单'
  if (type === 'group' || row?.group_no || row?.group_activity_id) return '拼团订单'
  if (type === 'slash' || row?.slash_no || row?.slash_activity_id) return '砍价订单'
  if (String(row?.delivery_type || '').trim().toLowerCase() === 'pickup') return '自提订单'
  return '普通订单'
}

export const orderSourceText = () => '小程序商城'

// ---------- SKU / 行价 ----------

export const listSkuText = (row) => {
  if (row?.sku?.spec_name || row?.sku?.spec_value) {
    return `${row.sku.spec_name || '规格'}：${row.sku.spec_value || '-'}`
  }
  return '默认'
}

export const lineUnitPrice = (row) => {
  const q = Number(row?.qty || row?.quantity || 1)
  const t = Number(row?.total_amount || 0)
  if (q <= 0) return money(t)
  return money(t / q)
}

export const detailSkuText = (order) => {
  if (order?.sku?.spec_name || order?.sku?.spec_value) {
    return `${order.sku.spec_name || '规格'}：${order.sku.spec_value || '-'}`
  }
  return '默认规格'
}

export const detailTimeline = (order) => {
  const items = [
    { label: '会员提交订单', time: fmtDateTime(order?.created_at) },
    { label: '会员支付订单', time: order?.paid_at ? fmtDateTime(order.paid_at) : '' },
    { label: '代理确认订单', time: order?.agent_confirmed_at ? fmtDateTime(order.agent_confirmed_at) : '' },
    { label: '申请发货', time: order?.shipping_requested_at ? fmtDateTime(order.shipping_requested_at) : '' },
    { label: '商家发货', time: order?.shipped_at ? fmtDateTime(order.shipped_at) : '' },
    { label: '订单完成', time: order?.completed_at ? fmtDateTime(order.completed_at) : '' }
  ]
  return items.filter((item) => item.time)
}

// ---------- 履约 / 物流 ----------

export const normalizeFulfillmentType = (order = {}) => {
  const raw = String(order?.fulfillment_type || '').trim().toLowerCase()
  if (raw === 'agent') return 'agent'
  if (['agent_pending', 'agent-pending'].includes(raw)) return 'agent_pending'
  if (['company', 'platform'].includes(raw)) return 'company'
  if (['agent_confirmed', 'shipping_requested'].includes(order?.status)) return 'agent_pending'
  if (String(order?.delivery_type || '').trim().toLowerCase() === 'pickup') return 'pickup'
  return ''
}

export const fulfillmentText = (order = {}) => ({
  company: '云仓发货',
  agent: '代理商发货',
  agent_pending: '代理待确认',
  pickup: '到店自提'
}[normalizeFulfillmentType(order)] || '待确认')

export const resolvedAddress = (order) => order?.address || order?.address_snapshot || null

export const canViewLogistics = (order = {}) => !!String(order?.tracking_no || '').trim()

export const getLogisticsTagType = (status) => ({
  in_transit: 'primary',
  delivering: 'warning',
  delivered: 'success',
  exception: 'danger',
  unknown: 'info',
  manual: 'info'
}[status] || 'info')

// ---------- 订单状态 ----------

export const getStatusType = (s) => (
  ['pending', 'pending_payment'].includes(s)
    ? 'warning'
    : s === 'pending_group'
      ? 'warning'
      : ['paid', 'pickup_pending', 'agent_confirmed', 'shipping_requested', 'shipped'].includes(s)
        ? 'primary'
        : ['completed'].includes(s)
          ? 'success'
          : 'info'
)

export const getStatusText = (s) => ({
  pending: '待付款',
  pending_payment: '待付款',
  pending_group: '待成团',
  paid: '待发货',
  pickup_pending: '待核销',
  agent_confirmed: '代理已确认',
  shipping_requested: '代理申请发货',
  shipped: '已发货',
  completed: '已完成',
  cancelled: '已取消',
  refunded: '已退款'
}[s] || s)

// ---------- 会员角色 ----------

export const roleText = (r) => (['VIP用户', '初级会员', '高级会员', '推广合伙人', '运营合伙人', '区域合伙人', '线下实体门店'][r] ?? '未知')
export const roleTagType = (r) => (['', 'success', 'warning', 'danger', 'danger', 'danger'][r] ?? '')

// ---------- 买家展示 ----------

const displayBuyer = (buyer) => normalizeUserDisplay(buyer || {})
export const displayBuyerName = (buyer, fallback = '-') => getUserNickname(displayBuyer(buyer), fallback)
export const displayBuyerAvatar = (buyer) => getUserAvatar(displayBuyer(buyer))

// ---------- 清理箱分类 ----------

export const cleanupCategoryOptions = [
  { label: '取消未支付噪音', value: 'cancelled_unpaid_noise' },
  { label: '测试订单', value: 'test_order' },
  { label: '无效用户噪音', value: 'invalid_user_noise' },
  { label: '财务关联保留', value: 'finance_related_keep' },
  { label: '手动清理', value: 'manual_cleanup' }
]

export const cleanupCategoryText = (value) =>
  cleanupCategoryOptions.find((item) => item.value === value)?.label || value || '手动清理'

export const inferOrderCleanupCategory = (row = {}) => {
  if (row.is_test_order) return 'test_order'
  if (String(row.status || '').trim().toLowerCase() === 'cancelled') return 'cancelled_unpaid_noise'
  if (['refunding', 'refunded', 'paid', 'shipped', 'completed'].includes(String(row.status || '').trim().toLowerCase())) {
    return 'finance_related_keep'
  }
  return 'manual_cleanup'
}

// ---------- 行级可操作判定 ----------

export const canShipRow = (row = {}) => {
  const status = String(row?.status || '').trim()
  const deliveryType = String(row?.delivery_type || '').trim().toLowerCase()
  if (deliveryType === 'pickup') return false
  if (!['paid', 'agent_confirmed', 'shipping_requested'].includes(status)) return false
  const type = String(row?.type || row?.order_type || '').trim().toLowerCase()
  if ((type === 'group' || row?.group_no || row?.group_activity_id) && !row?.group_completed_at) return false
  return true
}

export const canAdjustAmountRow = (row = {}) => {
  const status = String(row?.status || '').trim().toLowerCase()
  if (!['pending', 'pending_payment'].includes(status)) return false
  const commissions = Array.isArray(row?.commissions) ? row.commissions : []
  return commissions.length === 0
}

// ---------- 列表 / 详情行数据规范化 ----------

export const normalizeOrderDisplay = (row = {}) => {
  const paymentMethodCode = detailPaymentMethod(row)
  return {
    ...row,
    order_visibility: row.order_visibility === 'hidden' ? 'hidden' : 'visible',
    cleanup_category: row.cleanup_category || '',
    display_pay_amount: money(row.pay_amount),
    display_status_text: row.status_text || getStatusText(row.status),
    display_payment_method_code: paymentMethodCode,
    display_payment_method_text: row.payment_method_text || paymentMethodText(paymentMethodCode),
    display_refund_target_text: row.refund_target_text || refundDestinationText(paymentMethodCode),
    display_refund_status_text: row.latest_refund?.status_text || row.refund_status_text || '',
    display_refund_error: row.latest_refund?.error || row.refund_error || ''
  }
}
