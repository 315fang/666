/**
 * 用户认证相关 API
 */
const { post } = require('./request');

/**
 * 微信登录
 * @param {Object} params
 * @param {string} params.code - wx.login 获取的 code
 * @param {string} params.distributor_id - 分销员邀请码（可选）
 */
function login(params) {
    return post('/login', params);
}

/**
 * 获取用户信息
 */
function getUserInfo() {
    return require('./request').get('/user/profile');
}

/**
 * 更新用户信息
 * @param {Object} data - 用户信息 { nickName, avatarUrl }
 */
function updateUserInfo(data) {
    return require('./request').put('/user/profile', data);
}

module.exports = {
    login,
    getUserInfo,
    updateUserInfo
};
