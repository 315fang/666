import request from '@/utils/request'

export const getDashboardOverview = (options = {}) => {
  return request({
    url: '/statistics/overview',
    method: 'get',
    ...options
  })
}
