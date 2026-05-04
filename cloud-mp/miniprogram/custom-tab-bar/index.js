
var isActivityCenterEnabled;
var normalizeTabBarConfig;
var getMiniProgramConfig;

try {
  var config = require('../utils/miniProgramConfig');
  isActivityCenterEnabled = config.isActivityCenterEnabled;
  normalizeTabBarConfig = config.normalizeTabBarConfig;
  getMiniProgramConfig = config.getMiniProgramConfig;
} catch (e) {
  isActivityCenterEnabled = function() { return true; };
  normalizeTabBarConfig = function() { return { items: [], color: '#94A3B8', selectedColor: '#667eea', backgroundColor: '#FFFFFF' }; };
  getMiniProgramConfig = function() { return { brand_config: { tab_bar: {} } }; };
}

var TAB_META = [
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

var FALLBACK_TEXT = ['商城首页', '全部商品', '热门活动', '我的'];

Component({
  data: {
    list: [],
    selected: 0,
    color: '#9ca3af',
    selectedColor: '#2563eb',
    backgroundColor: '#FFFFFF',
    borderStyle: 'white',
    hidden: false
  },

  lifetimes: {
    attached: function() {
      this.refresh();
    }
  },

  pageLifetimes: {
    show: function() {
      this.refresh();
    }
  },

  methods: {
    _decorateList: function(list, selected, color, selectedColor) {
      var normalColor = color || this.data.color || '#94A3B8';
      var activeColor = selectedColor || this.data.selectedColor || '#667eea';
      return (Array.isArray(list) ? list : []).map(function(item, index) {
        var active = Number(selected) === index;
        return Object.assign({}, item, {
          active: active,
          itemClass: active ? 'tab-bar-item tab-bar-item-active' : 'tab-bar-item',
          displayIconPath: active ? item.selectedIconPath : item.iconPath,
          textColor: active ? activeColor : normalColor
        });
      });
    },

    setHidden: function(hide) {
      this._overlayHidden = !!hide;
      this.setData({ hidden: !!hide });
    },

    refresh: function() {
      this._rebuild();
      this._updateSelected();
      if (this._overlayHidden) {
        this.setData({ hidden: true });
      }
    },

    _rebuild: function() {
      var showActivity = isActivityCenterEnabled();
      var cfg = getMiniProgramConfig();
      var tb = normalizeTabBarConfig(cfg.brand_config.tab_bar);
      var textOf = function(idx) {
        var it = null;
        for (var i = 0; i < tb.items.length; i++) {
          if (Number(tb.items[i].index) === idx) { it = tb.items[i]; break; }
        }
        return it && it.text ? it.text : FALLBACK_TEXT[idx] || '';
      };
      var list = TAB_META.map(function(m) {
        return {
          pagePath: m.pagePath,
          iconPath: m.iconPath,
          selectedIconPath: m.selectedIconPath,
          text: textOf(m.tabIndex)
        };
      });
      if (!showActivity) {
        list.splice(2, 1);
      }
      var color = tb.color || '#94A3B8';
      var selectedColor = tb.selectedColor || '#667eea';
      this.setData({
        list: this._decorateList(list, this.data.selected || 0, color, selectedColor),
        color: color,
        selectedColor: selectedColor,
        backgroundColor: tb.backgroundColor || 'rgba(255,255,255,0.72)',
        borderStyle: tb.borderStyle
      });
    },

    _updateSelected: function() {
      var pages = getCurrentPages();
      if (!pages.length) return;
      var route = pages[pages.length - 1].route || '';
      var list = this.data.list;
      var idx = -1;
      for (var i = 0; i < list.length; i++) {
        if (list[i].pagePath === route) { idx = i; break; }
      }
      if (idx >= 0) {
        this.setData({
          selected: idx,
          list: this._decorateList(list, idx)
        });
      }
    },

    onSwitchTab: function(e) {
      var i = e.currentTarget.dataset.index;
      var item = this.data.list[i];
      if (!item) return;
      var pages = getCurrentPages();
      var currentRoute = pages.length ? (pages[pages.length - 1].route || '') : '';
      if (currentRoute === item.pagePath) {
        this._updateSelected();
        return;
      }

      wx.switchTab({ url: '/' + item.pagePath });
    }
  }
});
