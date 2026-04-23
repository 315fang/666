<template>
  <div class="lottery-fulfillment-panel">
    <el-card>
      <template #header>
        <div class="panel-head">
          <span>抽奖记录</span>
          <el-button size="small" @click="emit('refresh')">刷新</el-button>
        </div>
      </template>
      <el-table :data="records" v-loading="recordsLoading" stripe>
        <el-table-column prop="id" label="记录ID" width="120" />
        <el-table-column label="奖品" min-width="180">
          <template #default="{ row }">
            <div class="cell-stack">
              <span>{{ row.prize_name }}</span>
              <span class="cell-sub">{{ prizeTypeLabel(row.reward_actual_type || row.prize_type) }} · {{ row.display_value }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="用户" width="180">
          <template #default="{ row }">
            <div class="cell-stack">
              <span>{{ row.buyer?.nickname || row.openid || '-' }}</span>
              <span class="cell-sub">{{ row.buyer?.member_no || row.openid || '-' }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="履约状态" width="120">
          <template #default="{ row }">
            <el-tag size="small">{{ row.status_text }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="抽中时间" width="180" />
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button
              text
              type="primary"
              size="small"
              @click="emit('retry', row)"
              v-if="['failed', 'pending'].includes(row.fulfillment_status)"
            >
              重试发奖
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-card style="margin-top:16px;">
      <template #header>
        <div class="panel-head">
          <span>领奖申请</span>
        </div>
      </template>
      <el-table :data="claims" v-loading="claimsLoading" stripe>
        <el-table-column prop="id" label="申请ID" width="140" />
        <el-table-column label="奖品" min-width="180">
          <template #default="{ row }">
            <div class="cell-stack">
              <span>{{ row.prize_name }}</span>
              <span class="cell-sub">{{ prizeTypeLabel(row.prize_type) }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="用户" width="180">
          <template #default="{ row }">
            <div class="cell-stack">
              <span>{{ row.buyer?.nickname || row.openid || '-' }}</span>
              <span class="cell-sub">{{ row.phone || '-' }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="收货信息" min-width="220">
          <template #default="{ row }">
            <div class="cell-stack">
              <span>{{ row.receiver_name || '-' }}</span>
              <span class="cell-sub">{{ row.address_text || '-' }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="120">
          <template #default="{ row }">
            <el-tag size="small">{{ row.status_text }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="物流" min-width="180">
          <template #default="{ row }">
            <div class="cell-stack">
              <span>{{ row.shipping_company || '-' }}</span>
              <span class="cell-sub">{{ row.tracking_no || '-' }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <el-space wrap>
              <el-button text type="primary" size="small" @click="emit('approve', row)" v-if="row.status === 'submitted'">审核通过</el-button>
              <el-button text type="danger" size="small" @click="emit('reject', row)" v-if="['submitted', 'approved'].includes(row.status)">驳回</el-button>
              <el-button text type="warning" size="small" @click="emit('ship', row)" v-if="row.status === 'approved' && row.shipping_required">发货</el-button>
              <el-button text type="success" size="small" @click="emit('complete', row)" v-if="['approved', 'shipped'].includes(row.status) || (!row.shipping_required && row.status === 'submitted')">完成</el-button>
            </el-space>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
defineProps({
  records: { type: Array, default: () => [] },
  recordsLoading: { type: Boolean, default: false },
  claims: { type: Array, default: () => [] },
  claimsLoading: { type: Boolean, default: false },
  prizeTypeLabel: { type: Function, required: true }
})

const emit = defineEmits(['refresh', 'retry', 'approve', 'reject', 'ship', 'complete'])
</script>

<style scoped>
.lottery-fulfillment-panel {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.cell-stack {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cell-sub {
  font-size: 12px;
  color: #909399;
  line-height: 1.5;
}
</style>
