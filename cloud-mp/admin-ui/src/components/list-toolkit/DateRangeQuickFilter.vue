<template>
  <div class="date-range-quick-filter">
    <el-radio-group
      v-model="model.activeQuick"
      size="small"
      class="date-range-quick-filter__quick"
      @change="onQuickChange"
    >
      <el-radio-button
        v-for="q in quickRanges"
        :key="q.key"
        :label="q.key"
      >{{ q.label }}</el-radio-button>
    </el-radio-group>
    <el-date-picker
      v-model="model.dateRange"
      type="daterange"
      size="default"
      range-separator="至"
      :start-placeholder="startPlaceholder"
      :end-placeholder="endPlaceholder"
      value-format="YYYY-MM-DD"
      :clearable="true"
      class="date-range-quick-filter__picker"
      @change="onCustomChange"
    />
    <el-button v-if="showClear && (model.dateRange || model.activeQuick)" link @click="onClear">清除</el-button>
  </div>
</template>

<script setup>
/**
 * DateRangeQuickFilter
 *
 * 配套 useDateRangeFilter() 使用：
 *   const dateFilter = useDateRangeFilter()
 *   <DateRangeQuickFilter v-model="dateFilter" @change="handleSearch" />
 *
 * v-model 必须是 useDateRangeFilter() 的返回对象（包含 dateRange/activeQuick/setQuickRange/...）
 *
 * 任何变化都会 emit('change', dateRange) —— 调用方在搜索表单里通常希望立即触发查询。
 */
import { computed } from 'vue'
import { QUICK_RANGES, resolveQuickRange } from '@/composables/useDateRangeFilter'

const props = defineProps({
  modelValue: { type: Object, required: true },
  startPlaceholder: { type: String, default: '开始日期' },
  endPlaceholder: { type: String, default: '结束日期' },
  showClear: { type: Boolean, default: true },
  ranges: { type: Array, default: null }
})

const emit = defineEmits(['change'])

const model = computed(() => props.modelValue)
const quickRanges = computed(() => Array.isArray(props.ranges) && props.ranges.length ? props.ranges : QUICK_RANGES)

function onQuickChange(key) {
  const range = resolveQuickRange(key)
  if (range) {
    model.value.dateRange = range
    model.value.activeQuick = key
    emit('change', range)
  }
}

function onCustomChange(value) {
  model.value.activeQuick = null
  emit('change', value)
}

function onClear() {
  model.value.dateRange = null
  model.value.activeQuick = null
  emit('change', null)
}
</script>

<style scoped>
.date-range-quick-filter {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.date-range-quick-filter__picker {
  width: 280px;
}
</style>
