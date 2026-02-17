-- Migration: Add cost_price field to products table
-- Date: 2026-02-11
-- Description: Add cost_price/purchase_price field for supplier pricing

-- Add cost_price column
ALTER TABLE products
ADD COLUMN cost_price DECIMAL(10, 2) NULL
COMMENT '成本价/进货价 - 供应商给平台的价格'
AFTER price_agent;

-- Optionally set default cost_price based on existing wholesale_price if needed
-- UPDATE products SET cost_price = wholesale_price WHERE wholesale_price IS NOT NULL AND cost_price IS NULL;
