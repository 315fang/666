-- ============================================
-- 主题系统和活动日志 - 数据库迁移脚本
-- 功能：支持节日主题切换和完整的活动日志记录
-- ============================================

-- 1. 主题配置表
CREATE TABLE IF NOT EXISTS `themes` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `theme_key` VARCHAR(50) NOT NULL UNIQUE COMMENT '主题唯一标识',
  `theme_name` VARCHAR(100) NOT NULL COMMENT '主题名称',
  `description` VARCHAR(255) DEFAULT NULL COMMENT '主题描述',
  `primary_color` VARCHAR(20) DEFAULT '#FF4757' COMMENT '主色调',
  `secondary_color` VARCHAR(20) DEFAULT '#FFA502' COMMENT '辅助色',
  `banner_images` JSON DEFAULT NULL COMMENT '轮播图配置数组',
  `quick_entries` JSON DEFAULT NULL COMMENT '快捷入口配置数组',
  `homepage_config` JSON DEFAULT NULL COMMENT '首页其他配置',
  `is_active` TINYINT(1) DEFAULT 0 COMMENT '是否当前激活主题',
  `auto_start_date` VARCHAR(10) DEFAULT NULL COMMENT '自动启用日期 MM-DD 格式',
  `auto_end_date` VARCHAR(10) DEFAULT NULL COMMENT '自动结束日期 MM-DD 格式',
  `icon` VARCHAR(255) DEFAULT NULL COMMENT '主题图标',
  `status` TINYINT(1) DEFAULT 1 COMMENT '状态: 1-启用, 0-禁用',
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_theme_key` (`theme_key`),
  INDEX `idx_is_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='主题配置表';

