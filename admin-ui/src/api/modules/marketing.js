import request from '@/utils/request'
import { normalizeItemResult, normalizeListResult } from '@/api/normalize'

export const getGroupBuys = (params) => request({ url: '/group-buys', method: 'get', params }).then(normalizeListResult)
export const getGroupBuyById = (id) => request({ url: `/group-buys/${id}`, method: 'get' }).then(normalizeItemResult)
export const createGroupBuy = (data) => request({ url: '/group-buys', method: 'post', data })
export const updateGroupBuy = (id, data) => request({ url: `/group-buys/${id}`, method: 'put', data })
export const deleteGroupBuy = (id) => request({ url: `/group-buys/${id}`, method: 'delete' })

export const getCoupons = (params) => request({ url: '/coupons', method: 'get', params }).then(normalizeListResult)
export const getCouponById = (id) => request({ url: `/coupons/${id}`, method: 'get' }).then(normalizeItemResult)
export const createCoupon = (data) => request({ url: '/coupons', method: 'post', data })
export const updateCoupon = (id, data) => request({ url: `/coupons/${id}`, method: 'put', data })
export const deleteCoupon = (id) => request({ url: `/coupons/${id}`, method: 'delete' })
export const issueCoupon = (id, data) => request({ url: `/coupons/${id}/issue`, method: 'post', data })
export const getCouponAutoRules = () => request({ url: '/coupon-auto-rules', method: 'get' }).then(normalizeListResult)
export const saveCouponAutoRules = (data) => request({ url: '/coupon-auto-rules', method: 'put', data })

export const getSlashActivities = (params) => request({ url: '/slash-activities', method: 'get', params }).then(normalizeListResult)
export const getSlashActivityById = (id) => request({ url: `/slash-activities/${id}`, method: 'get' }).then(normalizeItemResult)
export const createSlashActivity = (data) => request({ url: '/slash-activities', method: 'post', data })
export const updateSlashActivity = (id, data) => request({ url: `/slash-activities/${id}`, method: 'put', data })
export const deleteSlashActivity = (id) => request({ url: `/slash-activities/${id}`, method: 'delete' })

export const getLotteryPrizes = () => request({ url: '/lottery-prizes', method: 'get' }).then(normalizeListResult)
export const createLotteryPrize = (data) => request({ url: '/lottery-prizes', method: 'post', data })
export const updateLotteryPrize = (id, data) => request({ url: `/lottery-prizes/${id}`, method: 'put', data })
export const deleteLotteryPrize = (id) => request({ url: `/lottery-prizes/${id}`, method: 'delete' })

export const getActivityOptions = () => request({ url: '/activity-options', method: 'get' }).then(normalizeListResult)
export const getFestivalConfig = () => request({ url: '/festival-config', method: 'get' }).then(normalizeItemResult)
export const updateFestivalConfig = (data) => request({ url: '/festival-config', method: 'put', data })
export const getGlobalUiConfig = () => request({ url: '/global-ui-config', method: 'get' }).then(normalizeItemResult)
export const updateGlobalUiConfig = (data) => request({ url: '/global-ui-config', method: 'put', data })
export const getActivityLinks = () => request({ url: '/activity-links', method: 'get' }).then(normalizeItemResult)
export const updateActivityLinks = (data) => request({ url: '/activity-links', method: 'put', data })

export const getSplashConfig = () => request({ url: '/splash', method: 'get' }).then(normalizeItemResult)
export const updateSplashConfig = (data) => request({ url: '/splash', method: 'put', data })
