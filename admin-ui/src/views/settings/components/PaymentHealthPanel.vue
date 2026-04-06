<template>
  <div v-loading="loading" class="payment-health-panel">
    <div class="payment-health-toolbar">
      <div>
        <div class="payment-health-title">微信支付健康检查</div>
        <div class="payment-health-subtitle">直接查看当前后台支付配置、证书和回调地址是否正常</div>
      </div>
      <div class="payment-health-actions">
        <el-button @click="onRefresh">刷新检查</el-button>
        <el-button type="primary" :loading="refreshing" @click="onRefreshCert">
          刷新平台证书并重检
        </el-button>
      </div>
    </div>

    <el-alert
      :title="paymentHealth.summary || '尚未检查微信支付状态'"
      :type="statusType"
      :closable="false"
      show-icon
    />

    <el-descriptions :column="2" border style="margin-top: 16px;">
      <el-descriptions-item label="当前状态">
        <el-tag :type="statusType">{{ statusLabel }}</el-tag>
      </el-descriptions-item>
      <el-descriptions-item label="最近检查时间">
        {{ formatDateTime(paymentHealth.checked_at) }}
      </el-descriptions-item>
      <el-descriptions-item label="平台证书缓存">
        <el-tag :type="paymentHealth.cert_status?.is_valid ? 'success' : 'warning'">
          {{ paymentHealth.cert_status?.is_valid ? '有效' : '无有效缓存' }}
        </el-tag>
      </el-descriptions-item>
      <el-descriptions-item label="证书缓存到期">
        {{ formatDateTime(paymentHealth.cert_status?.cached_until) }}
      </el-descriptions-item>
      <el-descriptions-item label="平台证书文件">
        {{ paymentHealth.cert_status?.file_path || '-' }}
      </el-descriptions-item>
      <el-descriptions-item label="本地证书文件状态">
        <el-tag :type="paymentHealth.cert_status?.file_exists ? 'success' : 'warning'">
          {{ paymentHealth.cert_status?.file_exists ? '已找到' : '未找到' }}
        </el-tag>
      </el-descriptions-item>
    </el-descriptions>

    <el-alert
      v-if="paymentHealth.refresh_result?.message"
      :title="paymentHealth.refresh_result.message"
      :type="paymentHealth.refresh_result.status === 'ok' ? 'success' : paymentHealth.refresh_result.status === 'warning' ? 'warning' : 'error'"
      :closable="false"
      show-icon
      style="margin-top: 16px;"
    />

    <el-table
      :data="paymentHealth.checks || []"
      border
      style="width: 100%; margin-top: 16px;"
      empty-text="暂无检查结果"
    >
      <el-table-column prop="label" label="检查项" min-width="180" />
      <el-table-column label="状态" width="110">
        <template #default="{ row }">
          <el-tag :type="row.status === 'ok' ? 'success' : row.status === 'warning' ? 'warning' : 'danger'">
            {{ row.status === 'ok' ? '正常' : row.status === 'warning' ? '警告' : '异常' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="message" label="说明" min-width="220" />
      <el-table-column prop="value" label="当前值" min-width="260" show-overflow-tooltip />
    </el-table>
  </div>
</template>

<script setup>
defineProps({
  loading: { type: Boolean, required: true },
  refreshing: { type: Boolean, required: true },
  paymentHealth: { type: Object, required: true },
  statusType: { type: String, required: true },
  statusLabel: { type: String, required: true },
  formatDateTime: { type: Function, required: true },
  onRefresh: { type: Function, required: true },
  onRefreshCert: { type: Function, required: true }
})
</script>

<style scoped>
.payment-health-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.payment-health-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
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

.payment-health-actions {
  display: flex;
  gap: 12px;
}

@media (max-width: 767px) {
  .payment-health-toolbar { flex-direction: column; align-items: flex-start; }
  .payment-health-actions { flex-wrap: wrap; }
}
</style>
