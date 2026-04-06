<template>
  <el-dialog :model-value="visible" :title="isEdit ? '编辑砍价活动' : '新增砍价活动'" width="min(600px, 94vw)" @update:model-value="emit('update:visible', $event)">
    <el-form ref="internalFormRef" :model="form" label-width="120px">
      <el-form-item label="关联商品" prop="product_id" :rules="[{ required: true, message: '请选择商品' }]">
        <el-select
          v-model="form.product_id"
          filterable
          remote
          :remote-method="searchProducts"
          :loading="productSearchLoading"
          placeholder="搜索商品"
          style="width:min(300px, 100%);"
        >
          <el-option v-for="p in productOptions" :key="p.id" :label="p.name" :value="p.id">
            <div style="display:flex;align-items:center;gap:8px;">
              <el-image :src="p.images && p.images[0]" style="width:28px;height:28px;border-radius:3px;" fit="cover" />
              <span>{{ p.name }}</span>
            </div>
          </el-option>
        </el-select>
      </el-form-item>
      <el-form-item label="活动原价">
        <el-input-number v-model="form.original_price" :precision="2" :min="0" :step="1" placeholder="展示用原价" />
      </el-form-item>
      <el-form-item label="砍价开始价">
        <el-input-number v-model="form.initial_price" :precision="2" :min="0" :step="1" />
        <span style="margin-left:8px;font-size:12px;color:#909399;">通常等于原价</span>
      </el-form-item>
      <el-form-item label="砍至底价">
        <el-input-number v-model="form.floor_price" :precision="2" :min="0" :step="1" />
        <span style="margin-left:8px;font-size:12px;color:#f56c6c;">活动最低价</span>
      </el-form-item>
      <el-form-item label="每人砍价范围">
        <el-input-number v-model="form.min_slash_per_helper" :precision="2" :min="0.01" :step="0.1" style="width:120px;" />
        <span style="margin:0 8px;">~</span>
        <el-input-number v-model="form.max_slash_per_helper" :precision="2" :min="0.01" :step="0.5" style="width:120px;" />
        <span style="margin-left:8px;font-size:12px;color:#909399;">元/人</span>
      </el-form-item>
      <el-form-item label="最多帮砍人数">
        <el-input-number v-model="form.max_helpers" :min="1" :max="999" />
        <span style="margin-left:8px;font-size:12px;color:#909399;">-1=不限</span>
      </el-form-item>
      <el-form-item label="砍价有效期">
        <el-input-number v-model="form.expire_hours" :min="1" :max="720" />
        <span style="margin-left:8px;font-size:12px;">小时</span>
      </el-form-item>
      <el-form-item label="活动库存">
        <el-input-number v-model="form.stock_limit" :min="1" />
        <span style="margin-left:8px;font-size:12px;color:#909399;">件</span>
      </el-form-item>
      <el-form-item label="活动时段">
        <el-date-picker v-model="form.start_at" type="datetime" placeholder="开始时间" value-format="YYYY-MM-DD HH:mm:ss" style="width:min(200px, 100%);" />
        <span style="margin:0 6px;color:#909399;">至</span>
        <el-date-picker v-model="form.end_at" type="datetime" placeholder="结束时间" value-format="YYYY-MM-DD HH:mm:ss" style="width:min(200px, 100%);" />
      </el-form-item>
      <el-form-item label="状态">
        <el-switch v-model="form.status" :active-value="1" :inactive-value="0" active-text="上线" inactive-text="下线" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="emit('update:visible', false)">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="emit('submit')">确定</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref } from 'vue'

defineProps({
  visible: { type: Boolean, default: false },
  isEdit: { type: Boolean, default: false },
  form: { type: Object, required: true },
  productOptions: { type: Array, default: () => [] },
  productSearchLoading: { type: Boolean, default: false },
  submitting: { type: Boolean, default: false },
  searchProducts: { type: Function, required: true }
})

const emit = defineEmits(['update:visible', 'submit'])
const internalFormRef = ref()

defineExpose({
  validate: (...args) => internalFormRef.value?.validate?.(...args)
})
</script>
