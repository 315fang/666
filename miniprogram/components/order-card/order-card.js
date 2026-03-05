/**
 * 订单卡片组件
 * 用于显示订单信息和操作
 */
const { ORDER_STATUS, ORDER_STATUS_TEXT } = require('../../config/constants.js');

Component({
  properties: {
    // 订单对象
    order: {
      type: Object,
      value: {},
      observer: function(newVal) {
        if (newVal) {
          this.setData({
            statusText: ORDER_STATUS_TEXT[newVal.status] || '未知状态'
          });
        }
      }
    },
    // 是否显示操作按钮
    showActions: {
      type: Boolean,
      value: true
    }
  },

  data: {
    statusText: ''
  },

  methods: {
    // 点击卡片
    onCardTap() {
      this.triggerEvent('cardtap', { order: this.data.order });
    },

    // 取消订单
    onCancelOrder(e) {
      e.stopPropagation();
      this.triggerEvent('cancel', { order: this.data.order });
    },

    // 支付订单
    onPayOrder(e) {
      e.stopPropagation();
      this.triggerEvent('pay', { order: this.data.order });
    },

    // 确认收货
    onConfirmOrder(e) {
      e.stopPropagation();
      this.triggerEvent('confirm', { order: this.data.order });
    },

    // 查看佣金
    onViewCommission(e) {
      e.stopPropagation();
      this.triggerEvent('viewcommission', { order: this.data.order });
    }
  }
});
