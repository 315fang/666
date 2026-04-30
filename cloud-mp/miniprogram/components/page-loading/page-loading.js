Component({
  properties: {
    show: {
      type: Boolean,
      value: false
    },
    text: {
      type: String,
      value: '加载中...'
    },
    fullscreen: {
      type: Boolean,
      value: true,
      observer: function() {
        this._syncRootClass();
      }
    }
  },

  data: {
    rootClass: 'page-loading fullscreen'
  },

  lifetimes: {
    attached() {
      this._syncRootClass();
    }
  },

  methods: {
    _syncRootClass() {
      this.setData({
        rootClass: this.data.fullscreen ? 'page-loading fullscreen' : 'page-loading'
      });
    }
  }
});
