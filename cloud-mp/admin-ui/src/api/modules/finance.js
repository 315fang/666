import request from '@/utils/request'

export const getWithdrawals = (params) => {
  return request({
    url: '/withdrawals',
    method: 'get',
    params
  })
}

export const approveWithdrawal = (id, data) => {
  return request({
    url: `/withdrawals/${id}/approve`,
    method: 'put',
    data
  })
}

export const rejectWithdrawal = (id, data) => {
  return request({
    url: `/withdrawals/${id}/reject`,
    method: 'put',
    data
  })
}

export const completeWithdrawal = (id, data) => {
  return request({
    url: `/withdrawals/${id}/complete`,
    method: 'put',
    data
  })
}

export const getRefunds = (params) => {
  return request({
    url: '/refunds',
    method: 'get',
    params
  })
}

export const approveRefund = (id, data) => {
  return request({
    url: `/refunds/${id}/approve`,
    method: 'put',
    data
  })
}

export const rejectRefund = (id, data) => {
  return request({
    url: `/refunds/${id}/reject`,
    method: 'put',
    data
  })
}

export const completeRefund = (id) => {
  return request({
    url: `/refunds/${id}/complete`,
    method: 'put'
  })
}

export const getCommissions = (params) => request({ url: '/commissions', method: 'get', params })
export const approveCommissionItem = (id) => request({ url: `/commissions/${id}/approve`, method: 'put' })
export const rejectCommissionItem = (id, data) => request({ url: `/commissions/${id}/reject`, method: 'put', data })
export const batchApproveCommissions = (data) => request({ url: '/commissions/batch-approve', method: 'post', data })
export const batchRejectCommissions = (data) => request({ url: '/commissions/batch-reject', method: 'post', data })

export const getFinanceOverview = () => request({ url: '/finance/overview', method: 'get' })
export const getAgentPerformance = (params) => request({ url: '/finance/agent-performance', method: 'get', params })
export const getPoolContributions = () => request({ url: '/finance/pool-contributions', method: 'get' })
export const settleAgentDebt = (id, data) => request({ url: `/users/${id}/debt-settlement`, method: 'post', data })
