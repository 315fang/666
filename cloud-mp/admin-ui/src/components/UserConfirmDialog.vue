<template>
  <el-dialog
    v-model="innerVisible"
    :title="title"
    width="560px"
    :close-on-click-modal="false"
    @closed="handleClosed"
  >
    <!-- 操作摘要 -->
    <div class="summary-bar">
      <el-icon class="summary-icon"><WarningFilled /></el-icon>
      <span>即将对 <strong>{{ count }}</strong> 位用户执行：<strong>{{ actionDesc }}</strong></span>
      <el-tag v-if="truncated" type="warning" size="small" style="margin-left:8px">仅展示前100条</el-tag>
    </div>

    <!-- 用户列表 -->
    <el-table
      :data="users"
      v-loading="loading"
      size="small"
      max-height="320"
      stripe
      style="margin-top:12px"
    >
      <el-table-column prop="id" label="ID" width="70" />
      <el-table-column label="昵称" min-width="120">
        <template #default="{ row }">
          <span>{{ row.nickname || '未知用户' }}</span>
          <el-tag v-if="row.invite_code || row.member_no" size="small" type="info" style="margin-left:4px">{{ row.invite_code || row.member_no }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="等级" width="100">
        <template #default="{ row }">
          <el-tag size="small" :type="roleLevelType(row.role_level)">
            {{ row.role_label || roleLevelLabel(row.role_level) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="phone" label="手机号" width="130" />
    </el-table>

    <!-- 空状态 -->
    <el-empty v-if="!loading && count === 0" description="没有匹配的用户，请检查筛选条件" :image-size="60" style="padding: 20px 0" />

    <!-- 二次确认输入 -->
    <div v-if="requireConfirmText && count > 0" class="confirm-input-area">
      <p class="confirm-hint">请输入 <strong>{{ confirmKeyword }}</strong> 以确认操作：</p>
      <el-input v-model="confirmInput" :placeholder="`输入「${confirmKeyword}」继续`" clearable />
    </div>

    <template #footer>
      <el-button @click="innerVisible = false">取消</el-button>
      <el-button
        type="primary"
        :disabled="loading || count === 0 || (requireConfirmText && confirmInput !== confirmKeyword)"
        :loading="confirming"
        @click="handleConfirm"
      >
        确认执行（共 {{ count }} 人）
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, watch, computed } from 'vue'
import { WarningFilled } from '@element-plus/icons-vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, default: '操作确认' },
  actionDesc: { type: String, default: '执行操作' },
  users: { type: Array, default: () => [] },
  count: { type: Number, default: 0 },
  truncated: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  confirming: { type: Boolean, default: false },
  // 当人数超过阈值时，要求输入关键词确认
  requireConfirmThreshold: { type: Number, default: 50 },
  confirmKeyword: { type: String, default: '确认执行' }
})

const emit = defineEmits(['update:modelValue', 'confirm'])

const innerVisible = ref(props.modelValue)
const confirmInput = ref('')

watch(() => props.modelValue, (v) => {
  innerVisible.value = v
  if (v) confirmInput.value = ''
})
watch(innerVisible, (v) => emit('update:modelValue', v))

const requireConfirmText = computed(() => props.count >= props.requireConfirmThreshold)

const roleLevelLabel = (level) => {
  const map = { 0: 'VIP用户', 1: '初级会员', 2: '高级会员', 3: '推广合伙人', 4: '运营合伙人', 5: '区域合伙人', 6: '线下实体门店' }
  return map[level] ?? `等级${level}`
}

const roleLevelType = (level) => {
  const map = { 0: '', 1: 'success', 2: 'warning', 3: 'danger', 4: 'danger' }
  return map[level] ?? ''
}

const handleConfirm = () => emit('confirm')
const handleClosed = () => { confirmInput.value = '' }
</script>

<style scoped>
.summary-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  background: #fdf6ec;
  border: 1px solid #faecd8;
  border-radius: 4px;
  font-size: 14px;
  color: #606266;
}
.summary-icon {
  color: #e6a23c;
  font-size: 18px;
  flex-shrink: 0;
}
.confirm-input-area {
  margin-top: 16px;
  padding: 12px 14px;
  background: #fff3f3;
  border: 1px solid #fbc4c4;
  border-radius: 4px;
}
.confirm-hint {
  margin: 0 0 8px;
  font-size: 13px;
  color: #606266;
}
</style>
