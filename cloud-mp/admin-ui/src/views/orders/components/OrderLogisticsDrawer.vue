<template>
  <el-drawer :model-value="modelValue" :title="`物流轨迹 · ${order?.order_no || ''}`" size="460px" destroy-on-close @update:model-value="emit('update:modelValue', $event)">
    <div v-if="order" class="logistics-drawer" v-loading="loading">
      <el-descriptions :column="1" border size="small" style="margin-bottom:20px">
        <el-descriptions-item label="订单号">{{ order.order_no || '-' }}</el-descriptions-item>
        <el-descriptions-item label="快递公司">{{ data?.logistics_company || order.logistics_company || '-' }}</el-descriptions-item>
        <el-descriptions-item label="运单号">{{ data?.tracking_no || order.tracking_no || '-' }}</el-descriptions-item>
        <el-descriptions-item label="收件人">
          {{ resolvedAddress(order)?.receiver_name || resolvedAddress(order)?.name || displayBuyerName(order.buyer) }} · {{ resolvedAddress(order)?.phone || '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="收货地址">
          <template v-if="resolvedAddress(order)">
            {{ resolvedAddress(order).province }} {{ resolvedAddress(order).city }} {{ resolvedAddress(order).district }} {{ resolvedAddress(order).detail }}
          </template>
          <template v-else>-</template>
        </el-descriptions-item>
        <el-descriptions-item label="物流状态">
          <el-tag v-if="data" :type="getLogisticsTagType(data.status)" size="small">
            {{ data.statusText || '未查询' }}
          </el-tag>
          <span v-else>-</span>
        </el-descriptions-item>
        <template v-if="order.latest_refund?.type === 'return_refund'">
          <el-descriptions-item label="退货物流">
            {{ [order.latest_refund.return_company, order.latest_refund.return_tracking_no].filter(Boolean).join(' / ') || '待买家填写' }}
          </el-descriptions-item>
          <el-descriptions-item label="退货状态">
            {{ order.latest_refund.return_received_at ? '已确认收回' : (order.latest_refund.return_tracking_no ? '买家已寄回' : '待买家填写') }}
          </el-descriptions-item>
        </template>
      </el-descriptions>

      <div v-if="data?.traces?.length">
        <div class="detail-section-bar" style="margin-top:0">物流轨迹</div>
        <el-timeline>
          <el-timeline-item
            v-for="(trace, idx) in data.traces"
            :key="`${trace.time || idx}-${idx}`"
            :timestamp="trace.time || ''"
            :type="idx === 0 ? 'primary' : ''"
            placement="top"
          >
            {{ trace.desc || trace.status || '-' }}
          </el-timeline-item>
        </el-timeline>
      </div>
      <el-empty v-else-if="!loading" description="暂无物流轨迹" :image-size="80" />

      <div class="detail-inline-actions">
        <el-button type="primary" size="small" :loading="loading" @click="emit('refresh')">
          刷新物流
        </el-button>
        <el-button size="small" @click="emit('update:modelValue', false)">关闭</el-button>
      </div>
    </div>
  </el-drawer>
</template>

<script setup>
defineProps({
  modelValue: { type: Boolean, default: false },
  order: { type: Object, default: null },
  data: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  resolvedAddress: { type: Function, required: true },
  displayBuyerName: { type: Function, required: true },
  getLogisticsTagType: { type: Function, required: true }
})

const emit = defineEmits(['update:modelValue', 'refresh'])
</script>

<style scoped>
.logistics-drawer {
  padding: 0 4px;
}

.detail-section-bar {
  font-size: 14px;
  font-weight: 600;
  padding-bottom: 8px;
  margin-bottom: 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.detail-inline-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}
</style>
