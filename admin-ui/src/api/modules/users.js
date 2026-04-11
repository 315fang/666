import request from '@/utils/request'
import { normalizeItemResult, normalizeListResult } from '@/api/normalize'

export const getUsers = (params) => {
  return request({
    url: '/users',
    method: 'get',
    params
  }).then(normalizeListResult)
}

export const getUserById = (id) => {
  return request({
    url: `/users/${id}`,
    method: 'get'
  }).then(normalizeItemResult)
}

export const getUserTeam = (id, params) => {
  return request({
    url: `/users/${id}/team`,
    method: 'get',
    params
  }).then(normalizeListResult)
}

/** 推荐子树汇总（后代人数、用户累计、订单统计）；params: { range?: 'all'|'30d' } */
export const getUserTeamSummary = (id, params) => {
  return request({
    url: `/users/${id}/team-summary`,
    method: 'get',
    params
  }).then(normalizeItemResult)
}

export const updateUserRole = (id, data) => {
  return request({
    url: `/users/${id}/role`,
    method: 'put',
    data
  })
}

export const adjustUserBalance = (id, data) => {
  return request({
    url: `/users/${id}/balance`,
    method: 'put',
    data
  })
}

export const updateUserStatus = (id, data) => {
  return request({
    url: `/users/${id}/status`,
    method: 'put',
    data
  })
}

export const updateUsersBatchRole = (data) => request({ url: '/users/batch-role', method: 'post', data })
export const updateUserRemark = (id, data) => request({ url: `/users/${id}/remark`, method: 'put', data })
export const updateUserCommerce = (id, data) => request({ url: `/users/${id}/commerce`, method: 'put', data })
export const updateUserInviteCode = (id, data) => request({ url: `/users/${id}/invite-code`, method: 'put', data })
export const updateUserMemberNo = (id, data) => request({ url: `/users/${id}/member-no`, method: 'put', data })
export const updateUserParent = (id, data) => request({ url: `/users/${id}/parent`, method: 'put', data })
export const updateUserPurchaseLevel = (id, data) => request({ url: `/users/${id}/purchase-level`, method: 'put', data })
