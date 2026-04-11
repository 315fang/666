import request from '@/utils/request'

export const login = (data) => {
  return request({
    url: '/login',
    method: 'post',
    data
  })
}

export const getAdminInfo = () => {
  return request({
    url: '/profile',
    method: 'get'
  })
}

export const changePassword = (data) => {
  return request({
    url: '/password',
    method: 'put',
    data
  })
}

export const logout = () => {
  return request({
    url: '/logout',
    method: 'post'
  })
}
