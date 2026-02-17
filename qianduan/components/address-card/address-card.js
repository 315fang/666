/**
 * 地址卡片组件
 * 用于显示收货地址信息和操作
 */
Component({
  properties: {
    // 地址对象
    address: {
      type: Object,
      value: {}
    },
    // 是否选中
    selected: {
      type: Boolean,
      value: false
    },
    // 是否显示复选框
    showCheckbox: {
      type: Boolean,
      value: false
    },
    // 是否显示操作按钮
    showActions: {
      type: Boolean,
      value: true
    },
    // 是否显示右侧箭头
    showArrow: {
      type: Boolean,
      value: false
    }
  },

  methods: {
    // 点击卡片
    onCardTap() {
      this.triggerEvent('cardtap', { address: this.data.address });
    },

    // 编辑地址
    onEdit(e) {
      e.stopPropagation();
      this.triggerEvent('edit', { address: this.data.address });
    },

    // 设为默认
    onSetDefault(e) {
      e.stopPropagation();
      this.triggerEvent('setdefault', { address: this.data.address });
    },

    // 删除地址
    onDelete(e) {
      e.stopPropagation();
      this.triggerEvent('delete', { address: this.data.address });
    }
  }
});
