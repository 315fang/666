-- =============================================
-- 迁移脚本 v6: 商品详情图字段
-- 执行时间: 2026-02-09
-- 说明: 为商品表添加 detail_images 字段，存储商品详情长图
-- =============================================

-- 添加商品详情图字段（JSON数组，存储详情长图URL列表）
ALTER TABLE products ADD COLUMN IF NOT EXISTS detail_images TEXT DEFAULT NULL COMMENT '商品详情图URLs（JSON数组，长图拼接展示）';

-- 验证
SELECT COLUMN_NAME, DATA_TYPE, COLUMN_COMMENT 
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME = 'products' AND COLUMN_NAME = 'detail_images';
