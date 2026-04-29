Component({
  data: {
    particles: [],
    active: false
  },

  methods: {
    noop() {},

    trigger(type, options) {
      type = type || 'confetti';
      options = options || {};
      var count = options.count || 40;
      var duration = options.duration || 2500;
      var colors = options.colors || ['#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe', '#00f2fe', '#C6A16E'];

      var particles = [];
      for (var i = 0; i < count; i++) {
        particles.push({
          id: i,
          type: type,
          left: Math.random() * 100,
          delay: Math.random() * 800,
          duration: duration * 0.6 + Math.random() * duration * 0.4,
          size: type === 'stars' ? 8 + Math.random() * 16 : 6 + Math.random() * 10,
          color: colors[Math.floor(Math.random() * colors.length)],
          rotation: Math.random() * 360,
          swingRange: 20 + Math.random() * 60,
          swingSpeed: 1 + Math.random() * 2
        });
      }

      this.setData({ particles: particles, active: true });

      var self = this;
      setTimeout(function() {
        self.setData({ active: false, particles: [] });
      }, duration + 1000);
    },

    success() {
      this.trigger('stars', {
        count: 25,
        duration: 2000,
        colors: ['#667eea', '#764ba2', '#C6A16E', '#4facfe']
      });
    },

    celebrate() {
      this.trigger('confetti', {
        count: 50,
        duration: 3000
      });
    }
  }
});
