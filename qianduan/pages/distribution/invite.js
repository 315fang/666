// pages/distribution/invite.js - 邀请好友页面
const app = getApp();
const { get } = require('../../utils/request');

Page({
  data: {
    inviteCode: '',
    shareLink: '',
    qrCodeUrl: '',
    userInfo: null,
    team: {
      totalCount: 0,
      directCount: 0,
      indirectCount: 0
    }
  },

  onLoad() {
    this.loadUserData();
    this.generateQRCode();
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
   * 生成小程序二维码
   */
  async generateQRCode() {
    try {
      const userInfo = this.data.userInfo || getApp().globalData.userInfo;
      if (!userInfo) return;

      const inviteCode = userInfo.invite_code || String(userInfo.id);

      // 使用微信API生成临时二维码
      // 注意：实际生产环境应该调用后端API生成永久二维码
      const qrCodeUrl = `/pages/index/index?share_id=${inviteCode}`;

      // 可以调用后端API生成二维码图片
      // const res = await get('/qrcode/generate', { scene: inviteCode });
      // this.setData({ qrCodeUrl: res.data.url });

      // 临时方案：使用第三方二维码生成服务
      const encodedUrl = encodeURIComponent(qrCodeUrl);
      this.setData({
        qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodedUrl}`
      });
    } catch (err) {
      console.error('生成二维码失败:', err);
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
