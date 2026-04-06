/**
 * 方案 A：仅 wx.getFuzzyLocation；需更准坐标请用 wx.chooseLocation（订单确认页）。
 * 放在 order 分包内，避免主包出现「仅分包引用」的未使用 JS 校验失败。
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
