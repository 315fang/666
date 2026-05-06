const { get } = require('../../utils/request')

function normalizeProductPayload(res) {
  const data = res && res.data
  if (data && typeof data === 'object' && !Array.isArray(data)) return data
  return null
}

Page({
  data: {
    couponId: '',
    coupon: null,
    products: [],
    loading: true,
    emptyText: ''
  },

  async onLoad(options) {
    const couponId = String(options.coupon_id || '')
    const coupon = wx.getStorageSync('activeExchangeCoupon') || null
    if (!couponId || !coupon || String(coupon._id || coupon.id || coupon.coupon_id || '') !== couponId) {
      this.setData({ loading: false, emptyText: '兑换券信息不存在，请返回券包列表重试' })
      return
    }
    this.setData({ couponId, coupon })
    await this.loadProducts(coupon)
  },

  async loadProducts(coupon) {
    const productIds = Array.isArray(coupon.exchange_meta?.allowed_product_ids) ? coupon.exchange_meta.allowed_product_ids : []
    if (!productIds.length) {
      this.setData({ loading: false, emptyText: '该兑换券尚未绑定商品' })
      return
    }
    try {
      const list = (await Promise.all(productIds.map((id) => get(`/products/${id}`, {}, { showError: false }).catch(() => null))))
        .map((item) => normalizeProductPayload(item))
        .filter(Boolean)
        .map((product) => ({
          id: product.id || product._id,
          name: product.name || '兑换商品',
          image: Array.isArray(product.images) && product.images[0] ? product.images[0] : '',
          description: product.description || '',
          price: product.retail_price || product.price || product.min_price || 0
        }))
      this.setData({
        products: list,
        loading: false,
        emptyText: list.length ? '' : '可兑换商品暂不可用'
      })
    } catch (err) {
      this.setData({ loading: false, emptyText: '加载可兑换商品失败，请稍后再试' })
    }
  },

  onPickProduct(e) {
    const productId = e.currentTarget.dataset.id
    if (!productId) return
    wx.navigateTo({
      url: `/pages/product/detail?id=${encodeURIComponent(productId)}&exchange_coupon_id=${encodeURIComponent(this.data.couponId)}`
    })
  },

  onBack() {
    wx.navigateBack({ delta: 1 })
  }
})
