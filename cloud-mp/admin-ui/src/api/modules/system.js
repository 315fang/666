import request from '@/utils/request'
import { withStrongReadParams } from '@/api/consistency'

export const getSettings = () => {
  return request({
    url: '/settings',
    method: 'get'
  })
}

export const updateSettings = (data) => {
  return request({
    url: '/settings',
    method: 'put',
    data
  })
}

export const getSystemStatus = (options = {}) => {
  return request({
    url: '/system/status',
    method: 'get',
    params: withStrongReadParams(),
    ...options
  })
}

export const getDebugAnomalies = (options = {}) => request({ url: '/debug/anomalies', method: 'get', ...options })
export const getCronStatus = (options = {}) => request({ url: '/debug/cron-status', method: 'get', ...options })
export const getDebugLogs = (lines = 100, options = {}) =>
  request({ url: `/debug/logs?lines=${lines}`, method: 'get', ...options })
export const getDebugOrderChain = (params) => request({ url: '/debug/order-chain', method: 'get', params: withStrongReadParams(params) })
export const getDebugUserChain = (params) => request({ url: '/debug/user-chain', method: 'get', params: withStrongReadParams(params) })
export const getDebugConfigSource = (params) => request({ url: '/debug/config-source', method: 'get', params: withStrongReadParams(params) })

export const getAlertConfig = () => request({ url: '/alert-config', method: 'get' })
export const saveAlertConfig = (data) => request({ url: '/alert-config', method: 'put', data })
export const testAlertWebhook = (data) => request({ url: '/alert-config/test', method: 'post', data })

export const getMiniProgramConfig = (options = {}) => request({ url: '/mini-program-config', method: 'get', ...options })
export const updateMiniProgramConfig = (data) => request({ url: '/mini-program-config', method: 'put', data })
export const getMemberTierConfig = (options = {}) => request({ url: '/member-tier-config', method: 'get', ...options })
export const updateMemberTierConfig = (data) => request({ url: '/member-tier-config', method: 'put', data })
export const backfillExchangeCoupons = () => request({ url: '/member-tier-config/exchange-coupons/backfill', method: 'post' })

export const getOperationsDashboard = (options = {}) => request({ url: '/operations/dashboard', method: 'get', ...options })

export const getPopupAdConfig = () => request({ url: '/popup-ad-config', method: 'get' })
export const updatePopupAdConfig = (data) => request({ url: '/popup-ad-config', method: 'put', data })
