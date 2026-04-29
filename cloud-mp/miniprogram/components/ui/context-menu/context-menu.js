var vibrateManager = require('../../../utils/vibrateManager');

Component({
  properties: {
    actions: {
      type: Array,
      value: []
    }
  },

  data: {
    visible: false,
    animating: false,
    x: 0,
    y: 0
  },

  methods: {
    show: function(e) {
      var touch = e.touches ? e.touches[0] : e;
      var clientX = touch.clientX;
      var clientY = touch.clientY;
      var sys = wx.getSystemInfoSync();
      var windowWidth = sys.windowWidth;
      var windowHeight = sys.windowHeight;
      var menuWidth = 280;
      var menuHeight = (this.data.actions.length || 3) * 88 + 16;

      var x = clientX;
      var y = clientY;

      if (x + menuWidth > windowWidth) x = windowWidth - menuWidth - 16;
      if (y + menuHeight > windowHeight) y = clientY - menuHeight;
      if (x < 16) x = 16;
      if (y < 16) y = 16;

      var vib = vibrateManager.getVibrateManager();
      vib.short();

      var self = this;
      this.setData({ visible: true, x: x, y: y, animating: true });
      setTimeout(function() {
        self.setData({ animating: false });
      }, 300);
    },

    hide: function() {
      var self = this;
      this.setData({ animating: true });
      setTimeout(function() {
        self.setData({ visible: false, animating: false });
      }, 250);
    },

    onMaskTap: function() {
      this.hide();
    },

    onActionTap: function(e) {
      var index = e.currentTarget.dataset.index;
      this.triggerEvent('select', { index: index, action: this.data.actions[index] });
      this.hide();
    },

    stopPropagation: function() {}
  }
});
