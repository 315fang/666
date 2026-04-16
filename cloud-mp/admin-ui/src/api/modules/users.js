import request from '@/utils/request'
import { normalizeStrongMutationPayload, withStrongReadParams } from '@/api/consistency'

export const getUsers = (params) => {
  return request({
    url: '/users',
    method: 'get',
    params: withStrongReadParams(params)
  })
}

export const searchUsersLite = (params) => {
  const normalizedParams = {
    ...params,
    limit: params?.limit || 20
  }

  return request({
    url: '/users/search',
    method: 'get',
    params: normalizedParams,
    suppressNotFound: true
  }).catch(async (error) => {
    if (error?.response?.status !== 404) throw error

    const legacy = await getUsers({
      ...normalizedParams,
      page: 1
    })

    return {
      list: legacy?.list || [],
      total: legacy?.total ?? legacy?.pagination?.total ?? (legacy?.list || []).length
    }
  })
}

export const getUserById = (id) => {
  return request({
    url: `/users/${id}`,
    method: 'get',
    params: withStrongReadParams()
  })
}

export const getUserTeam = (id, params) => {
  return request({
    url: `/users/${id}/team`,
    method: 'get',
    params: withStrongReadParams(params)
  })
}

/** 推荐子树汇总（后代人数、用户累计、订单统计）；params: { range?: 'all'|'30d' } */
export const getUserTeamSummary = (id, params) => {
  return request({
    url: `/users/${id}/team-summary`,
    method: 'get',
    params: withStrongReadParams(params)
  })
}

export const updateUserRole = (id, data) => {
  return request({
    url: `/users/${id}/role`,
    method: 'put',
    data
  }).then(normalizeStrongMutationPayload)
}

export const updateUserStatus = (id, data) => {
  return request({
    url: `/users/${id}/status`,
    method: 'put',
    data
  }).then(normalizeStrongMutationPayload)
}

export const updateUsersBatchRole = (data) => request({ url: '/users/batch-role', method: 'post', data }).then(normalizeStrongMutationPayload)
export const updateUserRemark = (id, data) => request({ url: `/users/${id}/remark`, method: 'put', data }).then(normalizeStrongMutationPayload)
export const updateUserCommerce = (id, data) => request({ url: `/users/${id}/commerce`, method: 'put', data }).then(normalizeStrongMutationPayload)
export const updateUserInviteCode = (id, data) => request({ url: `/users/${id}/invite-code`, method: 'put', data }).then(normalizeStrongMutationPayload)
export const updateUserMemberNo = (id, data) => request({ url: `/users/${id}/member-no`, method: 'put', data }).then(normalizeStrongMutationPayload)
export const updateUserParent = (id, data) => request({ url: `/users/${id}/parent`, method: 'put', data }).then(normalizeStrongMutationPayload)
export const updateUserPurchaseLevel = (id, data) => request({ url: `/users/${id}/purchase-level`, method: 'put', data }).then(normalizeStrongMutationPayload)

/** 调整代理商货款余额（仅代理商有效） */
export const adjustUserGoodsFund = (id, data) => request({ url: `/users/${id}/goods-fund`, method: 'put', data }).then(normalizeStrongMutationPayload)
/** 调整用户积分（整数） */
export const adjustUserPoints = (id, data) => request({ url: `/users/${id}/points`, method: 'put', data }).then(normalizeStrongMutationPayload)
/** 调整用户成长值（整数） */
export const adjustUserGrowth = (id, data) => request({ url: `/users/${id}/growth`, method: 'put', data }).then(normalizeStrongMutationPayload)
/** 手动新增一笔佣金记录 */
export const adjustUserCommission = (id, data) => request({ url: `/users/${id}/commission`, method: 'post', data }).then(normalizeStrongMutationPayload)
