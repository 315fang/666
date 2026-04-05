Component({
    properties: {},

    data: {},

    methods: {
        onMoreTap() {
            wx.switchTab({
                url: '/pages/activity/activity'
            });
        },

        onGroupBuyTap() {
            wx.navigateTo({
                url: '/pages/group/list'
            });
        },

        onSlashTap() {
            wx.navigateTo({
                url: '/pages/slash/list'
            });
        }
    }
});
