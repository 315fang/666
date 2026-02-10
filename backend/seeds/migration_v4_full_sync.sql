-- ============================================================
-- 完整合并迁移脚本: 补全所有 Model 与数据库之间的差异
-- 基于转储: s2b2c_db_20260208130840cz3dc.sql
-- 日期: 2026-02-08
-- 用法: 在 MySQL 中对 s2b2c_db 库执行此脚本
--       mysql -u root -p s2b2c_db < migration_v4_full_sync.sql
-- ============================================================
-- ★ 注意：所有语句使用 IF NOT EXISTS / 列存在性检查，可重复执行无副作用

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================
-- 1. orders 表：补充 2 个缺失字段
-- ============================================================

-- 1.1 address_snapshot: 下单时冻结的收货地址快照(JSON)
--     作用：防止用户下单后修改/删除地址导致发货信息丢失
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'address_snapshot');
SET @sql = IF(@col_exists = 0, 
    'ALTER TABLE `orders` ADD COLUMN `address_snapshot` TEXT NULL COMMENT ''收货地址快照（JSON）'' AFTER `address_id`', 
    'SELECT ''orders.address_snapshot already exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 1.2 middle_commission_total: 支付时计算的中间层级佣金总额
--     作用：发货时计算代理商利润要扣除的中间佣金
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'middle_commission_total');
SET @sql = IF(@col_exists = 0, 
    'ALTER TABLE `orders` ADD COLUMN `middle_commission_total` DECIMAL(10,2) DEFAULT 0.00 COMMENT ''中间层级佣金总额（发货利润扣除用）'' AFTER `commission_settled`', 
    'SELECT ''orders.middle_commission_total already exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ============================================================
-- 2. users 表：补充 1 个缺失字段
-- ============================================================

-- 2.1 debt_amount: 退款时佣金追回余额不足产生的欠款
--     作用：退款扣回佣金时，余额不够的部分记为欠款，后续佣金结算时优先抵扣
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'debt_amount');
SET @sql = IF(@col_exists = 0, 
    'ALTER TABLE `users` ADD COLUMN `debt_amount` DECIMAL(10,2) DEFAULT 0.00 COMMENT ''欠款金额（佣金追回余额不足时的待还金额）'' AFTER `invite_code`', 
    'SELECT ''users.debt_amount already exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2.2 joined_team_at: 加入团队时间（转储末尾补丁已有，此处做幂等确认）
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'joined_team_at');
SET @sql = IF(@col_exists = 0, 
    'ALTER TABLE `users` ADD COLUMN `joined_team_at` DATETIME NULL COMMENT ''加入团队时间（绑定上级时设置）''', 
    'SELECT ''users.joined_team_at already exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 补填历史数据：已绑定上级但 joined_team_at 为空的用户
UPDATE `users` SET `joined_team_at` = `created_at` 
WHERE `parent_id` IS NOT NULL AND `joined_team_at` IS NULL;


-- ============================================================
-- 3. refunds 表：补充 1 个缺失字段
-- ============================================================

-- 3.1 refund_quantity: 退货数量
--     作用：退货退款时记录实际退回件数（不一定等于订单数量），仅退款时为0
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'refunds' AND COLUMN_NAME = 'refund_quantity');
SET @sql = IF(@col_exists = 0, 
    'ALTER TABLE `refunds` ADD COLUMN `refund_quantity` INT DEFAULT 0 COMMENT ''退货数量（仅退货退款时有值，仅退款时为0）'' AFTER `amount`', 
    'SELECT ''refunds.refund_quantity already exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ============================================================
-- 4. notifications 表：修复外键阻止 user_id=0 的问题
-- ============================================================
-- 代码中 sendNotification(0, ...) 表示管理员通知，但外键约束要求 user_id 引用 users(id)
-- user_id=0 不存在于 users 表中，会导致 INSERT 失败
-- 修复方案：删除外键约束，改用应用层校验（notifications 不是强关联表）

-- 查找并删除 notifications 表上 user_id 的外键（可能叫 notifications_ibfk_1 或其他名称）
-- 注意：MySQL 5.7 不支持 DROP FOREIGN KEY IF EXISTS，需要用存储过程
DELIMITER //
CREATE PROCEDURE IF NOT EXISTS drop_fk_if_exists(
    IN p_table VARCHAR(64),
    IN p_fk VARCHAR(64)
)
BEGIN
    DECLARE fk_count INT DEFAULT 0;
    SELECT COUNT(*) INTO fk_count
    FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = p_table
      AND CONSTRAINT_NAME = p_fk
      AND CONSTRAINT_TYPE = 'FOREIGN KEY';
    IF fk_count > 0 THEN
        SET @drop_sql = CONCAT('ALTER TABLE `', p_table, '` DROP FOREIGN KEY `', p_fk, '`');
        PREPARE drop_stmt FROM @drop_sql;
        EXECUTE drop_stmt;
        DEALLOCATE PREPARE drop_stmt;
    END IF;
END //
DELIMITER ;

-- 删除 notifications 表的外键（允许 user_id=0 管理员通知）
CALL drop_fk_if_exists('notifications', 'notifications_ibfk_1');

-- 清理存储过程
DROP PROCEDURE IF EXISTS drop_fk_if_exists;


-- ============================================================
-- 5. 补充有用的索引（提升查询性能）
-- ============================================================

-- orders 表：agent_id 索引（代理商查询订单）
SET @idx_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS 
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND INDEX_NAME = 'idx_agent_id');
SET @sql = IF(@idx_exists = 0, 
    'ALTER TABLE `orders` ADD INDEX `idx_agent_id` (`agent_id`)', 
    'SELECT ''orders.idx_agent_id already exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- orders 表：status 索引（按状态筛选订单）
SET @idx_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS 
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND INDEX_NAME = 'idx_status');
SET @sql = IF(@idx_exists = 0, 
    'ALTER TABLE `orders` ADD INDEX `idx_status` (`status`)', 
    'SELECT ''orders.idx_status already exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- commission_logs 表：status + available_at 联合索引（定时结算查询）
SET @idx_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS 
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'commission_logs' AND INDEX_NAME = 'idx_settle');
SET @sql = IF(@idx_exists = 0, 
    'ALTER TABLE `commission_logs` ADD INDEX `idx_settle` (`status`, `available_at`)', 
    'SELECT ''commission_logs.idx_settle already exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- refunds 表：status 索引
SET @idx_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS 
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'refunds' AND INDEX_NAME = 'idx_refund_status');
SET @sql = IF(@idx_exists = 0, 
    'ALTER TABLE `refunds` ADD INDEX `idx_refund_status` (`status`)', 
    'SELECT ''refunds.idx_refund_status already exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ============================================================
-- 6. 数据修复：修正已有订单数据
-- ============================================================

-- 已有订单如果缺少 middle_commission_total，默认填 0
UPDATE `orders` SET `middle_commission_total` = 0.00 
WHERE `middle_commission_total` IS NULL;

-- 已有用户如果缺少 debt_amount，默认填 0
UPDATE `users` SET `debt_amount` = 0.00 
WHERE `debt_amount` IS NULL;


SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- 验证：执行完后可运行以下查询确认所有字段存在
-- ============================================================
-- SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
--   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders'
--   AND COLUMN_NAME IN ('address_snapshot', 'middle_commission_total');
--
-- SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
--   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
--   AND COLUMN_NAME IN ('debt_amount', 'joined_team_at');
--
-- SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
--   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'refunds'
--   AND COLUMN_NAME IN ('refund_quantity');
-- ============================================================

SELECT '✅ 迁移完成！所有字段已补全，索引已添加，外键已修复。' AS result;
