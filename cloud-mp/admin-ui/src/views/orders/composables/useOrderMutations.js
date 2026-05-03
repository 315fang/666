import { ref, reactive, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  shipOrder,
  adjustOrderAmount,
  addOrderRemark,
  updateOrderTestFlag,
  updateOrderVisibility,
  repairOrderFulfillment,
  forceCompleteOrder,
  forceCancelOrder
} from '@/api'
import { extractReadAt, mergeStrongSuccessMessage } from '@/api/consistency'
import {
  money, moneyNumber, normalizeAmount,
  normalizeFulfillmentType,
  normalizeOrderDisplay,
  cleanupCategoryText, inferOrderCleanupCategory
} from '../utils/orderDisplay'

/**
 * 订单操作（发货 / 改价 / 备注 / 履约修复 / 强制完成/取消 / 测试标记 / 清理箱可见性）
 * composable。
 *
 * 抽离自原 `orders/index.vue` 约 270 行的操作相关逻辑。所有 mutation 共享
 * `currentOrder` + `runOrderMutation` 以保证一致的：
 *   1) busy-ref 设置/清理
 *   2) 成功后 extractReadAt 回写 lastSyncedAt
 *   3) 成功提示走 mergeStrongSuccessMessage（强/弱一致性感知）
 *   4) onSuccess 钩子用于关闭弹窗或写回 detailData
 *   5) 自动 refreshOrders() 刷新列表
 *
 * 依赖注入（都由 parent 从其他 composable 拿到后传入）：
 *   - refreshOrders / lastSyncedAt:        来自 useOrderList
 *   - detailVisible / detailData / handleDetail:
 *                                          来自 useOrderDetail
 *   - logisticsMode / logisticsTrackingRequired / logisticsCompanyRequired /
 *     normalizeShippingCompanyName / rememberShippingCompanyOption:
 *                                          来自 useOrderLogistics（submitShip 用）
 *
 * 暴露给 template / OrderMutationDialogs 子组件的：
 *   - 5 个弹窗可见性（ship/amount/remark/visibility/force）+ 对应的 5 个 submitting 标志
 *   - 5 个表单对象（shipForm/amountForm/visibilityForm/forceForm/remarkText）
 *   - currentOrder / forceType / shipFulfillmentLabel
 *   - 2 个顶层触发器：handleShip / handleDropdown
 *     （其余的 handleAmount/handleRemarkItem/handleTestFlag/handleOrderVisibility/
 *      handleRepairFulfillment/handleForce 都由 handleDropdown 内部分发，
 *      不需要暴露给 template）
 *   - 5 个 submit 函数
 */
