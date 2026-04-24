<template>
  <el-table :data="rows" v-loading="loading" stripe empty-text="暂无订单数据" class="orders-table">
    <el-table-column label="ID" width="90">
      <template #default="{ row }">
        <CompactIdCell :value="row.display_id || row.id" :full-value="row.id" />
      </template>
    </el-table-column>
    <el-table-column label="订单信息" min-width="200">
      <template #default="{ row }">
        <div class="stack-block">
          <div><span class="stack-label">订单编号</span> {{ row.order_no }}</div>
          <div><span class="stack-label">类型</span> {{ orderTypeText(row) }}</div>
          <div><span class="stack-label">下单</span> {{ formatDateTime(row.created_at) }}</div>
          <div><span class="stack-label">支付</span> {{ row.paid_at ? formatDateTime(row.paid_at) : '-' }}</div>
          <div><span class="stack-label">来源</span> {{ orderSourceText(row) }}</div>
          <div class="hide-mobile"><span class="stack-label">配送</span> {{ deliveryTypeText(row.delivery_type) }}</div>
        </div>
      </template>
    </el-table-column>
    <el-table-column label="会员信息" min-width="168" width="188">
      <template #default="{ row }">
        <div class="member-cell">
          <el-avatar :src="displayBuyerAvatar(row.buyer)" :size="36" class="member-avatar">
            {{ displayBuyerName(row.buyer, '?').slice(0, 1) }}
          </el-avatar>
          <div class="member-meta">
            <div class="text-secondary">编号 {{ row.buyer?.member_no || '-' }}</div>
            <div class="member-nick">{{ displayBuyerName(row.buyer) }}</div>
            <div class="text-secondary hide-mobile">{{ row.buyer?.phone || '-' }}</div>
            <el-tag size="small" :type="roleTagType(row.buyer?.role_level)" style="margin-top:4px">
              {{ roleText(row.buyer?.role_level) }}
            </el-tag>
            <div class="hide-mobile" style="margin-top:4px">
              <el-button link type="primary" size="small" @click="emit('userManage', row)">找该会员</el-button>
            </div>
          </div>
        </div>
      </template>
    </el-table-column>
    <el-table-column label="商品信息" min-width="240">
      <template #default="{ row }">
        <div class="cell-info-vertical">
          <el-image :src="row.product?.images?.[0]" class="product-thumb" fit="cover" />
          <div class="cell-info__body">
            <el-link type="primary" :underline="false" class="prod-title-link" @click="emit('productManage', row)">
              {{ row.product?.name || '-' }}
            </el-link>
            <div class="cell-info__sub">{{ listSkuText(row) }}</div>
            <div class="cell-info__sub">单价 ¥{{ lineUnitPrice(row) }} × {{ row.qty || row.quantity || 1 }}</div>
            <div class="cell-info__sub text-price">小计 ¥{{ money(row.total_amount) }}</div>
          </div>
        </div>
      </template>
    </el-table-column>
    <el-table-column label="实付 / 状态" width="180">
      <template #default="{ row }">
        <div class="text-price">¥{{ row.display_pay_amount }}</div>
        <div style="margin-top:6px">
          <el-tag :type="getStatusType(row.status)" size="small">{{ row.display_status_text }}</el-tag>
          <el-tag
            v-if="row.display_refund_status_text"
            :type="refundStatusTagType(row.latest_refund?.status || row.refund_status)"
            effect="plain"
            size="small"
            style="margin-left:6px"
          >
            {{ row.display_refund_status_text }}
          </el-tag>
          <el-tag v-if="row.is_test_order" type="warning" effect="plain" size="small" style="margin-left:6px">测试订单</el-tag>
          <el-tag v-if="row.order_visibility === 'hidden'" type="info" effect="plain" size="small" style="margin-left:6px">已隐藏</el-tag>
        </div>
        <div style="margin-top:6px; display:flex; flex-wrap:wrap; gap:6px;">
          <el-tag :type="paymentMethodTagType(row.display_payment_method_code || detailPaymentMethod(row))" effect="plain" size="small">
            {{ row.display_payment_method_text }}
          </el-tag>
          <el-tag
            v-if="['refunding', 'refunded'].includes(row.status)"
            type="danger"
            effect="plain"
            size="small"
          >
            {{ row.display_refund_target_text }}
          </el-tag>
        </div>
        <div class="text-secondary hide-mobile" style="margin-top:4px;font-size:12px">{{ fulfillmentText(row) }}</div>
      </template>
    </el-table-column>
    <el-table-column label="操作" width="200" fixed="right">
      <template #default="{ row }">
        <el-button text type="primary" size="small" @click="emit('detail', row)">订单详情</el-button>
        <el-button text type="primary" size="small" v-if="canViewLogistics(row)" @click="emit('logistics', row)">物流轨迹</el-button>
        <el-button text type="success" size="small" v-if="canShipRow(row)" @click="emit('ship', row)">发货</el-button>
        <el-dropdown size="small" @command="(cmd) => emit('dropdown', cmd, row)">
          <el-button text size="small">更多<el-icon><ArrowDown /></el-icon></el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-if="canAdjustOrderAmount" command="amount" :disabled="!canAdjustAmountRow(row)">改价</el-dropdown-item>
              <el-dropdown-item command="remark">备注</el-dropdown-item>
              <el-dropdown-item v-if="canManageSettings" command="test_flag">
                {{ row.is_test_order ? '取消测试订单标记' : '标记为测试订单' }}
              </el-dropdown-item>
              <el-dropdown-item v-if="canManageSettings" command="visibility" :class="row.order_visibility === 'hidden' ? '' : 'warning-text'">
                {{ row.order_visibility === 'hidden' ? '移出清理箱' : '移入清理箱' }}
              </el-dropdown-item>
              <el-dropdown-item command="repair_fulfillment" :disabled="['shipped', 'completed', 'refunding', 'refunded', 'cancelled'].includes(row.status)">修复履约</el-dropdown-item>
              <el-dropdown-item v-if="canForceCompleteOrder && row.status === 'shipped'" command="force_complete" class="warning-text">强制完成</el-dropdown-item>
              <el-dropdown-item v-if="canForceCancelOrder" command="force_cancel" :disabled="['completed', 'cancelled', 'refunded'].includes(row.status)" class="danger-text">强制取消</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </template>
    </el-table-column>
  </el-table>
