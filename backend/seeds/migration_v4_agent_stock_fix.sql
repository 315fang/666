-- ============================================================
-- 迁移脚本 V4: 代理商云库存模式修复
-- 日期: 2026-02-08
-- 说明: 配合代理商发货全流程逻辑修复
-- ============================================================

-- 确保 orders 表有 middle_commission_total 字段（之前的迁移可能已添加）
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS middle_commission_total DECIMAL(10,2) DEFAULT 0.00 
COMMENT '中间层级佣金总额（发货利润扣除用）';

-- 确保 users 表有 debt_amount 字段
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS debt_amount DECIMAL(10,2) DEFAULT 0.00 
COMMENT '欠款金额（佣金追回余额不足时的待还金额）';

-- 确保 refunds 表有 refund_quantity 字段
ALTER TABLE refunds 
ADD COLUMN IF NOT EXISTS refund_quantity INT DEFAULT 0 
COMMENT '退货数量（仅退货退款时有值）';

-- 确保 refunds 表有 completed_at 字段
ALTER TABLE refunds 
ADD COLUMN IF NOT EXISTS completed_at DATETIME DEFAULT NULL 
COMMENT '退款完成时间';

-- 更新说明:
-- 1. 下单时不再校验/扣减物理库存(Product.stock)，代理商用户只校验代理商云库存
-- 2. requestShipping 阶段预扣代理商云库存（防并发超卖）
-- 3. shipOrder 检测已预扣标记，避免重复扣减
-- 4. 退款完成时：退还代理商云库存 + 撤销所有佣金（含agent_fulfillment）
-- 5. 发货利润 <= 0 时自动告警管理员
