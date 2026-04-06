// pages/user/preferences.js
const { post, get } = require('../../utils/request');

Page({
  data: {
    style: '',
    categories: [],
    loading: false,
    initialStyle: '',
    initialCategories: []
  },

  onLoad() {
    this.loadPreferences();
  },

  /**
   * 加载用户偏好设置
   */
  async loadPreferences() {
    try {
      wx.showLoading({ title: '加载中...' });
      const res = await get('/user/preferences');
      const prefs = res.data || res;

      this.setData({
        style: prefs.style || '',
        categories: prefs.categories || [],
        initialStyle: prefs.style || '',
        initialCategories: [...(prefs.categories || [])]
      });
    } catch (error) {
      console.log('加载偏好设置失败，使用默认值:', error);
      // 不显示错误，使用默认空值
    } finally {
      wx.hideLoading();
    }
  },

  /**
   * 选择风格
   */
  onSelectStyle(e) {
    const val = e.currentTarget.dataset.val;
    const newStyle = this.data.style === val ? '' : val;
    this.setData({ style: newStyle });
  },

  /**
   * 选择品类（多选）
   */
  onSelectCategory(e) {
    const val = e.currentTarget.dataset.val;
    let categories = [...this.data.categories];

    if (categories.includes(val)) {
      categories = categories.filter(c => c !== val);
    } else {
      categories.push(val);
    }

    this.setData({ categories });
  },

  /**
   * 保存偏好设置
   */
  async onSave() {
    const { style, categories, loading } = this.data;

    if (loading) return;

    // 验证至少选择一项
    if (!style && categories.length === 0) {
      wx.showToast({
        title: '请至少选择一项偏好',
        icon: 'none'
      });
      return;
    }

    try {
      this.setData({ loading: true });
      wx.showLoading({ title: '保存中...' });

      await post('/user/preferences', {
        style,
        categories
      });

      wx.hideLoading();
      wx.showToast({
        title: '保存成功',
        icon: 'success',
        duration: 1500
      });

      // 更新初始值
      this.setData({
        initialStyle: style,
        initialCategories: [...categories]
      });

      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    } catch (error) {
      console.error('保存偏好设置失败:', error);
      wx.hideLoading();
      wx.showToast({
        title: '保存失败，请重试',
        icon: 'none'
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  /**
   * 重置选择
   */
  onReset() {
    wx.showModal({
      title: '重置偏好',
      content: '确定要重置所有偏好设置吗？',
      success: (res) => {
        if (res.confirm) {
          this.setData({
            style: '',
            categories: []
          });
        }
      }
    });
  },

  /**
   * 检查是否有未保存的更改
   */
  hasUnsavedChanges() {
    const { style, categories, initialStyle, initialCategories } = this.data;

    if (style !== initialStyle) return true;
    if (categories.length !== initialCategories.length) return true;

    const sortedCurrent = [...categories].sort();
    const sortedInitial = [...initialCategories].sort();

    return !sortedCurrent.every((val, idx) => val === sortedInitial[idx]);
  },

  /**
   * 页面卸载前检查
   */
  onUnload() {
    if (this.hasUnsavedChanges()) {
      wx.showModal({
        title: '提示',
        content: '您有未保存的更改，确定要离开吗？',
        success: (res) => {
          if (!res.confirm) {
            // 阻止返回（在小程序中无法完全阻止，只能提示）
            return false;
          }
        }
      });
    }
  },

  /**
   * 分享配置
   */
  onShareAppMessage() {
    return {
      title: '定制您的专属购物体验',
      path: '/pages/user/preferences'
    };
  }
})