'use strict';

Page({
  onLoad() {
    // 开屏动画已删除；保留该页仅兼容开发者工具或旧缓存路由。
    const goHome = () => {
      wx.switchTab({
        url: '/pages/index/index',
        fail: () => {
          wx.reLaunch({ url: '/pages/index/index' });
        }
      });
    };
    if (wx.nextTick) {
      wx.nextTick(goHome);
    } else {
      setTimeout(goHome, 0);
    }
  }
});
