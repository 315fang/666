const app = getApp();

Page({
  data: {
    userInfo: null
  },

  onLoad(options) {
    this.setData({
      userInfo: wx.getStorageSync('userInfo') || app.globalData.userInfo
    });
  },

  // 返回我的页面
  onBack() {
    wx.navigateBack();
  },

  // 页面分享
  onShareAppMessage() {
    return {
      title: '臻选智能助手即将上线',
      path: '/pages/ai/chat'
    };
  }
});