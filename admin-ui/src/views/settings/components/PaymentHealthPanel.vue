<template>
  <div v-loading="loading" class="payment-health-panel">
    <div>
      <div class="payment-health-title">支付健康检测</div>
      <div class="payment-health-subtitle">展示当前管理后台读取到的支付链路状态、检查项与最近检查时间。</div>
    </div>

    <el-alert
      :title="paymentHealth.summary || '当前支付由云开发链路接管'"
      :type="statusType"
      :closable="false"
      show-icon
    />

    <el-descriptions :column="2" border style="margin-top: 16px;">
      <el-descriptions-item label="当前状态">
        <el-tag :type="statusType">{{ statusLabel }}</el-tag>
      </el-descriptions-item>
      <el-descriptions-item label="说明更新时间">
        {{ formatDateTime(paymentHealth.checked_at) }}
      </el-descriptions-item>
    </el-descriptions>

    <el-table
      :data="paymentHealth.checks || []"
      border
      style="width: 100%; margin-top: 16px;"
      empty-text="暂无说明项"
    >
      <el-table-column prop="label" label="说明项" min-width="180" />
      <el-table-column label="状态" width="130">
        <template #default="{ row }">
          <el-tag :type="row.status === 'ok' ? 'success' : row.status === 'warning' ? 'warning' : 'danger'">
            {{ row.status === 'ok' ? '已接管' : row.status === 'warning' ? '提醒' : '异常' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="message" label="说明" min-width="320" />
    </el-table>
  </div>
</template>

<script setup>
defineProps({
  loading: { type: Boolean, required: true },
  paymentHealth: { type: Object, required: true },
  statusType: { type: String, required: true },
  statusLabel: { type: String, required: true },
  formatDateTime: { type: Function, required: true }
})
</script>

<style scoped>
.payment-health-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.payment-health-title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.payment-health-subtitle {
  margin-top: 4px;
  font-size: 13px;
  color: #909399;
}
</style>
