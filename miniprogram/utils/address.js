/**
 * 地址相关工具函数
 */
const { get } = require('./request');

/**
 * 加载收货地址列表
 * @returns {Promise<Array>} 地址列表
 */
async function loadAddresses() {
  try {
    const res = await get('/addresses');
    return res.list || res.data || [];
  } catch (err) {
    console.error('加载地址列表失败:', err);
    throw err;
  }
}

/**
 * 获取默认地址
 * @returns {Promise<Object|null>} 默认地址或第一个地址
 */
async function getDefaultAddress() {
  try {
    const addresses = await loadAddresses();
    if (!addresses || addresses.length === 0) return null;
    
    // 优先返回默认地址，否则返回第一个
    return addresses.find(a => a.is_default) || addresses[0];
  } catch (err) {
    return null;
  }
}

/**
 * 跳转到地址选择页
 * @param {boolean} isSelect - 是否为选择模式
 */
function navigateToAddressList(isSelect = true) {
  wx.navigateTo({
    url: `/pages/address/list?select=${isSelect}`
  });
}

/**
 * 跳转到地址编辑页
 * @param {number|null} id - 地址 ID（新增传 null）
 */
function navigateToAddressEdit(id = null) {
  const url = id ? `/pages/address/edit?id=${id}` : '/pages/address/edit';
  wx.navigateTo({ url });
}

module.exports = {
  loadAddresses,
  getDefaultAddress,
  navigateToAddressList,
  navigateToAddressEdit
};
