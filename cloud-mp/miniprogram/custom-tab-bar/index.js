const {
  isActivityCenterEnabled,
  normalizeTabBarConfig,
  getMiniProgramConfig
} = require('../utils/miniProgramConfig');

const TAB_META = [
  {
    pagePath: 'pages/index/index',
    tabIndex: 0,
    iconPath: '/assets/tabbar-icons/home.svg',
    selectedIconPath: '/assets/tabbar-icons/home-active.svg'
  },
  {
    pagePath: 'pages/category/category',
    tabIndex: 1,
    iconPath: '/assets/tabbar-icons/category.svg',
    selectedIconPath: '/assets/tabbar-icons/category-active.svg'
  },
  {
    pagePath: 'pages/activity/activity',
    tabIndex: 2,
    iconPath: '/assets/tabbar-icons/activity.svg',
    selectedIconPath: '/assets/tabbar-icons/activity-active.svg'
  },
  {
    pagePath: 'pages/user/user',
    tabIndex: 3,
    iconPath: '/assets/tabbar-icons/user.svg',
    selectedIconPath: '/assets/tabbar-icons/user-active.svg'
  }
];

const FALLBACK_TEXT = ['商城首页', '全部商品', '热门活动', '我的会员'];

Component({
  data: {
    list: [],
    selected: 0,
    color: '#64748B',
    selectedColor: '#C6A16E',
    backgroundColor: '#F8FCFD',
    borderStyle: 'white',
    hidden: false
  },

  lifetimes: {
    attached() {
      this.refresh();
    }
  },

  pageLifetimes: {
    show() {
      this.refresh();
    }
  },

  methods: {
    /** 购物袋/弹窗等盖住底栏时由页面 syncPageTabBar 调用，勿使用 wx.showTabBar */
    setHidden(hide) {
      this._overlayHidden = !!hide;
      this.setData({ hidden: !!hide });
    },

    refresh() {
      this._rebuild();
      this._updateSelected();
      if (this._overlayHidden) {
        this.setData({ hidden: true });
      }
    },

    _rebuild() {
      const showActivity = isActivityCenterEnabled();
      const cfg = getMiniProgramConfig();
      const tb = normalizeTabBarConfig(cfg.brand_config.tab_bar);
      const textOf = (idx) => {
        const it = tb.items.find((x) => Number(x.index) === idx);
        return it && it.text ? it.text : FALLBACK_TEXT[idx] || '';
      };
      let list = TAB_META.map((m) => ({
        pagePath: m.pagePath,
        iconPath: m.iconPath,
        selectedIconPath: m.selectedIconPath,
        text: textOf(m.tabIndex)
      }));
      if (!showActivity) {
        list.splice(2, 1);
      }
      this.setData({
        list,
        color: tb.color,
        selectedColor: tb.selectedColor,
        backgroundColor: tb.backgroundColor,
        borderStyle: tb.borderStyle
      });
    },

    _updateSelected() {
      const pages = getCurrentPages();
      if (!pages.length) return;
      const route = pages[pages.length - 1].route || '';
      const { list } = this.data;
      const idx = list.findIndex((x) => x.pagePath === route);
      if (idx >= 0) {
        this.setData({ selected: idx });
      }
    },

    onSwitchTab(e) {
      const i = e.currentTarget.dataset.index;
      const item = this.data.list[i];
      if (!item) return;
      wx.switchTab({ url: `/${item.pagePath}` });
    }
  }
});
