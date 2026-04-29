Component({
  properties: {
    src: { type: String, value: '' },
    mode: { type: String, value: 'aspectFill' },
    width: { type: String, value: '100%' },
    height: { type: String, value: '100%' },
    radius: { type: String, value: '0' },
    placeholder: { type: String, value: '' },
    lazyLoad: { type: Boolean, value: true },
    fadeDuration: { type: Number, value: 350 }
  },

  data: {
    loaded: false,
    error: false,
    fadeInStyle: ''
  },

  observers: {
    'src': function(src) {
      if (src) {
        this.setData({ loaded: false, error: false, fadeInStyle: 'opacity:0;' });
      }
    }
  },

  methods: {
    onImageLoad: function() {
      var duration = this.data.fadeDuration;
      var self = this;
      this.setData({
        loaded: true,
        fadeInStyle: 'opacity:0;transition:opacity ' + duration + 'ms ease;'
      });
      setTimeout(function() {
        self.setData({ fadeInStyle: 'opacity:1;transition:opacity ' + duration + 'ms ease;' });
      }, 30);
      this.triggerEvent('load');
    },

    onImageError: function() {
      this.setData({ error: true, loaded: true });
      this.triggerEvent('error');
    }
  }
});
