import request from '@/utils/request'

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

export const getSystemStatus = () => {
  return request({
    url: '/system/status',
    method: 'get'
  })
}

export const getDebugAnomalies = () => request({ url: '/debug/anomalies', method: 'get' })
export const getCronStatus = () => request({ url: '/debug/cron-status', method: 'get' })
export const getDebugLogs = (lines = 100) =>
  request({ url: `/debug/logs?lines=${lines}`, method: 'get' })

export const getAlertConfig = () => request({ url: '/alert-config', method: 'get' })
export const saveAlertConfig = (data) => request({ url: '/alert-config', method: 'put', data })
export const testAlertWebhook = (data) => request({ url: '/alert-config/test', method: 'post', data })

export const getMiniProgramConfig = () => request({ url: '/mini-program-config', method: 'get' })
export const updateMiniProgramConfig = (data) => request({ url: '/mini-program-config', method: 'put', data })
export const getMemberTierConfig = () => request({ url: '/member-tier-config', method: 'get' })
export const updateMemberTierConfig = (data) => request({ url: '/member-tier-config', method: 'put', data })
export const backfillExchangeCoupons = () => request({ url: '/member-tier-config/exchange-coupons/backfill', method: 'post' })

export const getOperationsDashboard = () => request({ url: '/operations/dashboard', method: 'get' })

export const getPopupAdConfig = () => request({ url: '/popup-ad-config', method: 'get' })
export const updatePopupAdConfig = (data) => request({ url: '/popup-ad-config', method: 'put', data })
