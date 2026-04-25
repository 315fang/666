import request from '@/utils/request'

export const getCommissionConfig = () => request({ url: '/agent-system/commission-config', method: 'get' })
export const updateCommissionConfig = (data) => request({ url: '/agent-system/commission-config', method: 'put', data })
export const getCommissionMatrix = () => request({ url: '/agent-system/commission-matrix', method: 'get' })
export const updateCommissionMatrix = (data) => request({ url: '/agent-system/commission-matrix', method: 'put', data })
export const getBundleCommissionMatrix = () => request({ url: '/agent-system/bundle-commission-matrix', method: 'get' })
export const updateBundleCommissionMatrix = (data) => request({ url: '/agent-system/bundle-commission-matrix', method: 'put', data })

export const getPeerBonusConfig = () => request({ url: '/agent-system/peer-bonus', method: 'get' })
export const updatePeerBonusConfig = (data) => request({ url: '/agent-system/peer-bonus', method: 'put', data })

export const getAssistBonusConfig = () => request({ url: '/agent-system/assist-bonus', method: 'get' })
export const updateAssistBonusConfig = (data) => request({ url: '/agent-system/assist-bonus', method: 'put', data })

export const getFundPoolConfig = () => request({ url: '/agent-system/fund-pool', method: 'get' })
export const updateFundPoolConfig = (data) => request({ url: '/agent-system/fund-pool', method: 'put', data })

export const getDividendRulesConfig = () => request({ url: '/agent-system/dividend-rules', method: 'get' })
export const updateDividendRulesConfig = (data) => request({ url: '/agent-system/dividend-rules', method: 'put', data })
export const getDividendPreview = (params) => request({ url: '/agent-system/dividend/preview', method: 'get', params })
export const executeDividend = (data) => request({ url: '/agent-system/dividend/execute', method: 'post', data })

export const getExitRulesConfig = () => request({ url: '/agent-system/exit-rules', method: 'get' })
export const updateExitRulesConfig = (data) => request({ url: '/agent-system/exit-rules', method: 'put', data })
export const createExitApplication = (userId, data) => request({ url: `/agent-system/exit-applications/${userId}`, method: 'post', data })

export const getRechargeConfig = () => request({ url: '/agent-system/recharge-config', method: 'get' })
export const updateRechargeConfig = (data) => request({ url: '/agent-system/recharge-config', method: 'put', data })
