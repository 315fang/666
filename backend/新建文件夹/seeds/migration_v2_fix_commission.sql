-- ============================================================
-- 迁移脚本：修复发货利润预判 + 欠款冻结机制
-- 版本：v2.0 (2026-02-08)
-- ============================================================

-- 1. orders 表：新增 middle_commission_total 字段
--    记录支付时中间层级的佣金总额，供发货时计算代理商利润
ALTER TABLE `orders` 
ADD COLUMN `middle_commission_total` DECIMAL(10,2) DEFAULT 0.00 
COMMENT '中间层级佣金总额（发货利润扣除用）'
AFTER `commission_settled`;

-- 2. users 表：新增 debt_amount 字段
--    退款时佣金追回余额不足产生的待还金额
ALTER TABLE `users` 
ADD COLUMN `debt_amount` DECIMAL(10,2) DEFAULT 0.00 
COMMENT '欠款金额（佣金追回余额不足时的待还金额）'
AFTER `joined_team_at`;

-- 3. 清理支付阶段误生成的发货利润佣金（仅限尚未发货的订单）
--    仅影响 agent_fulfillment 类型且关联订单状态为 paid 的冻结佣金
UPDATE `commission_logs` cl
INNER JOIN `orders` o ON cl.order_id = o.id
SET cl.status = 'cancelled', 
    cl.remark = CONCAT(COALESCE(cl.remark, ''), ' [迁移修复：支付阶段预判发货利润已撤销]')
WHERE cl.type = 'agent_fulfillment' 
  AND cl.status = 'frozen'
  AND o.status = 'paid';

-- ============================================================
-- 执行完毕后请重启后端服务
-- ============================================================
