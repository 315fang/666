/**
 * OrderCalcService — 纯函数工具服务
 * 提供：订单号生成、运费计算、微信支付描述构建等无状态工具函数
 */
const { secureRandomHex } = require('../utils/secureRandom');

let _orderSeq = 0;

/**
 * 生成唯一订单号
 * 格式: ORD + 时间(14位) + 序列(4位) + 随机hex(6位)
 */
const generateOrderNo = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const sec = String(now.getSeconds()).padStart(2, '0');
    _orderSeq = (_orderSeq + 1) % 10000;
    const seq = String(_orderSeq).padStart(4, '0');
    // ★ 安全修复: 使用 crypto.randomBytes 替代 Math.random()
    const random = secureRandomHex(6);
    return "ORD" + year + month + day + hour + min + sec + seq + random;
};

/**
 * 微信 JSAPI 下单 description，用于支付单与「小程序购物订单」展示（≤127 字）
 */
function buildWxJsapiShoppingDescription(order, productName) {
    const name = String(productName || '')
        .replace(/\s+/g, ' ')
        .trim();
    const displayName = name.length ? name : '商品';
    const q = Number(order.quantity);
    const suffix = Number.isFinite(q) && q > 1 ? `×${q}` : '';
    let desc = `${displayName}${suffix}`;
    const maxLen = 127;
    if (desc.length > maxLen) desc = desc.slice(0, maxLen);
    return desc;
}

/**
 * 根据运费策略和地址计算运费
 * @param {Object} policy - commercePolicy 对象
 * @param {Object} address - 地址快照
 * @returns {number} 运费金额
 */
const calcShippingFeeByPolicy = (policy, address) => {
    const shipping = policy?.shipping || {};
    if (!shipping.remote_region_extra_fee_enabled) return 0;
    const fee = Number(shipping.remote_region_fee || 0);
    if (!fee) return 0;
    const regionText = `${address?.province || ''}${address?.city || ''}${address?.district || ''}`;
    const remoteRegions = Array.isArray(shipping.remote_regions) ? shipping.remote_regions : [];
    const isRemote = remoteRegions.some(region => region && regionText.includes(region));
    return isRemote ? fee : 0;
};

module.exports = {
    generateOrderNo,
    buildWxJsapiShoppingDescription,
    calcShippingFeeByPolicy,
};
