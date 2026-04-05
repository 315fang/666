// components/ui/button/button.js
Component({
  options: {
    styleIsolation: 'shared'
  },
  properties: {
    variant: {
      type: String,
      value: 'default' // default, secondary, outline, ghost, amber
    },
    size: {
      type: String,
      value: 'default-size' // default-size, sm, lg, icon
    },
    disabled: {
      type: Boolean,
      value: false
    },
    className: {
      type: String,
      value: ''
    },
    customStyle: {
      type: String,
      value: ''
    }
  },
  methods: {
    onTap(e) {
      if (!this.data.disabled) {
        this.triggerEvent('click', e);
      }
    }
  }
});
