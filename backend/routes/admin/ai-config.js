const express = require('express');
const router = express.Router();
const AIService = require('../../services/AIService');
const ConfigService = require('../../services/ConfigService');
const { adminAuth, checkPermission } = require('../../middleware/adminAuth');

/**
 * AI配置管理路由
 */

/**
 * 获取AI配置
 */
router.get('/config', adminAuth, async (req, res) => {
    try {
        const config = await ConfigService.getByGroup('AI');
        
        // 脱敏处理API密钥
        if (config.AI_API_KEY) {
            const key = config.AI_API_KEY;
            config.AI_API_KEY = key.length > 8 
                ? key.substring(0, 4) + '****' + key.substring(key.length - 4)
                : '****';
            config._hasApiKey = true;
        } else {
            config._hasApiKey = false;
        }
        
        // 获取服务商预设信息
        const providers = AIService.getProviders();
        
        res.json({
            code: 0,
            data: {
                config,
                providers,
                currentProvider: providers.find(p => p.value === (config.AI_PROVIDER || 'zhipu'))
            }
        });
    } catch (error) {
        console.error('[AI Config] 获取配置失败:', error);
        res.status(500).json({
            code: 500,
            message: error.message
        });
    }
});

/**
 * 获取服务商列表
 */
router.get('/providers', adminAuth, async (req, res) => {
    try {
        const providers = AIService.getProviders();
        
        // 从数据库获取服务商预设配置
        const providerConfigs = {};
        for (const key of ['zhipu', 'qwen', 'deepseek', 'openrouter', 'modelscope', 'openai']) {
            const configValue = await ConfigService.get(`AI_PROVIDER_CONFIG_${key.toUpperCase()}`);
            if (configValue) {
                try {
                    providerConfigs[key] = JSON.parse(configValue);
                } catch (e) {
                    // 忽略解析错误
                }
            }
        }
        
        res.json({
            code: 0,
            data: {
                providers,
                providerConfigs
            }
        });
    } catch (error) {
        res.status(500).json({
            code: 500,
            message: error.message
        });
    }
});

/**
 * 获取指定服务商的模型列表
 */
router.get('/providers/:provider/models', adminAuth, async (req, res) => {
    try {
        const { provider } = req.params;
        const models = AIService.getModels(provider);
        
        res.json({
            code: 0,
            data: { models }
        });
    } catch (error) {
        res.status(500).json({
            code: 500,
            message: error.message
        });
    }
});

/**
 * 更新AI配置
 */
router.put('/config', adminAuth, checkPermission('system'), async (req, res) => {
    try {
        const adminId = req.user.id;
        const updates = [];
        
        // 允许更新的配置项
        const allowedKeys = [
            'AI_ENABLED',
            'AI_PROVIDER',
            'AI_API_KEY',
            'AI_API_ENDPOINT',
            'AI_MODEL',
            'AI_CHAT_ENABLED',
            'AI_OPS_ENABLED',
            'AI_ADMIN_ASSISTANT_ENABLED',
            'AI_MAX_TOKENS',
            'AI_TEMPERATURE',
            'AI_TIMEOUT',
            'AI_OPS_ERROR_WATCH_INTERVAL',
            'AI_OPS_HEALTH_CHECK_INTERVAL',
            'AI_OPS_ORDER_ANOMALY_INTERVAL'
        ];
        
        for (const [key, value] of Object.entries(req.body)) {
            if (allowedKeys.includes(key)) {
                updates.push({ key, value: String(value) });
            }
        }
        
        if (updates.length === 0) {
            return res.status(400).json({
                code: 400,
                message: '没有有效的配置项'
            });
        }
        
        // 批量更新
        const results = await ConfigService.setMultiple(updates, adminId, '更新AI配置');
        
        // 重新加载AI服务配置
        await AIService.reloadConfig();
        
        const successCount = results.filter(r => r.success).length;
        
        res.json({
            code: 0,
            data: {
                results,
                summary: {
                    total: results.length,
                    success: successCount,
                    failed: results.length - successCount
                }
            },
            message: `AI配置已更新（${successCount}/${results.length}项）`
        });
    } catch (error) {
        console.error('[AI Config] 更新配置失败:', error);
        res.status(500).json({
            code: 500,
            message: error.message
        });
    }
});

/**
 * 测试AI连接
 */
router.post('/test', adminAuth, async (req, res) => {
    try {
        // 支持测试自定义配置
        const testConfig = req.body.apiKey ? {
            provider: req.body.provider || AIService.config.provider,
            apiKey: req.body.apiKey,
            apiEndpoint: req.body.apiEndpoint,
            model: req.body.model
        } : null;
        
        const result = await AIService.testConnection(testConfig);
        
        res.json({
            code: result.success ? 0 : -1,
            data: result,
            message: result.message
        });
    } catch (error) {
        res.json({
            code: -1,
            data: { success: false, message: error.message },
            message: error.message
        });
    }
});

/**
 * 重置AI配置为默认值
 */
router.post('/reset', adminAuth, checkPermission('system'), async (req, res) => {
    try {
        const adminId = req.user.id;
        
        const defaultConfig = [
            { key: 'AI_ENABLED', value: 'false' },
            { key: 'AI_PROVIDER', value: 'zhipu' },
            { key: 'AI_MODEL', value: 'glm-4-flash' },
            { key: 'AI_MAX_TOKENS', value: '2000' },
            { key: 'AI_TEMPERATURE', value: '0.7' },
            { key: 'AI_TIMEOUT', value: '30000' },
            { key: 'AI_CHAT_ENABLED', value: 'true' },
            { key: 'AI_OPS_ENABLED', value: 'true' },
            { key: 'AI_ADMIN_ASSISTANT_ENABLED', value: 'true' }
        ];
        
        const results = await ConfigService.setMultiple(defaultConfig, adminId, '重置AI配置');
        
        // 重新加载配置
        await AIService.reloadConfig();
        
        res.json({
            code: 0,
            message: 'AI配置已重置为默认值',
            data: { results }
        });
    } catch (error) {
        res.status(500).json({
            code: 500,
            message: error.message
        });
    }
});

/**
 * 获取AI服务状态
 */
router.get('/status', adminAuth, async (req, res) => {
    try {
        const config = AIService.getConfig();
        const isEnabled = AIService.isEnabled();
        
        res.json({
            code: 0,
            data: {
                enabled: isEnabled,
                configured: !!config.apiKey,
                provider: config.provider,
                model: config.model,
                endpoint: config.apiEndpoint,
                features: {
                    chat: config.enabled && (await ConfigService.get('AI_CHAT_ENABLED')) !== 'false',
                    ops: config.enabled && (await ConfigService.get('AI_OPS_ENABLED')) !== 'false',
                    adminAssistant: config.enabled && (await ConfigService.get('AI_ADMIN_ASSISTANT_ENABLED')) !== 'false'
                }
            }
        });
    } catch (error) {
        res.status(500).json({
            code: 500,
            message: error.message
        });
    }
});

module.exports = router;
