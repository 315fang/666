-- 群发信息记录表
CREATE TABLE IF NOT EXISTS mass_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(200) NOT NULL COMMENT '消息标题',
    content TEXT NOT NULL COMMENT '消息内容',
    content_type ENUM('text', 'image', 'link', 'miniapp') DEFAULT 'text' COMMENT '内容类型',
    
    -- 发送目标
    target_type ENUM('all', 'role', 'tag', 'specific') NOT NULL COMMENT '目标类型',
    target_roles JSON COMMENT '目标角色（role类型时）',
    target_users JSON COMMENT '特定用户ID列表（specific类型时）',
    target_tags JSON COMMENT '用户标签（tag类型时）',
    
    -- 发送设置
    send_type ENUM('immediate', 'scheduled') DEFAULT 'immediate' COMMENT '发送类型',
    scheduled_at TIMESTAMP NULL COMMENT '定时发送时间',
    
    -- 发送状态
    status ENUM('draft', 'pending', 'sending', 'completed', 'failed', 'cancelled') DEFAULT 'draft' COMMENT '状态',
    total_count INT DEFAULT 0 COMMENT '目标用户总数',
    sent_count INT DEFAULT 0 COMMENT '已发送数',
    read_count INT DEFAULT 0 COMMENT '已读数',
    fail_count INT DEFAULT 0 COMMENT '失败数',
    
    -- 发送结果
    result_details JSON COMMENT '发送结果详情',
    error_message TEXT COMMENT '错误信息',
    
    -- 创建信息
    created_by INT NOT NULL COMMENT '创建人ID',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    sent_at TIMESTAMP NULL COMMENT '实际发送时间',
    completed_at TIMESTAMP NULL COMMENT '完成时间',
    
    INDEX idx_status (status),
    INDEX idx_target_type (target_type),
    INDEX idx_scheduled_at (scheduled_at),
    INDEX idx_created_at (created_at)
) COMMENT='群发信息表';

-- 用户消息接收记录表（用于追踪阅读状态）
CREATE TABLE IF NOT EXISTS user_mass_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL COMMENT '用户ID',
    mass_message_id INT NOT NULL COMMENT '群发消息ID',
    status ENUM('unread', 'read') DEFAULT 'unread' COMMENT '阅读状态',
    received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '接收时间',
    read_at TIMESTAMP NULL COMMENT '阅读时间',
    
    UNIQUE KEY uk_user_message (user_id, mass_message_id),
    INDEX idx_user_id (user_id),
    INDEX idx_mass_message_id (mass_message_id),
    INDEX idx_status (status)
) COMMENT='用户消息接收记录表';

-- 用户标签表（用于群发分组）
CREATE TABLE IF NOT EXISTS user_tags (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL COMMENT '标签名称',
    description VARCHAR(200) COMMENT '标签描述',
    color VARCHAR(20) DEFAULT '#409EFF' COMMENT '标签颜色',
    user_count INT DEFAULT 0 COMMENT '用户数量',
    created_by INT COMMENT '创建人',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    UNIQUE KEY uk_name (name)
) COMMENT='用户标签表';

-- 用户标签关联表
CREATE TABLE IF NOT EXISTS user_tag_relations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL COMMENT '用户ID',
    tag_id INT NOT NULL COMMENT '标签ID',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE KEY uk_user_tag (user_id, tag_id),
    INDEX idx_tag_id (tag_id)
) COMMENT='用户标签关联表';

-- 插入默认标签
INSERT INTO user_tags (name, description, color) VALUES
('新用户', '注册7天内的新用户', '#67C23A'),
('活跃用户', '最近30天有下单的用户', '#409EFF'),
('沉睡用户', '30天未登录的用户', '#E6A23C'),
('高价值用户', '累计消费超过1000元', '#F56C6C'),
('团长', '身份为团长的用户', '#909399'),
('代理商', '身份为代理商的用户', '#909399')
ON DUPLICATE KEY UPDATE name = name;
