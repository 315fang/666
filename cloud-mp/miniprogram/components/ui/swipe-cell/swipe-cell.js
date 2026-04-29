var vibrateManager = require('../../../utils/vibrateManager');

Component({
  properties: {
    disabled: { type: Boolean, value: false },
    threshold: { type: Number, value: 60 },
    rightWidth: { type: Number, value: 150 }
  },

  data: {
    moveX: 0,
    isOpen: false,
    transitioning: false
  },

  methods: {
    onTouchStart: function(e) {
      if (this.data.disabled) return;
      this._startX = e.touches[0].clientX;
      this._startY = e.touches[0].clientY;
      this._moved = false;
      this._directionLocked = false;
      this._isHorizontal = false;
      this.setData({ transitioning: false });
    },

    onTouchMove: function(e) {
      if (this.data.disabled) return;
      var clientX = e.touches[0].clientX;
      var clientY = e.touches[0].clientY;
      var dx = clientX - this._startX;
      var dy = clientY - this._startY;

      if (!this._directionLocked) {
        if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
          this._directionLocked = true;
          this._isHorizontal = Math.abs(dx) > Math.abs(dy);
        }
        return;
      }

      if (!this._isHorizontal) return;

      this._moved = true;
      var isOpen = this.data.isOpen;
      var rightWidth = this.data.rightWidth;
      var base = isOpen ? -rightWidth : 0;
      var moveX = base + dx;

      moveX = Math.max(-rightWidth, Math.min(0, moveX));

      this.setData({ moveX: moveX });
    },

    onTouchEnd: function() {
      if (this.data.disabled || !this._moved) return;

      var moveX = this.data.moveX;
      var threshold = this.data.threshold;
      var rightWidth = this.data.rightWidth;
      var vib = vibrateManager.getVibrateManager();

      this.setData({ transitioning: true });

      if (moveX < -threshold) {
        this.setData({ moveX: -rightWidth, isOpen: true });
        vib.short();
      } else {
        this.setData({ moveX: 0, isOpen: false });
      }
    },

    close: function() {
      this.setData({ transitioning: true, moveX: 0, isOpen: false });
    },

    onActionTap: function(e) {
      var action = e.currentTarget.dataset.action;
      this.triggerEvent('action', { action: action });
    }
  }
});
