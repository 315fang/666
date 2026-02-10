-- ================================================================
-- 迁移脚本 v5：支持拆单 + 业务逻辑重构
-- 执行时间：2026-02-09
-- 
-- 改动说明：
-- 1. orders 表新增 parent_order_id（拆单时子订单指向父订单）
-- 2. 清理不再需要的字段默认值
-- ================================================================

-- 1. 添加拆单关联字段
ALTER TABLE orders ADD COLUMN IF NOT EXISTS parent_order_id INT NULL COMMENT '父订单ID（拆单时子订单指向父订单）';
ALTER TABLE orders ADD INDEX IF NOT EXISTS idx_parent_order_id (parent_order_id);

-- 完成
SELECT '迁移 v5 完成：拆单字段已添加' AS result;
