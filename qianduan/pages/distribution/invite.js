// pages/distribution/invite.js - 邀请好友页面
const app = getApp();
const { get } = require('../../utils/request');

Page({
  data: {
    inviteCode: '',
    shareLink: '',
    userInfo: null,
    team: {
      totalCount: 0,
      directCount: 0,
      indirectCount: 0
    }
  },

  onLoad() {
    this.loadUserData();
  },

  onShow() {
    this.loadTeamStats();
  },

  /**
   * 加载用户数据
   */
  loadUserData() {
    const userInfo = app.globalData.userInfo;
    if (!userInfo) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      setTimeout(() => {
        wx.switchTab({ url: '/pages/user/user' });
      }, 1500);
      return;
    }

    const inviteCode = userInfo.invite_code || String(userInfo.id);
    const shareLink = `/pages/index/index?share_id=${inviteCode}`;

    this.setData({
      userInfo,
      inviteCode,
      shareLink
    });
  },

  /**
   * 加载团队统计
   */
  async loadTeamStats() {
    try {
      const res = await get('/stats/distribution');
      if (res.code === 0 && res.data && res.data.team) {
        this.setData({
          team: res.data.team
        });
      }
    } catch (err) {
      console.error('加载团队统计失败:', err);
    }
  },

  /**
   * 复制邀请码回调
   */
  onCopyCode(e) {
    console.log('邀请码已复制:', e.detail.code);
  },

  /**
   * 复制链接回调
   */
  onCopyLink(e) {
    console.log('链接已复制:', e.detail.link);
  },

  /**
   * 查看团队
   */
  goTeam() {
    wx.navigateTo({ url: '/pages/distribution/team' });
  },

  /**
   * 返回分佣中心
   */
  goCenter() {
    wx.navigateBack();
  },

  /**
   * 分享配置
   */
  onShareAppMessage() {
    const { inviteCode, userInfo } = this.data;
    return {
      title: `${userInfo.nickname || '我'}邀你一起赚零花钱`,
      path: `/pages/index/index?share_id=${inviteCode}`,
      imageUrl: ''
    };
  },

  /**
   * 分享到朋友圈
   */
  onShareTimeline() {
    const { inviteCode } = this.data;
    return {
      title: '臻选 · 精选全球好物，邀你一起赚',
      query: `share_id=${inviteCode}`,
      imageUrl: ''
    };
  }
});