</template>

<script setup>
import { ArrowDown } from '@element-plus/icons-vue'
import CompactIdCell from '@/components/CompactIdCell.vue'

defineProps({
  rows: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  canAdjustOrderAmount: { type: Boolean, default: false },
  canManageSettings: { type: Boolean, default: false },
  canForceCompleteOrder: { type: Boolean, default: false },
  canForceCancelOrder: { type: Boolean, default: false },
  orderTypeText: { type: Function, required: true },
  formatDateTime: { type: Function, required: true },
  orderSourceText: { type: Function, required: true },
  deliveryTypeText: { type: Function, required: true },
  displayBuyerAvatar: { type: Function, required: true },
  displayBuyerName: { type: Function, required: true },
  roleTagType: { type: Function, required: true },
  roleText: { type: Function, required: true },
  listSkuText: { type: Function, required: true },
  lineUnitPrice: { type: Function, required: true },
  money: { type: Function, required: true },
  getStatusType: { type: Function, required: true },
  refundStatusTagType: { type: Function, required: true },
  paymentMethodTagType: { type: Function, required: true },
  detailPaymentMethod: { type: Function, required: true },
  fulfillmentText: { type: Function, required: true },
  canViewLogistics: { type: Function, required: true },
  canShipRow: { type: Function, required: true },
  canAdjustAmountRow: { type: Function, required: true }
})

const emit = defineEmits(['detail', 'logistics', 'ship', 'dropdown', 'userManage', 'productManage'])
</script>

<style scoped>
.orders-table { margin-top: 8px; }
.stack-block { font-size: 12px; line-height: 1.65; color: var(--el-text-color-regular); }
.stack-label { color: #909399; margin-right: 4px; }
.member-cell { display: flex; gap: 10px; align-items: flex-start; }
.member-avatar { flex-shrink: 0; }
.member-meta { min-width: 0; flex: 1; }
.member-nick { font-weight: 600; color: #303133; font-size: 13px; }
.prod-title-link { text-align: left; white-space: normal; line-height: 1.45; font-weight: 600; }
.danger-text { color: var(--el-color-danger) !important; }
.warning-text { color: var(--el-color-warning) !important; }
.product-thumb { width: 50px; height: 50px; border-radius: 4px; }
</style>
