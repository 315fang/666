// pages/rules/index.js - 规则说明
const { get } = require('../../utils/request');

Page({
  data: {
    rules: {
      title: '发货与佣金规则说明',
      summary: '',
      details: []
    },
    loading: false
  },

  onShow() {
    this.loadRules();
  },

  async loadRules() {
    if (this.data.loading) return;
    this.setData({ loading: true });

    try {
      const res = await get('/rules');
      if (res.code === 0 && res.data) {
        this.setData({
          rules: {
            title: res.data.title || '发货与佣金规则说明',
            summary: res.data.summary || '',
            details: Array.isArray(res.data.details) ? res.data.details : []
          }
        });
      }
    } catch (err) {
      console.error('加载规则说明失败:', err);
    } finally {
      this.setData({ loading: false });
    }
  }
});
