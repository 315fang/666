-- ========================================
-- 素材库分组系统：数据库迁移脚本
-- 执行时机：部署前在 MySQL 中执行一次
-- ========================================

-- 1. 创建素材分组表
CREATE TABLE IF NOT EXISTS `material_groups` (
    `id`          INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `name`        VARCHAR(100) NOT NULL COMMENT '分组名称',
    `description` VARCHAR(255)          COMMENT '分组说明',
    `cover_url`   VARCHAR(500)          COMMENT '分组封面图',
    `sort_order`  INT          NOT NULL DEFAULT 0 COMMENT '排序权重',
    `status`      TINYINT(1)   NOT NULL DEFAULT 1 COMMENT '1-启用 0-禁用',
    `created_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='素材分组';

-- 2. 给 materials 表加 group_id 字段
--    （已有数据 group_id 为 NULL，代表未分组，不影响现有数据）
ALTER TABLE `materials`
    ADD COLUMN IF NOT EXISTS `group_id` INT NULL COMMENT '所属分组ID，NULL=未分组' AFTER `product_id`,
    ADD INDEX IF NOT EXISTS `idx_group_id` (`group_id`);

-- 3. 插入默认分组（可选，先建两个示范分组）
INSERT IGNORE INTO `material_groups` (`name`, `description`, `sort_order`) VALUES
    ('产品图组', '商品主图、详情图等', 100),
    ('海报组', '活动海报、推广图', 90);

-- ========================================
-- 验证查询（执行后检查输出是否正确）
-- ========================================
-- SELECT * FROM material_groups;
-- DESC materials;  -- 确认 group_id 字段存在
