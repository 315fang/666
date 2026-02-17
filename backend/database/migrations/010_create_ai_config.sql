-- AI配置迁移文件
-- 创建时间: 2026-02-13
-- 说明: 添加AI配置项到system_configs表

-- AI基础配置
INSERT INTO system_configs (config_key, config_value, config_group, is_sensitive, is_editable, description, validation_rule, created_at, updated_at) VALUES
-- 基础开关
('AI_ENABLED', 'false', 'AI', false, true, '是否启用AI功能', 'boolean', NOW(), NOW()),
('AI_PROVIDER', 'zhipu', 'AI', false, true, 'AI服务商 (zhipu/qwen/deepseek/openrouter/modelscope/openai/custom)', 'enum:zhipu,qwen,deepseek,openrouter,modelscope,openai,custom', NOW(), NOW()),

-- API配置（敏感）
('AI_API_KEY', '', 'AI', true, true, 'AI API密钥', 'string', NOW(), NOW()),
('AI_API_ENDPOINT', '', 'AI', false, true, 'AI API地址（自定义时使用）', 'url', NOW(), NOW()),
('AI_MODEL', 'glm-4-flash', 'AI', false, true, 'AI模型名称', 'string', NOW(), NOW()),

-- 功能开关
('AI_CHAT_ENABLED', 'true', 'AI', false, true, '启用AI客服对话', 'boolean', NOW(), NOW()),
('AI_OPS_ENABLED', 'true', 'AI', false, true, '启用AI运维监控', 'boolean', NOW(), NOW()),
('AI_ADMIN_ASSISTANT_ENABLED', 'true', 'AI', false, true, '启用管理员AI助手', 'boolean', NOW(), NOW()),

-- 高级配置
('AI_MAX_TOKENS', '2000', 'AI', false, true, '最大Token数', 'number:100,8000', NOW(), NOW()),
('AI_TEMPERATURE', '0.7', 'AI', false, true, '温度参数 (0-1，越高越随机)', 'number:0,1', NOW(), NOW()),
('AI_TIMEOUT', '30000', 'AI', false, true, '请求超时时间（毫秒）', 'number:5000,60000', NOW(), NOW()),

-- 运维监控配置
('AI_OPS_ERROR_WATCH_INTERVAL', '60000', 'AI', false, true, '错误日志监控间隔（毫秒）', 'number:30000,300000', NOW(), NOW()),
('AI_OPS_HEALTH_CHECK_INTERVAL', '60000', 'AI', false, true, '系统健康检查间隔（毫秒）', 'number:30000,300000', NOW(), NOW()),
('AI_OPS_ORDER_ANOMALY_INTERVAL', '300000', 'AI', false, true, '订单异常检测间隔（毫秒）', 'number:60000,600000', NOW(), NOW())

ON DUPLICATE KEY UPDATE updated_at = NOW();

-- AI服务商预设配置（只读参考）
INSERT INTO system_configs (config_key, config_value, config_group, is_sensitive, is_editable, description, created_at, updated_at) VALUES
('AI_PROVIDER_CONFIG_ZHIPU', '{"name":"智谱AI","endpoint":"https://open.bigmodel.cn/api/paas/v4/chat/completions","models":["glm-4-flash","glm-4","glm-4-plus"],"default_model":"glm-4-flash","free_quota":"1000万token/月"}', 'AI_PROVIDER', false, false, '智谱AI配置', NOW(), NOW()),
('AI_PROVIDER_CONFIG_QWEN', '{"name":"通义千问","endpoint":"https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions","models":["qwen-turbo","qwen-plus","qwen-max"],"default_model":"qwen-turbo","free_quota":"100万token/月"}', 'AI_PROVIDER', false, false, '通义千问配置', NOW(), NOW()),
('AI_PROVIDER_CONFIG_DEEPSEEK', '{"name":"DeepSeek","endpoint":"https://api.deepseek.com/v1/chat/completions","models":["deepseek-chat","deepseek-coder"],"default_model":"deepseek-chat","price":"0.001元/千token"}', 'AI_PROVIDER', false, false, 'DeepSeek配置', NOW(), NOW()),
('AI_PROVIDER_CONFIG_OPENROUTER', '{"name":"OpenRouter","endpoint":"https://openrouter.ai/api/v1/chat/completions","models":["openai/gpt-4o-mini","openai/gpt-4o","anthropic/claude-3-haiku","google/gemini-flash-1.5","meta-llama/llama-3-8b-instruct","qwen/qwen-2-7b-instruct"],"default_model":"openai/gpt-4o-mini","price":"多模型聚合平台"}', 'AI_PROVIDER', false, false, 'OpenRouter配置', NOW(), NOW()),
('AI_PROVIDER_CONFIG_MODELSCOPE', '{"name":"ModelScope","endpoint":"https://api-inference.modelscope.cn/v1/chat/completions","models":["qwen-turbo","qwen-plus","qwen-max","chatglm3-6b","baichuan2-13b-chat"],"default_model":"qwen-turbo","free_quota":"阿里云模型平台"}', 'AI_PROVIDER', false, false, 'ModelScope配置', NOW(), NOW()),
('AI_PROVIDER_CONFIG_OPENAI', '{"name":"OpenAI","endpoint":"https://api.openai.com/v1/chat/completions","models":["gpt-3.5-turbo","gpt-4","gpt-4-turbo","gpt-4o","gpt-4o-mini"],"default_model":"gpt-4o-mini","price":"标准OpenAI价格"}', 'AI_PROVIDER', false, false, 'OpenAI配置', NOW(), NOW())

ON DUPLICATE KEY UPDATE updated_at = NOW();
