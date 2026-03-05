-- ============================================================
-- Migration v9: 修正 home_sections 区块类型与补全默认区块
-- 背景：v7 seed 写入的 section_type（grid / list / tabs）与
--       section-renderer 组件支持的类型不一致，导致区块无法渲染。
--       同时补全 feature-cards 和 notice-bar 区块。
-- ============================================================

-- 1. 修正 quick_entries 区块：grid → quick-entry
UPDATE `home_sections`
SET `section_type` = 'quick-entry',
    `config` = JSON_OBJECT('columns', 4, 'style', 'icon-text'),
    `updatedAt` = NOW()
WHERE `section_key` = 'quick_entries';

-- 2. 修正 products_grid 区块：list → product-grid
UPDATE `home_sections`
SET `section_type` = 'product-grid',
    `config` = JSON_OBJECT('columns', 2, 'limit', 6, 'cardStyle', 'card'),
    `updatedAt` = NOW()
WHERE `section_key` = 'products_grid';

-- 3. 隐藏 category_tabs 区块（section-renderer 不支持 tabs 类型，分类已有独立 Tab 页）
UPDATE `home_sections`
SET `is_visible` = 0,
    `updatedAt` = NOW()
WHERE `section_key` = 'category_tabs';

-- 4. 修正 banner 区块 config（确保有 autoplay 等参数）
UPDATE `home_sections`
SET `config` = JSON_OBJECT('autoplay', TRUE, 'interval', 4000, 'height', '400', 'borderRadius', '0', 'images', JSON_ARRAY()),
    `updatedAt` = NOW()
WHERE `section_key` = 'banner';

-- 5. 补全 feature-cards 区块（若不存在则插入）
INSERT INTO `home_sections` (`section_key`, `section_name`, `section_type`, `title`, `sort_order`, `is_visible`, `config`)
VALUES (
    'feature_cards',
    '特色专区',
    'feature-cards',
    '特色专区',
    600,
    1,
    JSON_OBJECT('columns', 2, 'cards', JSON_ARRAY())
)
ON DUPLICATE KEY UPDATE
    `section_type` = 'feature-cards',
    `is_visible`   = 1,
    `updatedAt`    = NOW();

-- 6. （可选）补全公告条区块，默认隐藏，后台开启即生效
INSERT INTO `home_sections` (`section_key`, `section_name`, `section_type`, `title`, `sort_order`, `is_visible`, `config`)
VALUES (
    'notice_bar',
    '公告条',
    'notice-bar',
    NULL,
    950,
    0,
    JSON_OBJECT('text', '欢迎光临问兰镜像商城', 'bgColor', '#FEF3C7', 'textColor', '#92400E', 'scrollable', TRUE, 'icon', '📣')
)
ON DUPLICATE KEY UPDATE `updatedAt` = NOW();

-- ============================================================
-- 执行后首页区块顺序（sort_order 降序）：
--   950  notice_bar      公告条（隐藏）
--   1000 banner          轮播图
--   900  quick_entries   快捷入口
--   700  feature_cards → 600 （旧 600 位置补全）
--   700  products_grid   商品宫格
-- ============================================================

SELECT '✅ Migration v9 完成：home_sections 区块类型已修正' AS `Status`;
