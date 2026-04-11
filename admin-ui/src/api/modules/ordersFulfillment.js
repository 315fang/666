import request from '@/utils/request'
import { normalizeItemResult, normalizeListResult } from '@/api/normalize'

const resolveOrderId = (idOrRow) => {
  if (idOrRow && typeof idOrRow === 'object') {
    return idOrRow.id ?? idOrRow._id
  }
  return idOrRow
}

export const getOrders = (params) => {
  return request({
    url: '/orders',
    method: 'get',
    params
  }).then(normalizeListResult)
}

export const getOrderDetail = (id) => {
  const orderId = resolveOrderId(id)
  return request({
    url: `/orders/${orderId}`,
    method: 'get'
  }).then(normalizeItemResult)
}

export const shipOrder = (id, data) => {
  const orderId = resolveOrderId(id)
  return request({
    url: `/orders/${orderId}/ship`,
    method: 'put',
    data
  })
}

export const updateShippingInfo = (id, data) => {
  const orderId = resolveOrderId(id)
  return request({
    url: `/orders/${orderId}/shipping-info`,
    method: 'put',
    data
  })
}

export const adjustOrderAmount = (id, data) => {
  const orderId = resolveOrderId(id)
  return request({
    url: `/orders/${orderId}/amount`,
    method: 'put',
    data
  })
}

export const addOrderRemark = (id, data) => {
  const orderId = resolveOrderId(id)
  return request({
    url: `/orders/${orderId}/remark`,
    method: 'put',
    data
  })
}

export const forceCompleteOrder = (id, data) => {
  const orderId = resolveOrderId(id)
  return request({
    url: `/orders/${orderId}/force-complete`,
    method: 'put',
    data
  })
}

export const forceCancelOrder = (id, data) => {
  const orderId = resolveOrderId(id)
  return request({
    url: `/orders/${orderId}/force-cancel`,
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

export const batchShipOrders = (data) => request({ url: '/orders/batch-ship', method: 'post', data })

export const getAdminOrderLogistics = (orderId, forceRefresh = false) =>
  request({ url: `/logistics/order/${orderId}${forceRefresh ? '?refresh=1' : ''}`, method: 'get' }).then(normalizeItemResult)

export const refreshAdminLogistics = (orderId) =>
  request({ url: `/logistics/order/${orderId}?refresh=1`, method: 'get' }).then(normalizeItemResult)
