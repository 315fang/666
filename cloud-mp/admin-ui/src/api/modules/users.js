import request from '@/utils/request'

export const getUsers = (params) => {
  return request({
    url: '/users',
    method: 'get',
    params
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
    method: 'get'
  })
}

export const getUserTeam = (id, params) => {
  return request({
    url: `/users/${id}/team`,
    method: 'get',
    params
  })
}

/** 推荐子树汇总（后代人数、用户累计、订单统计）；params: { range?: 'all'|'30d' } */
export const getUserTeamSummary = (id, params) => {
  return request({
    url: `/users/${id}/team-summary`,
    method: 'get',
    params
  })
}

export const updateUserRole = (id, data) => {
  return request({
    url: `/users/${id}/role`,
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

/** 调整代理商货款余额（仅代理商有效） */
export const adjustUserGoodsFund = (id, data) => request({ url: `/users/${id}/goods-fund`, method: 'put', data })
/** 调整用户积分（整数） */
export const adjustUserPoints = (id, data) => request({ url: `/users/${id}/points`, method: 'put', data })
/** 调整用户成长值（整数） */
export const adjustUserGrowth = (id, data) => request({ url: `/users/${id}/growth`, method: 'put', data })
/** 手动新增一笔佣金记录 */
export const adjustUserCommission = (id, data) => request({ url: `/users/${id}/commission`, method: 'post', data })
