<template>
  <el-card style="margin-top:16px;">
    <template #header>
      <div class="card-header">
        <span>转盘奖品配置</span>
        <div style="display:flex;gap:8px;align-items:center;">
          <span style="font-size:12px;color:#909399;">概率总和应为100，当前：<b>{{ totalProbability.toFixed(1) }}</b></span>
          <el-tag size="small" :type="Math.abs(totalProbability - 100) < 0.01 ? 'success' : 'danger'">
            {{ Math.abs(totalProbability - 100) < 0.01 ? '✓ 正确' : '✗ 不足100' }}
          </el-tag>
          <el-button type="primary" @click="emit('create')">
            <el-icon><Plus /></el-icon> 新增奖品
          </el-button>
        </div>
      </div>
    </template>

    <el-table :data="items" v-loading="loading" stripe>
      <el-table-column prop="sort_order" label="位置" width="70" />
      <el-table-column label="图片" width="80">
        <template #default="{ row }">
          <el-image :src="row.image_url || row.image" style="width:40px;height:40px;border-radius:4px;" fit="cover" v-if="row.image_url || row.image" />
          <span v-else style="color:#ccc">无图</span>
        </template>
      </el-table-column>
      <el-table-column label="展示样式" width="150">
        <template #default="{ row }">
          <div style="display:flex;align-items:center;gap:8px;">
            <div
              style="width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;color:#fff;"
              :style="{ background: `linear-gradient(135deg, ${row.theme_color || '#6B7280'}, ${row.accent_color || '#D1D5DB'})` }"
            >
              {{ row.display_emoji || '🎁' }}
            </div>
            <div style="display:flex;flex-direction:column;line-height:1.2;">
              <span>{{ row.badge_text || '-' }}</span>
              <span style="font-size:12px;color:#909399;">{{ row.theme_color || '#6B7280' }}</span>
            </div>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="name" label="奖品名称" min-width="150" />
      <el-table-column label="类型" width="100">
        <template #default="{ row }">
          <el-tag size="small" :type="prizeTagType(row.type)">{{ prizeTypeLabel(row.type) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="价值" width="100">
        <template #default="{ row }">
          <span v-if="row.type === 'miss'" style="color:#ccc">-</span>
          <span v-else>{{ row.prize_value }}</span>
        </template>
      </el-table-column>
      <el-table-column label="消耗积分" width="100">
        <template #default="{ row }">{{ row.cost_points }}</template>
      </el-table-column>
      <el-table-column label="概率%" width="90">
        <template #default="{ row }">{{ row.probability }}%</template>
      </el-table-column>
      <el-table-column label="库存" width="80">
        <template #default="{ row }">{{ row.stock === -1 ? '无限' : row.stock }}</template>
      </el-table-column>
      <el-table-column label="启用" width="80">
        <template #default="{ row }">
          <el-switch
            :model-value="row.is_active === 1 || row.is_active === true"
            @change="(val) => emit('toggle', row, val ? 1 : 0)"
          />
        </template>
      </el-table-column>
      <el-table-column label="操作" width="140" fixed="right">
        <template #default="{ row }">
          <el-button text type="primary" size="small" @click="emit('edit', row)">编辑</el-button>
          <el-button text type="danger" size="small" @click="emit('delete', row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
  </el-card>
</template>

<script setup>
import { Plus } from '@element-plus/icons-vue'

defineProps({
  items: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  totalProbability: { type: Number, default: 0 },
  prizeTagType: { type: Function, required: true },
  prizeTypeLabel: { type: Function, required: true }
})

const emit = defineEmits(['create', 'edit', 'delete', 'toggle'])
</script>
