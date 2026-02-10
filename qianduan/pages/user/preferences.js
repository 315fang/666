Page({
  data: {
    style: '',
    categories: []
  },

  onSelectStyle(e) {
    const val = e.currentTarget.dataset.val;
    this.setData({ style: val });
  },

  onSelectCategory(e) {
    const val = e.currentTarget.dataset.val;
    let categories = this.data.categories;
    if (categories.includes(val)) {
      categories = categories.filter(c => c !== val);
    } else {
      categories.push(val);
    }
    this.setData({ categories });
  },

  onSave() {
    wx.showToast({
      title: '保存成功',
      icon: 'success'
    });
    setTimeout(() => {
      wx.navigateBack();
    }, 1500);
  }
})