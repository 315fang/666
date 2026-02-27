import request from '@/utils/request'

// ========== 认证 ==========
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

// ========== 数据统计 ==========
export const getDashboardOverview = () => {
  return request({
    url: '/statistics/overview',
    method: 'get'
  })
}

export const getDashboardNotifications = () => {
  return request({
    url: '/dashboard/notifications',
    method: 'get'
  })
}

export const getSalesTrend = (params) => {
  return request({
    url: '/statistics/sales-trend',
    method: 'get',
    params
  })
}

export const getProductRanking = (params) => {
  return request({
    url: '/statistics/product-ranking',
    method: 'get',
    params
  })
}

// ========== 商品管理 ==========
export const getProducts = (params) => {
  return request({
    url: '/products',
    method: 'get',
    params
  })
}

export const getProductById = (id) => {
  return request({
    url: `/products/${id}`,
    method: 'get'
  })
}

export const createProduct = (data) => {
  return request({
    url: '/products',
    method: 'post',
    data
  })
}

export const updateProduct = (id, data) => {
  return request({
    url: `/products/${id}`,
    method: 'put',
    data
  })
}

export const updateProductStatus = (id, data) => {
  return request({
    url: `/products/${id}/status`,
    method: 'put',
    data
  })
}

// 分类管理
export const getCategories = () => {
  return request({
    url: '/categories',
    method: 'get'
  })
}

export const createCategory = (data) => {
  return request({
    url: '/categories',
    method: 'post',
    data
  })
}

export const updateCategory = (id, data) => {
  return request({
    url: `/categories/${id}`,
    method: 'put',
    data
  })
}

export const deleteCategory = (id) => {
  return request({
    url: `/categories/${id}`,
    method: 'delete'
  })
}

// ========== 订单管理 ==========
export const getOrders = (params) => {
  return request({
    url: '/orders',
    method: 'get',
    params
  })
}

export const getOrderDetail = (id) => {
  return request({
    url: `/orders/${id}`,
    method: 'get'
  })
}

export const shipOrder = (id, data) => {
  return request({
    url: `/orders/${id}/ship`,
    method: 'put',
    data
  })
}

export const updateShippingInfo = (id, data) => {
  return request({
    url: `/orders/${id}/shipping-info`,
    method: 'put',
    data
  })
}

export const adjustOrderAmount = (id, data) => {
  return request({
    url: `/orders/${id}/amount`,
    method: 'put',
    data
  })
}

export const addOrderRemark = (id, data) => {
  return request({
    url: `/orders/${id}/remark`,
    method: 'put',
    data
  })
}

export const forceCompleteOrder = (id) => {
  return request({
    url: `/orders/${id}/force-complete`,
    method: 'put'
  })
}

export const forceCancelOrder = (id) => {
  return request({
    url: `/orders/${id}/force-cancel`,
    method: 'put'
  })
}

export const exportOrders = (params) => {
  return request({
    url: '/orders/export',
    method: 'get',
    params,
    responseType: 'blob'
  })
}

// ========== 用户管理 ==========
export const getUsers = (params) => {
  return request({
    url: '/users',
    method: 'get',
    params
  })
}

export const getUserById = (id) => {
  return request({
    url: `/users/${id}`,
    method: 'get'
  })
}

export const getUserTeam = (id) => {
  return request({
    url: `/users/${id}/team`,
    method: 'get'
  })
}

export const updateUserRole = (id, data) => {
  return request({
    url: `/users/${id}/role`,
    method: 'put',
    data
  })
}

export const adjustUserBalance = (id, data) => {
  return request({
    url: `/users/${id}/balance`,
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

// ========== 提现管理 ==========
export const getWithdrawals = (params) => {
  return request({
    url: '/withdrawals',
    method: 'get',
    params
  })
}

export const approveWithdrawal = (id, data) => {
  return request({
    url: `/withdrawals/${id}/approve`,
    method: 'put',
    data
  })
}

export const rejectWithdrawal = (id, data) => {
  return request({
    url: `/withdrawals/${id}/reject`,
    method: 'put',
    data
  })
}

export const completeWithdrawal = (id) => {
  return request({
    url: `/withdrawals/${id}/complete`,
    method: 'put'
  })
}

// ========== 售后管理 ==========
export const getRefunds = (params) => {
  return request({
    url: '/refunds',
    method: 'get',
    params
  })
}

export const getRefundById = (id) => {
  return request({
    url: `/refunds/${id}`,
    method: 'get'
  })
}

export const approveRefund = (id, data) => {
  return request({
    url: `/refunds/${id}/approve`,
    method: 'put',
    data
  })
}

export const rejectRefund = (id, data) => {
  return request({
    url: `/refunds/${id}/reject`,
    method: 'put',
    data
  })
}

export const completeRefund = (id) => {
  return request({
    url: `/refunds/${id}/complete`,
    method: 'put'
  })
}

// ========== 佣金管理 ==========
export const getCommissionLogs = (params) => {
  return request({
    url: '/commissions',
    method: 'get',
    params
  })
}

export const approveCommission = (id) => {
  return request({
    url: `/commissions/${id}/approve`,
    method: 'put'
  })
}

export const rejectCommission = (id, data) => {
  return request({
    url: `/commissions/${id}/reject`,
    method: 'put',
    data
  })
}

// ========== 系统设置 ==========
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

// ========== 文件上传 ==========
export const uploadFile = (file) => {
  const formData = new FormData()
  formData.append('file', file)
  return request({
    url: '/upload',
    method: 'post',
    data: formData,
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  })
}

// ========== 内容管理 ==========
export const getBanners = (params) => {
  return request({
    url: '/banners',
    method: 'get',
    params
  })
}

export const createBanner = (data) => {
  return request({
    url: '/banners',
    method: 'post',
    data
  })
}

export const updateBanner = (id, data) => {
  return request({
    url: `/banners/${id}`,
    method: 'put',
    data
  })
}

export const deleteBanner = (id) => {
  return request({
    url: `/banners/${id}`,
    method: 'delete'
  })
}

// ========== 操作日志 ==========
export const getLogs = (params) => {
  return request({
    url: '/logs',
    method: 'get',
    params
  })
}
