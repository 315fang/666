-- AI告警表
CREATE TABLE IF NOT EXISTS ai_alerts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    alert_code VARCHAR(50) NOT NULL COMMENT '告警编码 ERR-YYYYMMDD-NNN',
    level ENUM('CRITICAL', 'WARNING', 'INFO') NOT NULL,
    category VARCHAR(50) COMMENT '分类：SYSTEM_ERROR, BUSINESS_ANOMALY, PERFORMANCE',
    title VARCHAR(200) NOT NULL,
    description TEXT,
    
    -- AI分析结果
    ai_cause TEXT COMMENT 'AI分析的可能原因',
    ai_impact TEXT COMMENT '影响范围',
    ai_confidence DECIMAL(3,2) COMMENT 'AI置信度',
    ai_suggestion TEXT COMMENT 'AI建议',
    
    -- 修复信息
    auto_fixable BOOLEAN DEFAULT FALSE COMMENT '是否可自动修复',
    fix_procedure JSON COMMENT '修复步骤（JSON）',
    fix_script TEXT COMMENT '修复脚本',
    
    -- 状态追踪
    status ENUM('ACTIVE', 'FIXING', 'RESOLVED', 'IGNORED') DEFAULT 'ACTIVE',
    fixed_by ENUM('AI', 'ADMIN', 'MANUAL') DEFAULT NULL,
    fixed_at TIMESTAMP NULL,
    resolved_by INT COMMENT '解决人ID',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_level_status (level, status),
    INDEX idx_category (category),
    INDEX idx_created_at (created_at)
) COMMENT='AI告警表';

-- AI修复会话表
CREATE TABLE IF NOT EXISTS ai_fix_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    alert_id INT NOT NULL,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL,
    status ENUM('RUNNING', 'SUCCESS', 'FAILED', 'ROLLED_BACK') DEFAULT 'RUNNING',
    steps_executed JSON COMMENT '执行的步骤记录',
    current_step INT DEFAULT 0,
    rollback_script TEXT COMMENT '回滚脚本',
    error_message TEXT,
    executed_by INT COMMENT '执行人ID',
    FOREIGN KEY (alert_id) REFERENCES ai_alerts(id) ON DELETE CASCADE,
    INDEX idx_alert (alert_id)
) COMMENT='AI修复会话表';

-- 系统配置表
CREATE TABLE IF NOT EXISTS system_configs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    config_key VARCHAR(100) NOT NULL UNIQUE COMMENT '配置键',
    config_value TEXT COMMENT '配置值',
    config_group VARCHAR(50) DEFAULT 'general' COMMENT '配置分组',
    is_sensitive BOOLEAN DEFAULT FALSE COMMENT '是否敏感',
    is_editable BOOLEAN DEFAULT TRUE COMMENT '是否可在后台编辑',
    description VARCHAR(500) COMMENT '配置说明',
    validation_rule JSON COMMENT '验证规则',
    
    -- 版本控制
    version INT DEFAULT 1 COMMENT '版本号',
    updated_by INT COMMENT '最后修改人',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_group (config_group),
    INDEX idx_editable (is_editable)
) COMMENT='系统配置表';

-- 配置修改历史表
CREATE TABLE IF NOT EXISTS system_config_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    config_key VARCHAR(100) NOT NULL,
    old_value TEXT,
    new_value TEXT,
    changed_by INT COMMENT '修改人',
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    change_reason VARCHAR(500),
    
    INDEX idx_config_key (config_key),
    INDEX idx_changed_at (changed_at)
) COMMENT='配置修改历史表';

-- 插入系统配置初始数据
INSERT INTO system_configs (config_key, config_value, config_group, is_sensitive, description, validation_rule) VALUES
-- AI配置
('AI_ENABLED', 'true', 'ai', false, '是否启用AI功能', '{"type": "boolean"}'),
('AI_MODEL', 'gpt-3.5-turbo', 'ai', false, 'AI模型', '{"options": ["gpt-3.5-turbo", "gpt-4", "gpt-4-turbo"]}'),
('AI_MAX_TOKENS', '2000', 'ai', false, '最大Token数', '{"type": "number", "min": 100, "max": 4000}'),
('AI_TEMPERATURE', '0.7', 'ai', false, 'AI温度参数', '{"type": "number", "min": 0, "max": 2}'),

-- 业务配置
('ORDER_AUTO_CANCEL_MINUTES', '30', 'business', false, '订单自动取消时间（分钟）', '{"type": "number", "min": 5, "max": 1440}'),
('COMMISSION_FREEZE_DAYS', '7', 'business', false, '佣金冻结天数', '{"type": "number", "min": 1, "max": 30}'),
('DEFAULT_SHIPPING_FEE', '0', 'business', false, '默认运费', '{"type": "number", "min": 0}'),
('ENABLE_INVITE_CODE', 'true', 'business', false, '是否启用邀请码注册', '{"type": "boolean"}'),

-- 文件存储
('OSS_PROVIDER', 'local', 'storage', false, '存储提供商', '{"options": ["local", "aliyun", "tencent"]}'),
('OSS_BUCKET', '', 'storage', false, '存储Bucket', NULL),
('OSS_REGION', '', 'storage', false, '存储区域', NULL),
('OSS_ACCESS_KEY', '', 'storage', true, '存储AccessKey', NULL),
('OSS_SECRET_KEY', '', 'storage', true, '存储SecretKey', NULL),

-- 通知配置
('NOTIFICATION_ENABLED', 'true', 'notification', false, '是否启用通知', '{"type": "boolean"}'),
('SMS_PROVIDER', '', 'notification', false, '短信服务商', NULL),
('SMS_SIGN_NAME', '', 'notification', false, '短信签名', NULL),

-- 系统配置
('SYSTEM_NAME', '臻选商城', 'system', false, '系统名称', NULL),
('SYSTEM_LOGO', '', 'system', false, '系统Logo URL', '{"type": "url"}'),
('CUSTOMER_SERVICE_PHONE', '', 'system', false, '客服电话', '{"pattern": "^1[3-9]\\d{9}$", "patternMessage": "请输入正确的手机号"}'),

-- 监控配置
('AI_MONITOR_ENABLED', 'true', 'monitor', false, '是否启用AI监控', '{"type": "boolean"}'),
('ERROR_LOG_THRESHOLD', '10', 'monitor', false, '错误日志告警阈值（每分钟）', '{"type": "number", "min": 1}'),
('ORDER_ANOMALY_THRESHOLD', '50', 'monitor', false, '订单异常告警阈值', '{"type": "number", "min": 1}'),
('PERFORMANCE_SLOW_QUERY_MS', '1000', 'monitor', false, '慢查询阈值（毫秒）', '{"type": "number", "min": 100}')
ON DUPLICATE KEY UPDATE config_key = config_key;
