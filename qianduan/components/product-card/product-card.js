// components/product-card/product-card.js
Component({
  options: {
    styleIsolation: 'shared'
  },
  properties: {
    product: {
      type: Object,
      value: {}
    },
    mode: {
      type: String,
      value: 'vertical' // 'vertical' | 'horizontal'
    }
  },
  methods: {
    onTap() {
      this.triggerEvent('click', { product: this.data.product });
    }
  }
});
