/**
 * 前端全局常量配置
 * 集中管理所有魔法数字和配置项
 */

// ==================== API 配置 ====================
const API_CONFIG = {
  BASE_URL: 'https://api.jxalk.cn/api',
  TIMEOUT: 15000,
  RETRY_COUNT: 3
};

// ==================== 用户角色 ====================
const USER_ROLES = {
  GUEST: 0,
  MEMBER: 1,
  LEADER: 2,
  AGENT: 3
};

const ROLE_NAMES = {
  [USER_ROLES.GUEST]: '普通用户',
  [USER_ROLES.MEMBER]: '会员',
  [USER_ROLES.LEADER]: '团长',
  [USER_ROLES.AGENT]: '代理商'
};

// ==================== 订单状态 ====================
const ORDER_STATUS = {
  PENDING: 'pending',
  PAID: 'paid',
  AGENT_CONFIRMED: 'agent_confirmed',
  SHIPPING_REQUESTED: 'shipping_requested',
  SHIPPED: 'shipped',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  REFUNDING: 'refunding',
  REFUNDED: 'refunded'
};

const ORDER_STATUS_TEXT = {
  [ORDER_STATUS.PENDING]: '待付款',
  [ORDER_STATUS.PAID]: '待发货',
  [ORDER_STATUS.AGENT_CONFIRMED]: '代理已确认',
  [ORDER_STATUS.SHIPPING_REQUESTED]: '发货申请中',
  [ORDER_STATUS.SHIPPED]: '待收货',
  [ORDER_STATUS.COMPLETED]: '已完成',
  [ORDER_STATUS.CANCELLED]: '已取消',
  [ORDER_STATUS.REFUNDING]: '退款中',
  [ORDER_STATUS.REFUNDED]: '已退款'
};

// ==================== 搜索历史配置 ====================
const SEARCH_CONFIG = {
  MAX_HISTORY: 10,
  STORAGE_KEY: 'searchHistory'
};

// ==================== 缓存配置 ====================
const CACHE_KEYS = {
  USER_INFO: 'userInfo',
  OPENID: 'openid',
  TOKEN: 'token',
  DISTRIBUTOR_ID: 'distributor_id',
  SEARCH_HISTORY: 'searchHistory',
  DIRECT_BUY_INFO: 'directBuyInfo',
  SELECTED_ADDRESS: 'selectedAddress'
};

// ==================== 页面路径 ====================
const PAGES = {
  INDEX: '/pages/index/index',
  CATEGORY: '/pages/category/category',
  CART: '/pages/cart/cart',
  USER: '/pages/user/user',
  PRODUCT_DETAIL: '/pages/product/detail',
  SEARCH: '/pages/search/search',
  ORDER_LIST: '/pages/order/list',
  ORDER_DETAIL: '/pages/order/detail',
  ORDER_CONFIRM: '/pages/order/confirm',
  ADDRESS_LIST: '/pages/address/list',
  ADDRESS_EDIT: '/pages/address/edit',
  DISTRIBUTION_CENTER: '/pages/distribution/center',
  WALLET: '/pages/wallet/index'
};

// ==================== 正则表达式 ====================
const REGEX = {
  PHONE: /^1[3-9]\d{9}$/,
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  INVITE_CODE: /^\d{6}$/
};

// ==================== 默认值 ====================
const DEFAULTS = {
  AVATAR: '/assets/images/default-avatar.svg',
  PLACEHOLDER: '/assets/images/placeholder.svg',
  PAGE_SIZE: 20
};

// ==================== 错误消息 ====================
const ERROR_MESSAGES = {
  NETWORK_ERROR: '网络连接失败，请检查网络',
  LOGIN_EXPIRED: '登录已过期，请重新登录',
  PARAM_ERROR: '参数错误',
  SERVER_ERROR: '服务器错误，请稍后重试',
  NO_PERMISSION: '暂无权限',
  NOT_FOUND: '请求的资源不存在'
};

// CommonJS 导出（WeChat Mini Program 兼容）
module.exports = {
  API_CONFIG,
  USER_ROLES,
  ROLE_NAMES,
  ORDER_STATUS,
  ORDER_STATUS_TEXT,
  SEARCH_CONFIG,
  CACHE_KEYS,
  PAGES,
  REGEX,
  DEFAULTS,
  ERROR_MESSAGES
};
