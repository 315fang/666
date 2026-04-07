-- =============================================================================
-- 数据库脚本：与本改动包配套（在业务库上执行，例如 s2b2c_db）
-- =============================================================================

-- 1) 限时专享已售计数表（缺失时小程序「限时专享」页会报 Table doesn't exist）
CREATE TABLE IF NOT EXISTS `activity_spot_stock` (
  `card_id` VARCHAR(64) NOT NULL,
  `offer_id` VARCHAR(64) NOT NULL,
  `sold` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`card_id`, `offer_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2) 可选：历史错误数据（无规格曾写入 sku_id=0，与外键冲突）
-- 若你的 cart_items / orders 对 sku_id 有指向 product_skus 的外键，建议执行：
-- UPDATE `cart_items` SET `sku_id` = NULL WHERE `sku_id` = 0;
-- UPDATE `orders` SET `sku_id` = NULL WHERE `sku_id` = 0;
