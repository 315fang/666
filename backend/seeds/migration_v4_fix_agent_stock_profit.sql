-- ★★★ V4 迁移：修复代理商云库存兜底下单 + 利润锁定 ★★★
-- 执行时间: 2026-02-08
-- 
-- 修复的核心问题:
-- 1. 平台无货时代理商无法发货 → 新增 platform_stock_deducted 标记
-- 2. 利润计算风险（价格变动导致亏本）→ 新增 locked_agent_cost 锁定下单时进货价
-- 3. 代理商发货时库存双重扣除 → 根据 platform_stock_deducted 智能补回

-- 1. 新增字段: platform_stock_deducted (下单时是否扣了平台库存)
ALTER TABLE `orders` ADD COLUMN `platform_stock_deducted` TINYINT(1) NOT NULL DEFAULT 1 
    COMMENT '创建订单时是否扣了平台库存: 1-已扣, 0-未扣（走代理商云库存兜底）' 
    AFTER `shipping_fee`;

-- 2. 新增字段: locked_agent_cost (下单时锁定的代理商进货价)
ALTER TABLE `orders` ADD COLUMN `locked_agent_cost` DECIMAL(10,2) DEFAULT NULL 
    COMMENT '下单时锁定的代理商进货价（单价），发货利润以此为准' 
    AFTER `platform_stock_deducted`;

-- 3. 为已有订单回填 locked_agent_cost（基于商品当前的 price_agent）
-- 仅对未完成的订单回填，已完成的历史订单保持 NULL（发货时走兜底逻辑用实时价格）
UPDATE `orders` o
INNER JOIN `products` p ON o.product_id = p.id
SET o.locked_agent_cost = COALESCE(p.price_agent, p.price_leader, p.price_member, p.retail_price)
WHERE o.status IN ('pending', 'paid', 'agent_confirmed', 'shipping_requested');

-- 4. 已有订单的 platform_stock_deducted 默认为 1（历史订单都是扣了平台库存的）
-- 不需要额外更新，DEFAULT 1 已覆盖
