/** 已合并至「足迹收藏」，保留路径以兼容旧入口 */
Page({
    onLoad() {
        wx.redirectTo({ url: '/pages/user/favorites-footprints?tab=footprints' });
    }
});
