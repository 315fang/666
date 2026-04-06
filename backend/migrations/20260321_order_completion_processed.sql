-- 订单完成后的升级/有效单统计幂等标记（替代仅依赖 remark 子串）
-- 执行前请备份数据库；与 Order 模型字段 completion_processed 对应，表名 orders

ALTER TABLE `orders`
  ADD COLUMN `completion_processed` TINYINT(1) NOT NULL DEFAULT 0
  COMMENT '完成处理是否已执行: 0-否, 1-是（processOrderCompletion 幂等）'
  AFTER `commission_settled`;
