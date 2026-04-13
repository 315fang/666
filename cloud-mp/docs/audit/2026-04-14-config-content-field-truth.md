# 配置与内容主链字段真相表（Phase 3）

日期：2026-04-14

本表覆盖第三阶段：

- 小程序配置
- 首页内容配置
- 弹窗广告
- 开屏配置
- 首页内容位

## 1. miniProgramConfig

| 领域 | 正式字段 | 含义 | 兼容字段 | 说明 |
| --- | --- | --- | --- | --- |
| 根配置 | `miniProgramConfig` | 小程序正式配置对象 | `mini_program_config` | 外部输出统一用 camelCase 语义对象 |
| 品牌配置 | `brand_config` | 品牌与导航等配置 | - | 仍保留原分组结构 |
| 功能开关 | `feature_flags` | 页面入口/能力开关 | `feature_toggles` | `feature_toggles` 保留兼容 |
| 物流配置 | `logistics_config` | 物流模式与常用快递 | - | `shipping_company_options` 归入正式字段 |
| 提现配置 | `withdrawal_config` | 小程序提现费率 | - | 页面优先读该对象 |

## 2. 首页内容

| 领域 | 正式字段 | 含义 | 兼容字段 | 说明 |
| --- | --- | --- | --- | --- |
| 首页配置 | `configs` | 首页直接消费的扁平配置 | - | 给首页 `indexHomeLoader` 使用 |
| Banner 集合 | `banners.home/home_mid/home_bottom` | 各位置 Banner | `banners` 数组 | 统一输出按位置分组 |
| 首页资源 | `resources` | 首页正式资源总包 | `legacy_payload` | 前端可逐步从 `legacy_payload` 迁到 `resources` |
| 弹窗广告 | `popupAd` | 首页弹窗配置 | `popup_ad` | 两者并存，但正式字段是 `popupAd` |
| 热门商品 | `hot_products` | 首页推荐商品列表 | - | 使用统一商品摘要结构 |

## 3. 后台内容位

| 领域 | 正式字段 | 含义 | 兼容字段 | 说明 |
| --- | --- | --- | --- | --- |
| 首页内容位主键 | `id` | 内容位唯一标识 | `_id`, `_legacy_id` | DTO 统一输出 `id` |
| 内容位 key | `section_key` | 业务稳定 key | `board_key`, `key` | 页面优先读 `section_key` |
| 内容位名称 | `section_name` | 展示名称 | `board_name`, `name`, `title` | 页面优先读 `section_name` |
| 内容位类型 | `section_type` | hero/product_board 等 | `board_type` | 页面优先读 `section_type` |
| 显示状态 | `is_visible` | 1/0 | `status`, `enabled` | 后台内容位统一以 `is_visible` 为准 |
| 配置对象 | `config` | 内容位结构化配置 | - | 不再散落到顶层字段 |

## 4. Phase 3 规则

1. `config` 云函数必须输出 canonical config/content payload。
2. `admin-api` 的 `mini-program-config`、`popup-ad-config`、`home-sections` 必须输出 canonical DTO。
3. 小程序首页消费优先读：
   - `configs`
   - `banners.home/home_mid/home_bottom`
   - `popupAd`
4. 后台首页内容位优先读：
   - `section_key`
   - `section_name`
   - `section_type`
   - `is_visible`
   - `config`
