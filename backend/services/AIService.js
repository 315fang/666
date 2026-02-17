const axios = require('axios');

/**
 * AI服务 - 支持多服务商配置
 * 服务商: 智谱AI、通义千问、DeepSeek、OpenRouter、ModelScope、OpenAI、自定义
 */
class AIService {
    constructor() {
        this.initialized = false;
        this.config = {
            enabled: false,
            provider: 'zhipu',
            apiKey: '',
            apiEndpoint: '',
            model: 'glm-4-flash',
            maxTokens: 2000,
            temperature: 0.7,
            timeout: 30000
        };
        
        // 服务商预设配置
        this.providerPresets = {
            zhipu: {
                name: '智谱AI',
                endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
                models: ['glm-4-flash', 'glm-4', 'glm-4-plus'],
                defaultModel: 'glm-4-flash'
            },
            qwen: {
                name: '通义千问',
                endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
                models: ['qwen-turbo', 'qwen-plus', 'qwen-max'],
                defaultModel: 'qwen-turbo'
            },
            deepseek: {
                name: 'DeepSeek',
                endpoint: 'https://api.deepseek.com/v1/chat/completions',
                models: ['deepseek-chat', 'deepseek-coder'],
                defaultModel: 'deepseek-chat'
            },
            openrouter: {
                name: 'OpenRouter',
                endpoint: 'https://openrouter.ai/api/v1/chat/completions',
                models: [
                    'openai/gpt-4o-mini',
                    'openai/gpt-4o',
                    'anthropic/claude-3-haiku',
                    'google/gemini-flash-1.5',
                    'meta-llama/llama-3-8b-instruct',
                    'qwen/qwen-2-7b-instruct'
                ],
                defaultModel: 'openai/gpt-4o-mini'
            },
            modelscope: {
                name: 'ModelScope',
                endpoint: 'https://api-inference.modelscope.cn/v1/chat/completions',
                models: ['qwen-turbo', 'qwen-plus', 'chatglm3-6b', 'baichuan2-13b-chat'],
                defaultModel: 'qwen-turbo'
            },
            openai: {
                name: 'OpenAI',
                endpoint: 'https://api.openai.com/v1/chat/completions',
                models: ['gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo', 'gpt-4o', 'gpt-4o-mini'],
                defaultModel: 'gpt-4o-mini'
            }
        };
    }

    /**
     * 初始化配置（从数据库读取）
     */
    async init() {
        if (this.initialized) return;
        
        try {
            const ConfigService = require('./ConfigService');
            
            // 从数据库读取配置，优先级：数据库 > 环境变量
            const dbEnabled = await ConfigService.get('AI_ENABLED');
            const dbProvider = await ConfigService.get('AI_PROVIDER');
            const dbApiKey = await ConfigService.get('AI_API_KEY');
            const dbEndpoint = await ConfigService.get('AI_API_ENDPOINT');
            const dbModel = await ConfigService.get('AI_MODEL');
            const dbMaxTokens = await ConfigService.get('AI_MAX_TOKENS');
            const dbTemperature = await ConfigService.get('AI_TEMPERATURE');
            const dbTimeout = await ConfigService.get('AI_TIMEOUT');
            
            // 合并配置
            this.config.enabled = dbEnabled === 'true' || process.env.AI_ENABLED === 'true';
            this.config.provider = dbProvider || process.env.AI_PROVIDER || 'zhipu';
            this.config.apiKey = dbApiKey || process.env.AI_API_KEY || '';
            this.config.model = dbModel || process.env.AI_MODEL || '';
            this.config.maxTokens = parseInt(dbMaxTokens) || parseInt(process.env.AI_MAX_TOKENS) || 2000;
            this.config.temperature = parseFloat(dbTemperature) || parseFloat(process.env.AI_TEMPERATURE) || 0.7;
            this.config.timeout = parseInt(dbTimeout) || parseInt(process.env.AI_TIMEOUT) || 30000;
            
            // 设置API端点
            if (dbEndpoint) {
                this.config.apiEndpoint = dbEndpoint;
            } else if (process.env.AI_API_ENDPOINT) {
                this.config.apiEndpoint = process.env.AI_API_ENDPOINT;
            } else {
                // 使用服务商预设端点
                const preset = this.providerPresets[this.config.provider];
                this.config.apiEndpoint = preset ? preset.endpoint : '';
            }
            
            // 设置默认模型
            if (!this.config.model) {
                const preset = this.providerPresets[this.config.provider];
                this.config.model = preset ? preset.defaultModel : 'gpt-3.5-turbo';
            }
            
            this.initialized = true;
            console.log(`[AIService] 初始化完成 - 服务商: ${this.config.provider}, 模型: ${this.config.model}, 启用: ${this.config.enabled}`);
            
        } catch (error) {
            console.error('[AIService] 初始化失败，使用环境变量配置:', error.message);
            // 回退到环境变量
            this.config.enabled = process.env.AI_ENABLED === 'true';
            this.config.provider = process.env.AI_PROVIDER || 'zhipu';
            this.config.apiKey = process.env.AI_API_KEY || '';
            this.config.apiEndpoint = process.env.AI_API_ENDPOINT || this.providerPresets[this.config.provider]?.endpoint || '';
            this.config.model = process.env.AI_MODEL || this.providerPresets[this.config.provider]?.defaultModel || '';
            this.initialized = true;
        }
    }

