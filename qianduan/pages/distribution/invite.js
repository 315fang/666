// pages/distribution/invite.js - 邀请好友页面（问卷邀请版）
const app = getApp();
const { get } = require('../../utils/request');

Page({
  data: {
    userInfo: null,
    canShare: false,
    loading: true, // 防止 API 返回前闪现"无资格"界面
    team: {
      totalCount: 0,
      directCount: 0,
      indirectCount: 0
    }
  },

  onLoad() {
    this.loadUserData();
    this.checkShareEligibility();
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

    this.setData({ userInfo });
  },

  /**
   * 检查分享资格（有团队才能分享问卷）
   */
  async checkShareEligibility() {
    try {
      const res = await get('/questionnaire/share-eligibility');
      if (res.code === 0) {
        this.setData({
          canShare: res.data.eligible,
          loading: false
        });
      } else {
        this.setData({ loading: false });
      }
    } catch (err) {
      console.error('检查分享资格失败:', err);
      // 降级：根据本地数据判断
      const userInfo = app.globalData.userInfo;
      if (userInfo) {
        this.setData({
          canShare: !!(userInfo.parent_id || (userInfo.role_level && userInfo.role_level >= 1)),
          loading: false
        });
      } else {
        this.setData({ loading: false });
      }
    }
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
   * 无资格提示
   */
  onNoEligibilityTap() {
    wx.showModal({
      title: '暂无分享资格',
      content: '您尚未加入任何团队，需要先加入一个团队后才能分享邀请问卷。\n\n请联系您的推荐人获取邀请链接。',
      showCancel: false,
      confirmText: '知道了'
    });
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
   * 分享配置 - 分享邀请问卷
   */
  onShareAppMessage() {
    const { userInfo } = this.data;
    const userId = userInfo ? userInfo.id : '';
    return {
      title: `${userInfo?.nickname || '我'}邀请你加入团队`,
      path: `/pages/questionnaire/fill?inviter_id=${userId}`,
      imageUrl: ''
    };
  },

  /**
   * 分享到朋友圈
   */
  onShareTimeline() {
    const { userInfo } = this.data;
    const userId = userInfo ? userInfo.id : '';
    return {
      title: '臻选 · 精选全球好物，邀你一起赚',
      query: `inviter_id=${userId}`,
      imageUrl: ''
    };
  }
});
