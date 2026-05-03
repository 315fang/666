import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import {
  getAdminOrderLogistics,
  refreshAdminLogistics,
  getMiniProgramConfig,
  updateMiniProgramConfig
} from '@/api'
import { fmtDateTime } from '../utils/orderDisplay'

/**
 * 订单物流/小程序物流配置 composable。
 *
 * 抽离自原 `orders/index.vue` 中约 170 行的物流相关逻辑：
 *   - 小程序 logistics_config 读取与快照（logistics_mode / tracking_no_required /
 *     company_name_required / shipping_company_options）
 *   - 物流抽屉状态（logisticsVisible/Loading/Order/Data）
 *   - 本地常用快递公司缓存（localStorage + dedupe + persist）
 *   - 物流轨迹加载与抽屉刷新（loadLogistics / openLogisticsDrawer / refreshLogisticsDrawer）
 *   - 手动发货模式下的模拟轨迹（buildManualLogistics）
 *   - 行级物流快照同步（syncOrderLogistics）——把最新 traces 写回 tableData / detailData
 *
 * 依赖注入：
 *   - canManageSettings: ComputedRef<boolean>，用于判定是否请求 mini-program 配置
 *   - tableData: Ref<any[]>，来自 useOrderList，syncOrderLogistics 会回写 _logistics
 *   - detailData: Ref<any>，来自 useOrderDetail，syncOrderLogistics 同样会回写 _logistics
 *
 * 暴露给 useOrderMutations 的发货子流程的：
 *   - logisticsMode / logisticsTrackingRequired / logisticsCompanyRequired
 *   - shippingCompanyOptions（El-Autocomplete 选项源）
 *   - normalizeShippingCompanyName / rememberShippingCompanyOption
 */

const SHIPPING_COMPANY_STORAGE_KEY = 'admin_shipping_company_options'
const DEFAULT_SHIPPING_COMPANY_OPTIONS = [
  '顺丰速运',
  '申通快递',
  '中通快递',
  '圆通速递',
  '韵达速递',
  '京东快递',
  '邮政EMS',
  '极兔速递',
  '德邦快递',
  '同城配送'
]

function normalizeShippingCompanyName(value) {
  return String(value || '').trim()
}

function dedupeStringList(list = []) {
  return [...new Set(
    list
      .map((item) => normalizeShippingCompanyName(item))
      .filter(Boolean)
  )]
}

function mergeShippingCompanyOptions(...groups) {
  return dedupeStringList(groups.flat())
}

function readLocalShippingCompanyOptions() {
  if (typeof window === 'undefined') return []
  try {
    const raw = JSON.parse(localStorage.getItem(SHIPPING_COMPANY_STORAGE_KEY) || '[]')
    return Array.isArray(raw) ? dedupeStringList(raw) : []
  } catch (_) {
    return []
  }
}

function persistLocalShippingCompanyOptions(list) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(SHIPPING_COMPANY_STORAGE_KEY, JSON.stringify(dedupeStringList(list)))
  } catch (_) {
    // 本地缓存写入失败忽略，不要打扰用户；主流程仍能继续。
  }
}

