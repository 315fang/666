// admin-ui/src/composables/useBatchSelection.js
//
// 列表页"批量选中"的统一状态机。
// 对应 2026-05-03 实用性体检 #1：products / refunds / withdrawals / orders 都缺批量操作。
//
// 用法：
//   import { useBatchSelection } from '@/composables/useBatchSelection'
//
//   const batch = useBatchSelection()
//
//   // template:
//   <el-table :data="rows" @selection-change="batch.onSelectionChange" :row-key="r => r.id">
//     <el-table-column type="selection" width="44" />
//     ...
//   </el-table>
//
//   <BatchActionBar
//     :count="batch.count.value"
//     :actions="[
//       { label: '批量上架', onClick: () => doBatch('activate', batch.selectedIds.value) },
//       { label: '批量下架', onClick: () => doBatch('archive',  batch.selectedIds.value), danger: true }
//     ]"
//     @clear="batch.clear()"
//   />

import { ref, computed } from 'vue'

/**
 * @param {object} opts
 * @param {string} opts.rowKey  主键字段名，默认 'id'
 *
 * @returns {{
 *   selectedRows: Ref<object[]>,
 *   selectedIds:  ComputedRef<(string|number)[]>,
 *   hasSelection: ComputedRef<boolean>,
 *   count:        ComputedRef<number>,
 *   onSelectionChange: (rows: object[]) => void,
 *   clear: () => void,
 *   isSelected: (row: object) => boolean
 * }}
 */
export function useBatchSelection({ rowKey = 'id' } = {}) {
    const selectedRows = ref([])

    const selectedIds = computed(() => selectedRows.value.map((r) => r[rowKey]))
    const hasSelection = computed(() => selectedRows.value.length > 0)
    const count = computed(() => selectedRows.value.length)

    const onSelectionChange = (rows) => {
        selectedRows.value = Array.isArray(rows) ? rows : []
    }

    const clear = () => { selectedRows.value = [] }

    const isSelected = (row) => {
        if (!row) return false
        const k = row[rowKey]
        return selectedRows.value.some((r) => r[rowKey] === k)
    }

    return { selectedRows, selectedIds, hasSelection, count, onSelectionChange, clear, isSelected }
}
