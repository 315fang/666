import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { getOrderDetail } from '@/api'
import { detailSkuText, money, normalizeOrderDisplay } from '../utils/orderDisplay'

/**
 * 订单详情抽屉 composable。
 *
 * 抽离自原 `orders/index.vue` 中约 60 行的详情相关逻辑：
 *   - detailVisible / detailData 抽屉状态
 *   - detailLineItems 计算（单行订单兜底 + 多行 items 展平）
 *   - handleDetail 拉取详情（并做 address_snapshot 兜底 + normalizeOrderDisplay）
 *
 * 跨模块接入点：
 *   - detailVisible / detailData 会被 useOrderLogistics.syncOrderLogistics 读写
 *     （同一订单打开详情抽屉时，物流数据写回详情对象）
 *   - detailVisible / detailData 会被 useOrderMutations 的 handleTestFlag /
 *     submitOrderVisibility / handleRepairFulfillment 读写
 *     （mutation 成功后用最新结果刷新详情抽屉内的视图）
 *
 * 这里不暴露 deps：composable 自己独立持有 detail 状态，读写由消费方自行在
 * 拿到 refs 之后完成。
 */
export function useOrderDetail() {
  const detailVisible = ref(false)
  const detailData = ref(null)

  const detailLineItems = computed(() => {
    const o = detailData.value
    if (!o) return []
    const sourceItems = Array.isArray(o.items) && o.items.length
      ? o.items
      : [{
          snapshot_image: o.product?.images?.[0],
          snapshot_name: o.product?.name || '-',
          snapshot_spec: detailSkuText(o),
          qty: Number(o.qty || o.quantity || 1),
          item_amount: Number(o.total_amount || 0),
          unit_price: Number(o.total_amount || 0) / Math.max(1, Number(o.qty || o.quantity || 1))
        }]
    return sourceItems.map((item) => {
      const qty = Math.max(1, Number(item.qty || item.quantity || 1))
      const itemAmount = Number(item.item_amount ?? item.total_amount ?? item.price ?? 0)
      const unitPrice = Number(item.unit_price ?? (qty > 0 ? itemAmount / qty : itemAmount))
      return {
        image: item.snapshot_image || o.product?.images?.[0],
        name: item.snapshot_name || o.product?.name || '-',
        spec: item.snapshot_spec || detailSkuText(o),
        unitPrice: money(unitPrice),
        qty,
        lineTotal: money(itemAmount)
      }
    })
  })

  const handleDetail = async (row) => {
    try {
      const res = await getOrderDetail(row.id)
      detailData.value = normalizeOrderDisplay(res?.data || res)
      if (detailData.value?.address_snapshot && !detailData.value.address) {
        detailData.value.address = detailData.value.address_snapshot
      }
      detailVisible.value = true
    } catch (e) {
      console.error(e)
      if (!e?.__handledByRequest) {
        ElMessage.error(e?.message || '加载订单详情失败')
      }
    }
  }

  return {
    detailVisible,
    detailData,
    detailLineItems,
    handleDetail
  }
}
