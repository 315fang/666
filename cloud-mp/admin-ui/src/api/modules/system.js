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

export const getPaymentHealth = (params) => {
  return request({
    url: '/payment-health',
    method: 'get',
    params
  })
}

export const getDebugProcess = () => request({ url: '/debug/process', method: 'get' })
export const getDebugAnomalies = () => request({ url: '/debug/anomalies', method: 'get' })
export const getDebugDbPing = () => request({ url: '/debug/db-ping', method: 'get' })
export const getCronStatus = () => request({ url: '/debug/cron-status', method: 'get' })
export const getDebugLogs = (lines = 100) =>
  request({ url: `/debug/logs?lines=${lines}`, method: 'get' })

export const getAlertConfig = () => request({ url: '/alert-config', method: 'get' })
export const saveAlertConfig = (data) => request({ url: '/alert-config', method: 'put', data })
export const testAlertWebhook = (data) => request({ url: '/alert-config/test', method: 'post', data })

export const getFeatureToggles = () => request({ url: '/feature-toggles', method: 'get' })
export const updateFeatureToggles = (data) => request({ url: '/feature-toggles', method: 'post', data })
export const getMiniProgramConfig = () => request({ url: '/mini-program-config', method: 'get' })
export const updateMiniProgramConfig = (data) => request({ url: '/mini-program-config', method: 'put', data })
export const getMemberTierConfig = () => request({ url: '/member-tier-config', method: 'get' })
export const updateMemberTierConfig = (data) => request({ url: '/member-tier-config', method: 'put', data })

export const getOperationsDashboard = () => request({ url: '/operations/dashboard', method: 'get' })

export const getPopupAdConfig = () => request({ url: '/popup-ad-config', method: 'get' })
export const updatePopupAdConfig = (data) => request({ url: '/popup-ad-config', method: 'put', data })

export const getSystemConfigs = () => request({ url: '/system-configs', method: 'get' })
export const batchUpdateSystemConfigs = (data) => request({ url: '/system-configs/batch', method: 'post', data })
export const refreshSystemConfigCache = () => request({ url: '/system-configs/refresh-cache', method: 'post' })
export const getSystemConfigHistory = (configKey) => request({ url: `/system-configs/${configKey}/history`, method: 'get' })
export const rollbackSystemConfig = (configKey, data) => request({ url: `/system-configs/${configKey}/rollback`, method: 'post', data })

export const getDbIndexTables = () => request({ url: '/db-indexes/tables', method: 'get' })
export const getDbIndexes = (tableName) => request({ url: `/db-indexes/${tableName}`, method: 'get' })
export const getDbIndexColumns = (tableName) => request({ url: `/db-indexes/${tableName}/columns`, method: 'get' })
export const createDbIndex = (data) => request({ url: '/db-indexes', method: 'post', data })
export const deleteDbIndex = (tableName, indexName) => request({ url: `/db-indexes/${tableName}/${indexName}`, method: 'delete' })
