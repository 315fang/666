const axios = require('axios');
const { Configuration, OpenAIApi } = require('openai'); // Assuming standard usage, but will use axios directly for flexibility with custom endpoints

class AIService {
    constructor() {
        // Retrieve config from environment variables
        this.apiKey = process.env.AI_API_KEY || 'YOUR_API_KEY';
        this.apiEndpoint = process.env.AI_API_ENDPOINT || 'https://api.openai.com/v1/chat/completions';
        this.model = process.env.AI_MODEL || 'gpt-3.5-turbo';
    }

    /**
     * Send a message to the AI and get a response
     * @param {Array} messages History of messages [{role: 'user', content: '...'}, ...]
     * @returns {Promise<string>} AI response content
     */
    async chat(messages) {
        try {
            // Basic system prompt to define the AI's role
            const systemPrompt = {
                role: 'system',
                content: '你是S2B2C商城的智能客服助手，负责解答用户关于订单、商品、售后等问题。请用亲切、专业的语气回复。如果无法解决，请建议用户联系人工客服。'
            };

            const payload = {
                model: this.model,
                messages: [systemPrompt, ...messages],
                temperature: 0.7
            };

            const response = await axios.post(this.apiEndpoint, payload, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                timeout: 30000 // 30s timeout
            });

            if (response.data && response.data.choices && response.data.choices.length > 0) {
                return response.data.choices[0].message.content;
            } else {
                throw new Error('Invalid response from AI provider');
            }
        } catch (error) {
            console.error('AI Service Error:', error.message);
            if (error.response) {
                console.error('AI API Response:', error.response.data);
            }
            throw new Error('智能助手暂时繁忙，请稍后再试');
        }
    }

    /**
     * Automated Content Review
     * @param {string} text Content to review
     * @param {string} type 'product' | 'comment' | 'withdrawal'
     * @returns {Promise<{approved: boolean, reason: string}>}
     */
    async reviewContent(text, type) {
        try {
            let prompt = '';
            switch (type) {
                case 'product':
                    prompt = `请审查以下商品描述是否存在违规内容（如虚假宣传、色情暴力、政治敏感等）。只回答JSON格式：{"approved": true/false, "reason": "..."}。\n内容：${text}`;
                    break;
                case 'comment':
                    prompt = `请审查以下用户评论是否存在违规内容（如辱骂、广告、敏感信息）。只回答JSON格式：{"approved": true/false, "reason": "..."}。\n内容：${text}`;
                    break;
                default:
                    prompt = `请审查以下内容是否合规。只回答JSON格式：{"approved": true/false, "reason": "..."}。\n内容：${text}`;
            }

            const payload = {
                model: this.model,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.1
            };

            const response = await axios.post(this.apiEndpoint, payload, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                }
            });

            const content = response.data.choices[0].message.content;
            // Attempt to parse JSON
            try {
                // Find JSON substring in case of extra text
                const jsonMatch = content.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    return JSON.parse(jsonMatch[0]);
                }
                return { approved: false, reason: '无法解析审查结果' };
            } catch (e) {
                return { approved: false, reason: '审查结果格式错误' };
            }

        } catch (error) {
            console.error('AI Review Error:', error.message);
            // Default to approved if AI fails, or flag for manual review (safer to flag)
            return { approved: false, reason: 'AI审查服务异常，转人工' };
        }
    }
}

module.exports = new AIService();
