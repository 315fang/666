import request from '@/utils/request'

export const getDashboardOverview = () => {
  return request({
    url: '/statistics/overview',
    method: 'get'
  })
}
