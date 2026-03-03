Component({
    properties: {
        products: {
            type: Array,
            value: []
        }
    },

    data: {},

    methods: {
        onMoreTap() {
            wx.switchTab({
                url: '/pages/category/category'
            });
        },

        onProductTap(e) {
            const id = e.currentTarget.dataset.id;
            if (id) {
                wx.navigateTo({
                    url: `/pages/product/detail?id=${id}`
                });
            }
        }
    }
});
