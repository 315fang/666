const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();

const WECHAT_APPID = process.env.WECHAT_APPID;
const WECHAT_SECRET = process.env.WECHAT_SECRET;

/**
 * 使用code换取openid和session_key
 * @param {string} code - 微信登录code
 * @returns {Promise<{openid: string, session_key: string}>}
 */
async function code2Session(code) {
    try {
        const url = 'https://api.weixin.qq.com/sns/jscode2session';
        const response = await axios.get(url, {
            params: {
                appid: WECHAT_APPID,
                secret: WECHAT_SECRET,
                js_code: code,
                grant_type: 'authorization_code'
            }
        });

        const data = response.data;

        if (data.errcode) {
            throw new Error(`微信接口错误: ${data.errmsg}`);
        }

        return {
            openid: data.openid,
            session_key: data.session_key
        };
    } catch (error) {
        console.error('code2Session错误:', error.message);
        throw error;
    }
}

/**
 * 生成订单号
 * @returns {string} 格式: ORD + 时间戳 + 加密随机数（防碰撞）
 */
function generateOrderNo() {
    const timestamp = Date.now();
    const random = crypto.randomBytes(4).toString('hex');
    return `ORD${timestamp}${random}`;
}

module.exports = {
    code2Session,
    generateOrderNo
};
