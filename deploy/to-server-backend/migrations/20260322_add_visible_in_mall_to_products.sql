-- 商品：是否在商城列表/搜索/热门推荐等渠道展示（0=否，仅活动等场景可售）
-- ★ 不要用 bash 直接执行本文件（会报 command not found）。
--    方式1：mysql -u用户 -p 库名 < migrations/20260322_add_visible_in_mall_to_products.sql
--    方式2：cd backend && node migrations/apply_visible_in_mall_column.js
ALTER TABLE `products`
  ADD COLUMN `visible_in_mall` TINYINT(1) NOT NULL DEFAULT 1
  COMMENT '1=商城可见 0=商城不可见（限时活动等仍可选用）'
  AFTER `supports_pickup`;
