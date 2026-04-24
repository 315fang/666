<template>
  <el-drawer :model-value="modelValue" :title="`订单详情 · ${detailData?.order_no || ''}`" size="820px" @update:model-value="emit('update:modelValue', $event)">
    <template v-if="detailData">
      <el-alert
        type="info"
        :closable="false"
        show-icon
        style="margin-bottom: 16px;"
        title="请核对状态、履约、收货与金额后再操作；当前已区分买家留言、内部备注和历史旧备注。"
      />

      <el-descriptions :column="2" border size="small" style="margin-bottom:20px">
        <el-descriptions-item label="订单号" :span="2">{{ detailData.order_no }}</el-descriptions-item>
        <el-descriptions-item label="订单类型">{{ orderTypeText(detailData) }}</el-descriptions-item>
        <el-descriptions-item label="订单状态">
          <el-tag :type="getStatusType(detailData.status)">{{ detailData.display_status_text }}</el-tag>
          <el-tag v-if="detailData.is_test_order" type="warning" effect="plain" size="small" style="margin-left:8px">测试订单</el-tag>
          <el-tag v-if="detailData.order_visibility === 'hidden'" type="info" effect="plain" size="small" style="margin-left:8px">已隐藏</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="清理分类">
          {{ detailData.order_visibility === 'hidden' ? cleanupCategoryText(detailData.cleanup_category) : '正常显示' }}
        </el-descriptions-item>
        <el-descriptions-item label="履约方式">{{ fulfillmentText(detailData) }}</el-descriptions-item>
        <el-descriptions-item label="支付方式">
          <el-tag :type="paymentMethodTagType(detailData.display_payment_method_code || detailPaymentMethod(detailData))" size="small">
            {{ detailData.display_payment_method_text }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="退款去向">{{ detailData.display_refund_target_text }}</el-descriptions-item>
        <el-descriptions-item v-if="detailData.display_refund_status_text" label="最新退款状态">
          <el-tag :type="refundStatusTagType(detailData.latest_refund?.status || detailData.refund_status)" size="small">
            {{ detailData.display_refund_status_text }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item v-if="detailData.display_refund_error" label="退款异常" :span="2">
          {{ detailData.display_refund_error }}
        </el-descriptions-item>
        <el-descriptions-item label="配送方式">{{ deliveryTypeText(detailData.delivery_type) }}</el-descriptions-item>
        <el-descriptions-item label="下单时间">{{ fmtDateTime(detailData.created_at) }}</el-descriptions-item>
        <el-descriptions-item label="支付时间">{{ fmtDateTime(detailData.paid_at) }}</el-descriptions-item>
        <el-descriptions-item label="发货时间">{{ fmtDateTime(detailData.shipped_at) }}</el-descriptions-item>
        <el-descriptions-item label="完成时间">{{ fmtDateTime(detailData.completed_at) }}</el-descriptions-item>
        <el-descriptions-item label="代理确认">{{ fmtDateTime(detailData.agent_confirmed_at) }}</el-descriptions-item>
        <el-descriptions-item label="申请发货">{{ fmtDateTime(detailData.shipping_requested_at) }}</el-descriptions-item>
      </el-descriptions>

      <el-row :gutter="16" style="margin-bottom: 16px;">
        <el-col :span="24">
          <div class="detail-card">
            <div class="detail-card-title">会员信息</div>
            <div class="detail-member-row">
              <el-avatar :src="displayBuyerAvatar(detailData.buyer)" :size="48">{{ displayBuyerName(detailData.buyer, '?').slice(0, 1) }}</el-avatar>
              <el-descriptions :column="2" border size="small" class="detail-member-desc">
                <el-descriptions-item label="买家昵称">{{ displayBuyerName(detailData.buyer) }}</el-descriptions-item>
                <el-descriptions-item label="会员编号">{{ detailData.buyer?.member_no || '-' }}</el-descriptions-item>
                <el-descriptions-item label="手机号">{{ detailData.buyer?.phone || '-' }}</el-descriptions-item>
                <el-descriptions-item label="会员层级">
                  <el-tag size="small" :type="roleTagType(detailData.buyer?.role_level)">{{ roleText(detailData.buyer?.role_level) }}</el-tag>
                </el-descriptions-item>
                <el-descriptions-item label="用户ID">{{ detailData.buyer?.invite_code || '-' }}</el-descriptions-item>
              </el-descriptions>
            </div>
          </div>
        </el-col>
      </el-row>

      <div class="detail-section-bar">商品信息</div>
      <div v-if="detailData.bundle_meta" class="detail-card" style="margin-bottom:16px;">
        <div class="detail-card-title">组合信息</div>
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="组合标题">{{ detailData.bundle_meta.title || '-' }}</el-descriptions-item>
          <el-descriptions-item label="组合价">¥{{ money(detailData.bundle_meta.bundle_price || detailData.pay_amount) }}</el-descriptions-item>
          <el-descriptions-item label="组合副标题" :span="2">{{ detailData.bundle_meta.subtitle || '-' }}</el-descriptions-item>
        </el-descriptions>
      </div>
      <el-row :gutter="16" class="detail-goods-row">
        <el-col :xs="24" :lg="15">
          <el-table :data="detailLineItems" border size="small" class="goods-lines-table">
            <el-table-column label="商品信息" min-width="220">
              <template #default="{ row }">
                <div class="line-prod">
                  <el-image :src="row.image" class="line-prod-thumb" fit="cover" />
                  <div>
                    <div class="line-prod-name">{{ row.name }}</div>
                    <div class="line-prod-spec">{{ row.spec }}</div>
                  </div>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="价格(元)" width="100" align="right">
              <template #default="{ row }">¥{{ row.unitPrice }}</template>
            </el-table-column>
            <el-table-column prop="qty" label="数量" width="72" align="center">
              <template #default="{ row }">{{ row.qty || row.quantity || 1 }}</template>
            </el-table-column>
            <el-table-column label="小计(元)" width="100" align="right">
              <template #default="{ row }">¥{{ row.lineTotal }}</template>
            </el-table-column>
          </el-table>
        </el-col>
        <el-col :xs="24" :lg="9">
          <div class="amount-summary">
            <div class="amount-row"><span>商品金额</span><span>¥{{ money(detailData.total_amount) }}</span></div>
            <div class="amount-row"><span>运费金额</span><span>¥{{ money(detailData.shipping_fee) }}</span></div>
            <div class="amount-row danger" v-if="Number(detailData.bundle_discount || 0) > 0"><span>组合优惠</span><span>-¥{{ money(detailData.bundle_discount) }}</span></div>
            <div class="amount-row danger"><span>优惠金额</span><span>-¥{{ money(detailData.coupon_discount) }}</span></div>
            <div class="amount-row danger"><span>积分抵扣</span><span>-¥{{ money(detailData.points_discount) }}</span></div>
            <div class="amount-row total"><span>应付金额</span><span class="text-price">¥{{ detailData.display_pay_amount }}</span></div>
            <div class="amount-row">
              <span>支付方式</span>
              <span>{{ detailData.display_payment_method_text }}</span>
            </div>
          </div>
        </el-col>
      </el-row>

      <div class="detail-section-bar" style="margin-top:20px">买家留言</div>
      <div class="buyer-remark-block">
        {{ detailData.memo?.trim() ? detailData.memo : '无' }}
      </div>

      <div class="detail-section-bar" style="margin-top:20px">内部备注</div>
      <div class="buyer-remark-block">
        {{ detailData.admin_remark?.trim() ? detailData.admin_remark : '无' }}
      </div>

      <template v-if="detailData.remark?.trim()">
        <div class="detail-section-bar" style="margin-top:20px">历史备注</div>
        <div class="buyer-remark-block buyer-remark-block--legacy">
          {{ detailData.remark }}
        </div>
      </template>

      <el-divider content-position="left">收货信息</el-divider>
      <div class="info-block detail-address">
        <template v-if="resolvedAddress(detailData)">
          <div class="detail-address-name">{{ resolvedAddress(detailData).receiver_name || resolvedAddress(detailData).name }} - {{ resolvedAddress(detailData).phone }}</div>
          <div class="detail-address-text">
            {{ resolvedAddress(detailData).province }} {{ resolvedAddress(detailData).city }} {{ resolvedAddress(detailData).district }}
            <br />
            {{ resolvedAddress(detailData).detail }}
          </div>
        </template>
        <template v-else>暂无收货信息</template>
      </div>

      <el-divider content-position="left">物流与履约</el-divider>
      <el-descriptions :column="2" border size="small" style="margin-bottom:20px">
        <el-descriptions-item label="承运方">{{ detailData.logistics_company || '-' }}</el-descriptions-item>
        <el-descriptions-item label="物流单号">{{ detailData.tracking_no || '-' }}</el-descriptions-item>
        <el-descriptions-item label="自提门店" v-if="detailData.delivery_type === 'pickup'">{{ detailData.pickup_station?.name || '-' }}</el-descriptions-item>
        <el-descriptions-item label="核销人ID" v-if="detailData.delivery_type === 'pickup'">{{ detailData.pickup_verified_by || '-' }}</el-descriptions-item>
        <el-descriptions-item label="核销人" v-if="detailData.delivery_type === 'pickup'">{{ detailData.pickup_verified_user?.nickname || detailData.pickup_verified_by || '-' }}</el-descriptions-item>
        <el-descriptions-item label="核销时间" v-if="detailData.delivery_type === 'pickup'">{{ fmtDateTime(detailData.pickup_verified_at) || '-' }}</el-descriptions-item>
        <el-descriptions-item label="服务费" v-if="detailData.delivery_type === 'pickup'">¥{{ money(detailData.pickup_service_fee_amount) }}</el-descriptions-item>
        <el-descriptions-item label="进货价补偿" v-if="detailData.delivery_type === 'pickup'">¥{{ money(detailData.pickup_principal_return_amount) }}</el-descriptions-item>
        <el-descriptions-item label="补偿冲回" v-if="detailData.delivery_type === 'pickup' && Number(detailData.pickup_principal_reversal_amount || 0) > 0">¥{{ money(detailData.pickup_principal_reversal_amount) }}</el-descriptions-item>
        <el-descriptions-item label="最近代理商ID">{{ detailData.nearest_agent_id || '-' }}</el-descriptions-item>
        <el-descriptions-item label="实际履约人ID">{{ detailData.fulfillment_partner_id || '-' }}</el-descriptions-item>
        <el-descriptions-item label="锁定进货价">¥{{ money(detailData.locked_agent_cost) }}</el-descriptions-item>
        <el-descriptions-item label="代理发货利润">¥{{ money(agentFulfillmentProfit(detailData)) }}</el-descriptions-item>
        <el-descriptions-item label="推荐佣金合计">¥{{ money(referralCommissionTotal(detailData)) }}</el-descriptions-item>
      </el-descriptions>
      <div v-if="fulfillmentProfitNote(detailData)" class="text-secondary" style="margin-bottom:12px;font-size:12px;line-height:1.6">
        {{ fulfillmentProfitNote(detailData) }}
      </div>
      <div v-if="canViewLogistics(detailData)" class="detail-inline-actions">
        <el-button type="primary" plain size="small" @click="emit('viewLogistics', detailData)">查看物流轨迹</el-button>
      </div>

      <el-divider content-position="left">订单时间线</el-divider>
      <el-timeline style="margin-bottom: 20px;">
        <el-timeline-item
          v-for="item in detailTimeline(detailData)"
          :key="`${item.label}-${item.time}`"
          :timestamp="item.time"
          placement="top"
        >
          {{ item.label }}
        </el-timeline-item>
      </el-timeline>

      <el-divider content-position="left">佣金记录</el-divider>
      <div v-if="detailData.commissions?.length" class="commission-list">
        <div v-for="item in detailData.commissions" :key="item.id" class="commission-item">
          <div class="commission-main">
            <span>{{ commissionTypeText(item.type) }}</span>
            <span class="commission-amount">¥{{ money(item.amount) }}</span>
          </div>
          <div class="commission-sub">
            <span>{{ commissionStatusText(item.status) }}</span>
            <span>{{ fmtDateTime(item.available_at) }}</span>
          </div>
          <div class="commission-remark" v-if="item.remark">{{ item.remark }}</div>
        </div>
      </div>
      <el-empty v-else description="暂无佣金记录" :image-size="80" />
    </template>
  </el-drawer>
</template>

<script setup>
defineProps({
  modelValue: { type: Boolean, default: false },
  detailData: { type: Object, default: null },
  detailLineItems: { type: Array, default: () => [] },
  orderTypeText: { type: Function, required: true },
  getStatusType: { type: Function, required: true },
  cleanupCategoryText: { type: Function, required: true },
  fulfillmentText: { type: Function, required: true },
  paymentMethodTagType: { type: Function, required: true },
  detailPaymentMethod: { type: Function, required: true },
  refundStatusTagType: { type: Function, required: true },
  deliveryTypeText: { type: Function, required: true },
  fmtDateTime: { type: Function, required: true },
  displayBuyerAvatar: { type: Function, required: true },
  displayBuyerName: { type: Function, required: true },
  roleTagType: { type: Function, required: true },
  roleText: { type: Function, required: true },
  money: { type: Function, required: true },
  resolvedAddress: { type: Function, required: true },
  agentFulfillmentProfit: { type: Function, required: true },
  referralCommissionTotal: { type: Function, required: true },
  fulfillmentProfitNote: { type: Function, required: true },
  canViewLogistics: { type: Function, required: true },
  detailTimeline: { type: Function, required: true },
  commissionTypeText: { type: Function, required: true },
  commissionStatusText: { type: Function, required: true }
})

const emit = defineEmits(['update:modelValue', 'viewLogistics'])
</script>

<style scoped>
.detail-section-bar {
  font-size: 14px;
  font-weight: 600;
  padding-bottom: 8px;
  margin-bottom: 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.detail-goods-row { margin-bottom: 16px; }
.line-prod { display: flex; gap: 10px; align-items: flex-start; }
.line-prod-thumb { width: 48px; height: 48px; border-radius: 6px; flex-shrink: 0; }
.line-prod-name { font-weight: 600; font-size: 13px; }
.line-prod-spec { font-size: 12px; color: #909399; margin-top: 4px; }

.amount-summary {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 12px 16px;
  font-size: 13px;
}

.amount-row {
  display: flex;
  justify-content: space-between;
  padding: 6px 0;
  border-bottom: 1px dashed var(--el-border-color-lighter);
}

.amount-row:last-child { border-bottom: none; }
.amount-row.danger span:last-child { color: var(--el-color-danger); }
.amount-row.total {
  font-weight: 700;
  font-size: 15px;
  padding-top: 10px;
  margin-top: 4px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.buyer-remark-block {
  min-height: 48px;
  padding: 12px;
  background: #fafafa;
  border-radius: 8px;
  font-size: 13px;
  color: #606266;
  white-space: pre-wrap;
  word-break: break-word;
}

.buyer-remark-block--legacy {
  background: #f4f4f5;
  color: #909399;
}

.detail-inline-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.detail-member-row { display: flex; gap: 12px; align-items: flex-start; }
.detail-member-desc { flex: 1; min-width: 0; }
.detail-address { margin-bottom: 20px; }
.detail-card {
  border: 1px solid #ebeef5;
  border-radius: 8px;
  padding: 12px;
  background: #fff;
}

.detail-card-title {
  font-size: 13px;
  font-weight: 700;
  color: #303133;
  margin-bottom: 10px;
}

.detail-address-name {
  font-weight: 700;
  margin-bottom: 6px;
}

.detail-address-text {
  color: #606266;
  font-size: 13px;
  line-height: 1.7;
}

.commission-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.commission-item {
  border: 1px solid #ebeef5;
  border-radius: 8px;
  padding: 10px 12px;
  background: #fff;
}

.commission-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 600;
  color: #303133;
}

.commission-amount {
  color: #f56c6c;
}

.commission-sub {
  display: flex;
  gap: 12px;
  margin-top: 4px;
  font-size: 12px;
  color: #909399;
}

.commission-remark {
  margin-top: 6px;
  font-size: 12px;
  color: #606266;
  line-height: 1.6;
}
</style>
