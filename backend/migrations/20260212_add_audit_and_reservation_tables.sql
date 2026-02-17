-- Migration: 添加审计和预留表 (Stock Audit & Reservation Tables)
-- Date: 2026-02-12
-- Purpose: 添加库存审计、佣金结算批次、库存预留功能

-- ========================================
-- 1. 库存变动审计表 (StockTransaction)
-- ========================================
CREATE TABLE IF NOT EXISTS `stock_transactions` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL COMMENT '代理商用户ID',
  `product_id` INT NULL COMMENT '商品ID（补货时记录）',
  `order_id` INT NULL COMMENT '关联订单ID（出库时记录）',
  `type` ENUM('restock', 'order_confirm', 'refund', 'adjustment', 'initial') NOT NULL COMMENT '变动类型',
  `quantity` INT NOT NULL COMMENT '变动数量（正数=入库，负数=出库）',
  `balance_before` INT NOT NULL COMMENT '变动前库存',
  `balance_after` INT NOT NULL COMMENT '变动后库存',
  `amount` DECIMAL(10,2) NULL COMMENT '交易金额（补货时记录）',
  `operator_id` INT NULL COMMENT '操作员ID（管理员调整时记录）',
  `operator_type` ENUM('user', 'admin', 'system') DEFAULT 'user' COMMENT '操作员类型',
  `remark` VARCHAR(500) NULL COMMENT '备注说明',
  `metadata` JSON NULL COMMENT 'JSON元数据',
  `ip_address` VARCHAR(50) NULL COMMENT '操作IP地址',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_user_created` (`user_id`, `created_at`),
  INDEX `idx_type_created` (`type`, `created_at`),
  INDEX `idx_order` (`order_id`),
  INDEX `idx_product` (`product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='库存变动审计表（不可变）';

-- ========================================
-- 2. 佣金批次结算表 (CommissionSettlement)
-- ========================================
CREATE TABLE IF NOT EXISTS `commission_settlements` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `settlement_no` VARCHAR(50) NOT NULL UNIQUE COMMENT '结算批次号',
  `settlement_type` ENUM('auto', 'manual') DEFAULT 'auto' COMMENT '结算类型',
  `period_start` DATE NOT NULL COMMENT '结算周期开始日期',
  `period_end` DATE NOT NULL COMMENT '结算周期结束日期',
  `status` ENUM('pending', 'processing', 'completed', 'failed') DEFAULT 'pending' COMMENT '状态',
  `total_commissions` INT DEFAULT 0 COMMENT '总佣金记录数',
  `total_amount` DECIMAL(12,2) DEFAULT 0.00 COMMENT '总结算金额',
  `approved_count` INT DEFAULT 0 COMMENT '已批准数量',
  `rejected_count` INT DEFAULT 0 COMMENT '已拒绝数量',
  `settled_count` INT DEFAULT 0 COMMENT '已结算数量',
  `settled_amount` DECIMAL(12,2) DEFAULT 0.00 COMMENT '实际结算金额',
  `operator_id` INT NULL COMMENT '操作员ID（手动结算时记录）',
  `started_at` DATETIME NULL COMMENT '开始处理时间',
  `completed_at` DATETIME NULL COMMENT '完成时间',
  `error_message` TEXT NULL COMMENT '错误信息',
  `remark` VARCHAR(500) NULL COMMENT '备注说明',
  `metadata` JSON NULL COMMENT 'JSON元数据',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_status_created` (`status`, `created_at`),
  INDEX `idx_period` (`period_start`, `period_end`),
  INDEX `idx_type` (`settlement_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='佣金批次结算表';

-- ========================================
-- 3. 库存预留表 (StockReservation)
-- ========================================
CREATE TABLE IF NOT EXISTS `stock_reservations` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL COMMENT '代理商用户ID',
  `order_id` INT NOT NULL UNIQUE COMMENT '订单ID',
  `product_id` INT NOT NULL COMMENT '商品ID',
  `quantity` INT NOT NULL COMMENT '预留数量',
  `status` ENUM('active', 'consumed', 'released', 'expired') DEFAULT 'active' COMMENT '状态',
  `expires_at` DATETIME NOT NULL COMMENT '过期时间',
  `consumed_at` DATETIME NULL COMMENT '消费时间',
  `released_at` DATETIME NULL COMMENT '释放时间',
  `remark` VARCHAR(500) NULL COMMENT '备注说明',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_user_status` (`user_id`, `status`),
  INDEX `idx_order` (`order_id`),
  INDEX `idx_status_expires` (`status`, `expires_at`),
  INDEX `idx_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='库存预留表（防止超售）';

-- ========================================
-- 4. 更新 commission_logs 表 - 添加 settlement_id 字段
-- ========================================
ALTER TABLE `commission_logs`
ADD COLUMN `settlement_id` INT NULL COMMENT '所属结算批次ID' AFTER `settled_at`,
ADD INDEX `idx_settlement` (`settlement_id`);

-- ========================================
-- 5. 为现有订单添加 agent 关联 (如果不存在)
-- ========================================
-- 检查是否已有 agent_id 字段
SET @dbname = DATABASE();
SET @tablename = 'orders';
SET @columnname = 'agent_id';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (table_name = @tablename)
      AND (table_schema = @dbname)
      AND (column_name = @columnname)
  ) > 0,
  "SELECT 1",
  CONCAT("ALTER TABLE ", @tablename, " ADD COLUMN ", @columnname, " INT NULL COMMENT '代理商ID（工厂直发模式）' AFTER `distributor_id`, ADD INDEX `idx_agent` (`agent_id`);")
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- ========================================
-- 6. 添加数据库索引优化（针对工厂发货查询）
-- ========================================
-- 订单表：agent_id + status 复合索引
ALTER TABLE `orders`
ADD INDEX IF NOT EXISTS `idx_agent_status` (`agent_id`, `status`),
ADD INDEX IF NOT EXISTS `idx_fulfillment_status` (`fulfillment_type`, `status`);

-- 用户表：role_level + status 复合索引
ALTER TABLE `users`
ADD INDEX IF NOT EXISTS `idx_role_level` (`role_level`);

-- ========================================
-- 验证表创建
-- ========================================
SELECT
  'stock_transactions' as table_name,
  COUNT(*) as row_count
FROM stock_transactions
UNION ALL
SELECT
  'commission_settlements' as table_name,
  COUNT(*) as row_count
FROM commission_settlements
UNION ALL
SELECT
  'stock_reservations' as table_name,
  COUNT(*) as row_count
FROM stock_reservations;

-- ========================================
-- 完成提示
-- ========================================
SELECT '✅ 审计表和预留表迁移完成' AS status;
