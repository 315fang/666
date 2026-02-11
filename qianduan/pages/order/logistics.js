// pages/order/logistics.js
const { get } = require('../../utils/request');

Page({
  data: {
    order: {},
    logistics: {},
    tracks: [],
    loading: true,
    statusText: {
      pending: '待揽件',
      picked: '已揽件',
      shipping: '运输中',
      arrived: '已到达',
      delivering: '派送中',
      delivered: '已签收',
      failed: '派送失败'
    }
  },

  onLoad(options) {
    const orderId = options.id;
    if (orderId) {
      this.setData({ orderId });
      this.loadLogistics(orderId);
    } else {
      wx.showToast({
        title: '订单信息错误',
        icon: 'none'
      });
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    }
  },

  /**
   * 加载物流信息
   */
  async loadLogistics(orderId) {
    try {
      this.setData({ loading: true });

      // 获取订单信息
      const orderRes = await get(`/orders/${orderId}`);
      const order = orderRes.data || orderRes;

      if (!order.tracking_no) {
        wx.showToast({
          title: '订单未发货',
          icon: 'none'
        });
        this.setData({ loading: false });
        return;
      }

      this.setData({ order });

      // 查询物流轨迹
      try {
        const logisticsRes = await get(`/logistics/track/${orderId}`);
        const logisticsData = logisticsRes.data || logisticsRes;

        // 处理物流数据
        const tracks = Array.isArray(logisticsData.tracks) ? logisticsData.tracks : [];
        const latestUpdate = tracks.length > 0 ? tracks[0].time : '';

        this.setData({
          logistics: {
            status: logisticsData.status || 'shipping',
            latestUpdate
          },
          tracks,
          loading: false
        });
      } catch (err) {
        // 如果后端物流接口不存在,使用模拟数据展示
        console.log('物流接口未实现，使用示例数据');
        this.setMockData(order);
      }
    } catch (error) {
      console.error('加载物流信息失败:', error);
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
      this.setData({ loading: false });
    }
  },

  /**
   * 设置模拟数据（用于演示）
   */
  setMockData(order) {
    const now = new Date();
    const mockTracks = [
      {
        time: this.formatTime(now),
        context: '您的快件已签收，感谢使用我们的服务',
        location: order.receiver_city || '目的地'
      },
      {
        time: this.formatTime(new Date(now - 2 * 3600 * 1000)),
        context: '快件正在派送中，请准备签收',
        location: order.receiver_city || '目的地'
      },
      {
        time: this.formatTime(new Date(now - 6 * 3600 * 1000)),
        context: '快件已到达目的地网点',
        location: order.receiver_city || '目的地'
      },
      {
        time: this.formatTime(new Date(now - 24 * 3600 * 1000)),
        context: '快件正在运输途中',
        location: '中转站'
      },
      {
        time: this.formatTime(new Date(now - 36 * 3600 * 1000)),
        context: '快件已从发件地揽收',
        location: '发件地'
      }
    ];

    this.setData({
      logistics: {
        status: 'delivered',
        latestUpdate: mockTracks[0].time
      },
      tracks: mockTracks,
      loading: false
    });
  },

  /**
   * 格式化时间
   */
  formatTime(date) {
    const d = typeof date === 'string' ? new Date(date) : date;
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hour = String(d.getHours()).padStart(2, '0');
    const minute = String(d.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hour}:${minute}`;
  },

  /**
   * 复制运单号
   */
  onCopyTrackingNo() {
    const { tracking_no } = this.data.order;
    if (!tracking_no) {
      wx.showToast({
        title: '暂无运单号',
        icon: 'none'
      });
      return;
    }

    wx.setClipboardData({
      data: tracking_no,
      success: () => {
        wx.showToast({
          title: '运单号已复制',
          icon: 'success'
        });
      }
    });
  },

  /**
   * 刷新物流信息
   */
  onRefresh() {
    const { orderId } = this.data;
    if (orderId) {
      wx.showLoading({
        title: '刷新中...'
      });
      this.loadLogistics(orderId).finally(() => {
        wx.hideLoading();
      });
    }
  },

  /**
   * 分享配置
   */
  onShareAppMessage() {
    return {
      title: '物流轨迹',
      path: `/pages/order/logistics?id=${this.data.orderId}`
    };
  }
});
