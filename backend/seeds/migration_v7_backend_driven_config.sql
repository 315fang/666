-- ============================================
-- 后端驱动配置系统 - 数据库迁移脚本
-- 功能：使小程序内容完全由后端控制，实现灵活的SaaS配置能力
-- ============================================

-- 1. 应用全局配置表
CREATE TABLE IF NOT EXISTS `app_configs` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `config_key` VARCHAR(100) NOT NULL UNIQUE COMMENT '配置键名',
  `config_value` TEXT DEFAULT NULL COMMENT '配置值(JSON格式)',
  `config_type` VARCHAR(20) DEFAULT 'string' COMMENT '数据类型: string/number/boolean/json/array',
  `category` VARCHAR(50) DEFAULT 'general' COMMENT '配置分类: general/homepage/ui/commission/system',
  `description` VARCHAR(255) DEFAULT NULL COMMENT '配置说明',
  `is_public` TINYINT(1) DEFAULT 1 COMMENT '是否公开给前端: 1-公开, 0-仅后台',
  `status` TINYINT(1) DEFAULT 1 COMMENT '状态: 1-启用, 0-禁用',
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_config_key` (`config_key`),
  INDEX `idx_category` (`category`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='应用全局配置表';

-- 2. 快捷入口表（金刚区）
CREATE TABLE IF NOT EXISTS `quick_entries` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(50) NOT NULL COMMENT '入口名称',
  `icon` VARCHAR(500) DEFAULT NULL COMMENT '图标URL或SVG路径',
  `icon_type` VARCHAR(20) DEFAULT 'image' COMMENT '图标类型: image/svg/emoji',
  `bg_color` VARCHAR(20) DEFAULT '#EFF6FF' COMMENT '背景颜色',
  `link_type` VARCHAR(20) NOT NULL COMMENT '链接类型: category/page/product/url/action',
  `link_value` VARCHAR(255) DEFAULT NULL COMMENT '链接值: 分类ID/页面路径/商品ID/外部URL/动作类型',
  `position` VARCHAR(50) DEFAULT 'home' COMMENT '展示位置: home/category',
  `sort_order` INT DEFAULT 0 COMMENT '排序权重，数字越大越靠前',
  `tags` VARCHAR(255) DEFAULT NULL COMMENT '标签，用逗号分隔',
  `start_time` TIMESTAMP NULL DEFAULT NULL COMMENT '开始展示时间',
  `end_time` TIMESTAMP NULL DEFAULT NULL COMMENT '结束展示时间',
  `status` TINYINT(1) DEFAULT 1 COMMENT '状态: 1-启用, 0-禁用',
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_position_sort` (`position`, `sort_order`),
  INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='快捷入口配置表';

-- 3. 首页区块配置表
CREATE TABLE IF NOT EXISTS `home_sections` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `section_key` VARCHAR(50) NOT NULL UNIQUE COMMENT '区块唯一标识: banner/quick_entries/category_tabs/products_grid/recommend',
  `section_name` VARCHAR(100) NOT NULL COMMENT '区块名称',
  `section_type` VARCHAR(20) NOT NULL COMMENT '区块类型: banner/grid/list/tabs/custom',
  `title` VARCHAR(100) DEFAULT NULL COMMENT '区块标题（前端显示）',
  `subtitle` VARCHAR(255) DEFAULT NULL COMMENT '区块副标题',
  `config` JSON DEFAULT NULL COMMENT '区块配置(JSON): 样式、数据源、显示参数等',
  `sort_order` INT DEFAULT 0 COMMENT '排序权重，数字越大越靠前',
  `is_visible` TINYINT(1) DEFAULT 1 COMMENT '是否显示',
  `data_source` VARCHAR(100) DEFAULT NULL COMMENT '数据源API endpoint',
  `cache_ttl` INT DEFAULT 300 COMMENT '缓存时长（秒）',
  `status` TINYINT(1) DEFAULT 1 COMMENT '状态: 1-启用, 0-禁用',
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_section_key` (`section_key`),
  INDEX `idx_sort_order` (`sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='首页区块配置表';