    /**
     * 重新加载配置（配置更新后调用）
     */
    async reloadConfig() {
        this.initialized = false;
        await this.init();
    }

    /**
     * 检查AI是否启用
     */
    isEnabled() {
        return this.config.enabled && this.config.apiKey;
    }

    /**
     * 获取当前配置
     */
    getConfig() {
        return { ...this.config };
    }

    /**
     * 获取服务商列表
     */
    getProviders() {
        return Object.entries(this.providerPresets).map(([key, value]) => ({
            value: key,
            label: value.name,
            models: value.models,
            defaultModel: value.defaultModel
        }));
    }

    /**
     * 获取指定服务商的模型列表
     */
    getModels(provider) {
        const preset = this.providerPresets[provider];
        return preset ? preset.models : [];
    }

    /**
     * 发送聊天消息
     * @param {Array} messages 消息历史 [{role: 'user', content: '...'}, ...]
     * @param {Object} options 可选配置
     */
    async chat(messages, options = {}) {
        await this.init();
        
        if (!this.isEnabled()) {
            throw new Error('AI功能未启用或未配置API密钥');
        }

        try {
            const systemPrompt = options.systemPrompt || {
                role: 'system',
                content: '你是S2B2C商城的智能客服助手，负责解答用户关于订单、商品、售后等问题。请用亲切、专业的语气回复。如果无法解决，请建议用户联系人工客服。'
            };

            const payload = {
                model: options.model || this.config.model,
                messages: [systemPrompt, ...messages],
                temperature: options.temperature ?? this.config.temperature,
                max_tokens: options.maxTokens ?? this.config.maxTokens
            };

            // OpenRouter需要额外的headers
            const headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.config.apiKey}`
            };
            
            if (this.config.provider === 'openrouter') {
                headers['HTTP-Referer'] = 'https://s2b2c-mall.com';
                headers['X-Title'] = 'S2B2C商城';
            }

            const response = await axios.post(this.config.apiEndpoint, payload, {
                headers,
                timeout: this.config.timeout
            });

            if (response.data && response.data.choices && response.data.choices.length > 0) {
                return response.data.choices[0].message.content;
            } else {
                throw new Error('AI返回数据格式错误');
            }
        } catch (error) {
            console.error('[AIService] 调用失败:', error.message);
            if (error.response) {
                console.error('[AIService] API响应:', error.response.data);
            }
            throw new Error('智能助手暂时繁忙，请稍后再试');
        }
    }

    /**
     * 内容审核
     * @param {string} text 待审核内容
     * @param {string} type 审核类型 'product' | 'comment' | 'withdrawal'
     */
    async reviewContent(text, type) {
        await this.init();
        
        if (!this.isEnabled()) {
            return { approved: true, reason: 'AI审核服务未启用，自动通过' };
        }

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

            const response = await this.chat([{ role: 'user', content: prompt }], {
                temperature: 0.1,
                maxTokens: 500
            });

            // 解析JSON
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
            return { approved: false, reason: '无法解析审核结果' };
        } catch (error) {
            console.error('[AIService] 审核失败:', error.message);
            return { approved: false, reason: 'AI审核服务异常，转人工' };
        }
    }

    /**
     * 测试AI连接
     */
    async testConnection(testConfig = null) {
        const config = testConfig || this.config;
        
        if (!config.apiKey) {
            return { success: false, message: '请先配置API密钥' };
        }

        try {
            const endpoint = config.apiEndpoint || this.providerPresets[config.provider]?.endpoint;
            const model = config.model || this.providerPresets[config.provider]?.defaultModel;

            const headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey}`
            };
            
            if (config.provider === 'openrouter') {
                headers['HTTP-Referer'] = 'https://s2b2c-mall.com';
                headers['X-Title'] = 'S2B2C商城';
            }

            const response = await axios.post(endpoint, {
                model,
                messages: [{ role: 'user', content: '你好，这是一个连接测试' }],
                max_tokens: 50
            }, {
                headers,
                timeout: 15000
            });

            if (response.data && response.data.choices) {
                return {
                    success: true,
                    message: 'AI连接测试成功',
                    provider: config.provider,
                    model,
                    response: response.data.choices[0].message.content.substring(0, 100)
                };
            } else {
                return { success: false, message: 'AI返回数据格式异常' };
            }
        } catch (error) {
            let message = '连接失败: ' + error.message;
            if (error.response) {
                if (error.response.status === 401) {
                    message = 'API密钥无效或已过期';
                } else if (error.response.status === 429) {
                    message = 'API调用频率超限，请稍后再试';
                } else {
                    message = `API错误: ${error.response.data?.error?.message || error.response.statusText}`;
                }
            }
            return { success: false, message };
        }
    }
}

module.exports = new AIService();
