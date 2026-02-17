/**
 * 加载骨架屏组件
 * 用于在数据加载时显示占位内容
 */
Component({
  properties: {
    // 是否显示加载状态
    loading: {
      type: Boolean,
      value: true
    },
    // 骨架屏类型: product-card, list-item, order-card, custom
    type: {
      type: String,
      value: 'product-card'
    },
    // 重复次数（用于列表）
    count: {
      type: Number,
      value: 1
    }
  }
});
