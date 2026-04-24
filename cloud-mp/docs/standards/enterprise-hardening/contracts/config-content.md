# 配置 / 内容契约

日期：2026-04-14

## 1. 范围

覆盖以下链路：

- 小程序配置
- 首页内容
- 弹窗广告
- 首页内容位
- 启动页 / splash
- 后台配置读写

当前代码真相主要来自：

- `cloudfunctions/config/config-contract.js`
- `cloudfunctions/admin-api/src/config-contract.js`
- `cloudfunctions/config/index.js`
- `docs/audit/2026-04-14-config-content-field-truth.md`
- `docs/audit/generated/CONFIG_CONTENT_CONTRACT_AUDIT.md`

## 2. 正式字段

### 2.1 miniProgramConfig

正式配置根对象：

- `brand_config`
- `feature_flags`
- `activity_page_config`
- `lottery_config`
- `membership_config`
- `logistics_config`
- `customer_service_channel`
- `withdrawal_config`
- `light_prompt_modals`
- `product_detail_pledges`
- `feature_toggles`

### 2.2 homeContent

正式返回对象至少包含：

- `configs`
- `banners`
- `hot_products`
- `popupAd`
- `layout`
- `resources`

其中 `resources` 下的稳定字段至少包含：

- `mini_program_config`
- `configs`
- `banners`
- `hot_products`
- `popup_ad`
- `layout`
- `latest_activity`
- `legacy_payload`

`configs` 中当前首页品牌专区的稳定字段至少包含：

- `brand_zone_enabled`
- `brand_zone_title`
- `brand_zone_cover`
- `brand_zone_cover_file_id`
- `brand_zone_welcome_title`
- `brand_zone_welcome_subtitle`
- `brand_story_title`
- `brand_story_body`
- `brand_endorsements`
- `brand_certifications`

其中：

- `brand_endorsements`
  作为首页底部品牌专区固定 3 个入口卡的数据源，item 结构为 `title/subtitle/image/file_id/link_type/link_value`
- `brand_certifications`
  作为品牌专区认证条目的数据源，item 结构为 `title/subtitle/image/file_id`

### 2.3 popupAd / homeSections

- `popupAd`
  统一由 canonical popup DTO 输出
- `homeSections`
  统一映射 `content_boards` 集合的 DTO

## 3. 只读兼容字段

以下字段允许兼容读取，但不能再成为主逻辑：

- `image_url`
- `url`
- `image`
- 顶层旧 homepage 配置键
- `legacy_payload`
  仅作为兼容资源包保留，不再作为首页主数据源

## 4. 写入规则

- 所有配置写入先经过 contract normalize
- 管理后台不直接拼装旧 payload 写回
- 新增配置字段必须先补 contract 默认值和 normalize 规则
- 常用物流公司配置统一进入 `miniProgramConfig.logistics_config.shipping_company_options`

## 5. 页面消费规则

- 小程序首页 loader 优先消费 canonical `resources`
- 后台首页内容位优先消费 canonical `homeSections` DTO
- 弹窗和启动页优先消费 canonical popup / splash DTO

## 6. 当前未清债务

- 局部页面仍兼容读取 `image_url`
- `legacy_payload` 仍保留用于平滑过渡
- 后台内容链仍缺少更严格的 schema 驱动校验

## 7. 验证

必须通过：

- `npm run audit:config-content-contract`
- `npm run audit:miniprogram-routes`
- 相关文件 `node --check`
- `cd admin-ui && npm run build`

涉及主链改动时，还应补充：

- 首页内容读取 smoke
- 弹窗配置 smoke
- 首页内容位读写 smoke
- 小程序配置读取 smoke
