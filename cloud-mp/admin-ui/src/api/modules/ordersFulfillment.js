import request from '@/utils/request'

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

export const shipOrder = (id, data) => {
  return request({
    url: `/orders/${id}/ship`,
    method: 'put',
    data
  })
}

export const updateShippingInfo = (id, data) => {
  return request({
    url: `/orders/${id}/shipping-info`,
    method: 'put',
    data
  })
}

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

export const batchShipOrders = (data) => request({ url: '/orders/batch-ship', method: 'post', data })

export const getAdminOrderLogistics = (orderId, forceRefresh = false) =>
  request({ url: `/logistics/order/${orderId}${forceRefresh ? '?refresh=1' : ''}`, method: 'get' })

export const refreshAdminLogistics = (orderId) =>
  request({ url: `/logistics/order/${orderId}?refresh=1`, method: 'get' })
