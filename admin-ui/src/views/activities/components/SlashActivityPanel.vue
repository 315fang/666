<template>
  <el-card style="margin-top:16px;">
    <template #header>
      <div class="card-header">
        <span>砍价活动列表</span>
        <el-button type="primary" @click="emit('create')">
          <el-icon><Plus /></el-icon> 新增砍价活动
        </el-button>
      </div>
    </template>

    <el-table :data="items" v-loading="loading" stripe>
      <el-table-column prop="id" label="ID" width="60" />
      <el-table-column label="商品" min-width="180">
        <template #default="{ row }">
          <div v-if="row.product" style="display:flex;align-items:center;gap:8px;">
            <el-image :src="row.product.images && row.product.images[0]" style="width:36px;height:36px;border-radius:4px;" fit="cover" />
            <span>{{ row.product.name }}</span>
          </div>
          <span v-else style="color:#ccc">ID: {{ row.product_id }}</span>
        </template>
      </el-table-column>
      <el-table-column label="价格区间" width="180">
        <template #default="{ row }">
          <span style="color:#999;text-decoration:line-through;">¥{{ row.original_price }}</span>
          <span style="margin:0 4px;">→</span>
          <span style="color:#f56c6c;">¥{{ row.floor_price }}</span>
        </template>
      </el-table-column>
      <el-table-column label="有效期" width="100">
        <template #default="{ row }">{{ row.expire_hours }}小时</template>
      </el-table-column>
      <el-table-column label="库存/已卖" width="100">
        <template #default="{ row }">{{ row.stock_limit }} / {{ row.sold_count }}</template>
      </el-table-column>
      <el-table-column label="活动时段" min-width="200">
        <template #default="{ row }">
          <span v-if="row.start_at">{{ formatDate(row.start_at) }} ~ {{ formatDate(row.end_at) }}</span>
          <span v-else style="color:#ccc">长期有效</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="80">
        <template #default="{ row }">
          <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">{{ row.status === 1 ? '上线' : '下线' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="140" fixed="right">
        <template #default="{ row }">
          <el-button text type="primary" size="small" @click="emit('edit', row)">编辑</el-button>
          <el-button text type="danger" size="small" @click="emit('delete', row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div v-if="total > pageSize" class="pagination-wrap">
      <el-pagination
        :current-page="page"
        :page-size="pageSize"
        :total="total"
        layout="prev,pager,next"
        @current-change="emit('page-change', $event)"
      />
    </div>
  </el-card>
</template>

<script setup>
import { Plus } from '@element-plus/icons-vue'

defineProps({
  items: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  total: { type: Number, default: 0 },
  page: { type: Number, default: 1 },
  pageSize: { type: Number, default: 20 },
  formatDate: { type: Function, required: true }
})

const emit = defineEmits(['create', 'edit', 'delete', 'page-change'])
</script>
