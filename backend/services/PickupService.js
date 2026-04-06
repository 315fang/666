/**
 * PickupService — 自提凭证生成服务
 *
 * 从 pickupController 提取，供 OrderCoreService 等上层 Service 调用，
 * 解除 Service → Controller 的反向依赖。
 */
const crypto = require('crypto');

// ── 工具函数 ──
function genPickupCode() {
    // 16位大写字母+数字，排除易混淆字符 0/O/I/1
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 16; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}

function genQrToken(orderId, pickupCode) {
    return crypto
        .createHash('sha256')
        .update(`${orderId}:${pickupCode}:${process.env.JWT_SECRET || 'pickup_salt'}`)
        .digest('hex');
}

/**
 * 生成自提凭证（下单时调用，内部方法，非路由直接调用）
 * 返回 { pickup_code, pickup_qr_token } 以供写入订单
 */
function generatePickupCredentials(orderId) {
    const pickup_code = genPickupCode();
    const pickup_qr_token = genQrToken(orderId, pickup_code);
    return { pickup_code, pickup_qr_token };
}

module.exports = { generatePickupCredentials };
