-- S2B2C系统初始化数据脚本
-- 使用前请先创建数据库: CREATE DATABASE s2b2c_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 插入初始商品数据
INSERT INTO products (name, description, images, retail_price, member_price, wholesale_price, stock, status) VALUES
(
  '入门产品套装',
  '成为会员的入门产品，包含精选商品组合，购买后即可成为会员，享受会员价和推荐奖励。',
  '["https://via.placeholder.com/400x400/4CAF50/ffffff?text=Entry+Product"]',
  299.00,
  269.00,
  150.00,
  1000,
  1
),
(
  '标准商品套餐',
  '标准级商品套餐，适合日常使用，会员专享优惠价。',
  '["https://via.placeholder.com/400x400/2196F3/ffffff?text=Standard+Pack"]',
  499.00,
  449.00,
  300.00,
  800,
  1
),
(
  '高级礼盒装',
  '高端礼盒装商品，品质卓越，适合送礼或高端客户使用。',
  '["https://via.placeholder.com/400x400/9C27B0/ffffff?text=Premium+Gift"]',
  899.00,
  799.00,
  500.00,
  500,
  1
),
(
  '限量版套装',
  '限量发售的特别套装，数量有限，先到先得。',
  '["https://via.placeholder.com/400x400/FF5722/ffffff?text=Limited+Edition"]',
  1299.00,
  1099.00,
  700.00,
  200,
  1
);

-- 插入系统配置数据
INSERT INTO config (key_name, key_value, description) VALUES
('member_direct_commission', '60', '会员直推佣金'),
('leader_direct_commission', '90', '团长直推佣金'),
('leader_team_commission', '30', '团长团队佣金'),
('partner_upgrade_sales', '10', '合伙人升级所需销售订单数'),
('partner_upgrade_recharge', '3000', '合伙人升级所需充值金额'),
('commission_available_days', '7', '佣金可用天数（T+N）');
