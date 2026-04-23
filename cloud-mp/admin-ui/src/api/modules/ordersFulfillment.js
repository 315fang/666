import request from '@/utils/request'
import { normalizeStrongMutationPayload, withStrongReadParams } from '@/api/consistency'

async function withOrderLookupFallback(executor, primaryId, fallbackId) {
  try {
    return await executor(primaryId)
  } catch (error) {
    const shouldRetryByOrderNo =
      error?.response?.status === 404 &&
      error?.response?.data?.message === '订单不存在' &&
      fallbackId != null &&
      String(fallbackId) !== String(primaryId)

    if (!shouldRetryByOrderNo) throw error
    return executor(fallbackId)
  }
}

export const getOrders = (params) => {
  return request({
    url: '/orders',
    method: 'get',
    params: withStrongReadParams(params)
  })
}

export const getOrderDetail = (id) => {
  return request({
    url: `/orders/${id}`,
    method: 'get',
    params: withStrongReadParams()
  })
}

export const shipOrder = (id, data, fallbackId) =>
  withOrderLookupFallback(
    (targetId) => request({
      url: `/orders/${targetId}/ship`,
      method: 'put',
      data
    }).then(normalizeStrongMutationPayload),
    id,
    fallbackId
  )

export const adjustOrderAmount = (id, data) => {
  return request({
    url: `/orders/${id}/amount`,
    method: 'put',
    data
  }).then(normalizeStrongMutationPayload)
}

export const addOrderRemark = (id, data) => {
  return request({
    url: `/orders/${id}/remark`,
    method: 'put',
    data
  }).then(normalizeStrongMutationPayload)
}

export const updateOrderTestFlag = (id, data) => {
  return request({
    url: `/orders/${id}/test-flag`,
    method: 'put',
    data
  }).then(normalizeStrongMutationPayload)
}

export const updateOrderVisibility = (id, data) => {
  return request({
    url: `/orders/${id}/visibility`,
    method: 'put',
    data
  }).then(normalizeStrongMutationPayload)
}

export const repairOrderFulfillment = (id) => {
  return request({
    url: `/orders/${id}/repair-fulfillment`,
    method: 'put'
  }).then(normalizeStrongMutationPayload)
}

export const forceCompleteOrder = (id, data) => {
  return request({
    url: `/orders/${id}/force-complete`,
    method: 'put',
    data
  }).then(normalizeStrongMutationPayload)
}

export const forceCancelOrder = (id, data) => {
  return request({
    url: `/orders/${id}/force-cancel`,
    method: 'put',
    data
  }).then(normalizeStrongMutationPayload)
}

export const exportOrders = (params) => {
  return request({
    url: '/orders/export',
    method: 'get',
    params,
    responseType: 'blob'
  })
}

export const getAdminOrderLogistics = (orderId, forceRefresh = false) =>
  request({ url: `/logistics/order/${orderId}${forceRefresh ? '?refresh=1' : ''}`, method: 'get' })

export const refreshAdminLogistics = (orderId) =>
  request({ url: `/logistics/order/${orderId}?refresh=1`, method: 'get' })
