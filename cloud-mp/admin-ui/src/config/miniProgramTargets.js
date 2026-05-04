export const MINI_PROGRAM_LINK_TYPE_OPTIONS = [
  { value: 'none', label: '无跳转' },
  { value: 'product', label: '商品详情' },
  { value: 'activity', label: '活动页面' },
  { value: 'category', label: '分类页定位' },
  { value: 'group_buy', label: '拼团活动' },
  { value: 'slash', label: '砍价活动' },
  { value: 'lottery', label: '抽奖转盘' },
  { value: 'flash_sale', label: '限时商品' },
  { value: 'coupon_center', label: '惊喜礼遇' },
  { value: 'page', label: '小程序页面' },
  { value: 'url', label: '外部链接' }
]

export const MINI_PROGRAM_TARGETS = [
  {
    key: 'page:index',
    title: '商城首页',
    group: '主导航',
    link_type: 'page',
    link_value: '/pages/index/index',
    note: '首页 Tab'
  },
  {
    key: 'page:category',
    title: '全部商品',
    group: '主导航',
    link_type: 'page',
    link_value: '/pages/category/category',
    note: '分类 Tab'
  },
  {
    key: 'page:activity',
    title: '活动中心',
    group: '主导航',
    link_type: 'page',
    link_value: '/pages/activity/activity',
    note: '活动 Tab'
  },
  {
    key: 'page:user',
    title: '个人中心',
    group: '主导航',
    link_type: 'page',
    link_value: '/pages/user/user',
    note: '我的 Tab'
  },
  {
    key: 'flash_sale:current',
    title: '当前有效限时商品',
    group: '营销入口',
    link_type: 'flash_sale',
    link_value: '',
    note: '进入当前有效档期'
  },
  {
    key: 'coupon:center',
    title: '惊喜礼遇',
    group: '营销入口',
    link_type: 'coupon_center',
    link_value: '__coupon_center__',
    note: '惊喜礼遇页'
  },
  {
    key: 'page:flex-bundles',
    title: '特惠随心选列表',
    group: '营销入口',
    link_type: 'page',
    link_value: '/pages/activity/flex-bundles',
    note: '自由组合列表页，适合首页大图和海报入口'
  },
  {
    key: 'page:product-bundle-detail',
    title: '组合商品详情',
    group: '营销入口',
    link_type: 'page',
    link_value: '/pages/product-bundle/detail',
    note: '组合商品详情页，链接可追加 id 参数'
  },
  {
    key: 'page:search',
    title: '搜索页',
    group: '商城功能',
    link_type: 'page',
    link_value: '/pages/search/search',
    note: '商品搜索'
  },
  {
    key: 'page:coupon-list',
    title: '我的优惠券',
    group: '商城功能',
    link_type: 'page',
    link_value: '/pages/coupon/list',
    note: '优惠券明细'
  },
  {
    key: 'page:points',
    title: '积分中心',
    group: '商城功能',
    link_type: 'page',
    link_value: '/pages/points/index',
    note: '积分任务与兑换'
  },
  {
    key: 'page:membership-center',
    title: '会员中心',
    group: '会员服务',
    link_type: 'page',
    link_value: '/pages/user/membership-center',
    note: '会员权益中心'
  },
  {
    key: 'page:wallet',
    title: '我的钱包',
    group: '会员服务',
    link_type: 'page',
    link_value: '/pages/wallet/index',
    note: '钱包首页'
  },
  {
    key: 'page:orders',
    title: '我的订单',
    group: '订单服务',
    link_type: 'page',
    link_value: '/pages/order/list',
    note: '全部订单'
  },
  {
    key: 'page:refunds',
    title: '售后列表',
    group: '订单服务',
    link_type: 'page',
    link_value: '/pages/order/refund-list',
    note: '退款/售后列表'
  },
  {
    key: 'page:customer-service',
    title: '专属客服',
    group: '会员服务',
    link_type: 'page',
    link_value: '/pages/user/customer-service',
    note: '客服入口'
  },
  {
    key: 'page:favorites',
    title: '足迹收藏',
    group: '会员服务',
    link_type: 'page',
    link_value: '/pages/user/favorites-footprints',
    note: '收藏与足迹'
  },
  {
    key: 'page:distribution-center',
    title: '分销中心',
    group: '分销服务',
    link_type: 'page',
    link_value: '/pages/distribution/center',
    note: '分销中心首页'
  }
]

export function normalizeTargetLinkValue(linkType, linkValue) {
  const type = String(linkType || 'none').trim()
  const value = String(linkValue || '').trim()
  if (type === 'flash_sale') {
    return value === '__flash_sale__' ? '' : value
  }
  if (type === 'coupon_center') {
    return value || '__coupon_center__'
  }
  return value
}

export function matchesMiniProgramTarget(target, linkType, linkValue) {
  if (!target || target.link_type !== String(linkType || 'none').trim()) return false
  const normalizedValue = normalizeTargetLinkValue(linkType, linkValue)
  const targetValue = normalizeTargetLinkValue(target.link_type, target.link_value)
  if (target.link_type === 'coupon_center') return true
  return targetValue === normalizedValue
}

export function findMiniProgramTarget(linkType, linkValue) {
  return MINI_PROGRAM_TARGETS.find((target) => matchesMiniProgramTarget(target, linkType, linkValue)) || null
}

export function getRecommendedTargetsByLinkType(linkType) {
  const type = String(linkType || 'none').trim()
  return MINI_PROGRAM_TARGETS.filter((target) => target.link_type === type)
}

export function groupMiniProgramTargets(targets = []) {
  const groups = new Map()
  ;(Array.isArray(targets) ? targets : []).forEach((target) => {
    const group = String(target.group || '未分组').trim()
    if (!groups.has(group)) groups.set(group, [])
    groups.get(group).push(target)
  })
  return Array.from(groups.entries()).map(([group, items]) => ({ group, items }))
}
