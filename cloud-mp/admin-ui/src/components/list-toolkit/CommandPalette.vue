<template>
  <el-dialog
    :model-value="visible"
    @update:model-value="(v) => emit('update:visible', v)"
    width="600px"
    :show-close="false"
    align-center
    destroy-on-close
    class="command-palette-dialog"
    @opened="onOpened"
    @closed="onClosed"
  >
    <div class="command-palette" @keydown.esc.stop.prevent="emit('update:visible', false)">
      <el-input
        ref="inputRef"
        v-model="keyword"
        size="large"
        placeholder="搜菜单 / 跳页面 / Enter 直接打开"
        :prefix-icon="Search"
        @keydown.enter.prevent="executeSelected"
        @keydown.up.prevent="moveSelection(-1)"
        @keydown.down.prevent="moveSelection(1)"
      />

      <div class="command-palette__list">
        <div
          v-for="(item, idx) in filteredItems"
          :key="`${item.kind}-${item.key}`"
          :class="['command-item', { 'is-active': idx === selectedIdx }]"
          @click="execute(item)"
          @mouseenter="selectedIdx = idx"
        >
          <el-icon v-if="item.icon" class="command-item__icon"><component :is="item.icon" /></el-icon>
          <span v-else class="command-item__icon command-item__icon--placeholder">·</span>
          <span class="command-item__label">{{ item.label }}</span>
          <span class="command-item__hint">{{ item.hint || '' }}</span>
        </div>
        <el-empty v-if="!filteredItems.length" description="无匹配结果" :image-size="56" />
      </div>

      <div class="command-palette__footer">
        <span><kbd>↑</kbd><kbd>↓</kbd> 选择</span>
        <span><kbd>Enter</kbd> 打开</span>
        <span><kbd>Esc</kbd> 关闭</span>
      </div>
    </div>
  </el-dialog>
</template>

<script setup>
/**
 * CommandPalette —— 全局快捷搜索面板（Ctrl+K / Cmd+K）。
 *
 * 对应 2026-05-03 实用性体检 #9：常用导航全靠点，没有快捷搜索。
 *
 * 使用：
 *   1. 在 layout/index.vue（或全局某处）挂载：
 *      <CommandPalette v-model:visible="paletteVisible" />
 *
 *   2. 注册全局快捷键：
 *      onMounted(() => window.addEventListener('keydown', onKey))
 *      onUnmounted(() => window.removeEventListener('keydown', onKey))
 *      function onKey(e) {
 *        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
 *          e.preventDefault()
 *          paletteVisible.value = true
 *        }
 *      }
 *
 * 当前能力：fuzzy 搜可见的菜单项 + 跳转。后续可扩展 quick action（如"跳到第 X 个订单"）。
 */
import { ref, computed, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { Search } from '@element-plus/icons-vue'
import { useUserStore } from '@/store/user'
import { buildAdminNavigationTree } from '@/config/adminNavigation'

const props = defineProps({
  visible: { type: Boolean, default: false }
})
const emit = defineEmits(['update:visible'])

const router = useRouter()
const userStore = useUserStore()

const keyword = ref('')
const selectedIdx = ref(0)
const inputRef = ref(null)

const navItems = computed(() => {
  const tree = buildAdminNavigationTree(
    router.options.routes,
    (perm) => userStore.hasPermission(perm)
  )
  const out = []
  tree.forEach((group) => {
    group.sections.forEach((section) => {
      section.items.forEach((item) => {
        out.push({
          kind: 'route',
          key: item.path,
          label: item.title,
          hint: `${group.name} · ${section.name}`,
          icon: item.icon,
          run: () => router.push(item.path)
        })
      })
    })
  })
  return out
})

const filteredItems = computed(() => {
  const k = keyword.value.trim().toLowerCase()
  if (!k) return navItems.value.slice(0, 8)
  return navItems.value
    .filter((item) =>
      (item.label || '').toLowerCase().includes(k) ||
      (item.hint || '').toLowerCase().includes(k)
    )
    .slice(0, 12)
})

function moveSelection(delta) {
  const len = filteredItems.value.length
  if (!len) return
  selectedIdx.value = (selectedIdx.value + delta + len) % len
}

function executeSelected() {
  const item = filteredItems.value[selectedIdx.value]
  if (item) execute(item)
}

function execute(item) {
  if (typeof item.run === 'function') item.run()
  emit('update:visible', false)
}

function onOpened() {
  selectedIdx.value = 0
  nextTick(() => {
    inputRef.value?.focus?.()
  })
}

function onClosed() {
  keyword.value = ''
  selectedIdx.value = 0
}
</script>

<style scoped>
.command-palette {
  padding: 4px 0;
}
.command-palette__list {
  margin-top: 12px;
  max-height: 360px;
  overflow-y: auto;
}
.command-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.12s ease;
}
.command-item.is-active {
  background: #f0f7ff;
}
.command-item__icon {
  font-size: 16px;
  color: #909399;
  width: 20px;
  display: inline-flex;
  justify-content: center;
}
.command-item__icon--placeholder {
  color: #c0c4cc;
}
.command-item__label {
  flex: 1;
  font-size: 14px;
  color: #303133;
}
.command-item__hint {
  font-size: 12px;
  color: #909399;
}
.command-palette__footer {
  display: flex;
  gap: 16px;
  padding: 10px 12px 4px;
  font-size: 12px;
  color: #909399;
  border-top: 1px solid #ebeef5;
  margin-top: 8px;
}
.command-palette__footer kbd {
  display: inline-block;
  padding: 1px 6px;
  margin-right: 4px;
  border: 1px solid #dcdfe6;
  border-radius: 3px;
  background: #fafbfc;
  font-family: inherit;
  font-size: 11px;
  color: #606266;
}
.command-palette-dialog :deep(.el-dialog__header) {
  display: none;
}
.command-palette-dialog :deep(.el-dialog__body) {
  padding: 16px 20px 12px;
}
</style>
