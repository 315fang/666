/**
 * AI 内容审查服务（基础实现）
 * 当前提供可用的最小能力，避免后台商品接口因模块缺失导致服务无法启动。
 */
class AIService {
    /**
     * 审查文本内容
     * @param {string} content 文本内容
     * @param {string} scene 场景标识（product/content 等）
     * @returns {Promise<{approved:boolean, reason:string}>}
     */
    static async reviewContent(content = '', scene = 'general') {
        // 预留后续接入真实 AI 审核能力
        return {
            approved: true,
            reason: `review-skipped:${scene}`
        };
    }
}

module.exports = AIService;
