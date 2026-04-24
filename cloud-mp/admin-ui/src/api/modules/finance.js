import request from '@/utils/request'
import { normalizeStrongMutationPayload, withStrongReadParams } from '@/api/consistency'

export const getWithdrawals = (params) => {
  return request({
    url: '/withdrawals',
    method: 'get',
    params: withStrongReadParams(params)
  })
}

export const approveWithdrawal = (id, data) => {
  return request({
    url: `/withdrawals/${id}/approve`,
    method: 'put',
    data
  }).then(normalizeStrongMutationPayload)
}

export const rejectWithdrawal = (id, data) => {
  return request({
    url: `/withdrawals/${id}/reject`,
    method: 'put',
    data
  }).then(normalizeStrongMutationPayload)
}

export const completeWithdrawal = (id, data) => {
  return request({
    url: `/withdrawals/${id}/complete`,
    method: 'put',
    data
  }).then(normalizeStrongMutationPayload)
}

export const syncWithdrawal = (id) => {
  return request({
    url: `/withdrawals/${id}/sync`,
    method: 'put'
  }).then(normalizeStrongMutationPayload)
}

export const getRefunds = (params) => {
  return request({
    url: '/refunds',
    method: 'get',
    params: withStrongReadParams(params)
  })
}

export const approveRefund = (id, data) => {
  return request({
    url: `/refunds/${id}/approve`,
    method: 'put',
    data
  }).then(normalizeStrongMutationPayload)
}

export const rejectRefund = (id, data) => {
  return request({
    url: `/refunds/${id}/reject`,
    method: 'put',
    data
  }).then(normalizeStrongMutationPayload)
}

export const completeRefund = (id) => {
  return request({
    url: `/refunds/${id}/complete`,
    method: 'put'
  }).then(normalizeStrongMutationPayload)
}

export const syncRefundStatus = (id) => {
  return request({
    url: `/refunds/${id}/sync`,
    method: 'put'
  }).then(normalizeStrongMutationPayload)
}

export const getCommissions = (params) => request({ url: '/commissions', method: 'get', params: withStrongReadParams(params) })
export const repairRegionAgentCommissions = (data) => request({ url: '/commissions/repair-region-agent', method: 'post', data }).then(normalizeStrongMutationPayload)
export const approveCommissionItem = (id) => request({ url: `/commissions/${id}/approve`, method: 'put' }).then(normalizeStrongMutationPayload)
export const rejectCommissionItem = (id, data) => request({ url: `/commissions/${id}/reject`, method: 'put', data }).then(normalizeStrongMutationPayload)
export const batchApproveCommissions = (data) => request({ url: '/commissions/batch-approve', method: 'post', data }).then(normalizeStrongMutationPayload)
export const batchRejectCommissions = (data) => request({ url: '/commissions/batch-reject', method: 'post', data }).then(normalizeStrongMutationPayload)
export const getGoodsFundTransfers = (params) => request({ url: '/goods-fund-transfers', method: 'get', params: withStrongReadParams(params) })
export const approveGoodsFundTransfer = (id, data) => request({ url: `/goods-fund-transfers/${id}/approve`, method: 'put', data }).then(normalizeStrongMutationPayload)
export const rejectGoodsFundTransfer = (id, data) => request({ url: `/goods-fund-transfers/${id}/reject`, method: 'put', data }).then(normalizeStrongMutationPayload)

export const getFinanceOverview = () => request({ url: '/finance/overview', method: 'get' })
export const getAgentPerformance = (params) => request({ url: '/finance/agent-performance', method: 'get', params })
export const getPoolContributions = () => request({ url: '/finance/pool-contributions', method: 'get' })
export const getFundPoolLogs = (params) => request({ url: '/finance/fund-pool-logs', method: 'get', params: withStrongReadParams(params) })
export const getDividendExecutions = (params) => request({ url: '/finance/dividend-executions', method: 'get', params: withStrongReadParams(params) })
export const settleAgentDebt = (id, data) => request({ url: `/users/${id}/debt-settlement`, method: 'post', data }).then(normalizeStrongMutationPayload)