export function useOrderLogistics({ canManageSettings, tableData, detailData }) {
  const logisticsMode = ref('third_party')
  const logisticsTrackingRequired = ref(true)
  const logisticsCompanyRequired = ref(false)
  const miniProgramConfigSnapshot = ref(null)
  const logisticsVisible = ref(false)
  const logisticsLoading = ref(false)
  const logisticsOrder = ref(null)
  const logisticsData = ref(null)
  const shippingCompanyOptions = ref(
    mergeShippingCompanyOptions(DEFAULT_SHIPPING_COMPANY_OPTIONS, readLocalShippingCompanyOptions())
  )

  const fetchMiniProgramConfig = async () => {
    if (!canManageSettings.value) {
      miniProgramConfigSnapshot.value = null
      logisticsMode.value = 'third_party'
      logisticsTrackingRequired.value = true
      logisticsCompanyRequired.value = false
      shippingCompanyOptions.value = mergeShippingCompanyOptions(
        DEFAULT_SHIPPING_COMPANY_OPTIONS,
        [],
        readLocalShippingCompanyOptions()
      )
      return
    }
    try {
      const data = await getMiniProgramConfig({ skipErrorMessage: true })
      miniProgramConfigSnapshot.value = data || null
      logisticsMode.value = data?.logistics_config?.shipping_mode || 'third_party'
      logisticsTrackingRequired.value = data?.logistics_config?.shipping_tracking_no_required !== false
      logisticsCompanyRequired.value = !!data?.logistics_config?.shipping_company_name_required
      shippingCompanyOptions.value = mergeShippingCompanyOptions(
        DEFAULT_SHIPPING_COMPANY_OPTIONS,
        data?.logistics_config?.shipping_company_options || [],
        readLocalShippingCompanyOptions()
      )
      persistLocalShippingCompanyOptions(shippingCompanyOptions.value)
    } catch (e) {
      console.error('获取小程序物流配置失败:', e)
    }
  }

  const rememberShippingCompanyOption = async (value) => {
    const companyName = normalizeShippingCompanyName(value)
    if (!companyName) return

    const nextOptions = mergeShippingCompanyOptions(
      shippingCompanyOptions.value,
      [companyName]
    )
    shippingCompanyOptions.value = nextOptions
    persistLocalShippingCompanyOptions(nextOptions)

    if (!canManageSettings.value || !miniProgramConfigSnapshot.value) return

    const remoteOptions = dedupeStringList(
      miniProgramConfigSnapshot.value?.logistics_config?.shipping_company_options || []
    )
    if (remoteOptions.includes(companyName)) return

    const nextConfig = JSON.parse(JSON.stringify(miniProgramConfigSnapshot.value))
    nextConfig.logistics_config = {
      ...(nextConfig.logistics_config || {}),
      shipping_company_options: mergeShippingCompanyOptions(remoteOptions, [companyName])
    }

    try {
      await updateMiniProgramConfig(nextConfig)
      miniProgramConfigSnapshot.value = nextConfig
    } catch (error) {
      console.error('保存常用快递公司失败:', error)
      ElMessage.warning('快递公司已在当前浏览器记住，未能同步到共享配置')
    }
  }

  function buildManualLogistics(order = {}) {
    return {
      status: 'manual',
      statusText: '手工发货',
      traces: order?.shipped_at
        ? [{ time: fmtDateTime(order.shipped_at), desc: '当前订单走手工发货模式，可查看单号和发货时间' }]
        : []
    }
  }

  function syncOrderLogistics(orderId, nextData) {
    const normalizedId = String(orderId || '')
    if (!normalizedId) return
    const target = tableData.value.find((row) => String(row.id) === normalizedId || String(row.order_no) === normalizedId)
    if (target) target._logistics = nextData
    if (detailData.value && (String(detailData.value.id) === normalizedId || String(detailData.value.order_no) === normalizedId)) {
      detailData.value._logistics = nextData
    }
  }

  async function loadLogistics(order, forceRefresh = false) {
    logisticsLoading.value = true
    try {
      if (logisticsMode.value === 'manual') {
        const manual = buildManualLogistics(order)
        logisticsData.value = manual
        syncOrderLogistics(order?.id || order?.order_no, manual)
        return
      }
      const res = forceRefresh
        ? await refreshAdminLogistics(order.id)
        : await getAdminOrderLogistics(order.id)
      const data = res?.data || res || null
      logisticsData.value = data
      syncOrderLogistics(order?.id || order?.order_no, data)
    } catch (error) {
      console.error('加载物流轨迹失败:', error)
      if (!error?.__handledByRequest) {
        ElMessage.error(error?.message || '物流查询失败')
      }
    } finally {
      logisticsLoading.value = false
    }
  }

  async function openLogisticsDrawer(order) {
    logisticsOrder.value = order
    logisticsData.value = order?._logistics || null
    logisticsVisible.value = true
    await loadLogistics(order, false)
  }

  async function refreshLogisticsDrawer() {
    if (!logisticsOrder.value) return
    await loadLogistics(logisticsOrder.value, true)
  }

  return {
    logisticsMode,
    logisticsTrackingRequired,
    logisticsCompanyRequired,
    logisticsVisible,
    logisticsLoading,
    logisticsOrder,
    logisticsData,
    shippingCompanyOptions,
    normalizeShippingCompanyName,
    fetchMiniProgramConfig,
    rememberShippingCompanyOption,
    openLogisticsDrawer,
    refreshLogisticsDrawer
  }
}
