<template>
  <el-tooltip v-if="showTooltip" :content="fullText" placement="top">
    <span class="compact-id">{{ displayText }}</span>
  </el-tooltip>
  <span v-else class="compact-id">{{ displayText }}</span>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  value: {
    type: [String, Number],
    default: ''
  },
  fullValue: {
    type: [String, Number],
    default: ''
  },
  maxLength: {
    type: Number,
    default: 8
  }
})

const fullText = computed(() => {
  const value = props.fullValue !== '' && props.fullValue != null ? props.fullValue : props.value
  if (value == null || value === '') return '-'
  return String(value)
})

const displayText = computed(() => {
  const value = props.value != null && props.value !== '' ? props.value : fullText.value
  if (value == null || value === '') return '-'
  const text = String(value)
  return text.length > props.maxLength ? `${text.slice(0, props.maxLength)}…` : text
})

const showTooltip = computed(() => fullText.value !== displayText.value)
</script>

<style scoped>
.compact-id {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ui-monospace, monospace;
  font-size: 12px;
  color: #606266;
  vertical-align: middle;
}
</style>
