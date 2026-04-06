/**
 * 方案 A：仅 wx.getFuzzyLocation；站点地图提供「地图选点」作为精确参考。
 * 放在 stations 分包内，避免主包出现「仅分包引用」的未使用 JS 校验失败。
 * 与 pages/order/utils/fuzzyLocation.js 逻辑相同（分包之间不宜互相 require）。
 */
function getFuzzyCoordinates() {
    return new Promise((resolve) => {
        wx.getFuzzyLocation({
            type: 'gcj02',
            success: (res) =>
                resolve({
                    latitude: res.latitude,
                    longitude: res.longitude
                }),
            fail: () => resolve(null)
        });
    });
}

module.exports = { getFuzzyCoordinates };
