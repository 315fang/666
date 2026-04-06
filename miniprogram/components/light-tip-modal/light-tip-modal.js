Component({
  properties: {
    show: { type: Boolean, value: false },
    title: { type: String, value: '' },
    content: { type: String, value: '' }
  },
  methods: {
    noop() {},
    onOk() {
      this.triggerEvent('close');
    },
    onMaskTap() {
      this.triggerEvent('close');
    }
  }
});