export function useOrderMutations({
  refreshOrders,
  lastSyncedAt,
  detailVisible,
  detailData,
  handleDetail,
  logisticsMode,
  logisticsTrackingRequired,
  logisticsCompanyRequired,
  normalizeShippingCompanyName,
  rememberShippingCompanyOption
}) {
  // ----- 通用 -----
  const currentOrder = ref(null)
  const submittingShip = ref(false)
  const submittingAmount = ref(false)
  const submittingRemark = ref(false)
  const submittingForce = ref(false)
  const submittingTestFlag = ref(false)
  const submittingVisibility = ref(false)
  const submittingRepair = ref(false)

  const runOrderMutation = async (loadingRef, task, successMessage, onSuccess) => {
    loadingRef.value = true
    try {
      const result = await task()
      const readAt = extractReadAt(result)
      if (readAt) lastSyncedAt.value = readAt
      const finalMessage = typeof successMessage === 'function' ? successMessage(result) : successMessage
      ElMessage.success(mergeStrongSuccessMessage(result, finalMessage))
      if (typeof onSuccess === 'function') {
        await onSuccess(result)
      }
      await refreshOrders()
      return result
    } catch (e) {
      if (!e?.__handledByRequest) {
        ElMessage.error(e?.message || '操作失败')
      }
    } finally {
      loadingRef.value = false
    }
  }

  // ----- 发货 -----
  const shipDialogVisible = ref(false)
  const shipForm = reactive({ fulfillment_type: 'company', tracking_no: '', logistics_company: '' })

  const inferFulfillmentType = (row) => {
    const type = normalizeFulfillmentType(row)
    if (type === 'agent' || type === 'agent_pending') return 'agent'
    return 'company'
  }

  const shipFulfillmentLabel = computed(() => (
    shipForm.fulfillment_type === 'agent'
      ? '代理商履约'
      : (logisticsMode.value === 'manual' ? '平台手工发货' : '平台云仓发货')
  ))

  const handleShip = (row) => {
    currentOrder.value = row
    shipForm.fulfillment_type = inferFulfillmentType(row)
    shipForm.tracking_no = String(row?.tracking_no || '').trim()
    shipForm.logistics_company = normalizeShippingCompanyName(row?.logistics_company)
    shipDialogVisible.value = true
  }

  const submitShip = async () => {
    const trackingNo = String(shipForm.tracking_no || '').trim()
    const logisticsCompany = normalizeShippingCompanyName(shipForm.logistics_company)

    if (logisticsTrackingRequired.value && !trackingNo) {
      return ElMessage.warning('请输入物流单号')
    }
    if (logisticsCompanyRequired.value && !logisticsCompany) {
      return ElMessage.warning('请输入承运方名称')
    }
    await runOrderMutation(submittingShip, () => shipOrder(currentOrder.value.id, {
        ...shipForm,
        tracking_no: trackingNo,
        logistics_company: logisticsCompany,
        type: shipForm.fulfillment_type === 'agent' ? 'Agent' : 'Company',
        fulfillment_type: shipForm.fulfillment_type
      }, currentOrder.value.order_no), (result) => {
        if (result?.fulfillment_fallback) {
          return result.fulfillment_notice || '代理货款不足，已自动改为平台发货'
        }
        if (Number(result?.deducted_goods_fund_amount || 0) > 0) {
          return `发货成功，已扣代理货款 ¥${money(result.deducted_goods_fund_amount)}`
        }
        return '发货成功'
      }, async () => {
        shipDialogVisible.value = false
        await rememberShippingCompanyOption(logisticsCompany)
      })
  }

  // ----- 改价 -----
  const amountVisible = ref(false)
  const amountForm = reactive({ pay_amount: 0, reason: '' })

  const handleAmount = (row) => {
    currentOrder.value = row
    amountForm.pay_amount = moneyNumber(row.pay_amount)
    amountForm.reason = ''
    amountVisible.value = true
  }
  const submitAmount = async () => {
    if (!amountForm.reason.trim()) return ElMessage.warning('请填写调整原因')
    await runOrderMutation(
      submittingAmount,
      () => adjustOrderAmount(currentOrder.value.id, { pay_amount: normalizeAmount(amountForm.pay_amount), reason: amountForm.reason }),
      '金额修改成功',
      () => { amountVisible.value = false }
    )
  }

  // ----- 备注 -----
  const remarkVisible = ref(false)
  const remarkText = ref('')

  const handleRemarkItem = (row) => {
    currentOrder.value = row
    remarkText.value = ''
    remarkVisible.value = true
  }
  const submitRemark = async () => {
    if (!remarkText.value.trim()) return ElMessage.warning('请填写备注')
    await runOrderMutation(
      submittingRemark,
      () => addOrderRemark(currentOrder.value.id, { remark: remarkText.value }),
      '备注添加成功',
      () => { remarkVisible.value = false }
    )
  }

  // ----- 履约修复 -----
  // 不开弹窗，直接对点击行触发；成功后如果详情抽屉当前正是该行，同步刷新详情。
  const handleRepairFulfillment = async (row) => {
    currentOrder.value = row
    await runOrderMutation(
      submittingRepair,
      () => repairOrderFulfillment(row.id),
      '履约链修复成功',
      async () => {
        if (detailVisible.value && currentOrder.value) {
          await handleDetail(currentOrder.value)
        }
      }
    )
  }

  // ----- 强制操作 -----
  const forceVisible = ref(false)
  const forceType = ref('') // 'complete' | 'cancel'
  const forceForm = reactive({ reason: '' })

  const handleForce = (row, type) => {
    currentOrder.value = row
    forceType.value = type
    forceForm.reason = ''
    forceVisible.value = true
  }
  const submitForce = async () => {
    if (!forceForm.reason.trim()) return ElMessage.warning('必填原因')
    const action = forceType.value === 'complete'
      ? () => forceCompleteOrder(currentOrder.value.id, forceForm)
      : () => forceCancelOrder(currentOrder.value.id, forceForm)
    const message = forceType.value === 'complete' ? '订单已强制完成' : '订单已强制取消并退款'
    await runOrderMutation(submittingForce, action, message, () => { forceVisible.value = false })
  }

  // ----- 测试订单标记 -----
  const handleTestFlag = async (row) => {
    const nextFlag = !row.is_test_order
    try {
      await ElMessageBox.confirm(
        nextFlag
          ? `确认将订单「${row.order_no}」标记为测试订单？标记后将默认从业务统计和常规列表中排除。`
          : `确认取消订单「${row.order_no}」的测试订单标记？`,
        nextFlag ? '标记测试订单' : '取消测试订单标记',
        { type: 'warning' }
      )
    } catch (e) {
      if (e !== 'cancel') ElMessage.error(e?.message || '已取消')
      return
    }

    await runOrderMutation(
      submittingTestFlag,
      () => updateOrderTestFlag(row.id, {
        is_test_order: nextFlag,
        reason: nextFlag ? '管理员标记测试订单' : '管理员取消测试订单标记'
      }),
      nextFlag ? '订单已标记为测试订单' : '测试订单标记已取消',
      (result) => {
        if (detailVisible.value && currentOrder.value && String(currentOrder.value.id) === String(row.id)) {
          detailData.value = normalizeOrderDisplay(result?.data || result)
        }
      }
    )
  }

  // ----- 清理箱（可见性） -----
  const visibilityVisible = ref(false)
  const visibilityTarget = ref(null)
  const visibilityForm = reactive({
    visibility: 'hidden',
    cleanup_category: 'manual_cleanup',
    reason: ''
  })

  const handleOrderVisibility = (row) => {
    const hidden = row.order_visibility === 'hidden'
    visibilityTarget.value = row
    visibilityForm.visibility = hidden ? 'visible' : 'hidden'
    visibilityForm.cleanup_category = hidden ? (row.cleanup_category || 'manual_cleanup') : inferOrderCleanupCategory(row)
    visibilityForm.reason = hidden ? '管理员恢复显示' : `管理员移入清理箱：${cleanupCategoryText(visibilityForm.cleanup_category)}`
    visibilityVisible.value = true
  }

  const submitOrderVisibility = async () => {
    if (!visibilityTarget.value) return
    if (!visibilityForm.reason.trim()) return ElMessage.warning('请填写操作原因')
    await runOrderMutation(
      submittingVisibility,
      () => updateOrderVisibility(visibilityTarget.value.id, {
        visibility: visibilityForm.visibility,
        cleanup_category: visibilityForm.cleanup_category,
        reason: visibilityForm.reason.trim()
      }),
      visibilityForm.visibility === 'hidden' ? '订单已移入清理箱' : '订单已恢复显示',
      (result) => {
        visibilityVisible.value = false
        if (detailVisible.value && visibilityTarget.value && detailData.value && String(detailData.value.id) === String(visibilityTarget.value.id)) {
          detailData.value = normalizeOrderDisplay(result?.data || result)
        }
      }
    )
  }

  // ----- 下拉指令分发 -----
  const handleDropdown = (cmd, row) => {
    if (cmd === 'amount') handleAmount(row)
    else if (cmd === 'remark') handleRemarkItem(row)
    else if (cmd === 'test_flag') handleTestFlag(row)
    else if (cmd === 'visibility') handleOrderVisibility(row)
    else if (cmd === 'repair_fulfillment') handleRepairFulfillment(row)
    else if (cmd === 'force_complete') handleForce(row, 'complete')
    else if (cmd === 'force_cancel') handleForce(row, 'cancel')
  }

  return {
    currentOrder,
    shipDialogVisible,
    shipForm,
    shipFulfillmentLabel,
    submittingShip,
    handleShip,
    submitShip,
    amountVisible,
    amountForm,
    submittingAmount,
    submitAmount,
    remarkVisible,
    remarkText,
    submittingRemark,
    submitRemark,
    forceVisible,
    forceType,
    forceForm,
    submittingForce,
    submitForce,
    visibilityVisible,
    visibilityForm,
    submittingVisibility,
    submitOrderVisibility,
    handleDropdown
  }
}
