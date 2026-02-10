-- ============================================================
-- 迁移脚本：修复退款库存恢复漏洞
-- 版本：v3.0 (2026-02-08)
-- ============================================================

-- 1. refunds 表：新增 refund_quantity 字段
--    退货退款时记录实际退货数量，仅退款时为0
--    库存恢复严格按此字段，而非 order.quantity
ALTER TABLE `refunds` 
ADD COLUMN `refund_quantity` INT DEFAULT 0 
COMMENT '退货数量（退货退款时有值，仅退款时为0不恢复库存）'
AFTER `amount`;

-- 2. 数据修复：对已完成的退货退款(return_refund)，如果refund_quantity为0，
--    补充为订单全量（兼容历史数据）
UPDATE `refunds` r
INNER JOIN `orders` o ON r.order_id = o.id
SET r.refund_quantity = o.quantity
WHERE r.type = 'return_refund' 
  AND r.status = 'completed'
  AND (r.refund_quantity IS NULL OR r.refund_quantity = 0);

-- ============================================================
-- 说明：
-- 此迁移修复两个严重资金/库存安全漏洞：
--
-- 漏洞1：未发货订单退款导致代理商库存凭空增加
--   原因：payOrder时预设fulfillment_type='Agent'，但未扣库存。
--         退款时检查fulfillment_type就恢复库存 → 无限刷库存
--   修复：退款恢复代理商库存前，必须检查 shipped_at 是否有值
--
-- 漏洞2：部分退款恢复全量库存
--   原因：退1元也恢复order.quantity全部库存
--   修复：新增refund_quantity字段，仅退货退款且有退货数量时才恢复
--         仅退款(refund_only)不恢复任何库存
-- ============================================================