-- ============================================
-- 插入默认配置数据
-- ============================================

-- 插入默认应用配置
INSERT INTO `app_configs` (`config_key`, `config_value`, `config_type`, `category`, `description`, `is_public`) VALUES
-- 首页配置
('homepage_title', '臻选好物', 'string', 'homepage', '首页标题', 1),
('show_search_bar', 'true', 'boolean', 'homepage', '是否显示搜索栏', 1),
('show_scan_button', 'true', 'boolean', 'homepage', '是否显示扫码按钮', 1),
('products_per_page', '20', 'number', 'homepage', '每页商品数量', 1),
('enable_waterfall_layout', 'true', 'boolean', 'homepage', '是否启用瀑布流布局', 1),

-- UI配置
('primary_color', '#4F46E5', 'string', 'ui', '主题色', 1),
('button_radius', '12', 'number', 'ui', '按钮圆角(rpx)', 1),
('card_shadow', 'true', 'boolean', 'ui', '是否显示卡片阴影', 1),

-- 佣金配置（前端显示）
('commission_rate_direct', '10', 'number', 'commission', '直推佣金比例(%)', 1),
('commission_rate_indirect', '5', 'number', 'commission', '间接推荐佣金比例(%)', 1),
('commission_freeze_days', '15', 'number', 'commission', '佣金冻结天数', 1),
('min_withdrawal_amount', '10', 'number', 'commission', '最低提现金额', 1)
ON DUPLICATE KEY UPDATE `updatedAt` = CURRENT_TIMESTAMP;

-- 插入默认快捷入口
INSERT INTO `quick_entries` (`name`, `icon`, `icon_type`, `bg_color`, `link_type`, `link_value`, `position`, `sort_order`) VALUES
('热门推荐', '/assets/icons/hot.svg', 'image', '#FEF3C7', 'action', 'hot', 'home', 100),
('新品上市', '/assets/icons/sparkle.svg', 'image', '#FCE7F3', 'action', 'new', 'home', 90),
('限时特惠', '/assets/icons/tag.svg', 'image', '#DCFCE7', 'action', 'sale', 'home', 80),
('分类浏览', '/assets/icons/category.svg', 'image', '#E0E7FF', 'page', '/pages/category/category', 'home', 70),
('我的订单', '/assets/icons/order.svg', 'image', '#DBEAFE', 'page', '/pages/order/list', 'home', 60),
('分佣中心', '/assets/icons/commission.svg', 'image', '#FEE2E2', 'page', '/pages/distribution/center', 'home', 50)
ON DUPLICATE KEY UPDATE `updatedAt` = CURRENT_TIMESTAMP;

-- 插入默认首页区块配置
INSERT INTO `home_sections` (`section_key`, `section_name`, `section_type`, `title`, `sort_order`, `is_visible`, `data_source`, `config`) VALUES
('banner', '轮播图', 'banner', NULL, 1000, 1, '/api/content/banners', '{"autoplay": true, "interval": 3000, "circular": true}'),
('quick_entries', '快捷入口', 'grid', NULL, 900, 1, '/api/quick-entries', '{"columns": 4, "showLabel": true}'),
('category_tabs', '分类标签', 'tabs', NULL, 800, 1, '/api/categories', '{"scrollable": true, "showAll": true}'),
('products_grid', '商品瀑布流', 'list', '精选好物', 700, 1, '/api/products', '{"layout": "waterfall", "columns": 2}')
ON DUPLICATE KEY UPDATE `updatedAt` = CURRENT_TIMESTAMP;

-- ============================================
-- 完成提示
-- ============================================
SELECT '✅ 后端驱动配置系统安装完成！' AS 'Status';
SELECT '📝 已创建 3 个新表: app_configs, quick_entries, home_sections' AS 'Info';
SELECT '🎯 已插入默认配置数据' AS 'Info';
