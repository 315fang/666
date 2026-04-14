import request from '@/utils/request'

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
    params
  })
}

export const getOrderDetail = (id) => {
  return request({
    url: `/orders/${id}`,
    method: 'get'
  })
}

export const shipOrder = (id, data, fallbackId) =>
  withOrderLookupFallback(
    (targetId) => request({
      url: `/orders/${targetId}/ship`,
      method: 'put',
      data
    }),
    id,
    fallbackId
  )

export const adjustOrderAmount = (id, data) => {
  return request({
    url: `/orders/${id}/amount`,
    method: 'put',
    data
  })
}

export const addOrderRemark = (id, data) => {
  return request({
    url: `/orders/${id}/remark`,
    method: 'put',
    data
  })
}

export const repairOrderFulfillment = (id) => {
  return request({
    url: `/orders/${id}/repair-fulfillment`,
    method: 'put'
  })
}

export const forceCompleteOrder = (id, data) => {
  return request({
    url: `/orders/${id}/force-complete`,
    method: 'put',
    data
  })
}

export const forceCancelOrder = (id, data) => {
  return request({
    url: `/orders/${id}/force-cancel`,
    method: 'put',
    data
  })
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