-- 2. 活动日志表
CREATE TABLE IF NOT EXISTS `activity_logs` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT DEFAULT NULL COMMENT '操作用户ID',
  `user_type` VARCHAR(20) NOT NULL DEFAULT 'user' COMMENT '用户类型: admin/user/guest',
  `username` VARCHAR(100) DEFAULT NULL COMMENT '用户名或昵称',
  `action` VARCHAR(50) NOT NULL COMMENT '操作类型',
  `resource` VARCHAR(50) NOT NULL COMMENT '资源类型',
  `resource_id` VARCHAR(50) DEFAULT NULL COMMENT '资源ID',
  `description` VARCHAR(500) DEFAULT NULL COMMENT '操作描述',
  `details` JSON DEFAULT NULL COMMENT '操作详情JSON',
  `ip_address` VARCHAR(45) DEFAULT NULL COMMENT 'IP地址',
  `user_agent` VARCHAR(255) DEFAULT NULL COMMENT '用户代理',
  `platform` VARCHAR(20) DEFAULT 'web' COMMENT '平台: web/miniprogram/api',
  `status` VARCHAR(20) DEFAULT 'success' COMMENT '状态: success/failed/pending',
  `error_message` TEXT DEFAULT NULL COMMENT '错误信息',
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_user_id` (`user_id`),
  INDEX `idx_action` (`action`),
  INDEX `idx_resource` (`resource`),
  INDEX `idx_created_at` (`createdAt`),
  INDEX `idx_platform` (`platform`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='活动日志表';

-- ============================================
-- 插入默认主题数据
-- ============================================

-- 默认主题
INSERT INTO `themes` (`theme_key`, `theme_name`, `description`, `primary_color`, `secondary_color`, `is_active`, `icon`, `banner_images`, `quick_entries`) VALUES
('default', '默认主题', '系统默认主题，清新简洁', '#4F46E5', '#818CF8', 1, '🎨',
 '[]',
 '[{"name": "热门推荐", "icon": "/assets/icons/hot.svg", "bg_color": "#FEF3C7", "link_type": "action", "link_value": "hot", "sort_order": 100}]'
);

-- 春节主题
INSERT INTO `themes` (`theme_key`, `theme_name`, `description`, `primary_color`, `secondary_color`, `auto_start_date`, `auto_end_date`, `icon`, `banner_images`, `quick_entries`) VALUES
('spring_festival', '春节主题', '春节喜庆主题，红红火火', '#FF4757', '#FFD700', '01-20', '02-10', '🧧',
 '[{"title": "春节特惠", "subtitle": "新年好礼", "image_url": "/uploads/banners/spring-festival-1.jpg", "link_type": "page", "link_value": "/pages/festival/spring", "sort_order": 100}]',
 '[{"name": "新年特惠", "icon": "/assets/icons/gift.svg", "bg_color": "#FFE5E5", "link_type": "page", "link_value": "/pages/festival/spring", "sort_order": 100}, {"name": "年货专区", "icon": "/assets/icons/cart.svg", "bg_color": "#FFEBCC", "link_type": "category", "link_value": "1", "sort_order": 90}]'
);

-- 清明节主题
INSERT INTO `themes` (`theme_key`, `theme_name`, `description`, `primary_color`, `secondary_color`, `auto_start_date`, `auto_end_date`, `icon`, `banner_images`, `quick_entries`) VALUES
('qingming', '清明主题', '清明踏青主题，清新素雅', '#7CB342', '#9CCC65', '04-01', '04-10', '🌱',
 '[{"title": "清明踏青", "subtitle": "春游时光", "image_url": "/uploads/banners/qingming-1.jpg", "link_type": "category", "link_value": "2", "sort_order": 100}]',
 '[{"name": "踏青好物", "icon": "/assets/icons/leaf.svg", "bg_color": "#E8F5E9", "link_type": "action", "link_value": "spring", "sort_order": 100}]'
);

-- 端午节主题
INSERT INTO `themes` (`theme_key`, `theme_name`, `description`, `primary_color`, `secondary_color`, `auto_start_date`, `auto_end_date`, `icon`, `banner_images`, `quick_entries`) VALUES
('dragon_boat', '端午节主题', '端午佳节主题，传统文化', '#00ACC1', '#4DD0E1', '06-18', '06-25', '🎋',
 '[{"title": "端午安康", "subtitle": "粽享好礼", "image_url": "/uploads/banners/dragon-boat-1.jpg", "link_type": "page", "link_value": "/pages/festival/dragon-boat", "sort_order": 100}]',
 '[{"name": "粽子专区", "icon": "/assets/icons/rice.svg", "bg_color": "#E0F7FA", "link_type": "category", "link_value": "3", "sort_order": 100}]'
);

-- 中秋节主题
INSERT INTO `themes` (`theme_key`, `theme_name`, `description`, `primary_color`, `secondary_color`, `auto_start_date`, `auto_end_date`, `icon`, `banner_images`, `quick_entries`) VALUES
('mid_autumn', '中秋节主题', '中秋团圆主题，温馨和谐', '#FFA726', '#FFB74D', '09-15', '09-25', '🌕',
 '[{"title": "中秋团圆", "subtitle": "月满人圆", "image_url": "/uploads/banners/mid-autumn-1.jpg", "link_type": "page", "link_value": "/pages/festival/mid-autumn", "sort_order": 100}]',
 '[{"name": "月饼专区", "icon": "/assets/icons/moon.svg", "bg_color": "#FFF3E0", "link_type": "category", "link_value": "4", "sort_order": 100}]'
);

-- 双十一主题
INSERT INTO `themes` (`theme_key`, `theme_name`, `description`, `primary_color`, `secondary_color`, `auto_start_date`, `auto_end_date`, `icon`, `banner_images`, `quick_entries`) VALUES
('double_eleven', '双十一主题', '购物狂欢主题，热烈促销', '#FF3B30', '#FF6347', '11-01', '11-15', '🛒',
 '[{"title": "双11狂欢", "subtitle": "全场5折起", "image_url": "/uploads/banners/double-eleven-1.jpg", "link_type": "page", "link_value": "/pages/festival/double-eleven", "sort_order": 100}]',
 '[{"name": "限时秒杀", "icon": "/assets/icons/flash.svg", "bg_color": "#FFEBEE", "link_type": "action", "link_value": "flash_sale", "sort_order": 100}]'
);

-- ============================================
-- 完成提示
-- ============================================
SELECT '✅ 主题系统和活动日志安装完成！' AS 'Status';
SELECT '📝 已创建 2 个新表: themes, activity_logs' AS 'Info';
SELECT '🎯 已插入 6 个预设主题' AS 'Info';
