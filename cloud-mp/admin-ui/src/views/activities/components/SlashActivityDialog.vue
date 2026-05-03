<template>
  <el-dialog :model-value="visible" :title="isEdit ? '编辑砍价活动' : '新增砍价活动'" width="min(600px, 94vw)" @update:model-value="emit('update:visible', $event)">
    <el-form ref="internalFormRef" :model="form" label-width="120px">
      <el-form-item label="关联商品" prop="product_id" :rules="[{ required: true, message: '请选择商品' }]">
        <div style="display:flex; align-items:center; gap:12px; width:100%;">
          <div v-if="form.product" style="flex:1; display:flex; align-items:center; gap:10px; padding:6px 10px; border:1px solid #ebeef5; border-radius:6px; background:#fafbfc;">
            <el-image v-if="form.product.cover_image || (Array.isArray(form.product.images) ? form.product.images[0] : '')" fit="cover" style="width:36px;height:36px;border-radius:4px;" :src="form.product.cover_image || (Array.isArray(form.product.images) ? form.product.images[0] : '')" />
            <div style="flex:1; min-width:0;">
              <div style="font-size:13px; color:#303133; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">{{ form.product.name }}</div>
              <div style="font-size:12px; color:#909399;">ID: {{ form.product.id }}<span v-if="form.product.retail_price"> · ¥{{ form.product.retail_price }}</span></div>
            </div>
          </div>
          <div v-else style="flex:1; padding:6px 10px; border:1px dashed #dcdfe6; border-radius:6px; color:#909399; font-size:13px;">尚未选择商品</div>
          <el-button @click="productPickerVisible = true">{{ form.product ? '更换' : '选择商品' }}</el-button>
        </div>
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

    <EntityPicker
      v-model:visible="productPickerVisible"
      v-model="form.product_id"
      entity="product"
      :preselected-items="form.product ? [form.product] : []"
      @confirm="onProductPicked"
    />
  </el-dialog>
</template>

<script setup>
import { ref } from 'vue'
import EntityPicker from '@/components/entity-picker'

const props = defineProps({
  visible: { type: Boolean, default: false },
  isEdit: { type: Boolean, default: false },
  form: { type: Object, required: true },
  submitting: { type: Boolean, default: false }
})

const emit = defineEmits(['update:visible', 'submit'])
const internalFormRef = ref()
const productPickerVisible = ref(false)

const onProductPicked = (id, items) => {
  props.form.product_id = id
  props.form.product = items?.[0] || null
}

defineExpose({
  validate: (...args) => internalFormRef.value?.validate?.(...args)
})
</script>
