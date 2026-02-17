<template>
  <el-tooltip :content="message" placement="top" :disabled="!message">
    <el-tag :type="tagType" size="small" effect="light">
      <el-icon v-if="icon" style="margin-right: 4px;">
        <component :is="icon" />
      </el-icon>
      {{ label }}
    </el-tag>
  </el-tooltip>
</template>

<script setup>
import { computed } from 'vue'
import { Check, Warning, CircleClose, InfoFilled } from '@element-plus/icons-vue'

const props = defineProps({
  status: {
    type: String,
    required: true
  },
  message: {
    type: String,
    default: ''
  }
})

const tagType = computed(() => {
  const map = {
    ok: 'success',
    success: 'success',
    configured: 'success',
    missing: 'danger',
    error: 'danger',
    warning: 'warning',
    optional: 'info',
    info: 'info'
  }
  return map[props.status] || 'info'
})

const label = computed(() => {
  const map = {
    ok: '正常',
    success: '成功',
    configured: '已配置',
    missing: '缺失',
    error: '错误',
    warning: '警告',
    optional: '可选',
    info: '信息'
  }
  return map[props.status] || props.status
})

const icon = computed(() => {
  const map = {
    ok: 'Check',
    success: 'Check',
    configured: 'Check',
    missing: 'CircleClose',
    error: 'CircleClose',
    warning: 'Warning',
    optional: 'InfoFilled',
    info: 'InfoFilled'
  }
  return map[props.status] || null
})
</script>
