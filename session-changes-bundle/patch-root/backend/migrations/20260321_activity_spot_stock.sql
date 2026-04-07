-- 限时活动专享商品已售计数（与 AppConfig activity_links_config 中 limited[].spot_products 配合）
CREATE TABLE IF NOT EXISTS `activity_spot_stock` (
  `card_id` VARCHAR(64) NOT NULL,
  `offer_id` VARCHAR(64) NOT NULL,
  `sold` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`card_id`, `offer_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
