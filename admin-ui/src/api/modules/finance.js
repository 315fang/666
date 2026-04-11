import request from '@/utils/request'
import { normalizeItemResult, normalizeListResult } from '@/api/normalize'

export const getWithdrawals = (params) => {
  return request({
    url: '/withdrawals',
    method: 'get',
    params
  }).then(normalizeListResult)
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

export const completeWithdrawal = (id) => {
  return request({
    url: `/withdrawals/${id}/complete`,
    method: 'put'
  })
}

export const getRefunds = (params) => {
  return request({
    url: '/refunds',
    method: 'get',
    params
  }).then(normalizeListResult)
}

export const getRefundById = (id) => {
  return request({
    url: `/refunds/${id}`,
    method: 'get'
  }).then(normalizeItemResult)
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

export const getCommissions = (params) => request({ url: '/commissions', method: 'get', params }).then(normalizeListResult)
export const approveCommissionItem = (id) => request({ url: `/commissions/${id}/approve`, method: 'put' })
export const rejectCommissionItem = (id, data) => request({ url: `/commissions/${id}/reject`, method: 'put', data })
export const batchApproveCommissions = (data) => request({ url: '/commissions/batch-approve', method: 'post', data })
export const batchRejectCommissions = (data) => request({ url: '/commissions/batch-reject', method: 'post', data })
