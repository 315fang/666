// components/ui/card/card.js
Component({
  options: {
    styleIsolation: 'shared',
    multipleSlots: true
  },
  properties: {
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
      this.triggerEvent('click', e);
    }
  }
});
