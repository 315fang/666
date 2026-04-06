import request from '@/utils/request'

export const getDashboardOverview = () => {
  return request({
    url: '/statistics/overview',
    method: 'get'
  })
}

export const getDashboardNotifications = () => {
  return request({
    url: '/dashboard/notifications',
    method: 'get'
  })
}

export const getSalesTrend = (params) => {
  return request({
    url: '/statistics/sales-trend',
    method: 'get',
    params
  })
}

export const getProductRanking = (params) => {
  return request({
    url: '/statistics/product-ranking',
    method: 'get',
    params
  })
}

export const getUserTrend = (params) => request({ url: '/statistics/user-trend', method: 'get', params })
export const getLowStock = (params) => request({ url: '/statistics/low-stock', method: 'get', params })
export const getAgentRanking = (params) => request({ url: '/statistics/agent-ranking', method: 'get', params })
export const getDistributionReport = (params) => request({ url: '/statistics/distribution-report', method: 'get', params })
