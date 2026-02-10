// components/product-card/product-card.js
Component({
  options: {
    styleIsolation: 'shared'
  },
  properties: {
    product: {
      type: Object,
      value: {}
    }
  },
  methods: {
    onTap() {
      this.triggerEvent('click', { product: this.data.product });
    }
  }
});
