<template>
  <el-dialog
    :model-value="visible"
    title="团队概况"
    width="520px"
    @update:model-value="onVisibilityChange"
    @opened="onOpened"
    @closed="onClosed"
  >
    <div v-loading="loading">
      <template v-if="data">
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="负责人 ID">{{ data.leader_id }}</el-descriptions-item>
          <el-descriptions-item label="后代人数">{{ data.descendant_count }}</el-descriptions-item>
          <el-descriptions-item label="后代累计消费(用户表)">¥{{ Number(data.user_total_sales_sum || 0).toFixed(2) }}</el-descriptions-item>
          <el-descriptions-item label="后代订单数合计(用户表)">{{ data.user_order_count_sum }}</el-descriptions-item>
          <el-descriptions-item label="有效订单行数">
            {{ data.order_row_count }}
            <span class="sub-hint">（排除已取消/已退款）</span>
          </el-descriptions-item>
          <el-descriptions-item label="有效订单实付合计">¥{{ Number(data.order_actual_price_sum || 0).toFixed(2) }}</el-descriptions-item>
          <el-descriptions-item label="已支付订单行数">{{ data.order_paid_row_count }}</el-descriptions-item>
          <el-descriptions-item label="已支付实付合计">¥{{ Number(data.order_paid_actual_sum || 0).toFixed(2) }}</el-descriptions-item>
        </el-descriptions>
        <div style="margin-top:12px">
          <span class="sub-hint">统计范围：</span>
          <el-radio-group :model-value="range" size="small" @update:model-value="onRangeChange">
            <el-radio-button label="all">全部时间</el-radio-button>
            <el-radio-button label="30d">近30天订单</el-radio-button>
          </el-radio-group>
        </div>
        <p class="sub-hint" style="margin-top:12px">说明：列表筛选「团队负责人」可查看其全体后代成员；本弹窗订单指标受「统计范围」影响，用户表累计为当前快照。</p>
      </template>
    </div>
    <template #footer>
      <el-button type="primary" @click="onApplyFilter">查看该团队全部成员</el-button>
      <el-button @click="onVisibilityChange(false)">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  loading: {
    type: Boolean,
    default: false
  },
  data: {
    type: Object,
    default: null
  },
  range: {
    type: String,
    default: 'all'
  },
  onVisibilityChange: {
    type: Function,
    required: true
  },
  onOpened: {
    type: Function,
    required: true
  },
  onClosed: {
    type: Function,
    required: true
  },
  onRangeChange: {
    type: Function,
    required: true
  },
  onApplyFilter: {
    type: Function,
    required: true
  }
})
</script>
